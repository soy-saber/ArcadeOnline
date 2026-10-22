"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), { spawn } = require("node:child_process"), puppeteer = require("puppeteer-core");
const repo = path.resolve(__dirname, ".."), output = path.join(repo, process.env.EXPANDED_BASE_URL ? "artifacts/expanded-public-e2e" : "artifacts/expanded-e2e"), port = 28000 + Math.floor(Math.random() * 1000), base = process.env.EXPANDED_BASE_URL || `http://127.0.0.1:${port}`;
fs.mkdirSync(output, { recursive: true });
const errors = [], results = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = process.env.EXPANDED_BASE_URL ? null : spawn(process.execPath, ["server.js"], { cwd: repo, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
server?.stderr.on("data", data => errors.push(data.toString()));
let browser;
(async () => {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/healthz")).ok) break; } catch {} await wait(50); }
  browser = await puppeteer.launch({ executablePath: process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
  const catalog = (await (await fetch(base + "/games.json")).json()).filter(game => game.runtime === "server" && !["3881-server", "46923-server"].includes(game.id));
  assert.equal(catalog.length, 6);
  for (const game of catalog) {
    if (process.env.EXPANDED_GAME && game.id !== process.env.EXPANDED_GAME) continue;
    if (process.env.EXPANDED_GAMES && !process.env.EXPANDED_GAMES.split(',').includes(game.id)) continue;
    console.log("Testing expanded game: " + game.id);
    const fourPlayers = ["50737-server", "9109-server"].includes(game.id);
    const room = "expanded-" + Date.now(), seat = game.seats.length, pages = [], contexts = [];
    for (let i = 0; i < (fourPlayers ? 4 : 2); i++) {
      const context = await browser.createBrowserContext(), page = await context.newPage(); contexts.push(context); pages.push(page);
      await page.setViewport({ width: 1450, height: 1100 });
      page.on("pageerror", error => errors.push(`${game.id}: ${error.message}`));
      page.on("response", response => { if (response.url().includes("/expanded/assets/") && response.status() >= 400) errors.push(`Missing asset: ${response.url()}`); });
      await page.evaluateOnNewDocument(name => localStorage.setItem("arcade_name", name), "Expanded P" + (i + 1));
      await page.goto(`${base}/authority-room.html?game=${game.id}&room=${room}&debug=1`);
      await page.waitForFunction(() => window.__authorityTest?.authority, { timeout: 10000 });
    }
    const [a, b] = pages;
    await a.click("#fullscreen-stage");
    await a.waitForFunction(() => document.fullscreenElement || document.querySelector(".fullscreen-fallback"));
    assert(await a.evaluate(() => ["game-canvas", "start-game", "seat-1", "battle-records"].every(id => document.getElementById("fullscreen-room").contains(document.getElementById(id)))));
    await a.click('[data-seat="1"]'); await b.click(`[data-seat="${seat}"]`);
    if (fourPlayers) { await pages[2].click('[data-seat="2"]'); await pages[3].click('[data-seat="3"]'); }
    await a.waitForFunction(count => window.__authorityTest.network.room.members.filter(m => m.seat).length === count, {}, pages.length);
    if (game.id === '9109-server') {
      assert.equal(await a.$$eval('#game-map option',options=>options.length),18);
      assert.deepEqual(await a.$$eval('#game-mode option',options=>options.map(o=>o.value)),['arcade','kill','collect','color']);
      await a.select('#game-mode','kill');await a.waitForFunction(()=>window.__authorityTest.network.room.auth.options.gameMode==='kill');
      await a.select('#game-map','beach-two');await b.waitForFunction(()=>window.__authorityTest.authority.mapId==='beach-two'&&window.__authorityTest.authority.mode==='kill');
    }
    for (let i = 0; i < pages.length; i++) {
      const expectedSeat = i === 0 ? 1 : i === 1 ? seat : i;
      await pages[i].waitForFunction(seat => window.__authorityTest.seat === seat, {}, expectedSeat);
      await pages[i].click('#start-game');
      await pages[i].waitForFunction(() => window.__authorityTest.network.room.members.find(m => m.id === window.__authorityTest.network.id)?.ready);
    }
    await Promise.all(pages.map(page => page.waitForFunction(() => window.__authorityTest.authority.phase === "playing")));
    const summary = await b.evaluate(() => { const t = window.__authorityTest; return { players: t.authority.players.map(p => p.seat), host: t.network.room.hostId, transport: t.transport }; });
    assert.deepEqual(summary.players, fourPlayers ? [1,2,3,4] : [1, seat]); assert.equal(summary.host, null); assert.equal(summary.transport, "server");
    await a.waitForFunction(count => [...document.querySelectorAll('.player-nameplate')].filter(label => !label.hidden).length === count, {}, pages.length);
    assert.deepEqual((await a.$$eval('.player-nameplate', labels => labels.filter(label => !label.hidden).map(label => label.textContent))).sort(), Array.from({length:pages.length},(_,i)=>'Expanded P'+(i+1)).sort());
    assert(await a.evaluate(() => [...document.querySelectorAll('.player-nameplate')].filter(label => !label.hidden).every(label => { const a = label.getBoundingClientRect(), b = document.getElementById('game-canvas').getBoundingClientRect(); return a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1; })));
    if (game.id !== "fbw_forest-server") await b.waitForFunction(count => document.querySelectorAll("#records-body tr").length === count, {}, pages.length);
    if (fourPlayers) {
      await pages[2].evaluate(() => document.getElementById('game-canvas').focus()); await pages[3].evaluate(() => document.getElementById('game-canvas').focus());
      await pages[2].keyboard.press('Space'); await pages[3].keyboard.press('Space');
      await a.waitForFunction(() => [2,3].every(seat => window.__authorityTest.authority.players.find(p=>p.seat===seat)?.lastAttack > 0));
    }
    const start = await b.evaluate(seat => { const p = window.__authorityTest.authority.players.find(p => p.seat === seat); return { x: p.x, y: p.y, angle: p.angle }; }, seat);
    await b.evaluate(() => document.getElementById("game-canvas").focus());
    const movement = game.id === "137953-server" ? "ArrowUp" : game.id === "9109-server" ? "ArrowLeft" : "ArrowRight";
    await b.keyboard.down(movement);
    await b.waitForFunction((seat, start) => { const p = window.__authorityTest.authority.players.find(p => p.seat === seat); return p && (Math.abs(p.x - start.x) + Math.abs(p.y - start.y) > .15); }, { timeout: 5000 }, seat, start);
    await b.keyboard.up(movement);
    await a.waitForFunction(seat => window.__authorityTest.authority.ack[seat - 1] > 5, { timeout: 5000 }, seat);
    if (game.id === "97734-server") {
      await b.keyboard.press("ArrowUp");
      assert.equal(await b.evaluate(seat => window.__authorityTest.authority.players.find(p => p.seat === seat).lastAlt, seat), 0);
    }
    if (["50737-server", "97734-server"].includes(game.id)) {
      assert(await b.evaluate(() => !document.getElementById("alt-button").hidden));
      await b.keyboard.press("KeyK"); await a.waitForFunction(seat => window.__authorityTest.authority.players.find(p => p.seat === seat)?.lastAlt > 0, { timeout: 5000 }, seat);
    }
    await b.keyboard.down("Space"); await wait(["fbw_forest-server", "137953-server"].includes(game.id) ? 80 : 400); await b.keyboard.up("Space");
    await a.waitForFunction(seat => window.__authorityTest.authority.players.find(p => p.seat === seat)?.lastAttack > 0, { timeout: 5000 }, seat);
    if (["50737-server", "97734-server"].includes(game.id)) {
      assert(await b.evaluate(seat => window.__authorityTest.authority.players.find(p => p.seat === seat).lastAttack > 1, seat), "held fire repeats");
    }
    if (game.id === '9109-server' && await a.evaluate(()=>window.__authorityTest.authority.mode==='arcade')) {
      await a.waitForFunction(() => window.__authorityTest.authority.flames.some(until => until > window.__authorityTest.authority.tick), {timeout:5000});
      await wait(300); // Exercise the complete blast frame range and asset loading.
    }
    const tickBefore = await b.evaluate(() => window.__authorityTest.authority.tick), cdp = await a.createCDPSession(); await cdp.send("Debugger.enable");
    await cdp.send("Debugger.pause"); await wait(650);
    const tickAfter = await b.evaluate(() => window.__authorityTest.authority.tick); assert(tickAfter > tickBefore + 5, game.id);
    await cdp.send("Debugger.resume"); await cdp.send("Debugger.disable");
    await a.waitForFunction(() => window.__authorityTest.network.resyncs > 0 && window.__authorityTest.network.snapshotAge < 250, { timeout: 10000 });
    await b.evaluate(() => window.__authorityTest.resync()); await b.waitForFunction(() => window.__authorityTest.network.fullUpdates > 2);
    assert(await b.evaluate(() => window.__authorityTest.network.deltaUpdates > 0));
    await a.click("#exit-fullscreen"); await a.waitForFunction(() => !document.fullscreenElement);
    const currentRound = await a.evaluate(() => window.__authorityTest.authority.round);
    await b.waitForFunction(seat => window.__authorityTest.seat === seat, {}, seat);
    if (fourPlayers) {
      await a.evaluate(() => window.__authorityTest.network.control({t:'ready',ready:false}));
      await a.waitForFunction(() => !window.__authorityTest.network.room.members.find(m=>m.seat===1).ready);
    }
    await b.evaluate(() => window.__authorityTest.network.control({t:'leaveSeat'}));
    await a.waitForFunction(round => window.__authorityTest.authority.round > round && window.__authorityTest.authority.phase === "waiting", { timeout: 5000 }, currentRound);
    if (fourPlayers) assert(await a.evaluate(() => window.__authorityTest.network.room.members.filter(m => m.seat && m.seat !== 1).every(m => m.ready)));
    else assert(await a.evaluate(() => window.__authorityTest.network.room.members.find(m => m.seat === 1).ready));
    const maps = await a.$$eval("#game-map option", options => options.map(option => option.value));
    if (maps.length > 1) { await a.select("#game-map", maps[maps.length - 1]); await b.waitForFunction(map => window.__authorityTest.network.room.auth.options.map === map, { timeout: 5000 }, maps[maps.length - 1]); }
    await b.click(`[data-seat="${seat}"]`); await b.waitForFunction(seat => window.__authorityTest.seat === seat, {}, seat);
    assert.equal(await b.evaluate(() => window.__authorityTest.network.room.members.find(m => m.id === window.__authorityTest.network.id).ready), false);
    await b.click("#start-game");
    await b.waitForFunction(() => window.__authorityTest.network.room.members.find(m => m.id === window.__authorityTest.network.id)?.ready);
    if (fourPlayers) await a.click("#start-game"); await a.waitForFunction(() => window.__authorityTest.authority.phase === "playing");
    await b.screenshot({ path: path.join(output, game.id + ".png"), fullPage: true });
    const counts = await b.evaluate(() => ({ full: window.__authorityTest.network.fullUpdates, delta: window.__authorityTest.network.deltaUpdates, bytes: window.__authorityTest.network.receivedBytes }));
    results.push({ game: game.id, seats: summary.players, names: pages.length, maps: maps.length, ...counts });
    console.log("Expanded E2E passed: " + game.id);
    for (const context of contexts) await context.close();
  }
  assert.deepEqual(errors, []); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ results, errors }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); if (server && server.exitCode == null) server.kill(); });
