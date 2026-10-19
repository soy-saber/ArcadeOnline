"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const output = path.join(__dirname, "../artifacts/native-tests/core.cjs");
require("esbuild").buildSync({ entryPoints: [path.join(__dirname, "../src/native/core.ts")], outfile: output, bundle: true, platform: "node", format: "cjs" });
const { createGame, step, cloneState, position, reconcile, validState, validInput, index, EMPTY_INPUT, FUSE_TICKS } = require(output);

function arena(seed = 123) {
  const state = createGame(seed);
  state.board = state.board.map((cell) => cell === 2 ? 0 : cell);
  return state;
}
function advance(state, count, a = EMPTY_INPUT, b = EMPTY_INPUT) {
  for (let i = 0; i < count; i++) step(state, [a, b]);
}

test("original movement cadence, impassable walls, and full input state release", () => {
  const state = arena();
  advance(state, 5, { seq: 1, dir: 2, bomb: 0 });
  assert.equal(state.players[0].x, 1);
  assert(position(state.players[0]).x > 1.8);
  advance(state, 1, { seq: 2, dir: -1, bomb: 0 });
  assert.equal(state.players[0].x, 2);
  advance(state, 6, { seq: 3, dir: 3, bomb: 0 });
  assert.equal(state.players[0].y, 1); // Wall at (2,2).
  advance(state, 20);
  assert.equal(state.players[0].x, 2);
});

test("one action counter places one bomb, owner can leave, fuse is 60 ticks", () => {
  const state = arena();
  advance(state, 1, { seq: 1, dir: 2, bomb: 1 });
  assert.equal(state.bombs.length, 1);
  assert.equal(state.bombs[0].explodeAt, 1 + FUSE_TICKS);
  advance(state, 11, { seq: 2, dir: 2, bomb: 1 });
  assert.equal(state.players[0].x, 3);
  assert.equal(state.bombs.length, 1);
  advance(state, 48, { seq: 3, dir: -1, bomb: 1 });
  assert.equal(state.bombs.length, 1);
  advance(state, 1, { seq: 4, dir: -1, bomb: 1 });
  assert.equal(state.bombs.length, 0);
  assert.equal(state.players[0].alive, true);
});

test("chain reactions stop at walls and destroy the first crate only", () => {
  const state = arena();
  state.board[index(5, 1)] = 2;
  state.board[index(6, 1)] = 2;
  state.bombs = [
    { id: 1, x: 2, y: 1, owner: 1, range: 3, explodeAt: 1 },
    { id: 2, x: 3, y: 1, owner: 2, range: 2, explodeAt: 100 }
  ];
  step(state, [EMPTY_INPUT, EMPTY_INPUT]);
  assert.equal(state.bombs.length, 0);
  assert.equal(state.board[index(5, 1)], 0);
  assert.equal(state.board[index(6, 1)], 2);
  assert.equal(state.flames[index(2, 2)], 0);
  assert(state.flames[index(4, 1)] > 0);
});

test("item collection changes capacity/range/speed and shield absorbs one hit", () => {
  const state = arena();
  for (const [cell, item] of [[2, "bomb"], [3, "range"], [4, "speed"], [5, "shield"]]) state.items[index(cell, 1)] = item;
  advance(state, 6, { seq: 1, dir: 2, bomb: 0 });
  assert.equal(state.players[0].capacity, 2);
  advance(state, 6, { seq: 2, dir: 2, bomb: 0 });
  assert.equal(state.players[0].range, 2);
  advance(state, 6, { seq: 3, dir: 2, bomb: 0 });
  assert.equal(state.players[0].speed, 5);
  advance(state, 5, { seq: 4, dir: 2, bomb: 0 });
  assert.equal(state.players[0].shield, true);
  state.flames[index(5, 1)] = state.tick + 2;
  step(state, [EMPTY_INPUT, EMPTY_INPUT]);
  assert.equal(state.players[0].shield, false);
  assert.equal(state.players[0].alive, true);
});

test("simultaneous deaths draw; one death awards the opponent", () => {
  const draw = arena();
  for (const player of draw.players) draw.flames[index(player.x, player.y)] = 10;
  step(draw, [EMPTY_INPUT, EMPTY_INPUT]);
  assert.equal(draw.phase, "finished"); assert.equal(draw.winner, 0);
  const win = arena();
  win.flames[index(1, 1)] = 10;
  step(win, [EMPTY_INPUT, EMPTY_INPUT]);
  assert.equal(win.winner, 2);
});

