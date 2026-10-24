"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const output = path.join(__dirname, "../artifacts/authority-tests/maps.cjs");
require("esbuild").buildSync({ entryPoints: [path.join(__dirname, "../src/authority/bomb-core.ts")], outfile: output, bundle: true, platform: "node", format: "cjs" });
const { createGame, validState, step, index, EMPTY_INPUT, WIDTH, HEIGHT, cloneState } = require(output);
const mapOutput = path.join(__dirname, "../artifacts/authority-tests/map-definitions.cjs");
require("esbuild").buildSync({ entryPoints: [path.join(__dirname, "../src/authority/maps.ts")], outfile: mapOutput, bundle: true, platform: "node", format: "cjs" });
const { ORIGINAL_MAPS, ORIGINAL_SPAWNS, BRICK_RASTER_ORIGIN } = require(mapOutput);
const assets = path.join(__dirname, "../public/authority/assets/maps");
const manifest = JSON.parse(fs.readFileSync(path.join(assets, "manifest.json")));
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

test("original SWF identity and all 70 authored palette frames remain intact", () => {
  assert.equal(manifest.sha256, "a2b4cc65115e4b6eb813962d80e91f1e65746a91f27e91d5e86fa1963ed5b54d");
  assert.equal(sha(fs.readFileSync(path.join(__dirname, "../games/3881/game.swf"))), manifest.sha256);
  assert.equal(manifest.files.length, 70);
  assert.equal(new Set(manifest.files.map((file) => file.name)).size, 70);
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(path.join(assets, file.name));
    assert.equal(sha(bytes), file.sha256, file.name);
    assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a", file.name);
    assert.equal(bytes.readUInt32BE(16), file.width);
    assert.equal(bytes.readUInt32BE(20), file.height);
  }
  assert.deepEqual(BRICK_RASTER_ORIGIN, manifest.brickRasterOrigin);
  assert.deepEqual(manifest.palettes.filter((p) => p.spriteId === 232).map((p) => [p.frame, p.label]),
    [[1, "森林系"], [4, "沙漠系"], [6, "城市系"], [8, "藏宝系"], [11, "糖果屋系"]]);
});

test("five original themes use the correct landmark, spawn crosses, and authored tile palettes", () => {
  assert.deepEqual(ORIGINAL_MAPS.map((map) => map.id), ["forest", "desert", "city", "treasure", "candy"]);
  for (const map of ORIGINAL_MAPS) for (let seed = 1; seed <= 80; seed++) {
    const state = createGame(seed, 1, true, { map: map.id, mode: "online", activeSeats: [1, 2, 3, 4] });
    assert(validState(state), `${map.id}/${seed}`);
    assert.deepEqual(state.players.map(({ x, y }) => [x, y]), ORIGINAL_SPAWNS);
    assert.deepEqual(state, createGame(seed, 1, true, state.options));
    const visual = state.mapVisual;
    assert(map.floorFrames.includes(visual.floor));
    assert(map.landmarkFrames.includes(visual.landmark));
    for (let y = 5; y <= 6; y++) for (let x = 6; x <= 7; x++) assert.equal(state.board[index(x, y)], 1);
    for (const [x, y] of ORIGINAL_SPAWNS) for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [1, 0], [0, 1]]) assert.equal(state.board[index(x + dx, y + dy)], 0);
    for (let cell = 0; cell < state.board.length; cell++) {
      if (state.board[cell] === 2) assert(map.crateFrames.includes(visual.tiles[cell]));
      if (state.board[cell] === 1 && visual.tiles[cell]) assert(map.wallFrames.includes(visual.tiles[cell]));
    }
    // The original topology checks preserve a route between every traversable
    // tile once crates are removed, including all four starting positions.
    const seen = new Set(), pending = [index(3, 3)];
    while (pending.length) {
      const cell = pending.pop();
      if (seen.has(cell)) continue;
      seen.add(cell);
      const x = cell % WIDTH, y = Math.floor(cell / WIDTH);
      for (const [dx, dy] of [[-1, 0], [0, -1], [1, 0], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < WIDTH && ny < HEIGHT && state.board[index(nx, ny)] !== 1 && !seen.has(index(nx, ny))) pending.push(index(nx, ny));
      }
    }
    assert.equal(seen.size, state.board.filter((tile) => tile !== 1).length, `${map.id}/${seed} topology connected`);
    assert(state.board.some((tile, cell) => (cell % WIDTH === 0 || cell % WIDTH === WIDTH - 1 || cell < WIDTH || cell >= WIDTH * (HEIGHT - 1)) && tile !== 1));
  }
});

test("original edge cells allow movement and blast while blocking travel outside the board", () => {
  const state = createGame(123);
  state.board.fill(0);
  Object.assign(state.players[0], { x: 1, y: 0 });
  const goLeft = { seq: 1, dir: 0, bomb: 0 };
  for (let i = 0; i < 6; i++) step(state, [goLeft, EMPTY_INPUT, EMPTY_INPUT, EMPTY_INPUT]);
  assert.equal(state.players[0].x, 0);
  for (let i = 0; i < 12; i++) step(state, [goLeft, EMPTY_INPUT, EMPTY_INPUT, EMPTY_INPUT]);
  assert.equal(state.players[0].x, 0);
  state.bombs.push({ id: 1, owner: 1, x: 1, y: 0, range: 2, explodeAt: state.tick + 1 });
  const visual = JSON.stringify(state.mapVisual);
  step(state, [EMPTY_INPUT, EMPTY_INPUT, EMPTY_INPUT, EMPTY_INPUT]);
  assert.equal(state.flames[index(0,0)],0); // The neighbouring arm arrives on the next original frame.
  step(state, [EMPTY_INPUT, EMPTY_INPUT, EMPTY_INPUT, EMPTY_INPUT]);
  assert(state.flames[index(0, 0)] > state.tick);
  assert.equal(JSON.stringify(state.mapVisual), visual);
});

test("snapshot validation rejects unknown themes and cross-theme visual data", () => {
  const state = createGame(123);
  const copy = cloneState(state); copy.options.map = "unknown"; assert.equal(validState(copy), false);
  const copy2 = cloneState(state); copy2.mapVisual.floor = 12; assert.equal(validState(copy2), false);
  const copy3 = cloneState(state); copy3.mapVisual.tiles.pop(); assert.equal(validState(copy3), false);
  const copy4 = cloneState(state); delete copy4.mapVisual; assert.equal(validState(copy4), false);
  for (const id of ["classic", "lanes", "open"]) assert(validState(createGame(123, 1, true, { map: id })));
});
