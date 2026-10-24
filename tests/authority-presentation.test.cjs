"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const output = path.join(__dirname, "../artifacts/authority-tests");
for (const [name, source] of [["presentation", "authority/presentation"], ["bomb", "authority/bomb-core"], ["badminton", "badminton/core"], ["bomb2", "expanded/bomb2"]]) {
  require("esbuild").buildSync({ entryPoints: [path.join(__dirname, `../src/${source}.ts`)], outfile: path.join(output, `${name}.cjs`), bundle: true, platform: "node", format: "cjs" });
}
const { Presentation } = require(path.join(output, "presentation.cjs"));
const bomb = require(path.join(output, "bomb.cjs"));
const badminton = require(path.join(output, "badminton.cjs"));
const copy = (state) => JSON.parse(JSON.stringify(state));
const arena = () => { const state = bomb.createGame(123, 1, true, { mode: "online", activeSeats: [1, 2] }); state.board.fill(0); return state; };
const move = (seq, dir = 2) => ({ seq, dir, bomb: 99, special: 99 });

test("many received snapshots reconcile once per render and use the newest authoritative world", () => {
  const presentation = new Presentation(() => assert.fail("No gap"));
  const state = arena();
  for (let tick = 1; tick <= 8; tick++) { state.tick = tick; presentation.receive(copy(state), 1000 + tick * 5, tick * 5); }
  assert.equal(presentation.reconciliations, 0);
  const frame = presentation.render(41, 1041, null, null, 35);
  assert.equal(presentation.reconciliations, 1); assert.equal(frame.tick, 8);
  presentation.render(42, 1042, null, null, 35);
  assert.equal(presentation.reconciliations, 1);
});

test("local bomb movement never predicts bomb actions, damage, item collection, world ticks or another player", () => {
  const state = arena(), presentation = new Presentation(() => {});
  state.items[bomb.index(state.players[0].x + 1, state.players[0].y)] = "speed";
  state.flames[bomb.index(state.players[0].x + 1, state.players[0].y)] = 100;
  presentation.receive(state, 1000, 1);
  for (let seq = 1; seq <= 7; seq++) presentation.input(move(seq), seq * 25);
  const frame = presentation.render(180, 1180, 1, move(7), 35);
  assert(frame.players[0].x > state.players[0].x || frame.players[0].progress > 0);
  for (const field of ["tick", "board", "flames", "items", "ice", "bombs", "specials", "ack", "inputs", "phase", "winner"]) assert.deepEqual(frame[field], state[field], field);
  assert.deepEqual(frame.players[1], state.players[1]);
  for (const field of ["life", "alive", "lastBomb", "lastSpecial", "weapon", "ammo", "speed", "shield"]) assert.equal(frame.players[0][field], state.players[0][field], field);
  assert(presentation.predictionSteps <= 7);
});

test("stalls discard input backlog, request one fresh baseline, and preserve gameplay action counters", () => {
  const state = arena(); state.players[0].lastBomb = 12;
  let requests = 0; const presentation = new Presentation(() => requests++);
  presentation.receive(state, 1000, 1);
  for (let seq = 1; seq <= 80; seq++) presentation.input(move(seq), seq);
  let frame = presentation.render(450, 1450, 1, move(80), 35);
  assert.equal(requests, 1); assert.equal(presentation.predictionSteps, 0);
  assert.deepEqual(frame, state);
  presentation.render(500, 1500, 1, move(80), 35); assert.equal(requests, 1);
  const fresh = copy(state); fresh.tick = 18; fresh.ack[0] = 80; fresh.players[0].lastBomb = 15;
  presentation.receive(fresh, 1520, 520);
  frame = presentation.render(521, 1521, 1, move(80), 35);
  assert.equal(frame.tick, 18); assert.equal(frame.players[0].lastBomb, 15);
  assert.equal(frame.players[0].x, fresh.players[0].x); assert.equal(presentation.predictionSteps, 0);
});

