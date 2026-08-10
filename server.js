"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const ROOT = __dirname;
const PORT = process.env.PORT || 8000;
const DISCONNECT_GRACE_MS = Math.max(0, Number(process.env.DISCONNECT_GRACE_MS) || 4000);
const MAX_FRAME_BUFFER_BYTES = Math.max(
  64 * 1024,
  Number(process.env.MAX_FRAME_BUFFER_BYTES) || 1024 * 1024
);

// Valid one-frame SWF used in place of the retired mochibot.com dependency.
const MOCHIBOT_SWF = Buffer.from([
  0x46, 0x57, 0x53, 0x08,
  0x1a, 0x00, 0x00, 0x00,
  0x78, 0x00, 0x05, 0x5f, 0x00, 0x00, 0x00, 0x00, 0x0a, 0x00,
  0x00, 0x11,
  0x01, 0x00,
  0x40, 0x00,
  0x00, 0x00
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".swf": "application/x-shockwave-flash",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

const games = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "games.json"), "utf8"));
const gameMap = new Map();
for (const g of games) {
  const keyMap = {};
  for (const s of g.seats) keyMap[s.seat] = new Set(s.keys);
  gameMap.set(g.id, keyMap);
}

const rooms = new Map();

function getRoom(gameId, roomName) {
  const key = gameId + "|" + roomName;
  let room = rooms.get(key);
  if (!room) {
    room = {
      key,
      gameId,
      name: roomName,
      seats: { 1: null, 2: null },
      mouseOwner: null,
      hostId: null,
      members: new Map()
    };
    rooms.set(key, room);
  } else if (room._cleanup) {
    clearTimeout(room._cleanup);
    room._cleanup = null;
  }
  return room;
}

// 房间无人后定时清理，防止 rooms Map 无限增长
function scheduleRoomCleanup(room) {
  if (room._cleanup) clearTimeout(room._cleanup);
  room._cleanup = setTimeout(() => {
    if (room.members.size === 0) rooms.delete(room.key);
  }, 30 * 60 * 1000);
  room._cleanup.unref();
}

// 房主离开后自动转移：优先座位玩家，否则最早加入的成员
function transferHost(room) {
  let next = null;
  for (const s of [1, 2]) {
    if (room.seats[s] != null) {
      next = room.seats[s];
      break;
    }
  }
  if (next == null) {
    const it = room.members.values();
    const first = it.next();
    if (!first.done) next = first.value.id;
  }
  if (next == null) return;
  room.hostId = next;
  const nm = room.members.get(next);
  if (nm) broadcast(room, { t: "sys", name: nm.name, action: "host" });
  // 兜底：重置所有座位按键状态，防止旧房主遗留的按下状态导致新游戏卡键
  const host = room.members.get(room.hostId);
  if (host) {
    for (const s of [1, 2]) {
      if (room.seats[s] != null) sendTo(host.ws, { t: "clearKeys", seat: s });
    }
  }
}

function sanitizeName(raw) {
  if (typeof raw !== "string") return "游客";
  let n = raw.replace(/[<>]/g, "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 12);
  if (!n) n = "游客";
  return n;
}

function sanitizeSessionId(raw) {
  if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(raw)) return null;
  return raw;
}

function validSignalData(kind, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (kind === "offer" || kind === "answer") {
    return (
      data.type === kind &&
      typeof data.sdp === "string" &&
      data.sdp.length > 0 &&
      data.sdp.length <= 256 * 1024
    );
  }
  return (
    kind === "ice" &&
    typeof data.candidate === "string" &&
    data.candidate.length <= 4096 &&
    (data.sdpMid == null || (typeof data.sdpMid === "string" && data.sdpMid.length <= 64)) &&
    (data.sdpMLineIndex == null || Number.isInteger(data.sdpMLineIndex))
  );
}

