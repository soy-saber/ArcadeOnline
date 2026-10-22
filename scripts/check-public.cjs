"use strict";
// Run from any Node >=22 machine. TLS verification remains enabled.
const assert = require("node:assert/strict");
async function check(base, requireTurn = true) {
  const origin = new URL(base).origin;
  const get = async (route) => {
    const response = await fetch(origin + route, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, `${route}: HTTP ${response.status}`);
    return response;
  };
  assert.equal((await (await get("/healthz")).json()).status, "ok");
  await get("/"); await get("/theme.css"); await get("/assets/yuuka-kurisu-background.webp");
  await get("/authority/assets/badminton-hit.mp3");
  const catalog = await (await get("/games.json")).json();
  assert.equal(catalog.length, 8, "Eight multiplayer games expected");
  assert(catalog.every(game => game.runtime === "server" && !/服务器|联机版|原生版/.test(game.title)), "Catalog must contain original names and server games only");
  for (const game of catalog) { assert(game.cover, `Cover missing: ${game.id}`); await get(game.cover); }
  for (const route of ["/native/bomb.js", "/native/badminton.js", "/games/3881/game.swf", "/room.js"]) {
    const response = await fetch(origin + route, { signal: AbortSignal.timeout(10000) });assert.equal(response.status, 404, `Old version still available: ${route}`);
  }
  if (catalog.some((game) => game.runtime === "server")) {
    await get("/authority-room.html"); await get("/authority/game.js");
    await get("/authority/assets/maps/floor-1.png");
    assert(catalog.some((game) => game.id === "3881-server") && catalog.some((game) => game.id === "46923-server"), "Authority entries missing");
    for (const [id, asset] of [["137953-server", "tank/manifest.json"], ["50737-server", "boxhead/provenance.json"], ["6232-server", "brawler/data.json"], ["9109-server", "bomb2/manifest.json"], ["97734-server", "gunmayhem/provenance.json"], ["fbw_forest-server", "forest/data.json"]]) {
      if (catalog.some(game => game.id === id)) await get(`/expanded/assets/${asset}`);
    }
  }
  const rtc = await (await get("/rtc-config")).json();
  if (requireTurn) assert(rtc.iceServers.some((s) => s.username && s.credential && Number(s.username.split(":")[0]) > Date.now() / 1000), "TURN temporary credentials missing/expired");
  const join = (gameId) => new Promise((resolve, reject) => {
    const ws = new WebSocket(origin.replace(/^http/, "ws"));
    const timer = setTimeout(() => { ws.close(); reject(new Error("WebSocket join timed out")); }, 10000);
    ws.addEventListener("open", () => ws.send(JSON.stringify({ t: "join", gameId, room: "probe-" + Date.now().toString(36), name: "部署检查", session: "probe-" + crypto.randomUUID(), rtcCapable: true })));
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("WebSocket connection failed")); });
    ws.addEventListener("message", (event) => {
      const state = JSON.parse(event.data);
      if (state.t === "state") {
        clearTimeout(timer); ws.send(JSON.stringify({ t: "leave" })); ws.close();
        if (Object.keys(state.seats).length !== catalog.find(game => game.id === gameId).seats.length) reject(new Error(`Incorrect room seats: ${gameId}`));
        else if (catalog.find(game => game.id === gameId).runtime === "server" && state.hostId !== null) reject(new Error(`Server room has a browser host: ${gameId}`));
        else resolve();
      }
    });
  });
  for (const game of catalog.filter(game => game.runtime === "server")) await join(game.id);
  console.log(`PASS ${origin}: health, eight multiplayer games, covers, character background, retired versions, ${requireTurn ? "TURN credentials, " : ""}WebSocket room join.`);
}
if (require.main === module) check(process.argv[2] || "http://127.0.0.1:8000", !process.argv.includes("--no-turn")).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { check };
