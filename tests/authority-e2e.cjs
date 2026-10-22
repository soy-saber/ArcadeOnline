"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const puppeteer = require("puppeteer-core");

const repo = path.join(__dirname, ".."), output = path.join(repo, "artifacts/authority-e2e");
fs.mkdirSync(output, { recursive: true });
const port = 26000 + Math.floor(Math.random() * 1000);
const base = process.env.AUTHORITY_BASE ? new URL(process.env.AUTHORITY_BASE).origin : `http://127.0.0.1:${port}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [], results = [];
const server = process.env.AUTHORITY_BASE ? null : spawn(process.execPath, ["server.js"], {
  cwd: repo, env: { ...process.env, PORT: String(port), DISCONNECT_GRACE_MS: "4000" },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
});
server?.stderr.on("data", (data) => errors.push(data.toString()));
let browser;
const state = (page) => page.evaluate(() => {
  const test = window.__authorityTest;
  return { authority: test.authority, seat: test.seat, members: test.network.room.members, transport: test.transport };
});
const ready = (page, value) => page.evaluate((next) => window.__authorityTest.network.control({ t: "ready", ready: next }), value);

(async () => {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/healthz")).ok) break; } catch {} await wait(50); }
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true, args: ["--no-sandbox", "--window-size=1440,1100", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"]
  });
  const load = async (name, game, room) => {
    const context = await browser.createBrowserContext(), page = await context.newPage();
    await page.setViewport({ width: 1440, height: 1100 });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => { if (response.url().includes("/authority/assets/") && response.status() >= 400) errors.push(`Missing asset: ${response.url()}`); });
    await page.evaluateOnNewDocument((name) => localStorage.setItem("arcade_name", name), name);
    await page.goto(`${base}/authority-room.html?game=${game}&room=${room}&debug=1`);
    await page.waitForFunction(() => window.__authorityTest?.network.id && window.__authorityTest.state, { timeout: 15000 });
    return page;
  };
  const bombRoom = "auth-bomb-" + Date.now();
  const p1 = await load("P1", "3881-server", bombRoom), p2 = await load("P2", "3881-server", bombRoom);
  const p3 = await load("P3", "3881-server", bombRoom), p4 = await load("P4", "3881-server", bombRoom);
  const pages = [p1, p2, p3, p4];
  await p1.click("#fullscreen-stage");
  await p1.waitForFunction(() => document.fullscreenElement?.id === "fullscreen-room" || document.getElementById("fullscreen-room").classList.contains("fullscreen-fallback"));
  assert.equal(await p1.evaluate(() => {
    const stage = document.getElementById("fullscreen-room");
    return ["game-canvas", "start-game", "seat-1"].every((id) => stage.contains(document.getElementById(id))) && !!stage.querySelector(".touch-controls");
  }), true);
  await p1.click('[data-seat="1"]'); await p2.click('[data-seat="2"]'); await p3.click('[data-seat="3"]');
  await p1.waitForFunction(() => window.__authorityTest.network.room.members.filter((m) => m.seat).length === 3);
  await p1.click("#start-game");
  await p1.waitForFunction(() => window.__authorityTest.network.room.members.some((m) => m.seat === 1 && m.ready));
  await p3.click('[data-seat="3"]');
  await p1.waitForFunction(() => !window.__authorityTest.network.room.members.some((m) => m.seat === 3));
  assert.equal((await state(p1)).members.find((m) => m.seat === 1).ready, true);
  await p3.click('[data-seat="3"]');
  await p1.waitForFunction(() => window.__authorityTest.network.room.members.some((m) => m.seat === 3));
  assert.equal((await state(p1)).members.find((m) => m.seat === 1).ready, true);
  assert.equal((await state(p1)).members.find((m) => m.seat === 3).ready, false);
  await p4.click('[data-seat="4"]');
  await p1.waitForFunction(() => window.__authorityTest.network.room.members.filter((m) => m.seat).length === 4);
  await p1.click("#exit-fullscreen");
  await p1.waitForFunction(() => !document.fullscreenElement);
  assert.deepEqual(await p1.$$eval("#game-map option", (options) => options.map((option) => option.value)), ["forest", "desert", "city", "treasure", "candy"]);
  assert.equal(await p2.$eval("#game-map", (select) => select.disabled), true);
  for (const map of ["forest", "desert", "city", "treasure", "candy"]) {
    await p1.select("#game-map", map);
    await p2.waitForFunction((map) => window.__authorityTest.authority.options.map === map, { timeout: 5000 }, map);
    const snapshot = (await state(p2)).authority;
    assert(snapshot.board.length === 195 && snapshot.mapVisual, "Original map state and visuals arrive together");
  }
  await p1.select("#game-map", "forest");
  await p2.waitForFunction(() => window.__authorityTest.authority.options.map === "forest");
  await p2.click("#start-game"); await p3.click("#start-game");
  assert.equal((await state(p1)).authority.phase, "waiting");
  await p4.click("#start-game");
  await Promise.all(pages.map((page) => page.waitForFunction(() => window.__authorityTest.authority.phase === "playing")));
  await p1.click("#fullscreen-stage");
  await p1.waitForFunction(() => [...document.querySelectorAll('.player-nameplate')].filter(label => !label.hidden).length === 4);
  assert.deepEqual((await p1.$$eval('.player-nameplate', labels => labels.filter(label => !label.hidden).map(label => label.textContent))).sort(), ['P1','P2','P3','P4']);
  await p1.click("#exit-fullscreen");
  assert.deepEqual((await state(p1)).authority.options.activeSeats, [1, 2, 3, 4]);
  assert.deepEqual((await state(p1)).authority.options.bots, []);
  assert.equal((await state(p1)).transport, "server");
  assert.equal(await p1.evaluate(() => window.__authorityTest.network.room.hostId), null);
  await p1.waitForFunction(() => document.querySelectorAll("#records-body tr").length === 4);
  assert.equal(await p1.evaluate(() => document.getElementById("fullscreen-room").contains(document.getElementById("battle-records"))), true);
  results.push("Fullscreen seats/ready, retained readiness, original map options, four human seats");

  const cdp = await p1.createCDPSession(); await cdp.send("Debugger.enable");
  const beforeFreeze = (await state(p2)).authority.tick;
  await cdp.send("Debugger.pause"); await wait(1000);
  const duringFreeze = (await state(p2)).authority.tick;
  assert(duringFreeze >= beforeFreeze + 20, "Server advances while the creator page is frozen");
  await cdp.send("Debugger.resume"); await cdp.send("Debugger.disable");
  await p1.waitForFunction((tick) => window.__authorityTest.authority.tick >= tick, { timeout: 5000 }, duringFreeze);
  await p1.waitForFunction(() => window.__authorityTest.network.resyncs > 0 && window.__authorityTest.network.snapshotAge < 200);
  assert.equal(await p1.evaluate(() => window.__authorityTest.predictionMs <= 200 && window.__authorityTest.presentation.predictionSteps <= 7), true);
  results.push("Creator page freeze preserves server simulation and resumes from a fresh full state");

  await p3.keyboard.press("Space"); await p4.keyboard.press("Space");
  await p2.waitForFunction(() => window.__authorityTest.authority.bombs.some((b) => b.owner === 3) && window.__authorityTest.authority.bombs.some((b) => b.owner === 4));
  await p3.waitForFunction(() => {
    const test = window.__authorityTest;
    return test.state.tick === test.authority.tick && JSON.stringify(test.state.flames) === JSON.stringify(test.authority.flames) &&
      JSON.stringify(test.state.bombs) === JSON.stringify(test.authority.bombs);
  });
  await (await p2.$("#game-canvas")).screenshot({ path: path.join(output, "bomb-four-player.png") });
  const fullBefore = await p2.evaluate(() => window.__authorityTest.network.fullUpdates);
  await p2.evaluate(() => { window.__authorityTest.network.authority.board[0] = 99; });
  await p2.waitForFunction((count) => window.__authorityTest.network.fullUpdates > count && window.__authorityTest.authority.board[0] !== 99, { timeout: 5000 }, fullBefore);
  results.push("P3/P4 actions are authoritative; checksum mismatch requests a full baseline");
  await p2.waitForFunction(() => window.__authorityTest.network.room.auth.records.reduce((n, record) => n + record.deaths, 0) >= 2, { timeout: 10000 });
  assert.equal(await p2.evaluate(() => {
    const records = window.__authorityTest.network.room.auth.records;
    return records.length === 4 && records.reduce((n, record) => n + record.deaths, 0) >= 2 &&
      records.every((record) => Number.isInteger(record.kills) && record.kills >= 0);
  }), true);
  results.push("Room scoreboard shows server-confirmed deaths and stays inside fullscreen");

  await p4.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p4.evaluate(() => window.scrollTo(0, 0)); await wait(200);
  assert.equal(await p4.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await p4.screenshot({ path: path.join(output, "bomb-mobile.png"), fullPage: true });
  await p4.click("#fullscreen-stage");
  await p4.waitForFunction(() => document.fullscreenElement?.id === "fullscreen-room" || document.getElementById("fullscreen-room").classList.contains("fullscreen-fallback"));
  await p4.$eval("#start-game", (button) => button.scrollIntoView());
  assert.equal(await p4.$eval("#start-game", (button) => { const rect = button.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight && !button.disabled; }), true);
  await p4.screenshot({ path: path.join(output, "bomb-fullscreen-ready.png") });
  await p4.click("#exit-fullscreen");

  const badmintonRoom = "auth-badminton-" + Date.now();
  const b1 = await load("Left", "46923-server", badmintonRoom), b2 = await load("Right", "46923-server", badmintonRoom);
  const viewer = await load("Viewer", "46923-server", badmintonRoom);
  await b1.click('[data-seat="1"]'); await b2.click('[data-seat="2"]');
  await b1.click("#start-game"); await b2.click("#start-game");
  await b1.waitForFunction(() => window.__authorityTest.authority.phase === "playing");
  assert.equal((await state(viewer)).seat, null);
  const badmintonRound = (await state(b1)).authority.round;
  const leftStart = (await state(b1)).authority.players[0].x;
  await b1.keyboard.down("KeyA"); await wait(160); await b1.keyboard.up("KeyA");
  await viewer.waitForFunction((x) => window.__authorityTest.authority.players[0].x < x - 10, { timeout: 5000 }, leftStart);
  for (let point = 1; point <= 7; point++) {
    await b1.waitForFunction(() => window.__authorityTest.authority.rally === "serve", { timeout: 6000 });
    const serving = (await state(b1)).authority.serve;
    await (serving === 1 ? b1 : b2).keyboard.press("KeyS");
    await viewer.waitForFunction((point) => window.__authorityTest.authority.score.reduce((a, b) => a + b, 0) >= point, { timeout: 10000 }, point);
  }
  await b1.waitForFunction(() => window.__authorityTest.authority.phase === "finished", { timeout: 3000 });
  await (await viewer.$("#game-canvas")).screenshot({ path: path.join(output, "badminton-finish.png") });
  assert.equal(await b1.evaluate(() => window.__authorityTest.network.room.members.filter((m) => m.seat).every((m) => m.ready)), true);
  await Promise.all([b1, b2, viewer].map((page) => page.waitForFunction((round) =>
    window.__authorityTest.authority.round > round && window.__authorityTest.authority.phase === "playing" &&
    window.__authorityTest.authority.score.every((score) => score === 0), { timeout: 6000 }, badmintonRound)));
  assert.equal(await b2.$eval("#start-game", (button) => button.disabled), false);
  await b2.click("#start-game");
  await b1.waitForFunction(() => window.__authorityTest.network.room.members.some((m) => m.seat === 2 && !m.ready));
  assert.equal((await state(b1)).authority.phase, "playing", "Cancelling readiness opts out of the next round without interrupting play");
  results.push("Badminton movement, spectator scoring, natural finish, automatic rematch, opt out during play");
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ passed: true, results, errors }, null, 2));
  console.log("AUTHORITY E2E PASS", results);
})().catch((error) => { console.error(error, errors); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); server?.kill(); });
