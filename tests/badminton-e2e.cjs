"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const repo = path.join(__dirname, "..");
const port = 25000 + Math.floor(Math.random() * 1000);
const base = process.env.BADMINTON_BASE ? new URL(process.env.BADMINTON_BASE).origin : `http://127.0.0.1:${port}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];
const server = process.env.BADMINTON_BASE ? null : spawn(process.execPath, ["server.js"], { cwd: repo, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
server?.stderr.on("data", (chunk) => errors.push(chunk.toString()));
let browser;

(async () => {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/healthz")).ok) break; } catch {}
    await wait(50);
  }
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true, args: ["--no-sandbox", "--window-size=1280,900"]
  });
  const room = "badminton-" + Date.now();
  const load = async (name) => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.evaluateOnNewDocument((value) => localStorage.setItem("arcade_name", value), name);
    await page.goto(`${base}/badminton-room.html?game=46923-native&room=${room}&debug=1`);
    try { await page.waitForFunction(() => window.__badmintonTest?.network.id && window.__badmintonTest.state, { timeout: 8000 }); }
    catch (error) {
      console.error("Load diagnostic", name, page.url(), await page.evaluate(() => ({ title: document.title, body: document.body.innerText.slice(0, 350), test: !!window.__badmintonTest, id: window.__badmintonTest?.network.id, state: window.__badmintonTest?.state, room: window.__badmintonTest?.network.room })));
      throw error;
    }
    return page;
  };
  const p1 = await load("P1"), p2 = await load("P2"), spectator = await load("Viewer");
  await p1.click('[data-seat="1"]');
  await p2.click('[data-seat="2"]');
  await p1.waitForFunction(() => window.__badmintonTest.network.room.members.filter((m) => m.seat).length === 2);
  await p1.click("#start-game");
  await p1.waitForFunction(() => window.__badmintonTest.network.room.members.some((m) => m.seat === 1 && m.ready));
  assert.equal(await p1.evaluate(() => window.__badmintonTest.state.phase), "waiting");
  await p2.click("#start-game");
  await Promise.all([p1, p2, spectator].map((page) => page.waitForFunction(() => window.__badmintonTest.state.phase === "playing", { timeout: 20000 })));
  assert.equal(await spectator.evaluate(() => window.__badmintonTest.seat), null);
  const before = await p1.evaluate(() => window.__badmintonTest.state.players[0].x);
  await p1.keyboard.down("d"); await wait(200); await p1.keyboard.up("d");
  await p2.waitForFunction((x) => window.__badmintonTest.state.players[0].x > x + 15, { timeout: 5000 }, before);
  await p1.keyboard.press("s");
  await p2.waitForFunction(() => window.__badmintonTest.state.rally === "flight" || window.__badmintonTest.state.score[0] > 0, { timeout: 5000 });
  await p1.waitForFunction(() => window.__badmintonTest.state.score[0] > 0, { timeout: 10000 });
  await p2.waitForFunction(() => window.__badmintonTest.state.score[0] > 0, { timeout: 5000 });
  assert.equal(await p1.evaluate(() => window.__badmintonTest.state.score[0]), 1);
  assert.equal(await p2.evaluate(() => window.__badmintonTest.state.score[0]), 1);
  assert.equal(await p1.evaluate(() => window.__badmintonTest.network.room.seats[3]), undefined);
  console.log("Transport before relay test:", await p1.evaluate(() => { const net = window.__badmintonTest.network; const peer = net.room.members.find((m) => m.seat === 2); return peer ? net.transport(peer.id) : "waiting"; }));
  await p1.evaluate(() => { window.__badmintonTest.network.forceRelay = true; });
  await p2.evaluate(() => { window.__badmintonTest.network.forceRelay = true; });
  await p1.waitForFunction(() => window.__badmintonTest.state.rally === "serve", { timeout: 5000 });
  await p1.keyboard.press("s");
  await p1.waitForFunction(() => window.__badmintonTest.state.score[0] === 2, { timeout: 10000 });
  await spectator.waitForFunction(() => window.__badmintonTest.state.score[0] === 2, { timeout: 5000 });
  for (let point = 3; point <= 7; point++) {
    await p1.waitForFunction(() => window.__badmintonTest.state.rally === "serve", { timeout: 5000 });
    await p1.keyboard.press("s");
    await p1.waitForFunction((target) => window.__badmintonTest.state.score[0] === target, { timeout: 10000 }, point);
  }
  assert.equal(await p1.evaluate(() => window.__badmintonTest.state.winner), 1);
  await p2.waitForFunction(() => window.__badmintonTest.state.phase === "finished", { timeout: 5000 });
  await Promise.all([p1, p2].map((page) => page.waitForFunction(() => !document.getElementById("start-game").disabled, { timeout: 5000 })));
  await p1.click("#start-game");
  await p1.waitForFunction(() => window.__badmintonTest.network.room.members.some((m) => m.seat === 1 && m.ready), { timeout: 5000 });
  await p2.click("#start-game");
  try { await p1.waitForFunction(() => window.__badmintonTest.state.phase === "playing" && window.__badmintonTest.state.score[0] === 0, { timeout: 10000 }); }
  catch (error) {
    console.error("Rematch diagnostic", await Promise.all([p1, p2].map((page) => page.evaluate(() => ({ phase: window.__badmintonTest.state?.phase, score: window.__badmintonTest.state?.score, members: window.__badmintonTest.network.room.members.map((m) => ({ seat: m.seat, ready: m.ready })), button: document.getElementById("start-game").textContent, status: document.getElementById("connection-note").textContent })))));
    throw error;
  }
  await p2.evaluate(() => window.scrollTo(0, 0));
  const soundBefore = await p2.$eval("#sound-toggle", (button) => button.getAttribute("aria-pressed"));
  await p2.click("#sound-toggle");
  assert.notEqual(await p2.$eval("#sound-toggle", (button) => button.getAttribute("aria-pressed")), soundBefore);
  assert.equal(await (await fetch(base + "/native/assets/badminton-hit.mp3")).status, 200);
  const output = path.join(repo, "artifacts/native-e2e");
  fs.mkdirSync(output, { recursive: true });
  await p1.evaluate(() => window.scrollTo(0, 0));
  await (await p1.$("#game-canvas")).screenshot({ path: path.join(output, "badminton-court.png") });
  assert.deepEqual(errors, []);
  console.log("Badminton two-player ready, input, rally, score, and spectator synchronization passed.");
})().catch((error) => { console.error(error, errors); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server?.kill();
});
