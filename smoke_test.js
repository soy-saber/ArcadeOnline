"use strict";

const assert = require("assert/strict");
const http = require("http");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const managedServer = !process.env.WS_URL;
const port = managedServer ? 18000 + Math.floor(Math.random() * 1000) : null;
const url = process.env.WS_URL || "ws://127.0.0.1:" + port;
const room = "smoke-" + Date.now();
const clients = new Set();
let serverProcess = null;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(check, label, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await wait(25);
  }
  throw new Error("等待超时: " + label);
}

async function startServer() {
  if (!managedServer) return;
  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port),
      DISCONNECT_GRACE_MS: "250"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let errorOutput = "";
  serverProcess.stderr.on("data", (chunk) => {
    errorOutput += chunk.toString();
  });
  await waitUntil(
    () =>
      new Promise((resolve) => {
        const req = http.get("http://127.0.0.1:" + port + "/games.json", (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        });
        req.on("error", () => resolve(false));
        req.setTimeout(200, () => {
          req.destroy();
          resolve(false);
        });
      }),
    "测试服务器启动"
  ).catch((error) => {
    throw new Error(error.message + (errorOutput ? "\n" + errorOutput : ""));
  });
}

async function createClient(name, session, gameId = "46923", roomName = room) {
  const ws = new WebSocket(url);
  const client = { ws, name, session, id: null, states: [], sys: [], errors: [], inputs: [] };
  clients.add(client);
  ws.on("message", (raw, isBinary) => {
    if (isBinary) return;
    const msg = JSON.parse(raw.toString());
    if (msg.t === "welcome") client.id = msg.id;
    if (msg.t === "state") client.states.push(msg);
    if (msg.t === "sys") client.sys.push(msg);
    if (msg.t === "err") client.errors.push(msg.msg);
    if (msg.t === "in") client.inputs.push(msg);
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  ws.send(JSON.stringify({ t: "join", name, session, gameId, room: roomName }));
  await waitUntil(() => client.id && client.states.length, name + " 加入房间");
  return client;
}

function latest(client) {
  return client.states[client.states.length - 1];
}

async function waitForState(client, predicate, label) {
  return waitUntil(() => {
    const state = latest(client);
    return state && predicate(state) ? state : null;
  }, label);
}

function send(client, message) {
  client.ws.send(JSON.stringify(message));
}

function assertHostInvariant(state) {
  assert.ok(
    state.hostId == null || state.members.some((member) => member.id === state.hostId),
    "hostId 必须为空或指向现存成员"
  );
}

(async () => {
  await startServer();

  const a = await createClient("A", "session_A_1234567890");
  const b = await createClient("B", "session_B_1234567890");
  const observer = await createClient("Observer", "session_O_1234567890");
  assert.equal(latest(observer).hostId, a.id, "首位成员应成为房主");

  send(b, { t: "sit", seat: 2 });
  await waitForState(b, (state) => state.seats[2] === b.id, "B 坐入 P2");

  send(b, {
    t: "in",
    kind: "key",
    type: "keydown",
    code: "ArrowRight",
    key: "ArrowRight",
    keyCode: 39
  });
  const relayed = await waitUntil(() => a.inputs.find((input) => input.from === b.id), "P2 输入转发");
  assert.equal(relayed.code, "ArrowRight");

  send(b, { t: "leaveSeat" });
  const leftSeat = await waitForState(
    b,
    (state) => state.seats[2] == null && state.members.some((member) => member.id === b.id),
    "B 离座"
  );
  assertHostInvariant(leftSeat);

  send(b, { t: "sit", seat: 2 });
  await waitForState(b, (state) => state.seats[2] === b.id, "B 重新坐入 P2");

  a.ws.terminate();
  const resumedA = await createClient("A", "session_A_1234567890");
  const resumedState = await waitForState(resumedA, (state) => state.hostId === a.id, "A 恢复房主会话");
  assert.equal(resumedA.id, a.id, "重连必须复用原成员身份");
  assertHostInvariant(resumedState);

  resumedA.ws.terminate();
  const transferred = await waitForState(observer, (state) => state.hostId === b.id, "断线超时后转移房主");
  assertHostInvariant(transferred);

  send(b, { t: "leave" });
  const afterHostLeave = await waitForState(
    observer,
    (state) => !state.members.some((member) => member.id === b.id),
    "房主主动离房"
  );
  assert.equal(afterHostLeave.hostId, observer.id, "房主主动离房后应立即转移");
  assertHostInvariant(afterHostLeave);

  const shim = await new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:" + port + "/mochibot.swf", (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
  assert.equal(shim.length, 26, "Mochibot 替代 SWF 长度应正确");
  assert.equal(shim.readUInt16LE(22), 0x0040, "Mochibot 替代 SWF 应包含合法 ShowFrame 标签");

  const bombRoom = "bomb-" + Date.now();
  const bombHost = await createClient("BombHost", "session_bomb_host_123", "3881", bombRoom);
  const bombP2 = await createClient("BombP2", "session_bomb_p2_12345", "3881", bombRoom);
  send(bombP2, { t: "sit", seat: 2 });
  await waitForState(bombP2, (state) => state.seats[2] === bombP2.id, "炸弹人 P2 入座");
  send(bombP2, {
    t: "in",
    kind: "key",
    type: "keydown",
    code: "Enter",
    key: "Enter",
    keyCode: 13
  });
  const bombInput = await waitUntil(
    () => bombHost.inputs.find((input) => input.from === bombP2.id),
    "炸弹人 P2 放炸弹输入转发"
  );
  assert.equal(bombInput.code, "Enter", "炸弹人 P2 放炸弹必须映射为回车键");

  console.log("SMOKE PASS: 状态机、会话恢复、两款游戏输入转发和替代资源均通过");
})()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const client of clients) {
      if (client.ws.readyState < 2) client.ws.terminate();
    }
    if (serverProcess && serverProcess.exitCode == null) serverProcess.kill();
    await wait(50);
  });