test("online rounds accept two to four humans with no CPU and ignore empty seats", () => {
  for (const seats of [[], [4]]) {
    const waiting = createGame(123, 1, false, { mode: "online", activeSeats: seats });
    assert(validState(waiting));
    assert.deepEqual(waiting.players.filter((player) => player.alive).map((player) => player.seat), seats);
  }
  for (const seats of [[1, 4], [1, 2, 4], [1, 2, 3, 4]]) {
    const state = createGame(123, 1, true, { mode: "online", bots: [3, 4], activeSeats: seats });
    assert.deepEqual(state.options.bots, []);
    assert.equal(state.players.length, 4);
    assert(validState(state));
    for (const player of state.players) assert.equal(player.alive, seats.includes(player.seat));
    step(state, [EMPTY_INPUT, EMPTY_INPUT, EMPTY_INPUT, { seq: 1, dir: -1, bomb: 1 }]);
    assert.equal(state.bombs.length, seats.includes(4) ? 1 : 0);
    const winner = seats.at(-1);
    for (const player of state.players) if (player.alive && player.seat !== winner) {
      player.alive = false; player.life = 0;
    }
    step(state, Array(4).fill(EMPTY_INPUT));
    assert.equal(state.winner, winner);
  }
});

test("seed, snapshots, RNG and action history replay identically", () => {
  const first = arena(49282), second = arena(49282);
  assert.deepEqual(createGame(99), createGame(99));
  const records = Array.from({ length: 80 }, (_, i) => [
    { seq: i + 1, dir: i < 12 ? 2 : i < 24 ? 3 : -1, bomb: i >= 26 ? 1 : 0 },
    { seq: i + 1, dir: i < 12 ? 0 : i < 24 ? 1 : -1, bomb: i >= 32 ? 1 : 0 }
  ]);
  for (const inputs of records.slice(0, 40)) { step(first, inputs); step(second, inputs); }
  const restored = cloneState(second);
  for (const inputs of records.slice(40)) { step(first, inputs); step(restored, inputs); }
  assert.deepEqual(first, restored);
  assert.equal(validState(restored), true);
});

test("reconciliation replays only unacknowledged input without duplicating bombs", () => {
  const authority = arena();
  const inputs = Array.from({ length: 10 }, (_, i) => ({ seq: i + 1, dir: 2, bomb: 1 }));
  for (const input of inputs.slice(0, 4)) step(authority, [input, EMPTY_INPUT]);
  const predicted = reconcile(authority, 1, inputs);
  const expected = cloneState(authority);
  for (const input of inputs.slice(4)) step(expected, [input, EMPTY_INPUT]);
  assert.deepEqual(predicted.state, expected);
  assert.equal(predicted.pending.length, 6);
  assert.equal(predicted.state.bombs.length, 1);
  assert.equal(authority.tick, 4);
});

test("network validation rejects malformed inputs and inconsistent snapshots", () => {
  assert.equal(validInput({ seq: 1, dir: 8, bomb: 0 }), false);
  assert.equal(validInput({ seq: Infinity, dir: 1, bomb: 0 }), false);
  assert.equal(validState({}), false);
  const state = arena(); state.players[0].progress = 100;
  assert.equal(validState(state), false);
});

function armed(kind) {
  const s = arena();
  Object.assign(s.players[0], { weapon: kind, ammo: kind === "ice" ? 1 : 2, dir: 2 });
  return s;
}
const fireSpecial = { ...EMPTY_INPUT, seq: 1, special: 1 };

test("mine ignores its owner, triggers on an opponent and can chain a bomb", () => {
  const s = armed("mine");
  step(s, [fireSpecial]); advance(s, 8, fireSpecial);
  assert.equal(s.specials.length, 1);
  assert.equal(s.players[0].alive, true);
  Object.assign(s.players[0], { x: 5, y: 1 });
  Object.assign(s.players[1], { x: 1, y: 1 });
  s.bombs.push({ id: 4, x: 1, y: 1, owner: 2, range: 1, explodeAt: 200 });
  step(s, [fireSpecial]);
  assert.equal(s.specials.length, 0);
  assert.equal(s.bombs.length, 0);
  assert.equal(s.winner, 1);
});

