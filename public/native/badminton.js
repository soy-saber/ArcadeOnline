"use strict";
(() => {
  // src/badminton/core.ts
  var HZ = 35;
  var STEP_MS = 1e3 / HZ;
  var WIDTH = 550;
  var HEIGHT = 400;
  var GROUND = 335;
  var NET_X = 275;
  var NET_TOP = 235;
  var TARGET = 7;
  var EMPTY_INPUT = { seq: 0, left: false, right: false, jump: 0, hit: 0 };
  var clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  function createGame(round, playing) {
    const players = [
      { x: 125, y: GROUND, vy: 0, swing: 0, lastJump: 0, lastHit: 0, facing: 1 },
      { x: 425, y: GROUND, vy: 0, swing: 0, lastJump: 0, lastHit: 0, facing: -1 }
    ];
    return {
      round,
      tick: 0,
      phase: playing ? "playing" : "waiting",
      rally: "serve",
      serve: 1,
      winner: 0,
      score: [0, 0],
      players,
      birdie: { x: 155, y: GROUND - 69, vx: 0, vy: 0, lastHitter: 0 },
      ack: [0, 0],
      inputs: [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }],
      pointTicks: 0,
      lastPoint: 0
    };
  }
  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }
  function validInput(input) {
    if (!input || typeof input !== "object") return false;
    const item = input;
    return Number.isSafeInteger(item.seq) && item.seq >= 0 && item.seq < 1e9 && Number.isSafeInteger(item.jump) && item.jump >= 0 && item.jump < 1e9 && Number.isSafeInteger(item.hit) && item.hit >= 0 && item.hit < 1e9 && typeof item.left === "boolean" && typeof item.right === "boolean";
  }
  function validState(value) {
    if (!value || typeof value !== "object") return false;
    const s = value;
    const finite = (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e15;
    return finite(s.round) && finite(s.tick) && ["waiting", "playing", "finished"].includes(s.phase) && ["serve", "flight", "point"].includes(s.rally) && [1, 2].includes(s.serve) && [0, 1, 2].includes(s.winner) && [0, 1, 2].includes(s.lastPoint) && finite(s.pointTicks) && Array.isArray(s.score) && s.score.length === 2 && s.score.every((n) => finite(n) && n >= 0 && n <= TARGET) && Array.isArray(s.players) && s.players.length === 2 && s.players.every((p) => p && [p.x, p.y, p.vy, p.swing, p.lastJump, p.lastHit, p.facing].every(finite)) && !!s.birdie && [s.birdie.x, s.birdie.y, s.birdie.vx, s.birdie.vy, s.birdie.lastHitter].every(finite) && Array.isArray(s.ack) && s.ack.length === 2 && s.ack.every(finite) && Array.isArray(s.inputs) && s.inputs.length === 2 && s.inputs.every(validInput);
  }
  function beginServe(state) {
    state.rally = "serve";
    state.birdie = {
      x: state.players[state.serve - 1].x + (state.serve === 1 ? 28 : -28),
      y: state.players[state.serve - 1].y - 69,
      vx: 0,
      vy: 0,
      lastHitter: 0
    };
    state.players.forEach((p) => {
      p.swing = 0;
    });
  }
  function award(state, player) {
    if (state.rally !== "flight") return;
    state.score[player - 1]++;
    state.lastPoint = player;
    state.serve = player;
    state.rally = "point";
    state.pointTicks = Math.round(HZ * 1.5);
    if (state.score[player - 1] >= TARGET) {
      state.winner = player;
      state.phase = "finished";
    }
  }
  function step(state, incoming) {
    if (state.phase !== "playing") return;
    state.tick++;
    for (let i = 0; i < 2; i++) {
      const input = validInput(incoming[i]) ? incoming[i] : EMPTY_INPUT;
      const player = state.players[i];
      const current = state.inputs[i];
      if (input.seq >= current.seq) {
        state.inputs[i] = { ...input };
        state.ack[i] = input.seq;
      }
      const held = state.inputs[i];
      const speed = (Number(held.right) - Number(held.left)) * 5.9;
      if (speed) player.facing = speed > 0 ? 1 : -1;
      player.x = clamp(player.x + speed, i === 0 ? 22 : NET_X + 22, i === 0 ? NET_X - 22 : WIDTH - 22);
      const serving = state.rally === "serve" && state.serve === i + 1;
      if (held.jump > player.lastJump) {
        player.lastJump = held.jump;
        if (!serving && player.y >= GROUND) player.vy = -12;
      }
      player.y = Math.min(GROUND, player.y + player.vy);
      if (player.y >= GROUND) player.vy = 0;
      else player.vy += 1;
      if (player.swing > 0) player.swing--;
      if (held.hit > player.lastHit) {
        player.lastHit = held.hit;
        if (serving) {
          state.rally = "flight";
          state.birdie = {
            x: player.x + (i === 0 ? 28 : -28),
            y: player.y - 69,
            vx: i === 0 ? 10.5 : -10.5,
            vy: -12.5,
            lastHitter: i + 1
          };
          player.swing = 9;
        } else if (state.rally === "flight" && player.swing === 0) player.swing = 9;
      }
    }
    const bird = state.birdie;
    if (state.rally === "serve") {
      const player = state.players[state.serve - 1];
      bird.x = player.x + (state.serve === 1 ? 28 : -28);
      bird.y = player.y - 69;
    } else if (state.rally === "point") {
      if (--state.pointTicks <= 0) beginServe(state);
    } else if (state.rally === "flight") {
      for (let i = 0; i < 2; i++) {
        const player = state.players[i];
        if (player.swing <= 0 || bird.lastHitter === i + 1) continue;
        const racketX = player.x + (i === 0 ? 29 : -29);
        const racketY = player.y - 63;
        if (Math.hypot(bird.x - racketX, bird.y - racketY) < 61) {
          const dir = i === 0 ? 1 : -1;
          const reach = clamp((racketY - bird.y) / 75, -1, 1);
          bird.vx = dir * (11.5 + Math.abs(reach) * 2.5);
          bird.vy = clamp(-11 - reach * 4, -17, -7);
          bird.lastHitter = i + 1;
          player.swing = 0;
          break;
        }
      }
      const oldX = bird.x;
      bird.x += bird.vx;
      bird.y += bird.vy;
      bird.vy = bird.vy * 0.925 + 0.925;
      bird.vx *= 0.995;
      if (bird.x < 8 || bird.x > WIDTH - 8) {
        bird.x = clamp(bird.x, 8, WIDTH - 8);
        bird.vx *= -0.65;
      }
      if ((oldX - NET_X) * (bird.x - NET_X) <= 0 && bird.y > NET_TOP) {
        bird.x = oldX < NET_X ? NET_X - 7 : NET_X + 7;
        bird.vx *= -0.35;
      }
      if (bird.y >= GROUND - 7) {
        bird.y = GROUND - 7;
        award(state, bird.x < NET_X ? 2 : 1);
      }
    }
  }
  function reconcile(snapshot, seat, pending) {
    const next = cloneState(snapshot);
    const remaining = pending.filter((input) => input.seq > snapshot.ack[seat - 1]).slice(-HZ * 2);
    for (const input of remaining) {
      const player = next.players[seat - 1];
      player.x = clamp(
        player.x + (Number(input.right) - Number(input.left)) * 5.9,
        seat === 1 ? 22 : NET_X + 22,
        seat === 1 ? NET_X - 22 : WIDTH - 22
      );
    }
    return { state: next, pending: remaining };
  }

  // src/native/network.ts
  var Network = class {
    constructor(name, session, roomName, gameId = "3881-native", turnOnly = false) {
      this.name = name;
      this.session = session;
      this.roomName = roomName;
      this.gameId = gameId;
      this.turnOnly = turnOnly;
      this.id = "";
      this.connected = false;
      this.room = { t: "state", gameId: "3881-native", room: "", hostId: null, seats: { 1: null, 2: null, 3: null, 4: null }, members: [] };
      this.rtt = /* @__PURE__ */ new Map();
      this.lastTransport = /* @__PURE__ */ new Map();
      this.sentBytes = 0;
      this.receivedBytes = 0;
      this.delayMs = 0;
      this.lossRate = 0;
      this.forceRelay = false;
      this.onRoom = () => {
      };
      this.onPacket = () => {
      };
      this.onStatus = () => {
      };
      this.ws = null;
      this.peers = /* @__PURE__ */ new Map();
      this.early = /* @__PURE__ */ new Map();
      this.nextAttempt = /* @__PURE__ */ new Map();
      this.iceServers = [{ urls: "stun:stun.cloudflare.com:3478" }];
      this.stopped = false;
      this.nextIceRefresh = 0;
      this.room.gameId = gameId;
      this.interval = window.setInterval(() => {
        if (!this.connected) return;
        if (performance.now() >= this.nextIceRefresh) void this.refreshIce();
        this.syncPeers();
        for (const member of this.room.members) if (member.id !== this.id && (this.isHost || member.id === this.room.hostId)) {
          this.send(member.id, { type: "ping", at: performance.now() });
        }
      }, 1e3);
    }
    get isHost() {
      return this.id !== "" && this.room.hostId === this.id;
    }
    get seat() {
      return this.room.members.find((member) => member.id === this.id)?.seat ?? null;
    }
    async start() {
      await this.refreshIce();
      this.connect();
    }
    async refreshIce() {
      this.nextIceRefresh = performance.now() + 6e4;
      try {
        const response = await fetch("/rtc-config", { signal: AbortSignal.timeout(2500) });
        const config = await response.json();
        if (Array.isArray(config.iceServers)) {
          this.iceServers = config.iceServers;
          this.nextIceRefresh = performance.now() + 20 * 60 * 1e3;
          for (const peer of this.peers.values()) peer.pc.setConfiguration({ iceServers: this.iceServers, iceTransportPolicy: this.turnOnly ? "relay" : "all" });
        }
      } catch {
      }
    }
    connect() {
      if (this.stopped) return;
      const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host);
      this.ws = ws;
      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.connected = true;
        this.control({ t: "join", gameId: this.gameId, room: this.roomName, name: this.name, session: this.session, rtcCapable: true });
        this.onStatus("\u5DF2\u8FDE\u63A5");
      };
      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const message = JSON.parse(event.data);
          if (message.t === "welcome") this.id = message.id;
          if (message.t === "state") {
            const previousHost = this.room.hostId;
            this.room = message;
            if (previousHost !== message.hostId) this.closePeers();
            this.onRoom(message);
            this.syncPeers();
          }
          if (message.t === "signal") void this.signal(message.from, message.kind, message.data);
          if (message.t === "native") this.receive(message.from, message.data, "relay");
          if (message.t === "err") this.onStatus(message.msg);
        } catch {
        }
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.connected = false;
        this.closePeers();
        this.onStatus("\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u91CD\u8FDE");
        if (!this.stopped) window.setTimeout(() => this.connect(), 1500);
      };
      ws.onerror = () => {
      };
    }
    control(message) {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
    }
    transport(to) {
      if (!this.forceRelay && this.peers.get(to)?.channel?.readyState === "open") return "p2p";
      return "relay";
    }
    send(to, packet) {
      if (!this.connected || to === this.id) return;
      if (this.lossRate > 0 && Math.random() < this.lossRate) return;
      const text = JSON.stringify(packet);
      const transmit = () => {
        if (!this.connected || !this.room.members.some((member) => member.id === to)) return;
        const channel = this.peers.get(to)?.channel;
        try {
          if (!this.forceRelay && channel?.readyState === "open" && channel.bufferedAmount < 64 * 1024) {
            channel.send(text);
            this.sentBytes += text.length;
          } else if ((!channel || channel.readyState !== "open" || this.forceRelay) && (this.ws?.bufferedAmount || 0) < 128 * 1024) {
            this.control({ t: "native", to, data: JSON.parse(text) });
            this.sentBytes += text.length;
          }
        } catch {
        }
      };
      if (this.delayMs > 0) window.setTimeout(transmit, this.delayMs);
      else transmit();
    }
    receive(from, packet, transport) {
      if (!packet || typeof packet.type !== "string" || !this.room.members.some((member) => member.id === from)) return;
      if (!this.isHost && from !== this.room.hostId) return;
      this.receivedBytes += JSON.stringify(packet).length;
      this.lastTransport.set(from, transport);
      if (packet.type === "ping" && typeof packet.at === "number") {
        this.send(from, { type: "pong", at: packet.at });
      } else if (packet.type === "pong" && typeof packet.at === "number") {
        const elapsed = performance.now() - packet.at;
        if (elapsed >= 0 && elapsed < 1e4) this.rtt.set(from, elapsed);
      } else this.onPacket(from, packet);
    }
    syncPeers() {
      const wanted = new Set(this.room.members.filter((member) => member.id !== this.id && (this.isHost || member.id === this.room.hostId)).map((member) => member.id));
      for (const id of this.peers.keys()) if (!wanted.has(id)) this.closePeer(id);
      if (!this.isHost || typeof RTCPeerConnection !== "function") return;
      for (const id of wanted) if (!this.peers.has(id) && performance.now() >= (this.nextAttempt.get(id) || 0)) {
        const peer = this.createPeer(id);
        if (!peer) continue;
        this.bindChannel(id, peer, peer.pc.createDataChannel("arcade-native-v1", { ordered: false, maxRetransmits: 0 }));
        void peer.pc.createOffer().then((offer) => peer.pc.setLocalDescription(offer)).then(() => {
          if (this.peers.get(id) === peer) this.control({ t: "signal", to: id, kind: "offer", data: peer.pc.localDescription });
        }).catch(() => this.closePeer(id));
      }
    }
    createPeer(id) {
      try {
        const pc = new RTCPeerConnection({ iceServers: this.iceServers, iceTransportPolicy: this.turnOnly ? "relay" : "all" });
        const peer = { pc, channel: null, candidates: this.early.get(id) || [] };
        this.early.delete(id);
        this.peers.set(id, peer);
        pc.onicecandidate = (event) => {
          if (event.candidate) this.control({ t: "signal", to: id, kind: "ice", data: event.candidate.toJSON() });
        };
        pc.ondatachannel = (event) => this.bindChannel(id, peer, event.channel);
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "closed") this.closePeer(id);
          if (pc.connectionState === "disconnected") window.setTimeout(() => {
            if (this.peers.get(id) === peer && pc.connectionState === "disconnected") this.closePeer(id);
          }, 2500);
        };
        window.setTimeout(() => {
          if (this.peers.get(id) === peer && peer.channel?.readyState !== "open") this.closePeer(id);
        }, 12e3);
        return peer;
      } catch {
        this.nextAttempt.set(id, performance.now() + 5e3);
        return null;
      }
    }
    bindChannel(id, peer, channel) {
      if (channel.label !== "arcade-native-v1") {
        channel.close();
        return;
      }
      peer.channel = channel;
      channel.onmessage = (event) => {
        if (this.peers.get(id) !== peer || typeof event.data !== "string" || event.data.length > 64 * 1024) return;
        try {
          this.receive(id, JSON.parse(event.data), "p2p");
        } catch {
        }
      };
      channel.onclose = () => {
        if (this.peers.get(id) === peer) this.closePeer(id);
      };
      channel.onerror = () => {
      };
    }
    async signal(from, kind, data) {
      if (!this.room.members.some((member) => member.id === from)) return;
      if (!this.isHost && from !== this.room.hostId) return;
      try {
        let peer = this.peers.get(from);
        if (kind === "offer" && !this.isHost) {
          this.closePeer(from);
          peer = this.createPeer(from) || void 0;
          if (!peer) return;
          await peer.pc.setRemoteDescription(data);
          await peer.pc.setLocalDescription(await peer.pc.createAnswer());
          this.control({ t: "signal", to: from, kind: "answer", data: peer.pc.localDescription });
        } else if (kind === "answer" && this.isHost && peer) await peer.pc.setRemoteDescription(data);
        else if (kind === "ice") {
          if (peer?.pc.remoteDescription) await peer.pc.addIceCandidate(data);
          else if (peer) peer.candidates.push(data);
          else {
            const pending = this.early.get(from) || [];
            if (pending.length < 64) pending.push(data);
            this.early.set(from, pending);
          }
        }
        if (peer?.pc.remoteDescription) for (const candidate of peer.candidates.splice(0)) await peer.pc.addIceCandidate(candidate);
      } catch {
        this.closePeer(from);
      }
    }
    closePeer(id) {
      const peer = this.peers.get(id);
      this.peers.delete(id);
      this.nextAttempt.set(id, performance.now() + 1500);
      if (peer) {
        peer.pc.onconnectionstatechange = null;
        if (peer.channel) peer.channel.onclose = null;
        peer.pc.close();
      }
    }
    closePeers() {
      for (const id of this.peers.keys()) this.closePeer(id);
      this.early.clear();
      this.rtt.clear();
      this.lastTransport.clear();
    }
    stop(leave = true) {
      this.stopped = true;
      if (leave) this.control({ t: "leave" });
      window.clearInterval(this.interval);
      this.closePeers();
      this.ws?.close();
    }
  };

  // src/badminton/view.ts
  var BadmintonView = class {
    constructor(canvas) {
      this.canvas = canvas;
      this.lastFrame = 0;
      this.frames = 0;
      this.fpsAt = performance.now();
      this.fps = 0;
      canvas.width = WIDTH * 2;
      canvas.height = HEIGHT * 2;
      this.ctx = canvas.getContext("2d");
    }
    render(state, seat) {
      const ctx = this.ctx;
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      sky.addColorStop(0, "#9ccedb");
      sky.addColorStop(0.72, "#e8dfbf");
      sky.addColorStop(1, "#d5ae78");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#789b88";
      ctx.fillRect(0, 255, WIDTH, 30);
      for (let x = 0; x < WIDTH; x += 38) {
        ctx.fillStyle = x % 76 ? "#77907f" : "#6d8878";
        ctx.beginPath();
        ctx.arc(x, 258, 18, Math.PI, 0);
        ctx.fill();
      }
      ctx.fillStyle = "#d8ad76";
      ctx.fillRect(0, 282, WIDTH, HEIGHT - 282);
      ctx.fillStyle = "#c89862";
      ctx.fillRect(0, GROUND + 2, WIDTH, 65);
      ctx.strokeStyle = "#fff1c9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12, GROUND + 1);
      ctx.lineTo(WIDTH - 12, GROUND + 1);
      ctx.moveTo(27, GROUND + 17);
      ctx.lineTo(WIDTH - 27, GROUND + 17);
      ctx.moveTo(NET_X, GROUND + 1);
      ctx.lineTo(NET_X, GROUND + 28);
      ctx.stroke();
      ctx.fillStyle = "#344d48";
      ctx.fillRect(NET_X - 3, NET_TOP, 6, GROUND - NET_TOP);
      ctx.strokeStyle = "#e9e4d0";
      ctx.lineWidth = 1;
      for (let y = NET_TOP + 9; y < GROUND; y += 10) {
        ctx.beginPath();
        ctx.moveTo(NET_X - 12, y);
        ctx.lineTo(NET_X + 12, y);
        ctx.stroke();
      }
      ctx.fillStyle = "#f6ebcf";
      ctx.fillRect(NET_X - 13, NET_TOP - 3, 26, 4);
      if (state) {
        state.players.forEach((p, i) => this.player(p.x, p.y, i === 0 ? "#263a46" : "#8f4a39", p.swing, i === 0 ? 1 : -1, state.tick));
        const b = state.birdie;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
        ctx.fillStyle = "#f9f5e6";
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(-6, 3);
        ctx.lineTo(6, 3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#e2b94f";
        ctx.beginPath();
        ctx.arc(0, 5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.textAlign = "center";
        ctx.font = "bold 18px system-ui";
        ctx.fillStyle = "#263b3c";
        ctx.fillText(`${state.score[0]}  :  ${state.score[1]}`, NET_X, 38);
        ctx.font = "12px system-ui";
        ctx.fillText(`P1${seat === 1 ? " \xB7 \u4F60" : ""}`, 105, 40);
        ctx.fillText(`P2${seat === 2 ? " \xB7 \u4F60" : ""}`, 445, 40);
        if (state.phase === "waiting") this.banner("\u53CC\u65B9\u5165\u5EA7\u5E76\u51C6\u5907\u540E\u5F00\u59CB");
        else if (state.phase === "finished") this.banner(`P${state.winner} \u83B7\u80DC \xB7 \u70B9\u51FB\u51C6\u5907\u518D\u6765\u4E00\u5C40`);
        else if (state.rally === "serve") this.banner(`P${state.serve} \u53D1\u7403 \xB7 \u6309 S / \u2193`);
        else if (state.rally === "point") this.banner(`P${state.lastPoint} \u5F97\u5206`);
      } else this.banner("\u6B63\u5728\u8FDE\u63A5\u623F\u95F4\u2026");
      this.frames++;
      const now = performance.now();
      if (now - this.fpsAt >= 1e3) {
        this.fps = Math.round(this.frames * 1e3 / (now - this.fpsAt));
        this.frames = 0;
        this.fpsAt = now;
      }
      this.lastFrame = now;
    }
    player(x, y, color, swing, dir, tick) {
      const ctx = this.ctx;
      const moving = Math.sin(tick * 0.5) * 3;
      ctx.strokeStyle = "#382d27";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y - 32);
      ctx.lineTo(x - 8, y - 15);
      ctx.lineTo(x - 11 + moving, y);
      ctx.moveTo(x - 8, y - 15);
      ctx.lineTo(x + 8, y - 15);
      ctx.lineTo(x + 13 - moving, y);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(x, y - 55);
      ctx.lineTo(x - 8, y - 15);
      ctx.stroke();
      ctx.fillStyle = "#efc9a1";
      ctx.beginPath();
      ctx.arc(x, y - 67, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#382d27";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - 2, y - 46);
      ctx.lineTo(x + dir * 15, y - 42);
      ctx.lineTo(x + dir * 23, swing ? y - 66 : y - 36);
      ctx.stroke();
      ctx.strokeStyle = "#6a503a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + dir * 23, swing ? y - 66 : y - 36);
      ctx.lineTo(x + dir * 31, swing ? y - 87 : y - 69);
      ctx.stroke();
      ctx.save();
      ctx.translate(x + dir * 34, swing ? y - 92 : y - 77);
      ctx.rotate(dir * 0.35);
      ctx.strokeStyle = "#eee2c6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 17, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 0.7;
      for (let k = -5; k <= 5; k += 5) {
        ctx.beginPath();
        ctx.moveTo(k, -14);
        ctx.lineTo(k, 14);
        ctx.stroke();
      }
      ctx.restore();
    }
    banner(message) {
      const ctx = this.ctx;
      ctx.fillStyle = "#213b3bdc";
      ctx.fillRect(90, 70, 370, 44);
      ctx.fillStyle = "#fff4d8";
      ctx.textAlign = "center";
      ctx.font = "bold 17px system-ui";
      ctx.fillText(message, NET_X, 98);
    }
  };

  // src/badminton/main.ts
  var params = new URLSearchParams(location.search);
  if (ensureName()) start();
  function start() {
    const el = (id) => document.getElementById(id);
    const roomName = (params.get("room") || "lobby").slice(0, 20);
    const net = new Network(arcadeName(), arcadeSession(), roomName, "46923-native", params.get("turn") === "1");
    const view = new BadmintonView(el("game-canvas"));
    let soundEnabled = localStorage.getItem("arcade_native_sound") !== "off";
    let volume = Math.max(0, Math.min(100, Number(localStorage.getItem("arcade_native_volume") ?? "24"))) / 100;
    if (!Number.isFinite(volume)) volume = 0.24;
    const sounds = { whoosh: "/native/assets/badminton-whoosh.mp3", hit: "/native/assets/badminton-hit.mp3", score: "/native/assets/badminton-score.mp3", cheer: "/native/assets/badminton-cheer.mp3" };
    function playSound(name) {
      if (!soundEnabled || volume <= 0) return;
      const audio = new Audio(sounds[name]);
      audio.volume = volume;
      void audio.play().catch(() => {
      });
    }
    let heard = null;
    function soundEvents(current) {
      if (!current) return;
      const next = { round: current.round, score: current.score.join(":"), hitter: current.birdie.lastHitter, winner: current.winner };
      if (heard?.round === current.round) {
        if (next.score !== heard.score) playSound("score");
        else if (next.hitter !== heard.hitter && next.hitter) playSound("hit");
        if (next.winner && next.winner !== heard.winner) playSound("cheer");
      }
      heard = next;
    }
    let state = null, authority = null;
    let pending = [], sequence = 0, jumpCount = 0, hitCount = 0, lastHitTick = 0;
    let seat = null, hostId = null, roster = "";
    let lastSnapshotAt = 0, frame = 0, correctionCount = 0;
    const keys = /* @__PURE__ */ new Set();
    const remote = /* @__PURE__ */ new Map();
    const directions = { KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", KeyW: "jump", ArrowUp: "jump", KeyS: "hit", ArrowDown: "hit" };
    el("room-name").textContent = roomName;
    el("my-name").textContent = arcadeName();
    localStorage.setItem("arcade_recent_game", "46923-native");
    function notice(message) {
      el("connection-note").textContent = message;
    }
    function resetInput() {
      keys.clear();
      remote.clear();
      pending = [];
      sequence = 0;
      jumpCount = 0;
      hitCount = 0;
      lastHitTick = 0;
    }
    function broadcast() {
      if (!authority || !net.isHost) return;
      for (const member of net.room.members) if (member.id !== net.id) net.send(member.id, { type: "snapshot", state: authority });
    }
    function newRound(playing) {
      authority = createGame(Math.max(Date.now(), (authority?.round || 0) + 1), playing);
      state = authority;
      resetInput();
      broadcast();
      if (playing) {
        net.control({ t: "resetReady" });
        notice("\u6BD4\u8D5B\u5F00\u59CB");
      }
    }
    net.onStatus = (message) => {
      notice(message);
      if (!net.connected) keys.clear();
      updateUi();
    };
    net.onRoom = (room) => {
      const changedHost = hostId !== room.hostId;
      const nextRoster = JSON.stringify(room.seats);
      const changedRoster = roster !== nextRoster;
      hostId = room.hostId;
      roster = nextRoster;
      if (seat !== net.seat || changedHost) resetInput();
      seat = net.seat;
      if (net.isHost && (changedHost || changedRoster || !authority)) {
        newRound(false);
        notice("\u53CC\u4EBA\u5165\u5EA7\u5E76\u51C6\u5907\u5373\u53EF\u5F00\u59CB");
      } else if (!net.isHost && changedHost) {
        state = null;
        authority = null;
        lastSnapshotAt = 0;
        notice("\u6B63\u5728\u540C\u6B65\u623F\u95F4");
      }
      const players = room.members.filter((member) => member.seat != null);
      if (net.isHost && !changedRoster && authority?.phase !== "playing" && players.length === 2 && players.every((member) => member.ready)) newRound(true);
      updateUi();
    };
    net.onPacket = (from, packet) => {
      if (packet.type === "input" && net.isHost && authority && packet.round === authority.round && validInput(packet.input)) {
        const member = net.room.members.find((item) => item.id === from);
        if (!member?.seat || member.seat > 2) return;
        const previous = remote.get(from);
        if (packet.input.seq > (previous?.input.seq || 0)) remote.set(from, { input: packet.input, at: performance.now() });
      }
      if (packet.type === "snapshot" && !net.isHost && from === net.room.hostId && validState(packet.state)) {
        const snapshot = packet.state;
        if (authority && (snapshot.round < authority.round || snapshot.round === authority.round && snapshot.tick < authority.tick)) return;
        const newGame = !authority || snapshot.round !== authority.round;
        const before = seat && state ? state.players[seat - 1].x : null;
        if (newGame) resetInput();
        authority = snapshot;
        lastSnapshotAt = performance.now();
        if (seat) {
          sequence = Math.max(sequence, snapshot.ack[seat - 1]);
          jumpCount = Math.max(jumpCount, snapshot.players[seat - 1].lastJump);
          hitCount = Math.max(hitCount, snapshot.players[seat - 1].lastHit);
        }
        if (seat && !newGame) {
          const result = reconcile(snapshot, seat, pending);
          state = result.state;
          pending = result.pending;
        } else state = cloneState(snapshot);
        if (before !== null && seat && !newGame && Math.abs(before - state.players[seat - 1].x) > 1) correctionCount++;
        if (newGame) updateUi();
      }
    };
    function currentInput() {
      if ((keys.has("KeyS") || keys.has("ArrowDown")) && frame - lastHitTick >= 12) {
        hitCount++;
        lastHitTick = frame;
      }
      return {
        seq: ++sequence,
        left: keys.has("KeyA") || keys.has("ArrowLeft"),
        right: keys.has("KeyD") || keys.has("ArrowRight"),
        jump: jumpCount,
        hit: hitCount
      };
    }
    function tick() {
      frame++;
      if (!net.connected || !state || !authority) return;
      const input = seat && state.phase === "playing" ? currentInput() : { ...EMPTY_INPUT };
      if (net.isHost) {
        const inputs = [1, 2].map((number) => {
          const id = net.room.seats[number];
          if (id === net.id) return input;
          const item = id ? remote.get(id) : null;
          return item && performance.now() - item.at < 600 ? item.input : { ...item?.input || EMPTY_INPUT, left: false, right: false };
        });
        step(authority, inputs);
        state = authority;
        if (frame % 3 === 0) broadcast();
      } else if (seat && authority.phase === "playing") {
        net.send(net.room.hostId, { type: "input", round: authority.round, input });
        if (performance.now() - lastSnapshotAt < 1800) {
          pending.push(input);
          pending = pending.slice(-HZ * 2);
          const player = state.players[seat - 1];
          player.x = Math.max(seat === 1 ? 22 : 297, Math.min(
            seat === 1 ? 253 : 528,
            player.x + (Number(input.right) - Number(input.left)) * 5.9
          ));
        }
      }
    }
    function key(event, down) {
      if (event.target?.matches("input, textarea, select, button")) return;
      if (!directions[event.code]) return;
      event.preventDefault();
      if (!seat || state?.phase !== "playing") return;
      if (down) {
        if (!keys.has(event.code)) {
          if (directions[event.code] === "jump") jumpCount++;
          if (directions[event.code] === "hit") {
            hitCount++;
            lastHitTick = frame;
            playSound("whoosh");
          }
          keys.add(event.code);
        }
      } else keys.delete(event.code);
    }
    window.addEventListener("keydown", (event) => key(event, true));
    window.addEventListener("keyup", (event) => key(event, false));
    window.addEventListener("blur", () => keys.clear());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) keys.clear();
    });
    for (const button of document.querySelectorAll("[data-key]")) {
      const code = button.dataset.key;
      button.onpointerdown = (event) => {
        if (!seat || state?.phase !== "playing") return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        if (!keys.has(code)) {
          if (directions[code] === "jump") jumpCount++;
          if (directions[code] === "hit") {
            hitCount++;
            lastHitTick = frame;
            playSound("whoosh");
          }
          keys.add(code);
        }
      };
      const release = () => keys.delete(code);
      button.onpointerup = release;
      button.onpointercancel = release;
      button.onlostpointercapture = release;
    }
    for (const button of document.querySelectorAll("[data-seat]")) button.onclick = () => {
      const requested = Number(button.dataset.seat);
      net.control(seat === requested ? { t: "leaveSeat" } : { t: "sit", seat: requested });
      button.blur();
    };
    el("start-game").onclick = () => {
      if (seat && authority?.phase !== "playing") {
        const me = net.room.members.find((member) => member.id === net.id);
        net.control({ t: "ready", ready: !me?.ready });
      }
      el("start-game").blur();
    };
    el("copy-invite").onclick = async () => {
      const invite = new URL(location.href);
      invite.searchParams.delete("debug");
      invite.searchParams.delete("turn");
      try {
        await navigator.clipboard.writeText(invite.href);
        notice("\u9080\u8BF7\u94FE\u63A5\u5DF2\u590D\u5236");
      } catch {
        const field = el("invite-link");
        field.hidden = false;
        field.value = invite.href;
        field.select();
        notice("\u590D\u5236\u4E0B\u65B9\u94FE\u63A5\u9080\u8BF7\u597D\u53CB");
      }
    };
    el("fullscreen-stage").onclick = () => {
      void el("native-stage").requestFullscreen().catch(() => {
      });
    };
    el("leave-room").onclick = (event) => {
      event.preventDefault();
      net.stop();
      location.href = "/";
    };
    const soundToggle = el("sound-toggle"), soundVolume = el("sound-volume");
    const updateSoundUi = () => {
      soundToggle.textContent = soundEnabled ? "\u97F3\u6548\uFF1A\u5F00" : "\u97F3\u6548\uFF1A\u5173";
      soundToggle.setAttribute("aria-pressed", String(soundEnabled));
      soundVolume.value = String(Math.round(volume * 100));
      el("sound-volume-value").textContent = `${soundVolume.value}%`;
    };
    soundToggle.onclick = () => {
      soundEnabled = !soundEnabled;
      localStorage.setItem("arcade_native_sound", soundEnabled ? "on" : "off");
      updateSoundUi();
    };
    soundVolume.oninput = () => {
      volume = Number(soundVolume.value) / 100;
      localStorage.setItem("arcade_native_volume", soundVolume.value);
      updateSoundUi();
    };
    updateSoundUi();
    function updateUi() {
      el("role-status").textContent = seat ? `P${seat} \u73A9\u5BB6` : "\u89C2\u6218";
      el("member-count").textContent = `${net.room.members.length} \u4EBA`;
      el("conn-badge").textContent = net.connected ? "\u5DF2\u8FDE\u63A5" : "\u91CD\u8FDE\u4E2D";
      el("conn-badge").className = `badge ${net.connected ? "ok" : "bad"}`;
      const host = net.room.members.find((member) => member.id === net.room.hostId);
      el("host-line").textContent = net.isHost ? "\u4F60\u662F\u623F\u4E3B" : `\u623F\u4E3B\uFF1A${host?.name || "\u7B49\u5F85\u4E2D"}`;
      for (const number of [1, 2]) {
        const row = el(`seat-${number}`);
        const member = net.room.members.find((item) => item.id === net.room.seats[number]);
        row.querySelector(".who").textContent = member ? `${member.name} \xB7 ${member.ready ? "\u5DF2\u51C6\u5907" : "\u672A\u51C6\u5907"}` : "\u7A7A\u95F2";
        const button2 = row.querySelector("button");
        button2.textContent = seat === number ? "\u79BB\u5EA7" : "\u5165\u5EA7";
        button2.disabled = !!member && member.id !== net.id;
        row.classList.toggle("occupied", !!member);
      }
      el("score-line").textContent = state ? `\u6BD4\u5206 ${state.score[0]} : ${state.score[1]} \xB7 ${state.phase === "finished" ? `P${state.winner} \u83B7\u80DC` : `P${state.serve} \u53D1\u7403`}` : "\u7B49\u5F85\u6BD4\u8D5B";
      const button = el("start-game");
      button.disabled = !net.connected || !seat || authority?.phase === "playing";
      button.textContent = net.room.members.find((member) => member.id === net.id)?.ready ? "\u53D6\u6D88\u51C6\u5907" : "\u51C6\u5907";
      const other = net.isHost ? net.room.members.find((member) => member.id !== net.id && member.seat)?.id : net.room.hostId;
      const transport = other ? net.transport(other) : "waiting";
      el("transport-status").textContent = transport === "p2p" ? "\u5BF9\u7B49\u8FDE\u63A5" : transport === "relay" ? "\u4E2D\u7EE7\u8FDE\u63A5" : "\u7B49\u5F85\u597D\u53CB";
      const rtt = other ? net.rtt.get(other) : void 0;
      el("latency-status").textContent = rtt == null ? "\u2014" : `${Math.round(rtt)} ms`;
      el("render-status").textContent = `${view.fps} FPS`;
      const stale = !net.connected || !net.isHost && !!lastSnapshotAt && performance.now() - lastSnapshotAt > 1800;
      el("connection-overlay").hidden = !stale;
      el("connection-overlay").textContent = "\u8FDE\u63A5\u6062\u590D\u4E2D\uFF0C\u6B63\u5728\u7B49\u5F85\u6700\u65B0\u72B6\u6001\u2026";
    }
    const clockUrl = URL.createObjectURL(new Blob([`setInterval(()=>postMessage(0),${STEP_MS});`], { type: "text/javascript" }));
    const worker = new Worker(clockUrl);
    URL.revokeObjectURL(clockUrl);
    let clockAt = performance.now(), accumulator = 0;
    worker.onmessage = () => {
      const now = performance.now();
      accumulator += Math.min(now - clockAt, STEP_MS * 5);
      clockAt = now;
      while (accumulator >= STEP_MS) {
        tick();
        accumulator -= STEP_MS;
      }
    };
    const render = () => {
      soundEvents(state);
      view.render(state, seat);
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
    window.setInterval(updateUi, 250);
    window.addEventListener("pagehide", () => {
      worker.terminate();
      net.stop(false);
    });
    if (params.get("debug") === "1") Object.assign(window, { __badmintonTest: {
      get state() {
        return state && cloneState(state);
      },
      get authority() {
        return authority && cloneState(authority);
      },
      get seat() {
        return seat;
      },
      get corrections() {
        return correctionCount;
      },
      network: net
    } });
    void net.start();
  }
})();