test("local badminton pose prediction leaves scoring, shuttle and remote player authoritative", () => {
  const state = badminton.createGame(2, true), presentation = new Presentation(() => {});
  presentation.receive(state, 1000, 1);
  const input = { seq: 1, left: true, right: false, jump: 99, hit: 99 };
  presentation.input(input, 20);
  const frame = presentation.render(30, 1030, 1, input, 30);
  assert(frame.players[0].x < state.players[0].x);
  assert.deepEqual(frame.birdie, state.birdie); assert.deepEqual(frame.score, state.score);
  assert.deepEqual(frame.players[1], state.players[1]); assert.equal(frame.rally, state.rally);
  assert.equal(frame.players[0].lastHit, state.players[0].lastHit); assert.equal(frame.tick, state.tick);
});

test("remote movement and shuttle interpolate within a short buffer without extrapolating world physics", () => {
  const state = badminton.createGame(3, true), presentation = new Presentation(() => {});
  state.rally = "flight"; state.birdie.x = 200;
  presentation.receive(copy(state), 1000, 1);
  state.tick = 3; state.players[1].x += 30; state.birdie.x = 250;
  presentation.receive(copy(state), 1100, 100);
  const frame = presentation.render(140, 1140, 1, null, 30);
  assert.equal(frame.birdie.x, 225); assert.equal(frame.players[1].x, state.players[1].x - 15);
  const after = presentation.render(200, 1200, 1, null, 30);
  assert.equal(after.birdie.x, 250); assert.equal(after.birdie.vx, state.birdie.vx);
});
test("unchanged waiting rooms do not repeatedly request expensive full snapshots", () => {
  let requests=0;const presentation=new Presentation(()=>requests++),state=arena();state.phase="waiting";
  presentation.receive(state,1000,1);
  for(let now=100;now<5000;now+=100)presentation.render(now,1000+now,null,null,35);
  assert.equal(requests,0);
});

test("Bomb It 2 remote interpolation keeps pixel poses and walking animation together", () => {
  const core=require(path.join(output,"bomb2.cjs")),state=core.create(1,true,[1,2],123,"beach-one"),presentation=new Presentation(()=>{});
  const p=state.players[1];p.walking.x=90;p.walking.gridX=p.x=3;p.moveDir=2;p.dir=2;
  presentation.receive(copy(state),1000,1);
  state.tick=4;p.walking.x=105;p.walking.gridX=p.x=4;
  presentation.receive(copy(state),1100,100);
  const frame=presentation.render(140,1140,1,null,40),remote=frame.players[1];
  assert.equal(remote.walking.x,97.5);assert.equal(remote.x,3.25);assert.equal(remote.moveDir,2);
  assert.equal(frame.tick,4);assert.deepEqual(frame.board,state.board);assert.equal(state.players[1].walking.x,105);
});

test("Bomb It 2 moving bombs interpolate pixels without changing grid occupancy, fuse or authority",()=>{
  const core=require(path.join(output,"bomb2.cjs")),state=core.create(1,true,[1,2],123,"factory-one"),presentation=new Presentation(()=>{});
  state.board.fill(0);const input={seq:1,left:false,right:false,up:false,down:false,attack:1,alt:0};core.step(state,[input]);
  const b=state.bombs[0];b.walking.x=90;b.walking.y=120;b.walking.gridX=b.x=3;b.walking.gridY=b.y=4;
  presentation.receive(copy(state),1000,1);state.tick=4;b.walking.x=111;b.walking.gridX=b.x=4;
  presentation.receive(copy(state),1100,100);const frame=presentation.render(140,1140,null,null,40),rendered=frame.bombs[0];
  assert.equal(rendered.walking.x,100.5);assert.equal(rendered.x,4);assert.equal(rendered.explodeAt,b.explodeAt);assert.equal(b.walking.x,111);
});
