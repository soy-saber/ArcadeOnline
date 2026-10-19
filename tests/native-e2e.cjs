"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const puppeteer = require("puppeteer-core");

const repo = path.join(__dirname, "..");
const output = path.join(repo, "artifacts/native-e2e");
fs.mkdirSync(output, { recursive: true });
const port = 24000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];
const server = spawn(process.execPath, ["server.js"], {
  cwd: repo, env: { ...process.env, PORT: String(port), DISCONNECT_GRACE_MS: "4000" },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
});
server.stderr.on("data", (data) => errors.push(data.toString()));
let browser;

(async () => {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/healthz")).ok) break; } catch {}
    await wait(50);
  }
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true, args: ["--no-sandbox", "--window-size=1440,1100"]
  });
  const room = "native-" + Date.now();
  const load = async (name) => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 1100 });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("/native/assets/") && response.status() >= 400) errors.push(`Missing asset: ${response.url()}`);
    });
    await page.evaluateOnNewDocument((value) => localStorage.setItem("arcade_name", value), name);
    await page.goto(`${base}/native-room.html?game=3881-native&room=${room}&debug=1`);
    await page.waitForFunction(() => window.__nativeTest?.network.id && window.__nativeTest.state, { timeout: 20000 });
    return page;
  };
  const p1 = await load("P1"), p2 = await load("P2"), p3 = await load("P3"), p4 = await load("P4");
  const pages = [p1, p2, p3, p4];
  await p4.click("#sound-toggle");
  await p4.$eval("#sound-volume", (slider) => { slider.value = "57"; slider.dispatchEvent(new Event("input", { bubbles: true })); });
  await p4.reload();
  await p4.waitForFunction(() => window.__nativeTest?.state);
  assert.equal(await p4.$eval("#sound-toggle", (button) => button.textContent), "音效：关");
  assert.equal(await p4.$eval("#sound-volume", (slider) => slider.value), "57");
  for (let i = 0; i < pages.length; i++) await pages[i].click(`[data-seat="${i + 1}"]`);
  await p1.waitForFunction(() => window.__nativeTest.network.room.members.filter((m) => m.seat).length === 4);
  await wait(250);
  await p1.click("#start-game");
  await p2.click("#start-game");
  await p3.click("#start-game");
  await p1.waitForFunction(() => window.__nativeTest.network.room.members.filter((m) => m.ready).length === 3);
  assert.equal(await p1.evaluate(() => window.__nativeTest.state.phase), "waiting");
  await p4.click("#start-game");
  await Promise.all(pages.map((page) => page.waitForFunction(() =>
    window.__nativeTest.state.phase === "playing" && window.__nativeTest.state.players.length === 4)));
  assert.deepEqual(await p1.evaluate(() => window.__nativeTest.authority.options.activeSeats), [1, 2, 3, 4]);
  assert.deepEqual(await p1.evaluate(() => window.__nativeTest.authority.options.bots), []);
  await p3.keyboard.press("Space");
  await p4.keyboard.press("Space");
  await p1.waitForFunction(() => window.__nativeTest.authority.bombs.some((b) => b.owner === 3) &&
    window.__nativeTest.authority.bombs.some((b) => b.owner === 4));
  await (await p3.$("#game-canvas")).screenshot({ path: path.join(output, "native-idle.png") });
  await p3.keyboard.down("KeyA");
  await p3.waitForFunction(() => window.__nativeTest.state.players[2].moveDir === 0 || window.__nativeTest.state.players[2].x < 13);
  await (await p3.$("#game-canvas")).screenshot({ path: path.join(output, "native-walking.png") });
  await p3.keyboard.up("KeyA");
  console.log("PASS: four human seats, unanimous ready and independent P3/P4 input");

  await p4.click('[data-seat="4"]');
  await p1.waitForFunction(() => window.__nativeTest.authority.phase === "waiting");
  await p1.waitForFunction(() => window.__nativeTest.network.room.members.every((m) => !m.ready));
  await p1.select("#game-loadout", "mine");
  await p1.click("#start-game");
  await p2.click("#start-game");
  await p3.click("#start-game");
  await Promise.all([p1, p2, p3].map((page) => page.waitForFunction(() =>
    window.__nativeTest.state.phase === "playing" &&
    JSON.stringify(window.__nativeTest.state.options.activeSeats) === "[1,2,3]")));
  assert.equal(await p1.evaluate(() => window.__nativeTest.authority.players[3].alive), false);
  await p3.keyboard.press("Space");
  await p1.waitForFunction(() => window.__nativeTest.authority.players[2].ammo === 1);
  assert.equal(await p1.evaluate(() => window.__nativeTest.authority.bombs.filter((b) => b.owner === 3).length), 0);
  await p3.keyboard.down("KeyA"); await wait(260); await p3.keyboard.up("KeyA");
  await p1.waitForFunction(() => window.__nativeTest.authority.players[2].x === 12);
  await p3.keyboard.press("Space");
  await p1.waitForFunction(() => window.__nativeTest.authority.players[2].ammo === 0);
  await p3.keyboard.press("Space");
  await p1.waitForFunction(() => window.__nativeTest.authority.bombs.some((b) => b.owner === 3));
  console.log("PASS: three humans start without CPU; attack consumes both mines before placing a bomb");

  await p4.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p4.waitForFunction(() => document.getElementById("render-status").textContent !== "0 FPS");
  await wait(350);
  await p4.screenshot({ path: path.join(output, "native-mobile.png"), fullPage: true });
  assert.equal(await p4.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ passed: true, players: 4, errors }, null, 2));
  console.log("NATIVE E2E PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); server.kill(); });