test("accelerating rocket breaks its first crate and respects solid walls", () => {
  const s = armed("rocket"); s.board[index(4, 1)] = 2; s.board[index(5, 1)] = 2;
  step(s, [fireSpecial]); advance(s, 20, fireSpecial);
  assert.equal(s.board[index(4, 1)], 0); assert.equal(s.board[index(5, 1)], 2);
  assert.equal(s.players[0].ammo, 1);
  const wall = armed("rocket"); wall.players[0].x = 2; wall.players[0].dir = 3;
  step(wall, [fireSpecial]); advance(wall, 10, fireSpecial);
  assert.equal(wall.specials.length, 0);
  assert.equal(wall.flames[index(2, 2)], 0);
});

test("grenade crosses an intermediate wall, invalid landing does not spend ammo", () => {
  const s = armed("grenade"); s.board[index(2, 1)] = 1; s.board[index(3, 1)] = 2;
  step(s, [fireSpecial]); advance(s, 18, fireSpecial);
  assert.equal(s.board[index(3, 1)], 0);
  assert(s.flames[index(4, 1)] > s.tick);
  assert.equal(s.flames[index(2, 1)], 0);
  const invalid = armed("grenade"); invalid.players[0].dir = 0;
  step(invalid, [fireSpecial]); assert.equal(invalid.players[0].ammo, 2);
});

test("gas slows movement for a bounded time; fire removes an unused trap", () => {
  const s = armed("gas"); step(s, [fireSpecial]);
  Object.assign(s.players[0], { x: 5 }); Object.assign(s.players[1], { x: 1, y: 1 });
  step(s, [EMPTY_INPUT, EMPTY_INPUT]);
  assert.equal(s.players[1].slow, 600); assert.equal(s.specials.length, 0);
  advance(s, 19, EMPTY_INPUT, { ...EMPTY_INPUT, dir: 2 }); assert.equal(s.players[1].x, 1);
  advance(s, 1); assert.equal(s.players[1].x, 2);
  advance(s, 580); assert.equal(s.players[1].slow, 0);
  const burned = armed("gas"); step(burned, [fireSpecial]);
  burned.flames[index(1, 1)] = 10; step(burned, [EMPTY_INPUT]);
  assert.equal(burned.specials.length, 0);
});

test("ice grows across three cells, freezes the victim and eventually releases them", () => {
  const s = armed("ice"); Object.assign(s.players[1], { x: 2, y: 1 });
  step(s, [fireSpecial]); advance(s, 4, fireSpecial);
  assert.equal(s.players[1].frozen, 300); assert(s.ice[index(2, 1)] > s.tick);
  advance(s, 40, fireSpecial, { ...EMPTY_INPUT, dir: 2 }); assert.equal(s.players[1].x, 2);
  advance(s, 305); assert.equal(s.players[1].frozen, 0);
  advance(s, 6, EMPTY_INPUT, { ...EMPTY_INPUT, dir: 2 }); assert.equal(s.players[1].x, 3);
  assert.equal(validState(s), true);
});

test("fire advances over time, passes crates but ends at an indestructible wall", () => {
  const s = armed("fire"); s.board[index(2, 1)] = 2; s.board[index(3, 1)] = 2; s.board[index(4, 1)] = 1;
  step(s, [fireSpecial]); advance(s, 3, fireSpecial); assert.equal(s.board[index(2, 1)], 2);
  advance(s, 1, fireSpecial); assert.equal(s.board[index(2, 1)], 0); assert.equal(s.board[index(3, 1)], 2);
  advance(s, 8, fireSpecial); assert.equal(s.board[index(3, 1)], 0); assert.equal(s.flames[index(4, 1)], 0);
  advance(s, 37); assert.equal(s.specials.length, 0); assert(s.flames[index(3, 1)] <= s.tick);
});