function sendTo(ws, msg) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
    } catch (e) {
      console.error("[send] " + e.message);
    }
  }
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const m of room.members.values()) {
    if (m.ws && m.ws.readyState === 1) {
      try {
        m.ws.send(data);
      } catch (e) {
        console.error("[broadcast] " + e.message);
      }
    }
  }
}

function broadcastRaw(room, data, exceptId) {
  for (const m of room.members.values()) {
    if (
      m.id !== exceptId &&
      m.streamTransport !== "webrtc" &&
      !m.framePending &&
      m.ws &&
      m.ws.readyState === 1 &&
      m.ws.bufferedAmount <= MAX_FRAME_BUFFER_BYTES
    ) {
      try {
        m.ws.send(data);
        m.framePending = true;
      } catch (e) {
        console.error("[broadcastRaw] " + e.message);
      }
    }
  }
}

function seatState(room) {
  const members = [];
  for (const m of room.members.values()) {
    members.push({
      id: m.id,
      name: m.name,
      seat: m.seat,
      rtcCapable: !!m.rtcCapable,
      streamTransport: m.streamTransport || "ws"
    });
  }
  const mouseOwnerName = room.hostId
    ? (room.members.get(room.hostId) || {}).name || null
    : null;
  return {
    t: "state",
    gameId: room.gameId,
    room: room.name,
    members,
    seats: { ...room.seats },
    mouseOwner: room.hostId,
    mouseOwnerName,
    hostId: room.hostId
  };
}

function resetStreamTransports(room) {
  for (const member of room.members.values()) member.streamTransport = "ws";
}

function pushState(room) {
  broadcast(room, seatState(room));
}

function releaseSeat(room, memberId, announce) {
  const member = room.members.get(memberId);
  if (!member) return;
  const seat = member.seat;
  if (seat != null) {
    if (room.seats[seat] === memberId) room.seats[seat] = null;
    member.seat = null;
    const host = room.members.get(room.hostId);
    if (host) sendTo(host.ws, { t: "clearKeys", seat });
  }
  if (room.mouseOwner === memberId) {
    room.mouseOwner = null;
    broadcast(room, { t: "mouseOwner", id: null, name: null });
  }
  if (announce) broadcast(room, { t: "sys", name: member.name, action: "leave" });
}

function removeMember(room, memberId, announce) {
  const member = room.members.get(memberId);
  if (!member) return;
  const wasHost = room.hostId === memberId;
  if (member._disconnectTimer) clearTimeout(member._disconnectTimer);
  releaseSeat(room, memberId, announce);
  room.members.delete(memberId);
  if (wasHost) {
    room.hostId = null;
    resetStreamTransports(room);
    broadcast(room, { t: "sys", name: member.name, action: "hostLeft" });
    transferHost(room);
  }
  pushState(room);
  scheduleRoomCleanup(room);
}

function scheduleDisconnect(member, ws) {
  if (!member || member.ws !== ws) return;
  member.ws = null;
  if (member._disconnectTimer) clearTimeout(member._disconnectTimer);
  member._disconnectTimer = setTimeout(() => {
    member._disconnectTimer = null;
    if (!member.ws) removeMember(member.room, member.id, false);
  }, DISCONNECT_GRACE_MS);
  member._disconnectTimer.unref();
}

const server = http.createServer((req, res) => {
  let urlPath = "/";
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://local").pathname);
  } catch (e) {
    urlPath = "/";
  }
  if (urlPath === "/healthz") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({ status: "ok", rooms: rooms.size }));
    return;
  }
  if (urlPath === "/mochibot.swf") {
    res.writeHead(200, {
      "Content-Type": "application/x-shockwave-flash",
      "Content-Length": MOCHIBOT_SWF.length,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(MOCHIBOT_SWF);
    return;
  }
  if (urlPath === "/") urlPath = "/public/index.html";
  if (urlPath === "/games.json") urlPath = "/public/games.json";
  let filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("forbidden");
    return;
  }
  serveFile(filePath, res, () => {
    const alt = path.normalize(path.join(ROOT, "public", urlPath));
    if (alt !== filePath && alt.startsWith(path.join(ROOT, "public"))) {
      serveFile(alt, res, () => {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 not found");
      });
    } else {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 not found");
    }
  });
});

