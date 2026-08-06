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
      members: new Map()
    };
    rooms.set(key, room);
  }
  return room;
}

function sanitizeName(raw) {
  if (typeof raw !== "string") return "游客";
  let n = raw.replace(/[<>]/g, "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 12);
  if (!n) n = "游客";
  return n;
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const m of room.members.values()) {
    if (m.ws.readyState === 1) m.ws.send(data);
  }
}

function seatState(room) {
  const members = [];
  for (const m of room.members.values()) {
    members.push({ id: m.id, name: m.name, seat: m.seat });
  }
  const mouseOwnerName = room.mouseOwner
    ? (room.members.get(room.mouseOwner) || {}).name || null
    : null;
  return {
    t: "state",
    gameId: room.gameId,
    room: room.name,
    members,
    seats: { ...room.seats },
    mouseOwner: room.mouseOwner,
    mouseOwnerName
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
    broadcast(room, { t: "clearKeys", seat });
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

  ws.on("message", (raw) => {
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
          ws.send(JSON.stringify({ t: "err", msg: "未知游戏" }));
          return;
        }
        const room = getRoom(
          msg.gameId,
          typeof msg.room === "string" && msg.room ? msg.room.slice(0, 20) : "lobby"
        );
        member = { id: clientId, name: sanitizeName(msg.name), seat: null, ws, room };
        room.members.set(clientId, member);
        ws.send(
          JSON.stringify({ t: "welcome", id: clientId, name: member.name, gameId: room.gameId })
        );
        broadcast(room, { t: "sys", name: member.name, action: "join" });
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
          ws.send(JSON.stringify({ t: "err", msg: "该座位已被占" }));
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
        if (!member) return;
        releaseSeat(member.room, clientId, true);
        break;
      }

      case "in": {
        if (!member || member.seat == null) return;
        const room = member.room;
        if (msg.kind === "key") {
          const allowed = gameMap.get(room.gameId) ? gameMap.get(room.gameId)[member.seat] : null;
          if (!allowed || typeof msg.code !== "string" || !allowed.has(msg.code)) return;
          if (msg.type !== "keydown" && msg.type !== "keyup") return;
          broadcast(room, {
            t: "in",
            from: clientId,
            kind: "key",
            type: msg.type,
            code: msg.code,
            key: msg.key,
            keyCode: msg.keyCode,
            repeat: !!msg.repeat
          });
        } else if (msg.kind === "mouse") {
          if (
            msg.type !== "pointermove" &&
            msg.type !== "pointerdown" &&
            msg.type !== "pointerup"
          )
            return;
          const x = Math.min(1, Math.max(0, Number(msg.x) || 0));
          const y = Math.min(1, Math.max(0, Number(msg.y) || 0));
          if (room.mouseOwner !== clientId) {
            room.mouseOwner = clientId;
            broadcast(room, { t: "mouseOwner", id: clientId, name: member.name });
          }
          broadcast(room, {
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
        break;
      }
    }
  });

  ws.on("close", () => {
    if (member) {
      releaseSeat(member.room, clientId, false);
      member.room.members.delete(clientId);
      pushState(member.room);
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
