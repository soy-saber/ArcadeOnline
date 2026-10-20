"use strict";
(() => {
  // src/badminton/core.ts
  var HZ = 30;
  var STEP_MS = 1e3 / HZ;
  var WIDTH = 550;
  var HEIGHT = 400;
  var GROUND = 376.25;
  var NET_X = 275;
  var NET_TOP = 7093 / 20 - 10.5 * 4.212677;
  var TARGET = 7;
  var LEFT_WALL = 36.5;
  var RIGHT_WALL = 513.5;
  var NET_HALF_WIDTH = 10.5 * 1.5431671;
  var NET_LIMIT_X = 5499 / 20;
  var NET_LIMIT_HALF_WIDTH = 10.5 * 6.177414;
  var NET_LIMIT_TOP = 7032 / 20 - 10.5 * 3.4748993;
  var NET_LIMIT_BOTTOM = 7032 / 20 + 10.5 * 3.4748993;
  var SWING_ROTATION = [0, 0, 18.6, 37.4, 74.9, 93.3, 112.1, 130.9, 149.5, 124.6, 99.6, 74.9, 49.9, 24.8, 0, 0];
  var UNDERHAND_ROTATION = [0, 32.8, 65.7, 98.3, 131.4, 164.2, 196.8, 229.8];
  var P1_TIP = [[-59, -43], [-59, -43], [-43, -57], [-24, -65], [18, -60], [35, -49], [47, -32], [54, -11], [54, 9], [52, -19], [39, -43], [18, -60], [-10, -66], [-37, -60], [-59, -43]];
  var P2_TIP = [[-61, -44], [-61, -44], [-45, -57], [-26, -65], [16, -61], [33, -49], [45, -32], [52, -12], [52, 9], [51, -16], [44, -35], [32, -49], [16, -61], [-8, -67], [-61, -44]];
  var P1_UNDERHAND_TIP = [[-59, -43], [-73, -11], [-67, 30], [-44, 57], [-12, 66], [30, 56], [53, 29], [57, -12]];
  var EMPTY_INPUT = { seq: 0, left: false, right: false, jump: 0, hit: 0 };
  var clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  function createGame(round, playing) {
    const players = [
      { x: 132.85, y: GROUND, vy: 0, swing: 0, servePose: 0, underhand: 0, lastJump: 0, lastHit: 0, facing: 1 },
      { x: 416.85, y: GROUND, vy: 0, swing: 0, servePose: 0, underhand: 0, lastJump: 0, lastHit: 0, facing: -1 }
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
      birdie: { x: 157.85, y: GROUND - 75, vx: 0, vy: 0, lastHitter: 0 },
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
    return finite(s.round) && finite(s.tick) && ["waiting", "playing", "finished"].includes(s.phase) && ["serve", "flight", "point"].includes(s.rally) && [0, 1, 2].includes(s.serve) && [0, 1, 2].includes(s.winner) && [0, 1, 2].includes(s.lastPoint) && finite(s.pointTicks) && Array.isArray(s.score) && s.score.length === 2 && s.score.every((n) => finite(n) && n >= 0 && n <= TARGET) && Array.isArray(s.players) && s.players.length === 2 && s.players.every((p) => p && [p.x, p.y, p.vy, p.swing, p.servePose, p.underhand, p.lastJump, p.lastHit, p.facing].every(finite)) && !!s.birdie && [s.birdie.x, s.birdie.y, s.birdie.vx, s.birdie.vy, s.birdie.lastHitter].every(finite) && Array.isArray(s.ack) && s.ack.length === 2 && s.ack.every(finite) && Array.isArray(s.inputs) && s.inputs.length === 2 && s.inputs.every(validInput);
  }
  function beginServe(state) {
    if (state.lastPoint) state.serve = state.lastPoint;
    state.rally = "serve";
    const server = state.players[state.serve - 1];
    server.x = state.serve === 1 ? Math.min(server.x, NET_LIMIT_X - NET_LIMIT_HALF_WIDTH - 65) : Math.max(server.x, NET_LIMIT_X + NET_LIMIT_HALF_WIDTH + 65);
    state.birdie = {
      x: server.x + (state.serve === 1 ? 25 : -25),
      y: server.y - 75,
      vx: 0,
      vy: 0,
      lastHitter: 0
    };
    state.players.forEach((p) => {
      p.swing = 0;
      p.servePose = 0;
      p.underhand = 0;
    });
  }
  function award(state, player) {
    if (state.rally !== "flight") return;
    state.score[player - 1]++;
    state.lastPoint = player;
    state.rally = "point";
    state.pointTicks = Math.round(HZ * 1.5);
    if (state.score[player - 1] >= TARGET) {
      state.winner = player;
      state.phase = "finished";
    }
  }
  function movePlayer(state, seat, direction) {
    if (!direction) return;
    const player = state.players[seat - 1];
    const towardNet = seat === 1 ? direction > 0 : direction < 0;
    if (towardNet) {
      const reach = state.serve === seat ? seat === 1 ? 65 : -60 : 0;
      const testX = player.x + reach;
      if (player.y >= NET_LIMIT_TOP && player.y <= NET_LIMIT_BOTTOM && testX >= NET_LIMIT_X - NET_LIMIT_HALF_WIDTH && testX <= NET_LIMIT_X + NET_LIMIT_HALF_WIDTH) return;
    }
    player.x = clamp(
      player.x + Math.sign(direction) * 5.9,
      seat === 1 ? LEFT_WALL : NET_X,
      seat === 1 ? NET_X : RIGHT_WALL
    );
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
      player.y = Math.min(GROUND, player.y + player.vy + 1);
      if (player.y >= GROUND) player.vy = 0;
      else player.vy += 1;
      if (player.swing > 0) {
        player.swing--;
        if (player.servePose && player.swing === 2) state.serve = 0;
        if (player.swing === 0) player.servePose = 0;
      }
      const speed = (Number(held.right) - Number(held.left)) * 5.9;
      if (speed) player.facing = speed > 0 ? 1 : -1;
      movePlayer(state, i + 1, speed);
      const serving = state.rally === "serve" && state.serve === i + 1;
      if (held.jump > player.lastJump) {
        player.lastJump = held.jump;
        if (state.serve !== i + 1 && player.y >= GROUND) player.vy = -12;
      }
      if (held.hit > player.lastHit) {
        player.lastHit = held.hit;
        if (serving && player.swing === 0) {
          player.swing = 13;
          player.servePose = 1;
        } else if (state.rally === "flight" && player.swing === 0) {
          player.swing = 14;
          player.servePose = 0;
          player.underhand = i === 0 && state.birdie.y > player.y - 40 ? 1 : 0;
        }
      }
    }
    const bird = state.birdie;
    if (state.rally === "serve") {
      const player = state.players[state.serve - 1];
      bird.x = player.x + (state.serve === 1 ? 25 : -25);
      bird.y = player.y - 75;
      if (player.servePose && player.swing === 11) {
        state.rally = "flight";
        bird.vx = state.serve === 1 ? 30 : -30;
        bird.vy = -30;
        bird.lastHitter = state.serve;
      }
    }
    if (state.rally === "flight") {
      for (let i = 0; i < 2; i++) {
        const player = state.players[i];
        if (player.swing <= 0 || player.servePose || bird.lastHitter === i + 1) continue;
        const frame = clamp(16 - player.swing, 1, 15);
        const activeFrame = player.underhand ? frame + 14 : frame;
        if (activeFrame < (player.underhand ? 16 : 2) || activeFrame > (player.underhand ? 22 : 8)) continue;
        const tip = player.underhand ? P1_UNDERHAND_TIP[frame - 2] : (i === 0 ? P1_TIP : P2_TIP)[frame - 1];
        const racketX = player.x + (i === 0 ? 35 + tip[0] : -11 - tip[0]);
        const racketY = player.y - 41 + tip[1];
        if (Math.hypot(bird.x - racketX, bird.y - racketY) < 30) {
          const jitter = (state.round + state.tick * 73 + i * 397) % 1e3 / 200 - 2.5;
          const rotation = (player.underhand ? UNDERHAND_ROTATION[frame - 2] : SWING_ROTATION[frame - 1]) + jitter;
          const degrees = i === 0 ? rotation + 122 : -rotation - 302;
          const radians = degrees * Math.PI / 180;
          bird.vx = -Math.cos(radians) * (i === 0 ? 52 : 50);
          bird.vy = -Math.sin(radians) * 40;
          bird.lastHitter = i + 1;
          player.swing = 0;
          break;
        }
      }
    }
    if (state.rally === "flight" || state.rally === "point") {
      const oldX = bird.x, oldY = bird.y;
      bird.vy = (bird.vy + (bird.vy === 0 ? 0 : 1)) * 0.925;
      bird.vx *= 0.92;
      bird.y += bird.vy;
      bird.x += bird.vx;
      if (bird.x >= RIGHT_WALL || bird.x <= LEFT_WALL) {
        bird.x = clamp(bird.x, LEFT_WALL, RIGHT_WALL);
        bird.vx *= -0.8;
      }
      if (oldY >= NET_TOP && oldX < NET_X && bird.x > NET_X - NET_HALF_WIDTH) {
        bird.x = NET_X - NET_HALF_WIDTH;
        bird.y = oldY;
        bird.vx = Math.min(-2, bird.vx * -0.2);
        bird.vy *= 0.1;
      } else if (oldY >= NET_TOP && oldX > NET_X && bird.x < NET_X + NET_HALF_WIDTH) {
        bird.x = NET_X + NET_HALF_WIDTH;
        bird.y = oldY;
        bird.vx = Math.max(2, bird.vx * -0.2);
        bird.vy *= 0.1;
      } else if (oldY < NET_TOP && bird.y > NET_TOP && Math.abs(bird.x - NET_X) < NET_HALF_WIDTH) {
        bird.y = NET_TOP;
        bird.vx *= 0.5;
        bird.vy *= -1;
        if (Math.abs(bird.vx) < 3) bird.vx = (state.tick * 73 + state.round) % 2 ? -3 : 3;
      }
      if (bird.y >= GROUND) {
        bird.y = GROUND;
        bird.vy *= -0.4;
        if (Math.abs(bird.vx) > 1) bird.vx *= 0.9;
        if (Math.abs(bird.vy) < 0.5) bird.vy = 0;
        else if (Math.abs(bird.vx) < 2) bird.vx = bird.vx > 0 ? 0.7 : -0.7;
        if (Math.abs(bird.vx) < 0.5) bird.vx *= 0.1;
        if (state.rally === "flight") award(state, bird.x < NET_X ? 2 : 1);
      }
    }
    if (state.rally === "point" && --state.pointTicks <= 0) beginServe(state);
  }
  function reconcile(snapshot, seat, pending) {
    const next = cloneState(snapshot);
    const remaining = pending.filter((input) => input.seq > snapshot.ack[seat - 1]).slice(-HZ * 2);
    for (const input of remaining) {
      const player = next.players[seat - 1];
      movePlayer(next, seat, Number(input.right) - Number(input.left));
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
  var ASSET_ROOT = "/native/assets/badminton/";
  var BadmintonView = class {
    constructor(canvas) {
      this.canvas = canvas;
      this.images = /* @__PURE__ */ new Map();
      this.frames = 0;
      this.fpsAt = performance.now();
      this.fps = 0;
      canvas.width = WIDTH * 2;
      canvas.height = HEIGHT * 2;
      this.ctx = canvas.getContext("2d");
      for (const name of ["court", "birdie", "p1-body", "p1-body-alt", "p2-body", "p2-head"]) this.load(name);
      for (const side of ["p1", "p2"]) {
        for (let frame = 1; frame <= 15; frame++) this.load(`${side}-swing-${String(frame).padStart(2, "0")}`);
        for (let frame = 1; frame <= 13; frame++) this.load(`${side}-serve-${String(frame).padStart(2, "0")}`);
      }
      for (let frame = 1; frame <= 14; frame++) this.load(`p1-underhand-${String(frame).padStart(2, "0")}`);
    }
    load(name) {
      const image = new Image();
      image.src = `${ASSET_ROOT}${name}.png`;
      this.images.set(name, image);
    }
    draw(name, x, y) {
      const image = this.images.get(name);
      if (image?.complete && image.naturalWidth) this.ctx.drawImage(image, x, y);
    }
    render(state, seat) {
      const ctx = this.ctx;
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = "#a5a29b";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      this.draw("court", 0, 0);
      ctx.fillStyle = "#171717";
      ctx.fillRect(211, 15, 129, 37);
      ctx.fillStyle = "#f11920";
      ctx.font = "bold 24px monospace";
      ctx.textAlign = "center";
      ctx.shadowColor = "#f11920";
      ctx.shadowBlur = 4;
      ctx.fillText(state ? `${String(state.score[0]).padStart(2, "0")} - ${String(state.score[1]).padStart(2, "0")}` : "00 - 00", 275, 42);
      ctx.shadowBlur = 0;
      if (state) {
        state.players.forEach((player, i) => this.player(state, i));
        if (state.rally !== "serve") {
          const bird = state.birdie;
          ctx.save();
          ctx.translate(bird.x, bird.y);
          ctx.rotate(Math.atan2(bird.vy, bird.vx) + Math.PI / 2);
          this.draw("birdie", -20.5, -22);
          ctx.restore();
        }
        if (state.phase === "waiting") this.banner("\u53CC\u65B9\u5165\u5EA7\u5E76\u51C6\u5907\u540E\u5F00\u59CB");
        else if (state.phase === "finished") this.banner(`P${state.winner} \u83B7\u80DC \xB7 \u518D\u6B21\u51C6\u5907\u53EF\u91CD\u5F00`);
        else if (state.rally === "serve") this.banner(`P${state.serve} \u53D1\u7403 \xB7 \u6309 S / \u2193`);
        else if (state.rally === "point") this.banner(`P${state.lastPoint} \u5F97\u5206`);
      } else this.banner("\u6B63\u5728\u8FDE\u63A5\u623F\u95F4\u2026");
      if (seat) {
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#191919";
        const player = state?.players[seat - 1];
        if (player) ctx.fillText("\u4F60", player.x, Math.max(115, player.y - 96));
      }
      this.frames++;
      const now = performance.now();
      if (now - this.fpsAt >= 1e3) {
        this.fps = Math.round(this.frames * 1e3 / (now - this.fpsAt));
        this.frames = 0;
        this.fpsAt = now;
      }
    }
    player(state, index) {
      const p = state.players[index];
      const side = index === 0 ? "p1" : "p2";
      const moving = state.inputs[index].left !== state.inputs[index].right;
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (index === 0) this.draw(moving && p.y >= GROUND && state.tick % 2 === 0 ? "p1-body-alt" : "p1-body", -14, -78);
      else {
        this.draw("p2-body", -12, -62);
        this.draw("p2-head", -8, -81);
      }
      ctx.restore();
      const serving = p.servePose > 0 || state.rally === "serve" && state.serve === index + 1;
      const kind = serving ? "serve" : p.underhand && p.swing > 0 ? "underhand" : "swing";
      const frame = p.swing > 0 ? serving ? 15 - p.swing : 16 - p.swing : 1;
      const bounded = Math.max(1, Math.min(serving ? 13 : kind === "underhand" ? 14 : 15, kind === "underhand" ? frame - 1 : frame));
      const key = `${side}-${kind}-${String(bounded).padStart(2, "0")}`;
      ctx.save();
      ctx.translate(p.x, p.y - 58);
      if (index === 1) ctx.scale(-1, 1);
      if (serving) ctx.scale(1, -1);
      this.draw(key, serving ? index === 0 ? -77 : -101 : index === 0 ? -67 : -69, -(serving ? 108 : 95));
      ctx.restore();
    }
    banner(message) {
      const ctx = this.ctx;
      ctx.fillStyle = "#171717da";
      ctx.fillRect(140, 67, 270, 33);
      ctx.fillStyle = "#f4eee8";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(message, 275, 88);
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
      if ((keys.has("KeyS") || keys.has("ArrowDown")) && frame - lastHitTick >= 15) {
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
          movePlayer(state, seat, Number(input.right) - Number(input.left));
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
