"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const puppeteer = require("puppeteer-core");

const root = path.resolve(__dirname, "..");
const port = 34000 + Math.floor(Math.random() * 1000);
const base = process.env.AUTHORITY_BASE || `http://127.0.0.1:${port}`;
const output = path.join(root, "artifacts", process.env.AUTHORITY_BASE ? "fullscreen-public-e2e" : "fullscreen-e2e");
fs.mkdirSync(output, { recursive: true });
const server = process.env.AUTHORITY_BASE ? null : spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" }, windowsHide: true, stdio: "ignore"
});
let browser;
const errors = [], results = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const fullscreen = page => page.waitForFunction(() => document.fullscreenElement || document.querySelector(".fullscreen-fallback"));
async function assertLayout(page, touch) {
  await page.waitForFunction(() => {
    const c = document.getElementById("game-canvas"), r = c.getBoundingClientRect();
    const scale = Math.min(innerWidth / c.width, innerHeight / c.height);
    return Math.abs(r.width - c.width * scale) < 2 && Math.abs(r.height - c.height * scale) < 2;
  });
  const geometry = await page.evaluate(() => {
    const c = document.getElementById("game-canvas"), r = c.getBoundingClientRect();
    const room = document.getElementById("fullscreen-room");
    return { viewport: [innerWidth, innerHeight], canvas: [r.x, r.y, r.width, r.height],
      aspect: c.width / c.height, sidebar: getComputedStyle(document.querySelector(".room-controls")).display,
      caption: getComputedStyle(document.querySelector(".stage-caption")).display,
      touch: getComputedStyle(document.querySelector(".touch-controls")).display,
      buttons: [...room.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0).map(b => b.id || b.dataset.key),
      fits: room.scrollHeight <= room.clientHeight + 1 && room.scrollWidth <= room.clientWidth + 1 };
  });
  assert.equal(geometry.sidebar, "none");
  assert.equal(geometry.caption, "none");
  assert(geometry.fits, "Fullscreen must not scroll");
  assert(Math.abs(geometry.canvas[2] / geometry.canvas[3] - geometry.aspect) < .01, "Canvas must preserve its aspect ratio");
  assert(Math.abs(geometry.canvas[0] - (geometry.viewport[0] - geometry.canvas[2]) / 2) < 2, "Canvas must be horizontally centered");
  assert(Math.abs(geometry.canvas[1] - (geometry.viewport[1] - geometry.canvas[3]) / 2) < 2, "Canvas must be vertically centered");
  if (touch) assert.notEqual(geometry.touch, "none", "Touch controls must remain usable");
  else assert.deepEqual(geometry.buttons.sort(), ["exit-fullscreen", "fullscreen-ready"]);
  return geometry;
}
(async () => {
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(base + "/healthz")).ok) break; } catch {}
    await wait(50);
  }
  browser = await puppeteer.launch({ executablePath: process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true,
    args: ["--window-size=1600,1000", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
  const contexts = await Promise.all([browser.createBrowserContext(), browser.createBrowserContext()]);
  const [a, b] = await Promise.all(contexts.map(c => c.newPage()));
  for (const [i, page] of [a, b].entries()) {
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1600, height: 1000 });
    await page.evaluateOnNewDocument(name => localStorage.setItem("arcade_name", name), `全屏玩家${i + 1}`);
    page.on("pageerror", e => errors.push(e.message));
    page.on("response", r => { if (r.status() >= 400 && r.url().startsWith(base) && new URL(r.url()).pathname !== "/favicon.ico") errors.push(`${r.status()} ${r.url()}`); });
  }
  const load = async (game, room) => {
    await Promise.all([a, b].map(p => p.goto(`${base}/authority-room.html?game=${game}&room=${room}&debug=1`)));
    await Promise.all([a, b].map(p => p.waitForFunction(() => window.__authorityTest?.network.id && window.__authorityTest.authority)));
  };
  const catalog = await (await fetch(base + "/games.json")).json();
  for (const game of catalog) {
    await load(game.id, "full-" + Date.now().toString(36));
    await a.click("#fullscreen-stage");
    await fullscreen(a);
    const geometry = await assertLayout(a, false);
    await a.click("#fullscreen-ready");
    await a.waitForFunction(() => window.__authorityTest.seat === 1 && window.__authorityTest.network.room.members.find(m => m.seat === 1)?.ready);
    await a.waitForFunction(() => document.getElementById("fullscreen-ready").textContent === "取消准备");
    await b.click('[data-seat="2"]');
    await b.waitForFunction(() => window.__authorityTest.seat === 2);
    await b.click("#start-game");
    await a.bringToFront();
    await a.waitForFunction(() => window.__authorityTest.authority.phase === "playing");
    assert.equal(await a.evaluate(() => document.activeElement.id), "game-canvas", "Ready must return keyboard control to the game");
    if (game.id !== "46923-server") {
      await a.waitForFunction(() => [...document.querySelectorAll(".player-nameplate")].filter(l => !l.hidden).length === 2);
      assert(await a.evaluate(() => [...document.querySelectorAll(".player-nameplate")].filter(l => !l.hidden).every(label => {
        const r = label.getBoundingClientRect(), c = document.getElementById("game-canvas").getBoundingClientRect();
        return r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
      })), "Player names must track the enlarged canvas");
    }
    if (game.id === "3881-server" || game.id === "46923-server") await a.screenshot({ path: path.join(output, game.id + "-desktop.png") });
    await a.click("#fullscreen-ready");
    await a.waitForFunction(() => !window.__authorityTest.network.room.members.find(m => m.seat === 1).ready);
    assert.equal(await a.evaluate(() => window.__authorityTest.authority.phase), "playing", "Canceling readiness must preserve the current game");
    await a.click("#exit-fullscreen");
    await a.waitForFunction(() => !document.fullscreenElement && !document.body.classList.contains("game-fullscreen"));
    assert.notEqual(await a.$eval(".room-controls", e => getComputedStyle(e).display), "none");
    results.push({ game: game.id, nativeFullscreen: true, quickReady: true, ...geometry });
    console.log("Fullscreen verified: " + game.id);
  }
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await a.setViewport({ width, height, isMobile: true, hasTouch: true });
    await load("3881-server", "touch-" + Date.now().toString(36));
    await a.evaluate(() => { document.getElementById("fullscreen-room").requestFullscreen = () => Promise.reject(new Error("Fullscreen unavailable")); });
    await a.click("#fullscreen-stage");
    await a.waitForSelector(".fullscreen-fallback");
    const geometry = await assertLayout(a, true);
    await a.click("#fullscreen-ready");
    await a.waitForFunction(() => window.__authorityTest.network.room.members.find(m => m.seat === 1)?.ready);
    await b.click('[data-seat="2"]');
    await b.waitForFunction(() => window.__authorityTest.seat === 2);
    await b.click("#start-game");
    await a.bringToFront();
    await a.waitForFunction(() => window.__authorityTest.authority.phase === "playing");
    const attack = await a.$("#attack-button"), box = await attack.boundingBox();
    await a.touchscreen.touchStart(box.x + box.width / 2, box.y + box.height / 2);
    await a.touchscreen.touchEnd();
    await a.waitForFunction(() => window.__authorityTest.authority.players[0].lastBomb > 0);
    await a.screenshot({ path: path.join(output, `touch-${width}.png`) });
    await a.keyboard.press("Escape");
    await a.waitForFunction(() => !document.querySelector(".fullscreen-fallback") && !document.body.classList.contains("game-fullscreen"));
    results.push({ fallback: true, touchAttack: true, ...geometry });
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ base, results, errors }, null, 2));
  console.log("FULLSCREEN E2E PASS: eight games maximize the canvas, quick sit/ready, live cancellation, nameplates, normal layout restoration, touch input and fallback in both orientations");
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server?.exitCode == null) server?.kill();
});
