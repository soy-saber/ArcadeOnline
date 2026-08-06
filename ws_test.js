"use strict";
const WebSocket = require("ws");

const URL = "ws://localhost:8000";
let step = 0;
const failures = [];

function assert(cond, name) {
  step++;
  if (cond) {
    console.log("ok  " + name);
  } else {
    console.log("FAIL " + name);
    failures.push(name);
  }
}

function client() {
  const ws = new WebSocket(URL);
  const recv = [];
  ws.on("message", (d) => recv.push(JSON.parse(d.toString())));
  return {
    ws,
    recv,
    opened: new Promise((r) => (ws.onopen = r))
  };
}

function waitFor(fn, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const r = fn();
      if (r) {
        clearInterval(iv);
        resolve(r);
      } else if (Date.now() - t0 > timeout) {
        clearInterval(iv);
        reject(new Error("timeout waiting"));
      }
    }, 20);
  });
}

const p1 = client();
const p2 = client();
const spec = client();

function send(c, msg) {
  c.ws.send(JSON.stringify(msg));
}

async function lastState(c) {
  await waitFor(() => {
    const arr = c.recv.filter((m) => m.t === "state");
    return arr.length > 0;
  });
  const arr = c.recv.filter((m) => m.t === "state");
  return arr[arr.length - 1];
}

async function main() {
  await Promise.all([p1.opened, p2.opened, spec.opened]);

  send(p1, { t: "join", name: "xiaoming", gameId: "46923", room: "t1" });
  send(p2, { t: "join", name: "xiaohong", gameId: "46923", room: "t1" });
  send(spec, { t: "join", name: "guestA", gameId: "46923", room: "t1" });

  await waitFor(() => spec.recv.some((m) => m.t === "welcome"));
  assert(true, "3 clients joined");

  await waitFor(() => {
    const arr = spec.recv.filter((m) => m.t === "state");
    return arr.length && arr[arr.length - 1].members.length === 3;
  });
  assert(true, "state broadcast shows 3 members");

  send(p1, { t: "sit", seat: 1 });
  send(p2, { t: "sit", seat: 2 });
  await waitFor(() => {
    const arr = spec.recv.filter((m) => m.t === "state");
    const s = arr[arr.length - 1];
    return s && s.seats[1] && s.seats[2];
  });
  assert(true, "both seated, spectator sees seats");

  send(spec, { t: "sit", seat: 1 });
  const err = await waitFor(() => spec.recv.find((m) => m.t === "err"));
  assert(!!err, "sit on occupied seat rejected");

  send(p1, { t: "in", kind: "key", type: "keydown", code: "KeyA", key: "a", keyCode: 65 });
  const relay1 = await waitFor(() => p2.recv.find((m) => m.t === "in" && m.kind === "key"));
  assert(!!relay1 && relay1.code === "KeyA", "P1 KeyA relayed to P2");

  send(p1, { t: "in", kind: "key", type: "keydown", code: "ArrowLeft", key: "ArrowLeft", keyCode: 37 });
  await new Promise((r) => setTimeout(r, 150));
  const dropped = p2.recv.filter(
    (m) => m.t === "in" && m.kind === "key" && m.code === "ArrowLeft"
  ).length;
  assert(dropped === 0, "P1 sending P2 key dropped by server");

  send(spec, { t: "in", kind: "key", type: "keydown", code: "KeyA", key: "a", keyCode: 65 });
  await new Promise((r) => setTimeout(r, 150));
  const specKeys = p1.recv.filter(
    (m) => m.t === "in" && m.kind === "key" && m.code === "KeyA"
  ).length;
  assert(specKeys === 1, "spectator keyboard dropped (only P1's own relayed)");

  send(p1, { t: "in", kind: "mouse", type: "pointermove", x: 0.2, y: 0.3, button: 0, buttons: 0 });
  const mo1 = await waitFor(() =>
    spec.recv.find((m) => m.t === "mouseOwner" && m.name === "xiaoming")
  );
  assert(!!mo1, "P1 grabs mouse");

  send(p2, { t: "in", kind: "mouse", type: "pointermove", x: 0.8, y: 0.7, button: 0, buttons: 0 });
  const mo2 = await waitFor(() =>
    spec.recv.find((m) => m.t === "mouseOwner" && m.name === "xiaohong")
  );
  assert(!!mo2, "P2 steals mouse");

  const mv = await waitFor(() =>
    p1.recv.find((m) => m.t === "in" && m.kind === "mouse" && Math.abs(m.x - 0.8) < 0.001)
  );
  assert(!!mv, "mouse coords relayed");

  send(p1, { t: "leave" });
  const ck = await waitFor(() => spec.recv.find((m) => m.t === "clearKeys" && m.seat === 1));
  assert(!!ck, "leave seat broadcasts clearKeys(P1)");
  await waitFor(() => {
    const arr = spec.recv.filter((m) => m.t === "state");
    return arr[arr.length - 1].seats[1] == null;
  });
  assert(true, "seat 1 free after leave");

  send(p1, { t: "sit", seat: 1 });
  await waitFor(() => {
    const arr = p2.recv.filter((m) => m.t === "state");
    return arr[arr.length - 1].seats[1] != null;
  });
  p1.ws.close();
  const ck2 = await waitFor(() => spec.recv.find((m) => m.t === "clearKeys" && m.seat === 1));
  assert(!!ck2, "disconnect auto-leaves + clearKeys");
  await waitFor(() => {
    const arr = spec.recv.filter((m) => m.t === "state");
    return arr[arr.length - 1].members.length === 2;
  });
  assert(true, "member list updated after disconnect");

  p2.ws.close();
  const mo3 = await waitFor(() => spec.recv.find((m) => m.t === "mouseOwner" && m.id == null));
  assert(!!mo3, "mouse owner reset when owner disconnects");

  spec.ws.close();
  console.log("---------------------------------");
  if (failures.length) {
    console.log("FAILED: " + failures.length + " : " + failures.join(", "));
    process.exit(1);
  }
  console.log("ALL TESTS PASSED (" + step + ")");
  process.exit(0);
}

main().catch((e) => {
  console.error("TEST ERROR: " + e.message);
  process.exit(1);
});
