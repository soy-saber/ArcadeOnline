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
  await get("/native-room.html"); await get("/native/bomb.js");
  await get("/badminton-room.html"); await get("/native/badminton.js"); await get("/native/assets/badminton-hit.mp3");
  const catalog = await (await get("/games.json")).json();
  assert(JSON.stringify(catalog).includes("3881-native"), "Native game is missing from catalog");
  assert(JSON.stringify(catalog).includes("46923-native"), "Badminton game is missing from catalog");
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
        if (gameId === "46923-native" && Object.keys(state.seats).length !== 2) reject(new Error("Badminton room must have two seats"));
        else resolve();
      }
    });
  });
  await join("3881-native"); await join("46923-native");
  console.log(`PASS ${origin}: health, assets, native catalog, ${requireTurn ? "TURN credentials, " : ""}WebSocket room join.`);
  console.log("Next: run check-turn.cjs from an outside network, then play from two devices.");
}
if (require.main === module) check(process.argv[2] || "http://127.0.0.1:8000", !process.argv.includes("--no-turn")).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { check };
