"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), path = require("node:path"), Module = require("node:module");
function load(file) { const source = require("esbuild").buildSync({ entryPoints: [path.resolve(__dirname, file)], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text; const mod = new Module(file, module); mod.paths = module.paths; mod._compile(source, file); return mod.exports; }
const { ADAPTERS } = load("../src/expanded/registry.ts"), { AuthorityEngine } = load("../src/authority/engine.ts"), protocol = load("../src/authority/protocol.ts"), { Presentation } = load("../src/authority/presentation.ts");
const input = (seq = 0, patch = {}) => ({ seq, left: false, right: false, up: false, down: false, attack: 0, alt: 0, ...patch });
function setup(adapter) {
  const engine = new AuthorityEngine(() => {}), room = { gameId: adapter.id, seats: Object.fromEntries(Array.from({ length: adapter.seats }, (_, i) => [i + 1, null])), members: new Map() };
  for (const [id, seat] of [["a", 1], ["b", adapter.seats]]) { room.seats[seat] = id; room.members.set(id, { id, name: id, seat, ready: true, ws: null }); }
  engine.onRoom(room); return { engine, room };
}
for (const adapter of ADAPTERS) {
  test(`${adapter.id}: every selectable map validates and delta round-trips through active simulation`, () => {
    for (const map of adapter.maps || [{ id: undefined }]) {
      const state = adapter.create(1700000000000, true, [1, adapter.seats], 993, map.id), base = structuredClone(state);
      assert(adapter.valid(base), map.id);
      const controls = Array.from({ length: adapter.seats }, (_, i) => input(1, i === adapter.seats - 1 ? { right: true, attack: 1 } : {}));
      for (let tick = 0; tick < 10; tick++) adapter.step(state, controls);
      assert(adapter.valid(state), map.id);
      assert.deepEqual(protocol.applyUpdate(null, protocol.createUpdate(null, base, 1000)), base);
      const update = protocol.createUpdate(base, state, 1200);
      assert.equal(update.kind, "delta"); assert.deepEqual(protocol.applyUpdate(base, update), state, map.id);
      assert(!Object.hasOwn(update.patch, "mapVisual"));
    }
  });
  test(`${adapter.id}: sparse human seats, stale input, reconnect and bounded server stalls`, () => {
    const { engine, room } = setup(adapter), member = room.members.get("b"), state = room.auth.state, now = room.auth.clock;
    assert.equal(state.phase, "playing"); assert.deepEqual(state.players.map(p => p.seat), [1, adapter.seats]);
    engine.input(room, member, { round: state.round, serverTime: now - 1000, input: input(10, { attack: 9, alt: 7 }) }, now);
    engine.input(room, member, { round: state.round, serverTime: now + 10, input: input(11, { attack: 9, alt: 7 }) }, now + 10);
    engine.pump(room, now + 1000 / adapter.hz + 1);
    const player = state.players.find(p => p.seat === member.seat);
    assert.equal(player.lastAttack, 9); assert.equal(player.lastAlt, 7); assert.equal(state.ack[member.seat - 1], 11);
    assert.equal(state.players[0].lastAttack, 0);
    engine.reconnect(room, member); const before = state.tick;
    engine.pump(room, now + 10000); assert(state.tick - before <= 2); assert(adapter.valid(state));
    assert.equal(engine.options(room, member, { map: adapter.maps?.[0]?.id }), false);
    member.ready = false; engine.onRoom(room); assert.equal(state.phase, "playing");
  });
  test(`${adapter.id}: real rule settlement counts once and automatically starts the next ready round`, () => {
    const { engine, room } = setup(adapter), state = room.auth.state, round = state.round;
    if (adapter.id === "fbw_forest-server") {
      state.devices = []; state.liquids = [];
      for (const player of state.players) { const exit = state.exits.find(exit => exit.element === player.element); player.x = exit.x; player.y = exit.y; player.vx = player.vy = 0; }
    } else state.tick = adapter.hz * (adapter.id === "137953-server" ? 180 : adapter.id === "9109-server" ? 180 : adapter.id === "50737-server" ? 720 : adapter.id === "97734-server" ? 480 : 300) - 1;
    for (let i = 0; i < 5 && state.phase === "playing"; i++) engine.pump(room, room.auth.clock + 1000 / adapter.hz + 1);
    assert.equal(state.phase, "finished"); const settled = engine.info(room).records;
    if (settled) assert(settled.every(row => row.rounds === 1));
    engine.pump(room, room.auth.clock + 100); if (settled) assert.deepEqual(engine.info(room).records, settled);
    engine.pump(room, room.auth.nextRoundAt + 1); assert(room.auth.state.round > round); assert.equal(room.auth.state.phase, "playing"); assert(adapter.valid(room.auth.state));
  });
}
test("structured item collections change length without being treated as scalar grids", () => {
  const adapter = ADAPTERS.find(a => a.id === "6232-server"), base = adapter.create(1, true, [1, 4], 55), next = structuredClone(base);
  next.tick++; next.items.push({ id: 1, type: "mine", x: 100, y: 100, vx: 0, vy: 0, owner: 1, armed: false, timer: 20 });
  assert(adapter.valid(next)); const update = protocol.createUpdate(base, next, 1000);
  assert.deepEqual(update.patch.items, next.items); assert.deepEqual(protocol.applyUpdate(base, update), next);
});
test("remote adapter interpolation changes only pose, handles sparse seats and rejects teleport smoothing", () => {
  const adapter = ADAPTERS.find(a => a.id === "6232-server"), a = adapter.create(1, true, [1, 4], 55), b = structuredClone(a), p = new Presentation(() => {});
  b.tick = 3; b.players[1].x += 40;
  p.receive(a, 1000, 1000); p.receive(b, 1100, 1100);
  const shown = p.render(1120, 1140, 1, null, adapter.hz);
  assert.equal(shown.players[1].x, a.players[1].x + 20); assert.deepEqual(shown.players[0], b.players[0]);
  const pose = structuredClone(shown); pose.players[1].x = b.players[1].x; assert.deepEqual(pose, b);
  b.players[1].x += 300; p.receive(b, 1200, 1200); assert.equal(p.render(1210, 1250, 1, null, adapter.hz).players[1].x, b.players[1].x);
});
test("room records count each stock loss and enemy kill across respawns, rematches and seat changes", () => {
  const adapter = ADAPTERS.find(a => a.id === "6232-server"), { engine, room } = setup(adapter), state = room.auth.state, victim = state.players.find(p => p.seat === 4);
  victim.killedBy = 1; victim.x = 10000;
  engine.pump(room, room.auth.clock + 40);
  let rows = engine.info(room).records; assert.equal(rows.find(r => r.id === "a").kills, 1); assert.equal(rows.find(r => r.id === "b").deaths, 1);
  engine.pump(room, room.auth.clock + 40); assert.equal(engine.info(room).records.find(r => r.id === "b").deaths, 1);
  victim.respawn = 0; victim.stocks = 1; victim.x = 10000;
  engine.pump(room, room.auth.clock + 40); assert.equal(state.phase, "finished");
  rows = engine.info(room).records; assert.equal(rows.find(r => r.id === "a").kills, 2); assert.equal(rows.find(r => r.id === "a").wins, 1); assert.equal(rows.find(r => r.id === "b").rounds, 1);
  engine.pump(room, room.auth.nextRoundAt + 1); assert.equal(room.auth.state.phase, "playing"); assert.equal(engine.info(room).records.find(r => r.id === "a").kills, 2);
  room.seats[4] = null; room.members.get("b").seat = null; room.members.get("b").ready = false; engine.onRoom(room);
  assert.equal(engine.info(room).records.find(r => r.id === "b").deaths, 2);
});
test("cooperative Boxhead victory awards both participants and death is counted once", () => {
  const adapter = ADAPTERS.find(a => a.id === "50737-server"), { engine, room } = setup(adapter), state = room.auth.state;
  state.wave = 6; state.waveReady = 1; state.spawnLeft = 0; state.zombies = [];
  engine.pump(room, room.auth.clock + 41); assert.equal(state.phase, "finished");
  for (const row of engine.info(room).records) { assert.equal(row.wins, 1); assert.equal(row.rounds, 1); }
});
