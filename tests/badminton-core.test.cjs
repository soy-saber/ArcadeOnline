"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const output = path.join(__dirname, "../artifacts/native-tests/badminton-core.cjs");
fs.mkdirSync(path.dirname(output), { recursive: true });
require("esbuild").buildSync({ entryPoints: [path.join(__dirname, "../src/badminton/core.ts")], outfile: output, bundle: true, platform: "node", format: "cjs" });
const { createGame, step, movePlayer, EMPTY_INPUT, validInput, validState, reconcile, GROUND, NET_X, TARGET } = require(output);
const input = (seq, fields = {}) => ({ ...EMPTY_INPUT, seq, ...fields });

test("serve starts the rally; a landing on the right awards P1 and the scorer serves next", () => {
  const state = createGame(1, true);
  step(state, [input(1, { hit: 1 }), EMPTY_INPUT]);
  assert.equal(state.rally, "serve"); // Original serve clip releases the shuttle on frame 4.
  step(state, [input(2, { hit: 1 }), EMPTY_INPUT]);
  step(state, [input(3, { hit: 1 }), EMPTY_INPUT]);
  step(state, [input(4, { hit: 1 }), EMPTY_INPUT]);
  assert.equal(state.rally, "flight");
  assert.equal(state.birdie.vx, 30);
  assert.equal(state.birdie.vy, -30);
  step(state, [input(5, { hit: 1 }), EMPTY_INPUT]);
  assert.equal(state.birdie.vx, 27.6);
  assert(Math.abs(state.birdie.vy + 26.825) < 1e-9);
  for (let tick = 0; tick < 80 && state.rally === "flight"; tick++) step(state, [input(tick + 4, { hit: 1 }), EMPTY_INPUT]);
  assert.equal(state.rally, "point");
  assert.deepEqual(state.score, [1, 0]);
  for (let tick = 0; tick < 55; tick++) step(state, [EMPTY_INPUT, EMPTY_INPUT]);
  assert.equal(state.rally, "serve");
  assert.equal(state.serve, 1);
  assert(validState(state));
});

test("movement stays on each side; legacy jump and hit counters do not repeat without held flags", () => {
  const state = createGame(2, true);
  for (let i = 1; i < 90; i++) step(state, [input(i, { right: true, jump: 1 }), input(i, { left: true })]);
  assert.equal(state.players[0].x, 150.55);
  assert(Math.abs(state.players[1].x - 334.25) < 1e-9);
  assert.equal(state.players[0].y, GROUND); // Serving player cannot jump.
  step(state, [input(90, { hit: 1 }), EMPTY_INPUT]);
  for (let i = 91; i < 100; i++) step(state, [input(i, { hit: 1 }), EMPTY_INPUT]);
  assert.equal(state.players[0].lastHit, 1);
});

test("original service area checks the scaled netLimit and keeps the server behind it", () => {
  const p1Serve = createGame(6, true);
  for (let tick = 0; tick < 40; tick++) {
    movePlayer(p1Serve, 1, 1);
    movePlayer(p1Serve, 2, -1);
  }
  assert.equal(p1Serve.players[0].x, 150.55);
  assert(Math.abs(p1Serve.players[1].x - 334.25) < 1e-9);
  p1Serve.serve = 0; // The serve clip clears this on frame 13.
  for (let tick = 0; tick < 20; tick++) movePlayer(p1Serve, 1, 1);
  assert(Math.abs(p1Serve.players[0].x - 215.45) < 1e-9);

  const p2Serve = createGame(7, true);
  p2Serve.serve = 2;
  for (let tick = 0; tick < 40; tick++) {
    movePlayer(p2Serve, 1, 1);
    movePlayer(p2Serve, 2, -1);
  }
  assert(Math.abs(p2Serve.players[0].x - 215.45) < 1e-9);
  assert(Math.abs(p2Serve.players[1].x - 399.15) < 1e-9);

  p1Serve.players[0].x = 210;
  p1Serve.rally = "point";
  p1Serve.lastPoint = 1;
  p1Serve.pointTicks = 1;p1Serve.resetAt=p1Serve.tick+1;
  step(p1Serve, [EMPTY_INPUT, EMPTY_INPUT]);
  assert(Math.abs(p1Serve.players[0].x - (5499 / 20 - 129.7 / 2 - 65)) < 1e-9);
  p2Serve.players[1].x = 340;
  p2Serve.rally = "point";
  p2Serve.pointTicks = 1;p2Serve.resetAt=p2Serve.tick+1;
  step(p2Serve, [EMPTY_INPUT, EMPTY_INPUT]);
  const nativeReset=Number(require('./fixtures/badminton-as2.json').movementProbes.find(row=>row[0]==='RESET_RIGHT')[1]);
  assert.equal(p2Serve.players[1].x,nativeReset);
});