test("life and push pickups work; sliding bomb explodes on collision", () => {
  const s = arena(); s.items[index(2, 1)] = "life"; s.items[index(3, 1)] = "push";
  advance(s, 12, { ...EMPTY_INPUT, dir: 2 }); assert.equal(s.players[0].life, 2); assert.equal(s.players[0].push, true);
  s.bombs.push({ id: 4, x: 4, y: 1, owner: 2, range: 1, explodeAt: 600 }); s.board[index(6, 1)] = 1;
  step(s, [{ ...EMPTY_INPUT, dir: 2 }]); assert.equal(s.bombs[0].x, 5);
  advance(s, 2); assert.equal(s.bombs.length, 0); assert(s.flames[index(5, 1)] > s.tick);
  const life = arena(); life.players[0].life = 2; life.flames[index(1, 1)] = 8;
  step(life, [EMPTY_INPUT]); advance(life, 10);
  assert.equal(life.players[0].life, 1); assert.equal(life.players[0].alive, true);
});

test("special action survives delayed input and replays exactly once after reconciliation", () => {
  const s = armed("mine");
  const actions = Array.from({ length: 12 }, (_, i) => ({ seq: i + 1, dir: i < 6 ? 2 : -1, bomb: 0, special: i > 2 ? 1 : 0 }));
  for (const input of actions.slice(0, 4)) step(s, [input]);
  const result = reconcile(s, 1, actions);
  assert.equal(result.state.specials.length, 1); assert.equal(result.state.players[0].ammo, 1);
  const expected = cloneState(s); for (const input of actions.slice(4)) step(expected, [input]);
  assert.deepEqual(result.state, expected); assert.equal(validState(expected), true);
});

test("online attack spends special ammo before a normal bomb and buffers mid-move", () => {
  const online = createGame(42, 1, true, { mode: "online", activeSeats: [1, 2], loadout: "ice" });
  online.board = online.board.map((cell) => cell === 2 ? 0 : cell);
  step(online, [{ seq: 1, dir: 2, bomb: 1 }]);
  assert.equal(online.players[0].ammo, 0);
  assert.equal(online.specials.length, 1);
  assert.equal(online.bombs.length, 0);
  step(online, [{ seq: 2, dir: -1, bomb: 2 }]);
  assert.equal(online.bombs.length, 1);

  const buffered = createGame(43, 1, true, { mode: "online", activeSeats: [1, 2], loadout: "mine" });
  buffered.board = buffered.board.map((cell) => cell === 2 ? 0 : cell);
  step(buffered, [{ seq: 1, dir: 2, bomb: 0 }]);
  step(buffered, [{ seq: 2, dir: 2, bomb: 1 }]);
  assert.equal(buffered.players[0].ammo, 2);
  advance(buffered, 6, { seq: 3, dir: -1, bomb: 1 });
  assert.equal(buffered.players[0].ammo, 1);
  assert.equal(buffered.bombs.length, 0);

  const blocked = createGame(44, 1, true, { mode: "online", activeSeats: [1, 2], loadout: "grenade" });
  blocked.players[0].dir = 0;
  step(blocked, [{ seq: 1, dir: -1, bomb: 1 }]);
  assert.equal(blocked.players[0].ammo, 2);
  assert.equal(blocked.bombs.length, 0);
});

test("bots play deterministically on all layouts; restored four-player states stay valid", () => {
  for (const map of ["classic", "lanes", "open"]) {
    const a = createGame(42, 1, true, { mode: "coop", map, bots: [1, 2], loadout: "fire" });
    let b = cloneState(a), moved = false, bombed = false;
    for (let i = 0; i < 500; i++) {
      step(a, []); step(b, []);
      moved ||= a.players.some((p) => p.progress > 0); bombed ||= a.bombs.length > 0;
      if (i === 150) b = cloneState(b);
      assert.equal(validState(a), true, `${map} tick ${a.tick}`);
    }
    assert.deepEqual(a, b); assert(moved); assert(bombed);
  }
});

test("cooperative victory waits for a whole team; malformed new fields are rejected", () => {
  const s = createGame(42, 1, true, { mode: "coop" }); s.options.bots = [];
  s.players[2].alive = false; step(s, [EMPTY_INPUT]); assert.equal(s.phase, "playing");
  s.players[3].alive = false; step(s, [EMPTY_INPUT]); assert.equal(s.winner, 1);
  assert.equal(validInput({ ...EMPTY_INPUT, special: -1 }), false);
  for (const edit of [s => s.options.bots = [2, 2], s => s.players[0].slow = Infinity, s => s.specials = [{ kind: "constructor" }], s => s.items[0] = "__proto__", s => s.ice = []]) {
    const value = arena(); edit(value); assert.equal(validState(value), false);
  }
});
