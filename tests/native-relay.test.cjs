"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const crypto = require("node:crypto");
const WebSocket = require("ws");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("native relay enforces room, host, seat and game boundaries", async () => {
  const port = 22000 + Math.floor(Math.random() * 2000);
  const testSecret = "native-turn-test-only";
  const server = spawn(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env: { ...process.env, PORT: String(port), TURN_URLS: "turn:127.0.0.1:3478?transport=udp", TURN_SECRET: testSecret }, windowsHide: true, stdio: "ignore" });
  const clients = [];
  async function until(check) { for (let i = 0; i < 100; i++) { if (await check()) return; await wait(40); } throw new Error("Timed out"); }
  async function join(gameId, room) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const client = { ws, id: null, messages: [] }; clients.push(client);
    ws.on("message", (raw) => { const m = JSON.parse(raw); client.messages.push(m); if (m.t === "welcome") client.id = m.id; });
    await new Promise((resolve, reject) => { ws.on("open", resolve); ws.on("error", reject); });
    ws.send(JSON.stringify({ t: "join", gameId, room, name: "NativeTest", rtcCapable: true }));
    await until(() => client.id); return client;
  }
  const send = (client, to, type) => client.ws.send(JSON.stringify({ t: "native", to: to.id, data: { type, marker: type } }));
  try {
    await until(async () => { try { return (await fetch(`http://127.0.0.1:${port}/healthz`)).ok; } catch { return false; } });
    const config = await (await fetch(`http://127.0.0.1:${port}/rtc-config`)).json();
    assert(Array.isArray(config.iceServers));
    const turn = config.iceServers[1];
    assert(Number(turn.username.split(":")[0]) > Date.now() / 1000);
    assert.equal(turn.credential, crypto.createHmac("sha1", testSecret).update(turn.username).digest("base64"));
    assert(!JSON.stringify(config).includes(testSecret));
    const host = await join("3881-native", "relay"), player = await join("3881-native", "relay"), spectator = await join("3881-native", "relay");
    const outsider = await join("3881-native", "outside"), legacy = await join("3881", "relay");
    player.ws.send(JSON.stringify({ t: "sit", seat: 2 }));
    await until(() => player.messages.some((m) => m.t === "state" && m.seats[2] === player.id));
    send(player, host, "input"); send(host, player, "snapshot");
    await until(() => host.messages.some((m) => m.t === "native"));
    await until(() => player.messages.some((m) => m.t === "native"));
    assert.equal(host.messages.filter((m) => m.t === "native").length, 1);
    send(spectator, host, "input"); send(player, host, "snapshot"); send(player, outsider, "input"); send(legacy, host, "input"); send(host, outsider, "snapshot");
    await wait(180);
    assert.equal(host.messages.filter((m) => m.t === "native").length, 1);
    assert.equal(outsider.messages.filter((m) => m.t === "native").length, 0);
  } finally { for (const client of clients) client.ws.close(); server.kill(); }
});