test("the server cannot jump until serve clip frame 13, then regains jump and net reach", () => {
  const state = createGame(8, true);
  step(state, [input(1, { jump: 1, hit: 1 }), input(1, { jump: 1 })]);
  assert.equal(state.players[0].vy, 1);
  assert.equal(state.players[1].vy, -12);
  for (let tick = 2; tick <= 12; tick++) step(state, [input(tick, { jump: 1, hit: 1 }), EMPTY_INPUT]);
  assert.equal(state.serve, 1);
  assert.equal(state.rally, "flight");
  step(state, [input(13, { jump: 2, hit: 1 }), EMPTY_INPUT]);
  assert.equal(state.serve, 0);
  assert.equal(state.players[0].vy, -12);

  const other = createGame(9, true);
  other.serve = 2;
  step(other, [input(1, { jump: 1 }), input(1, { jump: 1, hit: 1 })]);
  assert.equal(other.players[0].vy, -12);
  assert.equal(other.players[1].vy, 1);
  for (let tick = 2; tick <= 12; tick++) step(other, [EMPTY_INPUT, input(tick, { jump: 1, hit: 1 })]);
  step(other, [EMPTY_INPUT, input(13, { jump: 2, hit: 1 })]);
  assert.equal(other.serve, 0);
  assert.equal(other.players[1].vy, -12);
});

test("timed racket contact sends the shuttle back; own side landing awards opponent", () => {
  const state = createGame(3, true);
  step(state, [input(1, { hit: 1 }), EMPTY_INPUT]);
  step(state, [input(2, { hit: 1 }), EMPTY_INPUT]);
  step(state, [input(3, { hit: 1 }), EMPTY_INPUT]);
  step(state, [input(4, { hit: 1 }), EMPTY_INPUT]);
  Object.assign(state.birdie,{ x: state.players[1].x + 61, y: GROUND - 102, vx: 3, vy: 1, lastHitter: 1 });
  step(state, [EMPTY_INPUT, input(1, { hit: 1 })]);
  assert.equal(state.birdie.lastHitter, 1); // bird callback precedes the new stroke
  Object.assign(state.birdie, { x: state.players[1].x + 22.45, y: GROUND - 97.7, vx: 0, vy: 0, lastHitter: 1 });
  step(state, [EMPTY_INPUT, input(2, { hit: 1 })]);
  assert.equal(state.birdie.lastHitter, 2);
  assert(state.birdie.vx < 0);
  Object.assign(state.players[0].racket,{frame:15,playing:false,ready:true,active:false});
  Object.assign(state.birdie,{ x: 170, y: GROUND - 4, vx: 0, vy: 4, lastHitter: 2 });
  step(state, [EMPTY_INPUT, EMPTY_INPUT]);
  assert.deepEqual(state.score, [0, 1]);
  assert.equal(state.serve, 1); // The original changes service when reset runs after 1.5 seconds.
  for (let tick = 0; tick < 45; tick++) step(state, [EMPTY_INPUT, EMPTY_INPUT]);
  assert.equal(state.serve, 2);
  assert.equal(state.rally, "serve");
});

test("original overhand hit window closes at frame nine; retained single-player underhand geometry hits its source rectangle", () => {
  const state = createGame(5, true);
  state.rally = "flight";state.serve=0;
  Object.assign(state.birdie,{ x: state.players[0].x + 54, y: GROUND - 49, vx: 0, vy: 0, lastHitter: 2 });
  Object.assign(state.players[0].racket,{frame:8,playing:true,ready:false,active:true}); // native frame nine closes contact
  step(state, [EMPTY_INPUT, EMPTY_INPUT]);
  assert.equal(state.birdie.lastHitter, 2);

  const player = state.players[0];
  player.y = GROUND - 80;
  player.vy = 0;
  Object.assign(player.racket,{frame:18,playing:true,ready:false,active:true});
  Object.assign(state.birdie,{ x: player.x - 25, y: player.y - 15, vx: 0, vy: 0, lastHitter: 2 });
  step(state, [EMPTY_INPUT, EMPTY_INPUT]);
  assert.equal(state.birdie.lastHitter, 1);
});

test("first to seven finishes the match and ignores further input", () => {
  const state = createGame(4, true);
  state.score[1] = TARGET - 1;
  state.rally = "flight";
  Object.assign(state.birdie,{ x: 150, y: GROUND - 4, vx: 0, vy: 5, lastHitter: 2 });
  step(state, [EMPTY_INPUT, EMPTY_INPUT]);
  assert.equal(state.winner, 2);
  assert.equal(state.phase, "finished");
  const after = JSON.stringify(state);
  step(state, [input(2, { hit: 2 }), EMPTY_INPUT]);
  assert.equal(JSON.stringify(state), after);
});

test("snapshot validation and local reconciliation reject stale movement", () => {
  const state = createGame(Date.now(), true);
  assert(validState(state));
  assert(!validInput({ seq: 1, left: "yes", right: false, jump: 0, hit: 0 }));
  assert(!validState({ ...state, score: [0, Number.NaN] }));
  state.ack[0] = 2;
  const result = reconcile(state, 1, [input(1, { right: true }), input(3, { right: true })]);
  assert.deepEqual(result.pending.map((item) => item.seq), [3]);
  assert.equal(result.state.players[0].x, 138.75);
  assert.equal(state.players[0].x, 132.85);
});
