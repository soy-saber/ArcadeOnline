"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const ROOT = __dirname;
const PORT = process.env.PORT || 8000;

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
    if (m.ws.readyState === 1) {
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
    if (m.id !== exceptId && m.ws.readyState === 1) {
      try {
        m.ws.send(data);
      } catch (e) {
        console.error("[broadcastRaw] " + e.message);
      }
    }
  }
}

function seatState(room) {
  const members = [];
  for (const m of room.members.values()) {
    members.push({ id: m.id, name: m.name, seat: m.seat });
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

function pushState(room) {
  broadcast(room, seatState(room));
}

function releaseSeat(room, clientId, announce) {
  const member = room.members.get(clientId);
  if (!member) return;
  const seat = member.seat;
  if (seat != null) {
    if (room.seats[seat] === clientId) room.seats[seat] = null;
    member.seat = null;
    const host = room.members.get(room.hostId);
    if (host) sendTo(host.ws, { t: "clearKeys", seat });
  }
  if (room.mouseOwner === clientId) {
    room.mouseOwner = null;
    broadcast(room, { t: "mouseOwner", id: null, name: null });
  }
  if (announce) broadcast(room, { t: "sys", name: member.name, action: "leave" });
  pushState(room);
}

const server = http.createServer((req, res) => {
  let urlPath = "/";
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://local").pathname);
  } catch (e) {
    urlPath = "/";
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
  const clientId = crypto.randomUUID();
  let member = null;

  ws.on("message", (raw, isBinary) => {
    if (isBinary) {
      // 游戏画面帧：仅房主可发，转发给房间里其他所有成员
      if (member && member.room.hostId === clientId) {
        broadcastRaw(member.room, raw, clientId);
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

    switch (msg.t) {
      case "join": {
        if (member) {
          releaseSeat(member.room, clientId, true);
          member.room.members.delete(clientId);
          pushState(member.room);
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
        member = { id: clientId, name: sanitizeName(msg.name), seat: null, ws, room };
        room.members.set(clientId, member);
        if (room.hostId == null) {
          room.hostId = clientId;
          broadcast(room, { t: "sys", name: member.name, action: "host" });
        }
        sendTo(ws, {
          t: "welcome",
          id: clientId,
          name: member.name,
          gameId: room.gameId,
          hostId: room.hostId
        });
        broadcast(room, { t: "sys", name: member.name, action: "join" });
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
        room.hostId = clientId;
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
        if (member.seat != null) releaseSeat(room, clientId, false);
        room.seats[seat] = clientId;
        member.seat = seat;
        broadcast(room, { t: "sys", name: member.name, action: "sit", seat });
        pushState(room);
        break;
      }

      case "leave": {
        // 真正离开房间：释放座位 + 移除成员
        if (!member) return;
        const room = member.room;
        releaseSeat(room, clientId, true);
        room.members.delete(clientId);
        pushState(room);
        scheduleRoomCleanup(room);
        member = null;
        break;
      }

      case "leaveSeat": {
        // 仅离座（回到观战），不离开房间
        if (!member) return;
        releaseSeat(member.room, clientId, false);
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
              from: clientId,
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
          if (clientId !== room.hostId) return;
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
              from: clientId,
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
      const room = member.room;
      releaseSeat(room, clientId, false);
      room.members.delete(clientId);
      if (room.hostId === clientId) {
        room.hostId = null;
        broadcast(room, { t: "sys", name: member.name, action: "hostLeft" });
        transferHost(room);
      }
      pushState(room);
      scheduleRoomCleanup(room);
    }
  });

  ws.on("error", () => {});
});

setInterval(() => {
  for (const room of rooms.values()) {
    for (const m of room.members.values()) {
      if (m.ws.readyState === 1) m.ws.ping();
    }
  }
}, 30000).unref();

server.listen(PORT, () => {
  console.log("ArcadeOnline server: http://localhost:" + PORT);
});

process.on("uncaughtException", (e) => {
  console.error("[uncaughtException] " + (e && e.stack ? e.stack : e));
});
process.on("unhandledRejection", (e) => {
  console.error("[unhandledRejection] " + (e && e.stack ? e.stack : e));
});
