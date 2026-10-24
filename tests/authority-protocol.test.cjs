"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const output = path.join(__dirname, "../artifacts/authority-tests/protocol.cjs");
require("esbuild").buildSync({ entryPoints: [path.join(__dirname, "../src/authority/protocol.ts")], outfile: output, bundle: true, platform: "node", format: "cjs" });
const { createUpdate, applyUpdate, hashState } = require(output);
const bundle = (name) => {
  const out = path.join(__dirname, `../artifacts/authority-protocol-tests/${name}.cjs`);
  require("esbuild").buildSync({entryPoints:[path.join(__dirname, name === "bomb" ? "../src/authority/bomb-core.ts" : "../src/badminton/core.ts")],outfile:out,bundle:true,platform:"node",format:"cjs"});
  return require(out);
};
const bomb = bundle("bomb"), badminton = bundle("badminton");
test("grid deltas rebuild exact authority and reduce ordinary movement traffic", () => {
  const before = bomb.createGame(123, 100, true, {mode:"online", activeSeats:[1,2,3,4]});
  const full = createUpdate(null,before,1000);
  const client = applyUpdate(null,full); assert.deepEqual(client,before);
  const next = JSON.parse(JSON.stringify(before));
  for(let i=1;i<=4;i++) bomb.step(next,[{seq:i,dir:2,bomb:0},bomb.EMPTY_INPUT,bomb.EMPTY_INPUT,bomb.EMPTY_INPUT]);
  next.board[0] = next.board[0] === 0 ? 2 : 0; next.items[1] = "speed"; next.flames[2] = next.tick+10; next.ice[3] = next.tick+5;
  const delta = createUpdate(before,next,1100);
  assert.equal(delta.kind,"delta");
  for(const field of ["board","items","flames","ice"]) assert(!Object.hasOwn(delta.patch,field));
  assert.deepEqual(applyUpdate(client,delta),next);
  assert(JSON.stringify(delta).length < JSON.stringify(createUpdate(null,next,1100)).length*.65);
});
test("missing baseline, dropped delta and state corruption require full recovery", () => {
  const a = badminton.createGame(101,true), b = JSON.parse(JSON.stringify(a));
  badminton.step(b,[{...badminton.EMPTY_INPUT,seq:1,right:true},badminton.EMPTY_INPUT]);
  const c=JSON.parse(JSON.stringify(b)); badminton.step(c,[{...badminton.EMPTY_INPUT,seq:2,right:true},badminton.EMPTY_INPUT]);
  assert.equal(applyUpdate(a,createUpdate(b,c,1200)),null);
  const corrupt=createUpdate(a,b,1100); corrupt.patch.score=[3,3];
  assert.equal(applyUpdate(a,corrupt),null);
  assert.deepEqual(applyUpdate(a,createUpdate(null,c,1200,true)),c);
  assert.equal(applyUpdate(c,createUpdate(null,a,1000,true)),null);
  const newer=badminton.createGame(102,false);
  assert.deepEqual(applyUpdate(c,createUpdate(null,newer,1300)),newer);
});
test("checksums survive object property order but reject malformed grid edits", () => {
  const a=bomb.createGame(124,110,true,{mode:"online",activeSeats:[1,2]});
  assert.equal(hashState(a),hashState(Object.fromEntries(Object.entries(a).reverse())));
  const b=JSON.parse(JSON.stringify(a)); bomb.step(b,[bomb.EMPTY_INPUT,bomb.EMPTY_INPUT]);
  const delta=createUpdate(a,b,1200); delta.cells={board:[[999,1]]};
  assert.equal(applyUpdate(a,delta),null);
});
