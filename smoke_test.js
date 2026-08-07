"use strict";
const WebSocket = require("ws");
const URL = "ws://localhost:8000";
const room = "smoke" + Date.now();

function client(name) {
  const ws = new WebSocket(URL);
  const c = { ws, id: null, states: [], sys: [] };
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.t === "welcome") c.id = msg.id;
    if (msg.t === "state") c.states.push(msg);
    if (msg.t === "sys") c.sys.push(msg);
  });
  c.join = () => ws.send(JSON.stringify({ t: "join", name, gameId: "46923", room }));
  c.sit = (seat) => ws.send(JSON.stringify({ t: "sit", seat }));
  c.leaveSeat = () => ws.send(JSON.stringify({ t: "leaveSeat" }));
  c.leave = () => ws.send(JSON.stringify({ t: "leave" }));
  return c;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const a = client("A");
  await new Promise((r) => a.ws.on("open", r));
  a.join();
  await wait(400);
  console.log("A 是房主: " + (a.states[0] && a.states[0].hostId === a.id));

  const b = client("B");
  await new Promise((r) => b.ws.on("open", r));
  b.join();
  await wait(400);
  b.sit(2);
  await wait(400);
  let s = b.states[b.states.length - 1];
  console.log("B 坐座2: " + (s.seats[2] === b.id));

  // 离座：成员保留、座位释放、无"离开"广播
  const sysBefore = b.sys.length;
  b.leaveSeat();
  await wait(400);
  s = b.states[b.states.length - 1];
  const inMembers = s.members.some((m) => m.id === b.id);
  const leftSys = b.sys.filter((x) => x.action === "leave").length;
  console.log("离座后: 成员仍在=" + inMembers + " 座位空=" + (s.seats[2] === null) + " 离开广播=" + leftSys);

  // B 重新坐座
  b.sit(2);
  await wait(400);

  // A 断开 → B 应自动成为房主
  a.ws.close();
  await wait(800);
  s = b.states[b.states.length - 1];
  const autoTransfer = s.hostId === b.id;
  const hostSys = b.sys.some((x) => x.action === "host" && x.name === "B");
  console.log("A断开后 B 自动成为房主: " + autoTransfer + " 广播=" + hostSys);

  // B 真正离开：成员删除
  b.leave();
  await wait(400);
  s = b.states[b.states.length - 1];
  const removed = !s.members.some((m) => m.id === b.id);
  console.log("B 离开后成员移除: " + removed);
  b.ws.close();
  console.log("SMOKE DONE");
  process.exit(0);
})().catch((e) => {
  console.log("FAIL: " + e.message);
  process.exit(1);
});