function serveFile(filePath, res, onNotFound) {
  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) filePath = path.join(filePath, "index.html");
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        onNotFound();
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-cache"
      });
      res.end(data);
    });
  });
}

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const connectionId = crypto.randomUUID();
  let member = null;

  ws.on("message", (raw, isBinary) => {
    if (isBinary) {
      // 游戏画面帧：仅房主可发，转发给房间里其他所有成员
      if (member && member.ws === ws && member.room.hostId === member.id) {
        broadcastRaw(member.room, raw, member.id);
      }
      return;
    }
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    if (member && member.ws !== ws) return;

    switch (msg.t) {
      case "join": {
        if (member) {
          if (
            member.room.gameId === msg.gameId &&
            member.room.name === (typeof msg.room === "string" && msg.room ? msg.room.slice(0, 20) : "lobby")
          ) {
            member.name = sanitizeName(msg.name);
            member.rtcCapable = msg.rtcCapable === true;
            sendTo(ws, {
              t: "welcome",
              id: member.id,
              name: member.name,
              gameId: member.room.gameId,
              hostId: member.room.hostId
            });
            pushState(member.room);
            break;
          }
          removeMember(member.room, member.id, true);
          member = null;
        }
        if (!gameMap.has(msg.gameId)) {
          sendTo(ws, { t: "err", msg: "未知游戏" });
          return;
        }
        const room = getRoom(
          msg.gameId,
          typeof msg.room === "string" && msg.room ? msg.room.slice(0, 20) : "lobby"
        );
        const memberId = sanitizeSessionId(msg.session) || connectionId;
        const resumed = room.members.get(memberId);
        if (resumed) {
          const oldWs = resumed.ws;
          if (resumed._disconnectTimer) clearTimeout(resumed._disconnectTimer);
          resumed._disconnectTimer = null;
          resumed.name = sanitizeName(msg.name);
          resumed.rtcCapable = msg.rtcCapable === true;
          resumed.ws = ws;
          resumed.streamTransport = "ws";
          resumed.framePending = false;
          member = resumed;
          if (oldWs && oldWs !== ws && oldWs.readyState < 2) oldWs.close(4001, "session resumed");
        } else {
          member = {
            id: memberId,
            name: sanitizeName(msg.name),
            seat: null,
            rtcCapable: msg.rtcCapable === true,
            streamTransport: "ws",
            framePending: false,
            ws,
            room
          };
          room.members.set(memberId, member);
        }
        if (room.hostId == null) {
          room.hostId = member.id;
          broadcast(room, { t: "sys", name: member.name, action: "host" });
        }
        sendTo(ws, {
          t: "welcome",
          id: member.id,
          name: member.name,
          gameId: room.gameId,
          hostId: room.hostId
        });
        broadcast(room, { t: "sys", name: member.name, action: resumed ? "reconnect" : "join" });
        pushState(room);
        break;
      }

      case "becomeHost": {
        if (!member) return;
        const room = member.room;
        if (room.hostId != null) {
          sendTo(ws, { t: "err", msg: "房间已有房主" });
          return;
        }
        room.hostId = member.id;
        resetStreamTransports(room);
        broadcast(room, { t: "sys", name: member.name, action: "host" });
        for (const s of [1, 2]) {
          if (room.seats[s] != null) sendTo(ws, { t: "clearKeys", seat: s });
        }
        pushState(room);
        break;
      }

      case "sit": {
        if (!member) return;
        const seat = msg.seat;
        if (seat !== 1 && seat !== 2) return;
        const room = member.room;
        if (member.seat === seat) return;
        if (room.seats[seat] != null) {
          sendTo(ws, { t: "err", msg: "该座位已被占" });
          return;
        }
        if (member.seat != null) releaseSeat(room, member.id, false);
        room.seats[seat] = member.id;
        member.seat = seat;
        broadcast(room, { t: "sys", name: member.name, action: "sit", seat });
        pushState(room);
        break;
      }

      case "leave": {
        // 真正离开房间：释放座位 + 移除成员
        if (!member) return;
        const room = member.room;
        removeMember(room, member.id, true);
        member = null;
        break;
      }

      case "leaveSeat": {
        // 仅离座（回到观战），不离开房间
        if (!member) return;
        releaseSeat(member.room, member.id, false);
        pushState(member.room);
        break;
      }

      case "streamTransport": {
        if (!member || member.id === member.room.hostId) return;
        const transport = msg.transport === "webrtc" ? "webrtc" : "ws";
        if (member.streamTransport !== transport) {
          member.streamTransport = transport;
          member.framePending = false;
          pushState(member.room);
        }
        break;
      }

      case "frameAck": {
        if (!member || member.id === member.room.hostId) return;
        member.framePending = false;
        break;
      }

      case "signal": {
        if (!member || typeof msg.to !== "string") return;
        const room = member.room;
        const target = room.members.get(msg.to);
        if (!target || target.id === member.id) return;
        if (member.id !== room.hostId && target.id !== room.hostId) return;
        const hostSending = member.id === room.hostId;
        const allowedKind = hostSending
          ? msg.kind === "offer" || msg.kind === "ice"
          : msg.kind === "answer" || msg.kind === "ice";
        if (!allowedKind || !validSignalData(msg.kind, msg.data)) return;
        sendTo(target.ws, {
          t: "signal",
          from: member.id,
          kind: msg.kind,
          data: msg.data
        });
        break;
      }

      case "in": {
        if (!member || member.seat == null) return;
        const room = member.room;
        if (room.hostId == null) return;
        if (msg.kind === "key") {
          const allowed = gameMap.get(room.gameId) ? gameMap.get(room.gameId)[member.seat] : null;
          if (!allowed || typeof msg.code !== "string" || !allowed.has(msg.code)) return;
          if (msg.type !== "keydown" && msg.type !== "keyup") return;
          const host = room.members.get(room.hostId);
          if (host) {
            sendTo(host.ws, {
              t: "in",
              from: member.id,
              kind: "key",
              type: msg.type,
              code: msg.code,
              key: msg.key,
              keyCode: msg.keyCode,
              repeat: !!msg.repeat
            });
          }
        } else if (msg.kind === "mouse") {
          // 鼠标控制权固定为房主：远端玩家不能竞争鼠标
          if (member.id !== room.hostId) return;
          if (
            msg.type !== "pointermove" &&
            msg.type !== "pointerdown" &&
            msg.type !== "pointerup"
          )
            return;
          const x = Math.min(1, Math.max(0, Number(msg.x) || 0));
          const y = Math.min(1, Math.max(0, Number(msg.y) || 0));
          const host = room.members.get(room.hostId);
          if (host) {
            sendTo(host.ws, {
              t: "in",
              from: member.id,
              kind: "mouse",
              type: msg.type,
              x,
              y,
              button: msg.button,
              buttons: msg.buttons
            });
          }
        }
        break;
      }
    }
  });

  ws.on("close", () => {
    if (member) {
      scheduleDisconnect(member, ws);
      member = null;
    }
  });

  ws.on("error", () => {});
});

setInterval(() => {
  for (const room of rooms.values()) {
    for (const m of room.members.values()) {
      if (m.ws && m.ws.readyState === 1) m.ws.ping();
    }
  }
}, 30000).unref();

server.listen(PORT, () => {
  console.log("ArcadeOnline server: http://localhost:" + PORT);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[shutdown] " + signal);
  for (const client of wss.clients) client.close(1001, "server shutdown");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (e) => {
  console.error("[uncaughtException] " + (e && e.stack ? e.stack : e));
});
process.on("unhandledRejection", (e) => {
  console.error("[unhandledRejection] " + (e && e.stack ? e.stack : e));
});
