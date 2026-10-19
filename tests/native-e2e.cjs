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
const server = spawn(process.execPath, ["server.js"], { cwd: repo, env: { ...process.env, PORT: String(port), DISCONNECT_GRACE_MS: "4000" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
server.stderr.on("data", (data) => errors.push(data.toString()));
let browser;

(async () => {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/healthz")).ok) break; } catch {}
    await wait(50);
  }
  browser = await puppeteer.launch({ executablePath: process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--no-sandbox", "--window-size=1440,1100"] });
  const room = "native-" + Date.now();
  const load = async (name) => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 1100 });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => { if (response.url().includes("/native/assets/") && response.status() >= 400) errors.push(`Missing asset: ${response.url()}`); });
    await page.evaluateOnNewDocument((value) => localStorage.setItem("arcade_name", value), name);
    await page.goto(`${base}/native-room.html?game=3881-native&room=${room}&debug=1`);
    await page.waitForFunction(() => window.__nativeTest?.network.id && window.__nativeTest.state, { timeout: 20000 });
    return page;
  };
  const host = await load("房主"), guest = await load("远端玩家");
  const catalog = await browser.newPage();
  await catalog.goto(base);
  await catalog.evaluate(() => localStorage.setItem("arcade_name", "CatalogTest"));
  await catalog.reload();
  await catalog.waitForSelector('[data-game-id="3881-native"] .game-enter');
  assert((await catalog.$eval('[data-game-id="3881-native"] .game-enter', (link) => link.href)).includes("/native-room.html?"));
  assert((await catalog.$eval('[data-game-id="3881"] .game-enter', (link) => link.href)).includes("/room.html?"));
  await catalog.close();
  await host.click('[data-seat="1"]');
  await guest.click('[data-seat="2"]');
  await host.waitForFunction(() => !document.getElementById("start-game").disabled);
  await guest.waitForFunction(() => window.__nativeTest.network.transport(window.__nativeTest.network.room.hostId) === "p2p", { timeout: 15000 });
  await host.click("#start-game");
  await guest.waitForFunction(() => window.__nativeTest.state.phase === "playing");
  assert.equal(await guest.$("video, ruffle-player"), null);
  console.log("PASS: local rendering and direct WebRTC DataChannel connected");

  await host.evaluate(() => { window.__nativeTest.network.delayMs = 100; });
  await guest.evaluate(() => { window.__nativeTest.network.delayMs = 100; });
  await wait(1400);
  await guest.evaluate(() => {
    window.__movementProbe = null;
    window.addEventListener("keydown", function measure(event) {
      if (event.code !== "KeyA") return;
      window.removeEventListener("keydown", measure);
      const started = performance.now();
      const before = window.__nativeTest.state.players[1];
      const x = before.x - (before.moveDir === 0 ? before.progress / before.speed : 0);
      function sample() {
        const p = window.__nativeTest.state.players[1];
        const after = p.x - (p.moveDir === 0 ? p.progress / p.speed : 0);
        if (after < x) window.__movementProbe = performance.now() - started;
        else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
  });
  await guest.keyboard.down("KeyA");
  await guest.waitForFunction(() => typeof window.__movementProbe === "number", { timeout: 3000 });
  const movementMs = await guest.evaluate(() => window.__movementProbe);
  await wait(65);
  await guest.keyboard.up("KeyA");
  assert(movementMs < 90, `Local response took ${movementMs}ms despite prediction`);
  await wait(800);
  const metrics = await guest.evaluate(() => ({
    movementMs: window.__movementProbe,
    rtt: window.__nativeTest.network.rtt.get(window.__nativeTest.network.room.hostId),
    inputToDrawSamples: window.__nativeTest.responseSamples,
    corrections: window.__nativeTest.corrections,
    receivedBytes: window.__nativeTest.network.receivedBytes,
    sentBytes: window.__nativeTest.network.sentBytes
  }));
  assert(metrics.rtt > 170, `Impairment not exercised: RTT ${metrics.rtt}`);
  const hostX = await host.evaluate(() => window.__nativeTest.authority.players[1].x);
  assert(hostX < 13, "Guest input never reached authority");
  console.log(`PASS: ${movementMs.toFixed(1)}ms local movement with ${metrics.rtt.toFixed(1)}ms network RTT`);

  await guest.evaluate(() => { window.__nativeTest.network.lossRate = .2; });
  await host.evaluate(() => { window.__nativeTest.network.lossRate = .2; });
  await guest.keyboard.down("KeyD"); await wait(150); await guest.keyboard.up("KeyD");
  await wait(1200);
  const release = await host.evaluate(() => window.__nativeTest.authority.inputs[1].dir);
  assert.equal(release, -1, "Lost release left the player moving");
  await guest.evaluate(() => { window.__nativeTest.network.lossRate = 0; });
  await host.evaluate(() => { window.__nativeTest.network.lossRate = 0; });
  console.log("PASS: 20% packet loss recovers released input");

  const spectator = await load("观战玩家");
  await spectator.evaluate(() => {
    const test = window.__nativeTest;
    test.network.send(test.network.room.hostId, { type: "input", round: test.state.round, input: { seq: 999999, dir: 0, bomb: 999 } });
  });
  await wait(350);
  assert.equal(await host.evaluate(() => window.__nativeTest.authority.bombs.length), 0, "Spectator injected input");
  console.log("PASS: spectator input rejected");

  await host.evaluate(() => { window.__nativeTest.network.forceRelay = true; });
  await guest.evaluate(() => { window.__nativeTest.network.forceRelay = true; });
  await guest.keyboard.press("Space");
  await host.waitForFunction(() => window.__nativeTest.authority.bombs.some((bomb) => bomb.owner === 2));
  await guest.waitForFunction(() => window.__nativeTest.authority.bombs.some((bomb) => bomb.owner === 2));
  await guest.screenshot({ path: path.join(output, "native-room.png"), fullPage: true });
  await guest.waitForFunction(() => window.__nativeTest.authority.phase === "finished", { timeout: 7000 });
  assert.equal(await guest.evaluate(() => window.__nativeTest.authority.winner), 1);
  console.log("PASS: relay fallback, bomb, authoritative win and remote result");

  await host.waitForFunction(() => !document.getElementById("start-game").disabled);
  await host.click("#start-game");
  await guest.waitForFunction(() => window.__nativeTest.authority.phase === "playing");
  await guest.waitForFunction(() => window.__nativeTest.authority.ack[1] > 10);
  await guest.reload();
  await guest.waitForFunction(() => window.__nativeTest?.seat === 2 && window.__nativeTest.authority?.phase === "playing");
  await guest.keyboard.press("Space");
  await host.waitForFunction(() => window.__nativeTest.authority.bombs.some((bomb) => bomb.owner === 2));
  const beforeReload = await guest.evaluate(() => window.__nativeTest.authority.round);
  await host.reload();
  await host.waitForFunction(() => window.__nativeTest?.network.isHost && window.__nativeTest.seat === 1);
  await guest.waitForFunction((previous) => window.__nativeTest.authority?.round > previous && window.__nativeTest.authority.phase === "waiting", {}, beforeReload);
  console.log("PASS: guest refresh resumes inputs; host refresh starts a fresh synchronized round");
  await host.waitForFunction(() => !document.getElementById("start-game").disabled);
  await host.click("#start-game");
  await guest.waitForFunction(() => window.__nativeTest.authority.phase === "playing");
  const round = await guest.evaluate(() => window.__nativeTest.state.round);
  await host.click("#leave-room");
  await guest.waitForFunction(() => window.__nativeTest.network.isHost && window.__nativeTest.state.phase === "waiting", { timeout: 8000 });
  assert((await guest.evaluate(() => window.__nativeTest.state.round)) > round);
  console.log("PASS: host departure safely elects a new host and resets the round");

  await guest.select("#game-mode", "practice");
  await guest.select("#game-map", "lanes");
  await guest.select("#game-loadout", "mine");
  await guest.click("#start-game");
  await guest.waitForFunction(() => window.__nativeTest.state.phase === "playing");
  assert.deepEqual(await guest.evaluate(() => window.__nativeTest.state.options.bots), [1]);
  await guest.keyboard.press("KeyE");
  await guest.waitForFunction(() => window.__nativeTest.state.players[1].ammo === 1);
  await spectator.waitForFunction(() => window.__nativeTest.authority.specials.some((s) => s.kind === "mine" && s.owner === 2));
  assert((await guest.$eval("#weapon-status", (e) => e.textContent)).includes("地雷"));
  await guest.waitForFunction(() => {
    const equipped = document.getElementById("weapon-icon");
    return equipped && !equipped.hidden && equipped.src.endsWith("/item-mine.png") && equipped.complete && equipped.naturalWidth > 0;
  });
  assert(await guest.evaluate(() => [...document.querySelectorAll(".item-guide img, .weapon-guide img")]
    .every((icon) => icon.complete && icon.naturalWidth > 0)));
  console.log("PASS: one-player practice, CPU fill, map/loadout selection, special key and spectator snapshot");

  // Seat change ends the practice round, then two people can start co-op.
  await guest.click('[data-seat="2"]');
  await guest.waitForFunction(() => window.__nativeTest.state.phase === "waiting");
  await spectator.click('[data-seat="1"]');
  await guest.select("#game-mode", "coop");
  await guest.select("#game-map", "open");
  await guest.select("#game-loadout", "fire");
  await guest.click('[data-seat="2"]');
  await guest.waitForFunction(() => !document.getElementById("start-game").disabled);
  await guest.click("#start-game");
  await spectator.waitForFunction(() => window.__nativeTest.state.phase === "playing" && window.__nativeTest.state.players.length === 4);
  await spectator.keyboard.press("KeyE");
  await guest.waitForFunction(() => window.__nativeTest.authority.players[0].ammo === 1);
  await spectator.waitForFunction(() => window.__nativeTest.authority.players[0].ammo === 1);
  assert.deepEqual(await guest.evaluate(() => window.__nativeTest.state.options.bots), [3, 4]);
  assert.equal(await spectator.$eval("#game-mode", (e) => e.disabled), true);
  console.log("PASS: four-character co-op and remote special action reach authority exactly once");

  // Direct entry from the catalog, with a real mobile viewport and touch controls.
  await spectator.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await spectator.waitForFunction(() => window.__nativeTest?.state && document.getElementById("render-status").textContent !== "0 FPS");
  await wait(400);
  await spectator.screenshot({ path: path.join(output, "native-mobile.png"), fullPage: true });
  assert.equal(await spectator.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ ...metrics, injectedOneWayMs: 100, packetLoss: 0.2, passed: true, errors }, null, 2));
  console.log("NATIVE E2E PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.kill(); });
