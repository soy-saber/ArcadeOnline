"use strict";
(() => {
  // src/authority/maps.ts
  var ORIGINAL_MAPS = [
    { id: "forest", label: "\u68EE\u6797", sceneStyle: 0, floorFrames: [1, 2, 3], crateFrames: [1, 2, 3, 4, 5, 6], wallFrames: [7, 8, 9], landmarkFrames: [52] },
    { id: "desert", label: "\u6C99\u6F20", sceneStyle: 1, floorFrames: [4, 5], crateFrames: [10, 11, 12], wallFrames: [13, 14, 15, 16, 17, 18, 19], landmarkFrames: [53, 54] },
    { id: "city", label: "\u57CE\u5E02", sceneStyle: 2, floorFrames: [6, 7], crateFrames: [20, 21, 22, 23], wallFrames: [24, 25, 26, 27, 28, 29, 30, 31], landmarkFrames: [55, 56] },
    { id: "treasure", label: "\u85CF\u5B9D", sceneStyle: 3, floorFrames: [8, 9, 10], crateFrames: [32, 33, 34, 35, 36, 37, 38], wallFrames: [39, 40, 41], landmarkFrames: [57] },
    { id: "candy", label: "\u7CD6\u679C\u5C4B", sceneStyle: 4, floorFrames: [11, 12], crateFrames: [42, 43, 44, 45, 46, 47], wallFrames: [48, 49, 50, 51], landmarkFrames: [58] }
  ];
  var MAP_IDS = [...ORIGINAL_MAPS.map((map) => map.id), "classic", "lanes", "open"];
  var BRICK_RASTER_ORIGIN = { x: -257 / 20, y: -760 / 20 };
  var originalMap = (id) => ORIGINAL_MAPS.find((map) => map.id === id);

  // src/authority/native-audio.ts
  function emitSound(s, name) {
    s.sounds.push({ id: ++s.soundId, name });
    if (s.sounds.length > 64) s.sounds.splice(0, s.sounds.length - 64);
  }
  var NativeAudio = class {
    constructor(files) {
      this.files = files;
      this.enabled = true;
      this.volume = 0.24;
      this.ready = false;
      this.round = 0;
      this.heard = 0;
      this.playing = /* @__PURE__ */ new Set();
      this.music = null;
      this.track = "";
      this.wanted = "";
      this.installed = false;
    }
    setSound(value) {
      this.enabled = value;
      if (!value) {
        for (const a of this.playing) a.pause();
        this.playing.clear();
        this.music?.pause();
      } else this.syncMusic();
    }
    setVolume(value) {
      this.volume = Math.min(1, Math.max(0, value));
      for (const a of this.playing) a.volume = this.volume;
      if (this.music) this.music.volume = this.volume * 0.45;
      this.syncMusic();
    }
    install() {
      if (this.installed || typeof window === "undefined") return;
      this.installed = true;
      const unlock = () => {
        this.ready = true;
        this.syncMusic();
      };
      window.addEventListener("pointerdown", unlock);
      window.addEventListener("keydown", unlock);
      window.addEventListener("pagehide", () => {
        this.music?.pause();
        for (const a of this.playing) a.pause();
      });
      document.addEventListener("visibilitychange", () => this.syncMusic());
    }
    syncMusic() {
      if (!this.enabled || !this.ready || this.volume === 0 || typeof document === "undefined" || document.hidden || !this.wanted) {
        this.music?.pause();
        return;
      }
      if (this.track !== this.wanted) {
        this.music?.pause();
        this.track = this.wanted;
        this.music = new Audio(this.files[this.track]);
        this.music.loop = true;
      }
      if (this.music?.paused) {
        this.music.volume = this.volume * 0.45;
        void this.music.play().catch(() => {
        });
      }
    }
    play(name) {
      const file = this.files[name];
      if (!file || !this.enabled || !this.ready || this.volume === 0) return;
      if (this.playing.size >= 16) {
        const oldest = this.playing.values().next().value;
        if (oldest) {
          oldest.pause();
          this.playing.delete(oldest);
        }
      }
      const audio2 = new Audio(file);
      audio2.volume = this.volume;
      this.playing.add(audio2);
      const done = () => this.playing.delete(audio2);
      audio2.onended = done;
      audio2.onerror = done;
      void audio2.play().catch(done);
    }
    confirm(s, seat, winner) {
      this.install();
      this.wanted = s.phase === "playing" ? "music" + s.musicTrack : s.phase === "waiting" ? "menu" : "";
      this.syncMusic();
      if (this.round !== s.round) {
        this.round = s.round;
        this.heard = s.soundId;
        return;
      }
      for (const event of s.sounds) if (event.id > this.heard) this.play(event.name === "result" ? seat && winner !== seat ? "failed" : "complete" : event.name);
      this.heard = s.soundId;
    }
  };

  // src/authority/bomb-sound.ts
  var BOMB_SOUND_FILES = {
    place: "/authority/assets/place.mp3",
    explode: "/authority/assets/explode.mp3",
    pickup: "/authority/assets/item.mp3",
    rocket: "/authority/assets/bomb1-rocket.mp3",
    grenade: "/authority/assets/bomb1-grenade.mp3",
    mine: "/authority/assets/bomb1-mine.mp3",
    push: "/authority/assets/bomb1-push.mp3",
    complete: "/authority/assets/bomb1-complete.mp3",
    failed: "/authority/assets/bomb1-failed.mp3",
    menu: "/authority/assets/bomb1-menu.mp3",
    music1: "/authority/assets/bomb1-music1.mp3",
    music2: "/authority/assets/bomb1-music2.mp3",
    music3: "/authority/assets/bomb1-music3.mp3",
    music4: "/authority/assets/bomb1-music4.mp3"
  };

  // src/authority/bomb-core.ts
  var HZ = 35;
  var STEP_MS = 1e3 / HZ;
  var WIDTH = 15;
  var HEIGHT = 13;
  var FUSE_TICKS = 60;
  var PUSH_COOLDOWN_TICKS = 14;
  var TRAP_REVEAL_TICKS = HZ * 3;
  var SPECIAL_RECOVERY_TICKS = 7;
  var ROUND_TICKS = HZ * 180;
  var WEAPONS = ["rocket", "mine", "grenade", "gas", "ice", "fire"];
  var ITEM_LABELS = { bomb: "\u70B8\u5F39\u7CD6", range: "\u5A01\u529B\u836F", speed: "\u98DE\u978B", shield: "\u76FE\u724C", life: "\u751F\u547D", push: "\u63A8\u5F39\u624B\u5957", rocket: "\u706B\u7BAD", mine: "\u5730\u96F7", grenade: "\u624B\u69B4\u5F39", gas: "\u6C7D\u5F39", ice: "\u51B0\u7BAD", fire: "\u706B\u7130\u7BAD" };
  var DEFAULT_OPTIONS = { mode: "online", map: ORIGINAL_MAPS[0].id, loadout: "none", bots: [] };
  var DIRECTIONS = [[-1, 0], [0, -1], [1, 0], [0, 1]];
  var index = (x, y) => y * WIDTH + x;
  function position(player) {
    const delta = player.moveDir < 0 ? [0, 0] : DIRECTIONS[player.moveDir];
    return {
      x: player.x + delta[0] * player.progress / player.moveTicks,
      y: player.y + delta[1] * player.progress / player.moveTicks
    };
  }
  function visibleSpecials(state, seat) {
    return state.specials.filter((special) => special.kind !== "mine" && special.kind !== "gas" || special.owner === seat || state.tick - special.born < TRAP_REVEAL_TICKS);
  }
  function validInput(value) {
    if (!value || typeof value !== "object") return false;
    const v = value;
    return Number.isSafeInteger(v.seq) && v.seq >= 0 && v.seq <= 1e9 && Number.isInteger(v.dir) && v.dir >= -1 && v.dir <= 3 && Number.isSafeInteger(v.bomb) && v.bomb >= 0 && v.bomb <= 1e9 && (v.special === void 0 || Number.isSafeInteger(v.special) && v.special >= 0 && v.special <= 1e9);
  }
  function validState(value) {
    if (!value || typeof value !== "object") return false;
    const s = value;
    const integer2 = (v, low, high) => Number.isInteger(v) && v >= low && v <= high;
    const o = s.options;
    if (!o || !["easy", "normal", "hard"].includes(o.difficulty || "") || !Array.isArray(o.characters) || o.characters.length !== 4 || !o.characters.every((c) => integer2(c, 1, 4))) return false;
    if (!integer2(s.soundId, 0, 1e9) || !integer2(s.musicTrack, 1, 4) || !Array.isArray(s.sounds) || s.sounds.length > 64 || !s.sounds.every((e, i) => e && integer2(e.id, 1, s.soundId) && (i === 0 || e.id > s.sounds[i - 1].id) && (e.name === "result" || Object.prototype.hasOwnProperty.call(BOMB_SOUND_FILES, e.name)))) return false;
    if (!o || !["duel", "practice", "coop", "online"].includes(o.mode) || !MAP_IDS.includes(o.map) || !["none", ...WEAPONS].includes(o.loadout)) return false;
    const count = o.mode === "coop" || o.mode === "online" ? 4 : 2;
    if (!Array.isArray(s.dropWeapons) || s.dropWeapons.length !== 2 || new Set(s.dropWeapons).size !== 2 || !s.dropWeapons.every((w) => WEAPONS.includes(w)) || !Array.isArray(s.blasts) || s.blasts.length > WIDTH * HEIGHT * 20 || !s.blasts.every((b) => b && integer2(b.x, 0, WIDTH - 1) && integer2(b.y, 0, HEIGHT - 1) && integer2(b.owner, 1, count) && integer2(b.range, 1, 10) && integer2(b.born, 0, s.tick) && integer2(b.distance, 0, b.range) && Array.isArray(b.active) && b.active.length === 4 && b.active.every((v) => typeof v === "boolean") && Array.isArray(b.lengths) && b.lengths.length === 4 && b.lengths.every((v) => integer2(v, 0, b.distance)))) return false;
    if (!Array.isArray(o.bots) || o.bots.length > count || new Set(o.bots).size !== o.bots.length || !o.bots.every((v) => integer2(v, 1, count)) || o.mode === "duel" && o.bots.length > 0 || o.mode === "coop" && (!o.bots.includes(3) || !o.bots.includes(4)) || o.mode === "online" && o.bots.length > 0) return false;
    if (o.mode === "online" && (!Array.isArray(o.activeSeats) || o.activeSeats.length > 4 || s.phase !== "waiting" && o.activeSeats.length < 2 || new Set(o.activeSeats).size !== o.activeSeats.length || !o.activeSeats.every((v) => integer2(v, 1, 4)))) return false;
    if (s.version !== 2 || !integer2(s.round, 1, Number.MAX_SAFE_INTEGER) || !integer2(s.tick, 0, ROUND_TICKS + 1) || !integer2(s.rng, 0, 4294967295) || !integer2(s.nextBomb, 1, 1e6) || !["waiting", "playing", "finished"].includes(s.phase) || !(s.winner === null || integer2(s.winner, 0, count))) return false;
    if (!Array.isArray(s.board) || s.board.length !== WIDTH * HEIGHT || !s.board.every((v) => integer2(v, 0, 2)) || !Array.isArray(s.flames) || s.flames.length !== WIDTH * HEIGHT || !s.flames.every((v) => integer2(v, 0, ROUND_TICKS + 100)) || !Array.isArray(s.flameOwners) || s.flameOwners.length !== WIDTH * HEIGHT || !s.flameOwners.every((v) => integer2(v, 0, count)) || !Array.isArray(s.ice) || s.ice.length !== WIDTH * HEIGHT || !s.ice.every((v) => integer2(v, 0, ROUND_TICKS + 100)) || !Array.isArray(s.items) || s.items.length !== WIDTH * HEIGHT || !s.items.every((v) => v === null || typeof v === "string" && Object.prototype.hasOwnProperty.call(ITEM_LABELS, v))) return false;
    const theme = originalMap(o.map);
    if (theme && (!s.mapVisual || !theme.floorFrames.some((frame) => frame === s.mapVisual.floor) || !theme.landmarkFrames.some((frame) => frame === s.mapVisual.landmark) || !Array.isArray(s.mapVisual.tiles) || s.mapVisual.tiles.length !== WIDTH * HEIGHT || !s.mapVisual.tiles.every((frame) => frame === 0 || theme.crateFrames.some((v) => v === frame) || theme.wallFrames.some((v) => v === frame)))) return false;
    if (!Array.isArray(s.players) || s.players.length !== count || !s.players.every((p, i) => p && p.seat === i + 1 && integer2(p.character, 1, 4) && integer2(p.x, 0, WIDTH - 1) && integer2(p.y, 0, HEIGHT - 1) && integer2(p.dir, -1, 3) && integer2(p.moveDir, -1, 3) && integer2(p.speed, 3, 6) && integer2(p.moveTicks, 3, 20) && integer2(p.progress, 0, p.moveTicks - 1) && integer2(p.capacity, 1, WIDTH * HEIGHT) && integer2(p.range, 1, 10) && integer2(p.invulnerable, 0, 63) && integer2(p.life, 0, WIDTH * HEIGHT + 1) && typeof p.push === "boolean" && (p.weapon === null || WEAPONS.includes(p.weapon)) && integer2(p.ammo, 0, 2) && integer2(p.lastSpecial, 0, 1e9) && integer2(p.slow, 0, 600) && integer2(p.frozen, 0, 300) && integer2(p.diedAt, 0, ROUND_TICKS) && integer2(p.killedBy, 0, count) && integer2(p.pushCooldown, 0, PUSH_COOLDOWN_TICKS) && integer2(p.actionLock, 0, SPECIAL_RECOVERY_TICKS) && integer2(p.lastBomb, 0, 1e9) && typeof p.alive === "boolean" && typeof p.shield === "boolean")) return false;
    return Array.isArray(s.ack) && s.ack.length === count && s.ack.every((v) => integer2(v, 0, 1e9)) && Array.isArray(s.inputs) && s.inputs.length === count && s.inputs.every(validInput) && Array.isArray(s.specials) && s.specials.length <= 64 && s.specials.every((v) => v && integer2(v.id, 1, 1e6) && WEAPONS.includes(v.kind) && integer2(v.owner, 1, count) && integer2(v.x, 0, WIDTH - 1) && integer2(v.y, 0, HEIGHT - 1) && integer2(v.dir, 0, 3) && integer2(v.born, 0, ROUND_TICKS) && integer2(v.until, v.born, ROUND_TICKS * 2) && integer2(v.distance, 0, 1e3)) && Array.isArray(s.bombs) && s.bombs.length <= WIDTH * HEIGHT && s.bombs.every((b) => b && integer2(b.id, 1, 1e6) && integer2(b.x, 0, WIDTH - 1) && integer2(b.y, 0, HEIGHT - 1) && integer2(b.owner, 1, count) && (b.slide === void 0 || integer2(b.slide, -1, 3)) && (b.slideTick === void 0 || integer2(b.slideTick, 0, 1)) && integer2(b.range, 1, 10) && integer2(b.explodeAt, 0, ROUND_TICKS + FUSE_TICKS));
  }

  // src/badminton/core.ts
  var HZ2 = 30;
  var STEP_MS2 = 1e3 / HZ2;
  var WIDTH2 = 550;
  var HEIGHT2 = 400;
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
  var clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  function validInput2(input) {
    if (!input || typeof input !== "object") return false;
    const item = input;
    return Number.isSafeInteger(item.seq) && item.seq >= 0 && item.seq < 1e9 && Number.isSafeInteger(item.jump) && item.jump >= 0 && item.jump < 1e9 && Number.isSafeInteger(item.hit) && item.hit >= 0 && item.hit < 1e9 && typeof item.left === "boolean" && typeof item.right === "boolean";
  }
  function validState2(value) {
    if (!value || typeof value !== "object") return false;
    const s = value;
    const finite = (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e15;
    return finite(s.round) && finite(s.tick) && ["waiting", "playing", "finished"].includes(s.phase) && ["serve", "flight", "point"].includes(s.rally) && [0, 1, 2].includes(s.serve) && [0, 1, 2].includes(s.winner) && [0, 1, 2].includes(s.lastPoint) && finite(s.pointTicks) && Array.isArray(s.score) && s.score.length === 2 && s.score.every((n) => finite(n) && n >= 0 && n <= TARGET) && Array.isArray(s.players) && s.players.length === 2 && s.players.every((p) => p && [p.x, p.y, p.vy, p.swing, p.servePose, p.underhand, p.lastJump, p.lastHit, p.facing].every(finite)) && !!s.birdie && [s.birdie.x, s.birdie.y, s.birdie.vx, s.birdie.vy, s.birdie.lastHitter].every(finite) && Array.isArray(s.ack) && s.ack.length === 2 && s.ack.every(finite) && Array.isArray(s.inputs) && s.inputs.length === 2 && s.inputs.every(validInput2);
  }
  function movePlayer(state, seat, direction2) {
    if (!direction2) return;
    const player = state.players[seat - 1];
    const towardNet = seat === 1 ? direction2 > 0 : direction2 < 0;
    if (towardNet) {
      const reach = state.serve === seat ? seat === 1 ? 65 : -60 : 0;
      const testX = player.x + reach;
      if (player.y >= NET_LIMIT_TOP && player.y <= NET_LIMIT_BOTTOM && testX >= NET_LIMIT_X - NET_LIMIT_HALF_WIDTH && testX <= NET_LIMIT_X + NET_LIMIT_HALF_WIDTH) return;
    }
    player.x = clamp(
      player.x + Math.sign(direction2) * 5.9,
      seat === 1 ? LEFT_WALL : NET_X,
      seat === 1 ? NET_X : RIGHT_WALL
    );
  }

  // src/expanded/tank.ts
  var HZ3 = 25;
  var ROUND_TICKS2 = HZ3 * 180;
  var BULLET_LIFETIME = 250;
  var CELL = 50;
  var RADIUS = 10;
  var WEAPONS2 = ["laser", "frag", "gatling", "homing", "deathRay", "mine", "remote"];
  var LABELS = { bullet: "\u70AE\u5F39", laser: "\u6FC0\u5149", frag: "\u788E\u7247\u5F39", gatling: "\u52A0\u7279\u6797", homing: "\u8FFD\u8E2A\u5BFC\u5F39", deathRay: "\u6B7B\u4EA1\u5C04\u7EBF", mine: "\u5730\u96F7", remote: "\u9065\u63A7\u5BFC\u5F39" };
  var COLORS = ["", "#49a96f", "#e56866", "#497bc2"];
  function random(s) {
    let x = s.rng | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    s.rng = x >>> 0;
    return s.rng / 4294967296;
  }
  function integer(s, max) {
    return Math.floor(random(s) * max);
  }
  function generateMaze(s, width, height) {
    const temp = Array.from({ length: width + 1 }, () => Array.from({ length: height + 1 }, () => integer(s, 4)));
    const horizontal = Array.from({ length: width }, (_, x) => Array.from({ length: height }, (_2, y) => temp[x][y + 1] === 2 || temp[x + 1][y + 1] === 0));
    const vertical = Array.from({ length: width }, (_, x) => Array.from({ length: height }, (_2, y) => temp[x][y] === 1 || temp[x][y + 1] === 3));
    const walls = [{ x: 0, y: 0, w: width * CELL, h: 3 }, { x: 0, y: height * CELL - 3, w: width * CELL, h: 3 }, { x: 0, y: 0, w: 3, h: height * CELL }, { x: width * CELL - 3, y: 0, w: 3, h: height * CELL }];
    for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
      if (horizontal[x][y] && y < height - 1) walls.push({ x: x * CELL, y: (y + 1) * CELL - 1.5, w: CELL, h: 3 });
      if (vertical[x][y] && x > 0) walls.push({ x: x * CELL - 1.5, y: y * CELL, w: 3, h: CELL });
    }
    const start2 = [integer(s, width), integer(s, height)], queue = [start2], seen = /* @__PURE__ */ new Set([start2.join(",")]);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (dx === -1 && vertical[x][y] || dx === 1 && vertical[nx][y] || dy === -1 && horizontal[x][ny] || dy === 1 && horizontal[x][y]) continue;
        const key = nx + "," + ny;
        if (!seen.has(key)) {
          seen.add(key);
          queue.push([nx, ny]);
        }
      }
    }
    return { walls, reachable: queue };
  }
  function create(round, playing2, seats, seed, mapId) {
    const s = {
      gameId: "137953-server",
      version: 1,
      round,
      tick: 0,
      phase: playing2 ? "playing" : "waiting",
      winner: null,
      ack: [0, 0, 0],
      players: [],
      rng: seed >>> 0 || 1,
      width: 8,
      height: 6,
      walls: [],
      reachable: [],
      bullets: [],
      crates: [],
      rays: [],
      nextId: 1,
      scores: [0, 0, 0],
      endAt: 0,
      nextCrate: 350,
      mapId: mapId === "compact" ? "compact" : mapId === "large" ? "large" : "random"
    };
    let maze;
    let attempts = 0;
    do {
      s.width = s.mapId === "compact" ? 6 : s.mapId === "large" ? 12 : integer(s, 9) + 4;
      s.height = s.mapId === "compact" ? 5 : s.mapId === "large" ? 10 : integer(s, 7) + 4;
      maze = generateMaze(s, s.width, s.height);
    } while (maze.reachable.length < Math.max(6, seats.length * 2) && ++attempts < 100);
    s.walls = maze.walls;
    s.reachable = maze.reachable;
    const positions = [...s.reachable];
    for (const seat of [...new Set(seats)].filter((n) => Number.isInteger(n) && n >= 1 && n <= 3).sort((a, b) => a - b)) {
      const [x, y] = positions.splice(integer(s, positions.length), 1)[0];
      s.players.push({ seat, x: (x + 0.5) * CELL, y: (y + 0.5) * CELL, angle: integer(s, 360) / 180 * Math.PI, alive: true, lastAttack: 0, lastAlt: 0, cooldown: 0, weapon: "bullet", ammo: 0, charge: 0, gatling: 0, gatlingAt: 0, killedBy: 0, kills: 0, deaths: 0, diedAt: 0 });
    }
    s.nextCrate = 350 + integer(s, 200) - Math.floor(s.width * s.height / 2e3);
    return s;
  }
  function collides(s, x, y, radius) {
    return s.walls.some((w) => x + radius > w.x && x - radius < w.x + w.w && y + radius > w.y && y - radius < w.y + w.h);
  }
  function kill(s, p, owner) {
    if (!p.alive) return;
    p.alive = false;
    p.killedBy = owner;
    p.deaths++;
    p.diedAt = s.tick;
    const killer = s.players.find((q) => q.seat === owner);
    if (killer && killer !== p) killer.kills++;
  }
  function projectile(s, p, kind, angle = p.angle) {
    const speed = kind === "gatling" || kind === "mine" ? 5.5 : 4.5;
    const b = { id: s.nextId++, owner: p.seat, kind, x: p.x + Math.cos(angle) * 14, y: p.y + Math.sin(angle) * 14, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, angle, born: s.tick, until: s.tick + (kind === "gatling" ? 125 : BULLET_LIFETIME), armedAt: s.tick + (kind === "mine" ? 20 : kind === "gatling" ? 2 : 0), bounces: 0 };
    if (collides(s, b.x, b.y, 1.5)) {
      b.x = p.x;
      b.y = p.y;
    }
    s.bullets.push(b);
    return b;
  }
  function fragment(s, b) {
    if (s.bullets.length > 160) return;
    for (let k = 0; k < 40; k++) {
      const angle = random(s) * Math.PI * 2, speed = 3 + random(s) * 3;
      s.bullets.push({ id: s.nextId++, owner: b.owner, kind: "fragment", x: b.x, y: b.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, angle, born: s.tick, until: s.tick + 35 + integer(s, 40), armedAt: s.tick + 1, bounces: 0 });
    }
  }
  function fire(s, p) {
    if (p.cooldown > 0 || p.charge > 0) return;
    const frag = s.bullets.find((b) => b.owner === p.seat && b.kind === "frag");
    if (frag) {
      fragment(s, frag);
      s.bullets = s.bullets.filter((b) => b !== frag);
      p.weapon = "bullet";
      p.cooldown = 5;
      return;
    }
    if (p.weapon === "bullet") {
      if (s.bullets.filter((b) => b.owner === p.seat && b.kind === "bullet").length >= 5) return;
      projectile(s, p, "bullet");
      p.cooldown = 5;
    } else if (p.weapon === "laser" || p.weapon === "deathRay") {
      p.charge = p.weapon === "deathRay" ? 15 : 7;
      p.cooldown = p.charge + 10;
    } else if (p.weapon === "gatling") {
      p.gatling = 20;
      p.gatlingAt = s.tick + 10;
      p.weapon = "bullet";
      p.cooldown = 10;
    } else {
      projectile(s, p, p.weapon);
      p.cooldown = 5;
      if (p.weapon !== "frag") p.weapon = "bullet";
    }
  }
  function ray(s, p, kind) {
    let x = p.x + Math.cos(p.angle) * 14, y = p.y + Math.sin(p.angle) * 14, dx = Math.cos(p.angle), dy = Math.sin(p.angle);
    const points = [[x, y]], distance = kind === "deathRay" ? Math.hypot(s.width * CELL, s.height * CELL) : 70 * 8;
    for (let i = 0; i < distance; i++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx > s.width * CELL || ny > s.height * CELL) break;
      if (collides(s, nx, ny, 0)) {
        if (kind === "deathRay") {
          x = nx;
          y = ny;
          continue;
        }
        const cx = collides(s, nx, y, 0), cy = collides(s, x, ny, 0);
        if (cx) dx = -dx;
        if (cy) dy = -dy;
        if (!cx && !cy) {
          dx = -dx;
          dy = -dy;
        }
        points.push([x, y]);
      } else {
        x = nx;
        y = ny;
      }
      for (const q of s.players) if (q.alive && Math.hypot(q.x - x, q.y - y) < RADIUS) kill(s, q, p.seat);
    }
    points.push([x, y]);
    s.rays.push({ id: s.nextId++, owner: p.seat, kind, points, until: s.tick + (kind === "deathRay" ? 30 : 8) });
    p.weapon = "bullet";
  }
  function step(s, inputs) {
    if (s.phase !== "playing") return;
    s.tick++;
    for (const p of s.players) {
      const input = inputs[p.seat - 1];
      if (input) s.ack[p.seat - 1] = Math.max(s.ack[p.seat - 1], input.seq);
      if (!p.alive) continue;
      if (p.cooldown > 0) p.cooldown--;
      if (p.charge > 0) {
        if (--p.charge === 0) ray(s, p, p.weapon);
      } else if (input) {
        const remote = s.bullets.some((b) => b.owner === p.seat && b.kind === "remote");
        if (!remote) {
          p.angle += (Number(input.right) - Number(input.left)) * 0.085;
          p.angle = (p.angle + Math.PI * 2) % (Math.PI * 2);
          const speed = input.up ? 2 : input.down ? -1.4 : 0, dx = Math.cos(p.angle) * speed, dy = Math.sin(p.angle) * speed;
          for (let k = 0; k < 2; k++) {
            if (!collides(s, p.x + dx / 2, p.y, RADIUS)) p.x += dx / 2;
            if (!collides(s, p.x, p.y + dy / 2, RADIUS)) p.y += dy / 2;
          }
        }
        if (input.attack > p.lastAttack) {
          p.lastAttack = input.attack;
          fire(s, p);
        }
        if (input.alt > p.lastAlt) {
          p.lastAlt = input.alt;
          const frag = s.bullets.find((b) => b.owner === p.seat && b.kind === "frag");
          if (frag) {
            fragment(s, frag);
            s.bullets = s.bullets.filter((b) => b !== frag);
            p.weapon = "bullet";
          } else if (remote) {
            for (const b of s.bullets) if (b.owner === p.seat && b.kind === "remote") b.until = s.tick;
          } else fire(s, p);
        }
      }
      if (p.gatling > 0 && s.tick >= p.gatlingAt) {
        projectile(s, p, "gatling", p.angle + (random(s) - 0.5) * 0.16);
        p.gatling--;
        p.gatlingAt = s.tick + 2;
      }
      const crate = s.crates.find((c) => Math.hypot(c.x - p.x, c.y - p.y) < 17);
      if (crate) {
        p.weapon = crate.weapon;
        p.ammo = 1;
        s.crates = s.crates.filter((c) => c !== crate);
      }
    }
    const remaining = [], fragments = [];
    for (const b of s.bullets) {
      if (b.until <= s.tick) {
        if (b.kind === "frag") fragments.push(b);
        continue;
      }
      if (b.kind === "homing" && s.tick - b.born >= 50) {
        const targets = s.players.filter((p) => p.alive && p.seat !== b.owner).sort((a, bp) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(bp.x - b.x, bp.y - b.y));
        if (targets.length) {
          const target = Math.atan2(targets[0].y - b.y, targets[0].x - b.x), delta = Math.atan2(Math.sin(target - b.angle), Math.cos(target - b.angle));
          b.angle += Math.max(-0.1, Math.min(0.1, delta));
          b.vx = Math.cos(b.angle) * 4.5;
          b.vy = Math.sin(b.angle) * 4.5;
        }
      }
      if (b.kind === "remote") {
        const input = inputs[b.owner - 1];
        if (input) {
          b.angle += (Number(input.right) - Number(input.left)) * 15 / 180 * Math.PI;
          b.vx = Math.cos(b.angle) * 4.5;
          b.vy = Math.sin(b.angle) * 4.5;
        }
      }
      if (b.kind === "mine" && s.tick - b.born >= 12) {
        b.vx = 0;
        b.vy = 0;
      }
      let dead = false;
      for (let k = 0; k < 7; k++) {
        const nx = b.x + b.vx / 7, ny = b.y + b.vy / 7;
        if (collides(s, nx, ny, 1.5)) {
          const cx = collides(s, nx, b.y, 1.5), cy = collides(s, b.x, ny, 1.5);
          if (cx) b.vx = -b.vx;
          if (cy) b.vy = -b.vy;
          if (!cx && !cy) {
            b.vx = -b.vx;
            b.vy = -b.vy;
          }
          b.bounces++;
          b.angle = Math.atan2(b.vy, b.vx);
        } else {
          b.x = nx;
          b.y = ny;
        }
        if (b.armedAt <= s.tick) {
          const victim = s.players.find((p) => p.alive && Math.hypot(p.x - b.x, p.y - b.y) < RADIUS + 1.5);
          if (victim) {
            kill(s, victim, b.owner);
            if (b.kind === "frag" || b.kind === "mine") fragments.push(b);
            dead = true;
            break;
          }
        }
      }
      if (!dead) remaining.push(b);
    }
    s.bullets = remaining;
    for (const b of fragments) fragment(s, b);
    s.rays = s.rays.filter((r) => r.until > s.tick);
    for (const r of s.rays) if (r.kind === "deathRay") {
      for (const p of s.players) if (p.alive) for (let i = 1; i < r.points.length; i++) {
        const [ax, ay] = r.points[i - 1], [bx, by] = r.points[i], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy || 1)));
        if (Math.hypot(p.x - ax - dx * t, p.y - ay - dy * t) < RADIUS) kill(s, p, r.owner);
      }
    }
    if (s.tick >= s.nextCrate && s.crates.length < 3) {
      const used = s.reachable.filter((cell) => !s.crates.some((c) => Math.floor(c.x / CELL) === cell[0] && Math.floor(c.y / CELL) === cell[1]));
      if (used.length) {
        const [x, y] = used[integer(s, used.length)];
        s.crates.push({ id: s.nextId++, x: (x + 0.5) * CELL, y: (y + 0.5) * CELL, weapon: WEAPONS2[integer(s, WEAPONS2.length)] });
      }
      s.nextCrate = s.tick + 350 + integer(s, 200);
    }
    const alive = s.players.filter((p) => p.alive);
    if (alive.length <= 1 && s.endAt === 0) s.endAt = s.tick + 125;
    if (s.endAt && s.tick >= s.endAt || s.tick >= ROUND_TICKS2) {
      s.phase = "finished";
      s.winner = alive.length === 1 ? alive[0].seat : null;
      if (s.winner !== null) s.scores[s.winner - 1]++;
    }
  }
  function valid(value) {
    if (!value || typeof value !== "object") return false;
    const s = value;
    const int = (n, a, b) => Number.isSafeInteger(n) && n >= a && n <= b;
    const num = (n, a, b) => typeof n === "number" && Number.isFinite(n) && n >= a && n <= b;
    if (s.gameId !== "137953-server" || s.version !== 1 || !int(s.round, 1, Number.MAX_SAFE_INTEGER) || !int(s.tick, 0, ROUND_TICKS2) || !int(s.rng, 0, 4294967295) || !int(s.nextId, 1, 1e7) || !int(s.width, 4, 12) || !int(s.height, 4, 10) || !["waiting", "playing", "finished"].includes(s.phase) || !["random", "compact", "large"].includes(s.mapId) || !int(s.endAt, 0, ROUND_TICKS2 + 125) || !int(s.nextCrate, 0, ROUND_TICKS2 + 550)) return false;
    if (!Array.isArray(s.players) || s.players.length > 3 || new Set(s.players.map((p) => p?.seat)).size !== s.players.length || !s.players.every((p) => p && int(p.seat, 1, 3) && num(p.x, 0, s.width * CELL) && num(p.y, 0, s.height * CELL) && num(p.angle, 0, Math.PI * 2 + 1e-3) && typeof p.alive === "boolean" && int(p.lastAttack, 0, 1e9) && int(p.lastAlt, 0, 1e9) && int(p.cooldown, 0, 40) && int(p.charge, 0, 15) && int(p.gatling, 0, 20) && int(p.gatlingAt, 0, ROUND_TICKS2 + 20) && ["bullet", ...WEAPONS2].includes(p.weapon) && int(p.killedBy, 0, 3) && int(p.kills, 0, 1e3) && int(p.deaths, 0, 1e3) && int(p.diedAt, 0, ROUND_TICKS2))) return false;
    if (s.winner !== null && !s.players.some((p) => p.seat === s.winner)) return false;
    if (!Array.isArray(s.ack) || s.ack.length !== 3 || !s.ack.every((n) => int(n, 0, 1e9)) || !Array.isArray(s.scores) || s.scores.length !== 3 || !s.scores.every((n) => int(n, 0, 1e3))) return false;
    if (!Array.isArray(s.walls) || s.walls.length < 4 || s.walls.length > 244 || !s.walls.every((w) => w && num(w.x, 0, s.width * CELL) && num(w.y, 0, s.height * CELL) && num(w.w, 1, s.width * CELL) && num(w.h, 1, s.height * CELL))) return false;
    if (!Array.isArray(s.reachable) || s.reachable.length < 1 || s.reachable.length > 120 || !s.reachable.every((p) => Array.isArray(p) && p.length === 2 && int(p[0], 0, s.width - 1) && int(p[1], 0, s.height - 1))) return false;
    const owner = (id) => s.players.some((p) => p.seat === id);
    if (!Array.isArray(s.bullets) || s.bullets.length > 200 || !s.bullets.every((b) => b && int(b.id, 1, s.nextId - 1) && owner(b.owner) && ["bullet", "fragment", ...WEAPONS2].includes(b.kind) && num(b.x, -10, s.width * CELL + 10) && num(b.y, -10, s.height * CELL + 10) && num(b.vx, -6, 6) && num(b.vy, -6, 6) && num(b.angle, -Math.PI * 1e3, Math.PI * 1e3) && int(b.born, 0, s.tick) && int(b.until, 0, ROUND_TICKS2 + 250) && int(b.armedAt, 0, ROUND_TICKS2 + 20) && int(b.bounces, 0, 1e4))) return false;
    if (!Array.isArray(s.crates) || s.crates.length > 3 || !s.crates.every((c) => c && int(c.id, 1, s.nextId - 1) && num(c.x, 0, s.width * CELL) && num(c.y, 0, s.height * CELL) && WEAPONS2.includes(c.weapon))) return false;
    return Array.isArray(s.rays) && s.rays.length <= 3 && s.rays.every((r) => r && int(r.id, 1, s.nextId - 1) && owner(r.owner) && ["laser", "deathRay"].includes(r.kind) && int(r.until, 0, ROUND_TICKS2 + 30) && Array.isArray(r.points) && r.points.length <= 100 && r.points.every((p) => Array.isArray(p) && p.length === 2 && num(p[0], -1, s.width * CELL + 1) && num(p[1], -1, s.height * CELL + 1)));
  }
  var art = /* @__PURE__ */ new Map();
  function sprite(ctx, name, x, y, size) {
    let img2 = art.get(name);
    if (!img2) {
      img2 = new Image();
      img2.src = "/expanded/assets/tank/" + name + ".png";
      art.set(name, img2);
    }
    if (!img2.complete || !img2.naturalWidth) return false;
    ctx.drawImage(img2, x - size / 2, y - size / 2, size, size);
    return true;
  }
  function render(canvas, s, seat) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f0efec";
    ctx.fillRect(0, 0, 712, 490);
    ctx.fillStyle = "#30383d";
    ctx.font = "bold 22px system-ui";
    ctx.fillText("\u5766\u514B\u52A8\u8361 2", 22, 30);
    if (!s) return;
    ctx.font = "14px system-ui";
    ctx.fillText(`${Math.max(0, Math.ceil((ROUND_TICKS2 - s.tick) / HZ3))} \u79D2`, 624, 29);
    const scale = Math.min(680 / (s.width * CELL), 365 / (s.height * CELL)), left = (712 - s.width * CELL * scale) / 2, top = 48 + (365 - s.height * CELL * scale) / 2;
    ctx.save();
    ctx.translate(left, top);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#e9e7d9";
    ctx.fillRect(0, 0, s.width * CELL, s.height * CELL);
    ctx.strokeStyle = "#cbc9bd";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < s.width; x++) for (let y = 0; y < s.height; y++) ctx.strokeRect(x * CELL, y * CELL, CELL, CELL);
    for (const wall of s.walls) {
      ctx.fillStyle = "#1f2424";
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    }
    for (const c of s.crates) {
      ctx.fillStyle = "#c89753";
      ctx.fillRect(c.x - 9, c.y - 9, 18, 18);
      ctx.strokeStyle = "#695031";
      ctx.strokeRect(c.x - 9, c.y - 9, 18, 18);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(LABELS[c.weapon], c.x, c.y - 15);
    }
    for (const p of s.players) {
      if (!p.alive) {
        if (s.tick - p.diedAt < 30) {
          ctx.fillStyle = "#6d6b6866";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 12 + (s.tick - p.diedAt) / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle + Math.PI / 2);
      ctx.fillStyle = "#383c3b";
      ctx.fillRect(-11, -12, 5, 25);
      ctx.fillRect(6, -12, 5, 25);
      ctx.fillStyle = COLORS[p.seat];
      ctx.fillRect(-7, -10, 14, 20);
      ctx.strokeStyle = "#252c2a";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-7, -10, 14, 20);
      ctx.fillStyle = COLORS[p.seat];
      ctx.beginPath();
      ctx.arc(0, -1, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(-2, -20, 4, 16);
      ctx.strokeRect(-2, -20, 4, 16);
      if (p.seat === seat) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(-13, -14, 26, 29);
      }
      ctx.restore();
      ctx.fillStyle = COLORS[p.seat];
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`P${p.seat}`, p.x, p.y + 24);
      if (p.charge) {
        ctx.strokeStyle = p.weapon === "deathRay" ? "#f062a4" : "#fa4729";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14 + p.charge / 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const b of s.bullets) {
      const name = b.kind === "fragment" ? "bullet" : b.kind === "remote" ? "remote" : b.kind;
      if (!sprite(ctx, name + "-1", b.x, b.y, b.kind === "bullet" || b.kind === "fragment" ? 4 : 10)) {
        ctx.fillStyle = b.kind === "mine" ? "#b2594d" : "#292c2b";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.kind === "bullet" || b.kind === "fragment" ? 2 : 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const r of s.rays) {
      ctx.strokeStyle = r.kind === "deathRay" ? "#f267b7cc" : "#ef454acc";
      ctx.lineWidth = r.kind === "deathRay" ? 6 : 3;
      ctx.beginPath();
      r.points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.stroke();
    }
    ctx.restore();
    ctx.textAlign = "left";
    ctx.font = "bold 14px system-ui";
    for (const p of s.players) {
      ctx.fillStyle = COLORS[p.seat];
      ctx.fillText(`P${p.seat}  ${s.scores[p.seat - 1]}\u5206  ${LABELS[p.weapon]}${p.alive ? "" : " \xB7 \u5DF2\u51FB\u6BC1"}`, 28 + (p.seat - 1) * 233, 455);
    }
    ctx.fillStyle = "#68716f";
    ctx.font = "12px system-ui";
    ctx.fillText("\u5DE6\u53F3\u8F6C\u5411 \xB7 \u4E0A\u4E0B\u524D\u8FDB\u540E\u9000 \xB7 \u7A7A\u683C\u5F00\u706B \xB7 J \u9065\u63A7 / \u5F15\u7206\u788E\u7247\u5F39", 28, 478);
    if (s.phase !== "playing") {
      ctx.fillStyle = "#f3f1e5ed";
      ctx.fillRect(120, 168, 472, 150);
      ctx.fillStyle = "#333a36";
      ctx.textAlign = "center";
      ctx.font = "bold 30px system-ui";
      ctx.fillText(s.phase === "waiting" ? "\u51C6\u5907\u5F00\u5C40" : s.winner === null ? "\u5E73\u5C40" : `P${s.winner} \u83B7\u80DC`, 356, 234);
      ctx.font = "16px system-ui";
      ctx.fillText(s.phase === "waiting" ? "\u81F3\u5C11\u4E24\u4EBA\u5165\u5EA7\u5E76\u51C6\u5907" : "\u672C\u5C40\u7ED3\u675F\uFF0C\u51C6\u5907\u4E0B\u4E00\u5C40", 356, 269);
      ctx.textAlign = "left";
    }
  }
  var adapter = {
    id: "137953-server",
    title: "\u5766\u514B\u52A8\u83612",
    seats: 3,
    hz: HZ3,
    width: 712,
    height: 490,
    create,
    step,
    valid,
    render,
    controls: "\u5DE6\u53F3 / AD \u8F6C\u5411\uFF1B\u4E0A\u4E0B / WS \u524D\u8FDB\u540E\u9000\uFF1B\u7A7A\u683C\u5F00\u706B\uFF1BJ / Shift \u5F15\u7206\u788E\u7247\u5F39\u3001\u63A7\u5236\u9065\u63A7\u5BFC\u5F39",
    maps: [{ id: "random", label: "\u539F\u7248\u968F\u673A\u8FF7\u5BAB" }, { id: "compact", label: "\u5C0F\u578B\u8FF7\u5BAB" }, { id: "large", label: "\u5927\u578B\u8FF7\u5BAB" }],
    consumeInput(s, seat, input) {
      const p = s.players.find((p2) => p2.seat === seat);
      if (p) {
        p.lastAttack = Math.max(p.lastAttack, input.attack);
        p.lastAlt = Math.max(p.lastAlt, input.alt);
      }
    }
  };

  // src/expanded/bomb2-maps.ts
  var MAPS = [{ "id": "mine-one", "theme": "mine", "begin": 1, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/MineMapData.as", "method": "setMineOne", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 6, 1, 0.5], ["setNull", 7, 1, 0.5], ["setNull", 8, 1, 0.5], ["setNull", 9, 1, 0.5], ["setNull", 10, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 3, 2, 0.5], ["setNull", 8, 2, 0.5], ["setNull", 13, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 3, 3, 0.5], ["setNull", 13, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 1, 4, 0.5], ["setNull", 8, 4, 0.5], ["setNull", 15, 4, 0.5], ["setNull", 1, 5, 0.5], ["setNull", 2, 5, 0.5], ["setNull", 3, 5, 0.5], ["setNull", 6, 5, 0.5], ["setNull", 7, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 9, 5, 0.5], ["setNull", 10, 5, 0.5], ["setNull", 13, 5, 0.5], ["setNull", 14, 5, 0.5], ["setNull", 15, 5, 0.5], ["setNull", 1, 6, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 15, 6, 0.5], ["setNull", 3, 7, 0.5], ["setNull", 5, 7, 0.5], ["setNull", 6, 7, 0.5], ["setNull", 10, 7, 0.5], ["setNull", 11, 7, 0.5], ["setNull", 13, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 6, 13, 0.5], ["setNull", 7, 13, 0.5], ["setNull", 8, 13, 0.5], ["setNull", 9, 13, 0.5], ["setNull", 10, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 3, 12, 0.5], ["setNull", 8, 12, 0.5], ["setNull", 13, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 3, 11, 0.5], ["setNull", 13, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 1, 10, 0.5], ["setNull", 8, 10, 0.5], ["setNull", 15, 10, 0.5], ["setNull", 1, 9, 0.5], ["setNull", 2, 9, 0.5], ["setNull", 3, 9, 0.5], ["setNull", 6, 9, 0.5], ["setNull", 7, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 9, 9, 0.5], ["setNull", 10, 9, 0.5], ["setNull", 13, 9, 0.5], ["setNull", 14, 9, 0.5], ["setNull", 15, 9, 0.5], ["setNull", 1, 8, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setNull", 15, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 6, 1, 0.5], ["setUnfixedProb", 7, 1, 0.5], ["setUnfixedProb", 8, 1, 0.5], ["setUnfixedProb", 9, 1, 0.5], ["setUnfixedProb", 10, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 3, 2, 0.5], ["setUnfixedProb", 8, 2, 0.5], ["setUnfixedProb", 13, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 3, 3, 0.5], ["setUnfixedProb", 13, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 1, 4, 0.5], ["setUnfixedProb", 8, 4, 0.5], ["setUnfixedProb", 15, 4, 0.5], ["setUnfixedProb", 1, 5, 0.5], ["setUnfixedProb", 2, 5, 0.5], ["setUnfixedProb", 3, 5, 0.5], ["setUnfixedProb", 6, 5, 0.5], ["setUnfixedProb", 7, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 9, 5, 0.5], ["setUnfixedProb", 10, 5, 0.5], ["setUnfixedProb", 13, 5, 0.5], ["setUnfixedProb", 14, 5, 0.5], ["setUnfixedProb", 15, 5, 0.5], ["setUnfixedProb", 1, 6, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 15, 6, 0.5], ["setUnfixedProb", 3, 7, 0.5], ["setUnfixedProb", 5, 7, 0.5], ["setUnfixedProb", 6, 7, 0.5], ["setUnfixedProb", 10, 7, 0.5], ["setUnfixedProb", 11, 7, 0.5], ["setUnfixedProb", 13, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 6, 13, 0.5], ["setUnfixedProb", 7, 13, 0.5], ["setUnfixedProb", 8, 13, 0.5], ["setUnfixedProb", 9, 13, 0.5], ["setUnfixedProb", 10, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 3, 12, 0.5], ["setUnfixedProb", 8, 12, 0.5], ["setUnfixedProb", 13, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 3, 11, 0.5], ["setUnfixedProb", 13, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 1, 10, 0.5], ["setUnfixedProb", 8, 10, 0.5], ["setUnfixedProb", 15, 10, 0.5], ["setUnfixedProb", 1, 9, 0.5], ["setUnfixedProb", 2, 9, 0.5], ["setUnfixedProb", 3, 9, 0.5], ["setUnfixedProb", 6, 9, 0.5], ["setUnfixedProb", 7, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 9, 9, 0.5], ["setUnfixedProb", 10, 9, 0.5], ["setUnfixedProb", 13, 9, 0.5], ["setUnfixedProb", 14, 9, 0.5], ["setUnfixedProb", 15, 9, 0.5], ["setUnfixedProb", 1, 8, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 15, 8, 0.5], ["setUnfixedProb", 5, 1, 0.3], ["setUnfixedProb", 11, 1, 0.3], ["setUnfixedProb", 5, 2, 0.3], ["setUnfixedProb", 11, 2, 0.3], ["setUnfixedProb", 2, 3, 0.3], ["setUnfixedProb", 14, 3, 0.3], ["setUnfixedProb", 6, 4, 0.3], ["setUnfixedProb", 10, 4, 0.3], ["setUnfixedProb", 5, 5, 0.3], ["setUnfixedProb", 11, 5, 0.3], ["setUnfixedProb", 2, 7, 0.3], ["setUnfixedProb", 14, 7, 0.3], ["setUnfixedProb", 5, 13, 0.3], ["setUnfixedProb", 11, 13, 0.3], ["setUnfixedProb", 5, 12, 0.3], ["setUnfixedProb", 11, 12, 0.3], ["setUnfixedProb", 2, 11, 0.3], ["setUnfixedProb", 14, 11, 0.3], ["setUnfixedProb", 6, 10, 0.3], ["setUnfixedProb", 10, 10, 0.3], ["setUnfixedProb", 5, 9, 0.3], ["setUnfixedProb", 11, 9, 0.3], ["setFixedProb", 5, 1, 0.7], ["setFixedProb", 11, 1, 0.7], ["setFixedProb", 2, 2, 1], ["setFixedProb", 4, 2, 1], ["setFixedProb", 5, 2, 0.7], ["setFixedProb", 6, 2, 1], ["setFixedProb", 7, 2, 1], ["setFixedProb", 9, 2, 1], ["setFixedProb", 10, 2, 1], ["setFixedProb", 11, 2, 0.7], ["setFixedProb", 12, 2, 1], ["setFixedProb", 14, 2, 1], ["setFixedProb", 2, 3, 0.7], ["setFixedProb", 14, 3, 0.7], ["setFixedProb", 2, 4, 1], ["setFixedProb", 3, 4, 1], ["setFixedProb", 5, 4, 1], ["setFixedProb", 6, 4, 0.7], ["setFixedProb", 7, 4, 1], ["setFixedProb", 9, 4, 1], ["setFixedProb", 10, 4, 0.7], ["setFixedProb", 11, 4, 1], ["setFixedProb", 13, 4, 1], ["setFixedProb", 14, 4, 1], ["setFixedProb", 5, 5, 0.7], ["setFixedProb", 11, 5, 0.7], ["setFixedProb", 2, 6, 1], ["setFixedProb", 3, 6, 1], ["setFixedProb", 5, 6, 1], ["setFixedProb", 11, 6, 1], ["setFixedProb", 13, 6, 1], ["setFixedProb", 14, 6, 1], ["setFixedProb", 1, 7, 1], ["setFixedProb", 2, 7, 0.7], ["setFixedProb", 14, 7, 0.7], ["setFixedProb", 15, 7, 1], ["setFixedProb", 5, 13, 0.7], ["setFixedProb", 11, 13, 0.7], ["setFixedProb", 2, 12, 1], ["setFixedProb", 4, 12, 1], ["setFixedProb", 5, 12, 0.7], ["setFixedProb", 6, 12, 1], ["setFixedProb", 7, 12, 1], ["setFixedProb", 9, 12, 1], ["setFixedProb", 10, 12, 1], ["setFixedProb", 11, 12, 0.7], ["setFixedProb", 12, 12, 1], ["setFixedProb", 14, 12, 1], ["setFixedProb", 2, 11, 0.7], ["setFixedProb", 14, 11, 0.7], ["setFixedProb", 2, 10, 1], ["setFixedProb", 3, 10, 1], ["setFixedProb", 5, 10, 1], ["setFixedProb", 6, 10, 0.7], ["setFixedProb", 7, 10, 1], ["setFixedProb", 9, 10, 1], ["setFixedProb", 10, 10, 0.7], ["setFixedProb", 11, 10, 1], ["setFixedProb", 13, 10, 1], ["setFixedProb", 14, 10, 1], ["setFixedProb", 5, 9, 0.7], ["setFixedProb", 11, 9, 0.7], ["setFixedProb", 2, 8, 1], ["setFixedProb", 3, 8, 1], ["setFixedProb", 5, 8, 1], ["setFixedProb", 11, 8, 1], ["setFixedProb", 13, 8, 1], ["setFixedProb", 14, 8, 1]], "hazards": [{ "kind": "Rail", "x": 4, "y": 3, "dir": 3 }, { "kind": "Rail", "x": 5, "y": 3, "dir": 1 }, { "kind": "Rail", "x": 6, "y": 3, "dir": 1 }, { "kind": "Rail", "x": 7, "y": 3, "dir": 1 }, { "kind": "Rail", "x": 8, "y": 3, "dir": 1 }, { "kind": "Rail", "x": 9, "y": 3, "dir": 1 }, { "kind": "Rail", "x": 10, "y": 3, "dir": 1 }, { "kind": "Rail", "x": 11, "y": 3, "dir": 1 }, { "kind": "Rail", "x": 12, "y": 3, "dir": 4 }, { "kind": "Rail", "x": 12, "y": 4, "dir": 8 }, { "kind": "Rail", "x": 12, "y": 5, "dir": 8 }, { "kind": "Rail", "x": 12, "y": 6, "dir": 8 }, { "kind": "Rail", "x": 12, "y": 7, "dir": 8 }, { "kind": "Rail", "x": 12, "y": 8, "dir": 8 }, { "kind": "Rail", "x": 12, "y": 9, "dir": 8 }, { "kind": "Rail", "x": 12, "y": 10, "dir": 8 }, { "kind": "Rail", "x": 12, "y": 11, "dir": 5 }, { "kind": "Rail", "x": 11, "y": 11, "dir": 7 }, { "kind": "Rail", "x": 10, "y": 11, "dir": 7 }, { "kind": "Rail", "x": 9, "y": 11, "dir": 7 }, { "kind": "Rail", "x": 8, "y": 11, "dir": 7 }, { "kind": "Rail", "x": 7, "y": 11, "dir": 7 }, { "kind": "Rail", "x": 6, "y": 11, "dir": 7 }, { "kind": "Rail", "x": 5, "y": 11, "dir": 7 }, { "kind": "Rail", "x": 4, "y": 11, "dir": 6 }, { "kind": "Rail", "x": 4, "y": 10, "dir": 2 }, { "kind": "Rail", "x": 4, "y": 9, "dir": 2 }, { "kind": "Rail", "x": 4, "y": 8, "dir": 2 }, { "kind": "Rail", "x": 4, "y": 7, "dir": 2 }, { "kind": "Rail", "x": 4, "y": 6, "dir": 2 }, { "kind": "Rail", "x": 4, "y": 5, "dir": 2 }, { "kind": "Rail", "x": 4, "y": 4, "dir": 2 }] }, { "id": "mine-two", "theme": "mine", "begin": 1, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/MineMapData.as", "method": "setMineTwo", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 6, 1, 0.5], ["setNull", 7, 1, 0.5], ["setNull", 8, 1, 0.5], ["setNull", 9, 1, 0.5], ["setNull", 10, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 4, 2, 0.5], ["setNull", 5, 2, 0.5], ["setNull", 6, 2, 0.5], ["setNull", 8, 2, 0.5], ["setNull", 10, 2, 0.5], ["setNull", 11, 2, 0.5], ["setNull", 12, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 2, 3, 0.5], ["setNull", 4, 3, 0.5], ["setNull", 8, 3, 0.5], ["setNull", 12, 3, 0.5], ["setNull", 14, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 2, 4, 0.5], ["setNull", 14, 4, 0.5], ["setNull", 6, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 10, 5, 0.5], ["setNull", 1, 6, 0.5], ["setNull", 5, 6, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 11, 6, 0.5], ["setNull", 15, 6, 0.5], ["setNull", 1, 7, 0.5], ["setNull", 2, 7, 0.5], ["setNull", 4, 7, 0.5], ["setNull", 5, 7, 0.5], ["setNull", 11, 7, 0.5], ["setNull", 12, 7, 0.5], ["setNull", 14, 7, 0.5], ["setNull", 15, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 6, 13, 0.5], ["setNull", 7, 13, 0.5], ["setNull", 8, 13, 0.5], ["setNull", 9, 13, 0.5], ["setNull", 10, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 4, 12, 0.5], ["setNull", 5, 12, 0.5], ["setNull", 6, 12, 0.5], ["setNull", 8, 12, 0.5], ["setNull", 10, 12, 0.5], ["setNull", 11, 12, 0.5], ["setNull", 12, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 2, 11, 0.5], ["setNull", 4, 11, 0.5], ["setNull", 8, 11, 0.5], ["setNull", 12, 11, 0.5], ["setNull", 14, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 2, 10, 0.5], ["setNull", 14, 10, 0.5], ["setNull", 6, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 10, 9, 0.5], ["setNull", 1, 8, 0.5], ["setNull", 5, 8, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setNull", 11, 8, 0.5], ["setNull", 15, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 6, 1, 0.5], ["setUnfixedProb", 7, 1, 0.5], ["setUnfixedProb", 8, 1, 0.5], ["setUnfixedProb", 9, 1, 0.5], ["setUnfixedProb", 10, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 4, 2, 0.5], ["setUnfixedProb", 5, 2, 0.5], ["setUnfixedProb", 6, 2, 0.5], ["setUnfixedProb", 8, 2, 0.5], ["setUnfixedProb", 10, 2, 0.5], ["setUnfixedProb", 11, 2, 0.5], ["setUnfixedProb", 12, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 2, 3, 0.5], ["setUnfixedProb", 4, 3, 0.5], ["setUnfixedProb", 8, 3, 0.5], ["setUnfixedProb", 12, 3, 0.5], ["setUnfixedProb", 14, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 2, 4, 0.5], ["setUnfixedProb", 14, 4, 0.5], ["setUnfixedProb", 6, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 10, 5, 0.5], ["setUnfixedProb", 1, 6, 0.5], ["setUnfixedProb", 5, 6, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 11, 6, 0.5], ["setUnfixedProb", 15, 6, 0.5], ["setUnfixedProb", 1, 7, 0.5], ["setUnfixedProb", 2, 7, 0.5], ["setUnfixedProb", 4, 7, 0.5], ["setUnfixedProb", 5, 7, 0.5], ["setUnfixedProb", 11, 7, 0.5], ["setUnfixedProb", 12, 7, 0.5], ["setUnfixedProb", 14, 7, 0.5], ["setUnfixedProb", 15, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 6, 13, 0.5], ["setUnfixedProb", 7, 13, 0.5], ["setUnfixedProb", 8, 13, 0.5], ["setUnfixedProb", 9, 13, 0.5], ["setUnfixedProb", 10, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 4, 12, 0.5], ["setUnfixedProb", 5, 12, 0.5], ["setUnfixedProb", 6, 12, 0.5], ["setUnfixedProb", 8, 12, 0.5], ["setUnfixedProb", 10, 12, 0.5], ["setUnfixedProb", 11, 12, 0.5], ["setUnfixedProb", 12, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 2, 11, 0.5], ["setUnfixedProb", 4, 11, 0.5], ["setUnfixedProb", 8, 11, 0.5], ["setUnfixedProb", 12, 11, 0.5], ["setUnfixedProb", 14, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 2, 10, 0.5], ["setUnfixedProb", 14, 10, 0.5], ["setUnfixedProb", 6, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 10, 9, 0.5], ["setUnfixedProb", 1, 8, 0.5], ["setUnfixedProb", 5, 8, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 11, 8, 0.5], ["setUnfixedProb", 15, 8, 0.5], ["setUnfixedProb", 6, 3, 0.3], ["setUnfixedProb", 10, 3, 0.3], ["setUnfixedProb", 1, 5, 0.3], ["setUnfixedProb", 15, 5, 0.3], ["setUnfixedProb", 6, 11, 0.3], ["setUnfixedProb", 10, 11, 0.3], ["setUnfixedProb", 1, 9, 0.3], ["setUnfixedProb", 15, 9, 0.3], ["setFixedProb", 5, 1, 1], ["setFixedProb", 11, 1, 1], ["setFixedProb", 2, 2, 1], ["setFixedProb", 3, 2, 1], ["setFixedProb", 7, 2, 1], ["setFixedProb", 9, 2, 1], ["setFixedProb", 13, 2, 1], ["setFixedProb", 14, 2, 1], ["setFixedProb", 3, 3, 1], ["setFixedProb", 5, 3, 1], ["setFixedProb", 6, 3, 0.7], ["setFixedProb", 7, 3, 1], ["setFixedProb", 9, 3, 1], ["setFixedProb", 10, 3, 0.7], ["setFixedProb", 11, 3, 1], ["setFixedProb", 13, 3, 1], ["setFixedProb", 1, 4, 1], ["setFixedProb", 15, 4, 1], ["setFixedProb", 1, 5, 0.7], ["setFixedProb", 2, 5, 1], ["setFixedProb", 4, 5, 1], ["setFixedProb", 5, 5, 1], ["setFixedProb", 7, 5, 1], ["setFixedProb", 9, 5, 1], ["setFixedProb", 11, 5, 1], ["setFixedProb", 12, 5, 1], ["setFixedProb", 14, 5, 1], ["setFixedProb", 15, 5, 0.7], ["setFixedProb", 2, 6, 1], ["setFixedProb", 4, 6, 1], ["setFixedProb", 12, 6, 1], ["setFixedProb", 14, 6, 1], ["setFixedProb", 6, 7, 1], ["setFixedProb", 10, 7, 1], ["setFixedProb", 5, 13, 1], ["setFixedProb", 11, 13, 1], ["setFixedProb", 2, 12, 1], ["setFixedProb", 3, 12, 1], ["setFixedProb", 7, 12, 1], ["setFixedProb", 9, 12, 1], ["setFixedProb", 13, 12, 1], ["setFixedProb", 14, 12, 1], ["setFixedProb", 3, 11, 1], ["setFixedProb", 5, 11, 1], ["setFixedProb", 6, 11, 0.7], ["setFixedProb", 7, 11, 1], ["setFixedProb", 9, 11, 1], ["setFixedProb", 10, 11, 0.7], ["setFixedProb", 11, 11, 1], ["setFixedProb", 13, 11, 1], ["setFixedProb", 1, 10, 1], ["setFixedProb", 15, 10, 1], ["setFixedProb", 1, 9, 0.7], ["setFixedProb", 2, 9, 1], ["setFixedProb", 4, 9, 1], ["setFixedProb", 5, 9, 1], ["setFixedProb", 7, 9, 1], ["setFixedProb", 9, 9, 1], ["setFixedProb", 11, 9, 1], ["setFixedProb", 12, 9, 1], ["setFixedProb", 14, 9, 1], ["setFixedProb", 15, 9, 0.7], ["setFixedProb", 2, 8, 1], ["setFixedProb", 4, 8, 1], ["setFixedProb", 12, 8, 1], ["setFixedProb", 14, 8, 1]], "hazards": [{ "kind": "Rail", "x": 3, "y": 4, "dir": 3 }, { "kind": "Rail", "x": 4, "y": 4, "dir": 1 }, { "kind": "Rail", "x": 5, "y": 4, "dir": 1 }, { "kind": "Rail", "x": 6, "y": 4, "dir": 1 }, { "kind": "Rail", "x": 7, "y": 4, "dir": 1 }, { "kind": "Rail", "x": 8, "y": 4, "dir": 1 }, { "kind": "Rail", "x": 9, "y": 4, "dir": 1 }, { "kind": "Rail", "x": 10, "y": 4, "dir": 1 }, { "kind": "Rail", "x": 11, "y": 4, "dir": 1 }, { "kind": "Rail", "x": 12, "y": 4, "dir": 1 }, { "kind": "Rail", "x": 13, "y": 4, "dir": 4 }, { "kind": "Rail", "x": 13, "y": 5, "dir": 8 }, { "kind": "Rail", "x": 13, "y": 6, "dir": 8 }, { "kind": "Rail", "x": 13, "y": 7, "dir": 8 }, { "kind": "Rail", "x": 13, "y": 8, "dir": 8 }, { "kind": "Rail", "x": 13, "y": 9, "dir": 8 }, { "kind": "Rail", "x": 13, "y": 10, "dir": 5 }, { "kind": "Rail", "x": 12, "y": 10, "dir": 7 }, { "kind": "Rail", "x": 11, "y": 10, "dir": 7 }, { "kind": "Rail", "x": 10, "y": 10, "dir": 7 }, { "kind": "Rail", "x": 9, "y": 10, "dir": 7 }, { "kind": "Rail", "x": 8, "y": 10, "dir": 7 }, { "kind": "Rail", "x": 7, "y": 10, "dir": 7 }, { "kind": "Rail", "x": 6, "y": 10, "dir": 7 }, { "kind": "Rail", "x": 5, "y": 10, "dir": 7 }, { "kind": "Rail", "x": 4, "y": 10, "dir": 7 }, { "kind": "Rail", "x": 3, "y": 10, "dir": 6 }, { "kind": "Rail", "x": 3, "y": 9, "dir": 2 }, { "kind": "Rail", "x": 3, "y": 8, "dir": 2 }, { "kind": "Rail", "x": 3, "y": 7, "dir": 2 }, { "kind": "Rail", "x": 3, "y": 6, "dir": 2 }, { "kind": "Rail", "x": 3, "y": 5, "dir": 2 }] }, { "id": "mine-three", "theme": "mine", "begin": 1, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/MineMapData.as", "method": "setMineThree", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 5, 1, 0.5], ["setNull", 6, 1, 0.5], ["setNull", 8, 1, 0.5], ["setNull", 10, 1, 0.5], ["setNull", 11, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 6, 2, 0.5], ["setNull", 10, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 2, 3, 0.5], ["setNull", 3, 3, 0.5], ["setNull", 4, 3, 0.5], ["setNull", 5, 3, 0.5], ["setNull", 11, 3, 0.5], ["setNull", 12, 3, 0.5], ["setNull", 13, 3, 0.5], ["setNull", 14, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 1, 4, 0.5], ["setNull", 15, 4, 0.5], ["setNull", 1, 5, 0.5], ["setNull", 2, 5, 0.5], ["setNull", 3, 5, 0.5], ["setNull", 7, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 9, 5, 0.5], ["setNull", 13, 5, 0.5], ["setNull", 14, 5, 0.5], ["setNull", 15, 5, 0.5], ["setNull", 1, 6, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 15, 6, 0.5], ["setNull", 6, 7, 0.5], ["setNull", 10, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 5, 13, 0.5], ["setNull", 6, 13, 0.5], ["setNull", 8, 13, 0.5], ["setNull", 10, 13, 0.5], ["setNull", 11, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 6, 12, 0.5], ["setNull", 10, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 2, 11, 0.5], ["setNull", 3, 11, 0.5], ["setNull", 4, 11, 0.5], ["setNull", 5, 11, 0.5], ["setNull", 11, 11, 0.5], ["setNull", 12, 11, 0.5], ["setNull", 13, 11, 0.5], ["setNull", 14, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 1, 10, 0.5], ["setNull", 15, 10, 0.5], ["setNull", 1, 9, 0.5], ["setNull", 2, 9, 0.5], ["setNull", 3, 9, 0.5], ["setNull", 7, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 9, 9, 0.5], ["setNull", 13, 9, 0.5], ["setNull", 14, 9, 0.5], ["setNull", 15, 9, 0.5], ["setNull", 1, 8, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setNull", 15, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 5, 1, 0.5], ["setUnfixedProb", 6, 1, 0.5], ["setUnfixedProb", 8, 1, 0.5], ["setUnfixedProb", 10, 1, 0.5], ["setUnfixedProb", 11, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 6, 2, 0.5], ["setUnfixedProb", 10, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 2, 3, 0.5], ["setUnfixedProb", 3, 3, 0.5], ["setUnfixedProb", 4, 3, 0.5], ["setUnfixedProb", 5, 3, 0.5], ["setUnfixedProb", 11, 3, 0.5], ["setUnfixedProb", 12, 3, 0.5], ["setUnfixedProb", 13, 3, 0.5], ["setUnfixedProb", 14, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 1, 4, 0.5], ["setUnfixedProb", 15, 4, 0.5], ["setUnfixedProb", 1, 5, 0.5], ["setUnfixedProb", 2, 5, 0.5], ["setUnfixedProb", 3, 5, 0.5], ["setUnfixedProb", 7, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 9, 5, 0.5], ["setUnfixedProb", 13, 5, 0.5], ["setUnfixedProb", 14, 5, 0.5], ["setUnfixedProb", 15, 5, 0.5], ["setUnfixedProb", 1, 6, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 15, 6, 0.5], ["setUnfixedProb", 6, 7, 0.5], ["setUnfixedProb", 10, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 5, 13, 0.5], ["setUnfixedProb", 6, 13, 0.5], ["setUnfixedProb", 8, 13, 0.5], ["setUnfixedProb", 10, 13, 0.5], ["setUnfixedProb", 11, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 6, 12, 0.5], ["setUnfixedProb", 10, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 2, 11, 0.5], ["setUnfixedProb", 3, 11, 0.5], ["setUnfixedProb", 4, 11, 0.5], ["setUnfixedProb", 5, 11, 0.5], ["setUnfixedProb", 11, 11, 0.5], ["setUnfixedProb", 12, 11, 0.5], ["setUnfixedProb", 13, 11, 0.5], ["setUnfixedProb", 14, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 1, 10, 0.5], ["setUnfixedProb", 15, 10, 0.5], ["setUnfixedProb", 1, 9, 0.5], ["setUnfixedProb", 2, 9, 0.5], ["setUnfixedProb", 3, 9, 0.5], ["setUnfixedProb", 7, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 9, 9, 0.5], ["setUnfixedProb", 13, 9, 0.5], ["setUnfixedProb", 14, 9, 0.5], ["setUnfixedProb", 15, 9, 0.5], ["setUnfixedProb", 1, 8, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 15, 8, 0.5], ["setUnfixedProb", 3, 2, 0.3], ["setUnfixedProb", 13, 2, 0.3], ["setUnfixedProb", 3, 4, 0.3], ["setUnfixedProb", 13, 4, 0.3], ["setUnfixedProb", 1, 7, 0.3], ["setUnfixedProb", 2, 7, 0.3], ["setUnfixedProb", 14, 7, 0.3], ["setUnfixedProb", 15, 7, 0.3], ["setUnfixedProb", 3, 12, 0.3], ["setUnfixedProb", 13, 12, 0.3], ["setUnfixedProb", 3, 10, 0.3], ["setUnfixedProb", 13, 10, 0.3], ["setFixedProb", 7, 1, 1], ["setFixedProb", 9, 1, 1], ["setFixedProb", 2, 2, 1], ["setFixedProb", 3, 2, 0.7], ["setFixedProb", 4, 2, 1], ["setFixedProb", 5, 2, 1], ["setFixedProb", 11, 2, 1], ["setFixedProb", 12, 2, 1], ["setFixedProb", 13, 2, 0.7], ["setFixedProb", 14, 2, 1], ["setFixedProb", 6, 3, 1], ["setFixedProb", 8, 3, 1], ["setFixedProb", 10, 3, 1], ["setFixedProb", 2, 4, 1], ["setFixedProb", 3, 4, 0.7], ["setFixedProb", 4, 4, 1], ["setFixedProb", 8, 4, 1], ["setFixedProb", 12, 4, 1], ["setFixedProb", 13, 4, 0.7], ["setFixedProb", 14, 4, 1], ["setFixedProb", 4, 5, 1], ["setFixedProb", 6, 5, 1], ["setFixedProb", 10, 5, 1], ["setFixedProb", 12, 5, 1], ["setFixedProb", 2, 6, 1], ["setFixedProb", 14, 6, 1], ["setFixedProb", 1, 7, 0.7], ["setFixedProb", 2, 7, 0.7], ["setFixedProb", 4, 7, 1], ["setFixedProb", 5, 7, 1], ["setFixedProb", 11, 7, 1], ["setFixedProb", 12, 7, 1], ["setFixedProb", 14, 7, 0.7], ["setFixedProb", 15, 7, 0.7], ["setFixedProb", 7, 13, 1], ["setFixedProb", 9, 13, 1], ["setFixedProb", 2, 12, 1], ["setFixedProb", 3, 12, 0.7], ["setFixedProb", 4, 12, 1], ["setFixedProb", 5, 12, 1], ["setFixedProb", 11, 12, 1], ["setFixedProb", 12, 12, 1], ["setFixedProb", 13, 12, 0.7], ["setFixedProb", 14, 12, 1], ["setFixedProb", 6, 11, 1], ["setFixedProb", 8, 11, 1], ["setFixedProb", 10, 11, 1], ["setFixedProb", 2, 10, 1], ["setFixedProb", 3, 10, 0.7], ["setFixedProb", 4, 10, 1], ["setFixedProb", 8, 10, 1], ["setFixedProb", 12, 10, 1], ["setFixedProb", 13, 10, 0.7], ["setFixedProb", 14, 10, 1], ["setFixedProb", 4, 9, 1], ["setFixedProb", 6, 9, 1], ["setFixedProb", 10, 9, 1], ["setFixedProb", 12, 9, 1], ["setFixedProb", 2, 8, 1], ["setFixedProb", 14, 8, 1]], "hazards": [{ "kind": "Rail", "x": 7, "y": 2, "dir": 3 }, { "kind": "Rail", "x": 8, "y": 2, "dir": 1 }, { "kind": "Rail", "x": 9, "y": 2, "dir": 4 }, { "kind": "Rail", "x": 9, "y": 3, "dir": 8 }, { "kind": "Rail", "x": 9, "y": 4, "dir": 12 }, { "kind": "Rail", "x": 10, "y": 4, "dir": 1 }, { "kind": "Rail", "x": 11, "y": 4, "dir": 4 }, { "kind": "Rail", "x": 11, "y": 5, "dir": 8 }, { "kind": "Rail", "x": 11, "y": 6, "dir": 12 }, { "kind": "Rail", "x": 12, "y": 6, "dir": 1 }, { "kind": "Rail", "x": 13, "y": 6, "dir": 4 }, { "kind": "Rail", "x": 13, "y": 7, "dir": 8 }, { "kind": "Rail", "x": 13, "y": 8, "dir": 5 }, { "kind": "Rail", "x": 12, "y": 8, "dir": 7 }, { "kind": "Rail", "x": 11, "y": 8, "dir": 10 }, { "kind": "Rail", "x": 11, "y": 9, "dir": 8 }, { "kind": "Rail", "x": 11, "y": 10, "dir": 5 }, { "kind": "Rail", "x": 10, "y": 10, "dir": 7 }, { "kind": "Rail", "x": 9, "y": 10, "dir": 10 }, { "kind": "Rail", "x": 9, "y": 11, "dir": 8 }, { "kind": "Rail", "x": 9, "y": 12, "dir": 5 }, { "kind": "Rail", "x": 8, "y": 12, "dir": 7 }, { "kind": "Rail", "x": 7, "y": 12, "dir": 6 }, { "kind": "Rail", "x": 7, "y": 11, "dir": 2 }, { "kind": "Rail", "x": 7, "y": 10, "dir": 9 }, { "kind": "Rail", "x": 6, "y": 10, "dir": 7 }, { "kind": "Rail", "x": 5, "y": 10, "dir": 6 }, { "kind": "Rail", "x": 5, "y": 9, "dir": 2 }, { "kind": "Rail", "x": 5, "y": 8, "dir": 9 }, { "kind": "Rail", "x": 4, "y": 8, "dir": 7 }, { "kind": "Rail", "x": 3, "y": 8, "dir": 6 }, { "kind": "Rail", "x": 3, "y": 7, "dir": 2 }, { "kind": "Rail", "x": 3, "y": 6, "dir": 3 }, { "kind": "Rail", "x": 4, "y": 6, "dir": 1 }, { "kind": "Rail", "x": 5, "y": 6, "dir": 11 }, { "kind": "Rail", "x": 5, "y": 5, "dir": 2 }, { "kind": "Rail", "x": 5, "y": 4, "dir": 3 }, { "kind": "Rail", "x": 6, "y": 4, "dir": 1 }, { "kind": "Rail", "x": 7, "y": 4, "dir": 11 }, { "kind": "Rail", "x": 7, "y": 3, "dir": 2 }] }, { "id": "beach-one", "theme": "beach", "begin": 11, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/BeachMapData.as", "method": "setBeachOne", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 3, 3, 1], ["setNull", 4, 2, 1], ["setNull", 4, 4, 1], ["setNull", 5, 3, 1], ["setNull", 11, 3, 1], ["setNull", 12, 2, 1], ["setNull", 12, 4, 1], ["setNull", 13, 3, 1], ["setNull", 3, 11, 1], ["setNull", 4, 10, 1], ["setNull", 4, 12, 1], ["setNull", 5, 11, 1], ["setNull", 11, 11, 1], ["setNull", 12, 10, 1], ["setNull", 12, 12, 1], ["setNull", 13, 11, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 5, 1, 0.5], ["setNull", 6, 1, 0.5], ["setNull", 7, 1, 0.5], ["setNull", 9, 1, 0.5], ["setNull", 10, 1, 0.5], ["setNull", 11, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 7, 2, 0.5], ["setNull", 9, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 2, 3, 0.5], ["setNull", 6, 3, 0.5], ["setNull", 7, 3, 0.5], ["setNull", 8, 3, 0.5], ["setNull", 9, 3, 0.5], ["setNull", 10, 3, 0.5], ["setNull", 14, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 1, 4, 0.5], ["setNull", 6, 4, 0.5], ["setNull", 10, 4, 0.5], ["setNull", 15, 4, 0.5], ["setNull", 1, 5, 0.5], ["setNull", 2, 5, 0.5], ["setNull", 3, 5, 0.5], ["setNull", 4, 5, 0.5], ["setNull", 6, 5, 0.5], ["setNull", 7, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 9, 5, 0.5], ["setNull", 10, 5, 0.5], ["setNull", 12, 5, 0.5], ["setNull", 13, 5, 0.5], ["setNull", 14, 5, 0.5], ["setNull", 15, 5, 0.5], ["setNull", 2, 6, 0.5], ["setNull", 4, 6, 0.5], ["setNull", 5, 6, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 11, 6, 0.5], ["setNull", 12, 6, 0.5], ["setNull", 14, 6, 0.5], ["setNull", 1, 7, 0.5], ["setNull", 2, 7, 0.5], ["setNull", 6, 7, 0.5], ["setNull", 10, 7, 0.5], ["setNull", 14, 7, 0.5], ["setNull", 15, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 5, 13, 0.5], ["setNull", 6, 13, 0.5], ["setNull", 7, 13, 0.5], ["setNull", 9, 13, 0.5], ["setNull", 10, 13, 0.5], ["setNull", 11, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 7, 12, 0.5], ["setNull", 9, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 2, 11, 0.5], ["setNull", 6, 11, 0.5], ["setNull", 7, 11, 0.5], ["setNull", 8, 11, 0.5], ["setNull", 9, 11, 0.5], ["setNull", 10, 11, 0.5], ["setNull", 14, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 1, 10, 0.5], ["setNull", 6, 10, 0.5], ["setNull", 10, 10, 0.5], ["setNull", 15, 10, 0.5], ["setNull", 1, 9, 0.5], ["setNull", 2, 9, 0.5], ["setNull", 3, 9, 0.5], ["setNull", 4, 9, 0.5], ["setNull", 6, 9, 0.5], ["setNull", 7, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 9, 9, 0.5], ["setNull", 10, 9, 0.5], ["setNull", 12, 9, 0.5], ["setNull", 13, 9, 0.5], ["setNull", 14, 9, 0.5], ["setNull", 15, 9, 0.5], ["setNull", 2, 8, 0.5], ["setNull", 4, 8, 0.5], ["setNull", 5, 8, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setNull", 11, 8, 0.5], ["setNull", 12, 8, 0.5], ["setNull", 14, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 5, 1, 0.5], ["setUnfixedProb", 6, 1, 0.5], ["setUnfixedProb", 7, 1, 0.5], ["setUnfixedProb", 9, 1, 0.5], ["setUnfixedProb", 10, 1, 0.5], ["setUnfixedProb", 11, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 7, 2, 0.5], ["setUnfixedProb", 9, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 2, 3, 0.5], ["setUnfixedProb", 6, 3, 0.5], ["setUnfixedProb", 7, 3, 0.5], ["setUnfixedProb", 8, 3, 0.5], ["setUnfixedProb", 9, 3, 0.5], ["setUnfixedProb", 10, 3, 0.5], ["setUnfixedProb", 14, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 1, 4, 0.5], ["setUnfixedProb", 6, 4, 0.5], ["setUnfixedProb", 10, 4, 0.5], ["setUnfixedProb", 15, 4, 0.5], ["setUnfixedProb", 1, 5, 0.5], ["setUnfixedProb", 2, 5, 0.5], ["setUnfixedProb", 3, 5, 0.5], ["setUnfixedProb", 4, 5, 0.5], ["setUnfixedProb", 6, 5, 0.5], ["setUnfixedProb", 7, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 9, 5, 0.5], ["setUnfixedProb", 10, 5, 0.5], ["setUnfixedProb", 12, 5, 0.5], ["setUnfixedProb", 13, 5, 0.5], ["setUnfixedProb", 14, 5, 0.5], ["setUnfixedProb", 15, 5, 0.5], ["setUnfixedProb", 2, 6, 0.5], ["setUnfixedProb", 4, 6, 0.5], ["setUnfixedProb", 5, 6, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 11, 6, 0.5], ["setUnfixedProb", 12, 6, 0.5], ["setUnfixedProb", 14, 6, 0.5], ["setUnfixedProb", 1, 7, 0.5], ["setUnfixedProb", 2, 7, 0.5], ["setUnfixedProb", 6, 7, 0.5], ["setUnfixedProb", 10, 7, 0.5], ["setUnfixedProb", 14, 7, 0.5], ["setUnfixedProb", 15, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 5, 13, 0.5], ["setUnfixedProb", 6, 13, 0.5], ["setUnfixedProb", 7, 13, 0.5], ["setUnfixedProb", 9, 13, 0.5], ["setUnfixedProb", 10, 13, 0.5], ["setUnfixedProb", 11, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 7, 12, 0.5], ["setUnfixedProb", 9, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 2, 11, 0.5], ["setUnfixedProb", 6, 11, 0.5], ["setUnfixedProb", 7, 11, 0.5], ["setUnfixedProb", 8, 11, 0.5], ["setUnfixedProb", 9, 11, 0.5], ["setUnfixedProb", 10, 11, 0.5], ["setUnfixedProb", 14, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 1, 10, 0.5], ["setUnfixedProb", 6, 10, 0.5], ["setUnfixedProb", 10, 10, 0.5], ["setUnfixedProb", 15, 10, 0.5], ["setUnfixedProb", 1, 9, 0.5], ["setUnfixedProb", 2, 9, 0.5], ["setUnfixedProb", 3, 9, 0.5], ["setUnfixedProb", 4, 9, 0.5], ["setUnfixedProb", 6, 9, 0.5], ["setUnfixedProb", 7, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 9, 9, 0.5], ["setUnfixedProb", 10, 9, 0.5], ["setUnfixedProb", 12, 9, 0.5], ["setUnfixedProb", 13, 9, 0.5], ["setUnfixedProb", 14, 9, 0.5], ["setUnfixedProb", 15, 9, 0.5], ["setUnfixedProb", 2, 8, 0.5], ["setUnfixedProb", 4, 8, 0.5], ["setUnfixedProb", 5, 8, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 11, 8, 0.5], ["setUnfixedProb", 12, 8, 0.5], ["setUnfixedProb", 14, 8, 0.5], ["setUnfixedProb", 8, 4, 0.3], ["setUnfixedProb", 3, 7, 0.3], ["setUnfixedProb", 13, 7, 0.3], ["setUnfixedProb", 8, 10, 0.3], ["setFixedProb", 8, 1, 1], ["setFixedProb", 2, 2, 1], ["setFixedProb", 3, 2, 1], ["setFixedProb", 5, 2, 1], ["setFixedProb", 6, 2, 1], ["setFixedProb", 8, 2, 1], ["setFixedProb", 10, 2, 1], ["setFixedProb", 11, 2, 1], ["setFixedProb", 13, 2, 1], ["setFixedProb", 14, 2, 1], ["setFixedProb", 2, 4, 1], ["setFixedProb", 3, 4, 1], ["setFixedProb", 5, 4, 1], ["setFixedProb", 7, 4, 1], ["setFixedProb", 8, 4, 0.7], ["setFixedProb", 9, 4, 1], ["setFixedProb", 11, 4, 1], ["setFixedProb", 13, 4, 1], ["setFixedProb", 14, 4, 1], ["setFixedProb", 5, 5, 1], ["setFixedProb", 11, 5, 1], ["setFixedProb", 1, 6, 1], ["setFixedProb", 3, 6, 1], ["setFixedProb", 13, 6, 1], ["setFixedProb", 15, 6, 1], ["setFixedProb", 3, 7, 0.7], ["setFixedProb", 4, 7, 1], ["setFixedProb", 5, 7, 1], ["setFixedProb", 11, 7, 1], ["setFixedProb", 12, 7, 1], ["setFixedProb", 13, 7, 0.7], ["setFixedProb", 8, 13, 1], ["setFixedProb", 2, 12, 1], ["setFixedProb", 3, 12, 1], ["setFixedProb", 5, 12, 1], ["setFixedProb", 6, 12, 1], ["setFixedProb", 8, 12, 1], ["setFixedProb", 10, 12, 1], ["setFixedProb", 11, 12, 1], ["setFixedProb", 13, 12, 1], ["setFixedProb", 14, 12, 1], ["setFixedProb", 2, 10, 1], ["setFixedProb", 3, 10, 1], ["setFixedProb", 5, 10, 1], ["setFixedProb", 7, 10, 1], ["setFixedProb", 8, 10, 0.7], ["setFixedProb", 9, 10, 1], ["setFixedProb", 11, 10, 1], ["setFixedProb", 13, 10, 1], ["setFixedProb", 14, 10, 1], ["setFixedProb", 5, 9, 1], ["setFixedProb", 11, 9, 1], ["setFixedProb", 1, 8, 1], ["setFixedProb", 3, 8, 1], ["setFixedProb", 13, 8, 1], ["setFixedProb", 15, 8, 1]], "hazards": [{ "kind": "QuickSand", "x": 4, "y": 3, "dir": 1, "target": 1 }, { "kind": "QuickSand", "x": 12, "y": 11, "dir": 1, "target": 0 }, { "kind": "QuickSand", "x": 12, "y": 3, "dir": 2, "target": 3 }, { "kind": "QuickSand", "x": 4, "y": 11, "dir": 2, "target": 2 }] }, { "id": "beach-two", "theme": "beach", "begin": 11, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/BeachMapData.as", "method": "setBeachTwo", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 2, 4, 1], ["setNull", 3, 3, 1], ["setNull", 3, 5, 1], ["setNull", 4, 4, 1], ["setNull", 12, 4, 1], ["setNull", 13, 3, 1], ["setNull", 13, 5, 1], ["setNull", 14, 4, 1], ["setNull", 2, 10, 1], ["setNull", 3, 9, 1], ["setNull", 3, 11, 1], ["setNull", 4, 10, 1], ["setNull", 12, 10, 1], ["setNull", 13, 9, 1], ["setNull", 13, 11, 1], ["setNull", 14, 10, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 5, 1, 0.5], ["setNull", 6, 1, 0.5], ["setNull", 7, 1, 0.5], ["setNull", 9, 1, 0.5], ["setNull", 10, 1, 0.5], ["setNull", 11, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 3, 2, 0.5], ["setNull", 6, 2, 0.5], ["setNull", 10, 2, 0.5], ["setNull", 13, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 5, 3, 0.5], ["setNull", 6, 3, 0.5], ["setNull", 7, 3, 0.5], ["setNull", 8, 3, 0.5], ["setNull", 9, 3, 0.5], ["setNull", 10, 3, 0.5], ["setNull", 11, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 1, 4, 0.5], ["setNull", 5, 4, 0.5], ["setNull", 11, 4, 0.5], ["setNull", 15, 4, 0.5], ["setNull", 1, 5, 0.5], ["setNull", 5, 5, 0.5], ["setNull", 6, 5, 0.5], ["setNull", 7, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 9, 5, 0.5], ["setNull", 10, 5, 0.5], ["setNull", 11, 5, 0.5], ["setNull", 15, 5, 0.5], ["setNull", 1, 6, 0.5], ["setNull", 2, 6, 0.5], ["setNull", 3, 6, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 13, 6, 0.5], ["setNull", 14, 6, 0.5], ["setNull", 15, 6, 0.5], ["setNull", 3, 7, 0.5], ["setNull", 4, 7, 0.5], ["setNull", 5, 7, 0.5], ["setNull", 6, 7, 0.5], ["setNull", 10, 7, 0.5], ["setNull", 11, 7, 0.5], ["setNull", 12, 7, 0.5], ["setNull", 13, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 5, 13, 0.5], ["setNull", 6, 13, 0.5], ["setNull", 7, 13, 0.5], ["setNull", 9, 13, 0.5], ["setNull", 10, 13, 0.5], ["setNull", 11, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 3, 12, 0.5], ["setNull", 6, 12, 0.5], ["setNull", 10, 12, 0.5], ["setNull", 13, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 5, 11, 0.5], ["setNull", 6, 11, 0.5], ["setNull", 7, 11, 0.5], ["setNull", 8, 11, 0.5], ["setNull", 9, 11, 0.5], ["setNull", 10, 11, 0.5], ["setNull", 11, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 1, 10, 0.5], ["setNull", 5, 10, 0.5], ["setNull", 11, 10, 0.5], ["setNull", 15, 10, 0.5], ["setNull", 1, 9, 0.5], ["setNull", 5, 9, 0.5], ["setNull", 6, 9, 0.5], ["setNull", 7, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 9, 9, 0.5], ["setNull", 10, 9, 0.5], ["setNull", 11, 9, 0.5], ["setNull", 15, 9, 0.5], ["setNull", 1, 8, 0.5], ["setNull", 2, 8, 0.5], ["setNull", 3, 8, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setNull", 13, 8, 0.5], ["setNull", 14, 8, 0.5], ["setNull", 15, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 5, 1, 0.5], ["setUnfixedProb", 6, 1, 0.5], ["setUnfixedProb", 7, 1, 0.5], ["setUnfixedProb", 9, 1, 0.5], ["setUnfixedProb", 10, 1, 0.5], ["setUnfixedProb", 11, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 3, 2, 0.5], ["setUnfixedProb", 6, 2, 0.5], ["setUnfixedProb", 10, 2, 0.5], ["setUnfixedProb", 13, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 5, 3, 0.5], ["setUnfixedProb", 6, 3, 0.5], ["setUnfixedProb", 7, 3, 0.5], ["setUnfixedProb", 8, 3, 0.5], ["setUnfixedProb", 9, 3, 0.5], ["setUnfixedProb", 10, 3, 0.5], ["setUnfixedProb", 11, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 1, 4, 0.5], ["setUnfixedProb", 5, 4, 0.5], ["setUnfixedProb", 11, 4, 0.5], ["setUnfixedProb", 15, 4, 0.5], ["setUnfixedProb", 1, 5, 0.5], ["setUnfixedProb", 5, 5, 0.5], ["setUnfixedProb", 6, 5, 0.5], ["setUnfixedProb", 7, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 9, 5, 0.5], ["setUnfixedProb", 10, 5, 0.5], ["setUnfixedProb", 11, 5, 0.5], ["setUnfixedProb", 15, 5, 0.5], ["setUnfixedProb", 1, 6, 0.5], ["setUnfixedProb", 2, 6, 0.5], ["setUnfixedProb", 3, 6, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 13, 6, 0.5], ["setUnfixedProb", 14, 6, 0.5], ["setUnfixedProb", 15, 6, 0.5], ["setUnfixedProb", 3, 7, 0.5], ["setUnfixedProb", 4, 7, 0.5], ["setUnfixedProb", 5, 7, 0.5], ["setUnfixedProb", 6, 7, 0.5], ["setUnfixedProb", 10, 7, 0.5], ["setUnfixedProb", 11, 7, 0.5], ["setUnfixedProb", 12, 7, 0.5], ["setUnfixedProb", 13, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 5, 13, 0.5], ["setUnfixedProb", 6, 13, 0.5], ["setUnfixedProb", 7, 13, 0.5], ["setUnfixedProb", 9, 13, 0.5], ["setUnfixedProb", 10, 13, 0.5], ["setUnfixedProb", 11, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 3, 12, 0.5], ["setUnfixedProb", 6, 12, 0.5], ["setUnfixedProb", 10, 12, 0.5], ["setUnfixedProb", 13, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 5, 11, 0.5], ["setUnfixedProb", 6, 11, 0.5], ["setUnfixedProb", 7, 11, 0.5], ["setUnfixedProb", 8, 11, 0.5], ["setUnfixedProb", 9, 11, 0.5], ["setUnfixedProb", 10, 11, 0.5], ["setUnfixedProb", 11, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 1, 10, 0.5], ["setUnfixedProb", 5, 10, 0.5], ["setUnfixedProb", 11, 10, 0.5], ["setUnfixedProb", 15, 10, 0.5], ["setUnfixedProb", 1, 9, 0.5], ["setUnfixedProb", 5, 9, 0.5], ["setUnfixedProb", 6, 9, 0.5], ["setUnfixedProb", 7, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 9, 9, 0.5], ["setUnfixedProb", 10, 9, 0.5], ["setUnfixedProb", 11, 9, 0.5], ["setUnfixedProb", 15, 9, 0.5], ["setUnfixedProb", 1, 8, 0.5], ["setUnfixedProb", 2, 8, 0.5], ["setUnfixedProb", 3, 8, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 13, 8, 0.5], ["setUnfixedProb", 14, 8, 0.5], ["setUnfixedProb", 15, 8, 0.5], ["setUnfixedProb", 8, 2, 0.3], ["setUnfixedProb", 8, 4, 0.3], ["setUnfixedProb", 8, 12, 0.3], ["setUnfixedProb", 8, 10, 0.3], ["setFixedProb", 8, 1, 1], ["setFixedProb", 2, 2, 1], ["setFixedProb", 4, 2, 1], ["setFixedProb", 5, 2, 1], ["setFixedProb", 7, 2, 1], ["setFixedProb", 8, 2, 0.7], ["setFixedProb", 9, 2, 1], ["setFixedProb", 11, 2, 1], ["setFixedProb", 12, 2, 1], ["setFixedProb", 14, 2, 1], ["setFixedProb", 2, 3, 1], ["setFixedProb", 4, 3, 1], ["setFixedProb", 12, 3, 1], ["setFixedProb", 14, 3, 1], ["setFixedProb", 6, 4, 1], ["setFixedProb", 7, 4, 1], ["setFixedProb", 8, 4, 0.7], ["setFixedProb", 9, 4, 1], ["setFixedProb", 10, 4, 1], ["setFixedProb", 2, 5, 1], ["setFixedProb", 4, 5, 1], ["setFixedProb", 12, 5, 1], ["setFixedProb", 14, 5, 1], ["setFixedProb", 4, 6, 1], ["setFixedProb", 5, 6, 1], ["setFixedProb", 11, 6, 1], ["setFixedProb", 12, 6, 1], ["setFixedProb", 1, 7, 1], ["setFixedProb", 2, 7, 1], ["setFixedProb", 14, 7, 1], ["setFixedProb", 15, 7, 1], ["setFixedProb", 8, 13, 1], ["setFixedProb", 2, 12, 1], ["setFixedProb", 4, 12, 1], ["setFixedProb", 5, 12, 1], ["setFixedProb", 7, 12, 1], ["setFixedProb", 8, 12, 0.7], ["setFixedProb", 9, 12, 1], ["setFixedProb", 11, 12, 1], ["setFixedProb", 12, 12, 1], ["setFixedProb", 14, 12, 1], ["setFixedProb", 2, 11, 1], ["setFixedProb", 4, 11, 1], ["setFixedProb", 12, 11, 1], ["setFixedProb", 14, 11, 1], ["setFixedProb", 6, 10, 1], ["setFixedProb", 7, 10, 1], ["setFixedProb", 8, 10, 0.7], ["setFixedProb", 9, 10, 1], ["setFixedProb", 10, 10, 1], ["setFixedProb", 2, 9, 1], ["setFixedProb", 4, 9, 1], ["setFixedProb", 12, 9, 1], ["setFixedProb", 14, 9, 1], ["setFixedProb", 4, 8, 1], ["setFixedProb", 5, 8, 1], ["setFixedProb", 11, 8, 1], ["setFixedProb", 12, 8, 1]], "hazards": [{ "kind": "QuickSand", "x": 3, "y": 4, "dir": 1, "target": 1 }, { "kind": "QuickSand", "x": 13, "y": 4, "dir": 1, "target": 0 }, { "kind": "QuickSand", "x": 3, "y": 10, "dir": 2, "target": 3 }, { "kind": "QuickSand", "x": 13, "y": 10, "dir": 2, "target": 2 }] }, { "id": "beach-three", "theme": "beach", "begin": 11, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/BeachMapData.as", "method": "setBeachThree", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 4, 3, 1], ["setNull", 5, 2, 1], ["setNull", 5, 4, 1], ["setNull", 6, 3, 1], ["setNull", 10, 3, 1], ["setNull", 11, 2, 1], ["setNull", 11, 4, 1], ["setNull", 12, 3, 1], ["setNull", 4, 11, 1], ["setNull", 5, 10, 1], ["setNull", 5, 12, 1], ["setNull", 6, 11, 1], ["setNull", 10, 11, 1], ["setNull", 11, 10, 1], ["setNull", 11, 12, 1], ["setNull", 12, 11, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 5, 1, 0.5], ["setNull", 6, 1, 0.5], ["setNull", 7, 1, 0.5], ["setNull", 9, 1, 0.5], ["setNull", 10, 1, 0.5], ["setNull", 11, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 7, 2, 0.5], ["setNull", 9, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 2, 3, 0.5], ["setNull", 3, 3, 0.5], ["setNull", 7, 3, 0.5], ["setNull", 8, 3, 0.5], ["setNull", 9, 3, 0.5], ["setNull", 13, 3, 0.5], ["setNull", 14, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 2, 4, 0.5], ["setNull", 8, 4, 0.5], ["setNull", 14, 4, 0.5], ["setNull", 1, 5, 0.5], ["setNull", 2, 5, 0.5], ["setNull", 3, 5, 0.5], ["setNull", 5, 5, 0.5], ["setNull", 6, 5, 0.5], ["setNull", 7, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 9, 5, 0.5], ["setNull", 10, 5, 0.5], ["setNull", 11, 5, 0.5], ["setNull", 13, 5, 0.5], ["setNull", 14, 5, 0.5], ["setNull", 15, 5, 0.5], ["setNull", 3, 6, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 13, 6, 0.5], ["setNull", 1, 7, 0.5], ["setNull", 2, 7, 0.5], ["setNull", 3, 7, 0.5], ["setNull", 4, 7, 0.5], ["setNull", 5, 7, 0.5], ["setNull", 6, 7, 0.5], ["setNull", 10, 7, 0.5], ["setNull", 11, 7, 0.5], ["setNull", 12, 7, 0.5], ["setNull", 13, 7, 0.5], ["setNull", 14, 7, 0.5], ["setNull", 15, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 5, 13, 0.5], ["setNull", 6, 13, 0.5], ["setNull", 7, 13, 0.5], ["setNull", 9, 13, 0.5], ["setNull", 10, 13, 0.5], ["setNull", 11, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 7, 12, 0.5], ["setNull", 9, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 2, 11, 0.5], ["setNull", 3, 11, 0.5], ["setNull", 7, 11, 0.5], ["setNull", 8, 11, 0.5], ["setNull", 9, 11, 0.5], ["setNull", 13, 11, 0.5], ["setNull", 14, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 2, 10, 0.5], ["setNull", 8, 10, 0.5], ["setNull", 14, 10, 0.5], ["setNull", 1, 9, 0.5], ["setNull", 2, 9, 0.5], ["setNull", 3, 9, 0.5], ["setNull", 5, 9, 0.5], ["setNull", 6, 9, 0.5], ["setNull", 7, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 9, 9, 0.5], ["setNull", 10, 9, 0.5], ["setNull", 11, 9, 0.5], ["setNull", 13, 9, 0.5], ["setNull", 14, 9, 0.5], ["setNull", 15, 9, 0.5], ["setNull", 3, 8, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setNull", 13, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 5, 1, 0.5], ["setUnfixedProb", 6, 1, 0.5], ["setUnfixedProb", 7, 1, 0.5], ["setUnfixedProb", 9, 1, 0.5], ["setUnfixedProb", 10, 1, 0.5], ["setUnfixedProb", 11, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 7, 2, 0.5], ["setUnfixedProb", 9, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 2, 3, 0.5], ["setUnfixedProb", 3, 3, 0.5], ["setUnfixedProb", 7, 3, 0.5], ["setUnfixedProb", 8, 3, 0.5], ["setUnfixedProb", 9, 3, 0.5], ["setUnfixedProb", 13, 3, 0.5], ["setUnfixedProb", 14, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 2, 4, 0.5], ["setUnfixedProb", 8, 4, 0.5], ["setUnfixedProb", 14, 4, 0.5], ["setUnfixedProb", 1, 5, 0.5], ["setUnfixedProb", 2, 5, 0.5], ["setUnfixedProb", 3, 5, 0.5], ["setUnfixedProb", 5, 5, 0.5], ["setUnfixedProb", 6, 5, 0.5], ["setUnfixedProb", 7, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 9, 5, 0.5], ["setUnfixedProb", 10, 5, 0.5], ["setUnfixedProb", 11, 5, 0.5], ["setUnfixedProb", 13, 5, 0.5], ["setUnfixedProb", 14, 5, 0.5], ["setUnfixedProb", 15, 5, 0.5], ["setUnfixedProb", 3, 6, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 13, 6, 0.5], ["setUnfixedProb", 1, 7, 0.5], ["setUnfixedProb", 2, 7, 0.5], ["setUnfixedProb", 3, 7, 0.5], ["setUnfixedProb", 4, 7, 0.5], ["setUnfixedProb", 5, 7, 0.5], ["setUnfixedProb", 6, 7, 0.5], ["setUnfixedProb", 10, 7, 0.5], ["setUnfixedProb", 11, 7, 0.5], ["setUnfixedProb", 12, 7, 0.5], ["setUnfixedProb", 13, 7, 0.5], ["setUnfixedProb", 14, 7, 0.5], ["setUnfixedProb", 15, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 5, 13, 0.5], ["setUnfixedProb", 6, 13, 0.5], ["setUnfixedProb", 7, 13, 0.5], ["setUnfixedProb", 9, 13, 0.5], ["setUnfixedProb", 10, 13, 0.5], ["setUnfixedProb", 11, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 7, 12, 0.5], ["setUnfixedProb", 9, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 2, 11, 0.5], ["setUnfixedProb", 3, 11, 0.5], ["setUnfixedProb", 7, 11, 0.5], ["setUnfixedProb", 8, 11, 0.5], ["setUnfixedProb", 9, 11, 0.5], ["setUnfixedProb", 13, 11, 0.5], ["setUnfixedProb", 14, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 2, 10, 0.5], ["setUnfixedProb", 8, 10, 0.5], ["setUnfixedProb", 14, 10, 0.5], ["setUnfixedProb", 1, 9, 0.5], ["setUnfixedProb", 2, 9, 0.5], ["setUnfixedProb", 3, 9, 0.5], ["setUnfixedProb", 5, 9, 0.5], ["setUnfixedProb", 6, 9, 0.5], ["setUnfixedProb", 7, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 9, 9, 0.5], ["setUnfixedProb", 10, 9, 0.5], ["setUnfixedProb", 11, 9, 0.5], ["setUnfixedProb", 13, 9, 0.5], ["setUnfixedProb", 14, 9, 0.5], ["setUnfixedProb", 15, 9, 0.5], ["setUnfixedProb", 3, 8, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 13, 8, 0.5], ["setUnfixedProb", 3, 2, 0.3], ["setUnfixedProb", 13, 2, 0.3], ["setUnfixedProb", 4, 5, 0.3], ["setUnfixedProb", 12, 5, 0.3], ["setUnfixedProb", 1, 6, 0.3], ["setUnfixedProb", 15, 6, 0.3], ["setUnfixedProb", 3, 12, 0.3], ["setUnfixedProb", 13, 12, 0.3], ["setUnfixedProb", 4, 9, 0.3], ["setUnfixedProb", 12, 9, 0.3], ["setUnfixedProb", 1, 8, 0.3], ["setUnfixedProb", 15, 8, 0.3], ["setFixedProb", 8, 1, 1], ["setFixedProb", 2, 2, 1], ["setFixedProb", 3, 2, 0.7], ["setFixedProb", 4, 2, 1], ["setFixedProb", 6, 2, 1], ["setFixedProb", 8, 2, 1], ["setFixedProb", 10, 2, 1], ["setFixedProb", 12, 2, 1], ["setFixedProb", 13, 2, 0.7], ["setFixedProb", 14, 2, 1], ["setFixedProb", 1, 4, 1], ["setFixedProb", 3, 4, 1], ["setFixedProb", 4, 4, 1], ["setFixedProb", 6, 4, 1], ["setFixedProb", 7, 4, 1], ["setFixedProb", 9, 4, 1], ["setFixedProb", 10, 4, 1], ["setFixedProb", 12, 4, 1], ["setFixedProb", 13, 4, 1], ["setFixedProb", 15, 4, 1], ["setFixedProb", 4, 5, 0.7], ["setFixedProb", 12, 5, 0.7], ["setFixedProb", 1, 6, 0.7], ["setFixedProb", 2, 6, 1], ["setFixedProb", 4, 6, 1], ["setFixedProb", 5, 6, 1], ["setFixedProb", 11, 6, 1], ["setFixedProb", 12, 6, 1], ["setFixedProb", 14, 6, 1], ["setFixedProb", 15, 6, 0.7], ["setFixedProb", 8, 13, 1], ["setFixedProb", 2, 12, 1], ["setFixedProb", 3, 12, 0.7], ["setFixedProb", 4, 12, 1], ["setFixedProb", 6, 12, 1], ["setFixedProb", 8, 12, 1], ["setFixedProb", 10, 12, 1], ["setFixedProb", 12, 12, 1], ["setFixedProb", 13, 12, 0.7], ["setFixedProb", 14, 12, 1], ["setFixedProb", 1, 10, 1], ["setFixedProb", 3, 10, 1], ["setFixedProb", 4, 10, 1], ["setFixedProb", 6, 10, 1], ["setFixedProb", 7, 10, 1], ["setFixedProb", 9, 10, 1], ["setFixedProb", 10, 10, 1], ["setFixedProb", 12, 10, 1], ["setFixedProb", 13, 10, 1], ["setFixedProb", 15, 10, 1], ["setFixedProb", 4, 9, 0.7], ["setFixedProb", 12, 9, 0.7], ["setFixedProb", 1, 8, 0.7], ["setFixedProb", 2, 8, 1], ["setFixedProb", 4, 8, 1], ["setFixedProb", 5, 8, 1], ["setFixedProb", 11, 8, 1], ["setFixedProb", 12, 8, 1], ["setFixedProb", 14, 8, 1], ["setFixedProb", 15, 8, 0.7]], "hazards": [{ "kind": "QuickSand", "x": 5, "y": 3, "dir": 1, "target": 1 }, { "kind": "QuickSand", "x": 5, "y": 11, "dir": 1, "target": 0 }, { "kind": "QuickSand", "x": 11, "y": 3, "dir": 2, "target": 3 }, { "kind": "QuickSand", "x": 11, "y": 11, "dir": 2, "target": 2 }] }, { "id": "snow-one", "theme": "snow", "begin": 21, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/SnowMapData.as", "method": "setSnowOne", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 5, 1, 0.5], ["setNull", 6, 1, 0.5], ["setNull", 7, 1, 0.5], ["setNull", 9, 1, 0.5], ["setNull", 10, 1, 0.5], ["setNull", 11, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 5, 2, 0.5], ["setNull", 11, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 2, 3, 0.5], ["setNull", 3, 3, 0.5], ["setNull", 4, 3, 0.5], ["setNull", 5, 3, 0.5], ["setNull", 11, 3, 0.5], ["setNull", 12, 3, 0.5], ["setNull", 13, 3, 0.5], ["setNull", 14, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 1, 4, 0.5], ["setNull", 4, 4, 0.5], ["setNull", 8, 4, 0.5], ["setNull", 12, 4, 0.5], ["setNull", 15, 4, 0.5], ["setNull", 3, 5, 0.5], ["setNull", 6, 5, 0.5], ["setNull", 7, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 9, 5, 0.5], ["setNull", 10, 5, 0.5], ["setNull", 13, 5, 0.5], ["setNull", 1, 6, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 15, 6, 0.5], ["setNull", 1, 7, 0.5], ["setNull", 2, 7, 0.5], ["setNull", 3, 7, 0.5], ["setNull", 5, 7, 0.5], ["setNull", 6, 7, 0.5], ["setNull", 10, 7, 0.5], ["setNull", 11, 7, 0.5], ["setNull", 13, 7, 0.5], ["setNull", 14, 7, 0.5], ["setNull", 15, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 5, 13, 0.5], ["setNull", 6, 13, 0.5], ["setNull", 7, 13, 0.5], ["setNull", 9, 13, 0.5], ["setNull", 10, 13, 0.5], ["setNull", 11, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 5, 12, 0.5], ["setNull", 11, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 2, 11, 0.5], ["setNull", 3, 11, 0.5], ["setNull", 4, 11, 0.5], ["setNull", 5, 11, 0.5], ["setNull", 11, 11, 0.5], ["setNull", 12, 11, 0.5], ["setNull", 13, 11, 0.5], ["setNull", 14, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 1, 10, 0.5], ["setNull", 4, 10, 0.5], ["setNull", 8, 10, 0.5], ["setNull", 12, 10, 0.5], ["setNull", 15, 10, 0.5], ["setNull", 3, 9, 0.5], ["setNull", 6, 9, 0.5], ["setNull", 7, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 9, 9, 0.5], ["setNull", 10, 9, 0.5], ["setNull", 13, 9, 0.5], ["setNull", 1, 8, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setNull", 15, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 5, 1, 0.5], ["setUnfixedProb", 6, 1, 0.5], ["setUnfixedProb", 7, 1, 0.5], ["setUnfixedProb", 9, 1, 0.5], ["setUnfixedProb", 10, 1, 0.5], ["setUnfixedProb", 11, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 5, 2, 0.5], ["setUnfixedProb", 11, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 2, 3, 0.5], ["setUnfixedProb", 3, 3, 0.5], ["setUnfixedProb", 4, 3, 0.5], ["setUnfixedProb", 5, 3, 0.5], ["setUnfixedProb", 11, 3, 0.5], ["setUnfixedProb", 12, 3, 0.5], ["setUnfixedProb", 13, 3, 0.5], ["setUnfixedProb", 14, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 1, 4, 0.5], ["setUnfixedProb", 4, 4, 0.5], ["setUnfixedProb", 8, 4, 0.5], ["setUnfixedProb", 12, 4, 0.5], ["setUnfixedProb", 15, 4, 0.5], ["setUnfixedProb", 3, 5, 0.5], ["setUnfixedProb", 6, 5, 0.5], ["setUnfixedProb", 7, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 9, 5, 0.5], ["setUnfixedProb", 10, 5, 0.5], ["setUnfixedProb", 13, 5, 0.5], ["setUnfixedProb", 1, 6, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 15, 6, 0.5], ["setUnfixedProb", 1, 7, 0.5], ["setUnfixedProb", 2, 7, 0.5], ["setUnfixedProb", 3, 7, 0.5], ["setUnfixedProb", 5, 7, 0.5], ["setUnfixedProb", 6, 7, 0.5], ["setUnfixedProb", 10, 7, 0.5], ["setUnfixedProb", 11, 7, 0.5], ["setUnfixedProb", 13, 7, 0.5], ["setUnfixedProb", 14, 7, 0.5], ["setUnfixedProb", 15, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 5, 13, 0.5], ["setUnfixedProb", 6, 13, 0.5], ["setUnfixedProb", 7, 13, 0.5], ["setUnfixedProb", 9, 13, 0.5], ["setUnfixedProb", 10, 13, 0.5], ["setUnfixedProb", 11, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 5, 12, 0.5], ["setUnfixedProb", 11, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 2, 11, 0.5], ["setUnfixedProb", 3, 11, 0.5], ["setUnfixedProb", 4, 11, 0.5], ["setUnfixedProb", 5, 11, 0.5], ["setUnfixedProb", 11, 11, 0.5], ["setUnfixedProb", 12, 11, 0.5], ["setUnfixedProb", 13, 11, 0.5], ["setUnfixedProb", 14, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 1, 10, 0.5], ["setUnfixedProb", 4, 10, 0.5], ["setUnfixedProb", 8, 10, 0.5], ["setUnfixedProb", 12, 10, 0.5], ["setUnfixedProb", 15, 10, 0.5], ["setUnfixedProb", 3, 9, 0.5], ["setUnfixedProb", 6, 9, 0.5], ["setUnfixedProb", 7, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 9, 9, 0.5], ["setUnfixedProb", 10, 9, 0.5], ["setUnfixedProb", 13, 9, 0.5], ["setUnfixedProb", 1, 8, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 15, 8, 0.5], ["setUnfixedProb", 8, 1, 0.3], ["setUnfixedProb", 3, 2, 0.3], ["setUnfixedProb", 7, 2, 0.3], ["setUnfixedProb", 9, 2, 0.3], ["setUnfixedProb", 13, 2, 0.3], ["setUnfixedProb", 6, 4, 0.3], ["setUnfixedProb", 10, 4, 0.3], ["setUnfixedProb", 1, 5, 0.3], ["setUnfixedProb", 2, 5, 0.3], ["setUnfixedProb", 5, 5, 0.3], ["setUnfixedProb", 11, 5, 0.3], ["setUnfixedProb", 14, 5, 0.3], ["setUnfixedProb", 15, 5, 0.3], ["setUnfixedProb", 8, 13, 0.3], ["setUnfixedProb", 3, 12, 0.3], ["setUnfixedProb", 7, 12, 0.3], ["setUnfixedProb", 9, 12, 0.3], ["setUnfixedProb", 13, 12, 0.3], ["setUnfixedProb", 6, 10, 0.3], ["setUnfixedProb", 10, 10, 0.3], ["setUnfixedProb", 1, 9, 0.3], ["setUnfixedProb", 2, 9, 0.3], ["setUnfixedProb", 5, 9, 0.3], ["setUnfixedProb", 11, 9, 0.3], ["setUnfixedProb", 14, 9, 0.3], ["setUnfixedProb", 15, 9, 0.3], ["setFixedProb", 8, 1, 0.7], ["setFixedProb", 2, 2, 1], ["setFixedProb", 3, 2, 0.7], ["setFixedProb", 4, 2, 1], ["setFixedProb", 6, 2, 1], ["setFixedProb", 7, 2, 0.7], ["setFixedProb", 8, 2, 1], ["setFixedProb", 9, 2, 0.7], ["setFixedProb", 10, 2, 1], ["setFixedProb", 12, 2, 1], ["setFixedProb", 13, 2, 0.7], ["setFixedProb", 14, 2, 1], ["setFixedProb", 2, 4, 1], ["setFixedProb", 3, 4, 1], ["setFixedProb", 5, 4, 1], ["setFixedProb", 6, 4, 0.7], ["setFixedProb", 7, 4, 1], ["setFixedProb", 9, 4, 1], ["setFixedProb", 10, 4, 0.7], ["setFixedProb", 11, 4, 1], ["setFixedProb", 13, 4, 1], ["setFixedProb", 14, 4, 1], ["setFixedProb", 1, 5, 0.7], ["setFixedProb", 2, 5, 0.7], ["setFixedProb", 5, 5, 0.7], ["setFixedProb", 11, 5, 0.7], ["setFixedProb", 14, 5, 0.7], ["setFixedProb", 15, 5, 0.7], ["setFixedProb", 2, 6, 1], ["setFixedProb", 3, 6, 1], ["setFixedProb", 5, 6, 1], ["setFixedProb", 11, 6, 1], ["setFixedProb", 13, 6, 1], ["setFixedProb", 14, 6, 1], ["setFixedProb", 8, 13, 0.7], ["setFixedProb", 2, 12, 1], ["setFixedProb", 3, 12, 0.7], ["setFixedProb", 4, 12, 1], ["setFixedProb", 6, 12, 1], ["setFixedProb", 7, 12, 0.7], ["setFixedProb", 8, 12, 1], ["setFixedProb", 9, 12, 0.7], ["setFixedProb", 10, 12, 1], ["setFixedProb", 12, 12, 1], ["setFixedProb", 13, 12, 0.7], ["setFixedProb", 14, 12, 1], ["setFixedProb", 2, 10, 1], ["setFixedProb", 3, 10, 1], ["setFixedProb", 5, 10, 1], ["setFixedProb", 6, 10, 0.7], ["setFixedProb", 7, 10, 1], ["setFixedProb", 9, 10, 1], ["setFixedProb", 10, 10, 0.7], ["setFixedProb", 11, 10, 1], ["setFixedProb", 13, 10, 1], ["setFixedProb", 14, 10, 1], ["setFixedProb", 1, 9, 0.7], ["setFixedProb", 2, 9, 0.7], ["setFixedProb", 5, 9, 0.7], ["setFixedProb", 11, 9, 0.7], ["setFixedProb", 14, 9, 0.7], ["setFixedProb", 15, 9, 0.7], ["setFixedProb", 2, 8, 1], ["setFixedProb", 3, 8, 1], ["setFixedProb", 5, 8, 1], ["setFixedProb", 11, 8, 1], ["setFixedProb", 13, 8, 1], ["setFixedProb", 14, 8, 1]], "hazards": [{ "kind": "IceFace", "x": 6, "y": 3, "dir": 0 }, { "kind": "IceFace", "x": 7, "y": 3, "dir": 0 }, { "kind": "IceFace", "x": 8, "y": 3, "dir": 0 }, { "kind": "IceFace", "x": 9, "y": 3, "dir": 0 }, { "kind": "IceFace", "x": 10, "y": 3, "dir": 0 }, { "kind": "IceFace", "x": 6, "y": 11, "dir": 0 }, { "kind": "IceFace", "x": 7, "y": 11, "dir": 0 }, { "kind": "IceFace", "x": 8, "y": 11, "dir": 0 }, { "kind": "IceFace", "x": 9, "y": 11, "dir": 0 }, { "kind": "IceFace", "x": 10, "y": 11, "dir": 0 }, { "kind": "IceFace", "x": 4, "y": 5, "dir": 0 }, { "kind": "IceFace", "x": 4, "y": 6, "dir": 0 }, { "kind": "IceFace", "x": 4, "y": 7, "dir": 0 }, { "kind": "IceFace", "x": 4, "y": 8, "dir": 0 }, { "kind": "IceFace", "x": 4, "y": 9, "dir": 0 }, { "kind": "IceFace", "x": 12, "y": 5, "dir": 0 }, { "kind": "IceFace", "x": 12, "y": 6, "dir": 0 }, { "kind": "IceFace", "x": 12, "y": 7, "dir": 0 }, { "kind": "IceFace", "x": 12, "y": 8, "dir": 0 }, { "kind": "IceFace", "x": 12, "y": 9, "dir": 0 }] }, { "id": "snow-two", "theme": "snow", "begin": 21, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/SnowMapData.as", "method": "setSnowTwo", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 6, 1, 0.5], ["setNull", 7, 1, 0.5], ["setNull", 8, 1, 0.5], ["setNull", 9, 1, 0.5], ["setNull", 10, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 3, 2, 0.5], ["setNull", 8, 2, 0.5], ["setNull", 13, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 3, 3, 0.5], ["setNull", 7, 3, 0.5], ["setNull", 8, 3, 0.5], ["setNull", 9, 3, 0.5], ["setNull", 13, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 1, 4, 0.5], ["setNull", 3, 4, 0.5], ["setNull", 8, 4, 0.5], ["setNull", 13, 4, 0.5], ["setNull", 15, 4, 0.5], ["setNull", 1, 5, 0.5], ["setNull", 3, 5, 0.5], ["setNull", 4, 5, 0.5], ["setNull", 5, 5, 0.5], ["setNull", 6, 5, 0.5], ["setNull", 7, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 9, 5, 0.5], ["setNull", 10, 5, 0.5], ["setNull", 11, 5, 0.5], ["setNull", 12, 5, 0.5], ["setNull", 13, 5, 0.5], ["setNull", 15, 5, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 1, 7, 0.5], ["setNull", 2, 7, 0.5], ["setNull", 5, 7, 0.5], ["setNull", 6, 7, 0.5], ["setNull", 10, 7, 0.5], ["setNull", 11, 7, 0.5], ["setNull", 14, 7, 0.5], ["setNull", 15, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 6, 13, 0.5], ["setNull", 7, 13, 0.5], ["setNull", 8, 13, 0.5], ["setNull", 9, 13, 0.5], ["setNull", 10, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 3, 12, 0.5], ["setNull", 8, 12, 0.5], ["setNull", 13, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 3, 11, 0.5], ["setNull", 7, 11, 0.5], ["setNull", 8, 11, 0.5], ["setNull", 9, 11, 0.5], ["setNull", 13, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 1, 10, 0.5], ["setNull", 3, 10, 0.5], ["setNull", 8, 10, 0.5], ["setNull", 13, 10, 0.5], ["setNull", 15, 10, 0.5], ["setNull", 1, 9, 0.5], ["setNull", 3, 9, 0.5], ["setNull", 4, 9, 0.5], ["setNull", 5, 9, 0.5], ["setNull", 6, 9, 0.5], ["setNull", 7, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 9, 9, 0.5], ["setNull", 10, 9, 0.5], ["setNull", 11, 9, 0.5], ["setNull", 12, 9, 0.5], ["setNull", 13, 9, 0.5], ["setNull", 15, 9, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 6, 1, 0.5], ["setUnfixedProb", 7, 1, 0.5], ["setUnfixedProb", 8, 1, 0.5], ["setUnfixedProb", 9, 1, 0.5], ["setUnfixedProb", 10, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 3, 2, 0.5], ["setUnfixedProb", 8, 2, 0.5], ["setUnfixedProb", 13, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 3, 3, 0.5], ["setUnfixedProb", 7, 3, 0.5], ["setUnfixedProb", 8, 3, 0.5], ["setUnfixedProb", 9, 3, 0.5], ["setUnfixedProb", 13, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 1, 4, 0.5], ["setUnfixedProb", 3, 4, 0.5], ["setUnfixedProb", 8, 4, 0.5], ["setUnfixedProb", 13, 4, 0.5], ["setUnfixedProb", 15, 4, 0.5], ["setUnfixedProb", 1, 5, 0.5], ["setUnfixedProb", 3, 5, 0.5], ["setUnfixedProb", 4, 5, 0.5], ["setUnfixedProb", 5, 5, 0.5], ["setUnfixedProb", 6, 5, 0.5], ["setUnfixedProb", 7, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 9, 5, 0.5], ["setUnfixedProb", 10, 5, 0.5], ["setUnfixedProb", 11, 5, 0.5], ["setUnfixedProb", 12, 5, 0.5], ["setUnfixedProb", 13, 5, 0.5], ["setUnfixedProb", 15, 5, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 1, 7, 0.5], ["setUnfixedProb", 2, 7, 0.5], ["setUnfixedProb", 5, 7, 0.5], ["setUnfixedProb", 6, 7, 0.5], ["setUnfixedProb", 10, 7, 0.5], ["setUnfixedProb", 11, 7, 0.5], ["setUnfixedProb", 14, 7, 0.5], ["setUnfixedProb", 15, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 6, 13, 0.5], ["setUnfixedProb", 7, 13, 0.5], ["setUnfixedProb", 8, 13, 0.5], ["setUnfixedProb", 9, 13, 0.5], ["setUnfixedProb", 10, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 3, 12, 0.5], ["setUnfixedProb", 8, 12, 0.5], ["setUnfixedProb", 13, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 3, 11, 0.5], ["setUnfixedProb", 7, 11, 0.5], ["setUnfixedProb", 8, 11, 0.5], ["setUnfixedProb", 9, 11, 0.5], ["setUnfixedProb", 13, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 1, 10, 0.5], ["setUnfixedProb", 3, 10, 0.5], ["setUnfixedProb", 8, 10, 0.5], ["setUnfixedProb", 13, 10, 0.5], ["setUnfixedProb", 15, 10, 0.5], ["setUnfixedProb", 1, 9, 0.5], ["setUnfixedProb", 3, 9, 0.5], ["setUnfixedProb", 4, 9, 0.5], ["setUnfixedProb", 5, 9, 0.5], ["setUnfixedProb", 6, 9, 0.5], ["setUnfixedProb", 7, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 9, 9, 0.5], ["setUnfixedProb", 10, 9, 0.5], ["setUnfixedProb", 11, 9, 0.5], ["setUnfixedProb", 12, 9, 0.5], ["setUnfixedProb", 13, 9, 0.5], ["setUnfixedProb", 15, 9, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 5, 1, 0.3], ["setUnfixedProb", 11, 1, 0.3], ["setUnfixedProb", 5, 2, 0.3], ["setUnfixedProb", 11, 2, 0.3], ["setUnfixedProb", 2, 3, 0.3], ["setUnfixedProb", 14, 3, 0.3], ["setUnfixedProb", 5, 4, 0.3], ["setUnfixedProb", 11, 4, 0.3], ["setUnfixedProb", 2, 5, 0.3], ["setUnfixedProb", 14, 5, 0.3], ["setUnfixedProb", 1, 6, 0.3], ["setUnfixedProb", 15, 6, 0.3], ["setUnfixedProb", 4, 7, 0.3], ["setUnfixedProb", 12, 7, 0.3], ["setUnfixedProb", 5, 13, 0.3], ["setUnfixedProb", 11, 13, 0.3], ["setUnfixedProb", 5, 12, 0.3], ["setUnfixedProb", 11, 12, 0.3], ["setUnfixedProb", 2, 11, 0.3], ["setUnfixedProb", 14, 11, 0.3], ["setUnfixedProb", 5, 10, 0.3], ["setUnfixedProb", 11, 10, 0.3], ["setUnfixedProb", 2, 9, 0.3], ["setUnfixedProb", 14, 9, 0.3], ["setUnfixedProb", 1, 8, 0.3], ["setUnfixedProb", 15, 8, 0.3], ["setFixedProb", 5, 1, 0.7], ["setFixedProb", 11, 1, 0.7], ["setFixedProb", 2, 2, 1], ["setFixedProb", 4, 2, 1], ["setFixedProb", 5, 2, 0.7], ["setFixedProb", 6, 2, 1], ["setFixedProb", 7, 2, 1], ["setFixedProb", 9, 2, 1], ["setFixedProb", 10, 2, 1], ["setFixedProb", 11, 2, 0.7], ["setFixedProb", 12, 2, 1], ["setFixedProb", 14, 2, 1], ["setFixedProb", 2, 3, 0.7], ["setFixedProb", 14, 3, 0.7], ["setFixedProb", 2, 4, 1], ["setFixedProb", 4, 4, 1], ["setFixedProb", 5, 4, 0.7], ["setFixedProb", 6, 4, 1], ["setFixedProb", 7, 4, 1], ["setFixedProb", 9, 4, 1], ["setFixedProb", 10, 4, 1], ["setFixedProb", 11, 4, 0.7], ["setFixedProb", 12, 4, 1], ["setFixedProb", 14, 4, 1], ["setFixedProb", 2, 5, 0.7], ["setFixedProb", 14, 5, 0.7], ["setFixedProb", 1, 6, 0.7], ["setFixedProb", 2, 6, 1], ["setFixedProb", 4, 6, 1], ["setFixedProb", 5, 6, 1], ["setFixedProb", 11, 6, 1], ["setFixedProb", 12, 6, 1], ["setFixedProb", 14, 6, 1], ["setFixedProb", 15, 6, 0.7], ["setFixedProb", 4, 7, 0.7], ["setFixedProb", 12, 7, 0.7], ["setFixedProb", 5, 13, 0.7], ["setFixedProb", 11, 13, 0.7], ["setFixedProb", 2, 12, 1], ["setFixedProb", 4, 12, 1], ["setFixedProb", 5, 12, 0.7], ["setFixedProb", 6, 12, 1], ["setFixedProb", 7, 12, 1], ["setFixedProb", 9, 12, 1], ["setFixedProb", 10, 12, 1], ["setFixedProb", 11, 12, 0.7], ["setFixedProb", 12, 12, 1], ["setFixedProb", 14, 12, 1], ["setFixedProb", 2, 11, 0.7], ["setFixedProb", 14, 11, 0.7], ["setFixedProb", 2, 10, 1], ["setFixedProb", 4, 10, 1], ["setFixedProb", 5, 10, 0.7], ["setFixedProb", 6, 10, 1], ["setFixedProb", 7, 10, 1], ["setFixedProb", 9, 10, 1], ["setFixedProb", 10, 10, 1], ["setFixedProb", 11, 10, 0.7], ["setFixedProb", 12, 10, 1], ["setFixedProb", 14, 10, 1], ["setFixedProb", 2, 9, 0.7], ["setFixedProb", 14, 9, 0.7], ["setFixedProb", 1, 8, 0.7], ["setFixedProb", 2, 8, 1], ["setFixedProb", 4, 8, 1], ["setFixedProb", 5, 8, 1], ["setFixedProb", 11, 8, 1], ["setFixedProb", 12, 8, 1], ["setFixedProb", 14, 8, 1], ["setFixedProb", 15, 8, 0.7]], "hazards": [{ "kind": "IceFace", "x": 4, "y": 3, "dir": 0 }, { "kind": "IceFace", "x": 5, "y": 3, "dir": 0 }, { "kind": "IceFace", "x": 6, "y": 3, "dir": 0 }, { "kind": "IceFace", "x": 10, "y": 3, "dir": 0 }, { "kind": "IceFace", "x": 11, "y": 3, "dir": 0 }, { "kind": "IceFace", "x": 12, "y": 3, "dir": 0 }, { "kind": "IceFace", "x": 3, "y": 6, "dir": 0 }, { "kind": "IceFace", "x": 3, "y": 7, "dir": 0 }, { "kind": "IceFace", "x": 3, "y": 8, "dir": 0 }, { "kind": "IceFace", "x": 13, "y": 6, "dir": 0 }, { "kind": "IceFace", "x": 13, "y": 7, "dir": 0 }, { "kind": "IceFace", "x": 13, "y": 8, "dir": 0 }, { "kind": "IceFace", "x": 4, "y": 11, "dir": 0 }, { "kind": "IceFace", "x": 5, "y": 11, "dir": 0 }, { "kind": "IceFace", "x": 6, "y": 11, "dir": 0 }, { "kind": "IceFace", "x": 10, "y": 11, "dir": 0 }, { "kind": "IceFace", "x": 11, "y": 11, "dir": 0 }, { "kind": "IceFace", "x": 12, "y": 11, "dir": 0 }] }, { "id": "snow-three", "theme": "snow", "begin": 21, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/SnowMapData.as", "method": "setSnowThree", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 5, 1, 0.5], ["setNull", 6, 1, 0.5], ["setNull", 8, 1, 0.5], ["setNull", 10, 1, 0.5], ["setNull", 11, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 4, 2, 0.5], ["setNull", 6, 2, 0.5], ["setNull", 10, 2, 0.5], ["setNull", 12, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 2, 3, 0.5], ["setNull", 3, 3, 0.5], ["setNull", 4, 3, 0.5], ["setNull", 6, 3, 0.5], ["setNull", 8, 3, 0.5], ["setNull", 10, 3, 0.5], ["setNull", 12, 3, 0.5], ["setNull", 13, 3, 0.5], ["setNull", 14, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 4, 4, 0.5], ["setNull", 6, 4, 0.5], ["setNull", 10, 4, 0.5], ["setNull", 12, 4, 0.5], ["setNull", 1, 5, 0.5], ["setNull", 2, 5, 0.5], ["setNull", 6, 5, 0.5], ["setNull", 7, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 9, 5, 0.5], ["setNull", 10, 5, 0.5], ["setNull", 14, 5, 0.5], ["setNull", 15, 5, 0.5], ["setNull", 2, 6, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 14, 6, 0.5], ["setNull", 1, 7, 0.5], ["setNull", 2, 7, 0.5], ["setNull", 4, 7, 0.5], ["setNull", 5, 7, 0.5], ["setNull", 6, 7, 0.5], ["setNull", 10, 7, 0.5], ["setNull", 11, 7, 0.5], ["setNull", 12, 7, 0.5], ["setNull", 14, 7, 0.5], ["setNull", 15, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 5, 13, 0.5], ["setNull", 6, 13, 0.5], ["setNull", 8, 13, 0.5], ["setNull", 10, 13, 0.5], ["setNull", 11, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 4, 12, 0.5], ["setNull", 6, 12, 0.5], ["setNull", 10, 12, 0.5], ["setNull", 12, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 2, 11, 0.5], ["setNull", 3, 11, 0.5], ["setNull", 4, 11, 0.5], ["setNull", 6, 11, 0.5], ["setNull", 8, 11, 0.5], ["setNull", 10, 11, 0.5], ["setNull", 12, 11, 0.5], ["setNull", 13, 11, 0.5], ["setNull", 14, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 4, 10, 0.5], ["setNull", 6, 10, 0.5], ["setNull", 10, 10, 0.5], ["setNull", 12, 10, 0.5], ["setNull", 1, 9, 0.5], ["setNull", 2, 9, 0.5], ["setNull", 6, 9, 0.5], ["setNull", 7, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 9, 9, 0.5], ["setNull", 10, 9, 0.5], ["setNull", 14, 9, 0.5], ["setNull", 15, 9, 0.5], ["setNull", 2, 8, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setNull", 14, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 5, 1, 0.5], ["setUnfixedProb", 6, 1, 0.5], ["setUnfixedProb", 8, 1, 0.5], ["setUnfixedProb", 10, 1, 0.5], ["setUnfixedProb", 11, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 4, 2, 0.5], ["setUnfixedProb", 6, 2, 0.5], ["setUnfixedProb", 10, 2, 0.5], ["setUnfixedProb", 12, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 2, 3, 0.5], ["setUnfixedProb", 3, 3, 0.5], ["setUnfixedProb", 4, 3, 0.5], ["setUnfixedProb", 6, 3, 0.5], ["setUnfixedProb", 8, 3, 0.5], ["setUnfixedProb", 10, 3, 0.5], ["setUnfixedProb", 12, 3, 0.5], ["setUnfixedProb", 13, 3, 0.5], ["setUnfixedProb", 14, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 4, 4, 0.5], ["setUnfixedProb", 6, 4, 0.5], ["setUnfixedProb", 10, 4, 0.5], ["setUnfixedProb", 12, 4, 0.5], ["setUnfixedProb", 1, 5, 0.5], ["setUnfixedProb", 2, 5, 0.5], ["setUnfixedProb", 6, 5, 0.5], ["setUnfixedProb", 7, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 9, 5, 0.5], ["setUnfixedProb", 10, 5, 0.5], ["setUnfixedProb", 14, 5, 0.5], ["setUnfixedProb", 15, 5, 0.5], ["setUnfixedProb", 2, 6, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 14, 6, 0.5], ["setUnfixedProb", 1, 7, 0.5], ["setUnfixedProb", 2, 7, 0.5], ["setUnfixedProb", 4, 7, 0.5], ["setUnfixedProb", 5, 7, 0.5], ["setUnfixedProb", 6, 7, 0.5], ["setUnfixedProb", 10, 7, 0.5], ["setUnfixedProb", 11, 7, 0.5], ["setUnfixedProb", 12, 7, 0.5], ["setUnfixedProb", 14, 7, 0.5], ["setUnfixedProb", 15, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 5, 13, 0.5], ["setUnfixedProb", 6, 13, 0.5], ["setUnfixedProb", 8, 13, 0.5], ["setUnfixedProb", 10, 13, 0.5], ["setUnfixedProb", 11, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 4, 12, 0.5], ["setUnfixedProb", 6, 12, 0.5], ["setUnfixedProb", 10, 12, 0.5], ["setUnfixedProb", 12, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 2, 11, 0.5], ["setUnfixedProb", 3, 11, 0.5], ["setUnfixedProb", 4, 11, 0.5], ["setUnfixedProb", 6, 11, 0.5], ["setUnfixedProb", 8, 11, 0.5], ["setUnfixedProb", 10, 11, 0.5], ["setUnfixedProb", 12, 11, 0.5], ["setUnfixedProb", 13, 11, 0.5], ["setUnfixedProb", 14, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 4, 10, 0.5], ["setUnfixedProb", 6, 10, 0.5], ["setUnfixedProb", 10, 10, 0.5], ["setUnfixedProb", 12, 10, 0.5], ["setUnfixedProb", 1, 9, 0.5], ["setUnfixedProb", 2, 9, 0.5], ["setUnfixedProb", 6, 9, 0.5], ["setUnfixedProb", 7, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 9, 9, 0.5], ["setUnfixedProb", 10, 9, 0.5], ["setUnfixedProb", 14, 9, 0.5], ["setUnfixedProb", 15, 9, 0.5], ["setUnfixedProb", 2, 8, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 14, 8, 0.5], ["setUnfixedProb", 5, 3, 0.3], ["setUnfixedProb", 11, 3, 0.3], ["setUnfixedProb", 1, 4, 0.3], ["setUnfixedProb", 8, 4, 0.3], ["setUnfixedProb", 15, 4, 0.3], ["setUnfixedProb", 4, 6, 0.3], ["setUnfixedProb", 12, 6, 0.3], ["setUnfixedProb", 3, 7, 0.3], ["setUnfixedProb", 13, 7, 0.3], ["setUnfixedProb", 5, 11, 0.3], ["setUnfixedProb", 11, 11, 0.3], ["setUnfixedProb", 1, 10, 0.3], ["setUnfixedProb", 8, 10, 0.3], ["setUnfixedProb", 15, 10, 0.3], ["setUnfixedProb", 4, 8, 0.3], ["setUnfixedProb", 12, 8, 0.3], ["setFixedProb", 7, 1, 1], ["setFixedProb", 9, 1, 1], ["setFixedProb", 2, 2, 1], ["setFixedProb", 3, 2, 1], ["setFixedProb", 5, 2, 1], ["setFixedProb", 11, 2, 1], ["setFixedProb", 13, 2, 1], ["setFixedProb", 14, 2, 1], ["setFixedProb", 5, 3, 0.7], ["setFixedProb", 7, 3, 1], ["setFixedProb", 9, 3, 1], ["setFixedProb", 11, 3, 0.7], ["setFixedProb", 1, 4, 0.7], ["setFixedProb", 2, 4, 1], ["setFixedProb", 3, 4, 1], ["setFixedProb", 5, 4, 1], ["setFixedProb", 7, 4, 1], ["setFixedProb", 8, 4, 0.7], ["setFixedProb", 9, 4, 1], ["setFixedProb", 11, 4, 1], ["setFixedProb", 13, 4, 1], ["setFixedProb", 14, 4, 1], ["setFixedProb", 15, 4, 0.7], ["setFixedProb", 1, 6, 1], ["setFixedProb", 3, 6, 1], ["setFixedProb", 4, 6, 0.7], ["setFixedProb", 5, 6, 1], ["setFixedProb", 11, 6, 1], ["setFixedProb", 12, 6, 0.7], ["setFixedProb", 13, 6, 1], ["setFixedProb", 15, 6, 1], ["setFixedProb", 3, 7, 0.7], ["setFixedProb", 13, 7, 0.7], ["setFixedProb", 7, 13, 1], ["setFixedProb", 9, 13, 1], ["setFixedProb", 2, 12, 1], ["setFixedProb", 3, 12, 1], ["setFixedProb", 5, 12, 1], ["setFixedProb", 11, 12, 1], ["setFixedProb", 13, 12, 1], ["setFixedProb", 14, 12, 1], ["setFixedProb", 5, 11, 0.7], ["setFixedProb", 7, 11, 1], ["setFixedProb", 9, 11, 1], ["setFixedProb", 11, 11, 0.7], ["setFixedProb", 1, 10, 0.7], ["setFixedProb", 2, 10, 1], ["setFixedProb", 3, 10, 1], ["setFixedProb", 5, 10, 1], ["setFixedProb", 7, 10, 1], ["setFixedProb", 8, 10, 0.7], ["setFixedProb", 9, 10, 1], ["setFixedProb", 11, 10, 1], ["setFixedProb", 13, 10, 1], ["setFixedProb", 14, 10, 1], ["setFixedProb", 15, 10, 0.7], ["setFixedProb", 1, 8, 1], ["setFixedProb", 3, 8, 1], ["setFixedProb", 4, 8, 0.7], ["setFixedProb", 5, 8, 1], ["setFixedProb", 11, 8, 1], ["setFixedProb", 12, 8, 0.7], ["setFixedProb", 13, 8, 1], ["setFixedProb", 15, 8, 1]], "hazards": [{ "kind": "IceFace", "x": 7, "y": 2, "dir": 0 }, { "kind": "IceFace", "x": 8, "y": 2, "dir": 0 }, { "kind": "IceFace", "x": 9, "y": 2, "dir": 0 }, { "kind": "IceFace", "x": 3, "y": 5, "dir": 0 }, { "kind": "IceFace", "x": 4, "y": 5, "dir": 0 }, { "kind": "IceFace", "x": 5, "y": 5, "dir": 0 }, { "kind": "IceFace", "x": 11, "y": 5, "dir": 0 }, { "kind": "IceFace", "x": 12, "y": 5, "dir": 0 }, { "kind": "IceFace", "x": 13, "y": 5, "dir": 0 }, { "kind": "IceFace", "x": 3, "y": 9, "dir": 0 }, { "kind": "IceFace", "x": 4, "y": 9, "dir": 0 }, { "kind": "IceFace", "x": 5, "y": 9, "dir": 0 }, { "kind": "IceFace", "x": 11, "y": 9, "dir": 0 }, { "kind": "IceFace", "x": 12, "y": 9, "dir": 0 }, { "kind": "IceFace", "x": 13, "y": 9, "dir": 0 }, { "kind": "IceFace", "x": 7, "y": 12, "dir": 0 }, { "kind": "IceFace", "x": 8, "y": 12, "dir": 0 }, { "kind": "IceFace", "x": 9, "y": 12, "dir": 0 }] }, { "id": "disce-two", "theme": "disce", "begin": 31, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/DisceMapData.as", "method": "setDisceTwo", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 3, 6, 1], ["setNull", 3, 7, 1], ["setNull", 4, 7, 1], ["setNull", 5, 4, 1], ["setNull", 5, 5, 1], ["setNull", 6, 5, 1], ["setNull", 7, 5, 1], ["setNull", 8, 5, 1], ["setNull", 10, 3, 1], ["setNull", 11, 3, 1], ["setNull", 13, 6, 1], ["setNull", 12, 7, 1], ["setNull", 13, 7, 1], ["setNull", 11, 4, 1], ["setNull", 3, 8, 1], ["setNull", 5, 10, 1], ["setNull", 5, 11, 1], ["setNull", 8, 9, 1], ["setNull", 9, 9, 1], ["setNull", 10, 9, 1], ["setNull", 11, 9, 1], ["setNull", 6, 11, 1], ["setNull", 13, 8, 1], ["setNull", 11, 10, 1], ["setNull", 3, 1, 0.4], ["setNull", 4, 1, 0.4], ["setNull", 5, 1, 0.4], ["setNull", 6, 1, 0.4], ["setNull", 7, 1, 0.4], ["setNull", 8, 1, 0.4], ["setNull", 9, 1, 0.4], ["setNull", 10, 1, 0.4], ["setNull", 12, 1, 0.4], ["setNull", 13, 1, 0.4], ["setNull", 5, 2, 0.4], ["setNull", 8, 2, 0.4], ["setNull", 10, 2, 0.4], ["setNull", 12, 2, 0.4], ["setNull", 1, 3, 0.4], ["setNull", 3, 3, 0.4], ["setNull", 4, 3, 0.4], ["setNull", 5, 3, 0.4], ["setNull", 6, 3, 0.4], ["setNull", 7, 3, 0.4], ["setNull", 12, 3, 0.4], ["setNull", 13, 3, 0.4], ["setNull", 15, 3, 0.4], ["setNull", 1, 4, 0.4], ["setNull", 2, 4, 0.4], ["setNull", 14, 4, 0.4], ["setNull", 15, 4, 0.4], ["setNull", 1, 5, 0.4], ["setNull", 9, 5, 0.4], ["setNull", 10, 5, 0.4], ["setNull", 11, 5, 0.4], ["setNull", 15, 5, 0.4], ["setNull", 1, 6, 0.4], ["setNull", 2, 6, 0.4], ["setNull", 6, 6, 0.4], ["setNull", 10, 6, 0.4], ["setNull", 14, 6, 0.4], ["setNull", 15, 6, 0.4], ["setNull", 5, 7, 0.4], ["setNull", 6, 7, 0.4], ["setNull", 10, 7, 0.4], ["setNull", 11, 7, 0.4], ["setNull", 3, 13, 0.4], ["setNull", 4, 13, 0.4], ["setNull", 6, 13, 0.4], ["setNull", 7, 13, 0.4], ["setNull", 8, 13, 0.4], ["setNull", 9, 13, 0.4], ["setNull", 10, 13, 0.4], ["setNull", 11, 13, 0.4], ["setNull", 12, 13, 0.4], ["setNull", 13, 13, 0.4], ["setNull", 4, 12, 0.4], ["setNull", 6, 12, 0.4], ["setNull", 8, 12, 0.4], ["setNull", 11, 12, 0.4], ["setNull", 1, 11, 0.4], ["setNull", 3, 11, 0.4], ["setNull", 4, 11, 0.4], ["setNull", 9, 11, 0.4], ["setNull", 10, 11, 0.4], ["setNull", 11, 11, 0.4], ["setNull", 12, 11, 0.4], ["setNull", 13, 11, 0.4], ["setNull", 15, 11, 0.4], ["setNull", 1, 10, 0.4], ["setNull", 2, 10, 0.4], ["setNull", 14, 10, 0.4], ["setNull", 15, 10, 0.4], ["setNull", 1, 9, 0.4], ["setNull", 5, 9, 0.4], ["setNull", 6, 9, 0.4], ["setNull", 7, 9, 0.4], ["setNull", 15, 9, 0.4], ["setNull", 1, 8, 0.4], ["setNull", 2, 8, 0.4], ["setNull", 6, 8, 0.4], ["setNull", 10, 8, 0.4], ["setNull", 14, 8, 0.4], ["setNull", 15, 8, 0.4], ["setUnfixedProb", 3, 1, 0.6], ["setUnfixedProb", 4, 1, 0.6], ["setUnfixedProb", 5, 1, 0.6], ["setUnfixedProb", 6, 1, 0.6], ["setUnfixedProb", 7, 1, 0.6], ["setUnfixedProb", 8, 1, 0.6], ["setUnfixedProb", 9, 1, 0.6], ["setUnfixedProb", 10, 1, 0.6], ["setUnfixedProb", 12, 1, 0.6], ["setUnfixedProb", 13, 1, 0.6], ["setUnfixedProb", 5, 2, 0.6], ["setUnfixedProb", 8, 2, 0.6], ["setUnfixedProb", 10, 2, 0.6], ["setUnfixedProb", 12, 2, 0.6], ["setUnfixedProb", 1, 3, 0.6], ["setUnfixedProb", 3, 3, 0.6], ["setUnfixedProb", 4, 3, 0.6], ["setUnfixedProb", 5, 3, 0.6], ["setUnfixedProb", 6, 3, 0.6], ["setUnfixedProb", 7, 3, 0.6], ["setUnfixedProb", 12, 3, 0.6], ["setUnfixedProb", 13, 3, 0.6], ["setUnfixedProb", 15, 3, 0.6], ["setUnfixedProb", 1, 4, 0.6], ["setUnfixedProb", 2, 4, 0.6], ["setUnfixedProb", 14, 4, 0.6], ["setUnfixedProb", 15, 4, 0.6], ["setUnfixedProb", 1, 5, 0.6], ["setUnfixedProb", 9, 5, 0.6], ["setUnfixedProb", 10, 5, 0.6], ["setUnfixedProb", 11, 5, 0.6], ["setUnfixedProb", 15, 5, 0.6], ["setUnfixedProb", 1, 6, 0.6], ["setUnfixedProb", 2, 6, 0.6], ["setUnfixedProb", 6, 6, 0.6], ["setUnfixedProb", 10, 6, 0.6], ["setUnfixedProb", 14, 6, 0.6], ["setUnfixedProb", 15, 6, 0.6], ["setUnfixedProb", 5, 7, 0.6], ["setUnfixedProb", 6, 7, 0.6], ["setUnfixedProb", 10, 7, 0.6], ["setUnfixedProb", 11, 7, 0.6], ["setUnfixedProb", 3, 13, 0.6], ["setUnfixedProb", 4, 13, 0.6], ["setUnfixedProb", 6, 13, 0.6], ["setUnfixedProb", 7, 13, 0.6], ["setUnfixedProb", 8, 13, 0.6], ["setUnfixedProb", 9, 13, 0.6], ["setUnfixedProb", 10, 13, 0.6], ["setUnfixedProb", 11, 13, 0.6], ["setUnfixedProb", 12, 13, 0.6], ["setUnfixedProb", 13, 13, 0.6], ["setUnfixedProb", 4, 12, 0.6], ["setUnfixedProb", 6, 12, 0.6], ["setUnfixedProb", 8, 12, 0.6], ["setUnfixedProb", 11, 12, 0.6], ["setUnfixedProb", 1, 11, 0.6], ["setUnfixedProb", 3, 11, 0.6], ["setUnfixedProb", 4, 11, 0.6], ["setUnfixedProb", 9, 11, 0.6], ["setUnfixedProb", 10, 11, 0.6], ["setUnfixedProb", 11, 11, 0.6], ["setUnfixedProb", 12, 11, 0.6], ["setUnfixedProb", 13, 11, 0.6], ["setUnfixedProb", 15, 11, 0.6], ["setUnfixedProb", 1, 10, 0.6], ["setUnfixedProb", 2, 10, 0.6], ["setUnfixedProb", 14, 10, 0.6], ["setUnfixedProb", 15, 10, 0.6], ["setUnfixedProb", 1, 9, 0.6], ["setUnfixedProb", 5, 9, 0.6], ["setUnfixedProb", 6, 9, 0.6], ["setUnfixedProb", 7, 9, 0.6], ["setUnfixedProb", 15, 9, 0.6], ["setUnfixedProb", 1, 8, 0.6], ["setUnfixedProb", 2, 8, 0.6], ["setUnfixedProb", 6, 8, 0.6], ["setUnfixedProb", 10, 8, 0.6], ["setUnfixedProb", 14, 8, 0.6], ["setUnfixedProb", 15, 8, 0.6], ["setUnfixedProb", 3, 2, 0.3], ["setUnfixedProb", 7, 4, 0.3], ["setUnfixedProb", 9, 4, 0.3], ["setUnfixedProb", 4, 5, 0.3], ["setUnfixedProb", 12, 5, 0.3], ["setUnfixedProb", 13, 12, 0.3], ["setUnfixedProb", 7, 10, 0.3], ["setUnfixedProb", 9, 10, 0.3], ["setUnfixedProb", 4, 9, 0.3], ["setUnfixedProb", 12, 9, 0.3], ["setFixedProb", 11, 1, 1], ["setFixedProb", 2, 2, 1], ["setFixedProb", 3, 2, 0.7], ["setFixedProb", 4, 2, 1], ["setFixedProb", 6, 2, 1], ["setFixedProb", 7, 2, 1], ["setFixedProb", 9, 2, 1], ["setFixedProb", 11, 2, 1], ["setFixedProb", 13, 2, 1], ["setFixedProb", 14, 2, 1], ["setFixedProb", 2, 3, 1], ["setFixedProb", 9, 3, 1], ["setFixedProb", 14, 3, 1], ["setFixedProb", 4, 4, 1], ["setFixedProb", 6, 4, 1], ["setFixedProb", 7, 4, 0.7], ["setFixedProb", 8, 4, 1], ["setFixedProb", 9, 4, 0.7], ["setFixedProb", 10, 4, 1], ["setFixedProb", 12, 4, 1], ["setFixedProb", 2, 5, 1], ["setFixedProb", 3, 5, 1], ["setFixedProb", 4, 5, 0.7], ["setFixedProb", 12, 5, 0.7], ["setFixedProb", 13, 5, 1], ["setFixedProb", 14, 5, 1], ["setFixedProb", 4, 6, 1], ["setFixedProb", 5, 6, 1], ["setFixedProb", 11, 6, 1], ["setFixedProb", 12, 6, 1], ["setFixedProb", 1, 7, 1], ["setFixedProb", 2, 7, 1], ["setFixedProb", 14, 7, 1], ["setFixedProb", 15, 7, 1], ["setFixedProb", 5, 13, 1], ["setFixedProb", 2, 12, 1], ["setFixedProb", 3, 12, 1], ["setFixedProb", 5, 12, 1], ["setFixedProb", 7, 12, 1], ["setFixedProb", 9, 12, 1], ["setFixedProb", 10, 12, 1], ["setFixedProb", 12, 12, 1], ["setFixedProb", 13, 12, 0.7], ["setFixedProb", 14, 12, 1], ["setFixedProb", 2, 11, 1], ["setFixedProb", 7, 11, 1], ["setFixedProb", 14, 11, 1], ["setFixedProb", 4, 10, 1], ["setFixedProb", 6, 10, 1], ["setFixedProb", 7, 10, 0.7], ["setFixedProb", 8, 10, 1], ["setFixedProb", 9, 10, 0.7], ["setFixedProb", 10, 10, 1], ["setFixedProb", 12, 10, 1], ["setFixedProb", 2, 9, 1], ["setFixedProb", 3, 9, 1], ["setFixedProb", 4, 9, 0.7], ["setFixedProb", 12, 9, 0.7], ["setFixedProb", 13, 9, 1], ["setFixedProb", 14, 9, 1], ["setFixedProb", 4, 8, 1], ["setFixedProb", 5, 8, 1], ["setFixedProb", 11, 8, 1], ["setFixedProb", 12, 8, 1]], "hazards": [{ "kind": "SpringBoard", "x": 3, "y": 4, "dir": 0 }, { "kind": "SpringBoard", "x": 8, "y": 3, "dir": 0 }, { "kind": "SpringBoard", "x": 13, "y": 4, "dir": 0 }, { "kind": "SpringBoard", "x": 3, "y": 10, "dir": 0 }, { "kind": "SpringBoard", "x": 8, "y": 11, "dir": 0 }, { "kind": "SpringBoard", "x": 13, "y": 10, "dir": 0 }] }, { "id": "disce-three", "theme": "disce", "begin": 31, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/DisceMapData.as", "method": "setDisceThree", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 4, 5, 1], ["setNull", 5, 5, 1], ["setNull", 5, 6, 1], ["setNull", 7, 3, 1], ["setNull", 11, 5, 1], ["setNull", 8, 3, 1], ["setNull", 8, 4, 1], ["setNull", 9, 3, 1], ["setNull", 3, 9, 1], ["setNull", 12, 4, 1], ["setNull", 12, 5, 1], ["setNull", 5, 7, 1], ["setNull", 13, 5, 1], ["setNull", 11, 7, 1], ["setNull", 11, 8, 1], ["setNull", 5, 9, 1], ["setNull", 4, 9, 1], ["setNull", 4, 10, 1], ["setNull", 7, 11, 1], ["setNull", 11, 9, 1], ["setNull", 12, 9, 1], ["setNull", 8, 10, 1], ["setNull", 8, 11, 1], ["setNull", 9, 11, 1], ["setNull", 3, 1, 0.4], ["setNull", 4, 1, 0.4], ["setNull", 5, 1, 0.4], ["setNull", 6, 1, 0.4], ["setNull", 7, 1, 0.4], ["setNull", 9, 1, 0.4], ["setNull", 10, 1, 0.4], ["setNull", 11, 1, 0.4], ["setNull", 12, 1, 0.4], ["setNull", 13, 1, 0.4], ["setNull", 5, 2, 0.4], ["setNull", 7, 2, 0.4], ["setNull", 9, 2, 0.4], ["setNull", 11, 2, 0.4], ["setNull", 1, 3, 0.4], ["setNull", 2, 3, 0.4], ["setNull", 3, 3, 0.4], ["setNull", 4, 3, 0.4], ["setNull", 12, 3, 0.4], ["setNull", 13, 3, 0.4], ["setNull", 14, 3, 0.4], ["setNull", 15, 3, 0.4], ["setNull", 1, 4, 0.4], ["setNull", 3, 4, 0.4], ["setNull", 1, 5, 0.4], ["setNull", 3, 5, 0.4], ["setNull", 6, 5, 0.4], ["setNull", 7, 5, 0.4], ["setNull", 8, 5, 0.4], ["setNull", 9, 5, 0.4], ["setNull", 10, 5, 0.4], ["setNull", 14, 5, 0.4], ["setNull", 15, 5, 0.4], ["setNull", 1, 6, 0.4], ["setNull", 3, 6, 0.4], ["setNull", 10, 6, 0.4], ["setNull", 15, 6, 0.4], ["setNull", 1, 7, 0.4], ["setNull", 2, 7, 0.4], ["setNull", 6, 7, 0.4], ["setNull", 10, 7, 0.4], ["setNull", 14, 7, 0.4], ["setNull", 15, 7, 0.4], ["setNull", 3, 13, 0.4], ["setNull", 4, 13, 0.4], ["setNull", 5, 13, 0.4], ["setNull", 6, 13, 0.4], ["setNull", 7, 13, 0.4], ["setNull", 9, 13, 0.4], ["setNull", 10, 13, 0.4], ["setNull", 11, 13, 0.4], ["setNull", 12, 13, 0.4], ["setNull", 13, 13, 0.4], ["setNull", 5, 12, 0.4], ["setNull", 7, 12, 0.4], ["setNull", 11, 12, 0.4], ["setNull", 9, 12, 0.4], ["setNull", 1, 11, 0.4], ["setNull", 2, 11, 0.4], ["setNull", 3, 11, 0.4], ["setNull", 4, 11, 0.4], ["setNull", 12, 11, 0.4], ["setNull", 13, 11, 0.4], ["setNull", 14, 11, 0.4], ["setNull", 15, 11, 0.4], ["setNull", 13, 10, 0.4], ["setNull", 15, 10, 0.4], ["setNull", 1, 9, 0.4], ["setNull", 2, 9, 0.4], ["setNull", 6, 9, 0.4], ["setNull", 7, 9, 0.4], ["setNull", 8, 9, 0.4], ["setNull", 9, 9, 0.4], ["setNull", 10, 9, 0.4], ["setNull", 13, 9, 0.4], ["setNull", 15, 9, 0.4], ["setNull", 1, 8, 0.4], ["setNull", 6, 8, 0.4], ["setNull", 13, 8, 0.4], ["setNull", 15, 8, 0.4], ["setUnfixedProb", 3, 1, 0.6], ["setUnfixedProb", 4, 1, 0.6], ["setUnfixedProb", 5, 1, 0.6], ["setUnfixedProb", 6, 1, 0.6], ["setUnfixedProb", 7, 1, 0.6], ["setUnfixedProb", 9, 1, 0.6], ["setUnfixedProb", 10, 1, 0.6], ["setUnfixedProb", 11, 1, 0.6], ["setUnfixedProb", 12, 1, 0.6], ["setUnfixedProb", 13, 1, 0.6], ["setUnfixedProb", 5, 2, 0.6], ["setUnfixedProb", 7, 2, 0.6], ["setUnfixedProb", 9, 2, 0.6], ["setUnfixedProb", 11, 2, 0.6], ["setUnfixedProb", 1, 3, 0.6], ["setUnfixedProb", 2, 3, 0.6], ["setUnfixedProb", 3, 3, 0.6], ["setUnfixedProb", 4, 3, 0.6], ["setUnfixedProb", 12, 3, 0.6], ["setUnfixedProb", 13, 3, 0.6], ["setUnfixedProb", 14, 3, 0.6], ["setUnfixedProb", 15, 3, 0.6], ["setUnfixedProb", 1, 4, 0.6], ["setUnfixedProb", 3, 4, 0.6], ["setUnfixedProb", 1, 5, 0.6], ["setUnfixedProb", 3, 5, 0.6], ["setUnfixedProb", 6, 5, 0.6], ["setUnfixedProb", 7, 5, 0.6], ["setUnfixedProb", 8, 5, 0.6], ["setUnfixedProb", 9, 5, 0.6], ["setUnfixedProb", 10, 5, 0.6], ["setUnfixedProb", 14, 5, 0.6], ["setUnfixedProb", 15, 5, 0.6], ["setUnfixedProb", 1, 6, 0.6], ["setUnfixedProb", 3, 6, 0.6], ["setUnfixedProb", 10, 6, 0.6], ["setUnfixedProb", 15, 6, 0.6], ["setUnfixedProb", 1, 7, 0.6], ["setUnfixedProb", 2, 7, 0.6], ["setUnfixedProb", 6, 7, 0.6], ["setUnfixedProb", 10, 7, 0.6], ["setUnfixedProb", 14, 7, 0.6], ["setUnfixedProb", 15, 7, 0.6], ["setUnfixedProb", 3, 13, 0.6], ["setUnfixedProb", 4, 13, 0.6], ["setUnfixedProb", 5, 13, 0.6], ["setUnfixedProb", 6, 13, 0.6], ["setUnfixedProb", 7, 13, 0.6], ["setUnfixedProb", 9, 13, 0.6], ["setUnfixedProb", 10, 13, 0.6], ["setUnfixedProb", 11, 13, 0.6], ["setUnfixedProb", 12, 13, 0.6], ["setUnfixedProb", 13, 13, 0.6], ["setUnfixedProb", 5, 12, 0.6], ["setUnfixedProb", 7, 12, 0.6], ["setUnfixedProb", 9, 12, 0.6], ["setUnfixedProb", 11, 12, 0.6], ["setUnfixedProb", 1, 11, 0.6], ["setUnfixedProb", 2, 11, 0.6], ["setUnfixedProb", 3, 11, 0.6], ["setUnfixedProb", 4, 11, 0.6], ["setUnfixedProb", 12, 11, 0.6], ["setUnfixedProb", 13, 11, 0.6], ["setUnfixedProb", 14, 11, 0.6], ["setUnfixedProb", 15, 11, 0.6], ["setUnfixedProb", 13, 10, 0.6], ["setUnfixedProb", 15, 10, 0.6], ["setUnfixedProb", 1, 9, 0.6], ["setUnfixedProb", 2, 9, 0.6], ["setUnfixedProb", 6, 9, 0.6], ["setUnfixedProb", 7, 9, 0.6], ["setUnfixedProb", 8, 9, 0.6], ["setUnfixedProb", 9, 9, 0.6], ["setUnfixedProb", 10, 9, 0.6], ["setUnfixedProb", 13, 9, 0.6], ["setUnfixedProb", 15, 9, 0.6], ["setUnfixedProb", 1, 8, 0.6], ["setUnfixedProb", 6, 8, 0.6], ["setUnfixedProb", 13, 8, 0.6], ["setUnfixedProb", 15, 8, 0.6], ["setUnfixedProb", 3, 2, 0.3], ["setUnfixedProb", 13, 2, 0.3], ["setUnfixedProb", 6, 4, 0.3], ["setUnfixedProb", 10, 4, 0.3], ["setUnfixedProb", 12, 6, 0.3], ["setUnfixedProb", 3, 12, 0.3], ["setUnfixedProb", 13, 12, 0.3], ["setUnfixedProb", 6, 10, 0.3], ["setUnfixedProb", 10, 10, 0.3], ["setUnfixedProb", 4, 8, 0.3], ["setFixedProb", 8, 1, 1], ["setFixedProb", 2, 2, 1], ["setFixedProb", 3, 2, 0.7], ["setFixedProb", 4, 2, 1], ["setFixedProb", 6, 2, 1], ["setFixedProb", 8, 2, 1], ["setFixedProb", 10, 2, 1], ["setFixedProb", 12, 2, 1], ["setFixedProb", 13, 2, 0.7], ["setFixedProb", 14, 2, 1], ["setFixedProb", 6, 3, 1], ["setFixedProb", 10, 3, 1], ["setFixedProb", 2, 4, 1], ["setFixedProb", 4, 4, 1], ["setFixedProb", 5, 4, 1], ["setFixedProb", 6, 4, 0.7], ["setFixedProb", 7, 4, 1], ["setFixedProb", 9, 4, 1], ["setFixedProb", 10, 4, 0.7], ["setFixedProb", 11, 4, 1], ["setFixedProb", 13, 4, 1], ["setFixedProb", 14, 4, 1], ["setFixedProb", 15, 4, 1], ["setFixedProb", 2, 5, 1], ["setFixedProb", 2, 6, 1], ["setFixedProb", 4, 6, 1], ["setFixedProb", 6, 6, 1], ["setFixedProb", 11, 6, 1], ["setFixedProb", 12, 6, 0.7], ["setFixedProb", 13, 6, 1], ["setFixedProb", 14, 6, 1], ["setFixedProb", 4, 7, 1], ["setFixedProb", 12, 7, 1], ["setFixedProb", 8, 13, 1], ["setFixedProb", 2, 12, 1], ["setFixedProb", 3, 12, 0.7], ["setFixedProb", 4, 12, 1], ["setFixedProb", 6, 12, 1], ["setFixedProb", 8, 12, 1], ["setFixedProb", 10, 12, 1], ["setFixedProb", 12, 12, 1], ["setFixedProb", 13, 12, 0.7], ["setFixedProb", 14, 12, 1], ["setFixedProb", 6, 11, 1], ["setFixedProb", 10, 11, 1], ["setFixedProb", 1, 10, 1], ["setFixedProb", 2, 10, 1], ["setFixedProb", 3, 10, 1], ["setFixedProb", 5, 10, 1], ["setFixedProb", 6, 10, 0.7], ["setFixedProb", 7, 10, 1], ["setFixedProb", 9, 10, 1], ["setFixedProb", 10, 10, 0.7], ["setFixedProb", 11, 10, 1], ["setFixedProb", 12, 10, 1], ["setFixedProb", 14, 10, 1], ["setFixedProb", 14, 9, 1], ["setFixedProb", 2, 8, 1], ["setFixedProb", 3, 8, 1], ["setFixedProb", 4, 8, 0.7], ["setFixedProb", 5, 8, 1], ["setFixedProb", 10, 8, 1], ["setFixedProb", 12, 8, 1], ["setFixedProb", 14, 8, 1]], "hazards": [{ "kind": "SpringBoard", "x": 5, "y": 3, "dir": 0 }, { "kind": "SpringBoard", "x": 11, "y": 3, "dir": 0 }, { "kind": "SpringBoard", "x": 3, "y": 7, "dir": 0 }, { "kind": "SpringBoard", "x": 13, "y": 7, "dir": 0 }, { "kind": "SpringBoard", "x": 5, "y": 11, "dir": 0 }, { "kind": "SpringBoard", "x": 11, "y": 11, "dir": 0 }] }, { "id": "disce-one", "theme": "disce", "begin": 31, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/DisceMapData.as", "method": "setDisceOne", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 4, 1, 1], ["setNull", 5, 1, 1], ["setNull", 4, 2, 1], ["setNull", 6, 3, 1], ["setNull", 7, 3, 1], ["setNull", 6, 4, 1], ["setNull", 3, 7, 1], ["setNull", 3, 8, 1], ["setNull", 4, 8, 1], ["setNull", 1, 9, 1], ["setNull", 1, 10, 1], ["setNull", 2, 10, 1], ["setNull", 12, 6, 1], ["setNull", 13, 6, 1], ["setNull", 13, 7, 1], ["setNull", 15, 4, 1], ["setNull", 15, 5, 1], ["setNull", 14, 4, 1], ["setNull", 11, 13, 1], ["setNull", 12, 13, 1], ["setNull", 12, 12, 1], ["setNull", 9, 11, 1], ["setNull", 10, 11, 1], ["setNull", 10, 10, 1], ["setNull", 3, 1, 0.4], ["setNull", 6, 1, 0.4], ["setNull", 7, 1, 0.4], ["setNull", 9, 1, 0.4], ["setNull", 10, 1, 0.4], ["setNull", 13, 1, 0.4], ["setNull", 7, 2, 0.4], ["setNull", 10, 2, 0.4], ["setNull", 11, 2, 0.4], ["setNull", 12, 2, 0.4], ["setNull", 13, 2, 0.4], ["setNull", 1, 3, 0.4], ["setNull", 2, 3, 0.4], ["setNull", 8, 3, 0.4], ["setNull", 9, 3, 0.4], ["setNull", 10, 3, 0.4], ["setNull", 12, 3, 0.4], ["setNull", 15, 3, 0.4], ["setNull", 2, 4, 0.4], ["setNull", 3, 4, 0.4], ["setNull", 10, 4, 0.4], ["setNull", 11, 4, 0.4], ["setNull", 1, 5, 0.4], ["setNull", 2, 5, 0.4], ["setNull", 4, 5, 0.4], ["setNull", 6, 5, 0.4], ["setNull", 7, 5, 0.4], ["setNull", 8, 5, 0.4], ["setNull", 9, 5, 0.4], ["setNull", 10, 5, 0.4], ["setNull", 1, 6, 0.4], ["setNull", 3, 6, 0.4], ["setNull", 4, 6, 0.4], ["setNull", 5, 6, 0.4], ["setNull", 6, 6, 0.4], ["setNull", 10, 6, 0.4], ["setNull", 11, 6, 0.4], ["setNull", 15, 6, 0.4], ["setNull", 1, 7, 0.4], ["setNull", 2, 7, 0.4], ["setNull", 6, 7, 0.4], ["setNull", 10, 7, 0.4], ["setNull", 14, 7, 0.4], ["setNull", 15, 7, 0.4], ["setNull", 3, 13, 0.4], ["setNull", 6, 13, 0.4], ["setNull", 7, 13, 0.4], ["setNull", 9, 13, 0.4], ["setNull", 10, 13, 0.4], ["setNull", 13, 13, 0.4], ["setNull", 3, 12, 0.4], ["setNull", 4, 12, 0.4], ["setNull", 5, 12, 0.4], ["setNull", 6, 12, 0.4], ["setNull", 9, 12, 0.4], ["setNull", 1, 11, 0.4], ["setNull", 4, 11, 0.4], ["setNull", 6, 11, 0.4], ["setNull", 7, 11, 0.4], ["setNull", 8, 11, 0.4], ["setNull", 14, 11, 0.4], ["setNull", 15, 11, 0.4], ["setNull", 5, 10, 0.4], ["setNull", 6, 10, 0.4], ["setNull", 13, 10, 0.4], ["setNull", 14, 10, 0.4], ["setNull", 6, 9, 0.4], ["setNull", 7, 9, 0.4], ["setNull", 8, 9, 0.4], ["setNull", 9, 9, 0.4], ["setNull", 10, 9, 0.4], ["setNull", 12, 9, 0.4], ["setNull", 14, 9, 0.4], ["setNull", 15, 9, 0.4], ["setNull", 1, 8, 0.4], ["setNull", 5, 8, 0.4], ["setNull", 6, 8, 0.4], ["setNull", 10, 8, 0.4], ["setNull", 11, 8, 0.4], ["setNull", 12, 8, 0.4], ["setNull", 13, 8, 0.4], ["setNull", 15, 8, 0.4], ["setUnfixedProb", 3, 1, 0.6], ["setUnfixedProb", 6, 1, 0.6], ["setUnfixedProb", 7, 1, 0.6], ["setUnfixedProb", 9, 1, 0.6], ["setUnfixedProb", 10, 1, 0.6], ["setUnfixedProb", 13, 1, 0.6], ["setUnfixedProb", 7, 2, 0.6], ["setUnfixedProb", 10, 2, 0.6], ["setUnfixedProb", 11, 2, 0.6], ["setUnfixedProb", 12, 2, 0.6], ["setUnfixedProb", 13, 2, 0.6], ["setUnfixedProb", 1, 3, 0.6], ["setUnfixedProb", 2, 3, 0.6], ["setUnfixedProb", 8, 3, 0.6], ["setUnfixedProb", 9, 3, 0.6], ["setUnfixedProb", 10, 3, 0.6], ["setUnfixedProb", 12, 3, 0.6], ["setUnfixedProb", 15, 3, 0.6], ["setUnfixedProb", 2, 4, 0.6], ["setUnfixedProb", 3, 4, 0.6], ["setUnfixedProb", 10, 4, 0.6], ["setUnfixedProb", 11, 4, 0.6], ["setUnfixedProb", 1, 5, 0.6], ["setUnfixedProb", 2, 5, 0.6], ["setUnfixedProb", 4, 5, 0.6], ["setUnfixedProb", 6, 5, 0.6], ["setUnfixedProb", 7, 5, 0.6], ["setUnfixedProb", 8, 5, 0.6], ["setUnfixedProb", 9, 5, 0.6], ["setUnfixedProb", 10, 5, 0.6], ["setUnfixedProb", 1, 6, 0.6], ["setUnfixedProb", 3, 6, 0.6], ["setUnfixedProb", 4, 6, 0.6], ["setUnfixedProb", 5, 6, 0.6], ["setUnfixedProb", 6, 6, 0.6], ["setUnfixedProb", 10, 6, 0.6], ["setUnfixedProb", 11, 6, 0.6], ["setUnfixedProb", 15, 6, 0.6], ["setUnfixedProb", 1, 7, 0.6], ["setUnfixedProb", 2, 7, 0.6], ["setUnfixedProb", 6, 7, 0.6], ["setUnfixedProb", 10, 7, 0.6], ["setUnfixedProb", 14, 7, 0.6], ["setUnfixedProb", 15, 7, 0.6], ["setUnfixedProb", 3, 13, 0.6], ["setUnfixedProb", 6, 13, 0.6], ["setUnfixedProb", 7, 13, 0.6], ["setUnfixedProb", 9, 13, 0.6], ["setUnfixedProb", 10, 13, 0.6], ["setUnfixedProb", 13, 13, 0.6], ["setUnfixedProb", 3, 12, 0.6], ["setUnfixedProb", 4, 12, 0.6], ["setUnfixedProb", 5, 12, 0.6], ["setUnfixedProb", 6, 12, 0.6], ["setUnfixedProb", 9, 12, 0.6], ["setUnfixedProb", 1, 11, 0.6], ["setUnfixedProb", 4, 11, 0.6], ["setUnfixedProb", 6, 11, 0.6], ["setUnfixedProb", 7, 11, 0.6], ["setUnfixedProb", 8, 11, 0.6], ["setUnfixedProb", 14, 11, 0.6], ["setUnfixedProb", 15, 11, 0.6], ["setUnfixedProb", 5, 10, 0.6], ["setUnfixedProb", 6, 10, 0.6], ["setUnfixedProb", 13, 10, 0.6], ["setUnfixedProb", 14, 10, 0.6], ["setUnfixedProb", 6, 9, 0.6], ["setUnfixedProb", 7, 9, 0.6], ["setUnfixedProb", 8, 9, 0.6], ["setUnfixedProb", 9, 9, 0.6], ["setUnfixedProb", 10, 9, 0.6], ["setUnfixedProb", 12, 9, 0.6], ["setUnfixedProb", 14, 9, 0.6], ["setUnfixedProb", 15, 9, 0.6], ["setUnfixedProb", 1, 8, 0.6], ["setUnfixedProb", 5, 8, 0.6], ["setUnfixedProb", 6, 8, 0.6], ["setUnfixedProb", 10, 8, 0.6], ["setUnfixedProb", 11, 8, 0.6], ["setUnfixedProb", 12, 8, 0.6], ["setUnfixedProb", 13, 8, 0.6], ["setUnfixedProb", 15, 8, 0.6], ["setUnfixedProb", 8, 1, 0.3], ["setUnfixedProb", 5, 3, 0.3], ["setUnfixedProb", 8, 4, 0.3], ["setUnfixedProb", 13, 5, 0.3], ["setUnfixedProb", 8, 13, 0.3], ["setUnfixedProb", 11, 11, 0.3], ["setUnfixedProb", 8, 10, 0.3], ["setUnfixedProb", 3, 9, 0.3], ["setFixedProb", 8, 1, 0.7], ["setFixedProb", 11, 1, 1], ["setFixedProb", 12, 1, 1], ["setFixedProb", 2, 2, 1], ["setFixedProb", 3, 2, 1], ["setFixedProb", 5, 2, 1], ["setFixedProb", 6, 2, 1], ["setFixedProb", 8, 2, 1], ["setFixedProb", 9, 2, 1], ["setFixedProb", 14, 2, 1], ["setFixedProb", 3, 3, 1], ["setFixedProb", 4, 3, 1], ["setFixedProb", 5, 3, 0.7], ["setFixedProb", 11, 3, 1], ["setFixedProb", 13, 3, 1], ["setFixedProb", 14, 3, 1], ["setFixedProb", 1, 4, 1], ["setFixedProb", 5, 4, 1], ["setFixedProb", 7, 4, 1], ["setFixedProb", 8, 4, 0.7], ["setFixedProb", 9, 4, 1], ["setFixedProb", 13, 4, 1], ["setFixedProb", 3, 5, 1], ["setFixedProb", 5, 5, 1], ["setFixedProb", 11, 5, 1], ["setFixedProb", 12, 5, 1], ["setFixedProb", 13, 5, 0.7], ["setFixedProb", 14, 5, 1], ["setFixedProb", 2, 6, 1], ["setFixedProb", 14, 6, 1], ["setFixedProb", 4, 7, 1], ["setFixedProb", 5, 7, 1], ["setFixedProb", 11, 7, 1], ["setFixedProb", 12, 7, 1], ["setFixedProb", 4, 13, 1], ["setFixedProb", 5, 13, 1], ["setFixedProb", 8, 13, 0.7], ["setFixedProb", 2, 12, 1], ["setFixedProb", 7, 12, 1], ["setFixedProb", 8, 12, 1], ["setFixedProb", 10, 12, 1], ["setFixedProb", 11, 12, 1], ["setFixedProb", 13, 12, 1], ["setFixedProb", 14, 12, 1], ["setFixedProb", 2, 11, 1], ["setFixedProb", 3, 11, 1], ["setFixedProb", 5, 11, 1], ["setFixedProb", 11, 11, 0.7], ["setFixedProb", 12, 11, 1], ["setFixedProb", 13, 11, 1], ["setFixedProb", 3, 10, 1], ["setFixedProb", 7, 10, 1], ["setFixedProb", 8, 10, 0.7], ["setFixedProb", 9, 10, 1], ["setFixedProb", 11, 10, 1], ["setFixedProb", 15, 10, 1], ["setFixedProb", 2, 9, 1], ["setFixedProb", 3, 9, 0.7], ["setFixedProb", 4, 9, 1], ["setFixedProb", 5, 9, 1], ["setFixedProb", 11, 9, 1], ["setFixedProb", 13, 9, 1], ["setFixedProb", 2, 8, 1], ["setFixedProb", 14, 8, 1]], "hazards": [{ "kind": "SpringBoard", "x": 4, "y": 4, "dir": 0 }, { "kind": "SpringBoard", "x": 12, "y": 4, "dir": 0 }, { "kind": "SpringBoard", "x": 4, "y": 10, "dir": 0 }, { "kind": "SpringBoard", "x": 12, "y": 10, "dir": 0 }] }, { "id": "factory-two", "theme": "factory", "begin": 41, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/FactoryMapData.as", "method": "setFactoryTwo", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 6, 1, 0.5], ["setNull", 7, 1, 0.5], ["setNull", 8, 1, 0.5], ["setNull", 9, 1, 0.5], ["setNull", 10, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 4, 2, 0.5], ["setNull", 5, 2, 0.5], ["setNull", 6, 2, 0.5], ["setNull", 8, 2, 0.5], ["setNull", 10, 2, 0.5], ["setNull", 11, 2, 0.5], ["setNull", 12, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 2, 3, 0.5], ["setNull", 4, 3, 0.5], ["setNull", 8, 3, 0.5], ["setNull", 12, 3, 0.5], ["setNull", 14, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 2, 4, 0.5], ["setNull", 14, 4, 0.5], ["setNull", 6, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 10, 5, 0.5], ["setNull", 1, 6, 0.5], ["setNull", 5, 6, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 11, 6, 0.5], ["setNull", 15, 6, 0.5], ["setNull", 1, 7, 0.5], ["setNull", 2, 7, 0.5], ["setNull", 4, 7, 0.5], ["setNull", 5, 7, 0.5], ["setNull", 11, 7, 0.5], ["setNull", 12, 7, 0.5], ["setNull", 14, 7, 0.5], ["setNull", 15, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 6, 13, 0.5], ["setNull", 7, 13, 0.5], ["setNull", 8, 13, 0.5], ["setNull", 9, 13, 0.5], ["setNull", 10, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 4, 12, 0.5], ["setNull", 5, 12, 0.5], ["setNull", 6, 12, 0.5], ["setNull", 8, 12, 0.5], ["setNull", 10, 12, 0.5], ["setNull", 11, 12, 0.5], ["setNull", 12, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 2, 11, 0.5], ["setNull", 4, 11, 0.5], ["setNull", 8, 11, 0.5], ["setNull", 12, 11, 0.5], ["setNull", 14, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 2, 10, 0.5], ["setNull", 14, 10, 0.5], ["setNull", 6, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 10, 9, 0.5], ["setNull", 1, 8, 0.5], ["setNull", 5, 8, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setNull", 11, 8, 0.5], ["setNull", 15, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 6, 1, 0.5], ["setUnfixedProb", 7, 1, 0.5], ["setUnfixedProb", 8, 1, 0.5], ["setUnfixedProb", 9, 1, 0.5], ["setUnfixedProb", 10, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 4, 2, 0.5], ["setUnfixedProb", 5, 2, 0.5], ["setUnfixedProb", 6, 2, 0.5], ["setUnfixedProb", 8, 2, 0.5], ["setUnfixedProb", 10, 2, 0.5], ["setUnfixedProb", 11, 2, 0.5], ["setUnfixedProb", 12, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 2, 3, 0.5], ["setUnfixedProb", 4, 3, 0.5], ["setUnfixedProb", 8, 3, 0.5], ["setUnfixedProb", 12, 3, 0.5], ["setUnfixedProb", 14, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 2, 4, 0.5], ["setUnfixedProb", 14, 4, 0.5], ["setUnfixedProb", 6, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 10, 5, 0.5], ["setUnfixedProb", 1, 6, 0.5], ["setUnfixedProb", 5, 6, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 11, 6, 0.5], ["setUnfixedProb", 15, 6, 0.5], ["setUnfixedProb", 1, 7, 0.5], ["setUnfixedProb", 2, 7, 0.5], ["setUnfixedProb", 4, 7, 0.5], ["setUnfixedProb", 5, 7, 0.5], ["setUnfixedProb", 11, 7, 0.5], ["setUnfixedProb", 12, 7, 0.5], ["setUnfixedProb", 14, 7, 0.5], ["setUnfixedProb", 15, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 6, 13, 0.5], ["setUnfixedProb", 7, 13, 0.5], ["setUnfixedProb", 8, 13, 0.5], ["setUnfixedProb", 9, 13, 0.5], ["setUnfixedProb", 10, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 4, 12, 0.5], ["setUnfixedProb", 5, 12, 0.5], ["setUnfixedProb", 6, 12, 0.5], ["setUnfixedProb", 8, 12, 0.5], ["setUnfixedProb", 10, 12, 0.5], ["setUnfixedProb", 11, 12, 0.5], ["setUnfixedProb", 12, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 2, 11, 0.5], ["setUnfixedProb", 4, 11, 0.5], ["setUnfixedProb", 8, 11, 0.5], ["setUnfixedProb", 12, 11, 0.5], ["setUnfixedProb", 14, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 2, 10, 0.5], ["setUnfixedProb", 14, 10, 0.5], ["setUnfixedProb", 6, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 10, 9, 0.5], ["setUnfixedProb", 1, 8, 0.5], ["setUnfixedProb", 5, 8, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 11, 8, 0.5], ["setUnfixedProb", 15, 8, 0.5], ["setUnfixedProb", 6, 3, 0.3], ["setUnfixedProb", 10, 3, 0.3], ["setUnfixedProb", 1, 5, 0.3], ["setUnfixedProb", 15, 5, 0.3], ["setUnfixedProb", 6, 11, 0.3], ["setUnfixedProb", 10, 11, 0.3], ["setUnfixedProb", 1, 9, 0.3], ["setUnfixedProb", 15, 9, 0.3], ["setFixedProb", 5, 1, 1], ["setFixedProb", 11, 1, 1], ["setFixedProb", 2, 2, 1], ["setFixedProb", 3, 2, 1], ["setFixedProb", 7, 2, 1], ["setFixedProb", 9, 2, 1], ["setFixedProb", 13, 2, 1], ["setFixedProb", 14, 2, 1], ["setFixedProb", 3, 3, 1], ["setFixedProb", 5, 3, 1], ["setFixedProb", 6, 3, 0.7], ["setFixedProb", 7, 3, 1], ["setFixedProb", 9, 3, 1], ["setFixedProb", 10, 3, 0.7], ["setFixedProb", 11, 3, 1], ["setFixedProb", 13, 3, 1], ["setFixedProb", 1, 4, 1], ["setFixedProb", 15, 4, 1], ["setFixedProb", 1, 5, 0.7], ["setFixedProb", 2, 5, 1], ["setFixedProb", 4, 5, 1], ["setFixedProb", 5, 5, 1], ["setFixedProb", 7, 5, 1], ["setFixedProb", 9, 5, 1], ["setFixedProb", 11, 5, 1], ["setFixedProb", 12, 5, 1], ["setFixedProb", 14, 5, 1], ["setFixedProb", 15, 5, 0.7], ["setFixedProb", 2, 6, 1], ["setFixedProb", 4, 6, 1], ["setFixedProb", 12, 6, 1], ["setFixedProb", 14, 6, 1], ["setFixedProb", 6, 7, 1], ["setFixedProb", 10, 7, 1], ["setFixedProb", 5, 13, 1], ["setFixedProb", 11, 13, 1], ["setFixedProb", 2, 12, 1], ["setFixedProb", 3, 12, 1], ["setFixedProb", 7, 12, 1], ["setFixedProb", 9, 12, 1], ["setFixedProb", 13, 12, 1], ["setFixedProb", 14, 12, 1], ["setFixedProb", 3, 11, 1], ["setFixedProb", 5, 11, 1], ["setFixedProb", 6, 11, 0.7], ["setFixedProb", 7, 11, 1], ["setFixedProb", 9, 11, 1], ["setFixedProb", 10, 11, 0.7], ["setFixedProb", 11, 11, 1], ["setFixedProb", 13, 11, 1], ["setFixedProb", 1, 10, 1], ["setFixedProb", 15, 10, 1], ["setFixedProb", 1, 9, 0.7], ["setFixedProb", 2, 9, 1], ["setFixedProb", 4, 9, 1], ["setFixedProb", 5, 9, 1], ["setFixedProb", 7, 9, 1], ["setFixedProb", 9, 9, 1], ["setFixedProb", 11, 9, 1], ["setFixedProb", 12, 9, 1], ["setFixedProb", 14, 9, 1], ["setFixedProb", 15, 9, 0.7], ["setFixedProb", 2, 8, 1], ["setFixedProb", 4, 8, 1], ["setFixedProb", 12, 8, 1], ["setFixedProb", 14, 8, 1]], "hazards": [{ "kind": "Transmittal", "x": 3, "y": 4, "dir": 2 }, { "kind": "Transmittal", "x": 4, "y": 4, "dir": 2 }, { "kind": "Transmittal", "x": 5, "y": 4, "dir": 2 }, { "kind": "Transmittal", "x": 6, "y": 4, "dir": 2 }, { "kind": "Transmittal", "x": 7, "y": 4, "dir": 2 }, { "kind": "Transmittal", "x": 8, "y": 4, "dir": 2 }, { "kind": "Transmittal", "x": 9, "y": 4, "dir": 2 }, { "kind": "Transmittal", "x": 10, "y": 4, "dir": 2 }, { "kind": "Transmittal", "x": 11, "y": 4, "dir": 2 }, { "kind": "Transmittal", "x": 12, "y": 4, "dir": 2 }, { "kind": "Transmittal", "x": 13, "y": 4, "dir": 4 }, { "kind": "Transmittal", "x": 13, "y": 5, "dir": 4 }, { "kind": "Transmittal", "x": 13, "y": 6, "dir": 4 }, { "kind": "Transmittal", "x": 13, "y": 7, "dir": 4 }, { "kind": "Transmittal", "x": 13, "y": 8, "dir": 4 }, { "kind": "Transmittal", "x": 13, "y": 9, "dir": 4 }, { "kind": "Transmittal", "x": 13, "y": 10, "dir": 1 }, { "kind": "Transmittal", "x": 12, "y": 10, "dir": 1 }, { "kind": "Transmittal", "x": 11, "y": 10, "dir": 1 }, { "kind": "Transmittal", "x": 10, "y": 10, "dir": 1 }, { "kind": "Transmittal", "x": 9, "y": 10, "dir": 1 }, { "kind": "Transmittal", "x": 8, "y": 10, "dir": 1 }, { "kind": "Transmittal", "x": 7, "y": 10, "dir": 1 }, { "kind": "Transmittal", "x": 6, "y": 10, "dir": 1 }, { "kind": "Transmittal", "x": 5, "y": 10, "dir": 1 }, { "kind": "Transmittal", "x": 4, "y": 10, "dir": 1 }, { "kind": "Transmittal", "x": 3, "y": 10, "dir": 3 }, { "kind": "Transmittal", "x": 3, "y": 9, "dir": 3 }, { "kind": "Transmittal", "x": 3, "y": 8, "dir": 3 }, { "kind": "Transmittal", "x": 3, "y": 7, "dir": 3 }, { "kind": "Transmittal", "x": 3, "y": 6, "dir": 3 }, { "kind": "Transmittal", "x": 3, "y": 5, "dir": 3 }] }, { "id": "factory-one", "theme": "factory", "begin": 41, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/FactoryMapData.as", "method": "setFactoryOne", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 6, 1, 0.5], ["setNull", 7, 1, 0.5], ["setNull", 8, 1, 0.5], ["setNull", 9, 1, 0.5], ["setNull", 10, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 3, 2, 0.5], ["setNull", 8, 2, 0.5], ["setNull", 13, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 3, 3, 0.5], ["setNull", 13, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 1, 4, 0.5], ["setNull", 8, 4, 0.5], ["setNull", 15, 4, 0.5], ["setNull", 1, 5, 0.5], ["setNull", 2, 5, 0.5], ["setNull", 3, 5, 0.5], ["setNull", 6, 5, 0.5], ["setNull", 7, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 9, 5, 0.5], ["setNull", 10, 5, 0.5], ["setNull", 13, 5, 0.5], ["setNull", 14, 5, 0.5], ["setNull", 15, 5, 0.5], ["setNull", 1, 6, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 15, 6, 0.5], ["setNull", 3, 7, 0.5], ["setNull", 5, 7, 0.5], ["setNull", 6, 7, 0.5], ["setNull", 10, 7, 0.5], ["setNull", 11, 7, 0.5], ["setNull", 13, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 6, 13, 0.5], ["setNull", 7, 13, 0.5], ["setNull", 8, 13, 0.5], ["setNull", 9, 13, 0.5], ["setNull", 10, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 3, 12, 0.5], ["setNull", 8, 12, 0.5], ["setNull", 13, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 3, 11, 0.5], ["setNull", 13, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 1, 10, 0.5], ["setNull", 8, 10, 0.5], ["setNull", 15, 10, 0.5], ["setNull", 1, 9, 0.5], ["setNull", 2, 9, 0.5], ["setNull", 3, 9, 0.5], ["setNull", 6, 9, 0.5], ["setNull", 7, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 9, 9, 0.5], ["setNull", 10, 9, 0.5], ["setNull", 13, 9, 0.5], ["setNull", 14, 9, 0.5], ["setNull", 15, 9, 0.5], ["setNull", 1, 8, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setNull", 15, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 6, 1, 0.5], ["setUnfixedProb", 7, 1, 0.5], ["setUnfixedProb", 8, 1, 0.5], ["setUnfixedProb", 9, 1, 0.5], ["setUnfixedProb", 10, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 3, 2, 0.5], ["setUnfixedProb", 8, 2, 0.5], ["setUnfixedProb", 13, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 3, 3, 0.5], ["setUnfixedProb", 13, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 1, 4, 0.5], ["setUnfixedProb", 8, 4, 0.5], ["setUnfixedProb", 15, 4, 0.5], ["setUnfixedProb", 1, 5, 0.5], ["setUnfixedProb", 2, 5, 0.5], ["setUnfixedProb", 3, 5, 0.5], ["setUnfixedProb", 6, 5, 0.5], ["setUnfixedProb", 7, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 9, 5, 0.5], ["setUnfixedProb", 10, 5, 0.5], ["setUnfixedProb", 13, 5, 0.5], ["setUnfixedProb", 14, 5, 0.5], ["setUnfixedProb", 15, 5, 0.5], ["setUnfixedProb", 1, 6, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 15, 6, 0.5], ["setUnfixedProb", 3, 7, 0.5], ["setUnfixedProb", 5, 7, 0.5], ["setUnfixedProb", 6, 7, 0.5], ["setUnfixedProb", 10, 7, 0.5], ["setUnfixedProb", 11, 7, 0.5], ["setUnfixedProb", 13, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 6, 13, 0.5], ["setUnfixedProb", 7, 13, 0.5], ["setUnfixedProb", 8, 13, 0.5], ["setUnfixedProb", 9, 13, 0.5], ["setUnfixedProb", 10, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 3, 12, 0.5], ["setUnfixedProb", 8, 12, 0.5], ["setUnfixedProb", 13, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 3, 11, 0.5], ["setUnfixedProb", 13, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 1, 10, 0.5], ["setUnfixedProb", 8, 10, 0.5], ["setUnfixedProb", 15, 10, 0.5], ["setUnfixedProb", 1, 9, 0.5], ["setUnfixedProb", 2, 9, 0.5], ["setUnfixedProb", 3, 9, 0.5], ["setUnfixedProb", 6, 9, 0.5], ["setUnfixedProb", 7, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 9, 9, 0.5], ["setUnfixedProb", 10, 9, 0.5], ["setUnfixedProb", 13, 9, 0.5], ["setUnfixedProb", 14, 9, 0.5], ["setUnfixedProb", 15, 9, 0.5], ["setUnfixedProb", 1, 8, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 15, 8, 0.5], ["setUnfixedProb", 5, 1, 0.3], ["setUnfixedProb", 11, 1, 0.3], ["setUnfixedProb", 5, 2, 0.3], ["setUnfixedProb", 11, 2, 0.3], ["setUnfixedProb", 2, 3, 0.3], ["setUnfixedProb", 14, 3, 0.3], ["setUnfixedProb", 6, 4, 0.3], ["setUnfixedProb", 10, 4, 0.3], ["setUnfixedProb", 5, 5, 0.3], ["setUnfixedProb", 11, 5, 0.3], ["setUnfixedProb", 2, 7, 0.3], ["setUnfixedProb", 14, 7, 0.3], ["setUnfixedProb", 5, 13, 0.3], ["setUnfixedProb", 11, 13, 0.3], ["setUnfixedProb", 5, 12, 0.3], ["setUnfixedProb", 11, 12, 0.3], ["setUnfixedProb", 2, 11, 0.3], ["setUnfixedProb", 14, 11, 0.3], ["setUnfixedProb", 6, 10, 0.3], ["setUnfixedProb", 10, 10, 0.3], ["setUnfixedProb", 5, 9, 0.3], ["setUnfixedProb", 11, 9, 0.3], ["setFixedProb", 5, 1, 0.7], ["setFixedProb", 11, 1, 0.7], ["setFixedProb", 2, 2, 1], ["setFixedProb", 4, 2, 1], ["setFixedProb", 5, 2, 0.7], ["setFixedProb", 6, 2, 1], ["setFixedProb", 7, 2, 1], ["setFixedProb", 9, 2, 1], ["setFixedProb", 10, 2, 1], ["setFixedProb", 11, 2, 0.7], ["setFixedProb", 12, 2, 1], ["setFixedProb", 14, 2, 1], ["setFixedProb", 2, 3, 0.7], ["setFixedProb", 14, 3, 0.7], ["setFixedProb", 2, 4, 1], ["setFixedProb", 3, 4, 1], ["setFixedProb", 5, 4, 1], ["setFixedProb", 6, 4, 0.7], ["setFixedProb", 7, 4, 1], ["setFixedProb", 9, 4, 1], ["setFixedProb", 10, 4, 0.7], ["setFixedProb", 11, 4, 1], ["setFixedProb", 13, 4, 1], ["setFixedProb", 14, 4, 1], ["setFixedProb", 5, 5, 0.7], ["setFixedProb", 11, 5, 0.7], ["setFixedProb", 2, 6, 1], ["setFixedProb", 3, 6, 1], ["setFixedProb", 5, 6, 1], ["setFixedProb", 11, 6, 1], ["setFixedProb", 13, 6, 1], ["setFixedProb", 14, 6, 1], ["setFixedProb", 1, 7, 1], ["setFixedProb", 2, 7, 0.7], ["setFixedProb", 14, 7, 0.7], ["setFixedProb", 15, 7, 1], ["setFixedProb", 5, 13, 0.7], ["setFixedProb", 11, 13, 0.7], ["setFixedProb", 2, 12, 1], ["setFixedProb", 4, 12, 1], ["setFixedProb", 5, 12, 0.7], ["setFixedProb", 6, 12, 1], ["setFixedProb", 7, 12, 1], ["setFixedProb", 9, 12, 1], ["setFixedProb", 10, 12, 1], ["setFixedProb", 11, 12, 0.7], ["setFixedProb", 12, 12, 1], ["setFixedProb", 14, 12, 1], ["setFixedProb", 2, 11, 0.7], ["setFixedProb", 14, 11, 0.7], ["setFixedProb", 2, 10, 1], ["setFixedProb", 3, 10, 1], ["setFixedProb", 5, 10, 1], ["setFixedProb", 6, 10, 0.7], ["setFixedProb", 7, 10, 1], ["setFixedProb", 9, 10, 1], ["setFixedProb", 10, 10, 0.7], ["setFixedProb", 11, 10, 1], ["setFixedProb", 13, 10, 1], ["setFixedProb", 14, 10, 1], ["setFixedProb", 5, 9, 0.7], ["setFixedProb", 11, 9, 0.7], ["setFixedProb", 2, 8, 1], ["setFixedProb", 3, 8, 1], ["setFixedProb", 5, 8, 1], ["setFixedProb", 11, 8, 1], ["setFixedProb", 13, 8, 1], ["setFixedProb", 14, 8, 1]], "hazards": [{ "kind": "Transmittal", "x": 4, "y": 3, "dir": 2 }, { "kind": "Transmittal", "x": 5, "y": 3, "dir": 2 }, { "kind": "Transmittal", "x": 6, "y": 3, "dir": 2 }, { "kind": "Transmittal", "x": 7, "y": 3, "dir": 2 }, { "kind": "Transmittal", "x": 8, "y": 3, "dir": 2 }, { "kind": "Transmittal", "x": 9, "y": 3, "dir": 2 }, { "kind": "Transmittal", "x": 10, "y": 3, "dir": 2 }, { "kind": "Transmittal", "x": 11, "y": 3, "dir": 2 }, { "kind": "Transmittal", "x": 12, "y": 3, "dir": 4 }, { "kind": "Transmittal", "x": 12, "y": 4, "dir": 4 }, { "kind": "Transmittal", "x": 12, "y": 5, "dir": 4 }, { "kind": "Transmittal", "x": 12, "y": 6, "dir": 4 }, { "kind": "Transmittal", "x": 12, "y": 7, "dir": 4 }, { "kind": "Transmittal", "x": 12, "y": 8, "dir": 4 }, { "kind": "Transmittal", "x": 12, "y": 9, "dir": 4 }, { "kind": "Transmittal", "x": 12, "y": 10, "dir": 4 }, { "kind": "Transmittal", "x": 12, "y": 11, "dir": 1 }, { "kind": "Transmittal", "x": 11, "y": 11, "dir": 1 }, { "kind": "Transmittal", "x": 10, "y": 11, "dir": 1 }, { "kind": "Transmittal", "x": 9, "y": 11, "dir": 1 }, { "kind": "Transmittal", "x": 8, "y": 11, "dir": 1 }, { "kind": "Transmittal", "x": 7, "y": 11, "dir": 1 }, { "kind": "Transmittal", "x": 6, "y": 11, "dir": 1 }, { "kind": "Transmittal", "x": 5, "y": 11, "dir": 1 }, { "kind": "Transmittal", "x": 4, "y": 11, "dir": 3 }, { "kind": "Transmittal", "x": 4, "y": 10, "dir": 3 }, { "kind": "Transmittal", "x": 4, "y": 9, "dir": 3 }, { "kind": "Transmittal", "x": 4, "y": 8, "dir": 3 }, { "kind": "Transmittal", "x": 4, "y": 7, "dir": 3 }, { "kind": "Transmittal", "x": 4, "y": 6, "dir": 3 }, { "kind": "Transmittal", "x": 4, "y": 5, "dir": 3 }, { "kind": "Transmittal", "x": 4, "y": 4, "dir": 3 }] }, { "id": "factory-three", "theme": "factory", "begin": 41, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/FactoryMapData.as", "method": "setFactoryThree", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 6, true], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 5, 1, 0.5], ["setNull", 6, 1, 0.5], ["setNull", 8, 1, 0.5], ["setNull", 10, 1, 0.5], ["setNull", 11, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 6, 2, 0.5], ["setNull", 10, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 2, 3, 0.5], ["setNull", 3, 3, 0.5], ["setNull", 4, 3, 0.5], ["setNull", 5, 3, 0.5], ["setNull", 11, 3, 0.5], ["setNull", 12, 3, 0.5], ["setNull", 13, 3, 0.5], ["setNull", 14, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 1, 4, 0.5], ["setNull", 15, 4, 0.5], ["setNull", 1, 5, 0.5], ["setNull", 2, 5, 0.5], ["setNull", 3, 5, 0.5], ["setNull", 7, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 9, 5, 0.5], ["setNull", 13, 5, 0.5], ["setNull", 14, 5, 0.5], ["setNull", 15, 5, 0.5], ["setNull", 1, 6, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 15, 6, 0.5], ["setNull", 6, 7, 0.5], ["setNull", 10, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 5, 13, 0.5], ["setNull", 6, 13, 0.5], ["setNull", 8, 13, 0.5], ["setNull", 10, 13, 0.5], ["setNull", 11, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 6, 12, 0.5], ["setNull", 10, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 2, 11, 0.5], ["setNull", 3, 11, 0.5], ["setNull", 4, 11, 0.5], ["setNull", 5, 11, 0.5], ["setNull", 11, 11, 0.5], ["setNull", 12, 11, 0.5], ["setNull", 13, 11, 0.5], ["setNull", 14, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 1, 10, 0.5], ["setNull", 15, 10, 0.5], ["setNull", 1, 9, 0.5], ["setNull", 2, 9, 0.5], ["setNull", 3, 9, 0.5], ["setNull", 7, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 9, 9, 0.5], ["setNull", 13, 9, 0.5], ["setNull", 14, 9, 0.5], ["setNull", 15, 9, 0.5], ["setNull", 1, 8, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setNull", 15, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 5, 1, 0.5], ["setUnfixedProb", 6, 1, 0.5], ["setUnfixedProb", 8, 1, 0.5], ["setUnfixedProb", 10, 1, 0.5], ["setUnfixedProb", 11, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 6, 2, 0.5], ["setUnfixedProb", 10, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 2, 3, 0.5], ["setUnfixedProb", 3, 3, 0.5], ["setUnfixedProb", 4, 3, 0.5], ["setUnfixedProb", 5, 3, 0.5], ["setUnfixedProb", 11, 3, 0.5], ["setUnfixedProb", 12, 3, 0.5], ["setUnfixedProb", 13, 3, 0.5], ["setUnfixedProb", 14, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 1, 4, 0.5], ["setUnfixedProb", 15, 4, 0.5], ["setUnfixedProb", 1, 5, 0.5], ["setUnfixedProb", 2, 5, 0.5], ["setUnfixedProb", 3, 5, 0.5], ["setUnfixedProb", 7, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 9, 5, 0.5], ["setUnfixedProb", 13, 5, 0.5], ["setUnfixedProb", 14, 5, 0.5], ["setUnfixedProb", 15, 5, 0.5], ["setUnfixedProb", 1, 6, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 15, 6, 0.5], ["setUnfixedProb", 6, 7, 0.5], ["setUnfixedProb", 10, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 5, 13, 0.5], ["setUnfixedProb", 6, 13, 0.5], ["setUnfixedProb", 8, 13, 0.5], ["setUnfixedProb", 10, 13, 0.5], ["setUnfixedProb", 11, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 6, 12, 0.5], ["setUnfixedProb", 10, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 2, 11, 0.5], ["setUnfixedProb", 3, 11, 0.5], ["setUnfixedProb", 4, 11, 0.5], ["setUnfixedProb", 5, 11, 0.5], ["setUnfixedProb", 11, 11, 0.5], ["setUnfixedProb", 12, 11, 0.5], ["setUnfixedProb", 13, 11, 0.5], ["setUnfixedProb", 14, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 1, 10, 0.5], ["setUnfixedProb", 15, 10, 0.5], ["setUnfixedProb", 1, 9, 0.5], ["setUnfixedProb", 2, 9, 0.5], ["setUnfixedProb", 3, 9, 0.5], ["setUnfixedProb", 7, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 9, 9, 0.5], ["setUnfixedProb", 13, 9, 0.5], ["setUnfixedProb", 14, 9, 0.5], ["setUnfixedProb", 15, 9, 0.5], ["setUnfixedProb", 1, 8, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 15, 8, 0.5], ["setUnfixedProb", 3, 2, 0.3], ["setUnfixedProb", 13, 2, 0.3], ["setUnfixedProb", 3, 4, 0.3], ["setUnfixedProb", 13, 4, 0.3], ["setUnfixedProb", 1, 7, 0.3], ["setUnfixedProb", 2, 7, 0.3], ["setUnfixedProb", 14, 7, 0.3], ["setUnfixedProb", 15, 7, 0.3], ["setUnfixedProb", 3, 12, 0.3], ["setUnfixedProb", 13, 12, 0.3], ["setUnfixedProb", 3, 10, 0.3], ["setUnfixedProb", 13, 10, 0.3], ["setFixedProb", 7, 1, 1], ["setFixedProb", 9, 1, 1], ["setFixedProb", 2, 2, 1], ["setFixedProb", 3, 2, 0.7], ["setFixedProb", 4, 2, 1], ["setFixedProb", 5, 2, 1], ["setFixedProb", 11, 2, 1], ["setFixedProb", 12, 2, 1], ["setFixedProb", 13, 2, 0.7], ["setFixedProb", 14, 2, 1], ["setFixedProb", 6, 3, 1], ["setFixedProb", 8, 3, 1], ["setFixedProb", 10, 3, 1], ["setFixedProb", 2, 4, 1], ["setFixedProb", 3, 4, 0.7], ["setFixedProb", 4, 4, 1], ["setFixedProb", 8, 4, 1], ["setFixedProb", 12, 4, 1], ["setFixedProb", 13, 4, 0.7], ["setFixedProb", 14, 4, 1], ["setFixedProb", 4, 5, 1], ["setFixedProb", 6, 5, 1], ["setFixedProb", 10, 5, 1], ["setFixedProb", 12, 5, 1], ["setFixedProb", 2, 6, 1], ["setFixedProb", 14, 6, 1], ["setFixedProb", 1, 7, 0.7], ["setFixedProb", 2, 7, 0.7], ["setFixedProb", 4, 7, 1], ["setFixedProb", 5, 7, 1], ["setFixedProb", 11, 7, 1], ["setFixedProb", 12, 7, 1], ["setFixedProb", 14, 7, 0.7], ["setFixedProb", 15, 7, 0.7], ["setFixedProb", 7, 13, 1], ["setFixedProb", 9, 13, 1], ["setFixedProb", 2, 12, 1], ["setFixedProb", 3, 12, 0.7], ["setFixedProb", 4, 12, 1], ["setFixedProb", 5, 12, 1], ["setFixedProb", 11, 12, 1], ["setFixedProb", 12, 12, 1], ["setFixedProb", 13, 12, 0.7], ["setFixedProb", 14, 12, 1], ["setFixedProb", 6, 11, 1], ["setFixedProb", 8, 11, 1], ["setFixedProb", 10, 11, 1], ["setFixedProb", 2, 10, 1], ["setFixedProb", 3, 10, 0.7], ["setFixedProb", 4, 10, 1], ["setFixedProb", 8, 10, 1], ["setFixedProb", 12, 10, 1], ["setFixedProb", 13, 10, 0.7], ["setFixedProb", 14, 10, 1], ["setFixedProb", 4, 9, 1], ["setFixedProb", 6, 9, 1], ["setFixedProb", 10, 9, 1], ["setFixedProb", 12, 9, 1], ["setFixedProb", 2, 8, 1], ["setFixedProb", 14, 8, 1]], "hazards": [{ "kind": "Transmittal", "x": 7, "y": 2, "dir": 2 }, { "kind": "Transmittal", "x": 8, "y": 2, "dir": 2 }, { "kind": "Transmittal", "x": 9, "y": 2, "dir": 4 }, { "kind": "Transmittal", "x": 9, "y": 3, "dir": 4 }, { "kind": "Transmittal", "x": 9, "y": 4, "dir": 2 }, { "kind": "Transmittal", "x": 10, "y": 4, "dir": 2 }, { "kind": "Transmittal", "x": 11, "y": 4, "dir": 4 }, { "kind": "Transmittal", "x": 11, "y": 5, "dir": 4 }, { "kind": "Transmittal", "x": 11, "y": 6, "dir": 2 }, { "kind": "Transmittal", "x": 12, "y": 6, "dir": 2 }, { "kind": "Transmittal", "x": 13, "y": 6, "dir": 4 }, { "kind": "Transmittal", "x": 13, "y": 7, "dir": 4 }, { "kind": "Transmittal", "x": 13, "y": 8, "dir": 1 }, { "kind": "Transmittal", "x": 12, "y": 8, "dir": 1 }, { "kind": "Transmittal", "x": 11, "y": 8, "dir": 4 }, { "kind": "Transmittal", "x": 11, "y": 9, "dir": 4 }, { "kind": "Transmittal", "x": 11, "y": 10, "dir": 1 }, { "kind": "Transmittal", "x": 10, "y": 10, "dir": 1 }, { "kind": "Transmittal", "x": 9, "y": 10, "dir": 4 }, { "kind": "Transmittal", "x": 9, "y": 11, "dir": 4 }, { "kind": "Transmittal", "x": 9, "y": 12, "dir": 1 }, { "kind": "Transmittal", "x": 8, "y": 12, "dir": 1 }, { "kind": "Transmittal", "x": 7, "y": 12, "dir": 3 }, { "kind": "Transmittal", "x": 7, "y": 11, "dir": 3 }, { "kind": "Transmittal", "x": 7, "y": 10, "dir": 1 }, { "kind": "Transmittal", "x": 6, "y": 10, "dir": 1 }, { "kind": "Transmittal", "x": 5, "y": 10, "dir": 3 }, { "kind": "Transmittal", "x": 5, "y": 9, "dir": 3 }, { "kind": "Transmittal", "x": 5, "y": 8, "dir": 1 }, { "kind": "Transmittal", "x": 4, "y": 8, "dir": 1 }, { "kind": "Transmittal", "x": 3, "y": 8, "dir": 3 }, { "kind": "Transmittal", "x": 3, "y": 7, "dir": 3 }, { "kind": "Transmittal", "x": 3, "y": 6, "dir": 2 }, { "kind": "Transmittal", "x": 4, "y": 6, "dir": 2 }, { "kind": "Transmittal", "x": 5, "y": 6, "dir": 3 }, { "kind": "Transmittal", "x": 5, "y": 5, "dir": 3 }, { "kind": "Transmittal", "x": 5, "y": 4, "dir": 2 }, { "kind": "Transmittal", "x": 6, "y": 4, "dir": 2 }, { "kind": "Transmittal", "x": 7, "y": 4, "dir": 3 }, { "kind": "Transmittal", "x": 7, "y": 3, "dir": 3 }] }, { "id": "center-three", "theme": "center", "begin": 51, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/CenterMapData.as", "method": "setCenterThree", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 7, 1, 0.5], ["setNull", 8, 1, 0.5], ["setNull", 9, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 4, 2, 0.5], ["setNull", 5, 2, 0.5], ["setNull", 7, 2, 0.5], ["setNull", 9, 2, 0.5], ["setNull", 11, 2, 0.5], ["setNull", 12, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 2, 3, 0.5], ["setNull", 5, 3, 0.5], ["setNull", 6, 3, 0.5], ["setNull", 7, 3, 0.5], ["setNull", 9, 3, 0.5], ["setNull", 10, 3, 0.5], ["setNull", 11, 3, 0.5], ["setNull", 14, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 2, 4, 0.5], ["setNull", 3, 4, 0.5], ["setNull", 6, 4, 0.5], ["setNull", 10, 4, 0.5], ["setNull", 13, 4, 0.5], ["setNull", 14, 4, 0.5], ["setNull", 3, 5, 0.5], ["setNull", 4, 5, 0.5], ["setNull", 5, 5, 0.5], ["setNull", 6, 5, 0.5], ["setNull", 7, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 9, 5, 0.5], ["setNull", 10, 5, 0.5], ["setNull", 11, 5, 0.5], ["setNull", 12, 5, 0.5], ["setNull", 13, 5, 0.5], ["setNull", 1, 6, 0.5], ["setNull", 4, 6, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 12, 6, 0.5], ["setNull", 15, 6, 0.5], ["setNull", 1, 7, 0.5], ["setNull", 2, 7, 0.5], ["setNull", 3, 7, 0.5], ["setNull", 4, 7, 0.5], ["setNull", 6, 7, 0.5], ["setNull", 10, 7, 0.5], ["setNull", 12, 7, 0.5], ["setNull", 13, 7, 0.5], ["setNull", 14, 7, 0.5], ["setNull", 15, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 7, 13, 0.5], ["setNull", 8, 13, 0.5], ["setNull", 9, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 4, 12, 0.5], ["setNull", 5, 12, 0.5], ["setNull", 7, 12, 0.5], ["setNull", 9, 12, 0.5], ["setNull", 11, 12, 0.5], ["setNull", 12, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 2, 11, 0.5], ["setNull", 5, 11, 0.5], ["setNull", 6, 11, 0.5], ["setNull", 7, 11, 0.5], ["setNull", 9, 11, 0.5], ["setNull", 10, 11, 0.5], ["setNull", 11, 11, 0.5], ["setNull", 14, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 2, 10, 0.5], ["setNull", 3, 10, 0.5], ["setNull", 6, 10, 0.5], ["setNull", 10, 10, 0.5], ["setNull", 13, 10, 0.5], ["setNull", 14, 10, 0.5], ["setNull", 3, 9, 0.5], ["setNull", 4, 9, 0.5], ["setNull", 5, 9, 0.5], ["setNull", 6, 9, 0.5], ["setNull", 7, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 9, 9, 0.5], ["setNull", 10, 9, 0.5], ["setNull", 11, 9, 0.5], ["setNull", 12, 9, 0.5], ["setNull", 13, 9, 0.5], ["setNull", 1, 8, 0.5], ["setNull", 4, 8, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setNull", 12, 8, 0.5], ["setNull", 15, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 7, 1, 0.5], ["setUnfixedProb", 8, 1, 0.5], ["setUnfixedProb", 9, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 4, 2, 0.5], ["setUnfixedProb", 5, 2, 0.5], ["setUnfixedProb", 7, 2, 0.5], ["setUnfixedProb", 9, 2, 0.5], ["setUnfixedProb", 11, 2, 0.5], ["setUnfixedProb", 12, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 2, 3, 0.5], ["setUnfixedProb", 5, 3, 0.5], ["setUnfixedProb", 6, 3, 0.5], ["setUnfixedProb", 7, 3, 0.5], ["setUnfixedProb", 9, 3, 0.5], ["setUnfixedProb", 10, 3, 0.5], ["setUnfixedProb", 11, 3, 0.5], ["setUnfixedProb", 14, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 2, 4, 0.5], ["setUnfixedProb", 3, 4, 0.5], ["setUnfixedProb", 6, 4, 0.5], ["setUnfixedProb", 10, 4, 0.5], ["setUnfixedProb", 13, 4, 0.5], ["setUnfixedProb", 14, 4, 0.5], ["setUnfixedProb", 3, 5, 0.5], ["setUnfixedProb", 4, 5, 0.5], ["setUnfixedProb", 5, 5, 0.5], ["setUnfixedProb", 6, 5, 0.5], ["setUnfixedProb", 7, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 9, 5, 0.5], ["setUnfixedProb", 10, 5, 0.5], ["setUnfixedProb", 11, 5, 0.5], ["setUnfixedProb", 12, 5, 0.5], ["setUnfixedProb", 13, 5, 0.5], ["setUnfixedProb", 1, 6, 0.5], ["setUnfixedProb", 4, 6, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 12, 6, 0.5], ["setUnfixedProb", 15, 6, 0.5], ["setUnfixedProb", 1, 7, 0.5], ["setUnfixedProb", 2, 7, 0.5], ["setUnfixedProb", 3, 7, 0.5], ["setUnfixedProb", 4, 7, 0.5], ["setUnfixedProb", 6, 7, 0.5], ["setUnfixedProb", 10, 7, 0.5], ["setUnfixedProb", 12, 7, 0.5], ["setUnfixedProb", 13, 7, 0.5], ["setUnfixedProb", 14, 7, 0.5], ["setUnfixedProb", 15, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 7, 13, 0.5], ["setUnfixedProb", 8, 13, 0.5], ["setUnfixedProb", 9, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 4, 12, 0.5], ["setUnfixedProb", 5, 12, 0.5], ["setUnfixedProb", 7, 12, 0.5], ["setUnfixedProb", 9, 12, 0.5], ["setUnfixedProb", 11, 12, 0.5], ["setUnfixedProb", 12, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 2, 11, 0.5], ["setUnfixedProb", 5, 11, 0.5], ["setUnfixedProb", 6, 11, 0.5], ["setUnfixedProb", 7, 11, 0.5], ["setUnfixedProb", 9, 11, 0.5], ["setUnfixedProb", 10, 11, 0.5], ["setUnfixedProb", 11, 11, 0.5], ["setUnfixedProb", 14, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 2, 10, 0.5], ["setUnfixedProb", 3, 10, 0.5], ["setUnfixedProb", 6, 10, 0.5], ["setUnfixedProb", 10, 10, 0.5], ["setUnfixedProb", 13, 10, 0.5], ["setUnfixedProb", 14, 10, 0.5], ["setUnfixedProb", 3, 9, 0.5], ["setUnfixedProb", 4, 9, 0.5], ["setUnfixedProb", 5, 9, 0.5], ["setUnfixedProb", 6, 9, 0.5], ["setUnfixedProb", 7, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 9, 9, 0.5], ["setUnfixedProb", 10, 9, 0.5], ["setUnfixedProb", 11, 9, 0.5], ["setUnfixedProb", 12, 9, 0.5], ["setUnfixedProb", 13, 9, 0.5], ["setUnfixedProb", 1, 8, 0.5], ["setUnfixedProb", 4, 8, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 12, 8, 0.5], ["setUnfixedProb", 15, 8, 0.5], ["setUnfixedProb", 6, 1, 0.3], ["setUnfixedProb", 10, 1, 0.3], ["setUnfixedProb", 8, 3, 0.3], ["setUnfixedProb", 8, 4, 0.3], ["setUnfixedProb", 1, 5, 0.3], ["setUnfixedProb", 15, 5, 0.3], ["setUnfixedProb", 5, 7, 0.3], ["setUnfixedProb", 11, 7, 0.3], ["setUnfixedProb", 6, 13, 0.3], ["setUnfixedProb", 10, 13, 0.3], ["setUnfixedProb", 8, 11, 0.3], ["setUnfixedProb", 8, 10, 0.3], ["setUnfixedProb", 1, 9, 0.3], ["setUnfixedProb", 15, 9, 0.3], ["setFixedProb", 5, 1, 1], ["setFixedProb", 6, 1, 0.7], ["setFixedProb", 10, 1, 0.7], ["setFixedProb", 11, 1, 1], ["setFixedProb", 2, 2, 1], ["setFixedProb", 3, 2, 1], ["setFixedProb", 6, 2, 1], ["setFixedProb", 8, 2, 1], ["setFixedProb", 10, 2, 1], ["setFixedProb", 13, 2, 1], ["setFixedProb", 14, 2, 1], ["setFixedProb", 3, 3, 1], ["setFixedProb", 4, 3, 1], ["setFixedProb", 8, 3, 0.7], ["setFixedProb", 12, 3, 1], ["setFixedProb", 13, 3, 1], ["setFixedProb", 1, 4, 1], ["setFixedProb", 4, 4, 1], ["setFixedProb", 5, 4, 1], ["setFixedProb", 7, 4, 1], ["setFixedProb", 8, 4, 0.7], ["setFixedProb", 9, 4, 1], ["setFixedProb", 11, 4, 1], ["setFixedProb", 12, 4, 1], ["setFixedProb", 15, 4, 1], ["setFixedProb", 1, 5, 0.7], ["setFixedProb", 2, 5, 1], ["setFixedProb", 14, 5, 1], ["setFixedProb", 15, 5, 0.7], ["setFixedProb", 2, 6, 1], ["setFixedProb", 3, 6, 1], ["setFixedProb", 5, 6, 1], ["setFixedProb", 11, 6, 1], ["setFixedProb", 13, 6, 1], ["setFixedProb", 14, 6, 1], ["setFixedProb", 5, 7, 0.7], ["setFixedProb", 11, 7, 0.7], ["setFixedProb", 5, 13, 1], ["setFixedProb", 6, 13, 0.7], ["setFixedProb", 10, 13, 0.7], ["setFixedProb", 11, 13, 1], ["setFixedProb", 2, 12, 1], ["setFixedProb", 3, 12, 1], ["setFixedProb", 6, 12, 1], ["setFixedProb", 8, 12, 1], ["setFixedProb", 10, 12, 1], ["setFixedProb", 13, 12, 1], ["setFixedProb", 14, 12, 1], ["setFixedProb", 3, 11, 1], ["setFixedProb", 4, 11, 1], ["setFixedProb", 8, 11, 0.7], ["setFixedProb", 12, 11, 1], ["setFixedProb", 13, 11, 1], ["setFixedProb", 1, 10, 1], ["setFixedProb", 4, 10, 1], ["setFixedProb", 5, 10, 1], ["setFixedProb", 7, 10, 1], ["setFixedProb", 8, 10, 0.7], ["setFixedProb", 9, 10, 1], ["setFixedProb", 11, 10, 1], ["setFixedProb", 12, 10, 1], ["setFixedProb", 15, 10, 1], ["setFixedProb", 1, 9, 0.7], ["setFixedProb", 2, 9, 1], ["setFixedProb", 14, 9, 1], ["setFixedProb", 15, 9, 0.7], ["setFixedProb", 2, 8, 1], ["setFixedProb", 3, 8, 1], ["setFixedProb", 5, 8, 1], ["setFixedProb", 11, 8, 1], ["setFixedProb", 13, 8, 1], ["setFixedProb", 14, 8, 1]], "hazards": [{ "kind": "TurnTable", "x": 7, "y": 6, "dir": 0 }] }, { "id": "center-two", "theme": "center", "begin": 51, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/CenterMapData.as", "method": "setCenterTwo", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 6, 1, 0.5], ["setNull", 7, 1, 0.5], ["setNull", 9, 1, 0.5], ["setNull", 10, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 4, 2, 0.5], ["setNull", 6, 2, 0.5], ["setNull", 10, 2, 0.5], ["setNull", 12, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 3, 3, 0.5], ["setNull", 4, 3, 0.5], ["setNull", 5, 3, 0.5], ["setNull", 6, 3, 0.5], ["setNull", 7, 3, 0.5], ["setNull", 9, 3, 0.5], ["setNull", 10, 3, 0.5], ["setNull", 11, 3, 0.5], ["setNull", 12, 3, 0.5], ["setNull", 13, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 1, 4, 0.5], ["setNull", 3, 4, 0.5], ["setNull", 7, 4, 0.5], ["setNull", 9, 4, 0.5], ["setNull", 13, 4, 0.5], ["setNull", 15, 4, 0.5], ["setNull", 1, 5, 0.5], ["setNull", 2, 5, 0.5], ["setNull", 3, 5, 0.5], ["setNull", 4, 5, 0.5], ["setNull", 6, 5, 0.5], ["setNull", 7, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 9, 5, 0.5], ["setNull", 10, 5, 0.5], ["setNull", 12, 5, 0.5], ["setNull", 13, 5, 0.5], ["setNull", 14, 5, 0.5], ["setNull", 15, 5, 0.5], ["setNull", 1, 6, 0.5], ["setNull", 4, 6, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 12, 6, 0.5], ["setNull", 15, 6, 0.5], ["setNull", 3, 7, 0.5], ["setNull", 4, 7, 0.5], ["setNull", 5, 7, 0.5], ["setNull", 6, 7, 0.5], ["setNull", 10, 7, 0.5], ["setNull", 11, 7, 0.5], ["setNull", 12, 7, 0.5], ["setNull", 13, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 6, 13, 0.5], ["setNull", 7, 13, 0.5], ["setNull", 9, 13, 0.5], ["setNull", 10, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 4, 12, 0.5], ["setNull", 6, 12, 0.5], ["setNull", 10, 12, 0.5], ["setNull", 12, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 3, 11, 0.5], ["setNull", 4, 11, 0.5], ["setNull", 5, 11, 0.5], ["setNull", 6, 11, 0.5], ["setNull", 7, 11, 0.5], ["setNull", 9, 11, 0.5], ["setNull", 10, 11, 0.5], ["setNull", 11, 11, 0.5], ["setNull", 12, 11, 0.5], ["setNull", 13, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 1, 10, 0.5], ["setNull", 3, 10, 0.5], ["setNull", 7, 10, 0.5], ["setNull", 9, 10, 0.5], ["setNull", 13, 10, 0.5], ["setNull", 15, 10, 0.5], ["setNull", 1, 9, 0.5], ["setNull", 2, 9, 0.5], ["setNull", 3, 9, 0.5], ["setNull", 4, 9, 0.5], ["setNull", 6, 9, 0.5], ["setNull", 7, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 9, 9, 0.5], ["setNull", 10, 9, 0.5], ["setNull", 12, 9, 0.5], ["setNull", 13, 9, 0.5], ["setNull", 14, 9, 0.5], ["setNull", 15, 9, 0.5], ["setNull", 1, 8, 0.5], ["setNull", 4, 8, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setNull", 12, 8, 0.5], ["setNull", 15, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 6, 1, 0.5], ["setUnfixedProb", 7, 1, 0.5], ["setUnfixedProb", 9, 1, 0.5], ["setUnfixedProb", 10, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 4, 2, 0.5], ["setUnfixedProb", 6, 2, 0.5], ["setUnfixedProb", 10, 2, 0.5], ["setUnfixedProb", 12, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 3, 3, 0.5], ["setUnfixedProb", 4, 3, 0.5], ["setUnfixedProb", 5, 3, 0.5], ["setUnfixedProb", 6, 3, 0.5], ["setUnfixedProb", 7, 3, 0.5], ["setUnfixedProb", 9, 3, 0.5], ["setUnfixedProb", 10, 3, 0.5], ["setUnfixedProb", 11, 3, 0.5], ["setUnfixedProb", 12, 3, 0.5], ["setUnfixedProb", 13, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 1, 4, 0.5], ["setUnfixedProb", 3, 4, 0.5], ["setUnfixedProb", 7, 4, 0.5], ["setUnfixedProb", 9, 4, 0.5], ["setUnfixedProb", 13, 4, 0.5], ["setUnfixedProb", 15, 4, 0.5], ["setUnfixedProb", 1, 5, 0.5], ["setUnfixedProb", 2, 5, 0.5], ["setUnfixedProb", 3, 5, 0.5], ["setUnfixedProb", 4, 5, 0.5], ["setUnfixedProb", 6, 5, 0.5], ["setUnfixedProb", 7, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 9, 5, 0.5], ["setUnfixedProb", 10, 5, 0.5], ["setUnfixedProb", 12, 5, 0.5], ["setUnfixedProb", 13, 5, 0.5], ["setUnfixedProb", 14, 5, 0.5], ["setUnfixedProb", 15, 5, 0.5], ["setUnfixedProb", 1, 6, 0.5], ["setUnfixedProb", 4, 6, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 12, 6, 0.5], ["setUnfixedProb", 15, 6, 0.5], ["setUnfixedProb", 3, 7, 0.5], ["setUnfixedProb", 4, 7, 0.5], ["setUnfixedProb", 5, 7, 0.5], ["setUnfixedProb", 6, 7, 0.5], ["setUnfixedProb", 10, 7, 0.5], ["setUnfixedProb", 11, 7, 0.5], ["setUnfixedProb", 12, 7, 0.5], ["setUnfixedProb", 13, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 6, 13, 0.5], ["setUnfixedProb", 7, 13, 0.5], ["setUnfixedProb", 9, 13, 0.5], ["setUnfixedProb", 10, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 4, 12, 0.5], ["setUnfixedProb", 6, 12, 0.5], ["setUnfixedProb", 10, 12, 0.5], ["setUnfixedProb", 12, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 3, 11, 0.5], ["setUnfixedProb", 4, 11, 0.5], ["setUnfixedProb", 5, 11, 0.5], ["setUnfixedProb", 6, 11, 0.5], ["setUnfixedProb", 7, 11, 0.5], ["setUnfixedProb", 9, 11, 0.5], ["setUnfixedProb", 10, 11, 0.5], ["setUnfixedProb", 11, 11, 0.5], ["setUnfixedProb", 12, 11, 0.5], ["setUnfixedProb", 13, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 1, 10, 0.5], ["setUnfixedProb", 3, 10, 0.5], ["setUnfixedProb", 7, 10, 0.5], ["setUnfixedProb", 9, 10, 0.5], ["setUnfixedProb", 13, 10, 0.5], ["setUnfixedProb", 15, 10, 0.5], ["setUnfixedProb", 1, 9, 0.5], ["setUnfixedProb", 2, 9, 0.5], ["setUnfixedProb", 3, 9, 0.5], ["setUnfixedProb", 4, 9, 0.5], ["setUnfixedProb", 6, 9, 0.5], ["setUnfixedProb", 7, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 9, 9, 0.5], ["setUnfixedProb", 10, 9, 0.5], ["setUnfixedProb", 12, 9, 0.5], ["setUnfixedProb", 13, 9, 0.5], ["setUnfixedProb", 14, 9, 0.5], ["setUnfixedProb", 15, 9, 0.5], ["setUnfixedProb", 1, 8, 0.5], ["setUnfixedProb", 4, 8, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 12, 8, 0.5], ["setUnfixedProb", 15, 8, 0.5], ["setUnfixedProb", 5, 1, 0.3], ["setUnfixedProb", 8, 1, 0.3], ["setUnfixedProb", 11, 1, 0.3], ["setUnfixedProb", 2, 3, 0.3], ["setUnfixedProb", 8, 3, 0.3], ["setUnfixedProb", 14, 3, 0.3], ["setUnfixedProb", 5, 4, 0.3], ["setUnfixedProb", 11, 4, 0.3], ["setUnfixedProb", 5, 5, 0.3], ["setUnfixedProb", 11, 5, 0.3], ["setUnfixedProb", 1, 7, 0.3], ["setUnfixedProb", 2, 7, 0.3], ["setUnfixedProb", 14, 7, 0.3], ["setUnfixedProb", 15, 7, 0.3], ["setUnfixedProb", 5, 13, 0.3], ["setUnfixedProb", 8, 13, 0.3], ["setUnfixedProb", 11, 13, 0.3], ["setUnfixedProb", 8, 12, 0.3], ["setUnfixedProb", 2, 11, 0.3], ["setUnfixedProb", 8, 11, 0.3], ["setUnfixedProb", 14, 11, 0.3], ["setUnfixedProb", 5, 10, 0.3], ["setUnfixedProb", 11, 10, 0.3], ["setUnfixedProb", 5, 9, 0.3], ["setUnfixedProb", 11, 9, 0.3], ["setFixedProb", 5, 1, 0.7], ["setFixedProb", 8, 1, 0.7], ["setFixedProb", 11, 1, 0.7], ["setFixedProb", 2, 2, 1], ["setFixedProb", 3, 2, 1], ["setFixedProb", 5, 2, 1], ["setFixedProb", 7, 2, 1], ["setFixedProb", 8, 2, 1], ["setFixedProb", 9, 2, 1], ["setFixedProb", 11, 2, 1], ["setFixedProb", 13, 2, 1], ["setFixedProb", 14, 2, 1], ["setFixedProb", 2, 3, 0.7], ["setFixedProb", 8, 3, 0.7], ["setFixedProb", 14, 3, 0.7], ["setFixedProb", 2, 4, 1], ["setFixedProb", 4, 4, 1], ["setFixedProb", 5, 4, 0.7], ["setFixedProb", 6, 4, 1], ["setFixedProb", 8, 4, 1], ["setFixedProb", 10, 4, 1], ["setFixedProb", 11, 4, 0.7], ["setFixedProb", 12, 4, 1], ["setFixedProb", 14, 4, 1], ["setFixedProb", 5, 5, 0.7], ["setFixedProb", 11, 5, 0.7], ["setFixedProb", 2, 6, 1], ["setFixedProb", 3, 6, 1], ["setFixedProb", 5, 6, 1], ["setFixedProb", 11, 6, 1], ["setFixedProb", 13, 6, 1], ["setFixedProb", 14, 6, 1], ["setFixedProb", 1, 7, 0.7], ["setFixedProb", 2, 7, 0.7], ["setFixedProb", 14, 7, 0.7], ["setFixedProb", 15, 7, 0.7], ["setFixedProb", 5, 13, 0.7], ["setFixedProb", 8, 13, 0.7], ["setFixedProb", 11, 13, 0.7], ["setFixedProb", 2, 12, 1], ["setFixedProb", 3, 12, 1], ["setFixedProb", 5, 12, 1], ["setFixedProb", 7, 12, 1], ["setFixedProb", 8, 12, 1], ["setFixedProb", 9, 12, 1], ["setFixedProb", 11, 12, 1], ["setFixedProb", 13, 12, 1], ["setFixedProb", 14, 12, 1], ["setFixedProb", 2, 11, 0.7], ["setFixedProb", 8, 11, 0.7], ["setFixedProb", 14, 11, 0.7], ["setFixedProb", 2, 10, 1], ["setFixedProb", 4, 10, 1], ["setFixedProb", 5, 10, 0.7], ["setFixedProb", 6, 10, 1], ["setFixedProb", 8, 10, 1], ["setFixedProb", 10, 10, 1], ["setFixedProb", 11, 10, 0.7], ["setFixedProb", 12, 10, 1], ["setFixedProb", 14, 10, 1], ["setFixedProb", 5, 9, 0.7], ["setFixedProb", 11, 9, 0.7], ["setFixedProb", 2, 8, 1], ["setFixedProb", 3, 8, 1], ["setFixedProb", 5, 8, 1], ["setFixedProb", 11, 8, 1], ["setFixedProb", 13, 8, 1], ["setFixedProb", 14, 8, 1]], "hazards": [{ "kind": "TurnTable", "x": 7, "y": 6, "dir": 0 }] }, { "id": "center-one", "theme": "center", "begin": 51, "source": "artifacts/swf-analysis/9109/embedded/scripts/actionSprite/mapData/CenterMapData.as", "method": "setCenterOne", "ops": [["setFixedProb", 0, 0, 1, 1], ["setFixedProb", 1, 0, 1, 1], ["setFixedProb", 2, 0, 1, 1], ["setFixedProb", 3, 0, 1, 1], ["setFixedProb", 4, 0, 1, 1], ["setFixedProb", 5, 0, 1, 1], ["setFixedProb", 6, 0, 1, 1], ["setFixedProb", 7, 0, 1, 1], ["setFixedProb", 8, 0, 1, 1], ["setFixedProb", 9, 0, 1, 1], ["setFixedProb", 10, 0, 1, 1], ["setFixedProb", 11, 0, 1, 1], ["setFixedProb", 12, 0, 1, 1], ["setFixedProb", 13, 0, 1, 1], ["setFixedProb", 14, 0, 1, 1], ["setFixedProb", 15, 0, 1, 1], ["setFixedProb", 16, 0, 1, 1], ["setFixedProb", 0, 14, 1, 1], ["setFixedProb", 1, 14, 1, 1], ["setFixedProb", 2, 14, 1, 1], ["setFixedProb", 3, 14, 1, 1], ["setFixedProb", 4, 14, 1, 1], ["setFixedProb", 5, 14, 1, 1], ["setFixedProb", 6, 14, 1, 1], ["setFixedProb", 7, 14, 1, 1], ["setFixedProb", 8, 14, 1, 1], ["setFixedProb", 9, 14, 1, 1], ["setFixedProb", 10, 14, 1, 1], ["setFixedProb", 11, 14, 1, 1], ["setFixedProb", 12, 14, 1, 1], ["setFixedProb", 13, 14, 1, 1], ["setFixedProb", 14, 14, 1, 1], ["setFixedProb", 15, 14, 1, 1], ["setFixedProb", 16, 14, 1, 1], ["setFixedProb", 0, 1, 1, 1], ["setFixedProb", 0, 2, 1, 1], ["setFixedProb", 0, 3, 1, 1], ["setFixedProb", 0, 4, 1, 1], ["setFixedProb", 0, 5, 1, 1], ["setFixedProb", 0, 6, 1, 1], ["setFixedProb", 0, 7, 1, 1], ["setFixedProb", 0, 8, 1, 1], ["setFixedProb", 0, 9, 1, 1], ["setFixedProb", 0, 10, 1, 1], ["setFixedProb", 0, 11, 1, 1], ["setFixedProb", 0, 12, 1, 1], ["setFixedProb", 0, 13, 1, 1], ["setFixedProb", 16, 1, 1, 1], ["setFixedProb", 16, 2, 1, 1], ["setFixedProb", 16, 3, 1, 1], ["setFixedProb", 16, 4, 1, 1], ["setFixedProb", 16, 5, 1, 1], ["setFixedProb", 16, 6, 1, 1], ["setFixedProb", 16, 7, 1, 1], ["setFixedProb", 16, 8, 1, 1], ["setFixedProb", 16, 9, 1, 1], ["setFixedProb", 16, 10, 1, 1], ["setFixedProb", 16, 11, 1, 1], ["setFixedProb", 16, 12, 1, 1], ["setFixedProb", 16, 13, 1, 1], ["setMidBox", 7, 7], ["setMidBox", 7, 8], ["setMidBox", 8, 6], ["setMidBox", 8, 7], ["setMidBox", 8, 8], ["setMidBox", 9, 6], ["setMidBox", 9, 7], ["setMidBox", 9, 8], ["setNull", 1, 1, 1], ["setNull", 2, 1, 1], ["setNull", 1, 2, 1], ["setNull", 14, 1, 1], ["setNull", 15, 1, 1], ["setNull", 15, 2, 1], ["setNull", 1, 12, 1], ["setNull", 1, 13, 1], ["setNull", 2, 13, 1], ["setNull", 14, 13, 1], ["setNull", 15, 12, 1], ["setNull", 15, 13, 1], ["setNull", 3, 1, 0.5], ["setNull", 4, 1, 0.5], ["setNull", 5, 1, 0.5], ["setNull", 6, 1, 0.5], ["setNull", 8, 1, 0.5], ["setNull", 10, 1, 0.5], ["setNull", 11, 1, 0.5], ["setNull", 12, 1, 0.5], ["setNull", 13, 1, 0.5], ["setNull", 5, 2, 0.5], ["setNull", 8, 2, 0.5], ["setNull", 11, 2, 0.5], ["setNull", 1, 3, 0.5], ["setNull", 2, 3, 0.5], ["setNull", 3, 3, 0.5], ["setNull", 5, 3, 0.5], ["setNull", 6, 3, 0.5], ["setNull", 7, 3, 0.5], ["setNull", 8, 3, 0.5], ["setNull", 9, 3, 0.5], ["setNull", 10, 3, 0.5], ["setNull", 11, 3, 0.5], ["setNull", 13, 3, 0.5], ["setNull", 14, 3, 0.5], ["setNull", 15, 3, 0.5], ["setNull", 1, 4, 0.5], ["setNull", 3, 4, 0.5], ["setNull", 6, 4, 0.5], ["setNull", 10, 4, 0.5], ["setNull", 13, 4, 0.5], ["setNull", 15, 4, 0.5], ["setNull", 3, 5, 0.5], ["setNull", 4, 5, 0.5], ["setNull", 5, 5, 0.5], ["setNull", 6, 5, 0.5], ["setNull", 7, 5, 0.5], ["setNull", 8, 5, 0.5], ["setNull", 9, 5, 0.5], ["setNull", 10, 5, 0.5], ["setNull", 11, 5, 0.5], ["setNull", 12, 5, 0.5], ["setNull", 13, 5, 0.5], ["setNull", 1, 6, 0.5], ["setNull", 3, 6, 0.5], ["setNull", 6, 6, 0.5], ["setNull", 10, 6, 0.5], ["setNull", 13, 6, 0.5], ["setNull", 15, 6, 0.5], ["setNull", 1, 7, 0.5], ["setNull", 2, 7, 0.5], ["setNull", 3, 7, 0.5], ["setNull", 4, 7, 0.5], ["setNull", 6, 7, 0.5], ["setNull", 10, 7, 0.5], ["setNull", 12, 7, 0.5], ["setNull", 13, 7, 0.5], ["setNull", 14, 7, 0.5], ["setNull", 15, 7, 0.5], ["setNull", 3, 13, 0.5], ["setNull", 4, 13, 0.5], ["setNull", 5, 13, 0.5], ["setNull", 6, 13, 0.5], ["setNull", 8, 13, 0.5], ["setNull", 10, 13, 0.5], ["setNull", 11, 13, 0.5], ["setNull", 12, 13, 0.5], ["setNull", 13, 13, 0.5], ["setNull", 5, 12, 0.5], ["setNull", 8, 12, 0.5], ["setNull", 11, 12, 0.5], ["setNull", 1, 11, 0.5], ["setNull", 2, 11, 0.5], ["setNull", 3, 11, 0.5], ["setNull", 5, 11, 0.5], ["setNull", 6, 11, 0.5], ["setNull", 7, 11, 0.5], ["setNull", 8, 11, 0.5], ["setNull", 9, 11, 0.5], ["setNull", 10, 11, 0.5], ["setNull", 11, 11, 0.5], ["setNull", 13, 11, 0.5], ["setNull", 14, 11, 0.5], ["setNull", 15, 11, 0.5], ["setNull", 1, 10, 0.5], ["setNull", 3, 10, 0.5], ["setNull", 6, 10, 0.5], ["setNull", 10, 10, 0.5], ["setNull", 13, 10, 0.5], ["setNull", 15, 10, 0.5], ["setNull", 3, 9, 0.5], ["setNull", 4, 9, 0.5], ["setNull", 5, 9, 0.5], ["setNull", 6, 9, 0.5], ["setNull", 7, 9, 0.5], ["setNull", 8, 9, 0.5], ["setNull", 9, 9, 0.5], ["setNull", 10, 9, 0.5], ["setNull", 11, 9, 0.5], ["setNull", 12, 9, 0.5], ["setNull", 13, 9, 0.5], ["setNull", 1, 8, 0.5], ["setNull", 3, 8, 0.5], ["setNull", 6, 8, 0.5], ["setNull", 10, 8, 0.5], ["setNull", 13, 8, 0.5], ["setNull", 15, 8, 0.5], ["setUnfixedProb", 3, 1, 0.5], ["setUnfixedProb", 4, 1, 0.5], ["setUnfixedProb", 5, 1, 0.5], ["setUnfixedProb", 6, 1, 0.5], ["setUnfixedProb", 8, 1, 0.5], ["setUnfixedProb", 10, 1, 0.5], ["setUnfixedProb", 11, 1, 0.5], ["setUnfixedProb", 12, 1, 0.5], ["setUnfixedProb", 13, 1, 0.5], ["setUnfixedProb", 5, 2, 0.5], ["setUnfixedProb", 8, 2, 0.5], ["setUnfixedProb", 11, 2, 0.5], ["setUnfixedProb", 1, 3, 0.5], ["setUnfixedProb", 2, 3, 0.5], ["setUnfixedProb", 3, 3, 0.5], ["setUnfixedProb", 5, 3, 0.5], ["setUnfixedProb", 6, 3, 0.5], ["setUnfixedProb", 7, 3, 0.5], ["setUnfixedProb", 8, 3, 0.5], ["setUnfixedProb", 9, 3, 0.5], ["setUnfixedProb", 10, 3, 0.5], ["setUnfixedProb", 11, 3, 0.5], ["setUnfixedProb", 13, 3, 0.5], ["setUnfixedProb", 14, 3, 0.5], ["setUnfixedProb", 15, 3, 0.5], ["setUnfixedProb", 1, 4, 0.5], ["setUnfixedProb", 3, 4, 0.5], ["setUnfixedProb", 6, 4, 0.5], ["setUnfixedProb", 10, 4, 0.5], ["setUnfixedProb", 13, 4, 0.5], ["setUnfixedProb", 15, 4, 0.5], ["setUnfixedProb", 3, 5, 0.5], ["setUnfixedProb", 4, 5, 0.5], ["setUnfixedProb", 5, 5, 0.5], ["setUnfixedProb", 6, 5, 0.5], ["setUnfixedProb", 7, 5, 0.5], ["setUnfixedProb", 8, 5, 0.5], ["setUnfixedProb", 9, 5, 0.5], ["setUnfixedProb", 10, 5, 0.5], ["setUnfixedProb", 11, 5, 0.5], ["setUnfixedProb", 12, 5, 0.5], ["setUnfixedProb", 13, 5, 0.5], ["setUnfixedProb", 1, 6, 0.5], ["setUnfixedProb", 3, 6, 0.5], ["setUnfixedProb", 6, 6, 0.5], ["setUnfixedProb", 10, 6, 0.5], ["setUnfixedProb", 13, 6, 0.5], ["setUnfixedProb", 15, 6, 0.5], ["setUnfixedProb", 1, 7, 0.5], ["setUnfixedProb", 2, 7, 0.5], ["setUnfixedProb", 3, 7, 0.5], ["setUnfixedProb", 4, 7, 0.5], ["setUnfixedProb", 6, 7, 0.5], ["setUnfixedProb", 10, 7, 0.5], ["setUnfixedProb", 12, 7, 0.5], ["setUnfixedProb", 13, 7, 0.5], ["setUnfixedProb", 14, 7, 0.5], ["setUnfixedProb", 15, 7, 0.5], ["setUnfixedProb", 3, 13, 0.5], ["setUnfixedProb", 4, 13, 0.5], ["setUnfixedProb", 5, 13, 0.5], ["setUnfixedProb", 6, 13, 0.5], ["setUnfixedProb", 8, 13, 0.5], ["setUnfixedProb", 10, 13, 0.5], ["setUnfixedProb", 11, 13, 0.5], ["setUnfixedProb", 12, 13, 0.5], ["setUnfixedProb", 13, 13, 0.5], ["setUnfixedProb", 5, 12, 0.5], ["setUnfixedProb", 8, 12, 0.5], ["setUnfixedProb", 11, 12, 0.5], ["setUnfixedProb", 1, 11, 0.5], ["setUnfixedProb", 2, 11, 0.5], ["setUnfixedProb", 3, 11, 0.5], ["setUnfixedProb", 5, 11, 0.5], ["setUnfixedProb", 6, 11, 0.5], ["setUnfixedProb", 7, 11, 0.5], ["setUnfixedProb", 8, 11, 0.5], ["setUnfixedProb", 9, 11, 0.5], ["setUnfixedProb", 10, 11, 0.5], ["setUnfixedProb", 11, 11, 0.5], ["setUnfixedProb", 13, 11, 0.5], ["setUnfixedProb", 14, 11, 0.5], ["setUnfixedProb", 15, 11, 0.5], ["setUnfixedProb", 1, 10, 0.5], ["setUnfixedProb", 3, 10, 0.5], ["setUnfixedProb", 6, 10, 0.5], ["setUnfixedProb", 10, 10, 0.5], ["setUnfixedProb", 13, 10, 0.5], ["setUnfixedProb", 15, 10, 0.5], ["setUnfixedProb", 3, 9, 0.5], ["setUnfixedProb", 4, 9, 0.5], ["setUnfixedProb", 5, 9, 0.5], ["setUnfixedProb", 6, 9, 0.5], ["setUnfixedProb", 7, 9, 0.5], ["setUnfixedProb", 8, 9, 0.5], ["setUnfixedProb", 9, 9, 0.5], ["setUnfixedProb", 10, 9, 0.5], ["setUnfixedProb", 11, 9, 0.5], ["setUnfixedProb", 12, 9, 0.5], ["setUnfixedProb", 13, 9, 0.5], ["setUnfixedProb", 1, 8, 0.5], ["setUnfixedProb", 3, 8, 0.5], ["setUnfixedProb", 6, 8, 0.5], ["setUnfixedProb", 10, 8, 0.5], ["setUnfixedProb", 13, 8, 0.5], ["setUnfixedProb", 15, 8, 0.5], ["setUnfixedProb", 7, 1, 0.3], ["setUnfixedProb", 9, 1, 0.3], ["setUnfixedProb", 3, 2, 0.3], ["setUnfixedProb", 13, 2, 0.3], ["setUnfixedProb", 4, 3, 0.3], ["setUnfixedProb", 12, 3, 0.3], ["setUnfixedProb", 8, 4, 0.3], ["setUnfixedProb", 1, 5, 0.3], ["setUnfixedProb", 2, 5, 0.3], ["setUnfixedProb", 14, 5, 0.3], ["setUnfixedProb", 15, 5, 0.3], ["setUnfixedProb", 5, 7, 0.3], ["setUnfixedProb", 11, 7, 0.3], ["setUnfixedProb", 7, 13, 0.3], ["setUnfixedProb", 9, 13, 0.3], ["setUnfixedProb", 3, 12, 0.3], ["setUnfixedProb", 13, 12, 0.3], ["setUnfixedProb", 4, 11, 0.3], ["setUnfixedProb", 12, 11, 0.3], ["setUnfixedProb", 8, 10, 0.3], ["setUnfixedProb", 1, 9, 0.3], ["setUnfixedProb", 2, 9, 0.3], ["setUnfixedProb", 14, 9, 0.3], ["setUnfixedProb", 15, 9, 0.3], ["setFixedProb", 7, 1, 0.7], ["setFixedProb", 9, 1, 0.7], ["setFixedProb", 2, 2, 1], ["setFixedProb", 3, 2, 0.7], ["setFixedProb", 4, 2, 1], ["setFixedProb", 6, 2, 1], ["setFixedProb", 7, 2, 1], ["setFixedProb", 9, 2, 1], ["setFixedProb", 10, 2, 1], ["setFixedProb", 12, 2, 1], ["setFixedProb", 13, 2, 0.7], ["setFixedProb", 14, 2, 1], ["setFixedProb", 4, 3, 0.7], ["setFixedProb", 12, 3, 0.7], ["setFixedProb", 2, 4, 1], ["setFixedProb", 4, 4, 1], ["setFixedProb", 5, 4, 1], ["setFixedProb", 7, 4, 1], ["setFixedProb", 8, 4, 0.7], ["setFixedProb", 9, 4, 1], ["setFixedProb", 11, 4, 1], ["setFixedProb", 12, 4, 1], ["setFixedProb", 14, 4, 1], ["setFixedProb", 1, 5, 0.7], ["setFixedProb", 2, 5, 0.7], ["setFixedProb", 14, 5, 0.7], ["setFixedProb", 15, 5, 0.7], ["setFixedProb", 2, 6, 1], ["setFixedProb", 4, 6, 1], ["setFixedProb", 5, 6, 1], ["setFixedProb", 11, 6, 1], ["setFixedProb", 12, 6, 1], ["setFixedProb", 14, 6, 1], ["setFixedProb", 5, 7, 0.7], ["setFixedProb", 11, 7, 0.7], ["setFixedProb", 7, 13, 0.7], ["setFixedProb", 9, 13, 0.7], ["setFixedProb", 2, 12, 1], ["setFixedProb", 3, 12, 0.7], ["setFixedProb", 4, 12, 1], ["setFixedProb", 6, 12, 1], ["setFixedProb", 7, 12, 1], ["setFixedProb", 9, 12, 1], ["setFixedProb", 10, 12, 1], ["setFixedProb", 12, 12, 1], ["setFixedProb", 13, 12, 0.7], ["setFixedProb", 14, 12, 1], ["setFixedProb", 4, 11, 0.7], ["setFixedProb", 12, 11, 0.7], ["setFixedProb", 2, 10, 1], ["setFixedProb", 4, 10, 1], ["setFixedProb", 5, 10, 1], ["setFixedProb", 7, 10, 1], ["setFixedProb", 8, 10, 0.7], ["setFixedProb", 9, 10, 1], ["setFixedProb", 11, 10, 1], ["setFixedProb", 12, 10, 1], ["setFixedProb", 14, 10, 1], ["setFixedProb", 1, 9, 0.7], ["setFixedProb", 2, 9, 0.7], ["setFixedProb", 14, 9, 0.7], ["setFixedProb", 15, 9, 0.7], ["setFixedProb", 2, 8, 1], ["setFixedProb", 4, 8, 1], ["setFixedProb", 5, 8, 1], ["setFixedProb", 11, 8, 1], ["setFixedProb", 12, 8, 1], ["setFixedProb", 14, 8, 1]], "hazards": [{ "kind": "TurnTable", "x": 7, "y": 6, "dir": 0 }] }];

  // src/expanded/bomb2-art.ts
  var BRICKS = { "1": { "x": 0, "y": -15, "w": 31, "h": 46 }, "10": { "x": 0, "y": 0, "w": 0, "h": 0 }, "11": { "x": 3, "y": -10, "w": 26, "h": 41 }, "12": { "x": -2, "y": -6, "w": 34, "h": 37 }, "13": { "x": -4, "y": -7, "w": 37, "h": 38 }, "14": { "x": -2, "y": -8, "w": 35, "h": 39 }, "15": { "x": -1, "y": -5, "w": 33, "h": 36 }, "16": { "x": -3, "y": -6, "w": 37, "h": 33 }, "17": { "x": 0, "y": -8, "w": 31, "h": 39 }, "18": { "x": -5, "y": -29, "w": 41, "h": 59 }, "19": { "x": 12, "y": -31, "w": 66, "h": 91 }, "2": { "x": 0, "y": -13, "w": 31, "h": 44 }, "20": { "x": 0, "y": 0, "w": 0, "h": 0 }, "21": { "x": -1, "y": -4, "w": 32, "h": 35 }, "22": { "x": 2, "y": -10, "w": 27, "h": 42 }, "23": { "x": -1, "y": -8, "w": 32, "h": 39 }, "24": { "x": -1, "y": -2, "w": 32, "h": 33 }, "25": { "x": 1, "y": -15, "w": 30, "h": 46 }, "26": { "x": 0, "y": -8, "w": 35, "h": 39 }, "27": { "x": -1, "y": -15, "w": 32, "h": 46 }, "28": { "x": -1, "y": -8, "w": 32, "h": 39 }, "29": { "x": -1, "y": -11, "w": 92, "h": 91 }, "3": { "x": 0, "y": -10, "w": 31, "h": 41 }, "30": { "x": 0, "y": 1, "w": 30, "h": 30 }, "31": { "x": -1, "y": -1, "w": 32, "h": 34 }, "32": { "x": 2, "y": -10, "w": 25, "h": 43 }, "33": { "x": 1, "y": -1, "w": 31, "h": 31 }, "34": { "x": -1, "y": -1, "w": 32, "h": 32 }, "35": { "x": 0, "y": -4, "w": 31, "h": 37 }, "36": { "x": -60, "y": -45, "w": 90, "h": 75 }, "37": { "x": -1, "y": -14, "w": 32, "h": 45 }, "38": { "x": 1, "y": -49, "w": 94, "h": 79 }, "39": { "x": -3, "y": -14, "w": 94, "h": 107 }, "4": { "x": 0, "y": -10, "w": 31, "h": 41 }, "40": { "x": -1, "y": 0, "w": 32, "h": 32 }, "41": { "x": -2, "y": -9, "w": 35, "h": 40 }, "42": { "x": -2, "y": -14, "w": 35, "h": 45 }, "43": { "x": -2, "y": -20, "w": 35, "h": 51 }, "44": { "x": -2, "y": -20, "w": 35, "h": 53 }, "45": { "x": -4, "y": -10, "w": 34, "h": 41 }, "46": { "x": -2, "y": -17, "w": 35, "h": 49 }, "47": { "x": -3, "y": -22, "w": 36, "h": 53 }, "48": { "x": -2, "y": -21, "w": 35, "h": 52 }, "49": { "x": -1, "y": -25, "w": 93, "h": 117 }, "5": { "x": 0, "y": -10, "w": 31, "h": 41 }, "50": { "x": 0, "y": 0, "w": 0, "h": 0 }, "51": { "x": 0, "y": -18, "w": 31, "h": 50 }, "52": { "x": 2, "y": -10, "w": 26, "h": 40 }, "53": { "x": 1, "y": -15, "w": 29, "h": 46 }, "54": { "x": 1, "y": -11, "w": 28, "h": 41 }, "55": { "x": 0, "y": -14, "w": 36, "h": 45 }, "56": { "x": -3, "y": -21, "w": 37, "h": 53 }, "57": { "x": -2, "y": -19, "w": 35, "h": 50 }, "58": { "x": 0, "y": -26, "w": 31, "h": 53 }, "59": { "x": 0, "y": 0, "w": 0, "h": 0 }, "6": { "x": 0, "y": -10, "w": 31, "h": 41 }, "60": { "x": 0, "y": 0, "w": 0, "h": 0 }, "7": { "x": 0, "y": -10, "w": 31, "h": 41 }, "8": { "x": 0, "y": -10, "w": 31, "h": 41 }, "9": { "x": -21, "y": -34, "w": 110, "h": 120 } };

  // src/expanded/bomb2-kill-art.ts
  var KILL_ART = { "hammer-down": { "frames": 25, "w": 55, "h": 53, "x": -27.5, "y": -26.5, "feet": 44, "symbol": 3631 }, "hammer-left": { "frames": 25, "w": 93, "h": 55, "x": -50.5, "y": -29, "feet": 49, "symbol": 3636 }, "hammer-right": { "frames": 25, "w": 93, "h": 55, "x": -42.5, "y": -29, "feet": 49, "symbol": 3639 }, "hammer-up": { "frames": 25, "w": 54, "h": 56, "x": -27.5, "y": -28, "feet": 48, "symbol": 3654 }, "launcher-down": { "frames": 14, "w": 23, "h": 22, "x": -11.5, "y": -11, "feet": 14, "symbol": 3600 }, "launcher-left": { "frames": 14, "w": 68, "h": 33, "x": -34.5, "y": -16.5, "feet": 26, "symbol": 3602 }, "launcher-right": { "frames": 14, "w": 69, "h": 33, "x": -34.5, "y": -16.5, "feet": 27, "symbol": 3604 }, "launcher-up": { "frames": 14, "w": 20, "h": 25, "x": -10, "y": -13, "feet": 14, "symbol": 3605 }, "shotgun-down": { "frames": 8, "w": 14, "h": 24, "x": -7, "y": -12, "feet": 16, "symbol": 3608 }, "shotgun-left": { "frames": 8, "w": 39, "h": 12, "x": -20, "y": -6, "feet": 12, "symbol": 3611 }, "shotgun-right": { "frames": 8, "w": 41, "h": 13, "x": -19.5, "y": -6.5, "feet": 13, "symbol": 3612 }, "shotgun-up": { "frames": 8, "w": 4, "h": 7, "x": -2, "y": -3.5, "feet": 7, "symbol": 3614 }, "laser-ready": { "frames": 12, "w": 45, "h": 31, "x": -22.5, "y": -15, "feet": 17, "symbol": 3596 }, "fire": { "frames": 24, "w": 94, "h": 44, "x": -47, "y": -20.5, "feet": 26, "symbol": 3661 }, "dead-0": { "frames": 64, "w": 37, "h": 82, "x": -18.5, "y": -41, "feet": 82, "symbol": 3020 }, "dead-1": { "frames": 64, "w": 37, "h": 81, "x": -18.5, "y": -40.5, "feet": 81, "symbol": 3154 }, "dead-2": { "frames": 64, "w": 38, "h": 84, "x": -19, "y": -42, "feet": 84, "symbol": 3248 }, "dead-3": { "frames": 64, "w": 47, "h": 81, "x": -23.5, "y": -40.5, "feet": 81, "symbol": 3323 } };

  // src/authority/player-status.ts
  var cache = /* @__PURE__ */ new Map();
  function icon(c, src, x, y, size, frames = 1) {
    let image2 = cache.get(src);
    if (!image2) {
      image2 = new Image();
      image2.src = src;
      cache.set(src, image2);
    }
    if (!image2.complete || !image2.naturalWidth) return;
    const w = image2.naturalWidth / frames, h = image2.naturalHeight, scale = Math.min(size / w, size / h);
    c.drawImage(image2, 0, 0, w, h, x + (size - w * scale) / 2, y + (size - h * scale) / 2, w * scale, h * scale);
  }
  function weaponBadge(c, weapon, x, feet, size = 16) {
    c.save();
    c.font = `bold ${size * 0.8}px system-ui`;
    c.textAlign = "left";
    const count = weapon.value, width = size + 7 + c.measureText(count).width, left = x - width / 2, top = feet - size - 3;
    c.fillStyle = "#10201ab8";
    c.fillRect(left - 3, top - 1, width + 6, size + 2);
    icon(c, weapon.src, left, top, size);
    c.fillStyle = "#fff5d7";
    c.strokeStyle = "#172b24";
    c.lineWidth = 2;
    c.strokeText(count, left + size + 4, top + size * 0.8);
    c.fillText(count, left + size + 4, top + size * 0.8);
    c.restore();
  }
  function drawPlayerStatus(c, players, x, y, width, height, ownSeat) {
    c.save();
    c.fillStyle = "#182d29";
    c.fillRect(x, y, width, height);
    c.textAlign = "left";
    const cardH = Math.min(132, (height - 16) / 4), pad = 10, colors = ["#8aceff", "#ffb2d2", "#ffe27e", "#b2e78f"];
    for (let seat = 1; seat <= 4; seat++) {
      const p = players.find((p2) => p2.seat === seat), top = y + 8 + (seat - 1) * cardH, left = x + pad;
      c.fillStyle = seat === ownSeat ? "#34534a" : "#243d36";
      c.fillRect(left, top, width - pad * 2, cardH - 6);
      c.fillStyle = p?.color ?? colors[seat - 1];
      c.fillRect(left, top, 3, cardH - 6);
      c.font = "bold 12px system-ui";
      c.fillText(`P${seat}${seat === ownSeat ? " \xB7 \u4F60" : ""}`, left + 9, top + 17);
      if (!p) {
        c.fillStyle = "#8ca39a";
        c.font = "11px system-ui";
        c.fillText("\u7A7A\u4F4D", left + 9, top + 40);
        continue;
      }
      const compact = cardH < 120, iconSize = compact ? 14 : 17;
      c.globalAlpha = p.alive ? 1 : 0.5;
      icon(c, p.portrait, left + 7, top + (compact ? 20 : 24), compact ? 23 : 30, p.portraitFrames);
      c.globalAlpha = 1;
      c.fillStyle = p.alive ? "#e4f0df" : "#bbbbb4";
      c.font = "11px system-ui";
      c.fillText(p.title, left + 43, top + (compact ? 30 : 36), width - pad * 2 - 48);
      c.fillStyle = "#bfcdc2";
      c.font = "10px system-ui";
      c.fillText(p.note, left + 43, top + (compact ? 42 : 51), width - pad * 2 - 48);
      const colW = (width - pad * 2 - 14) / 3;
      for (const [i, s] of p.icons.entries()) {
        const px = left + 7 + i % 3 * colW, py = top + (compact ? 47 : 59) + Math.floor(i / 3) * (compact ? 17 : 23);
        c.globalAlpha = s.active === false ? 0.25 : 1;
        icon(c, s.src, px, py, iconSize);
        c.fillStyle = "#ecedda";
        c.font = `bold ${compact ? 10 : 11}px system-ui`;
        c.fillText(s.value, px + iconSize + 2, py + iconSize * 0.8, colW - iconSize - 2);
        c.globalAlpha = 1;
      }
      if (p.weapon) {
        const py = top + cardH - 25;
        c.fillStyle = "#102620";
        c.fillRect(left + 6, py - 4, width - pad * 2 - 12, 20);
        icon(c, p.weapon.src, left + 9, py - 3, 18);
        c.fillStyle = "#ffedb8";
        c.font = "bold 11px system-ui";
        c.fillText(`${p.weapon.label} ${p.weapon.value}`, left + 31, py + 11, width - pad * 2 - 35);
      }
    }
    c.restore();
  }

  // src/expanded/bomb2-status.ts
  var BOMB2_FIELD_WIDTH = 600;
  var BOMB2_PANEL_WIDTH = 154;
  var BOMB2_CANVAS_WIDTH = BOMB2_FIELD_WIDTH + BOMB2_PANEL_WIDTH;
  var asset = (id) => `/expanded/assets/bomb2/prop-${id}.png`;
  var labels = { 15: "\u9524\u5B50", 16: "\u706B\u7BAD", 17: "\u9065\u63A7\u5F39", 18: "\u5730\u96F7", 19: "\u9730\u5F39\u67AA", 20: "\u6FC0\u5149", 21: "\u55B7\u706B\u5668" };
  function bomb2Weapon(s, p) {
    if (p.weapon && p.ammo > 0) return { src: `/expanded/assets/bomb2/hud-weapon-${p.weapon}.png`, label: labels[p.weapon], value: `\xD7${p.ammo}` };
    if (p.attack) return { src: `/expanded/assets/bomb2/hud-weapon-${p.attack.kind}.png`, label: labels[p.attack.kind], value: p.attack.remaining === -1 ? "\u221E" : "\xD70" };
    if (s.bombs.some((b) => b.kind === "remote" && b.owner === p.seat)) return { src: "/expanded/assets/bomb2/hud-weapon-remote-trigger.png", label: "\u5F15\u7206\u9065\u63A7\u5F39", value: "\xD70" };
    return s.mode === "kill" ? { src: "/expanded/assets/bomb2/hud-weapon-15.png", label: "\u9524\u5B50", value: "\u221E" } : null;
  }
  function bomb2Status(s) {
    return s.players.map((p) => ({
      seat: p.seat,
      alive: p.alive && p.respawnAt <= s.tick,
      portrait: `/expanded/assets/bomb2/hero-${p.character - 1}-down.png`,
      portraitFrames: 24,
      title: !p.alive ? "\u5DF2\u51FA\u5C40" : p.respawnAt > s.tick ? "\u590D\u6D3B\u4E2D" : `\u751F\u547D ${p.life}`,
      note: s.mode === "kill" ? `${p.points}/10 \u51FB\u6740` : s.mode === "collect" ? `${p.points}/10 \u91D1\u5E01` : s.mode === "color" ? `${p.points}/50 \u5730\u5757` : p.invulnerable ? "\u4FDD\u62A4\u4E2D" : "\u751F\u5B58",
      icons: [
        { src: asset(1), label: "\u70B8\u5F39\u6570\u91CF", value: String(p.capacity) },
        { src: asset(2), label: "\u5A01\u529B", value: String(p.range) },
        { src: asset(3), label: "\u901F\u5EA6", value: String(9 - p.speed) },
        { src: asset(4), label: "\u751F\u547D", value: String(p.life) },
        { src: asset(6), label: "\u8E22\u5F39", value: p.kick ? "\u2713" : "\u2014", active: p.kick },
        { src: asset(22), label: "\u62A4\u76FE", value: p.shield ? "\u2713" : "\u2014", active: p.shield }
      ],
      weapon: bomb2Weapon(s, p)
    }));
  }

  // src/expanded/bomb2-rules.json
  var bomb2_rules_default = {
    source: "games/9109/game.swf",
    rawSha256: "788c15ad1661e576cd004688785175ef62c2e0ef211db0fe83b5475625262ae1",
    function: "actionSprite.Game.mapPropInit",
    pools: {
      arcade: [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        22,
        7,
        4,
        15,
        15,
        16,
        21,
        21,
        20,
        20,
        19,
        19,
        17,
        18
      ],
      kill: [
        16,
        16,
        21,
        21,
        21,
        20,
        20,
        20,
        19,
        19,
        19,
        17,
        17,
        18,
        18,
        7
      ],
      collect: [
        2,
        2,
        2,
        2,
        2,
        1,
        1,
        1,
        1,
        1,
        3,
        3,
        6,
        6,
        22,
        7,
        15,
        16,
        21,
        20,
        19,
        17,
        18
      ],
      color: [
        2,
        2,
        2,
        2,
        2,
        1,
        1,
        1,
        1,
        1,
        3,
        3,
        6,
        6,
        22,
        7,
        15,
        16,
        21,
        20,
        19,
        17,
        18
      ]
    }
  };

  // src/expanded/bomb2-brick.json
  var bomb2_brick_default = {
    source: "games/9109/game.swf",
    symbol: 3006,
    frames: 11,
    w: 30,
    h: 34,
    path: "public/expanded/assets/bomb2/brick-burst.png",
    sha256: "a9018a59415102703496ac85a2e15bd605e6bb184107c0b9f72025e8a6e15cf3"
  };

  // src/expanded/bomb2-sound.ts
  var root = "/expanded/assets/bomb2/original/sounds/";
  var SOUND_FILES = {
    place: "4110_addBomb.mp3",
    remote: "4108_addTeleBomb.mp3",
    mine: "4109_addMineBomb.mp3",
    explode: "4107_bomb.mp3",
    pickup: "4104_eatProp.mp3",
    dead: "4105_dead.mp3",
    hammer: "4088_useSinker.mp3",
    launcher: "4091_useLauncher.mp3",
    shotgun: "4089_useShotgun.mp3",
    laserReady: "4093_useLaserReady.mp3",
    laser: "4092_useLaserShoot.mp3",
    fire: "4087_useThrower.mp3",
    shield: "4090_useNombril.mp3",
    invincible: "4100_InvincibilitySound.mp3",
    frog: "4101_getFrog.mp3",
    car: "4102_getCar.mp3",
    bulldozer: "4103_getBulldozer.mp3",
    crush: "4106_bulldozerProp.mp3",
    complete: "4099_levelComplete.mp3",
    failed: "4098_levelFailed.mp3",
    menu: "4115_uiMusic.mp3",
    music1: "4114_gameMusic_1.mp3",
    music2: "4113_gameMusic_2.mp3",
    music3: "4112_gameMusic_3.mp3",
    music4: "4111_gameMusic_4.mp3"
  };
  var audio = new NativeAudio(Object.fromEntries(Object.entries(SOUND_FILES).map(([name, file]) => [name, root + file])));
  function sound(s, name) {
    emitSound(s, name);
  }

  // src/expanded/bomb2.ts
  var HZ4 = 40;
  var WIDTH3 = 17;
  var HEIGHT3 = 15;
  var ROUND_TICKS3 = HZ4 * 180;
  var FUSE = 62;
  var DIRS = [[-1, 0], [0, -1], [1, 0], [0, 1]];
  var SPAWNS = [[1, 1], [15, 1], [1, 13], [15, 13]];
  var PROP_POOLS = bomb2_rules_default.pools;
  var KILL_PROPS = PROP_POOLS.kill;
  var MODES = ["arcade", "kill", "collect", "color"];
  var RESPAWN_TICKS = 64;
  var RESPAWN_PROTECTION_TICKS = 80;
  var WEAPON_USES = { 15: 2, 16: 2, 17: 1, 18: 1, 19: 2, 20: 2, 21: 2 };
  var WEAPON_LOCK = { 15: 25, 16: 14, 17: 0, 18: 0, 19: 8, 20: 23, 21: 24 };
  var THEMES = { mine: "\u77FF\u6D1E", beach: "\u6D77\u6EE9", snow: "\u51B0\u96EA", disce: "\u8FEA\u65AF\u79D1", factory: "\u5DE5\u5382", center: "\u57CE\u5E02" };
  var localSeat = null;
  var COIN_INTERVAL = HZ4 * 6 + 2;
  var FLOOR_COLORS = ["#0099ff", "#ffccff", "#ff9900", "#33cc00"];
  function territoryColor(s, seat) {
    return FLOOR_COLORS[(s.players.find((p) => p.seat === seat)?.character || seat) - 1];
  }
  var LABELS2 = { 1: "\u70B8\u5F39+1", 2: "\u5A01\u529B+1", 3: "\u901F\u5EA6+1", 4: "\u751F\u547D+1", 6: "\u8E22\u5F39", 7: "\u65E0\u654C", 9: "\u91D1\u5E01", 11: "\u98DE\u673A", 12: "\u63A8\u571F\u673A", 13: "\u6C7D\u8F66", 14: "\u9752\u86D9", 15: "\u9524\u5B50", 16: "\u706B\u7BAD", 17: "\u9065\u63A7\u5F39", 18: "\u5730\u96F7", 19: "\u9730\u5F39\u67AA", 20: "\u6FC0\u5149", 21: "\u55B7\u706B\u5668", 22: "\u62A4\u76FE" };
  function weaponLabel(s, p) {
    if (p.respawnAt > s.tick) return `\u590D\u6D3B\u4E2D \xB7 ${((p.respawnAt - s.tick) / HZ4).toFixed(1)} \u79D2`;
    if (p.attack) return `${LABELS2[p.attack.kind]} \xB7 \u91CA\u653E\u4E2D`;
    if (p.weapon) return `${LABELS2[p.weapon]} \xD7${p.ammo}${p.actionLock ? " \xB7 \u91CA\u653E\u4E2D" : ""}`;
    if (s.bombs.some((b) => b.owner === p.seat && b.kind === "remote")) return "\u9065\u63A7\u5F39 \xB7 \u6309\u653B\u51FB\u5F15\u7206";
    return s.mode === "kill" ? "\u57FA\u7840\u9524\u5B50 \xB7 \u65E0\u9650\u4F7F\u7528" : "\u70B8\u5F39";
  }
  var index2 = (x, y) => y * WIDTH3 + x;
  function random2(s) {
    let x = s.rng | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    s.rng = x >>> 0;
    return s.rng / 4294967296;
  }
  var inside = (x, y) => x >= 0 && x < WIDTH3 && y >= 0 && y < HEIGHT3;
  function direction(i) {
    return i.left ? 0 : i.up ? 1 : i.right ? 2 : i.down ? 3 : -1;
  }
  function create2(round, playing2, seats, seed, mapId, gameMode, settings) {
    const [legacyMode, selectedMap] = mapId?.includes(":") ? mapId.split(":") : ["arcade", mapId];
    const selectedMode = gameMode ?? legacyMode;
    const mode = MODES.includes(selectedMode) ? selectedMode : "arcade";
    const map = MAPS.find((m) => m.id === selectedMap) || MAPS[(round - 1) % MAPS.length];
    const s = {
      gameId: "9109-server",
      version: 1,
      round,
      tick: 0,
      phase: playing2 ? "playing" : "waiting",
      winner: null,
      ack: [0, 0, 0, 0],
      rng: seed >>> 0 || 1,
      mode,
      mapId: map.id,
      theme: map.theme,
      board: Array(255).fill(0),
      tiles: Array(255).fill(0),
      items: Array(255).fill(0),
      flames: Array(255).fill(0),
      owners: Array(255).fill(0),
      colors: Array(255).fill(0),
      bombs: [],
      shots: [],
      effects: [],
      hazards: map.hazards.map((h) => ({ ...h })),
      nextId: 1,
      scores: [0, 0, 0, 0],
      players: [],
      tram: 0,
      soundId: 0,
      sounds: [],
      musicTrack: 1,
      vehiclePool: [],
      vehiclesLeft: 4
    };
    s.musicTrack = 1 + Math.floor(random2(s) * 4);
    s.difficulty = settings?.difficulty || "normal";
    s.crateOffset = Math.floor(random2(s) * 3);
    s.crateBursts = [];
    if (mode !== "kill") {
      const vehicles = map.theme === "disce" ? [12, 13] : [12, 13, 14];
      while (s.vehiclePool.length < 2) s.vehiclePool.push(vehicles.splice(Math.floor(random2(s) * vehicles.length), 1)[0]);
    }
    const params = Array.from({ length: 255 }, () => ({ empty: 0, fixed: 0, crate: 0, mid: 0, frame: -1 }));
    for (const op of map.ops) {
      const [name, x, y, value, frame] = op;
      const p = params[index2(x, y)];
      if (name === "setNull") p.empty = value;
      else if (name === "setFixedProb") {
        p.fixed = value;
        p.frame = frame ?? -1;
      } else if (name === "setUnfixedProb") p.crate = value;
      else if (name === "setMidBox") {
        p.empty = 1;
        p.mid = value ? 3 : 2;
      }
    }
    for (let y = 0; y < HEIGHT3; y++) for (let x = 0; x < WIDTH3; x++) {
      const cell = index2(x, y), p = params[cell], r = random2(s);
      if (p.mid) {
        s.board[cell] = 1;
        s.tiles[cell] = p.mid === 3 ? map.begin + 8 : 0;
      } else if (r > p.empty && r < p.empty + p.fixed) {
        s.board[cell] = 1;
        s.tiles[cell] = map.begin + 5 + (p.frame >= 0 ? p.frame : Math.floor(random2(s) * 2));
      } else if (r > p.empty + p.fixed && r < p.empty + p.fixed + p.crate) {
        const roll = Math.floor(random2(s) * 3);
        s.board[cell] = 2;
        s.tiles[cell] = map.begin + (roll ? roll + s.crateOffset : 0);
      }
    }
    const used = /* @__PURE__ */ new Set();
    for (const seat of [...new Set(seats)].filter((n) => Number.isInteger(n) && n >= 1 && n <= 4).sort((a, b) => a - b)) {
      const preferred = settings?.characters?.[seat - 1] || seat;
      const character = used.has(preferred) ? [1, 2, 3, 4].find((c) => !used.has(c)) : preferred;
      used.add(character);
      const [x, y] = SPAWNS[character - 1] || SPAWNS[seat - 1];
      for (const [dx, dy] of [[0, 0], ...DIRS]) if (x + dx > 0 && x + dx < 16 && y + dy > 0 && y + dy < 14) {
        s.board[index2(x + dx, y + dy)] = 0;
        s.tiles[index2(x + dx, y + dy)] = 0;
      }
      s.players.push({ seat, character, x, y, dir: 3, moveDir: -1, progress: 0, moveTicks: 8, speed: 8, alive: true, life: 3, capacity: 1, range: 1, kick: false, shield: mode === "arcade" && s.difficulty === "easy", invulnerable: mode === "kill" ? RESPAWN_PROTECTION_TICKS : 0, lastAttack: 0, lastAlt: 0, weapon: 0, ammo: 0, vehicle: 0, vehicleUntil: 0, respawnAt: 0, teleportUntil: 0, killedBy: 0, points: 0, kills: 0, deaths: 0, diedAt: 0, actionLock: 0, attack: null, weaponStock: [] });
    }
    if (mode === "collect") for (let i = 0; i < 5; i++) spawnCoin(s);
    for (const p of s.players) p.invulnerable = RESPAWN_PROTECTION_TICKS;
    return s;
  }
  function spawnCoin(s) {
    const cells = s.board.map((v, i) => v === 0 && !s.items[i] && !s.players.some((p) => index2(p.x, p.y) === i) ? i : -1).filter((i) => i >= 0);
    if (cells.length) s.items[cells[Math.floor(random2(s) * cells.length)]] = 9;
  }
  function passable(s, x, y) {
    const rail = s.hazards.filter((h) => h.kind === "Rail"), tram = rail.length ? rail[Math.floor(s.tram) % rail.length] : null;
    return inside(x, y) && s.board[index2(x, y)] === 0 && !s.bombs.some((b) => b.x === x && b.y === y) && !(tram && tram.x === x && tram.y === y);
  }
  function breakCrate(s, cell) {
    if (s.board[cell] !== 2) return;
    s.board[cell] = 0;
    s.tiles[cell] = 0;
    s.crateBursts.push({ cell, born: s.tick, at: s.tick + bomb2_brick_default.frames });
  }
  function finishCrates(s) {
    for (const burst of s.crateBursts) {
      if (burst.at > s.tick) continue;
      const cell = burst.cell;
      if (s.board[cell] || s.items[cell]) continue;
      const pool = [...PROP_POOLS[s.mode], ...s.vehiclesLeft > 0 ? s.vehiclePool : []];
      if (s.items.filter((item) => item !== 0).length < 32 && random2(s) < 0.6) {
        const item = pool[Math.floor(random2(s) * pool.length)];
        s.items[cell] = item;
        if (item >= 11 && item <= 14) s.vehiclesLeft--;
      }
    }
    s.crateBursts = s.crateBursts.filter((b) => b.at > s.tick);
  }
  function ignite(s, x, y, owner) {
    if (!inside(x, y) || s.board[index2(x, y)] === 1) return;
    const cell = index2(x, y);
    if (s.flames[cell] <= s.tick) s.owners[cell] = owner;
    s.flames[cell] = s.tick + 16;
    if (s.board[cell] === 2) breakCrate(s, cell);
    else s.items[cell] = 0;
    for (const b of s.bombs) if (b.x === x && b.y === y) b.explodeAt = Math.min(b.explodeAt, s.tick);
  }
  function place(s, p, kind = "normal", x = p.x, y = p.y) {
    if (!inside(x, y) || s.board[index2(x, y)] || s.bombs.length >= 36 || s.bombs.some((b) => b.x === x && b.y === y) || s.bombs.filter((b) => b.owner === p.seat).length >= p.capacity) return false;
    s.bombs.push({ id: s.nextId++, owner: p.seat, x, y, range: kind === "mine" ? 2 : p.range, kind, explodeAt: kind === "normal" ? s.tick + FUSE : kind === "thrown" ? s.tick + 25 : ROUND_TICKS3 + FUSE, armedAt: kind === "mine" ? ROUND_TICKS3 + 20 : s.tick + 20, slide: -1 });
    sound(s, kind === "remote" ? "remote" : kind === "mine" ? "mine" : "place");
    return true;
  }
  function take(s, p) {
    const cell = index2(p.x, p.y), item = s.items[cell];
    if (!item) return;
    s.items[cell] = 0;
    sound(s, "pickup");
    if (item === 1) p.capacity = Math.min(9, p.capacity + 1);
    else if (item === 2) p.range = Math.min(5, p.range + 1);
    else if (item === 3) p.speed = Math.max(6, p.speed - 1);
    else if (item === 4) p.life = Math.min(255, p.life + 1);
    else if (item === 6) p.kick = true;
    else if (item === 7) p.invulnerable = HZ4 * 10;
    else if (item === 22) p.shield = true;
    else if (item === 9) {
      p.points++;
      s.scores[p.seat - 1] = p.points;
    } else if (item >= 11 && item <= 14) {
      p.vehicle = item;
      p.vehicleUntil = 0;
      sound(s, item === 12 ? "bulldozer" : item === 13 ? "car" : item === 14 ? "frog" : "pickup");
    } else {
      p.weapon = item;
      p.ammo = WEAPON_USES[item] || 2;
      p.weaponStock.push(item);
      p.weaponStock = p.weaponStock.slice(-32);
    }
    if (item === 7) sound(s, "invincible");
  }
  function dropWeapons(s, p) {
    for (let n = 0; n < 2 && p.weaponStock.length; n++) {
      const item = p.weaponStock.splice(Math.floor(random2(s) * p.weaponStock.length), 1)[0];
      const cells = s.board.map((v, i) => v === 0 && !s.items[i] && !s.bombs.some((b) => index2(b.x, b.y) === i) && Math.abs(i % WIDTH3 - p.x) + Math.abs(Math.floor(i / WIDTH3) - p.y) <= 2 ? i : -1).filter((i) => i >= 0);
      if (cells.length) s.items[cells[Math.floor(random2(s) * cells.length)]] = item;
    }
  }
  function hit(s, p, owner) {
    if (!p.alive || p.respawnAt > s.tick || p.invulnerable > 0) return;
    if (p.vehicle) {
      p.vehicle = 0;
      p.vehicleUntil = 0;
      p.moveDir = -1;
      p.progress = 0;
      p.invulnerable = RESPAWN_PROTECTION_TICKS;
      sound(s, "shield");
      return;
    }
    if (p.shield) {
      p.shield = false;
      p.invulnerable = RESPAWN_PROTECTION_TICKS;
      sound(s, "shield");
      return;
    }
    if (s.mode === "arcade") p.life--;
    p.deaths++;
    p.diedAt = s.tick;
    p.killedBy = owner;
    p.moveDir = -1;
    p.progress = 0;
    if (p.life <= 0) {
      p.alive = false;
      p.respawnAt = 0;
    } else p.respawnAt = s.tick + RESPAWN_TICKS;
    sound(s, "dead");
    p.attack = null;
    p.actionLock = 0;
    dropWeapons(s, p);
    if (s.mode === "collect") {
      const count = Math.floor(p.points / 2);
      for (let n = 0; n < count; n++) {
        const cells = s.board.map((v, i) => v === 0 && !s.items[i] && !s.bombs.some((b) => index2(b.x, b.y) === i) && Math.abs(i % WIDTH3 - p.x) + Math.abs(Math.floor(i / WIDTH3) - p.y) <= 2 ? i : -1).filter((i) => i >= 0);
        if (cells.length) {
          s.items[cells[Math.floor(random2(s) * cells.length)]] = 9;
          p.points--;
        }
      }
      s.scores[p.seat - 1] = p.points;
    }
    if (s.mode === "color") {
      for (let cell = 0; cell < s.colors.length; cell++) if (s.colors[cell] === p.seat) s.colors[cell] = 0;
      p.points = 0;
      s.scores[p.seat - 1] = 0;
    }
    p.weaponStock = [];
    p.weapon = 0;
    p.ammo = 0;
    p.speed = 8;
    p.moveTicks = 8;
    p.capacity = 1;
    p.range = 1;
    p.kick = false;
    p.shield = false;
    p.vehicle = 0;
    p.vehicleUntil = 0;
    p.invulnerable = 0;
    const killer = s.players.find((q) => q.seat === owner);
    if (killer && owner !== p.seat) {
      killer.kills++;
      if (s.mode === "kill") {
        killer.points++;
        s.scores[owner - 1] = killer.points;
      }
    } else if (s.mode === "kill" && owner === p.seat && p.points > 0) {
      p.points--;
      s.scores[p.seat - 1] = p.points;
    }
  }
  function useWeapon(s, p) {
    if (p.actionLock > 0 || p.attack || p.moveDir >= 0) return;
    const remote = s.bombs.filter((b) => b.owner === p.seat && b.kind === "remote");
    if (remote.length) {
      for (const b of remote) b.explodeAt = s.tick;
      return;
    }
    const kind = p.weapon || (s.mode === "kill" ? 15 : 0);
    if (!kind || p.weapon && p.ammo <= 0) return;
    if (kind === 17 || kind === 18) {
      if (!place(s, p, kind === 17 ? "remote" : "mine")) return;
      p.actionLock = 8;
    } else {
      if (s.shots.length >= 64 || s.effects.length >= 64) return;
      p.actionLock = WEAPON_LOCK[kind];
      p.attack = { kind, dir: p.dir, x: p.x, y: p.y, born: s.tick, at: s.tick + (kind === 20 ? 12 : kind === 21 ? 1 : WEAPON_LOCK[kind]), remaining: p.weapon ? Math.max(0, p.ammo - 1) : -1 };
    }
    if (p.weapon && --p.ammo <= 0) p.weapon = 0;
    const cue = { 15: "hammer", 16: "launcher", 19: "shotgun", 20: "laserReady", 21: "fire" };
    if (cue[kind]) sound(s, cue[kind]);
  }
  function updateAttacks(s) {
    for (const p of s.players) {
      const attack = p.attack;
      if (!attack || attack.at > s.tick) continue;
      p.attack = null;
      if (!p.alive || p.respawnAt > s.tick) continue;
      const { kind, dir, x, y } = attack, [dx, dy] = DIRS[dir];
      if (kind === 15) {
        const tx = x + dx, ty = y + dy;
        if (inside(tx, ty)) {
          const cell = index2(tx, ty);
          if (s.board[cell] === 2) breakCrate(s, cell);
          else if (s.board[cell] === 0) s.items[cell] = 0;
          for (const b of s.bombs) if (b.x === tx && b.y === ty) b.explodeAt = s.tick;
          for (const q of s.players) if (q.seat !== p.seat && (q.x === tx && q.y === ty || q.x === x && q.y === y)) hit(s, q, p.seat);
        }
      } else if ((kind === 16 || kind === 19) && s.shots.length < 64) {
        s.shots.push({ id: s.nextId++, owner: p.seat, x: x + 0.5, y: y + 0.5, vx: dx * (kind === 19 ? 12 / 30 : 10 / 30), vy: dy * (kind === 19 ? 12 / 30 : 10 / 30), until: s.tick + HZ4 * 4, kind });
      } else if ((kind === 20 || kind === 21) && s.effects.length < 64) {
        if (kind === 20) sound(s, "laser");
        const effect2 = { id: s.nextId++, kind, owner: p.seat, x, y, dir, born: s.tick, until: s.tick + (kind === 20 ? 11 : 23), cells: [] };
        if (kind === 20) for (let d = 1; d < Math.max(WIDTH3, HEIGHT3); d++) {
          const tx = x + dx * d, ty = y + dy * d;
          if (!inside(tx, ty) || s.board[index2(tx, ty)] === 1) break;
          const cell = index2(tx, ty), blocked2 = s.board[cell] === 2 || s.bombs.some((b) => b.x === tx && b.y === ty);
          effect2.cells.push(cell);
          if (blocked2) break;
        }
        s.effects.push(effect2);
      }
    }
    for (const effect2 of s.effects) {
      if (effect2.until <= s.tick) continue;
      const [dx, dy] = DIRS[effect2.dir];
      if (effect2.kind === 21) {
        effect2.cells = [];
        const range = Math.min(3, 1 + Math.floor((s.tick - effect2.born) / 8));
        for (let d = 1; d <= range; d++) {
          const x = effect2.x + dx * d, y = effect2.y + dy * d;
          if (!inside(x, y) || s.board[index2(x, y)] === 1) break;
          effect2.cells.push(index2(x, y));
        }
      }
      for (const cell of effect2.cells) {
        const x = cell % WIDTH3, y = Math.floor(cell / WIDTH3);
        if (effect2.kind === 21 || effect2.born === s.tick) {
          if (s.board[cell] === 2) breakCrate(s, cell);
          else s.items[cell] = 0;
          for (const b of s.bombs) if (b.x === x && b.y === y) b.explodeAt = s.tick;
        }
        for (const q of s.players) if (q.seat !== effect2.owner && q.x === x && q.y === y) hit(s, q, effect2.owner);
      }
    }
    s.effects = s.effects.filter((effect2) => effect2.until > s.tick);
  }
  function hazards(s, p) {
    if (p.teleportUntil > s.tick || p.vehicle) return;
    const h = s.hazards.find((h2) => h2.x === p.x && h2.y === p.y);
    if (!h) return;
    if (h.kind === "QuickSand" && h.target !== void 0) {
      const t = s.hazards[h.target];
      if (t && passable(s, t.x, t.y)) {
        p.x = t.x;
        p.y = t.y;
        p.teleportUntil = s.tick + HZ4;
      }
    } else if (h.kind === "SpringBoard") {
      const [dx, dy] = DIRS[p.dir];
      for (let d = 2; d > 0; d--) if (passable(s, p.x + dx * d, p.y + dy * d)) {
        p.x += dx * d;
        p.y += dy * d;
        p.teleportUntil = s.tick + 20;
        break;
      }
    } else if (h.kind === "Transmittal") {
      const dir = [0, 0, 2, 1, 3][h.dir] ?? p.dir;
      const [dx, dy] = DIRS[dir];
      if (passable(s, p.x + dx, p.y + dy)) {
        p.moveDir = dir;
        p.moveTicks = p.speed + 2;
        p.progress = 0;
      }
    } else if (h.kind === "IceFace") {
      const [dx, dy] = DIRS[p.dir];
      if (passable(s, p.x + dx, p.y + dy)) {
        p.moveDir = p.dir;
        p.moveTicks = Math.max(3, p.speed - 2);
        p.progress = 0;
      }
    }
  }
  function step2(s, inputs) {
    if (s.phase !== "playing") return;
    s.tick++;
    const rails = s.hazards.filter((h) => h.kind === "Rail");
    if (rails.length) s.tram = (s.tram + 1 / 30) % rails.length;
    for (const p of s.players) {
      const input = inputs[p.seat - 1];
      if (input) s.ack[p.seat - 1] = Math.max(s.ack[p.seat - 1], input.seq);
      if (!p.alive) continue;
      if (p.respawnAt) {
        if (input) {
          p.lastAttack = Math.max(p.lastAttack, input.attack);
          p.lastAlt = Math.max(p.lastAlt, input.alt);
        }
        if (p.respawnAt > s.tick) continue;
        const [x, y] = SPAWNS[p.character - 1];
        p.x = x;
        p.y = y;
        p.respawnAt = 0;
        p.invulnerable = RESPAWN_PROTECTION_TICKS;
      }
      if (p.invulnerable > 0) p.invulnerable--;
      if (p.actionLock > 0) p.actionLock--;
      if (p.moveDir >= 0) {
        if (++p.progress >= p.moveTicks) {
          const [dx, dy] = DIRS[p.moveDir];
          p.x += dx;
          p.y += dy;
          p.progress = 0;
          p.moveDir = -1;
          take(s, p);
          hazards(s, p);
        }
      }
      if (input) {
        if (p.actionLock > 0 || p.attack) {
          p.lastAttack = Math.max(p.lastAttack, input.attack);
          p.lastAlt = Math.max(p.lastAlt, input.alt);
        } else if (p.moveDir < 0) {
          const dir = direction(input);
          if (dir >= 0) p.dir = dir;
          if (input.attack > p.lastAttack) {
            p.lastAttack = input.attack;
            if (s.mode === "kill" || p.weapon || s.bombs.some((b) => b.kind === "remote" && b.owner === p.seat)) useWeapon(s, p);
            else place(s, p);
          }
          if (input.alt > p.lastAlt) {
            p.lastAlt = input.alt;
            useWeapon(s, p);
          }
        } else if (s.mode !== "kill" && !p.weapon && !s.bombs.some((b) => b.kind === "remote" && b.owner === p.seat) && input.attack > p.lastAttack) {
          p.lastAttack = input.attack;
          place(s, p);
        }
      }
      if (p.moveDir < 0 && input && p.actionLock === 0 && !p.attack) {
        const dir = direction(input);
        if (dir >= 0) {
          p.dir = dir;
          const [dx, dy] = DIRS[dir], x = p.x + dx, y = p.y + dy;
          const bomb = s.bombs.find((b) => b.x === x && b.y === y);
          if (bomb && p.kick && passable(s, x + dx, y + dy)) {
            bomb.slide = dir;
            bomb.x += dx;
            bomb.y += dy;
          }
          if (p.vehicle === 12 && inside(x, y) && s.board[index2(x, y)] === 2) {
            breakCrate(s, index2(x, y));
            p.actionLock = 12;
            sound(s, "crush");
            continue;
          }
          if (p.vehicle === 14 && inside(x, y) && !passable(s, x, y) && passable(s, x + dx, y + dy)) {
            p.x = x + dx;
            p.y = y + dy;
            p.teleportUntil = s.tick + 20;
            take(s, p);
          } else if ((passable(s, x, y) || p.vehicle === 11 && inside(x, y) && !s.bombs.some((b) => b.x === x && b.y === y)) && !((p.vehicle === 12 || p.vehicle === 13) && s.hazards.some((h) => h.kind === "SpringBoard" && h.x === x && h.y === y))) {
            p.moveDir = dir;
            p.moveTicks = p.vehicle === 12 ? 12 : p.vehicle === 13 ? 6 : p.speed;
            p.progress = 0;
          }
        }
      }
      if (s.mode === "color" && !p.respawnAt && s.board[index2(p.x, p.y)] === 0 && !s.hazards.some((h) => (h.kind === "SpringBoard" || h.kind === "QuickSand") && h.x === p.x && h.y === p.y)) s.colors[index2(p.x, p.y)] = p.seat;
      if (s.flames[index2(p.x, p.y)] > s.tick) hit(s, p, s.owners[index2(p.x, p.y)]);
    }
    updateAttacks(s);
    for (const b of s.bombs) {
      if (b.slide >= 0 && s.tick % 3 === 0) {
        const [dx, dy] = DIRS[b.slide];
        if (passable(s, b.x + dx, b.y + dy)) {
          b.x += dx;
          b.y += dy;
        } else b.slide = -1;
      }
      if (b.kind === "mine") {
        const owner = s.players.find((p) => p.seat === b.owner);
        if (b.armedAt > s.tick && (!owner || !owner.alive || owner.respawnAt || owner.x !== b.x || owner.y !== b.y)) b.armedAt = s.tick;
        if (b.armedAt <= s.tick && s.players.some((p) => p.alive && !p.respawnAt && p.x === b.x && p.y === b.y)) b.explodeAt = s.tick;
      }
      if (s.flames[index2(b.x, b.y)] > s.tick) b.explodeAt = s.tick;
    }
    s.shots = s.shots.filter((shot2) => {
      for (let k = 0; k < 4; k++) {
        const oldX = Math.floor(shot2.x), oldY = Math.floor(shot2.y);
        shot2.x += shot2.vx / 4;
        shot2.y += shot2.vy / 4;
        const x = Math.floor(shot2.x), y = Math.floor(shot2.y);
        if (!inside(x, y)) return false;
        if (s.board[index2(x, y)] || s.bombs.some((b) => b.x === x && b.y === y)) {
          if (shot2.kind === 16) {
            const tx = s.board[index2(x, y)] === 1 ? oldX : x, ty = s.board[index2(x, y)] === 1 ? oldY : y;
            ignite(s, tx, ty, shot2.owner);
            for (const [dx, dy] of DIRS) ignite(s, tx + dx, ty + dy, shot2.owner);
          } else {
            breakCrate(s, index2(x, y));
            for (const b of s.bombs) if (b.x === x && b.y === y) b.explodeAt = s.tick;
          }
          return false;
        }
        const p = s.players.find((p2) => p2.alive && !p2.respawnAt && p2.seat !== shot2.owner && Math.hypot(p2.x + 0.5 - shot2.x, p2.y + 0.5 - shot2.y) < 0.4);
        if (p) {
          if (shot2.kind === 16) {
            ignite(s, x, y, shot2.owner);
            for (const [dx, dy] of DIRS) ignite(s, x + dx, y + dy, shot2.owner);
          } else hit(s, p, shot2.owner);
          return false;
        }
      }
      return shot2.until > s.tick;
    });
    const exploded = /* @__PURE__ */ new Set();
    for (let cycle = 0; cycle < 36; cycle++) {
      const b = s.bombs.find((b2) => b2.explodeAt <= s.tick && !exploded.has(b2.id));
      if (!b) break;
      exploded.add(b.id);
      sound(s, "explode");
      ignite(s, b.x, b.y, b.owner);
      for (const [dx, dy] of DIRS) for (let distance = 1; distance <= b.range; distance++) {
        const x = b.x + dx * distance, y = b.y + dy * distance;
        if (!inside(x, y) || s.board[index2(x, y)] === 1) break;
        const crate = s.board[index2(x, y)] === 2;
        ignite(s, x, y, b.owner);
        if (crate) break;
      }
      if (b.kind === "mine") for (const dx of [-1, 1]) for (const dy of [-1, 1]) ignite(s, b.x + dx, b.y + dy, b.owner);
    }
    s.bombs = s.bombs.filter((b) => !exploded.has(b.id));
    for (const p of s.players) if (p.alive && !p.respawnAt && s.flames[index2(p.x, p.y)] > s.tick) hit(s, p, s.owners[index2(p.x, p.y)]);
    for (const h of s.hazards) if (h.kind === "TurnTable" && s.tick % (HZ4 * 23) === 0) {
      const cells = s.board.map((v, i) => v === 0 && !s.items[i] && Math.abs(i % WIDTH3 - h.x) + Math.abs(Math.floor(i / WIDTH3) - h.y) <= 4 ? i : -1).filter((i) => i >= 0);
      const pool = PROP_POOLS[s.mode];
      for (let i = 0; i < 2 && cells.length; i++) {
        const cell = cells.splice(Math.floor(random2(s) * cells.length), 1)[0];
        s.items[cell] = pool[Math.floor(random2(s) * pool.length)];
      }
    }
    if (s.mode === "collect" && s.tick % COIN_INTERVAL === 0) spawnCoin(s);
    finishCrates(s);
    if (s.mode === "color") for (const p of s.players) {
      p.points = s.colors.filter((v) => v === p.seat).length;
      s.scores[p.seat - 1] = p.points;
    }
    const alive = s.players.filter((p) => p.alive), target = s.mode === "color" ? 50 : s.mode === "arcade" ? Infinity : 10;
    const reached = s.players.filter((p) => p.points >= target);
    if (alive.length <= 1 || reached.length || s.tick >= ROUND_TICKS3) {
      s.phase = "finished";
      if (reached.length) s.winner = reached.length === 1 ? reached[0].seat : null;
      else if (alive.length === 1) s.winner = alive[0].seat;
      else if (s.tick >= ROUND_TICKS3) {
        const ranks = alive.map((p) => ({ seat: p.seat, score: s.mode === "arcade" ? p.life : p.points })).sort((a, b) => b.score - a.score);
        s.winner = ranks.length && ranks[0].score !== ranks[1]?.score ? ranks[0].seat : null;
      } else s.winner = null;
      if (s.winner !== null && s.mode === "arcade") s.scores[s.winner - 1]++;
      sound(s, "result");
    }
  }
  function valid2(value) {
    if (!value || typeof value !== "object") return false;
    const s = value;
    const int = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;
    if (!["easy", "normal", "hard"].includes(s.difficulty) || !int(s.crateOffset, 0, 2) || !Array.isArray(s.players) || !s.players.every((p) => p && int(p.character, 1, 4)) || new Set(s.players.map((p) => p.character)).size !== s.players.length) return false;
    if (s.gameId !== "9109-server" || s.version !== 1 || !int(s.round, 1, Number.MAX_SAFE_INTEGER) || !int(s.tick, 0, ROUND_TICKS3) || !int(s.rng, 0, 4294967295) || !int(s.nextId, 1, 1e7) || !MODES.includes(s.mode) || !MAPS.some((m) => m.id === s.mapId && m.theme === s.theme) || !["waiting", "playing", "finished"].includes(s.phase)) return false;
    if (!int(s.soundId, 0, 1e9) || !int(s.musicTrack, 1, 4) || !Array.isArray(s.sounds) || s.sounds.length > 64 || !s.sounds.every((e, i) => e && int(e.id, 1, s.soundId) && (i === 0 || e.id > s.sounds[i - 1].id) && (e.name === "result" || Object.prototype.hasOwnProperty.call(SOUND_FILES, e.name))) || !Array.isArray(s.vehiclePool) || s.vehiclePool.length !== (s.mode === "kill" ? 0 : 2) || new Set(s.vehiclePool).size !== s.vehiclePool.length || !s.vehiclePool.every((v) => (s.theme === "disce" ? [12, 13] : [12, 13, 14]).includes(v)) || !int(s.vehiclesLeft, 0, 4)) return false;
    if (!Array.isArray(s.crateBursts) || s.crateBursts.length > 255 || !s.crateBursts.every((b) => b && int(b.cell, 0, 254) && int(b.born, 0, s.tick) && b.at === b.born + bomb2_brick_default.frames)) return false;
    if (!Array.isArray(s.players) || s.players.length > 4 || new Set(s.players.map((p) => p?.seat)).size !== s.players.length || !s.players.every((p) => p && int(p.seat, 1, 4) && int(p.x, 0, 16) && int(p.y, 0, 14) && typeof p.alive === "boolean" && int(p.life, 0, 255) && int(p.dir, 0, 3) && int(p.moveDir, -1, 3) && int(p.progress, 0, 19) && int(p.moveTicks, 3, 20) && p.progress < p.moveTicks && int(p.speed, 4, 8) && int(p.capacity, 1, 9) && int(p.range, 1, 10) && int(p.lastAttack, 0, 1e9) && int(p.lastAlt, 0, 1e9) && int(p.invulnerable, 0, HZ4 * 10) && int(p.weapon, 0, 22) && int(p.ammo, 0, 3) && int(p.respawnAt, 0, ROUND_TICKS3 + RESPAWN_TICKS) && int(p.teleportUntil, 0, ROUND_TICKS3 + HZ4) && int(p.points, 0, 255) && int(p.kills, 0, 1e3) && int(p.deaths, 0, 1e3) && int(p.killedBy, 0, 4) && int(p.vehicle, 0, 14) && int(p.vehicleUntil, 0, ROUND_TICKS3 + HZ4 * 15) && typeof p.kick === "boolean" && typeof p.shield === "boolean")) return false;
    if (s.winner !== null && !s.players.some((p) => p.seat === s.winner)) return false;
    for (const [key, max] of [["board", 2], ["tiles", 59], ["items", 22], ["flames", ROUND_TICKS3 + 16], ["owners", 4], ["colors", 4]]) if (!Array.isArray(s[key]) || s[key].length !== 255 || !s[key].every((v) => int(v, 0, max))) return false;
    if (!Array.isArray(s.ack) || s.ack.length !== 4 || !s.ack.every((n) => int(n, 0, 1e9)) || !Array.isArray(s.scores) || s.scores.length !== 4 || !s.scores.every((n) => int(n, 0, 1e3))) return false;
    const owns = (owner) => s.players.some((p) => p.seat === owner);
    if (!Array.isArray(s.bombs) || s.bombs.length > 36 || !s.bombs.every((b) => b && int(b.id, 1, s.nextId - 1) && owns(b.owner) && int(b.x, 0, 16) && int(b.y, 0, 14) && int(b.range, 1, 10) && ["normal", "remote", "mine", "thrown"].includes(b.kind) && int(b.slide, -1, 3) && int(b.explodeAt, 0, ROUND_TICKS3 + FUSE) && int(b.armedAt, 0, ROUND_TICKS3 + 20))) return false;
    if (!Array.isArray(s.shots) || s.shots.length > 64 || !s.shots.every((b) => b && int(b.id, 1, s.nextId - 1) && owns(b.owner) && Number.isFinite(b.x) && b.x >= 0 && b.x <= 17 && Number.isFinite(b.y) && b.y >= 0 && b.y <= 15 && Number.isFinite(b.vx) && Math.abs(b.vx) <= 1 && Number.isFinite(b.vy) && Math.abs(b.vy) <= 1 && [16, 19].includes(b.kind) && int(b.until, 0, ROUND_TICKS3 + HZ4 * 4))) return false;
    if (!s.players.every((p) => int(p.actionLock, 0, 25) && Array.isArray(p.weaponStock) && p.weaponStock.length <= 32 && p.weaponStock.every((kind) => Object.prototype.hasOwnProperty.call(WEAPON_USES, kind)) && (p.attack === null || p.attack && [15, 16, 19, 20, 21].includes(p.attack.kind) && int(p.attack.dir, 0, 3) && int(p.attack.x, 0, 16) && int(p.attack.y, 0, 14) && int(p.attack.born, 0, s.tick) && int(p.attack.at, p.attack.born, ROUND_TICKS3 + 25)))) return false;
    if (!Array.isArray(s.effects) || s.effects.length > 64 || !s.effects.every((e) => e && int(e.id, 1, s.nextId - 1) && owns(e.owner) && [20, 21].includes(e.kind) && int(e.x, 0, 16) && int(e.y, 0, 14) && int(e.dir, 0, 3) && int(e.born, 0, s.tick) && int(e.until, e.born, ROUND_TICKS3 + 25) && Array.isArray(e.cells) && e.cells.length <= 17 && e.cells.every((cell) => int(cell, 0, 254)))) return false;
    if (typeof s.tram !== "number" || !Number.isFinite(s.tram) || s.tram < 0 || s.tram > 100) return false;
    const map = MAPS.find((m) => m.id === s.mapId);
    return Array.isArray(s.hazards) && s.hazards.length === map.hazards.length && s.hazards.every((h, i) => JSON.stringify(h) === JSON.stringify(map.hazards[i]));
  }
  var images = /* @__PURE__ */ new Map();
  function asset2(name) {
    let img2 = images.get(name);
    if (!img2) {
      img2 = new Image();
      img2.src = "/expanded/assets/bomb2/" + name + ".png";
      images.set(name, img2);
    }
    return img2;
  }
  function draw(ctx, name, x, y, w, h) {
    const img2 = asset2(name);
    if (img2.complete && img2.naturalWidth) {
      ctx.drawImage(img2, x, y, w, h);
      return true;
    }
    return false;
  }
  function timeline(ctx, name, frame, x, y, feet = false) {
    const meta = KILL_ART[name], img2 = asset2("kill-" + name);
    if (!meta || !img2.complete || !img2.naturalWidth) return false;
    const n = Math.max(0, Math.min(meta.frames - 1, Math.floor(frame)));
    ctx.drawImage(img2, n * meta.w, 0, meta.w, meta.h, x + (feet ? -meta.w / 2 : meta.x), y + (feet ? -meta.feet : meta.y), meta.w, meta.h);
    return true;
  }
  function render2(canvas, s, seat) {
    localSeat = seat;
    const ctx = canvas.getContext("2d");
    const cell = 30, left = 45, top = 66;
    ctx.clearRect(0, 0, BOMB2_CANVAS_WIDTH, 550);
    ctx.fillStyle = "#302f46";
    ctx.fillRect(0, 0, BOMB2_CANVAS_WIDTH, 550);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 21px system-ui";
    ctx.fillText("\u6CE1\u6CE1\u5802 2", 24, 32);
    if (!s) return;
    ctx.font = "15px system-ui";
    ctx.fillText(`${THEMES[s.theme]} \xB7 ${["\u751F\u5B58", "\u51FB\u6740 10", "\u91D1\u5E01 10", "\u5360\u5730 50"][MODES.indexOf(s.mode)]}`, 180, 31);
    ctx.fillText(`${Math.max(0, Math.ceil((ROUND_TICKS3 - s.tick) / HZ4))} \u79D2`, 500, 31);
    draw(ctx, "background-" + s.theme, left, top, WIDTH3 * cell, HEIGHT3 * cell);
    for (const burst of s.crateBursts) {
      const im = asset2("brick-burst");
      if (im.complete && im.naturalWidth) {
        const frame = Math.min(bomb2_brick_default.frames - 1, s.tick - burst.born);
        ctx.drawImage(im, frame * bomb2_brick_default.w, 0, bomb2_brick_default.w, bomb2_brick_default.h, left + (burst.cell % WIDTH3 + 0.5) * cell - bomb2_brick_default.w / 2, top + (Math.floor(burst.cell / WIDTH3) + 1) * cell - bomb2_brick_default.h, bomb2_brick_default.w, bomb2_brick_default.h);
      }
    }
    for (const h of s.hazards) {
      const px = left + h.x * cell, py = top + h.y * cell;
      if (h.kind === "QuickSand") draw(ctx, `quicksand-${h.dir}-1`, px, py, cell, cell);
      else if (h.kind === "Transmittal") draw(ctx, "conveyor-" + h.dir, px, py, cell, cell);
      else if (h.kind === "Rail") draw(ctx, "rail-" + h.dir, px, py, cell, cell);
      else if (h.kind === "SpringBoard") draw(ctx, "brick-40", px, py, cell, cell);
      else if (h.kind === "IceFace") draw(ctx, "brick-30", px, py, cell, cell);
      else if (h.kind === "TurnTable") draw(ctx, "turntable-1", px - 13, py - 17, 90, 90);
    }
    for (let y = 0; y < HEIGHT3; y++) for (let x = 0; x < WIDTH3; x++) {
      const i = index2(x, y), px = left + x * cell, py = top + y * cell;
      if (s.colors[i]) {
        ctx.fillStyle = territoryColor(s, s.colors[i]);
        ctx.fillRect(px, py, cell, cell);
      }
      if (s.board[i] && s.tiles[i]) {
        const b = BRICKS[s.tiles[i]];
        if (b?.w) draw(ctx, "brick-" + s.tiles[i], px + b.x, py + b.y, b.w, b.h);
      }
      if (s.items[i]) draw(ctx, "prop-" + s.items[i], px + 3, py + 3, cell - 6, cell - 6);
      if (s.flames[i] > s.tick) {
        ctx.fillStyle = "#ffba38bf";
        ctx.fillRect(px + 2, py + 2, cell - 4, cell - 4);
        draw(ctx, "blast-" + (s.tick % 9 + 1), px, py, cell, cell);
      }
    }
    for (const b of s.bombs) {
      draw(ctx, "bomb-" + (s.tick % 4 + 1), left + b.x * cell + 2, top + b.y * cell + 2, cell - 4, cell - 4);
      if (b.kind !== "normal") {
        ctx.fillStyle = b.kind === "remote" ? "#2ea5ff" : "#ed5d55";
        ctx.fillRect(left + b.x * cell + 10, top + b.y * cell + 10, 8, 8);
      }
    }
    for (const effect2 of s.effects) {
      ctx.fillStyle = effect2.kind === 20 ? "#ff4aaa" : "#ff9c27cc";
      if (effect2.kind === 21) {
        ctx.save();
        ctx.beginPath();
        for (const i of effect2.cells) ctx.rect(left + i % WIDTH3 * cell, top + Math.floor(i / WIDTH3) * cell, cell, cell);
        ctx.clip();
        ctx.translate(left + (effect2.x + 0.5) * cell, top + (effect2.y + 0.5) * cell);
        ctx.rotate([Math.PI, -Math.PI / 2, 0, Math.PI / 2][effect2.dir]);
        const meta = KILL_ART.fire, img2 = asset2("kill-fire");
        if (img2.complete && img2.naturalWidth) ctx.drawImage(img2, Math.min(meta.frames - 1, s.tick - effect2.born) * meta.w, 0, meta.w, meta.h, cell / 2, -meta.h / 2, meta.w, meta.h);
        ctx.restore();
      }
      for (const i of effect2.cells) {
        const x = left + i % WIDTH3 * cell, y = top + Math.floor(i / WIDTH3) * cell;
        if (effect2.kind === 20) {
          const [dx] = DIRS[effect2.dir];
          ctx.fillRect(x + (dx ? 0 : 12), y + (dx ? 12 : 0), dx ? cell : 6, dx ? 6 : cell);
        } else if (!asset2("kill-fire").naturalWidth) {
          ctx.fillRect(x + 3, y + 4, cell - 6, cell - 8);
        }
      }
    }
    for (const shot2 of s.shots) {
      ctx.fillStyle = shot2.kind === 20 ? "#ff4aaa" : "#ffe44e";
      ctx.beginPath();
      ctx.arc(left + shot2.x * cell, top + shot2.y * cell, shot2.kind === 20 ? 3 : 5, 0, Math.PI * 2);
      ctx.fill();
    }
    const rails = s.hazards.filter((h) => h.kind === "Rail");
    if (rails.length) {
      const pos = Math.floor(s.tram), part = s.tram - pos, start2 = rails[pos % rails.length], end = rails[(pos + 1) % rails.length];
      draw(ctx, "tramcar-1", left + (start2.x + (end.x - start2.x) * part) * cell, top + (start2.y + (end.y - start2.y) * part) * cell - 10, cell, cell + 10);
    }
    for (const p of [...s.players].sort((a, b) => a.y - b.y)) {
      if (!p.alive || p.respawnAt > s.tick) {
        if (p.deaths > 0 && s.tick - p.diedAt < RESPAWN_TICKS) timeline(ctx, "dead-" + (p.character - 1), s.tick - p.diedAt, left + (p.x + 0.5) * cell, top + (p.y + 1) * cell, true);
        continue;
      }
      const delta = p.moveDir < 0 ? [0, 0] : DIRS[p.moveDir], x = left + (p.x + 0.5 + delta[0] * p.progress / p.moveTicks) * cell, y = top + (p.y + 1 + delta[1] * p.progress / p.moveTicks) * cell;
      const img2 = asset2(`hero-${p.character - 1}-${["left", "up", "right", "down"][p.dir]}`), frames = 24, width = img2.naturalWidth / frames;
      ctx.globalAlpha = p.invulnerable > 0 && s.tick % 6 < 3 ? 0.5 : 1;
      if (p.vehicle === 12 || p.vehicle === 13 || p.vehicle === 14) {
        draw(ctx, `vehicle-${p.character - 1}-${p.vehicle === 12 ? "bulldozer" : p.vehicle === 13 ? "car" : "frog"}-${["left", "up", "right", "down"][p.dir]}`, x - 20, y - 42, 40, 42);
      } else if (img2.complete && img2.naturalWidth) {
        const h = 37, w = width / img2.naturalHeight * h;
        ctx.drawImage(img2, (p.moveDir < 0 ? 0 : Math.floor(s.tick / 2) % frames) * width, 0, width, img2.naturalHeight, x - w / 2, y - h, w, h);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.seat === seat ? "#fff" : "#353352";
      ctx.lineWidth = 2;
      if (p.shield || p.seat === seat) {
        ctx.beginPath();
        ctx.ellipse(x, y - 13, 17, 23, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const equipped = bomb2Weapon(s, p);
      if (equipped) weaponBadge(ctx, equipped, x, y - 43, 15);
      if (p.attack) {
        const names = { 15: "hammer", 16: "launcher", 19: "shotgun", 20: "laser-ready" };
        const name = names[p.attack.kind];
        if (name) {
          const [dx, dy] = DIRS[p.attack.dir];
          timeline(ctx, name + (p.attack.kind === 20 ? "" : "-" + ["left", "up", "right", "down"][p.attack.dir]), s.tick - p.attack.born, x + dx * 10, y - 17 + dy * 10);
        }
      }
    }
    drawPlayerStatus(ctx, bomb2Status(s), 600, top, BOMB2_CANVAS_WIDTH - 600, 450, seat);
    if (s.phase !== "playing") {
      ctx.fillStyle = "#17162fd9";
      ctx.fillRect(45, 180, 510, 170);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "bold 30px system-ui";
      ctx.fillText(s.phase === "waiting" ? "\u51C6\u5907\u5F00\u5C40" : s.winner === null ? "\u5E73\u5C40" : `P${s.winner} \u83B7\u80DC`, 300, 255);
      ctx.font = "16px system-ui";
      ctx.fillText(s.phase === "waiting" ? "\u81F3\u5C11\u4E24\u4EBA\u5165\u5EA7\u5E76\u51C6\u5907" : s.mode === "kill" ? s.players.map((p) => `P${p.seat} ${p.points}\u5206`).join("  ") : "\u672C\u5C40\u7ED3\u675F\uFF0C\u51C6\u5907\u4E0B\u4E00\u5C40", 300, 292);
      ctx.textAlign = "left";
    }
  }
  var adapter2 = {
    id: "9109-server",
    title: "Q\u7248\u6CE1\u6CE1\u58022",
    seats: 4,
    hz: HZ4,
    width: BOMB2_CANVAS_WIDTH,
    height: 550,
    create: create2,
    step: step2,
    valid: valid2,
    render: render2,
    characters: ["\u89D2\u8272 1", "\u89D2\u8272 2", "\u89D2\u8272 3", "\u89D2\u8272 4"],
    difficulties: [{ id: "easy", label: "\u7B80\u5355" }, { id: "normal", label: "\u666E\u901A" }, { id: "hard", label: "\u56F0\u96BE" }],
    confirm: (s) => audio.confirm(s, localSeat, s.winner),
    setSound: (value) => audio.setSound(value),
    setVolume: (value) => audio.setVolume(value),
    controls: "\u65B9\u5411\u952E / WASD \u79FB\u52A8\uFF1B\u7A7A\u683C\u4F7F\u7528\u6301\u6709\u6B66\u5668\uFF0C\u65E0\u6B66\u5668\u65F6\u653E\u70B8\u5F39\uFF1BJ / Shift \u4E5F\u53EF\u4F7F\u7528\u6B66\u5668\u6216\u5F15\u7206\u9065\u63A7\u5F39\u3002",
    maps: MAPS.map((m) => ({ id: m.id, label: `${THEMES[m.theme]} ${["one", "two", "three"].indexOf(m.id.split("-")[1]) + 1}` })),
    modes: [
      { id: "arcade", label: "\u751F\u5B58", description: "\u521D\u59CB 3 \u6761\u547D\uFF0C\u6700\u540E\u5B58\u6D3B\u8005\u83B7\u80DC\u3002" },
      { id: "kill", label: "\u51FB\u6740", description: "\u5148\u5F97 10 \u5206\u83B7\u80DC\uFF0C\u81EA\u6740\u6263 1 \u5206\uFF1B\u65E0\u9650\u590D\u6D3B\uFF0C\u57FA\u7840\u9524\u5B50\u53EF\u53CD\u590D\u4F7F\u7528\u3002" },
      { id: "collect", label: "\u91D1\u5E01", description: "\u5148\u6536\u96C6 10 \u679A\u91D1\u5E01\u83B7\u80DC\uFF0C\u6B7B\u4EA1\u6389\u843D\u4E00\u534A\u91D1\u5E01\u540E\u590D\u6D3B\u3002" },
      { id: "color", label: "\u5360\u5730", description: "\u8D70\u8FC7\u683C\u5B50\u5360\u5730\uFF0C\u53EF\u8986\u76D6\u5BF9\u624B\u989C\u8272\uFF0C\u5148\u5360 50 \u683C\u83B7\u80DC\uFF1B\u6B7B\u4EA1\u5931\u53BB\u5DF2\u5360\u9886\u7684\u683C\u5B50\u3002" }
    ],
    consumeInput(s, seat, input) {
      const p = s.players.find((p2) => p2.seat === seat);
      if (p) {
        p.lastAttack = Math.max(p.lastAttack, input.attack);
        p.lastAlt = Math.max(p.lastAlt, input.alt);
      }
    }
  };

  // src/expanded/boxhead-data.json
  var boxhead_data_default = { sourceSha256: "9ecf3b4e6f8b7b1f05f536aa8577e63ba650607b464f15db138fa28e5201fe90", maps: [{ id: "original-01", label: "01 \xB7 BOXY", symbol: 99, width: 704, height: 544, columns: 22, rows: 17, collision: ["1111111111111111111111", "1111111111001111111111", "1111111111001111111111", "1000000000000000000001", "1000000000000000000001", "1000000000000000000001", "1000000000000000000001", "1000000000000000000001", "1000000000000000000001", "1000000000000000000001", "1000000000000000000001", "1000000000000000000001", "1000000000000000000001", "1000000000000000000001", "1000000000000000000001", "1000000000000000000001", "1111111111111111111111"], playerSpawns: [{ x: 272, y: 272, dir: 0 }], otherSpawns: [{ x: 432, y: 272, dir: 3.14159 }, { x: 624, y: 144, dir: 3.14159 }, { x: 592, y: 432, dir: 3.14159 }, { x: 80, y: 144, dir: 0 }, { x: 80, y: 432, dir: 0 }, { x: 336, y: 432, dir: -1.5708 }, { x: 368, y: 144, dir: 1.5708 }], zombieSpawns: [{ x: 336, y: 528, dir: 0 }, { x: 368, y: 528, dir: 0 }, { x: 336, y: 16, dir: 0 }, { x: 368, y: 16, dir: 0 }], devilSpawns: [{ x: 16, y: 272, dir: 0 }, { x: 688, y: 272, dir: 0 }, { x: 368, y: 528, dir: 0 }, { x: 336, y: 16, dir: 0 }], barrels: [{ x: 304, y: 112, dir: 0 }, { x: 400, y: 112, dir: 0 }, { x: 304, y: 464, dir: 0 }, { x: 400, y: 464, dir: 0 }, { x: 400, y: 432, dir: 0 }, { x: 304, y: 432, dir: 0 }, { x: 304, y: 400, dir: 0 }, { x: 400, y: 400, dir: 0 }, { x: 304, y: 144, dir: 0 }, { x: 400, y: 144, dir: 0 }, { x: 400, y: 176, dir: 0 }, { x: 304, y: 176, dir: 0 }], pickups: [{ x: 336, y: 80, dir: 0 }, { x: 368, y: 496, dir: 0 }], walls: [] }, { id: "original-02", label: "02 \xB7 BUTTONS", symbol: 104, width: 800, height: 672, columns: 25, rows: 21, collision: ["1111111111111111111111111", "1111000111100011110001111", "1111000111100011110001111", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1111000111100011110001111", "1111000111100011110001111", "1111000111100011110001111", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1111000111100011110001111", "1111000111100011110001111", "1111000111100011110001111", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1111000111100011110001111", "1111000111100011110001111", "1111111111111111111111111"], playerSpawns: [{ x: 176, y: 144, dir: 0.7854 }, { x: 400, y: 336, dir: 0 }], otherSpawns: [{ x: 176, y: 336, dir: 0 }, { x: 624, y: 336, dir: 3.14159 }, { x: 400, y: 528, dir: -1.5708 }, { x: 400, y: 144, dir: 1.5708 }, { x: 176, y: 528, dir: -0.7854 }, { x: 624, y: 144, dir: 2.35619 }, { x: 624, y: 528, dir: -2.35619 }], zombieSpawns: [{ x: 16, y: 144, dir: 0 }, { x: 16, y: 176, dir: 0 }, { x: 16, y: 112, dir: 0 }, { x: 16, y: 368, dir: 0 }, { x: 16, y: 304, dir: 0 }, { x: 16, y: 528, dir: 0 }, { x: 16, y: 560, dir: 0 }, { x: 16, y: 496, dir: 0 }, { x: 784, y: 144, dir: 0 }, { x: 784, y: 176, dir: 0 }, { x: 784, y: 112, dir: 0 }, { x: 784, y: 368, dir: 0 }, { x: 784, y: 304, dir: 0 }, { x: 784, y: 528, dir: 0 }, { x: 784, y: 560, dir: 0 }, { x: 784, y: 496, dir: 0 }, { x: 144, y: 16, dir: 0 }, { x: 176, y: 16, dir: 0 }, { x: 208, y: 16, dir: 0 }, { x: 368, y: 16, dir: 0 }, { x: 432, y: 16, dir: 0 }, { x: 592, y: 16, dir: 0 }, { x: 624, y: 16, dir: 0 }, { x: 656, y: 16, dir: 0 }, { x: 144, y: 656, dir: 0 }, { x: 176, y: 656, dir: 0 }, { x: 208, y: 656, dir: 0 }, { x: 368, y: 656, dir: 0 }, { x: 432, y: 656, dir: 0 }, { x: 592, y: 656, dir: 0 }, { x: 624, y: 656, dir: 0 }, { x: 656, y: 656, dir: 0 }], devilSpawns: [{ x: 16, y: 336, dir: 0 }, { x: 784, y: 336, dir: 0 }, { x: 400, y: 16, dir: 0 }, { x: 400, y: 656, dir: 0 }], barrels: [{ x: 80, y: 336, dir: 0 }, { x: 80, y: 144, dir: 0 }, { x: 176, y: 80, dir: 0 }, { x: 400, y: 80, dir: 0 }, { x: 624, y: 80, dir: 0 }, { x: 720, y: 144, dir: 0 }, { x: 624, y: 592, dir: 0 }, { x: 720, y: 528, dir: 0 }, { x: 720, y: 336, dir: 0 }, { x: 400, y: 592, dir: 0 }, { x: 176, y: 592, dir: 0 }, { x: 80, y: 528, dir: 0 }], pickups: [{ x: 144, y: 112, dir: 0 }, { x: 656, y: 112, dir: 0 }, { x: 656, y: 560, dir: 0 }, { x: 144, y: 560, dir: 0 }], walls: [] }, { id: "original-03", label: "03 \xB7 MAZEY", symbol: 113, width: 1088, height: 1216, columns: 34, rows: 38, collision: ["1111111111111111111111111111111111", "1100000011111111111111111111111111", "1100000011000000110000000000000011", "1100000011000000110000000000000011", "1100000011000000110000000000000011", "1100000011000000110000000000000011", "1100000011000000110000001100000011", "1100000011000000110000001100000011", "1100000011000000000000001100000011", "1100000011000000000000001100000011", "1100000011000000000000001100000011", "1100000011000000000000001100000011", "1100000011000000110000001100000011", "1100000011000000110000001100000011", "1100000000000000110000001100000011", "1100000000000000110000001100000011", "1100000000000000110000001100000011", "1100000000000000110000001100000011", "1111111111111111111111111100000011", "1111111111111111111111111100000011", "1000000000000000110000000000000011", "1000000000000000110000000000000011", "1000000000000000110000000000000011", "1000000000000000110000000000000011", "1111111111000000110000001111111111", "1111111111000000110000001111111111", "1100000000000000110000000000000011", "1100000000000000110000000000000011", "1100000000000000110000000000000011", "1100000000000000110000000000000011", "1100000011111111110000001100000011", "1100000011111111110000001100000011", "1100000000000000000000001100000011", "1100000000000000000000001100000011", "1100000000000000000000001100000011", "1100000000000000000000001100000011", "1111111111111111111111111100000011", "1111111111111111111111111111111111"], playerSpawns: [{ x: 400, y: 688, dir: 0 }], otherSpawns: [{ x: 688, y: 688, dir: 0 }, { x: 944, y: 592, dir: 0 }, { x: 688, y: 400, dir: 0 }, { x: 688, y: 144, dir: 0 }, { x: 944, y: 304, dir: 0 }, { x: 400, y: 208, dir: 0 }, { x: 144, y: 496, dir: 0 }, { x: 144, y: 272, dir: 0 }, { x: 432, y: 432, dir: 0 }, { x: 656, y: 976, dir: 0 }, { x: 944, y: 944, dir: 0 }, { x: 144, y: 1040, dir: 0 }, { x: 368, y: 880, dir: 0 }], zombieSpawns: [{ x: 16, y: 752, dir: 0 }, { x: 16, y: 688, dir: 0 }, { x: 16, y: 720, dir: 0 }, { x: 16, y: 656, dir: 0 }, { x: 80, y: 16, dir: 0 }, { x: 112, y: 16, dir: 0 }, { x: 144, y: 16, dir: 0 }, { x: 176, y: 16, dir: 0 }, { x: 208, y: 16, dir: 0 }, { x: 240, y: 16, dir: 0 }, { x: 848, y: 1200, dir: 0 }, { x: 880, y: 1200, dir: 0 }, { x: 912, y: 1200, dir: 0 }, { x: 944, y: 1200, dir: 0 }, { x: 976, y: 1200, dir: 0 }, { x: 1008, y: 1200, dir: 0 }], devilSpawns: [{ x: 144, y: 16, dir: 0 }, { x: 912, y: 1200, dir: 0 }, { x: 16, y: 688, dir: 0 }], barrels: [{ x: 208, y: 144, dir: 0 }, { x: 112, y: 144, dir: 0 }, { x: 880, y: 1072, dir: 0 }, { x: 976, y: 1072, dir: 0 }, { x: 112, y: 656, dir: 0 }, { x: 112, y: 720, dir: 0 }], pickups: [{ x: 656, y: 496, dir: 0 }, { x: 208, y: 112, dir: 0 }, { x: 112, y: 112, dir: 0 }, { x: 112, y: 688, dir: 0 }, { x: 976, y: 1104, dir: 0 }, { x: 880, y: 1104, dir: 0 }, { x: 432, y: 1072, dir: 0 }], walls: [{ x: 848, y: 1168, dir: 0 }, { x: 880, y: 1168, dir: 0 }, { x: 912, y: 1168, dir: 0 }, { x: 944, y: 1168, dir: 0 }, { x: 976, y: 1168, dir: 0 }, { x: 1008, y: 1168, dir: 0 }, { x: 80, y: 48, dir: 0 }, { x: 112, y: 48, dir: 0 }, { x: 144, y: 48, dir: 0 }, { x: 176, y: 48, dir: 0 }, { x: 208, y: 48, dir: 0 }, { x: 240, y: 48, dir: 0 }] }, { id: "original-04", label: "04 \xB7 GLADIATOR", symbol: 143, width: 800, height: 800, columns: 25, rows: 25, collision: ["1111111111111111111111111", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1000000001100011000000001", "1000000001100011000000001", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1000000001100011000000001", "1000000001100011000000001", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1000000000000000000000001", "1111111111111111111111111"], playerSpawns: [{ x: 400, y: 400, dir: 0 }], otherSpawns: [{ x: 176, y: 400, dir: 3.14159 }, { x: 176, y: 176, dir: -2.35619 }, { x: 400, y: 176, dir: -1.5708 }, { x: 624, y: 176, dir: 2.35619 }, { x: 624, y: 624, dir: 0.7854 }, { x: 176, y: 624, dir: 2.35619 }, { x: 400, y: 624, dir: 1.5708 }, { x: 624, y: 400, dir: 0 }], zombieSpawns: [{ x: 16, y: 80, dir: 0 }, { x: 16, y: 144, dir: 0 }, { x: 16, y: 208, dir: 0 }, { x: 16, y: 272, dir: 0 }, { x: 16, y: 336, dir: 0 }, { x: 16, y: 400, dir: 0 }, { x: 16, y: 464, dir: 0 }, { x: 16, y: 528, dir: 0 }, { x: 16, y: 592, dir: 0 }, { x: 16, y: 656, dir: 0 }, { x: 16, y: 720, dir: 0 }, { x: 784, y: 80, dir: 0 }, { x: 784, y: 144, dir: 0 }, { x: 784, y: 208, dir: 0 }, { x: 784, y: 272, dir: 0 }, { x: 784, y: 336, dir: 0 }, { x: 784, y: 400, dir: 0 }, { x: 784, y: 464, dir: 0 }, { x: 784, y: 528, dir: 0 }, { x: 784, y: 592, dir: 0 }, { x: 784, y: 656, dir: 0 }, { x: 784, y: 720, dir: 0 }, { x: 80, y: 16, dir: 0 }, { x: 144, y: 16, dir: 0 }, { x: 208, y: 16, dir: 0 }, { x: 272, y: 16, dir: 0 }, { x: 336, y: 16, dir: 0 }, { x: 400, y: 16, dir: 0 }, { x: 464, y: 16, dir: 0 }, { x: 528, y: 16, dir: 0 }, { x: 592, y: 16, dir: 0 }, { x: 656, y: 16, dir: 0 }, { x: 720, y: 16, dir: 0 }, { x: 80, y: 784, dir: 0 }, { x: 144, y: 784, dir: 0 }, { x: 208, y: 784, dir: 0 }, { x: 272, y: 784, dir: 0 }, { x: 336, y: 784, dir: 0 }, { x: 400, y: 784, dir: 0 }, { x: 464, y: 784, dir: 0 }, { x: 528, y: 784, dir: 0 }, { x: 592, y: 784, dir: 0 }, { x: 656, y: 784, dir: 0 }, { x: 720, y: 784, dir: 0 }], devilSpawns: [{ x: 16, y: 400, dir: 0 }, { x: 784, y: 400, dir: 0 }, { x: 400, y: 784, dir: 0 }, { x: 400, y: 16, dir: 0 }], barrels: [{ x: 144, y: 112, dir: 0 }, { x: 112, y: 144, dir: 0 }, { x: 272, y: 112, dir: 0 }, { x: 400, y: 112, dir: 0 }, { x: 528, y: 112, dir: 0 }, { x: 656, y: 112, dir: 0 }, { x: 144, y: 688, dir: 0 }, { x: 272, y: 688, dir: 0 }, { x: 400, y: 688, dir: 0 }, { x: 528, y: 688, dir: 0 }, { x: 656, y: 688, dir: 0 }, { x: 112, y: 272, dir: 0 }, { x: 112, y: 400, dir: 0 }, { x: 112, y: 528, dir: 0 }, { x: 112, y: 656, dir: 0 }, { x: 688, y: 144, dir: 0 }, { x: 688, y: 272, dir: 0 }, { x: 688, y: 400, dir: 0 }, { x: 688, y: 528, dir: 0 }, { x: 688, y: 656, dir: 0 }], pickups: [{ x: 144, y: 400, dir: 0 }, { x: 400, y: 656, dir: 0 }, { x: 656, y: 400, dir: 0 }, { x: 400, y: 144, dir: 0 }], walls: [{ x: 368, y: 304, dir: 0 }, { x: 400, y: 304, dir: 0 }, { x: 432, y: 304, dir: 0 }, { x: 368, y: 496, dir: 0 }, { x: 400, y: 496, dir: 0 }, { x: 432, y: 496, dir: 0 }] }, { id: "original-05", label: "05 \xB7 STRIP", symbol: 145, width: 1472, height: 544, columns: 46, rows: 17, collision: ["1111111111111111111111111111111111111111111111", "1000000000000001100000000000011000001100000001", "1000000000000001100000000000011000001100000001", "1000000000000000000000110000000000001100000001", "1000000011000000000000110000000000001100000001", "1000000011000000000000110000000000000000000001", "1000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000001", "1000000000000001100000000000011000001100000001", "1000000000000001100000000000011000001100000001", "1000000011000000000000000000000000000000000001", "1000000011000000000000110000000000000000000001", "1000000011000000000000110000000000000000000001", "1000000000000000000000000000000000001100000001", "1000000000000000000000000000000000001100000001", "1000000000000001100000000000011000001100000001", "1111111111111111111111111111111111111111111111"], playerSpawns: [{ x: 208, y: 272, dir: 3.14159 }], otherSpawns: [{ x: 1360, y: 144, dir: 3.14159 }, { x: 1360, y: 368, dir: 3.14159 }, { x: 1104, y: 144, dir: 3.14159 }, { x: 1104, y: 368, dir: 3.14159 }, { x: 848, y: 144, dir: 3.14159 }, { x: 848, y: 368, dir: 3.14159 }, { x: 624, y: 144, dir: 3.14159 }, { x: 624, y: 368, dir: 3.14159 }, { x: 400, y: 144, dir: 3.14159 }, { x: 400, y: 368, dir: 3.14159 }], zombieSpawns: [{ x: 16, y: 336, dir: 0 }, { x: 16, y: 368, dir: 0 }, { x: 16, y: 304, dir: 0 }, { x: 16, y: 240, dir: 0 }, { x: 16, y: 176, dir: 0 }, { x: 16, y: 208, dir: 0 }, { x: 16, y: 112, dir: 0 }, { x: 16, y: 80, dir: 0 }, { x: 16, y: 464, dir: 0 }, { x: 16, y: 432, dir: 0 }], devilSpawns: [{ x: 16, y: 272, dir: 0 }, { x: 16, y: 144, dir: 0 }, { x: 16, y: 400, dir: 0 }], barrels: [{ x: 112, y: 208, dir: 0 }, { x: 112, y: 336, dir: 0 }], pickups: [{ x: 112, y: 368, dir: 0 }, { x: 112, y: 176, dir: 0 }, { x: 1328, y: 112, dir: 0 }, { x: 1328, y: 400, dir: 0 }], walls: [{ x: 144, y: 144, dir: 0 }, { x: 144, y: 176, dir: 0 }, { x: 144, y: 208, dir: 0 }, { x: 144, y: 336, dir: 0 }, { x: 144, y: 368, dir: 0 }, { x: 144, y: 400, dir: 0 }] }, { id: "original-06", label: "06 \xB7 TIGHT", symbol: 150, width: 704, height: 1312, columns: 22, rows: 41, collision: ["1111111111111111111111", "1111000000000000000011", "1000000000000000000011", "1111100000000000000111", "1111100000000000000111", "1111100000000000000111", "1110111100000000011111", "1110111100000000011111", "1110111100000000011111", "1011110000000011110111", "1011110000000011110111", "1011110000000011110111", "1000111100000001111001", "1000111100000001111001", "1000111100000001111001", "1000000000000111100001", "1000001111000111100001", "1000001111000111100001", "1000001111000011110111", "1000000111100011110111", "1000000111100011110111", "1100000111100000000001", "1100011110000000000001", "1000011110000000111101", "1000011110000000111101", "1000001111000000111101", "1000001111000111101111", "1000001111000111101111", "1001111000000111101111", "1001111000000001111011", "1001111000000001111011", "1000011110000001111011", "1000011110000000011111", "1000011110000000011111", "1101111000000000011111", "1101111000000000000111", "1101111000000000000111", "1000000000000000000111", "1000000000000000000001", "1110000000000000001111", "1111111111111111111111"], playerSpawns: [{ x: 368, y: 208, dir: -1.5708 }], otherSpawns: [{ x: 368, y: 528, dir: -1.5708 }, { x: 656, y: 496, dir: 1.5708 }, { x: 112, y: 592, dir: -1.5708 }, { x: 48, y: 976, dir: 1.5708 }, { x: 464, y: 752, dir: 1.5708 }, { x: 336, y: 1008, dir: 1.5708 }, { x: 496, y: 1136, dir: 1.5708 }, { x: 304, y: 368, dir: -1.5708 }, { x: 560, y: 112, dir: -1.5708 }], zombieSpawns: [{ x: 176, y: 16, dir: 0 }, { x: 240, y: 16, dir: 0 }, { x: 304, y: 16, dir: 0 }, { x: 368, y: 16, dir: 0 }, { x: 432, y: 16, dir: 0 }, { x: 496, y: 16, dir: 0 }, { x: 560, y: 16, dir: 0 }, { x: 144, y: 1296, dir: 0 }, { x: 208, y: 1296, dir: 0 }, { x: 272, y: 1296, dir: 0 }, { x: 336, y: 1296, dir: 0 }, { x: 400, y: 1296, dir: 0 }, { x: 464, y: 1296, dir: 0 }, { x: 528, y: 1296, dir: 0 }], devilSpawns: [{ x: 368, y: 16, dir: 0 }, { x: 336, y: 1296, dir: 0 }], barrels: [{ x: 240, y: 144, dir: 0 }, { x: 368, y: 144, dir: 0 }, { x: 464, y: 144, dir: 0 }, { x: 272, y: 1200, dir: 0 }, { x: 400, y: 1200, dir: 0 }, { x: 496, y: 1200, dir: 0 }], pickups: [{ x: 240, y: 304, dir: 0 }, { x: 80, y: 1104, dir: 0 }, { x: 656, y: 464, dir: 0 }, { x: 80, y: 528, dir: 0 }, { x: 144, y: 624, dir: 0 }], walls: [] }, { id: "original-07", label: "07 \xB7 COLUMNS", symbol: 151, width: 1056, height: 960, columns: 33, rows: 30, collision: ["111111111111111111111111111111111", "100110011001100110011001100110011", "100110011001100110011001100110011", "100000000000000000000000000000001", "100000000000000000000000000000001", "100000000000000000000000000000001", "100000000000110000000000000000001", "110000001100110011001100110000001", "110000001100110011001100110000001", "100000000000000000000000000000001", "100000000000000000000000000000001", "100110000000000000000001100000001", "100110011000000110011001100110011", "100110011000000110011001100110011", "100000000000000000000000000000001", "100000000000000000000000000000001", "100000000000000000000000000000001", "110011001100110011000000110011001", "110011001100110011000000110011001", "100000000000000000000000000000001", "100000000000000000000000000000001", "100000000001100000000000000000001", "100110000001100110011001100110011", "100110000001100110011001100110011", "100000000000000000000000000000001", "100000000000000000000000000000001", "100000000000000000000000000000001", "100000000000000000000000110000001", "110011001100110000001100110011001", "111111111111111111111111111111111"], playerSpawns: [{ x: 560, y: 784, dir: 1.5708 }], otherSpawns: [{ x: 656, y: 624, dir: 1.5708 }, { x: 304, y: 656, dir: 1.5708 }, { x: 208, y: 784, dir: 1.5708 }, { x: 368, y: 816, dir: 1.5708 }, { x: 752, y: 816, dir: 1.5708 }, { x: 848, y: 624, dir: 1.5708 }, { x: 368, y: 432, dir: 1.5708 }, { x: 80, y: 496, dir: 1.5708 }, { x: 144, y: 272, dir: 1.5708 }, { x: 240, y: 144, dir: 1.5708 }, { x: 464, y: 144, dir: 1.5708 }, { x: 720, y: 144, dir: 1.5708 }, { x: 944, y: 240, dir: 1.5708 }, { x: 848, y: 336, dir: 1.5708 }, { x: 592, y: 336, dir: 1.5708 }, { x: 1008, y: 496, dir: 1.5708 }, { x: 944, y: 816, dir: 1.5708 }, { x: 720, y: 464, dir: 1.5708 }, { x: 496, y: 496, dir: 1.5708 }], zombieSpawns: [{ x: 80, y: 944, dir: 0 }, { x: 112, y: 944, dir: 0 }, { x: 208, y: 944, dir: 0 }, { x: 240, y: 944, dir: 0 }, { x: 336, y: 944, dir: 0 }, { x: 368, y: 944, dir: 0 }, { x: 464, y: 944, dir: 0 }, { x: 496, y: 944, dir: 0 }, { x: 592, y: 944, dir: 0 }, { x: 624, y: 944, dir: 0 }, { x: 720, y: 944, dir: 0 }, { x: 752, y: 944, dir: 0 }, { x: 848, y: 944, dir: 0 }, { x: 880, y: 944, dir: 0 }, { x: 976, y: 944, dir: 0 }, { x: 1008, y: 944, dir: 0 }, { x: 528, y: 944, dir: 0 }, { x: 560, y: 944, dir: 0 }], devilSpawns: [{ x: 752, y: 944, dir: 0 }, { x: 976, y: 944, dir: 0 }, { x: 880, y: 944, dir: 0 }, { x: 336, y: 944, dir: 0 }, { x: 208, y: 944, dir: 0 }, { x: 80, y: 944, dir: 0 }], barrels: [{ x: 176, y: 720, dir: 0 }, { x: 432, y: 720, dir: 0 }, { x: 560, y: 720, dir: 0 }, { x: 688, y: 720, dir: 0 }, { x: 816, y: 720, dir: 0 }, { x: 944, y: 720, dir: 0 }, { x: 336, y: 272, dir: 0 }, { x: 464, y: 272, dir: 0 }, { x: 624, y: 272, dir: 0 }, { x: 752, y: 272, dir: 0 }, { x: 496, y: 848, dir: 0 }, { x: 592, y: 848, dir: 0 }], pickups: [{ x: 432, y: 848, dir: 0 }, { x: 784, y: 784, dir: 0 }, { x: 80, y: 720, dir: 0 }, { x: 752, y: 848, dir: 0 }, { x: 528, y: 144, dir: 0 }], walls: [{ x: 208, y: 912, dir: 0 }, { x: 240, y: 912, dir: 0 }, { x: 720, y: 912, dir: 0 }, { x: 752, y: 912, dir: 0 }, { x: 976, y: 912, dir: 0 }, { x: 1008, y: 912, dir: 0 }, { x: 336, y: 912, dir: 0 }, { x: 368, y: 912, dir: 0 }, { x: 848, y: 912, dir: 0 }, { x: 880, y: 912, dir: 0 }, { x: 80, y: 912, dir: 0 }, { x: 112, y: 912, dir: 0 }] }, { id: "original-08", label: "08 \xB7 CASTLE", symbol: 152, width: 960, height: 800, columns: 30, rows: 25, collision: ["111111111111111111111111111111", "111111111100110011001111111111", "110000000000000000000000000011", "110000000000000000000000000011", "110011111111110011111111110011", "110011111111110011111111110011", "110011000000000000000000110011", "110011000000000000000000110011", "100011000000000000000000110001", "100011000000000000000000110001", "110011000000000000000000110011", "110011000000011110000000110011", "100000000000011110000000000001", "100000000000011110000000000001", "110011000000000000000000110011", "110011000000000000000000110011", "100011000000000000000000110001", "100011000000000000000000110001", "110011000000000000000000110011", "110011000000000000000000110011", "110011111111110011111111110011", "110011111111110011111111110011", "110000000000000000000000000011", "110000000000000000000000000011", "111111111111111111111111111111"], playerSpawns: [{ x: 656, y: 368, dir: 0 }], otherSpawns: [{ x: 496, y: 528, dir: 1.5708 }, { x: 272, y: 560, dir: 1.5708 }, { x: 240, y: 240, dir: 1.5708 }, { x: 688, y: 240, dir: 1.5708 }, { x: 720, y: 560, dir: 1.5708 }, { x: 304, y: 400, dir: 1.5708 }, { x: 496, y: 240, dir: 1.5708 }, { x: 688, y: 80, dir: 1.5708 }, { x: 848, y: 272, dir: 1.5708 }, { x: 848, y: 592, dir: 1.5708 }, { x: 624, y: 720, dir: 1.5708 }, { x: 368, y: 720, dir: 1.5708 }, { x: 80, y: 624, dir: 1.5708 }, { x: 80, y: 176, dir: 1.5708 }, { x: 304, y: 80, dir: 1.5708 }], zombieSpawns: [{ x: 336, y: 16, dir: 0 }, { x: 368, y: 16, dir: 0 }, { x: 592, y: 16, dir: 0 }, { x: 624, y: 16, dir: 0 }, { x: 336, y: 784, dir: 0 }, { x: 368, y: 784, dir: 0 }, { x: 592, y: 784, dir: 0 }, { x: 624, y: 784, dir: 0 }, { x: 16, y: 272, dir: 0 }, { x: 16, y: 304, dir: 0 }, { x: 16, y: 528, dir: 0 }, { x: 16, y: 560, dir: 0 }, { x: 944, y: 272, dir: 0 }, { x: 944, y: 304, dir: 0 }, { x: 944, y: 528, dir: 0 }, { x: 944, y: 560, dir: 0 }, { x: 16, y: 400, dir: 0 }, { x: 944, y: 432, dir: 0 }, { x: 464, y: 16, dir: 0 }, { x: 496, y: 16, dir: 0 }, { x: 464, y: 784, dir: 0 }, { x: 496, y: 784, dir: 0 }, { x: 16, y: 432, dir: 0 }, { x: 944, y: 400, dir: 0 }], devilSpawns: [{ x: 464, y: 16, dir: 0 }, { x: 496, y: 16, dir: 0 }, { x: 464, y: 784, dir: 0 }, { x: 496, y: 784, dir: 0 }, { x: 16, y: 272, dir: 0 }, { x: 16, y: 432, dir: 0 }, { x: 944, y: 400, dir: 0 }, { x: 944, y: 272, dir: 0 }, { x: 944, y: 528, dir: 0 }, { x: 16, y: 560, dir: 0 }], barrels: [{ x: 432, y: 208, dir: 0 }, { x: 528, y: 208, dir: 0 }, { x: 432, y: 624, dir: 0 }, { x: 528, y: 624, dir: 0 }, { x: 208, y: 368, dir: 0 }, { x: 208, y: 464, dir: 0 }, { x: 752, y: 368, dir: 0 }, { x: 752, y: 464, dir: 0 }], pickups: [{ x: 80, y: 80, dir: 0 }, { x: 880, y: 80, dir: 0 }, { x: 848, y: 720, dir: 0 }, { x: 112, y: 720, dir: 0 }], walls: [{ x: 48, y: 272, dir: 0 }, { x: 48, y: 304, dir: 0 }, { x: 48, y: 400, dir: 0 }, { x: 48, y: 432, dir: 0 }, { x: 48, y: 528, dir: 0 }, { x: 48, y: 560, dir: 0 }, { x: 912, y: 272, dir: 0 }, { x: 912, y: 304, dir: 0 }, { x: 912, y: 400, dir: 0 }, { x: 912, y: 432, dir: 0 }, { x: 912, y: 528, dir: 0 }, { x: 912, y: 560, dir: 0 }] }, { id: "original-09", label: "09 \xB7 BIG BOXY", symbol: 114, width: 1312, height: 1056, columns: 41, rows: 33, collision: ["11111111111111111111111111111111111111111", "11111111111111111100000111111111111111111", "11111111111111111100000111111111111111111", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "10000000000000000000000000000000000000001", "11111111111111111111111111111111111111111"], playerSpawns: [{ x: 528, y: 560, dir: 0 }], otherSpawns: [{ x: 784, y: 560, dir: 3.14159 }, { x: 784, y: 304, dir: 3.14159 }, { x: 528, y: 816, dir: 0 }, { x: 272, y: 816, dir: 0 }, { x: 272, y: 560, dir: 0 }, { x: 272, y: 304, dir: 0 }, { x: 528, y: 304, dir: 0 }, { x: 784, y: 816, dir: 3.14159 }, { x: 1040, y: 816, dir: 3.14159 }, { x: 1040, y: 560, dir: 3.14159 }, { x: 1040, y: 304, dir: 3.14159 }, { x: 1264, y: 816, dir: 3.14159 }, { x: 1264, y: 560, dir: 3.14159 }, { x: 1264, y: 304, dir: 3.14159 }, { x: 80, y: 304, dir: 0 }, { x: 80, y: 560, dir: 0 }, { x: 80, y: 816, dir: 0 }, { x: 784, y: 144, dir: 3.14159 }, { x: 272, y: 144, dir: 0 }, { x: 528, y: 144, dir: 0 }, { x: 1040, y: 144, dir: 3.14159 }, { x: 1264, y: 144, dir: 3.14159 }, { x: 80, y: 144, dir: 0 }, { x: 784, y: 944, dir: 3.14159 }, { x: 272, y: 944, dir: 0 }, { x: 528, y: 944, dir: 0 }, { x: 1040, y: 944, dir: 3.14159 }, { x: 1264, y: 944, dir: 3.14159 }, { x: 80, y: 944, dir: 0 }], zombieSpawns: [{ x: 592, y: 16, dir: 0 }, { x: 624, y: 16, dir: 0 }, { x: 656, y: 16, dir: 0 }, { x: 688, y: 16, dir: 0 }, { x: 720, y: 16, dir: 0 }, { x: 592, y: 1040, dir: 0 }, { x: 624, y: 1040, dir: 0 }, { x: 656, y: 1040, dir: 0 }, { x: 688, y: 1040, dir: 0 }, { x: 720, y: 1040, dir: 0 }], devilSpawns: [{ x: 16, y: 528, dir: 0 }, { x: 1296, y: 528, dir: 0 }, { x: 624, y: 16, dir: 0 }, { x: 688, y: 16, dir: 0 }, { x: 624, y: 1040, dir: 0 }, { x: 688, y: 1040, dir: 0 }], barrels: [{ x: 464, y: 624, dir: 0 }, { x: 592, y: 624, dir: 0 }, { x: 720, y: 624, dir: 0 }, { x: 848, y: 624, dir: 0 }, { x: 720, y: 496, dir: 0 }, { x: 592, y: 496, dir: 0 }, { x: 848, y: 496, dir: 0 }, { x: 464, y: 496, dir: 0 }, { x: 464, y: 368, dir: 0 }, { x: 592, y: 368, dir: 0 }, { x: 720, y: 368, dir: 0 }, { x: 848, y: 368, dir: 0 }, { x: 720, y: 240, dir: 0 }, { x: 592, y: 240, dir: 0 }, { x: 848, y: 240, dir: 0 }, { x: 464, y: 240, dir: 0 }, { x: 464, y: 880, dir: 0 }, { x: 592, y: 880, dir: 0 }, { x: 720, y: 880, dir: 0 }, { x: 848, y: 880, dir: 0 }, { x: 720, y: 752, dir: 0 }, { x: 592, y: 752, dir: 0 }, { x: 848, y: 752, dir: 0 }, { x: 464, y: 752, dir: 0 }], pickups: [{ x: 528, y: 240, dir: 0 }, { x: 784, y: 240, dir: 0 }, { x: 528, y: 368, dir: 0 }, { x: 784, y: 368, dir: 0 }, { x: 528, y: 368, dir: 0 }, { x: 784, y: 368, dir: 0 }, { x: 528, y: 752, dir: 0 }, { x: 784, y: 752, dir: 0 }, { x: 528, y: 880, dir: 0 }, { x: 784, y: 880, dir: 0 }, { x: 528, y: 880, dir: 0 }, { x: 784, y: 880, dir: 0 }, { x: 528, y: 496, dir: 0 }, { x: 784, y: 496, dir: 0 }, { x: 528, y: 624, dir: 0 }, { x: 784, y: 624, dir: 0 }, { x: 528, y: 624, dir: 0 }, { x: 784, y: 624, dir: 0 }], walls: [] }, { id: "original-10", label: "10 \xB7 RECTY", symbol: 115, width: 1856, height: 544, columns: 58, rows: 17, collision: ["1111111111111111111111111111111111111111111111111111111111", "1111111111111111111111111111111111111111111111111111111111", "1111111111111111111111111111111111111111111111111111111111", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1111111111111111111111111111111111111111111111111111111111", "1111111111111111111111111111111111111111111111111111111111"], playerSpawns: [{ x: 272, y: 272, dir: 3.14159 }], otherSpawns: [{ x: 496, y: 272, dir: 3.14159 }, { x: 336, y: 144, dir: 3.14159 }, { x: 336, y: 400, dir: 3.14159 }, { x: 848, y: 272, dir: 3.14159 }, { x: 688, y: 144, dir: 3.14159 }, { x: 688, y: 400, dir: 3.14159 }, { x: 1168, y: 272, dir: 3.14159 }, { x: 1008, y: 144, dir: 3.14159 }, { x: 1008, y: 400, dir: 3.14159 }, { x: 1520, y: 272, dir: 3.14159 }, { x: 1360, y: 144, dir: 3.14159 }, { x: 1360, y: 400, dir: 3.14159 }, { x: 1680, y: 144, dir: 3.14159 }, { x: 1680, y: 400, dir: 3.14159 }, { x: 144, y: 144, dir: 3.14159 }, { x: 144, y: 400, dir: 3.14159 }], zombieSpawns: [{ x: 16, y: 240, dir: 0 }, { x: 16, y: 272, dir: 0 }, { x: 16, y: 304, dir: 0 }, { x: 16, y: 336, dir: 0 }, { x: 16, y: 368, dir: 0 }, { x: 16, y: 400, dir: 0 }, { x: 16, y: 208, dir: 0 }, { x: 16, y: 176, dir: 0 }, { x: 16, y: 144, dir: 0 }, { x: 1840, y: 240, dir: 0 }, { x: 1840, y: 272, dir: 0 }, { x: 1840, y: 304, dir: 0 }, { x: 1840, y: 336, dir: 0 }, { x: 1840, y: 368, dir: 0 }, { x: 1840, y: 400, dir: 0 }, { x: 1840, y: 208, dir: 0 }, { x: 1840, y: 176, dir: 0 }, { x: 1840, y: 144, dir: 0 }], devilSpawns: [{ x: 16, y: 208, dir: 0 }, { x: 16, y: 336, dir: 0 }, { x: 1840, y: 208, dir: 0 }, { x: 1840, y: 336, dir: 0 }], barrels: [{ x: 1104, y: 272, dir: 0 }, { x: 720, y: 272, dir: 0 }, { x: 1104, y: 176, dir: 0 }, { x: 720, y: 176, dir: 0 }, { x: 1104, y: 368, dir: 0 }, { x: 720, y: 368, dir: 0 }], pickups: [{ x: 1680, y: 240, dir: 0 }, { x: 1680, y: 304, dir: 0 }, { x: 1264, y: 240, dir: 0 }, { x: 1264, y: 304, dir: 0 }, { x: 592, y: 240, dir: 0 }, { x: 592, y: 304, dir: 0 }, { x: 176, y: 240, dir: 0 }, { x: 176, y: 304, dir: 0 }], walls: [] }, { id: "original-11", label: "11 \xB7 PATCHY", symbol: 120, width: 1312, height: 1056, columns: 41, rows: 33, collision: ["11111111111111111111111111111111111111111", "11110000000000000000000000111111110001111", "11110000000000000000000000111111110001111", "11110000000000000000000000111111110001111", "10000000000000000000000000111111110000001", "10000000000111111110000000111111110000001", "10000000000111111110000000000000000000001", "10000000000111111110000000000000000000001", "11110000000111111110000000000000000000001", "11110000000111111110000000000000000000001", "11110000000111111110000000000000000001111", "11110000000000000000000000000000000001111", "11110000000000000000000000000000000001111", "11110000000000000000000000000000000001111", "10000000000000000000000000000000000001111", "10000000000000000000000000000000000001111", "10000000000000000000000011111111000000001", "10000000000000000000000011111111000000001", "10000000000000000000000011111111000000001", "10000000000000000000000011111111000000001", "11111111100000000000000011111111000000001", "11111111100000000000000011111111000000001", "11111111100000000000000000000000000000001", "11111111100000000000000000000000000000001", "11111111100000000000000000000000000000001", "11111111100001111111100000000000000000001", "10000000000001111111100000000000000000001", "10000000000001111111100000000000000000001", "10000000000001111111100000000000000000001", "10000000000001111111100000000000000000001", "11110000000001111111100000000000000001111", "11110000000000000000000000000000000001111", "11111111111111111111111111111111111111111"], playerSpawns: [{ x: 528, y: 560, dir: 0 }], otherSpawns: [{ x: 784, y: 304, dir: 3.14159 }, { x: 272, y: 528, dir: 0 }, { x: 272, y: 304, dir: 0 }, { x: 528, y: 304, dir: 0 }, { x: 784, y: 816, dir: 3.14159 }, { x: 1040, y: 816, dir: 3.14159 }, { x: 1040, y: 560, dir: 3.14159 }, { x: 1040, y: 304, dir: 3.14159 }, { x: 1264, y: 816, dir: 3.14159 }, { x: 1264, y: 592, dir: 3.14159 }, { x: 80, y: 304, dir: 0 }, { x: 80, y: 560, dir: 0 }, { x: 784, y: 144, dir: 3.14159 }, { x: 272, y: 144, dir: 0 }, { x: 496, y: 80, dir: 0 }, { x: 1264, y: 176, dir: 3.14159 }, { x: 80, y: 144, dir: 0 }, { x: 784, y: 944, dir: 3.14159 }, { x: 272, y: 944, dir: 0 }, { x: 1040, y: 944, dir: 3.14159 }, { x: 80, y: 880, dir: 0 }], zombieSpawns: [{ x: 592, y: 16, dir: 0 }, { x: 624, y: 16, dir: 0 }, { x: 656, y: 16, dir: 0 }, { x: 688, y: 16, dir: 0 }, { x: 720, y: 16, dir: 0 }, { x: 592, y: 1040, dir: 0 }, { x: 624, y: 1040, dir: 0 }, { x: 656, y: 1040, dir: 0 }, { x: 688, y: 1040, dir: 0 }, { x: 720, y: 1040, dir: 0 }, { x: 272, y: 16, dir: 0 }, { x: 304, y: 16, dir: 0 }, { x: 336, y: 16, dir: 0 }, { x: 368, y: 16, dir: 0 }, { x: 400, y: 16, dir: 0 }, { x: 976, y: 1040, dir: 0 }, { x: 1008, y: 1040, dir: 0 }, { x: 1040, y: 1040, dir: 0 }, { x: 1072, y: 1040, dir: 0 }, { x: 1104, y: 1040, dir: 0 }, { x: 240, y: 1040, dir: 0 }, { x: 272, y: 1040, dir: 0 }, { x: 304, y: 1040, dir: 0 }, { x: 336, y: 1040, dir: 0 }, { x: 368, y: 1040, dir: 0 }, { x: 1136, y: 16, dir: 0 }, { x: 1168, y: 16, dir: 0 }, { x: 1104, y: 16, dir: 0 }, { x: 16, y: 176, dir: 0 }], devilSpawns: [{ x: 16, y: 528, dir: 0 }, { x: 1296, y: 528, dir: 0 }, { x: 624, y: 16, dir: 0 }, { x: 688, y: 16, dir: 0 }, { x: 624, y: 1040, dir: 0 }, { x: 688, y: 1040, dir: 0 }, { x: 304, y: 16, dir: 0 }, { x: 368, y: 16, dir: 0 }, { x: 1008, y: 1040, dir: 0 }, { x: 1072, y: 1040, dir: 0 }, { x: 272, y: 1040, dir: 0 }, { x: 336, y: 1040, dir: 0 }, { x: 1136, y: 16, dir: 0 }], barrels: [{ x: 464, y: 624, dir: 0 }, { x: 592, y: 624, dir: 0 }, { x: 592, y: 496, dir: 0 }, { x: 464, y: 496, dir: 0 }, { x: 720, y: 880, dir: 0 }, { x: 848, y: 880, dir: 0 }], pickups: [{ x: 784, y: 880, dir: 0 }, { x: 784, y: 880, dir: 0 }, { x: 528, y: 496, dir: 0 }, { x: 528, y: 624, dir: 0 }, { x: 528, y: 624, dir: 0 }], walls: [] }, { id: "original-12", label: "12 \xB7 FOREST BOX", symbol: 125, width: 1280, height: 1056, columns: 40, rows: 33, collision: ["1111111111111111111111111111111111111111", "1000000000000000000000000000000000000001", "1000000000000000000000000000000000000001", "1000011000000110000001100000011000000001", "1000011001100110011001100110011001100001", "1000000001100000011000000110000001100001", "1000000000000000000000000000000000000001", "1000011000000110000001100000011000000001", "1000011000000110011001100000011001100001", "1000000000000000011000000000000001100001", "1000000000000000000000000000000000000001", "1000011000000110000001100000011000000001", "1000011001100110000001100110011000000001", "1000000001100000000000000110000000000001", "1000000000000000000000000000000000000001", "1000011000000110000001100000011000000001", "1000011001100110011001100110011001100001", "1000000001100000011000000110000001100001", "1000000000000000000000000000000000000001", "1000011000000110000000000000000000000001", "1000011000000110011000000110000001100001", "1000000000000000011000000110000001100001", "1000000000000000000000000000000000000001", "1000011000000110000001100000011000000001", "1000011001100110000001100110011001100001", "1000000001100000000000000110000001100001", "1000000000000000000000000000000000000001", "1000011000000110000001100000011000000001", "1000011001100110011001100110011001100001", "1000000001100000011000000110000001100001", "1000000000000000000000000000000000000001", "1000000000000000000000000000000000000001", "1111111111111111111111111111111111111111"], playerSpawns: [{ x: 656, y: 528, dir: 0 }], otherSpawns: [{ x: 784, y: 304, dir: 3.14159 }, { x: 272, y: 528, dir: 0 }, { x: 272, y: 304, dir: 0 }, { x: 528, y: 304, dir: 0 }, { x: 656, y: 944, dir: 3.14159 }, { x: 1040, y: 816, dir: 3.14159 }, { x: 1040, y: 560, dir: 3.14159 }, { x: 1040, y: 304, dir: 3.14159 }, { x: 80, y: 304, dir: 0 }, { x: 80, y: 560, dir: 0 }, { x: 784, y: 144, dir: 3.14159 }, { x: 272, y: 144, dir: 0 }, { x: 496, y: 80, dir: 0 }, { x: 80, y: 144, dir: 0 }, { x: 784, y: 944, dir: 3.14159 }, { x: 272, y: 944, dir: 0 }, { x: 1040, y: 944, dir: 3.14159 }, { x: 80, y: 880, dir: 0 }, { x: 784, y: 784, dir: 3.14159 }, { x: 272, y: 784, dir: 0 }, { x: 528, y: 784, dir: 0 }, { x: 752, y: 528, dir: 3.14159 }, { x: 496, y: 432, dir: 0 }, { x: 496, y: 592, dir: 0 }, { x: 1168, y: 400, dir: 0 }, { x: 1168, y: 656, dir: 0 }, { x: 1168, y: 144, dir: 0 }, { x: 1168, y: 880, dir: 0 }], zombieSpawns: [{ x: 592, y: 16, dir: 0 }, { x: 624, y: 16, dir: 0 }, { x: 656, y: 16, dir: 0 }, { x: 688, y: 16, dir: 0 }, { x: 720, y: 16, dir: 0 }, { x: 272, y: 16, dir: 0 }, { x: 304, y: 16, dir: 0 }, { x: 336, y: 16, dir: 0 }, { x: 368, y: 16, dir: 0 }, { x: 400, y: 16, dir: 0 }, { x: 1008, y: 16, dir: 0 }, { x: 1040, y: 16, dir: 0 }, { x: 976, y: 16, dir: 0 }, { x: 16, y: 176, dir: 0 }, { x: 912, y: 16, dir: 0 }, { x: 944, y: 16, dir: 0 }, { x: 880, y: 16, dir: 0 }, { x: 592, y: 1040, dir: 0 }, { x: 624, y: 1040, dir: 0 }, { x: 656, y: 1040, dir: 0 }, { x: 688, y: 1040, dir: 0 }, { x: 720, y: 1040, dir: 0 }, { x: 272, y: 1040, dir: 0 }, { x: 304, y: 1040, dir: 0 }, { x: 336, y: 1040, dir: 0 }, { x: 368, y: 1040, dir: 0 }, { x: 400, y: 1040, dir: 0 }, { x: 1008, y: 1040, dir: 0 }, { x: 1040, y: 1040, dir: 0 }, { x: 976, y: 1040, dir: 0 }, { x: 912, y: 1040, dir: 0 }, { x: 944, y: 1040, dir: 0 }, { x: 880, y: 1040, dir: 0 }, { x: 1264, y: 368, dir: 1.5708 }, { x: 1264, y: 400, dir: 1.5708 }, { x: 1264, y: 336, dir: 1.5708 }, { x: 1264, y: 272, dir: 1.5708 }, { x: 1264, y: 304, dir: 1.5708 }, { x: 1264, y: 240, dir: 1.5708 }, { x: 1264, y: 752, dir: 1.5708 }, { x: 1264, y: 784, dir: 1.5708 }, { x: 1264, y: 720, dir: 1.5708 }, { x: 1264, y: 656, dir: 1.5708 }, { x: 1264, y: 688, dir: 1.5708 }, { x: 1264, y: 624, dir: 1.5708 }, { x: 16, y: 880, dir: 0 }], devilSpawns: [{ x: 16, y: 528, dir: 0 }, { x: 1264, y: 528, dir: 0 }, { x: 624, y: 16, dir: 0 }, { x: 688, y: 16, dir: 0 }, { x: 624, y: 1040, dir: 0 }, { x: 688, y: 1040, dir: 0 }], barrels: [], pickups: [{ x: 784, y: 880, dir: 0 }, { x: 784, y: 880, dir: 0 }, { x: 528, y: 496, dir: 0 }, { x: 528, y: 624, dir: 0 }, { x: 528, y: 624, dir: 0 }], walls: [] }, { id: "original-13", label: "13 \xB7 TIGHT 2", symbol: 126, width: 1216, height: 1088, columns: 38, rows: 34, collision: ["11111111111111111111111111111111111111", "11111100111111111111111111001111111111", "11000000110000001100000011001100110011", "11000000110000001100000011001100000011", "11000000110000001100000011001100000011", "11000000000000000000000000001100000011", "11001111110011111111111111001100000011", "11001111110011111111111111001100000011", "11001100110000000000000000001100000011", "11001100110011111111110011111111110011", "11001100110011111111110011111111110011", "11000000110011000000110000000000000011", "11000000110011111100111111111111110011", "11000000110011111100111111111111110011", "11000000110000000000000000000000110011", "11111100111111000000111111111100110011", "11111100111111000000111111111100110011", "11000000000000000000110000001100110011", "11000000111111000000110000001100110011", "11000000111111000000110000001100110011", "11000000000011000000000000001100000011", "11111111111111000000110011001100110011", "11111111111111000000110011001100110011", "11000000000000000000110011001100110011", "11000000111111111111110011001100110011", "11000000111111111111110011001100110011", "11000000000000001100000011000000110011", "11000000000011111100000011001111110011", "11000000000011111100000011001111110011", "11000000000011000000000011001100000011", "11111111110011001111111111001100000011", "11111111110011001111111111001100000011", "10000000000011001100000000000000000011", "11111111111111111111111111111111111111"], playerSpawns: [{ x: 560, y: 560, dir: 0 }], otherSpawns: [{ x: 592, y: 720, dir: 0 }, { x: 112, y: 432, dir: 0 }, { x: 496, y: 976, dir: 3.14159 }, { x: 1008, y: 784, dir: 3.14159 }, { x: 976, y: 560, dir: 3.14159 }, { x: 208, y: 272, dir: 0 }, { x: 144, y: 592, dir: 0 }, { x: 752, y: 144, dir: 3.14159 }, { x: 496, y: 80, dir: 0 }, { x: 208, y: 112, dir: 0 }, { x: 848, y: 944, dir: 3.14159 }, { x: 336, y: 944, dir: 0 }, { x: 1040, y: 976, dir: 3.14159 }, { x: 144, y: 848, dir: 0 }, { x: 880, y: 720, dir: 3.14159 }, { x: 624, y: 880, dir: 0 }, { x: 752, y: 560, dir: 3.14159 }, { x: 496, y: 592, dir: 0 }, { x: 1104, y: 400, dir: 0 }, { x: 1104, y: 656, dir: 0 }, { x: 1104, y: 144, dir: 0 }, { x: 1104, y: 880, dir: 0 }, { x: 1008, y: 208, dir: 0 }, { x: 720, y: 304, dir: 0 }, { x: 336, y: 304, dir: 0 }], zombieSpawns: [{ x: 208, y: 16, dir: 0 }, { x: 240, y: 16, dir: 0 }, { x: 464, y: 1104, dir: 0 }, { x: 496, y: 1104, dir: 0 }, { x: 848, y: 16, dir: 0 }, { x: 880, y: 16, dir: 0 }, { x: 1104, y: 1104, dir: 0 }, { x: 1136, y: 1104, dir: 0 }], devilSpawns: [{ x: 240, y: 16, dir: 0 }, { x: 496, y: 1104, dir: 0 }, { x: 880, y: 16, dir: 0 }, { x: 1136, y: 1104, dir: 0 }], barrels: [], pickups: [{ x: 848, y: 816, dir: 0 }, { x: 528, y: 496, dir: 0 }, { x: 528, y: 624, dir: 0 }, { x: 528, y: 624, dir: 0 }, { x: 176, y: 592, dir: 0 }, { x: 208, y: 848, dir: 0 }, { x: 1072, y: 112, dir: 0 }], walls: [] }, { id: "original-14", label: "14 \xB7 MASSIVE", symbol: 127, width: 1856, height: 1504, columns: 58, rows: 47, collision: ["1111111111111111111111111111111111111111111111111111111111", "1111111111111111111111111111111111111111111111111111111111", "1111111111111111111111111111111111111111111111111111111111", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1111111111111111111111111100000011111111111111111111111111", "1111111111111111111111111100000011111111111111111111111111", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1111111111111111111111111100000011111111111111111111111111", "1111111111111111111111111100000011111111111111111111111111", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1111111111111111111111111100000011111111111111111111111111", "1111111111111111111111111100000011111111111111111111111111", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1111111111111111111111111100000011111111111111111111111111", "1111111111111111111111111100000011111111111111111111111111", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1000000000000000000000000000000000000000000000000000000001", "1111111111111111111111111111111111111111111111111111111111"], playerSpawns: [{ x: 1584, y: 784, dir: 0 }], otherSpawns: [{ x: 336, y: 208, dir: 3.14159 }, { x: 688, y: 208, dir: 3.14159 }, { x: 1008, y: 208, dir: 3.14159 }, { x: 1360, y: 208, dir: 3.14159 }, { x: 1680, y: 208, dir: 3.14159 }, { x: 144, y: 208, dir: 3.14159 }, { x: 336, y: 496, dir: 3.14159 }, { x: 688, y: 496, dir: 3.14159 }, { x: 1008, y: 496, dir: 3.14159 }, { x: 1360, y: 496, dir: 3.14159 }, { x: 1680, y: 496, dir: 3.14159 }, { x: 144, y: 496, dir: 3.14159 }, { x: 336, y: 784, dir: 3.14159 }, { x: 688, y: 784, dir: 3.14159 }, { x: 1008, y: 784, dir: 3.14159 }, { x: 1360, y: 784, dir: 3.14159 }, { x: 1680, y: 784, dir: 3.14159 }, { x: 144, y: 784, dir: 3.14159 }, { x: 336, y: 1072, dir: 3.14159 }, { x: 688, y: 1072, dir: 3.14159 }, { x: 1008, y: 1072, dir: 3.14159 }, { x: 1360, y: 1072, dir: 3.14159 }, { x: 1680, y: 1072, dir: 3.14159 }, { x: 144, y: 1072, dir: 3.14159 }, { x: 336, y: 1360, dir: 3.14159 }, { x: 688, y: 1360, dir: 3.14159 }, { x: 1008, y: 1360, dir: 3.14159 }, { x: 1360, y: 1360, dir: 3.14159 }, { x: 1680, y: 1360, dir: 3.14159 }, { x: 144, y: 1360, dir: 3.14159 }], zombieSpawns: [{ x: 16, y: 240, dir: 0 }, { x: 16, y: 272, dir: 0 }, { x: 16, y: 208, dir: 0 }, { x: 16, y: 176, dir: 0 }, { x: 16, y: 144, dir: 0 }, { x: 1840, y: 240, dir: 0 }, { x: 1840, y: 272, dir: 0 }, { x: 1840, y: 208, dir: 0 }, { x: 1840, y: 176, dir: 0 }, { x: 1840, y: 144, dir: 0 }, { x: 16, y: 528, dir: 0 }, { x: 16, y: 560, dir: 0 }, { x: 16, y: 496, dir: 0 }, { x: 16, y: 464, dir: 0 }, { x: 16, y: 432, dir: 0 }, { x: 1840, y: 528, dir: 0 }, { x: 1840, y: 560, dir: 0 }, { x: 1840, y: 496, dir: 0 }, { x: 1840, y: 464, dir: 0 }, { x: 1840, y: 432, dir: 0 }, { x: 16, y: 816, dir: 0 }, { x: 16, y: 848, dir: 0 }, { x: 16, y: 784, dir: 0 }, { x: 16, y: 752, dir: 0 }, { x: 16, y: 720, dir: 0 }, { x: 1840, y: 816, dir: 0 }, { x: 1840, y: 848, dir: 0 }, { x: 1840, y: 784, dir: 0 }, { x: 1840, y: 752, dir: 0 }, { x: 1840, y: 720, dir: 0 }, { x: 16, y: 1104, dir: 0 }, { x: 16, y: 1136, dir: 0 }, { x: 16, y: 1072, dir: 0 }, { x: 16, y: 1040, dir: 0 }, { x: 16, y: 1008, dir: 0 }, { x: 1840, y: 1104, dir: 0 }, { x: 1840, y: 1136, dir: 0 }, { x: 1840, y: 1072, dir: 0 }, { x: 1840, y: 1040, dir: 0 }, { x: 1840, y: 1008, dir: 0 }, { x: 16, y: 1392, dir: 0 }, { x: 16, y: 1424, dir: 0 }, { x: 16, y: 1360, dir: 0 }, { x: 16, y: 1328, dir: 0 }, { x: 16, y: 1296, dir: 0 }, { x: 1840, y: 1392, dir: 0 }, { x: 1840, y: 1424, dir: 0 }, { x: 1840, y: 1360, dir: 0 }, { x: 1840, y: 1328, dir: 0 }, { x: 1840, y: 1296, dir: 0 }], devilSpawns: [{ x: 16, y: 208, dir: 0 }, { x: 1840, y: 208, dir: 0 }, { x: 16, y: 496, dir: 0 }, { x: 1840, y: 496, dir: 0 }, { x: 16, y: 784, dir: 0 }, { x: 1840, y: 784, dir: 0 }, { x: 16, y: 1072, dir: 0 }, { x: 1840, y: 1072, dir: 0 }, { x: 16, y: 1360, dir: 0 }, { x: 1840, y: 1360, dir: 0 }], barrels: [{ x: 1104, y: 208, dir: 0 }, { x: 720, y: 208, dir: 0 }, { x: 1104, y: 496, dir: 0 }, { x: 720, y: 496, dir: 0 }, { x: 1104, y: 784, dir: 0 }, { x: 720, y: 784, dir: 0 }, { x: 1104, y: 1072, dir: 0 }, { x: 720, y: 1072, dir: 0 }, { x: 1104, y: 1360, dir: 0 }, { x: 720, y: 1360, dir: 0 }], pickups: [{ x: 1264, y: 208, dir: 0 }, { x: 592, y: 208, dir: 0 }, { x: 176, y: 208, dir: 0 }, { x: 1712, y: 208, dir: 0 }, { x: 1264, y: 496, dir: 0 }, { x: 592, y: 496, dir: 0 }, { x: 176, y: 496, dir: 0 }, { x: 1712, y: 496, dir: 0 }, { x: 1264, y: 784, dir: 0 }, { x: 592, y: 784, dir: 0 }, { x: 176, y: 784, dir: 0 }, { x: 1712, y: 784, dir: 0 }, { x: 1264, y: 1072, dir: 0 }, { x: 592, y: 1072, dir: 0 }, { x: 176, y: 1072, dir: 0 }, { x: 1712, y: 1072, dir: 0 }, { x: 1264, y: 1360, dir: 0 }, { x: 592, y: 1360, dir: 0 }, { x: 176, y: 1360, dir: 0 }, { x: 1712, y: 1360, dir: 0 }], walls: [{ x: 48, y: 208, dir: 0 }, { x: 48, y: 176, dir: 0 }, { x: 48, y: 240, dir: 0 }, { x: 48, y: 272, dir: 0 }, { x: 48, y: 304, dir: 0 }, { x: 48, y: 144, dir: 0 }, { x: 48, y: 112, dir: 0 }, { x: 16, y: 112, dir: 0 }, { x: 16, y: 304, dir: 0 }, { x: 48, y: 496, dir: 0 }, { x: 48, y: 464, dir: 0 }, { x: 48, y: 528, dir: 0 }, { x: 48, y: 560, dir: 0 }, { x: 48, y: 592, dir: 0 }, { x: 48, y: 432, dir: 0 }, { x: 48, y: 400, dir: 0 }, { x: 16, y: 400, dir: 0 }, { x: 16, y: 592, dir: 0 }, { x: 48, y: 784, dir: 0 }, { x: 48, y: 752, dir: 0 }, { x: 48, y: 816, dir: 0 }, { x: 48, y: 848, dir: 0 }, { x: 48, y: 880, dir: 0 }, { x: 48, y: 720, dir: 0 }, { x: 48, y: 688, dir: 0 }, { x: 16, y: 688, dir: 0 }, { x: 16, y: 880, dir: 0 }, { x: 48, y: 1072, dir: 0 }, { x: 48, y: 1040, dir: 0 }, { x: 48, y: 1104, dir: 0 }, { x: 48, y: 1136, dir: 0 }, { x: 48, y: 1168, dir: 0 }, { x: 48, y: 1008, dir: 0 }, { x: 48, y: 976, dir: 0 }, { x: 16, y: 976, dir: 0 }, { x: 16, y: 1168, dir: 0 }, { x: 48, y: 1360, dir: 0 }, { x: 48, y: 1328, dir: 0 }, { x: 48, y: 1392, dir: 0 }, { x: 48, y: 1424, dir: 0 }, { x: 48, y: 1456, dir: 0 }, { x: 48, y: 1296, dir: 0 }, { x: 48, y: 1264, dir: 0 }, { x: 16, y: 1264, dir: 0 }, { x: 16, y: 1456, dir: 0 }, { x: 1808, y: 208, dir: 0 }, { x: 1808, y: 176, dir: 0 }, { x: 1808, y: 240, dir: 0 }, { x: 1808, y: 272, dir: 0 }, { x: 1808, y: 304, dir: 0 }, { x: 1808, y: 144, dir: 0 }, { x: 1808, y: 112, dir: 0 }, { x: 1808, y: 496, dir: 0 }, { x: 1808, y: 464, dir: 0 }, { x: 1808, y: 528, dir: 0 }, { x: 1808, y: 560, dir: 0 }, { x: 1808, y: 592, dir: 0 }, { x: 1808, y: 432, dir: 0 }, { x: 1808, y: 400, dir: 0 }, { x: 1808, y: 848, dir: 0 }, { x: 1808, y: 880, dir: 0 }, { x: 1808, y: 720, dir: 0 }, { x: 1808, y: 688, dir: 0 }, { x: 1808, y: 1072, dir: 0 }, { x: 1808, y: 1040, dir: 0 }, { x: 1808, y: 1104, dir: 0 }, { x: 1808, y: 1136, dir: 0 }, { x: 1808, y: 1168, dir: 0 }, { x: 1808, y: 1008, dir: 0 }, { x: 1808, y: 976, dir: 0 }, { x: 1808, y: 1360, dir: 0 }, { x: 1808, y: 1328, dir: 0 }, { x: 1808, y: 1392, dir: 0 }, { x: 1808, y: 1424, dir: 0 }, { x: 1808, y: 1456, dir: 0 }, { x: 1808, y: 1296, dir: 0 }, { x: 1808, y: 1264, dir: 0 }, { x: 1840, y: 112, dir: 0 }, { x: 1840, y: 304, dir: 0 }, { x: 1840, y: 400, dir: 0 }, { x: 1840, y: 592, dir: 0 }, { x: 1840, y: 688, dir: 0 }, { x: 1840, y: 880, dir: 0 }, { x: 1840, y: 976, dir: 0 }, { x: 1840, y: 1168, dir: 0 }, { x: 1840, y: 1264, dir: 0 }, { x: 1840, y: 1456, dir: 0 }] }, { id: "original-15", label: "15 \xB7 THIN LINE", symbol: 128, width: 2688, height: 544, columns: 84, rows: 17, collision: ["111111111111111111111111111111111111111111111111111111111111111111111111111111111111", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "111111111111111111111111111111111111111111111111111111111111111111111111111111111111", "111111111111111111111111111111111111111111111111111111111111111111111111111111111111", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "111111111111111111111111111111111111111111111111111111111111111111111111111111111111", "111111111111111111111111111111111111111111111111111111111111111111111111111111111111", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "111111111111111111111111111111111111111111111111111111111111111111111111111111111111"], playerSpawns: [{ x: 336, y: 304, dir: 3.14159 }], otherSpawns: [{ x: 432, y: 272, dir: 3.14159 }, { x: 752, y: 272, dir: 3.14159 }, { x: 1040, y: 272, dir: 3.14159 }, { x: 1328, y: 272, dir: 3.14159 }, { x: 1648, y: 272, dir: 3.14159 }, { x: 144, y: 272, dir: 3.14159 }, { x: 1936, y: 272, dir: 3.14159 }, { x: 2256, y: 272, dir: 3.14159 }, { x: 2544, y: 272, dir: 3.14159 }], zombieSpawns: [{ x: 16, y: 336, dir: 0 }, { x: 16, y: 368, dir: 0 }, { x: 16, y: 304, dir: 0 }, { x: 16, y: 272, dir: 0 }, { x: 16, y: 208, dir: 0 }, { x: 2672, y: 336, dir: 0 }, { x: 2672, y: 368, dir: 0 }, { x: 1840, y: 304, dir: 0 }, { x: 2672, y: 272, dir: 0 }, { x: 2672, y: 240, dir: 0 }, { x: 16, y: 240, dir: 0 }, { x: 2672, y: 208, dir: 0 }, { x: 2672, y: 304, dir: 0 }, { x: 16, y: 304, dir: 0 }], devilSpawns: [{ x: 16, y: 304, dir: 0 }, { x: 2672, y: 240, dir: 0 }], barrels: [], pickups: [{ x: 1680, y: 336, dir: 0 }, { x: 1680, y: 240, dir: 0 }, { x: 1264, y: 336, dir: 0 }, { x: 1264, y: 240, dir: 0 }, { x: 592, y: 336, dir: 0 }, { x: 592, y: 240, dir: 0 }, { x: 144, y: 336, dir: 0 }, { x: 176, y: 240, dir: 0 }, { x: 2e3, y: 304, dir: 0 }, { x: 2384, y: 240, dir: 0 }], walls: [] }, { id: "original-16", label: "16 \xB7 4 CASTLES", symbol: 133, width: 1856, height: 1600, columns: 58, rows: 50, collision: ["1111111111111111111111111111111111111111111111111111111111", "1111111111001100110011111111111111111100110011001111111111", "1100000000000000000000000000110000000000000000000000000011", "1100000000000000000000000000110000000000000000000000000011", "1100111111111100111111111100110011111111110011111111110011", "1100111111111100111111111100110011111111110011111111110011", "1100110000000000000000001100110011000000000000000000110011", "1100110000000000000000001100110011000000000000000000110011", "1000110000000000000000001100000011000000000000000000110001", "1000110000000000000000001100000011000000000000000000110001", "1100110000000000000000001100110011000000000000000000110011", "1100110000000111100000001100110011000000011110000000110011", "1000000000000111100000000000000000000000011110000000000001", "1000000000000111100000000000000000000000011110000000000001", "1100110000000000000000001100110011000000000000000000110011", "1100110000000000000000001100110011000000000000000000110011", "1000110000000000000000001100000011000000000000000000110001", "1000110000000000000000001100000011000000000000000000110001", "1100110000000000000000001100110011000000000000000000110011", "1100110000000000000000001100110011000000000000000000110011", "1100111111111100111111111100110011111111110011111111110011", "1100111111111100111111111100110011111111110011111111110011", "1100000000000000000000000000110000000000000000000000000011", "1100000000000000000000000000110000000000000000000000000011", "1111111111001100110011111111111111111100110011001111111111", "1111111111001100110011111111111111111100110011001111111111", "1100000000000000000000000000110000000000000000000000000011", "1100000000000000000000000000110000000000000000000000000011", "1100111111111100111111111100110011111111110011111111110011", "1100111111111100111111111100110011111111110011111111110011", "1100110000000000000000001100110011000000000000000000110011", "1100110000000000000000001100110011000000000000000000110011", "1000110000000000000000001100000011000000000000000000110001", "1000110000000000000000001100000011000000000000000000110001", "1100110000000000000000001100110011000000000000000000110011", "1100110000000111100000001100110011000000011110000000110011", "1000000000000111100000000000000000000000011110000000000001", "1000000000000111100000000000000000000000011110000000000001", "1100110000000000000000001100110011000000000000000000110011", "1100110000000000000000001100110011000000000000000000110011", "1000110000000000000000001100000011000000000000000000110001", "1000110000000000000000001100000011000000000000000000110001", "1100110000000000000000001100110011000000000000000000110011", "1100110000000000000000001100110011000000000000000000110011", "1100111111111100111111111100110011111111110011111111110011", "1100111111111100111111111100110011111111110011111111110011", "1100000000000000000000000000110000000000000000000000000011", "1100000000000000000000000000110000000000000000000000000011", "1111111111001100110011111111111111111100110011001111111111", "1111111111111111111111111111111111111111111111111111111111"], playerSpawns: [{ x: 656, y: 368, dir: 0 }, { x: 1552, y: 368, dir: 0 }, { x: 656, y: 1136, dir: 0 }, { x: 1552, y: 1136, dir: 0 }], otherSpawns: [{ x: 496, y: 528, dir: 1.5708 }, { x: 272, y: 560, dir: 1.5708 }, { x: 240, y: 240, dir: 1.5708 }, { x: 688, y: 240, dir: 1.5708 }, { x: 720, y: 560, dir: 1.5708 }, { x: 304, y: 400, dir: 1.5708 }, { x: 496, y: 240, dir: 1.5708 }, { x: 688, y: 80, dir: 1.5708 }, { x: 848, y: 272, dir: 1.5708 }, { x: 848, y: 592, dir: 1.5708 }, { x: 624, y: 720, dir: 1.5708 }, { x: 368, y: 720, dir: 1.5708 }, { x: 80, y: 624, dir: 1.5708 }, { x: 80, y: 176, dir: 1.5708 }, { x: 304, y: 80, dir: 1.5708 }, { x: 1392, y: 528, dir: 1.5708 }, { x: 1168, y: 560, dir: 1.5708 }, { x: 1136, y: 240, dir: 1.5708 }, { x: 1584, y: 240, dir: 1.5708 }, { x: 1616, y: 560, dir: 1.5708 }, { x: 1200, y: 400, dir: 1.5708 }, { x: 1392, y: 240, dir: 1.5708 }, { x: 1584, y: 80, dir: 1.5708 }, { x: 1744, y: 272, dir: 1.5708 }, { x: 1744, y: 592, dir: 1.5708 }, { x: 1520, y: 720, dir: 1.5708 }, { x: 1264, y: 720, dir: 1.5708 }, { x: 976, y: 624, dir: 1.5708 }, { x: 976, y: 176, dir: 1.5708 }, { x: 1200, y: 80, dir: 1.5708 }, { x: 496, y: 1296, dir: 1.5708 }, { x: 272, y: 1328, dir: 1.5708 }, { x: 240, y: 1008, dir: 1.5708 }, { x: 688, y: 1008, dir: 1.5708 }, { x: 720, y: 1328, dir: 1.5708 }, { x: 304, y: 1168, dir: 1.5708 }, { x: 496, y: 1008, dir: 1.5708 }, { x: 688, y: 848, dir: 1.5708 }, { x: 848, y: 1040, dir: 1.5708 }, { x: 848, y: 1360, dir: 1.5708 }, { x: 624, y: 1488, dir: 1.5708 }, { x: 368, y: 1488, dir: 1.5708 }, { x: 80, y: 1392, dir: 1.5708 }, { x: 80, y: 944, dir: 1.5708 }, { x: 304, y: 848, dir: 1.5708 }, { x: 1392, y: 1296, dir: 1.5708 }, { x: 1168, y: 1328, dir: 1.5708 }, { x: 1136, y: 1008, dir: 1.5708 }, { x: 1584, y: 1008, dir: 1.5708 }, { x: 1616, y: 1328, dir: 1.5708 }, { x: 1200, y: 1168, dir: 1.5708 }, { x: 1392, y: 1008, dir: 1.5708 }, { x: 1584, y: 848, dir: 1.5708 }, { x: 1744, y: 1040, dir: 1.5708 }, { x: 1744, y: 1360, dir: 1.5708 }, { x: 1520, y: 1488, dir: 1.5708 }, { x: 1264, y: 1488, dir: 1.5708 }, { x: 976, y: 1392, dir: 1.5708 }, { x: 976, y: 944, dir: 1.5708 }, { x: 1200, y: 848, dir: 1.5708 }], zombieSpawns: [{ x: 336, y: 16, dir: 0 }, { x: 368, y: 16, dir: 0 }, { x: 592, y: 16, dir: 0 }, { x: 624, y: 16, dir: 0 }, { x: 16, y: 272, dir: 0 }, { x: 16, y: 304, dir: 0 }, { x: 16, y: 528, dir: 0 }, { x: 16, y: 560, dir: 0 }, { x: 16, y: 400, dir: 0 }, { x: 464, y: 16, dir: 0 }, { x: 496, y: 16, dir: 0 }, { x: 16, y: 432, dir: 0 }, { x: 1232, y: 16, dir: 0 }, { x: 1264, y: 16, dir: 0 }, { x: 1488, y: 16, dir: 0 }, { x: 1520, y: 16, dir: 0 }, { x: 1840, y: 272, dir: 0 }, { x: 1840, y: 304, dir: 0 }, { x: 1840, y: 528, dir: 0 }, { x: 1840, y: 560, dir: 0 }, { x: 1840, y: 432, dir: 0 }, { x: 1360, y: 16, dir: 0 }, { x: 1392, y: 16, dir: 0 }, { x: 1840, y: 400, dir: 0 }, { x: 336, y: 1552, dir: 0 }, { x: 368, y: 1552, dir: 0 }, { x: 592, y: 1552, dir: 0 }, { x: 624, y: 1552, dir: 0 }, { x: 16, y: 1040, dir: 0 }, { x: 16, y: 1072, dir: 0 }, { x: 16, y: 1296, dir: 0 }, { x: 16, y: 1328, dir: 0 }, { x: 16, y: 1168, dir: 0 }, { x: 464, y: 1552, dir: 0 }, { x: 496, y: 1552, dir: 0 }, { x: 16, y: 1200, dir: 0 }, { x: 1232, y: 1552, dir: 0 }, { x: 1264, y: 1552, dir: 0 }, { x: 1488, y: 1552, dir: 0 }, { x: 1520, y: 1552, dir: 0 }, { x: 1840, y: 1040, dir: 0 }, { x: 1840, y: 1072, dir: 0 }, { x: 1840, y: 1296, dir: 0 }, { x: 1840, y: 1328, dir: 0 }, { x: 1840, y: 1200, dir: 0 }, { x: 1360, y: 1552, dir: 0 }, { x: 1392, y: 1552, dir: 0 }, { x: 1840, y: 1168, dir: 0 }], devilSpawns: [{ x: 464, y: 16, dir: 0 }, { x: 496, y: 16, dir: 0 }, { x: 16, y: 272, dir: 0 }, { x: 16, y: 432, dir: 0 }, { x: 16, y: 560, dir: 0 }, { x: 1360, y: 16, dir: 0 }, { x: 1392, y: 16, dir: 0 }, { x: 1840, y: 400, dir: 0 }, { x: 1840, y: 272, dir: 0 }, { x: 1840, y: 528, dir: 0 }, { x: 464, y: 1552, dir: 0 }, { x: 496, y: 1552, dir: 0 }, { x: 16, y: 1040, dir: 0 }, { x: 16, y: 1200, dir: 0 }, { x: 16, y: 1328, dir: 0 }, { x: 1360, y: 1552, dir: 0 }, { x: 1392, y: 1552, dir: 0 }, { x: 1840, y: 1168, dir: 0 }, { x: 1840, y: 1040, dir: 0 }, { x: 1840, y: 1296, dir: 0 }], barrels: [{ x: 432, y: 208, dir: 0 }, { x: 528, y: 208, dir: 0 }, { x: 432, y: 624, dir: 0 }, { x: 528, y: 624, dir: 0 }, { x: 208, y: 368, dir: 0 }, { x: 208, y: 464, dir: 0 }, { x: 752, y: 368, dir: 0 }, { x: 752, y: 464, dir: 0 }, { x: 1328, y: 208, dir: 0 }, { x: 1424, y: 208, dir: 0 }, { x: 1328, y: 624, dir: 0 }, { x: 1424, y: 624, dir: 0 }, { x: 1104, y: 368, dir: 0 }, { x: 1104, y: 464, dir: 0 }, { x: 1648, y: 368, dir: 0 }, { x: 1648, y: 464, dir: 0 }, { x: 432, y: 976, dir: 0 }, { x: 528, y: 976, dir: 0 }, { x: 432, y: 1392, dir: 0 }, { x: 528, y: 1392, dir: 0 }, { x: 208, y: 1136, dir: 0 }, { x: 208, y: 1232, dir: 0 }, { x: 752, y: 1136, dir: 0 }, { x: 752, y: 1232, dir: 0 }, { x: 1328, y: 976, dir: 0 }, { x: 1424, y: 976, dir: 0 }, { x: 1328, y: 1392, dir: 0 }, { x: 1424, y: 1392, dir: 0 }, { x: 1104, y: 1136, dir: 0 }, { x: 1104, y: 1232, dir: 0 }, { x: 1648, y: 1136, dir: 0 }, { x: 1648, y: 1232, dir: 0 }], pickups: [{ x: 80, y: 80, dir: 0 }, { x: 880, y: 80, dir: 0 }, { x: 848, y: 720, dir: 0 }, { x: 112, y: 720, dir: 0 }, { x: 976, y: 80, dir: 0 }, { x: 1776, y: 80, dir: 0 }, { x: 1744, y: 720, dir: 0 }, { x: 1008, y: 720, dir: 0 }, { x: 80, y: 848, dir: 0 }, { x: 880, y: 848, dir: 0 }, { x: 848, y: 1488, dir: 0 }, { x: 112, y: 1488, dir: 0 }, { x: 976, y: 848, dir: 0 }, { x: 1776, y: 848, dir: 0 }, { x: 1744, y: 1488, dir: 0 }, { x: 1008, y: 1488, dir: 0 }], walls: [{ x: 48, y: 272, dir: 0 }, { x: 48, y: 304, dir: 0 }, { x: 48, y: 400, dir: 0 }, { x: 48, y: 432, dir: 0 }, { x: 48, y: 528, dir: 0 }, { x: 48, y: 560, dir: 0 }, { x: 1808, y: 272, dir: 0 }, { x: 1808, y: 304, dir: 0 }, { x: 1808, y: 400, dir: 0 }, { x: 1808, y: 432, dir: 0 }, { x: 1808, y: 528, dir: 0 }, { x: 1808, y: 560, dir: 0 }, { x: 48, y: 1040, dir: 0 }, { x: 48, y: 1072, dir: 0 }, { x: 48, y: 1168, dir: 0 }, { x: 48, y: 1200, dir: 0 }, { x: 48, y: 1296, dir: 0 }, { x: 48, y: 1328, dir: 0 }, { x: 1808, y: 1040, dir: 0 }, { x: 1808, y: 1072, dir: 0 }, { x: 1808, y: 1168, dir: 0 }, { x: 1808, y: 1200, dir: 0 }, { x: 1808, y: 1296, dir: 0 }, { x: 1808, y: 1328, dir: 0 }] }, { id: "original-17", label: "17 \xB7 THE STRIPS", symbol: 134, width: 2688, height: 704, columns: 84, rows: 22, collision: ["111111111111111111111111111111111111111111111111111111111111111111111111111111111111", "111111111111111111111111111111111111111111111111111111111111111111111111111111111111", "111111111111111111111111111111111111111111111111111111111111111111111111111111111111", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "111111111111111111111111111111100000011111111111111111100000011111111111111111111111", "111111111111111111111111111111100000011111111111111111100000011111111111111111111111", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "111111111111111111111000000111111111111111111111111111111111111111111111111111111111", "111111111111111111111000000111111111111111111111111111111111111111111111111111111111", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000001", "111111111111111111111111111111111111111111111111111111111111111111111111111111111111"], playerSpawns: [{ x: 336, y: 208, dir: 3.14159 }], otherSpawns: [{ x: 464, y: 400, dir: 3.14159 }, { x: 752, y: 432, dir: 3.14159 }, { x: 1072, y: 432, dir: 3.14159 }, { x: 1360, y: 432, dir: 3.14159 }, { x: 1648, y: 432, dir: 3.14159 }, { x: 176, y: 400, dir: 3.14159 }, { x: 1968, y: 432, dir: 3.14159 }, { x: 2256, y: 432, dir: 3.14159 }, { x: 2576, y: 432, dir: 3.14159 }, { x: 464, y: 176, dir: 3.14159 }, { x: 752, y: 176, dir: 3.14159 }, { x: 1040, y: 176, dir: 3.14159 }, { x: 1360, y: 176, dir: 3.14159 }, { x: 1648, y: 176, dir: 3.14159 }, { x: 144, y: 176, dir: 3.14159 }, { x: 1936, y: 176, dir: 3.14159 }, { x: 2256, y: 176, dir: 3.14159 }, { x: 2544, y: 176, dir: 3.14159 }, { x: 464, y: 592, dir: 3.14159 }, { x: 752, y: 592, dir: 3.14159 }, { x: 1072, y: 592, dir: 3.14159 }, { x: 1360, y: 592, dir: 3.14159 }, { x: 1648, y: 592, dir: 3.14159 }, { x: 144, y: 592, dir: 3.14159 }, { x: 1968, y: 592, dir: 3.14159 }, { x: 2256, y: 592, dir: 3.14159 }, { x: 2544, y: 592, dir: 3.14159 }], zombieSpawns: [{ x: 16, y: 240, dir: 0 }, { x: 16, y: 272, dir: 0 }, { x: 16, y: 208, dir: 0 }, { x: 16, y: 176, dir: 0 }, { x: 16, y: 112, dir: 0 }, { x: 2672, y: 240, dir: 0 }, { x: 2672, y: 272, dir: 0 }, { x: 1840, y: 208, dir: 0 }, { x: 2672, y: 176, dir: 0 }, { x: 2672, y: 144, dir: 0 }, { x: 16, y: 144, dir: 0 }, { x: 2672, y: 112, dir: 0 }, { x: 2672, y: 208, dir: 0 }, { x: 16, y: 208, dir: 0 }, { x: 16, y: 656, dir: 0 }, { x: 16, y: 592, dir: 0 }, { x: 16, y: 624, dir: 0 }, { x: 2672, y: 656, dir: 0 }, { x: 2672, y: 592, dir: 0 }, { x: 2672, y: 624, dir: 0 }, { x: 16, y: 432, dir: 0 }, { x: 16, y: 368, dir: 0 }, { x: 16, y: 400, dir: 0 }, { x: 16, y: 496, dir: 0 }, { x: 16, y: 464, dir: 0 }, { x: 2672, y: 432, dir: 0 }, { x: 2672, y: 368, dir: 0 }, { x: 2672, y: 400, dir: 0 }, { x: 2672, y: 496, dir: 0 }, { x: 2672, y: 464, dir: 0 }], devilSpawns: [{ x: 16, y: 208, dir: 0 }, { x: 2672, y: 144, dir: 0 }, { x: 2672, y: 624, dir: 0 }, { x: 16, y: 624, dir: 0 }], barrels: [], pickups: [{ x: 1680, y: 144, dir: 0 }, { x: 176, y: 144, dir: 0 }, { x: 2384, y: 144, dir: 0 }, { x: 1616, y: 592, dir: 0 }, { x: 1200, y: 592, dir: 0 }, { x: 400, y: 368, dir: 0 }, { x: 688, y: 368, dir: 0 }, { x: 1264, y: 400, dir: 0 }, { x: 2352, y: 368, dir: 0 }], walls: [] }, { id: "original-18", label: "18 \xB7 BIG ONE", symbol: 139, width: 2784, height: 2784, columns: 87, rows: 87, collision: ["111111111111111111111111111111111111111111111111111111111111111111111111111111111111111", "111100000011111111000000111111110000000111111110000000011111111000000111111110000001111", "111100000011111111000000111111110000000111111110000000011111111000000111111110000001111", "111100000011111111000000111111110000000111111110000000011111111000000111111110000001111", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000001100000000000000000000000000000000001111", "100000000000000000000000000000000000000000000001100000000000000000000000000000000000001", "100000000000000000000000000000000000000000000001100000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000110000000000000000000000000000000000000000000011000000000000001", "100000000000000000000000110000000000000000000000000000000000000000000011000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000011000000000000001", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000110000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000110000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "100000000000000000000000000000000000000000000000000000000000000011000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000011000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000011000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000011000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000001100000000000000000000000000000000000000000000000000001", "111100000000000000000000000000001100000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000011000000000001111", "100000000000000000000000000000000000000000000000000000000000000000000011000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000110000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000110000000000000000000000000000000000000000000000000001", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000001100000000000000000011000000000000001111", "111100000000000000000000000000000000000000000001100000000000000000011000000000000001111", "100000000000000000000001100000000000000000000000000000000000000000000000000000000000001", "100000000000000000000001100000000000000000000000000000000000000000000000000000000000001", "100000000000000000000001100000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000011000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000011000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000011000000000000000000000000000001111", "111100000000000000000000000000000000000000000000000000000000000000000000000000000001111", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "100000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "111100000011111111000000111111110000000111111110000000011111111000000111111110000001111", "111100000011111111000000111111110000000111111110000000011111111000000111111110000001111", "111100000011111111000000111111110000000111111110000000011111111000000111111110000001111", "111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"], playerSpawns: [{ x: 1328, y: 1392, dir: 0 }], otherSpawns: [{ x: 944, y: 656, dir: 0 }, { x: 1200, y: 656, dir: 0 }, { x: 1424, y: 656, dir: 0 }, { x: 720, y: 656, dir: 0 }, { x: 464, y: 656, dir: 0 }, { x: 240, y: 656, dir: 0 }, { x: 1680, y: 656, dir: 0 }, { x: 1904, y: 656, dir: 0 }, { x: 2160, y: 656, dir: 0 }, { x: 2384, y: 656, dir: 0 }, { x: 2640, y: 656, dir: 0 }, { x: 944, y: 432, dir: 0 }, { x: 1168, y: 432, dir: 0 }, { x: 1424, y: 432, dir: 0 }, { x: 688, y: 432, dir: 0 }, { x: 464, y: 432, dir: 0 }, { x: 208, y: 432, dir: 0 }, { x: 1648, y: 432, dir: 0 }, { x: 1904, y: 432, dir: 0 }, { x: 2128, y: 432, dir: 0 }, { x: 2384, y: 432, dir: 0 }, { x: 2608, y: 432, dir: 0 }, { x: 944, y: 240, dir: 0 }, { x: 1200, y: 240, dir: 0 }, { x: 1424, y: 240, dir: 0 }, { x: 720, y: 240, dir: 0 }, { x: 464, y: 240, dir: 0 }, { x: 240, y: 240, dir: 0 }, { x: 1680, y: 240, dir: 0 }, { x: 1904, y: 240, dir: 0 }, { x: 2160, y: 240, dir: 0 }, { x: 2384, y: 240, dir: 0 }, { x: 2640, y: 240, dir: 0 }, { x: 944, y: 880, dir: 0 }, { x: 1200, y: 880, dir: 0 }, { x: 1424, y: 880, dir: 0 }, { x: 720, y: 880, dir: 0 }, { x: 464, y: 880, dir: 0 }, { x: 240, y: 880, dir: 0 }, { x: 1680, y: 880, dir: 0 }, { x: 1904, y: 880, dir: 0 }, { x: 2160, y: 880, dir: 0 }, { x: 2384, y: 880, dir: 0 }, { x: 2640, y: 880, dir: 0 }, { x: 912, y: 1104, dir: 0 }, { x: 1168, y: 1104, dir: 0 }, { x: 1392, y: 1104, dir: 0 }, { x: 688, y: 1104, dir: 0 }, { x: 432, y: 1104, dir: 0 }, { x: 208, y: 1104, dir: 0 }, { x: 1648, y: 1104, dir: 0 }, { x: 1872, y: 1104, dir: 0 }, { x: 2128, y: 1104, dir: 0 }, { x: 2352, y: 1104, dir: 0 }, { x: 2608, y: 1104, dir: 0 }, { x: 944, y: 1296, dir: 0 }, { x: 1200, y: 1296, dir: 0 }, { x: 1424, y: 1296, dir: 0 }, { x: 720, y: 1296, dir: 0 }, { x: 464, y: 1296, dir: 0 }, { x: 240, y: 1296, dir: 0 }, { x: 1680, y: 1296, dir: 0 }, { x: 1904, y: 1296, dir: 0 }, { x: 2160, y: 1296, dir: 0 }, { x: 2384, y: 1296, dir: 0 }, { x: 2640, y: 1296, dir: 0 }, { x: 912, y: 1488, dir: 0 }, { x: 1168, y: 1488, dir: 0 }, { x: 1392, y: 1488, dir: 0 }, { x: 688, y: 1488, dir: 0 }, { x: 432, y: 1488, dir: 0 }, { x: 208, y: 1488, dir: 0 }, { x: 1648, y: 1488, dir: 0 }, { x: 1872, y: 1488, dir: 0 }, { x: 2128, y: 1488, dir: 0 }, { x: 2352, y: 1488, dir: 0 }, { x: 2608, y: 1488, dir: 0 }, { x: 944, y: 1712, dir: 0 }, { x: 1200, y: 1712, dir: 0 }, { x: 1424, y: 1712, dir: 0 }, { x: 720, y: 1712, dir: 0 }, { x: 464, y: 1712, dir: 0 }, { x: 240, y: 1712, dir: 0 }, { x: 1680, y: 1712, dir: 0 }, { x: 1904, y: 1712, dir: 0 }, { x: 2160, y: 1712, dir: 0 }, { x: 2384, y: 1712, dir: 0 }, { x: 2640, y: 1712, dir: 0 }, { x: 944, y: 1904, dir: 0 }, { x: 1200, y: 1904, dir: 0 }, { x: 1424, y: 1904, dir: 0 }, { x: 720, y: 1904, dir: 0 }, { x: 464, y: 1904, dir: 0 }, { x: 240, y: 1904, dir: 0 }, { x: 1680, y: 1904, dir: 0 }, { x: 1904, y: 1904, dir: 0 }, { x: 2160, y: 1904, dir: 0 }, { x: 2384, y: 1904, dir: 0 }, { x: 2640, y: 1904, dir: 0 }, { x: 944, y: 2128, dir: 0 }, { x: 1200, y: 2128, dir: 0 }, { x: 1424, y: 2128, dir: 0 }, { x: 720, y: 2128, dir: 0 }, { x: 464, y: 2128, dir: 0 }, { x: 240, y: 2128, dir: 0 }, { x: 1680, y: 2128, dir: 0 }, { x: 1904, y: 2128, dir: 0 }, { x: 2160, y: 2128, dir: 0 }, { x: 2384, y: 2128, dir: 0 }, { x: 2640, y: 2128, dir: 0 }, { x: 912, y: 2352, dir: 0 }, { x: 1168, y: 2352, dir: 0 }, { x: 1392, y: 2352, dir: 0 }, { x: 688, y: 2352, dir: 0 }, { x: 432, y: 2352, dir: 0 }, { x: 208, y: 2352, dir: 0 }, { x: 1648, y: 2352, dir: 0 }, { x: 1872, y: 2352, dir: 0 }, { x: 2128, y: 2352, dir: 0 }, { x: 2352, y: 2352, dir: 0 }, { x: 2608, y: 2352, dir: 0 }, { x: 944, y: 2576, dir: 0 }, { x: 1200, y: 2576, dir: 0 }, { x: 1424, y: 2576, dir: 0 }, { x: 720, y: 2576, dir: 0 }, { x: 464, y: 2576, dir: 0 }, { x: 240, y: 2576, dir: 0 }, { x: 1680, y: 2576, dir: 0 }, { x: 1904, y: 2576, dir: 0 }, { x: 2160, y: 2576, dir: 0 }, { x: 2384, y: 2576, dir: 0 }, { x: 2640, y: 2576, dir: 0 }], zombieSpawns: [{ x: 144, y: 16, dir: 0 }, { x: 176, y: 16, dir: 0 }, { x: 208, y: 16, dir: 0 }, { x: 240, y: 16, dir: 0 }, { x: 272, y: 16, dir: 0 }, { x: 720, y: 16, dir: 0 }, { x: 752, y: 16, dir: 0 }, { x: 688, y: 16, dir: 0 }, { x: 624, y: 16, dir: 0 }, { x: 656, y: 16, dir: 0 }, { x: 592, y: 16, dir: 0 }, { x: 2768, y: 272, dir: 1.5708 }, { x: 2768, y: 304, dir: 1.5708 }, { x: 2768, y: 240, dir: 1.5708 }, { x: 2768, y: 176, dir: 1.5708 }, { x: 2768, y: 208, dir: 1.5708 }, { x: 2768, y: 144, dir: 1.5708 }, { x: 2768, y: 688, dir: 1.5708 }, { x: 2768, y: 720, dir: 1.5708 }, { x: 2768, y: 656, dir: 1.5708 }, { x: 2768, y: 592, dir: 1.5708 }, { x: 2768, y: 624, dir: 1.5708 }, { x: 2768, y: 560, dir: 1.5708 }, { x: 2768, y: 1104, dir: 1.5708 }, { x: 2768, y: 1136, dir: 1.5708 }, { x: 2768, y: 1072, dir: 1.5708 }, { x: 2768, y: 1008, dir: 1.5708 }, { x: 2768, y: 1040, dir: 1.5708 }, { x: 2768, y: 976, dir: 1.5708 }, { x: 2768, y: 1168, dir: 1.5708 }, { x: 2768, y: 1200, dir: 1.5708 }, { x: 2768, y: 1232, dir: 1.5708 }, { x: 2768, y: 1616, dir: 1.5708 }, { x: 2768, y: 1648, dir: 1.5708 }, { x: 2768, y: 1584, dir: 1.5708 }, { x: 2768, y: 1520, dir: 1.5708 }, { x: 2768, y: 1552, dir: 1.5708 }, { x: 2768, y: 1488, dir: 1.5708 }, { x: 2768, y: 1680, dir: 1.5708 }, { x: 2768, y: 1712, dir: 1.5708 }, { x: 2768, y: 1744, dir: 1.5708 }, { x: 2768, y: 1776, dir: 1.5708 }, { x: 2768, y: 2032, dir: 1.5708 }, { x: 2768, y: 2064, dir: 1.5708 }, { x: 2768, y: 2096, dir: 1.5708 }, { x: 2768, y: 2128, dir: 1.5708 }, { x: 2768, y: 2160, dir: 1.5708 }, { x: 2768, y: 2192, dir: 1.5708 }, { x: 2768, y: 2448, dir: 1.5708 }, { x: 2768, y: 2480, dir: 1.5708 }, { x: 2768, y: 2512, dir: 1.5708 }, { x: 2768, y: 2544, dir: 1.5708 }, { x: 2768, y: 2576, dir: 1.5708 }, { x: 2768, y: 2608, dir: 1.5708 }, { x: 304, y: 16, dir: 0 }, { x: 1168, y: 16, dir: 0 }, { x: 1200, y: 16, dir: 0 }, { x: 1136, y: 16, dir: 0 }, { x: 1072, y: 16, dir: 0 }, { x: 1104, y: 16, dir: 0 }, { x: 1040, y: 16, dir: 0 }, { x: 1232, y: 16, dir: 0 }, { x: 1648, y: 16, dir: 0 }, { x: 1680, y: 16, dir: 0 }, { x: 1616, y: 16, dir: 0 }, { x: 1552, y: 16, dir: 0 }, { x: 1584, y: 16, dir: 0 }, { x: 1520, y: 16, dir: 0 }, { x: 1712, y: 16, dir: 0 }, { x: 1744, y: 16, dir: 0 }, { x: 2160, y: 16, dir: 0 }, { x: 2192, y: 16, dir: 0 }, { x: 2128, y: 16, dir: 0 }, { x: 2064, y: 16, dir: 0 }, { x: 2096, y: 16, dir: 0 }, { x: 2032, y: 16, dir: 0 }, { x: 2608, y: 16, dir: 0 }, { x: 2640, y: 16, dir: 0 }, { x: 2576, y: 16, dir: 0 }, { x: 2512, y: 16, dir: 0 }, { x: 2544, y: 16, dir: 0 }, { x: 2480, y: 16, dir: 0 }, { x: 144, y: 2768, dir: 0 }, { x: 176, y: 2768, dir: 0 }, { x: 208, y: 2768, dir: 0 }, { x: 240, y: 2768, dir: 0 }, { x: 272, y: 2768, dir: 0 }, { x: 720, y: 2768, dir: 0 }, { x: 752, y: 2768, dir: 0 }, { x: 688, y: 2768, dir: 0 }, { x: 624, y: 2768, dir: 0 }, { x: 656, y: 2768, dir: 0 }, { x: 592, y: 2768, dir: 0 }, { x: 304, y: 2768, dir: 0 }, { x: 1168, y: 2768, dir: 0 }, { x: 1200, y: 2768, dir: 0 }, { x: 1136, y: 2768, dir: 0 }, { x: 1072, y: 2768, dir: 0 }, { x: 1104, y: 2768, dir: 0 }, { x: 1040, y: 2768, dir: 0 }, { x: 1232, y: 2768, dir: 0 }, { x: 1648, y: 2768, dir: 0 }, { x: 1680, y: 2768, dir: 0 }, { x: 1616, y: 2768, dir: 0 }, { x: 1552, y: 2768, dir: 0 }, { x: 1584, y: 2768, dir: 0 }, { x: 1520, y: 2768, dir: 0 }, { x: 1712, y: 2768, dir: 0 }, { x: 1744, y: 2768, dir: 0 }, { x: 2160, y: 2768, dir: 0 }, { x: 2192, y: 2768, dir: 0 }, { x: 2128, y: 2768, dir: 0 }, { x: 2064, y: 2768, dir: 0 }, { x: 2096, y: 2768, dir: 0 }, { x: 2032, y: 2768, dir: 0 }, { x: 2608, y: 2768, dir: 0 }, { x: 2640, y: 2768, dir: 0 }, { x: 2576, y: 2768, dir: 0 }, { x: 2512, y: 2768, dir: 0 }, { x: 2544, y: 2768, dir: 0 }, { x: 2480, y: 2768, dir: 0 }, { x: 16, y: 272, dir: 1.5708 }, { x: 16, y: 304, dir: 1.5708 }, { x: 16, y: 240, dir: 1.5708 }, { x: 16, y: 176, dir: 1.5708 }, { x: 16, y: 208, dir: 1.5708 }, { x: 16, y: 144, dir: 1.5708 }, { x: 16, y: 688, dir: 1.5708 }, { x: 16, y: 720, dir: 1.5708 }, { x: 16, y: 656, dir: 1.5708 }, { x: 16, y: 592, dir: 1.5708 }, { x: 16, y: 624, dir: 1.5708 }, { x: 16, y: 560, dir: 1.5708 }, { x: 16, y: 1104, dir: 1.5708 }, { x: 16, y: 1136, dir: 1.5708 }, { x: 16, y: 1072, dir: 1.5708 }, { x: 16, y: 1008, dir: 1.5708 }, { x: 16, y: 1040, dir: 1.5708 }, { x: 16, y: 976, dir: 1.5708 }, { x: 16, y: 1168, dir: 1.5708 }, { x: 16, y: 1200, dir: 1.5708 }, { x: 16, y: 1232, dir: 1.5708 }, { x: 16, y: 1616, dir: 1.5708 }, { x: 16, y: 1648, dir: 1.5708 }, { x: 16, y: 1584, dir: 1.5708 }, { x: 16, y: 1520, dir: 1.5708 }, { x: 16, y: 1552, dir: 1.5708 }, { x: 16, y: 1488, dir: 1.5708 }, { x: 16, y: 1680, dir: 1.5708 }, { x: 16, y: 1712, dir: 1.5708 }, { x: 16, y: 1744, dir: 1.5708 }, { x: 16, y: 1776, dir: 1.5708 }, { x: 16, y: 2032, dir: 1.5708 }, { x: 16, y: 2064, dir: 1.5708 }, { x: 16, y: 2096, dir: 1.5708 }, { x: 16, y: 2128, dir: 1.5708 }, { x: 16, y: 2160, dir: 1.5708 }, { x: 16, y: 2192, dir: 1.5708 }, { x: 16, y: 2448, dir: 1.5708 }, { x: 16, y: 2480, dir: 1.5708 }, { x: 16, y: 2512, dir: 1.5708 }, { x: 16, y: 2544, dir: 1.5708 }, { x: 16, y: 2576, dir: 1.5708 }, { x: 16, y: 2608, dir: 1.5708 }], devilSpawns: [{ x: 2768, y: 208, dir: 0 }, { x: 2768, y: 624, dir: 0 }, { x: 2768, y: 1040, dir: 0 }, { x: 2768, y: 1552, dir: 0 }, { x: 16, y: 208, dir: 0 }, { x: 16, y: 624, dir: 0 }, { x: 16, y: 1040, dir: 0 }, { x: 16, y: 1552, dir: 0 }], barrels: [], pickups: [{ x: 1264, y: 1296, dir: 0 }, { x: 1520, y: 1296, dir: 0 }, { x: 1520, y: 1552, dir: 0 }, { x: 1264, y: 1552, dir: 0 }], walls: [] }], animations: { "swat-stand": { file: "swat-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-walk": { file: "swat-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-handgun-stand": { file: "swat-handgun-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-handgun-walk": { file: "swat-handgun-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-uzi-stand": { file: "swat-uzi-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-uzi-walk": { file: "swat-uzi-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-shotgun-stand": { file: "swat-shotgun-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-shotgun-walk": { file: "swat-shotgun-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-rocketlauncher-stand": { file: "swat-rocketlauncher-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-rocketlauncher-walk": { file: "swat-rocketlauncher-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-railgun-stand": { file: "swat-railgun-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-railgun-walk": { file: "swat-railgun-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-hitfront": { file: "swat-hitfront.png", frames: 2, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-hitrear": { file: "swat-hitrear.png", frames: 2, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-dying": { file: "swat-dying.png", frames: 5, directions: 4, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "swat-dead": { file: "swat-dead.png", frames: 1, directions: 4, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-stand": { file: "bond-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-walk": { file: "bond-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-handgun-stand": { file: "bond-handgun-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-handgun-walk": { file: "bond-handgun-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-uzi-stand": { file: "bond-uzi-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-uzi-walk": { file: "bond-uzi-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-shotgun-stand": { file: "bond-shotgun-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-shotgun-walk": { file: "bond-shotgun-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-rocketlauncher-stand": { file: "bond-rocketlauncher-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-rocketlauncher-walk": { file: "bond-rocketlauncher-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-railgun-stand": { file: "bond-railgun-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-railgun-walk": { file: "bond-railgun-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-hitfront": { file: "bond-hitfront.png", frames: 2, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-hitrear": { file: "bond-hitrear.png", frames: 2, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-dying": { file: "bond-dying.png", frames: 5, directions: 4, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bond-dead": { file: "bond-dead.png", frames: 1, directions: 4, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-stand": { file: "gijoe-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-walk": { file: "gijoe-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-handgun-stand": { file: "gijoe-handgun-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-handgun-walk": { file: "gijoe-handgun-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-uzi-stand": { file: "gijoe-uzi-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-uzi-walk": { file: "gijoe-uzi-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-shotgun-stand": { file: "gijoe-shotgun-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-shotgun-walk": { file: "gijoe-shotgun-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-rocketlauncher-stand": { file: "gijoe-rocketlauncher-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-rocketlauncher-walk": { file: "gijoe-rocketlauncher-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-railgun-stand": { file: "gijoe-railgun-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-railgun-walk": { file: "gijoe-railgun-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-hitfront": { file: "gijoe-hitfront.png", frames: 2, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-hitrear": { file: "gijoe-hitrear.png", frames: 2, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-dying": { file: "gijoe-dying.png", frames: 5, directions: 4, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "gijoe-dead": { file: "gijoe-dead.png", frames: 1, directions: 4, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-stand": { file: "bambo-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-walk": { file: "bambo-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-handgun-stand": { file: "bambo-handgun-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-handgun-walk": { file: "bambo-handgun-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-uzi-stand": { file: "bambo-uzi-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-uzi-walk": { file: "bambo-uzi-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-shotgun-stand": { file: "bambo-shotgun-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-shotgun-walk": { file: "bambo-shotgun-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-rocketlauncher-stand": { file: "bambo-rocketlauncher-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-rocketlauncher-walk": { file: "bambo-rocketlauncher-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-railgun-stand": { file: "bambo-railgun-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-railgun-walk": { file: "bambo-railgun-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-hitfront": { file: "bambo-hitfront.png", frames: 2, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-hitrear": { file: "bambo-hitrear.png", frames: 2, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-dying": { file: "bambo-dying.png", frames: 5, directions: 4, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "bambo-dead": { file: "bambo-dead.png", frames: 1, directions: 4, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "zombie-stand": { file: "zombie-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "zombie-walk": { file: "zombie-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "zombie-attack": { file: "zombie-attack.png", frames: 4, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "zombie-hitfront": { file: "zombie-hitfront.png", frames: 2, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "zombie-hitrear": { file: "zombie-hitrear.png", frames: 2, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "zombie-dying": { file: "zombie-dying.png", frames: 5, directions: 4, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "zombie-dead": { file: "zombie-dead.png", frames: 1, directions: 4, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "devil-stand": { file: "devil-stand.png", frames: 1, directions: 16, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "devil-walk": { file: "devil-walk.png", frames: 5, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "devil-attack": { file: "devil-attack.png", frames: 4, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "devil-hitfront": { file: "devil-hitfront.png", frames: 2, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "devil-hitrear": { file: "devil-hitrear.png", frames: 2, directions: 8, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "devil-dying": { file: "devil-dying.png", frames: 5, directions: 4, w: 192, h: 192, x: -48, y: -80, scale: 0.5 }, "devil-dead": { file: "devil-dead.png", frames: 1, directions: 4, w: 192, h: 192, x: -48, y: -80, scale: 0.5 } }, objects: { "Effect.Explosion": { file: "effect-explosion.png", frames: 18, w: 217, h: 163, x: -109, y: -109 }, "Effect.BloodHitBack": { file: "effect-bloodhitback.png", frames: 1, w: 75, h: 8, x: -4, y: -4 }, "Effect.Explosion_MidAir": { file: "effect-explosion-midair.png", frames: 18, w: 217, h: 217, x: -109, y: -109 }, "Effect.RocketSmoke": { file: "effect-rocketsmoke.png", frames: 6, w: 128, h: 128, x: -64, y: -64 }, "Effect.FireBall": { file: "effect-fireball.png", frames: 1, w: 39, h: 42, x: -7, y: -10 }, "Effect.BloodPool": { file: "effect-bloodpool.png", frames: 1, w: 61, h: 55, x: -31, y: -28 }, "Effect.BloodSplat": { file: "effect-bloodsplat.png", frames: 1, w: 69, h: 66, x: -30, y: -26 }, "Effect.BulletHit": { file: "effect-bullethit.png", frames: 1, w: 23, h: 34, x: -9, y: -24 }, "Effect.ScorchMark": { file: "effect-scorchmark.png", frames: 1, w: 122, h: 122, x: -61, y: -61 }, "Effect.WallMark": { file: "effect-wallmark.png", frames: 1, w: 29, h: 24, x: -15, y: -13 }, "Effect.SmokeCloud": { file: "effect-smokecloud.png", frames: 1, w: 134, h: 134, x: -64, y: -101 }, "Object.Barrel": { file: "object-barrel.png", frames: 1, w: 36, h: 46, x: -19, y: -33 }, "Object.ChargePack": { file: "object-chargepack.png", frames: 2, w: 28, h: 26, x: -10, y: -9 }, "Object.Mine": { file: "object-mine.png", frames: 2, w: 25, h: 21, x: -11, y: -8 }, "Object.Pickup": { file: "object-pickup.png", frames: 1, w: 32, h: 30, x: -15, y: -19 }, "Object.Wall": { file: "object-wall.png", frames: 10, w: 45, h: 49, x: -26, y: -33 }, "Shot.ClusterShell": { file: "shot-clustershell.png", frames: 1, w: 8, h: 5, x: -4, y: -3 }, "Shot.Devastator": { file: "shot-devastator.png", frames: 1, w: 8, h: 8, x: -4, y: -5 }, "Shot.Grenade": { file: "shot-grenade.png", frames: 1, w: 7, h: 7, x: -4, y: -6 }, "Shot.Rocket": { file: "shot-rocket.png", frames: 1, w: 52, h: 53, x: -11, y: -8 }, "Pistol.MuzzleFlash": { file: "pistol-muzzleflash.png", frames: 1, w: 86, h: 70, x: -30, y: -30 }, "Railgun.MuzzleFlash": { file: "railgun-muzzleflash.png", frames: 1, w: 86, h: 70, x: -30, y: -30 }, "Shotgun.MuzzleFlash": { file: "shotgun-muzzleflash.png", frames: 1, w: 86, h: 70, x: -30, y: -30 }, "UZI.MuzzleFlash": { file: "uzi-muzzleflash.png", frames: 1, w: 86, h: 70, x: -30, y: -30 }, Zombie_Skin_Color: { file: "zombie-skin-color.png", frames: 1, w: 64, h: 64, x: -32, y: -32 }, Zombie_Body_Back: { file: "zombie-body-back.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Zombie_Body_Front: { file: "zombie-body-front.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Zombie_Body_Side: { file: "zombie-body-side.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Zombie_Body_Top: { file: "zombie-body-top.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Zombie_Hair_Color: { file: "zombie-hair-color.png", frames: 1, w: 64, h: 64, x: -32, y: -32 }, Swat_Body_Back: { file: "swat-body-back.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Swat_Body_Front: { file: "swat-body-front.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Swat_Body_Side: { file: "swat-body-side.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Swat_Body_Top: { file: "swat-body-top.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, GIJOE_Body_Back: { file: "gijoe-body-back.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, GIJOE_Body_Front: { file: "gijoe-body-front.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, GIJOE_Body_Side: { file: "gijoe-body-side.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, GIJOE_Body_Top: { file: "gijoe-body-top.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, GIJOE_Skin_Color: { file: "gijoe-skin-color.png", frames: 1, w: 64, h: 64, x: -32, y: -32 }, Devil_Skin_Color: { file: "devil-skin-color.png", frames: 1, w: 64, h: 64, x: -32, y: -32 }, Devil_Body_Back: { file: "devil-body-back.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Devil_Body_Front: { file: "devil-body-front.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Devil_Body_Side: { file: "devil-body-side.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Devil_Body_Top: { file: "devil-body-top.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Bond_Body_Back: { file: "bond-body-back.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Bond_Body_Front: { file: "bond-body-front.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Bond_Body_Side: { file: "bond-body-side.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Bond_Body_Top: { file: "bond-body-top.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Bond_Skin_Color: { file: "bond-skin-color.png", frames: 1, w: 64, h: 64, x: -32, y: -32 }, Bambo_Skin_Color: { file: "bambo-skin-color.png", frames: 1, w: 64, h: 64, x: -32, y: -32 }, Bambo_Body_Back: { file: "bambo-body-back.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Bambo_Body_Front: { file: "bambo-body-front.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Bambo_Body_Side: { file: "bambo-body-side.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Bambo_Body_Top: { file: "bambo-body-top.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Bambo_Head_Back: { file: "bambo-head-back.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Bambo_Head_Front: { file: "bambo-head-front.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Bambo_Head_Side: { file: "bambo-head-side.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Body_Back_MC: { file: "body-back-mc.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Body_Front_MC: { file: "body-front-mc.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Body_Side_MC: { file: "body-side-mc.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Body_Top_MC: { file: "body-top-mc.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Head_Back_MC: { file: "head-back-mc.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Head_Front_MC: { file: "head-front-mc.png", frames: 1, w: 64, h: 64, x: 0, y: 0 }, Head_Side_MC: { file: "head-side-mc.png", frames: 1, w: 64, h: 64, x: 0, y: 0 } }, audio: { "Creature.HitFloor.wav": "creature-hitfloor.mp3", "Creature.Player.Scream.1.wav": "creature-player-scream-1.mp3", "Creature.Player.Scream.2.wav": "creature-player-scream-2.mp3", "Creature.Zombie.Ambience.1.wav": "creature-zombie-ambience-1.mp3", "Creature.Zombie.Ambience.2.wav": "creature-zombie-ambience-2.mp3", "Creature.Zombie.Ambience.3.wav": "creature-zombie-ambience-3.mp3", "Creature.Zombie.Ambience.4.wav": "creature-zombie-ambience-4.mp3", "Creature.Zombie.Attack.wav": "creature-zombie-attack.mp3", "Creature.Zombie.Hit.wav": "creature-zombie-hit.mp3", "Effect.Explosion.wav": "effect-explosion.mp3", "Object.Barrel.Place.wav": "object-barrel-place.mp3", "Object.Mine.Detonate.wav": "object-mine-detonate.mp3", "Object.Pickup.wav": "object-pickup.mp3", "Shot.Grenade.Bounce.wav": "shot-grenade-bounce.mp3", "Shot.HitWall.1.wav": "shot-hitwall-1.mp3", "Shot.HitWall.2.wav": "shot-hitwall-2.mp3", "Shot.HitWall.3.wav": "shot-hitwall-3.mp3", "Shot.Rocket.Fire.wav": "shot-rocket-fire.mp3", "Weapon.Mine.Place.wav": "weapon-mine-place.mp3", "Weapon.Pistol.Fire.wav": "weapon-pistol-fire.mp3", "Weapon.Railgun.Fire.wav": "weapon-railgun-fire.mp3", "Weapon.Rocket.Fire.wav": "weapon-rocket-fire.mp3", "Weapon.ShotGun.Fire.wav": "weapon-shotgun-fire.mp3", "Weapon.UZI.Fire.wav": "weapon-uzi-fire.mp3", "World.End.wav": "world-end.mp3", "CLICK.wav": "click.mp3" }, upgrades: [{ mClassID: "CThing_Weapon_Pistol", mProp: "FastFire", mValue: true, mName: "\u624B\u67AA+:\u901F\u5C04", threshold: 3 }, { mClassID: "CThing_Creature_Player", mProp: "NW_uzi", mValue: "uzi", mName: "\u65B0\u6B66\u5668:\u51B2\u950B\u67AA(2\u952E)", threshold: 5 }, { mClassID: "CThing_Weapon_Pistol", mProp: "DoubleDamage", mValue: true, mName: "\u624B\u67AA+:\u53CC\u500D\u4F24\u5BB3", threshold: 8 }, { mClassID: "CThing_Creature_Player", mProp: "NW_shotgun", mValue: "shotgun", mName: "\u65B0\u6B66\u5668:\u6563\u5F39\u67AA(3\u952E)", threshold: 10 }, { mClassID: "CThing_Weapon_UZI", mProp: "RapidFire", mValue: true, mName: "\u51B2\u950B\u67AA+:\u901F\u5C04", threshold: 13 }, { mClassID: "CThing_Creature_Player", mProp: "NW_barrel", mValue: "barrel", mName: "\u65B0\u6B66\u5668:\u6CB9\u6876(4\u952E)", threshold: 15 }, { mClassID: "CThing_Weapon_UZI", mProp: "DoubleAmmo", mValue: true, mName: "\u51B2\u950B\u67AA+:\u53CC\u500D\u5F39\u836F", threshold: 17 }, { mClassID: "CThing_Weapon_Shotgun", mProp: "FastFire", mValue: true, mName: "\u6563\u5F39\u67AA+:\u901F\u5C04", threshold: 18 }, { mClassID: "CThing_Creature_Player", mProp: "NW_grenade", mValue: "grenade", mName: "\u65B0\u6B66\u5668:\u624B\u96F7(5\u952E)", threshold: 20 }, { mClassID: "CThing_Weapon_Shotgun", mProp: "DoubleAmmo", mValue: true, mName: "\u6563\u5F39\u67AA+:\u53CC\u500D\u5F39\u836F", threshold: 21 }, { mClassID: "CThing_Weapon_UZI", mProp: "LongShot", mValue: true, mName: "\u51B2\u950B\u67AA+:\u5C04\u7A0B", threshold: 23 }, { mClassID: "CThing_Weapon_Barrel", mProp: "DoubleAmmo", mValue: true, mName: "\u6CB9\u6876+:\u53CC\u500D\u5F39\u836F", threshold: 26 }, { mClassID: "CThing_Creature_Player", mProp: "NW_fakewall", mValue: "fakewall", mName: "\u65B0\u6B66\u5668:\u5047\u5899(6\u952E)", threshold: 30 }, { mClassID: "CThing_Weapon_Shotgun", mProp: "WideShot", mValue: true, mName: "\u6563\u5F39\u67AA+:\u6563\u5C04", threshold: 31 }, { mClassID: "CThing_Object_Barrel", mProp: "BigBang", mValue: true, mName: "\u6CB9\u6876+:\u7206\u70B8", threshold: 32 }, { mClassID: "CThing_Weapon_Grenade", mProp: "ClusterExplode", mValue: true, mName: "\u624B\u96F7+:\u96C6\u675F\u7206\u70B8", threshold: 33 }, { mClassID: "CThing_Weapon_Shotgun", mProp: "LongShot", mValue: true, mName: "\u6563\u5F39\u67AA+:\u5C04\u7A0B", threshold: 35 }, { mClassID: "CThing_Weapon_Barrel", mProp: "QuadAmmo", mValue: true, mName: "\u6CB9\u6876+:\u56DB\u500D\u5F39\u836F", threshold: 36 }, { mClassID: "CThing_Weapon_FakeWall", mProp: "DoubleAmmo", mValue: true, mName: "\u5047\u5899+:\u53CC\u500D\u5F39\u836F", threshold: 37 }, { mClassID: "CThing_Weapon_UZI", mProp: "QuadAmmo", mValue: true, mName: "\u51B2\u950B\u67AA+:\u56DB\u500D\u5F39\u836F", threshold: 39 }, { mClassID: "CThing_Creature_Player", mProp: "NW_mine", mValue: "mine", mName: "\u65B0\u6B66\u5668:\u5730\u96F7(7\u952E)", threshold: 40 }, { mClassID: "CThing_Weapon_Shotgun", mProp: "QuadAmmo", mValue: true, mName: "\u6563\u5F39\u67AA+:\u56DB\u500D\u5F39\u836F", threshold: 41 }, { mClassID: "CThing_Weapon_Grenade", mProp: "DoubleAmmo", mValue: true, mName: "\u624B\u96F7+:\u53CC\u500D\u5F39\u836F", threshold: 42 }, { mClassID: "CThing_Weapon_Shotgun", mProp: "RapidFire", mValue: true, mName: "\u6563\u5F39\u67AA+:\u901F\u5C04", threshold: 43 }, { mClassID: "CThing_Object_Barrel", mProp: "BiggerBang", mValue: true, mName: "\u6CB9\u6876+:\u5927\u7206\u70B8", threshold: 44 }, { mClassID: "CThing_Weapon_Grenade", mProp: "BigBang", mValue: true, mName: "\u624B\u96F7+:\u7206\u70B8", threshold: 45 }, { mClassID: "CThing_Object_Mine", mProp: "ClusterExplode", mValue: true, mName: "\u5730\u96F7+:\u96C6\u675F\u7206\u70B8", threshold: 47 }, { mClassID: "CThing_Weapon_UZI", mProp: "DoubleDamage", mValue: true, mName: "\u51B2\u950B\u67AA+:\u53CC\u500D\u4F24\u5BB3", threshold: 48 }, { mClassID: "CThing_Creature_Player", mProp: "NW_rocket", mValue: "rocket", mName: "\u65B0\u6B66\u5668:\u706B\u7BAD\u70AE(8\u952E)", threshold: 50 }, { mClassID: "CThing_Weapon_Shotgun", mProp: "WiderShot", mValue: true, mName: "\u6563\u5F39\u67AA+:\u6563\u5C04", threshold: 51 }, { mClassID: "CThing_Weapon_Grenade", mProp: "QuadAmmo", mValue: true, mName: "\u624B\u96F7+:\u56DB\u500D\u5F39\u836F", threshold: 52 }, { mClassID: "CThing_Weapon_FakeWall", mProp: "QuadAmmo", mValue: true, mName: "\u5047\u5899+:\u56DB\u500D\u5F39\u836F", threshold: 53 }, { mClassID: "CThing_Weapon_Mine", mProp: "DoubleAmmo", mValue: true, mName: "\u5730\u96F7+:\u53CC\u500D\u5F39\u836F", threshold: 54 }, { mClassID: "CThing_Creature_Player", mProp: "NW_chargepack", mValue: "chargepack", mName: "\u65B0\u6B66\u5668:\u5B9A\u65F6\u70B8\u5F39(9\u952E)", threshold: 55 }, { mClassID: "CThing_Weapon_Shotgun", mProp: "DoubleDamage", mValue: true, mName: "\u6563\u5F39\u67AA+:\u53CC\u500D\u4F24\u5BB3", threshold: 56 }, { mClassID: "CThing_Weapon_Grenade", mProp: "BiggerBang", mValue: true, mName: "\u624B\u96F7+:\u5927\u7206\u70B8", threshold: 57 }, { mClassID: "CThing_Object_Mine", mProp: "BigBang", mValue: true, mName: "\u5730\u96F7+:\u7206\u70B8", threshold: 58 }, { mClassID: "CThing_Weapon_Rocket", mProp: "FastFire", mValue: true, mName: "\u706B\u7BAD\u70AE+:\u901F\u5C04", threshold: 59 }, { mClassID: "CThing_Weapon_UZI", mProp: "InfinateRange", mValue: true, mName: "\u51B2\u950B\u67AA+:\u65E0\u9650\u5C04\u7A0B", threshold: 61 }, { mClassID: "CThing_Object_Mine", mProp: "BiggerBang", mValue: true, mName: "\u5730\u96F7+:\u5927\u7206\u70B8", threshold: 62 }, { mClassID: "CThing_Object_ChargePack", mProp: "ClusterExplode", mValue: true, mName: "\u5B9A\u65F6\u70B8\u5F39+:\u96C6\u675F\u7206\u70B8", threshold: 63 }, { mClassID: "CThing_Weapon_Mine", mProp: "QuadAmmo", mValue: true, mName: "\u5730\u96F7+:\u56DB\u500D\u5F39\u836F", threshold: 64 }, { mClassID: "CThing_Weapon_Rocket", mProp: "DoubleAmmo", mValue: true, mName: "\u706B\u7BAD\u70AE+:\u53CC\u500D\u5F39\u836F", threshold: 66 }, { mClassID: "CThing_Weapon_ChargePack", mProp: "DoubleAmmo", mValue: true, mName: "\u5B9A\u65F6\u70B8\u5F39+:\u53CC\u500D\u5F39\u836F", threshold: 68 }, { mClassID: "CThing_Creature_Player", mProp: "NW_railgun", mValue: "railgun", mName: "\u65B0\u6B66\u5668:\u8F68\u9053\u70AE(0\u952E)", threshold: 70 }, { mClassID: "CThing_Weapon_Rocket", mProp: "BigBang", mValue: true, mName: "\u706B\u7BAD\u70AE+:\u7206\u70B8", threshold: 72 }, { mClassID: "CThing_Object_ChargePack", mProp: "BigBang", mValue: true, mName: "\u5B9A\u65F6\u70B8\u5F39+:\u7206\u70B8", threshold: 74 }, { mClassID: "CThing_Weapon_ChargePack", mProp: "QuadAmmo", mValue: true, mName: "\u5B9A\u65F6\u70B8\u5F39+:\u56DB\u500D\u5F39\u836F", threshold: 76 }, { mClassID: "CThing_Weapon_Railgun", mProp: "FastFire", mValue: true, mName: "\u8F68\u9053\u70AE+:\u901F\u5C04", threshold: 78 }, { mClassID: "CThing_Weapon_Railgun", mProp: "DoubleAmmo", mValue: true, mName: "\u8F68\u9053\u70AE+:\u53CC\u500D\u5F39\u836F", threshold: 80 }, { mClassID: "CThing_Weapon_Rocket", mProp: "QuadAmmo", mValue: true, mName: "\u706B\u7BAD\u70AE+:\u56DB\u500D\u5F39\u836F", threshold: 85 }, { mClassID: "CThing_Weapon_UZI", mProp: "QuadDamage", mValue: true, mName: "\u51B2\u950B\u67AA+:\u56DB\u500D\u4F24\u5BB3", threshold: 90 }, { mClassID: "CThing_Object_ChargePack", mProp: "BiggerBang", mValue: true, mName: "\u5B9A\u65F6\u70B8\u5F39+:\u5927\u7206\u70B8", threshold: 95 }, { mClassID: "CThing_Weapon_Railgun", mProp: "RapidFire", mValue: true, mName: "\u8F68\u9053\u70AE+:\u901F\u5C04", threshold: 100 }, { mClassID: "CThing_Weapon_Rocket", mProp: "BiggerBang", mValue: true, mName: "\u706B\u7BAD\u70AE+:\u5927\u7206\u70B8", threshold: 105 }, { mClassID: "CThing_Weapon_Railgun", mProp: "QuadAmmo", mValue: true, mName: "\u8F68\u9053\u70AE+:\u56DB\u500D\u5F39\u836F", threshold: 110 }, { mClassID: "CThing_Weapon_Rocket", mProp: "RapidFire", mValue: true, mName: "\u706B\u7BAD\u70AE+:\u901F\u5C04", threshold: 120 }, { mClassID: "CThing_Weapon_Railgun", mProp: "LongShot", mValue: true, mName: "\u8F68\u9053\u70AE+:\u5C04\u7A0B", threshold: 125 }] };

  // src/expanded/types.ts
  var EMPTY_INPUT = { seq: 0, left: false, right: false, up: false, down: false, attack: 0, alt: 0 };
  function validInput3(value) {
    if (!value || typeof value !== "object") return false;
    const input = value;
    return [input.seq, input.attack, input.alt].every((n) => Number.isSafeInteger(n) && n >= 0 && n < 1e9) && [input.left, input.right, input.up, input.down].every((n) => typeof n === "boolean") && (input.weapon === void 0 || Number.isInteger(input.weapon) && input.weapon >= 0 && input.weapon < 10) && (input.weaponStep === void 0 || input.weaponStep === -1 || input.weaponStep === 1) && (input.trigger === void 0 || typeof input.trigger === "boolean") && (input.cancelledAttack === void 0 || Number.isSafeInteger(input.cancelledAttack) && input.cancelledAttack >= 0 && input.cancelledAttack < 1e9);
  }

  // src/expanded/boxhead-world.ts
  var WIDTH4 = 1280;
  var HEIGHT4 = 800;
  var HUD = 84;
  var CELL2 = 32;
  var MAPS2 = boxhead_data_default.maps;
  var CHARACTERS = ["swat", "bond", "gijoe", "bambo"];
  var WEAPONS3 = [
    { id: "pistol", name: "\u624B\u67AA", classId: "Pistol", rate: 8, damage: 26, ammo: -1, range: 8, pose: "handgun", sound: "Pistol" },
    { id: "uzi", name: "UZI", classId: "UZI", rate: 4, damage: 35, ammo: 100, range: 8, pose: "uzi", sound: "UZI" },
    { id: "shotgun", name: "\u9730\u5F39\u67AA", classId: "Shotgun", rate: 12, damage: 51, ammo: 20, range: 7, pose: "shotgun", sound: "ShotGun" },
    { id: "barrel", name: "\u6CB9\u6876", classId: "Barrel", rate: 1, damage: 150, ammo: 10, range: 1, pose: "", sound: "" },
    { id: "grenade", name: "\u624B\u96F7", classId: "Grenade", rate: 12, damage: 150, ammo: 20, range: 6, pose: "", sound: "" },
    { id: "fakewall", name: "\u5047\u5899", classId: "FakeWall", rate: 1, damage: 100, ammo: 5, range: 1, pose: "", sound: "" },
    { id: "mine", name: "\u5730\u96F7", classId: "Mine", rate: 1, damage: 100, ammo: 10, range: 1, pose: "", sound: "" },
    { id: "rocket", name: "\u706B\u7BAD\u70AE", classId: "Rocket", rate: 12, damage: 250, ammo: 20, range: 100, pose: "rocketlauncher", sound: "Rocket" },
    { id: "chargepack", name: "\u9065\u63A7\u70B8\u836F", classId: "ChargePack", rate: 1, damage: 150, ammo: 10, range: 1, pose: "", sound: "" },
    { id: "railgun", name: "\u8F68\u9053\u70AE", classId: "Railgun", rate: 5, damage: 100, ammo: 15, range: 10, pose: "railgun", sound: "Railgun" }
  ];
  function room(s) {
    return MAPS2.find((m) => m.id === s.mapId) || MAPS2[0];
  }
  function solid(map, x, y) {
    return map.collision[Math.floor(y / CELL2)]?.[Math.floor(x / CELL2)] !== "0";
  }
  function blocked(s, x, y, radius = 11, ignore) {
    const map = room(s);
    for (const dx of [-radius, radius]) for (const dy of [-radius, radius]) if (solid(map, x + dx, y + dy)) return true;
    return s.barrels.some((b) => b !== ignore && b.hp > 0 && (b.kind === "barrel" || b.kind === "wall") && Math.abs(b.x - x) < radius + 14 && Math.abs(b.y - y) < radius + 14);
  }
  function move(s, p, dx, dy, radius = 11) {
    if (!blocked(s, p.x + dx, p.y, radius, p)) p.x += dx;
    if (!blocked(s, p.x, p.y + dy, radius, p)) p.y += dy;
  }
  function openPosition(s, x, y, used = []) {
    const map = room(s), candidates = [];
    for (let row = 1; row < map.rows - 1; row++) for (let col = 1; col < map.columns - 1; col++) {
      const px = col * CELL2 + 16, py = row * CELL2 + 16;
      if (!blocked(s, px, py) && !used.some((p) => Math.hypot(p.x - px, p.y - py) < 30)) candidates.push({ x: px, y: py, d: Math.hypot(px - x, py - y) });
    }
    candidates.sort((a, b) => a.d - b.d);
    return candidates[0] || { x: 48, y: 48 };
  }
  function lineClear(s, x, y, tx, ty) {
    const length = Math.hypot(tx - x, ty - y), steps = Math.ceil(length / 8), map = room(s);
    for (let n = 1; n <= steps; n++) if (solid(map, x + (tx - x) * n / steps, y + (ty - y) * n / steps)) return false;
    return true;
  }
  function camera(s, width = WIDTH4, height = HEIGHT4) {
    const map = room(s), alive = s.players.filter((p) => p.alive), areaH = height - HUD;
    const xs = alive.map((p) => p.x), ys = alive.map((p) => p.y);
    const minX = xs.length ? Math.min(...xs) : map.width / 2, maxX = xs.length ? Math.max(...xs) : minX;
    const minY = ys.length ? Math.min(...ys) : map.height / 2, maxY = ys.length ? Math.max(...ys) : minY;
    const scale = Math.min(width / Math.min(map.width, 1152), areaH / Math.min(map.height, 720), width / (maxX - minX + 240), areaH / (maxY - minY + 240));
    const viewW = width / scale, viewH = areaH / scale;
    const cx = viewW >= map.width ? map.width / 2 : Math.max(viewW / 2, Math.min(map.width - viewW / 2, (minX + maxX) / 2));
    const cy = viewH >= map.height ? map.height / 2 : Math.max(viewH / 2, Math.min(map.height - viewH / 2, (minY + maxY) / 2));
    return { scale, x: width / 2 - cx * scale, y: HUD + areaH / 2 - cy * scale, visibleWidth: viewW, visibleHeight: viewH };
  }
  function weaponStats(s, index3) {
    const base2 = WEAPONS3[index3], props = {};
    for (const u of boxhead_data_default.upgrades) if (u.threshold <= s.peakCombo && (u.mClassID === "CThing_Weapon_" + base2.classId || u.mClassID === "CThing_Object_" + base2.classId)) props[u.mProp] = true;
    return {
      ...base2,
      damage: base2.damage * (props.FatalDamage ? 10 : props.QuadDamage ? 4 : props.DoubleDamage ? 2 : 1),
      auto: base2.id === "uzi" || !!props.FastFire || !!props.RapidFire,
      onRelease: base2.id === "grenade",
      rate: props.RapidFire ? Math.max(2, Math.round(base2.rate / 4)) : base2.rate,
      ammo: props.InfinateAmmo ? -1 : base2.ammo * (props.QuadAmmo ? 4 : props.DoubleAmmo ? 2 : 1),
      range: props.InfinateRange ? 100 : base2.range * (props.LongShot ? 1.5 : 1),
      spread: props.WiderShot ? 2 : props.WideShot ? 1 : 0,
      bang: props.BiggerBang ? 2 : props.BigBang ? 1 : 0,
      cluster: !!props.ClusterExplode
    };
  }

  // src/expanded/boxhead-core.ts
  var ID = "50737-server";
  function random3(s) {
    s.rng = Math.imul(s.rng, 1664525) + 1013904223 >>> 0;
    return s.rng / 4294967296;
  }
  function sound2(s, name) {
    s.sounds.push({ id: ++s.soundId, tick: s.tick, name });
  }
  function effect(s, kind, x, y, life = 12, extra = {}) {
    s.effects.push({ id: ++s.nextId, kind, x, y, life, total: life, ...extra });
  }
  function accept(s, p, candidate) {
    const at = p.seat - 1, current = s.inputs[at];
    let next;
    if (!validInput3(candidate)) next = { ...current, left: false, right: false, up: false, down: false, trigger: false };
    else if (candidate.seq < current.seq) next = current;
    else if (candidate.seq === current.seq) next = { ...current, left: current.left && candidate.left, right: current.right && candidate.right, up: current.up && candidate.up, down: current.down && candidate.down, trigger: current.trigger === true && candidate.trigger === true };
    else next = { ...candidate, attack: Math.max(candidate.attack, current.attack, p.lastAttack), alt: Math.max(candidate.alt, current.alt, p.lastAlt) };
    s.inputs[at] = { ...next };
    return next;
  }
  function create3(round, playing2, seats, seed, mapId) {
    const map = MAPS2.find((m) => m.id === mapId) || MAPS2[0];
    const s = {
      gameId: ID,
      round,
      tick: 0,
      phase: playing2 ? "playing" : "waiting",
      winner: null,
      ack: [0, 0, 0, 0],
      inputs: Array.from({ length: 4 }, () => ({ ...EMPTY_INPUT })),
      rng: seed >>> 0,
      mapId: map.id,
      players: [],
      zombies: [],
      bullets: [],
      barrels: [],
      pickups: [],
      effects: [],
      corpses: [],
      sounds: [],
      soundId: 0,
      wave: 0,
      spawnLeft: 0,
      devilLeft: 0,
      nextSpawn: 0,
      nextDevil: 0,
      waveReady: 1,
      nextId: 0,
      score: 0,
      combo: 1,
      peakCombo: 1,
      comboUntil: 75,
      message: "",
      messageUntil: 0
    };
    for (const b of map.barrels) s.barrels.push({ id: ++s.nextId, ...b, kind: "barrel", hp: 60, owner: 0, exploded: false, armed: 0 });
    for (const b of map.walls) s.barrels.push({ id: ++s.nextId, ...b, kind: "wall", hp: 100, owner: 0, exploded: false, armed: 0 });
    for (const b of map.pickups) s.pickups.push({ id: ++s.nextId, ...b, life: 250 });
    const primary = map.playerSpawns[0] || { x: map.width / 2, y: map.height / 2, dir: 0 };
    const spawns = [primary, ...map.otherSpawns].sort((a, b) => Math.hypot(a.x - primary.x, a.y - primary.y) - Math.hypot(b.x - primary.x, b.y - primary.y));
    for (const seat of [...new Set(seats)].filter((n) => Number.isInteger(n) && n >= 1 && n <= 4).sort()) {
      const spawn = spawns[s.players.length] || primary, pos = openPosition(s, spawn.x, spawn.y, s.players);
      s.players.push({
        seat,
        x: pos.x,
        y: pos.y,
        dir: spawn.dir,
        character: CHARACTERS[seat - 1],
        hp: 200,
        alive: true,
        lives: 1,
        respawn: 0,
        kills: 0,
        deaths: 0,
        killedBy: 0,
        weapon: 0,
        unlocked: [true, ...Array(9).fill(false)],
        inventory: WEAPONS3.map((w, i) => i === 0 ? w.ammo : 0),
        ammo: -1,
        cooldown: 0,
        invul: 200,
        lastAttack: 0,
        lastAlt: 0,
        moving: false,
        fireAt: -99,
        hitAt: -99,
        deadAt: 0,
        triggerDown: false,
        triggerAt: 0
      });
    }
    return s;
  }
  function beginWave(s) {
    s.wave++;
    s.spawnLeft = 10 + 5 * (s.wave - 1);
    s.devilLeft = s.wave === 1 ? 0 : Math.floor(1 + (s.wave - 2) * 0.25);
    s.nextSpawn = s.tick + 15;
    s.nextDevil = s.tick + 100;
    s.waveReady = 0;
    s.message = `\u7B2C ${s.wave} \u6CE2`;
    s.messageUntil = s.tick + 65;
    if (s.wave > 1) sound2(s, "World.End.wav");
  }
  function spawnEnemy(s, devil) {
    const map = room(s), locations = devil ? map.devilSpawns : map.zombieSpawns;
    const marker = locations[Math.floor(random3(s) * locations.length)] || map.zombieSpawns[0] || { x: 48, y: 48 };
    const pos = openPosition(s, marker.x, marker.y);
    s.zombies.push({ id: ++s.nextId, x: pos.x, y: pos.y, hp: devil ? 1e3 : 100, devil, attack: 0, dir: 0, owner: 0, hitAt: -99, attackAt: -99 });
  }
  function damage(s, target, amount, owner) {
    if (target.hp <= 0) return;
    target.hp -= amount;
    target.owner = owner;
    target.hitAt = s.tick;
    if ("devil" in target) effect(s, "Effect.BloodSplat", target.x, target.y - 14, 8);
  }
  function hurt(s, p, amount, owner = 0) {
    if (!p.alive || p.hp <= 0 || p.invul > 0) return;
    p.hp -= amount;
    p.hitAt = s.tick;
    p.killedBy = owner > 0 ? owner : 0;
  }
  function explode(s, x, y, amount, owner, bang = 0, cluster = false) {
    const radius = (2 + Math.max(amount - 100, 0) * 5e-3) * 32;
    effect(s, "Effect.Explosion", x, y, 10, { scale: 1 + bang * 0.3 });
    effect(s, "Effect.ScorchMark", x, y, 500);
    sound2(s, "Effect.Explosion.wav");
    const area = radius + bang * 22;
    const amountAt = (target) => {
      const fraction = Math.hypot(target.x - x, target.y - y) / area;
      return fraction > 1 ? 0 : amount * (fraction > 0.75 ? 0.5 : fraction > 0.5 ? 0.75 : 1);
    };
    for (const z of s.zombies) if (amountAt(z)) damage(s, z, amountAt(z), owner);
    for (const b of s.barrels) if (b.hp > 0 && amountAt(b)) damage(s, b, amountAt(b), owner);
    for (const p of s.players) if (amountAt(p)) hurt(s, p, amountAt(p), owner);
    if (cluster) for (let i = 0; i < 4; i++) {
      const dir = i * Math.PI / 2 + random3(s) * 0.2;
      s.bullets.push({ id: ++s.nextId, x, y, z: 20, vz: 5, vx: Math.cos(dir) * 9, vy: Math.sin(dir) * 9, owner, weapon: 4, damage: amount, life: 15, bang: 0, cluster: false });
    }
  }
  function shot(s, p, angle, amount, range, pierce) {
    let x = p.x, y = p.y;
    const hits = /* @__PURE__ */ new Set(), dx = Math.cos(angle) * 4, dy = Math.sin(angle) * 4;
    for (let n = 0; n < range * CELL2 / 4; n++) {
      x += dx;
      y += dy;
      if (solid(room(s), x, y)) {
        effect(s, "Effect.BulletHit", x, y - 18, 5);
        break;
      }
      const target = [...s.barrels.filter((b) => b.kind === "barrel" || b.kind === "wall"), ...s.zombies, ...s.players.filter((q) => q.seat !== p.seat && q.alive)].find((t) => t.hp > 0 && !hits.has(t) && Math.hypot(t.x - x, t.y - y) < 15);
      if (target) {
        if (target.seat) hurt(s, target, amount, p.seat);
        else damage(s, target, amount, p.seat);
        hits.add(target);
        if (!pierce || target.kind === "wall") break;
      }
    }
    s.bullets.push({ id: ++s.nextId, x: p.x, y: p.y, tx: x, ty: y, vx: 0, vy: 0, owner: p.seat, weapon: p.weapon, damage: amount, life: 2 });
  }
  function fire2(s, p) {
    const gun = weaponStats(s, p.weapon);
    if (gun.id === "chargepack") {
      const packs = s.barrels.filter((b) => b.kind === "chargepack" && b.owner === p.seat && b.hp > 0);
      if (packs.length) {
        for (const b of packs) b.hp = 0;
        p.cooldown = 6;
        return;
      }
    }
    if (p.inventory[p.weapon] === 0) {
      p.weapon = 0;
      p.ammo = -1;
      return;
    }
    if (["barrel", "fakewall", "mine", "chargepack"].includes(gun.id)) {
      const x = Math.floor((p.x + Math.cos(p.dir) * 34) / CELL2) * CELL2 + 16, y = Math.floor((p.y + Math.sin(p.dir) * 34) / CELL2) * CELL2 + 16;
      if (blocked(s, x, y, 12) || s.players.some((q) => q.alive && Math.hypot(q.x - x, q.y - y) < 24) || s.barrels.some((b) => b.hp > 0 && Math.hypot(b.x - x, b.y - y) < 22)) return;
      s.barrels.push({ id: ++s.nextId, x, y, kind: gun.id === "fakewall" ? "wall" : gun.id, hp: gun.id === "fakewall" ? 100 : 60, owner: p.seat, exploded: false, armed: s.tick, detonateAt: 0 });
      sound2(s, gun.id === "mine" ? "Weapon.Mine.Place.wav" : "Object.Barrel.Place.wav");
    } else if (gun.id === "grenade" || gun.id === "rocket") {
      const speed = gun.id === "grenade" ? Math.min(0.75, Math.max(0.25, (s.tick - p.triggerAt) / 25)) * 32 : 16;
      s.bullets.push({ id: ++s.nextId, x: p.x + Math.cos(p.dir) * 20, y: p.y + Math.sin(p.dir) * 20, z: gun.id === "grenade" ? 40 : 18, vz: 8, vx: Math.cos(p.dir) * speed, vy: Math.sin(p.dir) * speed, owner: p.seat, weapon: p.weapon, damage: gun.damage, life: gun.id === "grenade" ? 60 : 100, bang: gun.bang, cluster: gun.cluster });
    } else {
      const count = gun.id === "shotgun" ? gun.spread ? 5 : 3 : 1, spacing = 1.25 * (gun.spread + 1) * Math.PI / 180;
      for (let i = 0; i < count; i++) shot(s, p, p.dir + (i - (count - 1) / 2) * spacing + (gun.id === "uzi" ? (random3(s) - 0.5) * 0.06 : 0), gun.damage, gun.range, gun.id === "railgun");
    }
    if (p.inventory[p.weapon] > 0) p.inventory[p.weapon]--;
    p.ammo = p.inventory[p.weapon];
    p.cooldown = gun.rate;
    p.fireAt = s.tick;
    if (p.ammo === 0 && gun.id !== "chargepack") {
      p.weapon = 0;
      p.ammo = -1;
    }
    if (gun.sound) sound2(s, "Weapon." + gun.sound + ".Fire.wav");
  }
  function upgrade(s) {
    if (s.combo <= s.peakCombo) return;
    const before = s.peakCombo;
    s.peakCombo = s.combo;
    for (const u of boxhead_data_default.upgrades.filter((u2) => u2.threshold > before && u2.threshold <= s.peakCombo)) {
      s.message = u.mName;
      s.messageUntil = s.tick + 90;
      if (u.mClassID === "CThing_Creature_Player") {
        const index3 = WEAPONS3.findIndex((w) => w.id === u.mValue);
        if (index3 >= 0) for (const p of s.players) {
          p.unlocked[index3] = true;
          if (p.alive) {
            p.inventory[index3] = weaponStats(s, index3).ammo;
            p.weapon = index3;
            p.ammo = p.inventory[index3];
          }
        }
      } else if (["DoubleAmmo", "QuadAmmo", "InfinateAmmo"].includes(u.mProp)) {
        const index3 = WEAPONS3.findIndex((w) => "CThing_Weapon_" + w.classId === u.mClassID);
        if (index3 >= 0) {
          for (const p of s.players) if (p.alive) {
            p.inventory[index3] = weaponStats(s, index3).ammo;
            p.ammo = p.inventory[p.weapon];
          }
        }
      }
    }
  }
  function navigation(s) {
    const map = room(s), distances = new Int32Array(map.columns * map.rows).fill(-1), queue = [];
    for (const p of s.players) if (p.alive) {
      const cell = Math.floor(p.y / CELL2) * map.columns + Math.floor(p.x / CELL2);
      if (distances[cell] === -1) {
        distances[cell] = 0;
        queue.push(cell);
      }
    }
    for (let at = 0; at < queue.length; at++) {
      const cell = queue[at], x = cell % map.columns, y = Math.floor(cell / map.columns);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy, index3 = ny * map.columns + nx;
        if (map.collision[ny]?.[nx] === "0" && distances[index3] === -1) {
          distances[index3] = distances[cell] + 1;
          queue.push(index3);
        }
      }
    }
    return distances;
  }
  function enemies(s) {
    const map = room(s), field = navigation(s);
    for (const z of s.zombies) {
      if (z.hp <= 0) continue;
      const p = s.players.filter((p2) => p2.alive).sort((a, b) => Math.hypot(a.x - z.x, a.y - z.y) - Math.hypot(b.x - z.x, b.y - z.y))[0];
      if (!p) continue;
      const distance = Math.hypot(p.x - z.x, p.y - z.y), visible = lineClear(s, z.x, z.y, p.x, p.y);
      let tx = p.x, ty = p.y;
      if (!visible) {
        const cx = Math.floor(z.x / CELL2), cy = Math.floor(z.y / CELL2);
        let best = Infinity;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const x = cx + dx, y = cy + dy, d = field[y * map.columns + x];
          if (map.collision[y]?.[x] === "0" && d >= 0 && d < best) {
            best = d;
            tx = x * CELL2 + 16;
            ty = y * CELL2 + 16;
          }
        }
      }
      z.dir = Math.atan2(ty - z.y, tx - z.x);
      if (z.attack > 0) z.attack--;
      const blocker = s.barrels.find((b) => b.hp > 0 && ["barrel", "wall"].includes(b.kind) && Math.hypot(b.x - z.x, b.y - z.y) < 35);
      if (blocker && z.attack === 0) {
        damage(s, blocker, z.devil ? 100 : 50, 0);
        z.attack = 25;
        z.attackAt = s.tick;
      }
      if (distance < 34 && visible && z.attack === 0) {
        hurt(s, p, 50);
        z.attack = 25;
        z.attackAt = s.tick;
        sound2(s, "Creature.Zombie.Attack.wav");
      } else if (z.devil && visible && distance < 160 && z.attack === 0) {
        z.dir = Math.atan2(p.y - z.y, p.x - z.x);
        z.attack = 60;
        z.attackAt = s.tick;
        s.bullets.push({ id: ++s.nextId, x: z.x, y: z.y, z: 18, vx: Math.cos(z.dir) * 7, vy: Math.sin(z.dir) * 7, owner: -1, weapon: -1, damage: 50, life: 40 });
      } else if (distance > 27 && s.tick - z.attackAt > 8) {
        const speed = (z.devil ? 1.28 : 0.64) * Math.min(1 + s.wave * 0.1, 5);
        const length = Math.max(1, Math.hypot(tx - z.x, ty - z.y));
        move(s, z, (tx - z.x) / length * speed, (ty - z.y) / length * speed, 10);
      }
    }
  }
  function projectiles(s) {
    for (const b of s.bullets) {
      if (b.life <= 0) continue;
      if (b.tx !== void 0) {
        b.life--;
        continue;
      }
      if (b.weapon === 4) {
        b.vz -= 1.92;
        b.z += b.vz;
        if (b.z < 0) {
          b.z = 0;
          b.vz = Math.abs(b.vz) * 0.5;
          b.vx *= 0.5;
          b.vy *= 0.5;
        }
        if (blocked(s, b.x + b.vx, b.y, 3)) {
          b.vx *= -0.25;
          sound2(s, "Shot.Grenade.Bounce.wav");
        }
        if (blocked(s, b.x, b.y + b.vy, 3)) {
          b.vy *= -0.25;
          sound2(s, "Shot.Grenade.Bounce.wav");
        }
        b.x += b.vx;
        b.y += b.vy;
      } else {
        if (b.weapon === 7) {
          b.vx *= 1.1;
          b.vy *= 1.1;
          if (s.tick % 2 === 0) effect(s, "Effect.RocketSmoke", b.x, b.y - 16, 12, { scale: 0.25 });
        }
        const steps = Math.ceil(Math.hypot(b.vx, b.vy) / 5);
        for (let n = 0; n < steps; n++) {
          b.x += b.vx / steps;
          b.y += b.vy / steps;
          if (solid(room(s), b.x, b.y)) {
            b.life = 0;
            break;
          }
          if (b.owner < 0) {
            const p = s.players.find((p2) => p2.alive && Math.hypot(p2.x - b.x, p2.y - b.y) < 16);
            if (p) {
              hurt(s, p, b.damage);
              b.life = 0;
              break;
            }
          } else if (s.zombies.some((z) => z.hp > 0 && Math.hypot(z.x - b.x, z.y - b.y) < 17) || s.barrels.some((z) => z.hp > 0 && ["wall", "barrel"].includes(z.kind) && Math.hypot(z.x - b.x, z.y - b.y) < 17) || s.players.some((p) => p.alive && p.seat !== b.owner && Math.hypot(p.x - b.x, p.y - b.y) < 17)) {
            b.life = 0;
            break;
          }
        }
      }
      if (--b.life <= 0 && (b.weapon === 4 || b.weapon === 7)) explode(s, b.x, b.y, b.damage, b.owner, b.bang, b.cluster);
    }
    s.bullets = s.bullets.filter((b) => b.life > 0);
  }
  function step3(s, inputs) {
    if (s.phase !== "playing") return;
    s.tick++;
    s.effects = s.effects.filter((e) => --e.life > 0);
    s.corpses = s.corpses.filter((e) => s.tick - e.deadAt < 100);
    s.sounds = s.sounds.filter((e) => s.tick - e.tick < 10);
    if (s.combo > 1 && s.tick > s.comboUntil) {
      s.combo--;
      s.comboUntil = s.tick + Math.max(3, Math.round(Math.pow(101 - Math.min(s.combo, 100), 2.5) / 1e5 * 72 + 3));
    }
    for (const p of s.players) {
      const input = accept(s, p, inputs[p.seat - 1]);
      s.ack[p.seat - 1] = Math.max(s.ack[p.seat - 1], input.seq);
      const attack = input.attack > p.lastAttack, alt = input.alt > p.lastAlt;
      const wasDown = p.triggerDown;
      p.triggerDown = input.trigger === true;
      if (p.triggerDown && !wasDown) p.triggerAt = s.tick;
      p.lastAttack = Math.max(p.lastAttack, input.attack);
      p.lastAlt = Math.max(p.lastAlt, input.alt);
      p.cooldown = Math.max(0, p.cooldown - 1);
      p.invul = Math.max(0, p.invul - 1);
      if (!p.alive) {
        p.respawn = Math.max(0, p.respawn - 1);
        const other = s.players.find((q) => q.alive);
        if (!p.respawn && other) {
          const pos = openPosition(s, other.x + 32, other.y, s.players.filter((q) => q.alive));
          p.x = pos.x;
          p.y = pos.y;
          p.alive = true;
          p.hp = 200;
          p.weapon = 0;
          p.ammo = -1;
          p.invul = 125;
          p.inventory = WEAPONS3.map((_, i) => i === 0 ? -1 : 0);
        }
        continue;
      }
      const dx = Number(input.right) - Number(input.left), dy = Number(input.down) - Number(input.up);
      p.moving = !!(dx || dy);
      if (p.moving) {
        p.dir = Math.atan2(dy, dx);
        move(s, p, dx * 5.12, dy * 5.12);
      }
      if (p.hp > 0) p.hp = Math.min(200, p.hp + 200 / (25 * 30));
      if (alt) {
        if (input.weapon !== void 0) {
          if (p.unlocked[input.weapon] && p.inventory[input.weapon] !== 0) p.weapon = input.weapon;
        } else for (let i = 1; i <= 10; i++) {
          const index3 = (p.weapon + i * (input.weaponStep ?? 1) + 10) % 10;
          if (p.unlocked[index3] && p.inventory[index3] !== 0) {
            p.weapon = index3;
            break;
          }
        }
        p.ammo = p.inventory[p.weapon];
      }
      const gun = weaponStats(s, p.weapon);
      const wantsFire = input.trigger === void 0 ? attack : gun.auto ? p.triggerDown || attack : gun.onRelease ? !p.triggerDown && (wasDown || attack) : attack;
      if (wantsFire && p.cooldown === 0 && (input.cancelledAttack === void 0 || input.cancelledAttack < input.attack)) fire2(s, p);
    }
    if (s.waveReady && s.tick >= s.waveReady) beginWave(s);
    if (s.spawnLeft > 0 && s.tick >= s.nextSpawn && s.zombies.filter((z) => !z.devil && z.hp > 0).length < Math.min(10 + 5 * (s.wave - 1), 60)) {
      spawnEnemy(s, false);
      s.spawnLeft--;
      s.nextSpawn = s.tick + Math.max(25 - (s.wave - 1), 1);
    }
    if (s.devilLeft > 0 && s.tick >= s.nextDevil && s.zombies.filter((z) => z.devil && z.hp > 0).length < Math.min(1 + (s.wave - 2) * 0.3, 5)) {
      spawnEnemy(s, true);
      s.devilLeft--;
      s.nextDevil = s.tick + Math.max(250 - (s.wave - 1), 25);
    }
    projectiles(s);
    enemies(s);
    for (const b of s.barrels) if (b.kind === "mine" && b.hp > 0) {
      if (!b.detonateAt && s.tick >= b.armed && s.zombies.some((z) => z.hp > 0 && Math.hypot(z.x - b.x, z.y - b.y) < 27)) {
        b.detonateAt = s.tick + 50;
        sound2(s, "Object.Mine.Detonate.wav");
      }
      if (b.detonateAt && s.tick >= b.detonateAt) b.hp = 0;
    }
    let chain = true;
    while (chain) {
      chain = false;
      for (const b of s.barrels) if (b.hp <= 0 && !b.exploded) {
        b.exploded = true;
        chain = true;
        if (b.kind !== "wall") {
          const index3 = b.kind === "mine" ? 6 : b.kind === "chargepack" ? 8 : 3;
          const gun = weaponStats(s, index3);
          explode(s, b.x, b.y, gun.damage, b.owner, gun.bang, gun.cluster);
        }
      }
    }
    s.barrels = s.barrels.filter((b) => b.hp > 0);
    for (const z of s.zombies.filter((z2) => z2.hp <= 0)) {
      const p = s.players.find((p2) => p2.seat === z.owner);
      if (p) p.kills++;
      s.score += (z.devil ? 1e3 : 100) * s.combo;
      s.combo++;
      s.comboUntil = s.tick + Math.max(3, Math.round(Math.pow(101 - Math.min(s.combo, 100), 2.5) / 1e5 * 72 + 3));
      upgrade(s);
      s.corpses.push({ x: z.x, y: z.y, dir: z.dir, character: z.devil ? "devil" : "zombie", deadAt: s.tick });
      effect(s, "Effect.BloodPool", z.x, z.y, 500);
      if (random3(s) < 0.15) s.pickups.push({ id: ++s.nextId, x: z.x, y: z.y, life: 250 });
      sound2(s, "Creature.Zombie.Hit.wav");
    }
    s.zombies = s.zombies.filter((z) => z.hp > 0);
    for (const item of s.pickups) {
      for (const p of s.players) if (item.life > 0 && p.alive && Math.hypot(p.x - item.x, p.y - item.y) < 25) {
        const available = p.unlocked.map((v, i) => v && p.inventory[i] >= 0 && p.inventory[i] < weaponStats(s, i).ammo ? i : -1).filter((i) => i >= 0);
        if (p.hp >= 200 && !available.length) continue;
        if (p.hp < 200 && (!available.length || random3(s) < 1 - p.hp / 200)) p.hp = 200;
        else if (available.length) {
          const i = available[Math.floor(random3(s) * available.length)];
          p.inventory[i] = weaponStats(s, i).ammo;
          p.ammo = p.inventory[p.weapon];
        }
        item.life = 0;
        sound2(s, "Object.Pickup.wav");
      }
      item.life--;
    }
    s.pickups = s.pickups.filter((i) => i.life > 0);
    for (const p of s.players) if (p.alive && p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      p.deaths++;
      p.respawn = 125;
      p.deadAt = s.tick;
      p.weapon = 0;
      p.ammo = -1;
      p.inventory = WEAPONS3.map((_, i) => i === 0 ? -1 : 0);
      p.triggerDown = false;
      p.cooldown = 0;
      sound2(s, "Creature.Player.Scream.1.wav");
    }
    if (s.players.length && !s.players.some((p) => p.alive)) {
      s.phase = "finished";
      s.winner = 0;
      sound2(s, "World.End.wav");
    }
    if (s.spawnLeft === 0 && s.devilLeft === 0 && s.zombies.length === 0 && !s.waveReady) s.waveReady = s.tick + 65;
    s.effects = s.effects.slice(-180);
    s.sounds = s.sounds.slice(-40);
    s.corpses = s.corpses.slice(-60);
  }
  function nums(v, keys) {
    return !!v && keys.every((k) => Number.isFinite(v[k]));
  }
  function valid3(value) {
    if (!value || typeof value !== "object") return false;
    const s = value;
    return s.gameId === ID && Number.isSafeInteger(s.tick) && s.tick >= 0 && Number.isSafeInteger(s.round) && ["waiting", "playing", "finished"].includes(s.phase) && [null, 0].includes(s.winner) && MAPS2.some((m) => m.id === s.mapId) && Array.isArray(s.ack) && s.ack.length === 4 && s.ack.every((n) => Number.isSafeInteger(n) && n >= 0) && Array.isArray(s.inputs) && s.inputs.length === 4 && s.inputs.every(validInput3) && Array.isArray(s.players) && s.players.length <= 4 && new Set(s.players.map((p) => p?.seat)).size === s.players.length && s.players.every((p) => [1, 2, 3, 4].includes(p?.seat) && typeof p.alive === "boolean" && typeof p.triggerDown === "boolean" && CHARACTERS.includes(p.character) && nums(p, ["x", "y", "dir", "hp", "lives", "respawn", "kills", "deaths", "killedBy", "lastAttack", "lastAlt", "cooldown", "invul", "ammo", "fireAt", "hitAt", "deadAt", "triggerAt"]) && Number.isInteger(p.weapon) && p.weapon >= 0 && p.weapon < 10 && Array.isArray(p.inventory) && p.inventory.length === 10 && p.inventory.every((v) => Number.isSafeInteger(v) && v >= -1) && p.ammo === p.inventory[p.weapon] && Array.isArray(p.unlocked) && p.unlocked.length === 10 && p.unlocked.every((v) => typeof v === "boolean")) && ["zombies", "bullets", "barrels", "pickups", "effects", "corpses"].every((k) => Array.isArray(s[k]) && s[k].length < 1500 && s[k].every((e) => nums(e, ["x", "y"]))) && s.zombies.every((z) => nums(z, ["id", "hp", "dir", "attack", "owner", "hitAt", "attackAt"]) && typeof z.devil === "boolean") && s.bullets.every((b) => nums(b, ["id", "vx", "vy", "damage", "weapon", "owner", "life"])) && s.barrels.every((b) => nums(b, ["id", "hp", "owner", "armed"]) && ["barrel", "wall", "mine", "chargepack"].includes(b.kind) && typeof b.exploded === "boolean") && s.pickups.every((p) => nums(p, ["id", "life"])) && s.effects.every((e) => nums(e, ["life", "total"]) && typeof e.kind === "string") && s.corpses.every((e) => nums(e, ["dir", "deadAt"]) && ["zombie", "devil"].includes(e.character)) && Array.isArray(s.sounds) && s.sounds.length <= 40 && s.sounds.every((e) => nums(e, ["id", "tick"]) && Object.prototype.hasOwnProperty.call(boxhead_data_default.audio, e.name)) && nums(s, ["rng", "wave", "spawnLeft", "devilLeft", "nextSpawn", "nextDevil", "waveReady", "nextId", "score", "combo", "peakCombo", "comboUntil", "soundId", "messageUntil"]) && typeof s.message === "string";
  }

  // src/expanded/boxhead-view.ts
  var base = "/expanded/assets/boxhead/";
  var images2 = /* @__PURE__ */ new Map();
  var backdrop = null;
  function image(file) {
    let im = images2.get(file);
    if (!im) {
      im = new Image();
      im.src = base + file;
      images2.set(file, im);
    }
    return im;
  }
  function ready(im) {
    return im.complete && im.naturalWidth > 0;
  }
  function mapBitmap(id, layer, im, w, h) {
    if (!backdrop || backdrop.id !== id) backdrop = { id };
    if (!ready(im)) return null;
    if (!backdrop[layer]) {
      const bitmap = document.createElement("canvas");
      bitmap.width = w;
      bitmap.height = h;
      bitmap.getContext("2d").drawImage(im, 0, 0, w, h);
      backdrop[layer] = bitmap;
    }
    return backdrop[layer];
  }
  function sprite2(c, key, x, y, frame = 0, scale = 1, rotation = 0) {
    const meta = boxhead_data_default.objects[key];
    if (!meta) return;
    const im = image(meta.file);
    if (!ready(im)) return;
    c.save();
    c.translate(x, y);
    c.rotate(rotation);
    c.scale(scale, scale);
    c.drawImage(im, Math.min(meta.frames - 1, Math.max(0, Math.floor(frame))) * meta.w, 0, meta.w, meta.h, meta.x, meta.y, meta.w, meta.h);
    c.restore();
  }
  function person(c, character, action, p, tick, age) {
    const meta = boxhead_data_default.animations[character + "-" + action];
    if (!meta) return;
    const im = image(meta.file);
    if (!ready(im)) return;
    const direction2 = (Math.round(p.dir / (Math.PI * 2) * meta.directions) % meta.directions + meta.directions) % meta.directions;
    const frame = age === void 0 ? Math.floor(tick / (action.includes("walk") ? 3 : 2)) % meta.frames : Math.min(meta.frames - 1, Math.floor(age / 3));
    c.drawImage(im, frame * meta.w, direction2 * meta.h, meta.w, meta.h, p.x + meta.x, p.y + meta.y, meta.w * meta.scale, meta.h * meta.scale);
  }
  function health(c, p, seat) {
    c.fillStyle = "#171a17";
    c.fillRect(p.x - 19, p.y - 55, 38, 5);
    c.fillStyle = p.seat === seat ? "#74dd71" : "#53a94c";
    c.fillRect(p.x - 18, p.y - 54, 36 * Math.max(0, p.hp) / 200, 3);
    const text = WEAPONS3[p.weapon].name + (p.ammo >= 0 ? `:${p.ammo}` : "");
    c.save();
    c.font = "bold 10px sans-serif";
    c.textAlign = "center";
    c.lineWidth = 2;
    c.strokeStyle = "#18211b";
    c.strokeText(text, p.x, p.y - 63);
    c.fillStyle = "#ffefb8";
    c.fillText(text, p.x, p.y - 63);
    c.restore();
  }
  function render3(canvas, s, seat) {
    if (canvas.width !== WIDTH4) canvas.width = WIDTH4;
    if (canvas.height !== HEIGHT4) canvas.height = HEIGHT4;
    const c = canvas.getContext("2d");
    if (!c) return;
    c.fillStyle = "#2b302a";
    c.fillRect(0, 0, WIDTH4, HEIGHT4);
    if (!s) return;
    const map = room(s), cam = camera(s);
    c.save();
    c.beginPath();
    c.rect(0, HUD, WIDTH4, HEIGHT4 - HUD);
    c.clip();
    c.translate(cam.x, cam.y);
    c.scale(cam.scale, cam.scale);
    const floor = image(map.id + "-floor.svg"), cover = image(map.id + "-cover.svg");
    const floorBitmap = mapBitmap(map.id, "floor", floor, map.width, map.height), coverBitmap = mapBitmap(map.id, "cover", cover, map.width, map.height);
    if (floorBitmap) c.drawImage(floorBitmap, 0, 0, map.width, map.height);
    else {
      c.fillStyle = "#c6c5bd";
      c.fillRect(0, 0, map.width, map.height);
    }
    for (const e of s.effects) if (["Effect.BloodPool", "Effect.ScorchMark"].includes(e.kind)) {
      c.globalAlpha = Math.min(1, e.life / 60);
      sprite2(c, e.kind, e.x, e.y);
      c.globalAlpha = 1;
    }
    for (const corpse of s.corpses) {
      const age = s.tick - corpse.deadAt;
      person(c, corpse.character, age < 15 ? "dying" : "dead", corpse, s.tick, age);
    }
    for (const p of s.players.filter((p2) => !p2.alive)) person(c, p.character, s.tick - p.deadAt < 15 ? "dying" : "dead", p, s.tick, s.tick - p.deadAt);
    for (const p of s.pickups) if (p.life > 50 || s.tick % 6 < 3) sprite2(c, "Object.Pickup", p.x, p.y, s.tick / 3);
    const entities2 = [...s.barrels.map((b) => ({ ...b, entity: "object" })), ...s.zombies.map((z) => ({ ...z, entity: "enemy" })), ...s.players.filter((p) => p.alive).map((p) => ({ ...p, entity: "human" }))].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const p of entities2) {
      if (p.entity === "object") {
        sprite2(c, p.kind === "barrel" ? "Object.Barrel" : p.kind === "wall" ? "Object.Wall" : p.kind === "mine" ? "Object.Mine" : "Object.ChargePack", p.x, p.y, p.detonateAt ? s.tick % 2 : s.tick % 20 < 10 ? 0 : 1);
        continue;
      }
      if (p.entity === "human") {
        const gun = WEAPONS3[p.weapon], action = s.tick - p.hitAt < 5 ? "hitfront" : (gun.pose ? gun.pose + "-" : "") + (p.moving ? "walk" : "stand");
        c.globalAlpha = p.invul > 0 && s.tick % 4 < 2 ? 0.55 : 1;
        person(c, p.character, action, p, s.tick);
        c.globalAlpha = 1;
        if (s.tick - p.fireAt < 2 && gun.pose) {
          const muzzle = gun.id === "uzi" ? "UZI.MuzzleFlash" : gun.id === "shotgun" ? "Shotgun.MuzzleFlash" : gun.id === "railgun" ? "Railgun.MuzzleFlash" : "Pistol.MuzzleFlash";
          sprite2(c, muzzle, p.x + Math.cos(p.dir) * 24, p.y - 24 + Math.sin(p.dir) * 18, 0, 1, p.dir);
        }
      } else {
        const action = s.tick - p.hitAt < 5 ? "hitfront" : s.tick - p.attackAt < 12 ? "attack" : "walk";
        person(c, p.devil ? "devil" : "zombie", action, p, s.tick);
      }
    }
    for (const b of s.bullets) {
      if (b.tx !== void 0) {
        c.strokeStyle = b.weapon === 9 ? "#9f80ef" : "#f3f0cf";
        c.lineWidth = b.weapon === 9 ? 2 : 1;
        c.beginPath();
        c.moveTo(b.x, b.y - 23);
        c.lineTo(b.tx, b.ty - 23);
        c.stroke();
      } else if (b.owner < 0) sprite2(c, "Effect.FireBall", b.x, b.y - 18, 0, 1, Math.atan2(b.vy, b.vx));
      else sprite2(c, b.weapon === 4 ? "Shot.Grenade" : "Shot.Rocket", b.x, b.y - (b.z || 0), s.tick / 2, 1, b.weapon === 7 ? Math.atan2(b.vy, b.vx) : 0);
    }
    for (const e of s.effects) if (!["Effect.BloodPool", "Effect.ScorchMark"].includes(e.kind)) {
      const meta = boxhead_data_default.objects[e.kind];
      sprite2(c, e.kind, e.x, e.y, (1 - e.life / e.total) * (meta?.frames || 1), e.scale || 1);
    }
    if (coverBitmap) c.drawImage(coverBitmap, 0, 0, map.width, map.height);
    for (const p of s.players.filter((p2) => p2.alive)) health(c, p, seat);
    c.restore();
    c.fillStyle = "#242823";
    c.fillRect(0, 0, WIDTH4, HUD);
    c.fillStyle = "#ecebdf";
    c.font = "bold 20px monospace";
    c.textAlign = "left";
    c.fillText(`BOXHEAD 2PLAY  \xB7  \u7B2C ${s.wave || 1} \u6CE2`, 20, 28);
    c.fillStyle = "#dddac3";
    c.font = "17px monospace";
    c.fillText(`SCORE ${s.score.toLocaleString()}   \xD7${s.combo}`, 430, 28);
    c.fillStyle = "#b6baa9";
    c.font = "14px sans-serif";
    c.textAlign = "right";
    c.fillText(map.label + "  \xB7  \u5171\u4EAB\u89C6\u91CE", WIDTH4 - 20, 28);
    c.textAlign = "left";
    for (const p of s.players) {
      const x = 20 + (p.seat - 1) * WIDTH4 / 4, gun = WEAPONS3[p.weapon];
      c.fillStyle = ["#9ac8ff", "#f1d585", "#9edc9c", "#e7a5ad"][p.seat - 1];
      c.font = "bold 15px sans-serif";
      c.fillText(`P${p.seat}  ${p.alive ? Math.ceil(p.hp) + " HP" : "\u5012\u5730 \xB7 " + Math.ceil(p.respawn / 25) + "s"}`, x, 52);
      c.fillStyle = "#ddd";
      c.font = "14px sans-serif";
      c.fillText(`${gun.name}  ${p.ammo < 0 ? "\u221E" : p.ammo}  \xB7  ${p.kills} \u51FB\u6740`, x, 73);
    }
    if (s.messageUntil > s.tick && s.phase === "playing") {
      c.font = "bold 19px sans-serif";
      c.textAlign = "center";
      const w = c.measureText(s.message).width + 40;
      c.fillStyle = "#20251fcc";
      c.fillRect((WIDTH4 - w) / 2, HUD + 18, w, 36);
      c.fillStyle = "#f3e5ac";
      c.fillText(s.message, WIDTH4 / 2, HUD + 43);
      c.textAlign = "left";
    }
    if (s.phase !== "playing") {
      c.fillStyle = "#101610bb";
      c.fillRect(0, HUD, WIDTH4, HEIGHT4 - HUD);
      c.fillStyle = "#fff";
      c.font = "bold 32px sans-serif";
      c.textAlign = "center";
      c.fillText(s.phase === "waiting" ? "BOXHEAD \xB7 2\u20134 \u4EBA\u5408\u4F5C\u751F\u5B58" : "\u961F\u4F0D\u5168\u706D", WIDTH4 / 2, 365);
      c.font = "18px sans-serif";
      c.fillStyle = "#d9ddcf";
      c.fillText(s.phase === "waiting" ? "\u9009\u62E9\u539F\u7248\u5730\u56FE\uFF0C\u5165\u5EA7\u5E76\u51C6\u5907" : "\u575A\u6301\u5230\u7B2C " + s.wave + " \u6CE2 \xB7 \u5F97\u5206 " + s.score.toLocaleString(), WIDTH4 / 2, 405);
      c.fillText("WASD / \u65B9\u5411\u952E\u79FB\u52A8\u4E0E\u7784\u51C6 \xB7 \u7A7A\u683C / J \u5C04\u51FB \xB7 Q / E \u6362\u6B66\u5668 \xB7 1\u20130 \u9009\u6B66\u5668", WIDTH4 / 2, 444);
      c.textAlign = "left";
    }
  }
  var enabled = true;
  var volume = 0.24;
  var heardRound = -1;
  var heardId = 0;
  var ambientTick = -1;
  var ambientIndex = 0;
  var playing = /* @__PURE__ */ new Set();
  var ambient = /* @__PURE__ */ new Set();
  var gain = /* @__PURE__ */ new WeakMap();
  function stopAmbience() {
    for (const audio2 of ambient) {
      audio2.pause();
      playing.delete(audio2);
    }
    ambient.clear();
  }
  function setSound(value) {
    enabled = value;
    if (!value) {
      for (const audio2 of playing) audio2.pause();
      playing.clear();
      ambient.clear();
    }
  }
  function setVolume(value) {
    volume = Math.max(0, Math.min(1, value));
    for (const audio2 of playing) audio2.volume = volume * (gain.get(audio2) ?? 1);
  }
  function confirm(s) {
    if (s.round !== heardRound) {
      stopAmbience();
      heardRound = s.round;
      heardId = s.soundId;
      ambientTick = s.tick;
      return;
    }
    for (const event of s.sounds) {
      if (event.id <= heardId) continue;
      if (event.name === "World.End.wav" && playing.size >= 12) {
        const oldest = [...playing].find((audio2) => !ambient.has(audio2));
        if (oldest) {
          oldest.pause();
          playing.delete(oldest);
        }
      }
      if (enabled && volume > 0 && s.tick - event.tick <= 5 && playing.size < 12) {
        const file = boxhead_data_default.audio[event.name];
        if (!file) continue;
        const audio2 = new Audio(base + file);
        gain.set(audio2, 1);
        audio2.volume = volume;
        playing.add(audio2);
        const done = () => playing.delete(audio2);
        audio2.onended = done;
        audio2.onerror = done;
        void audio2.play().catch(done);
      }
    }
    heardId = s.soundId;
    const count = s.phase === "playing" ? s.zombies.length : 0;
    if (!count) {
      stopAmbience();
      ambientTick = s.tick;
      return;
    }
    const frequency = count <= 4 ? 150 : count <= 8 ? 60 : 1, channels = count <= 2 ? 1 : count <= 4 ? 2 : 3;
    if (enabled && volume > 0 && s.tick - ambientTick >= frequency && ambient.size < channels) {
      ambientTick = s.tick;
      const name = `Creature.Zombie.Ambience.${ambientIndex % 4 + 1}.wav`;
      ambientIndex++;
      const audio2 = new Audio(base + boxhead_data_default.audio[name]);
      const mix2 = 0.4 * (count === 1 ? 0.3 : count === 2 ? 0.4 : count <= 4 ? 0.6 : count <= 8 ? 0.8 : 1);
      gain.set(audio2, mix2);
      audio2.volume = volume * mix2;
      playing.add(audio2);
      ambient.add(audio2);
      const done = () => {
        playing.delete(audio2);
        ambient.delete(audio2);
      };
      audio2.onended = done;
      audio2.onerror = done;
      void audio2.play().catch(done);
    }
  }

  // src/expanded/boxhead.ts
  var adapter3 = {
    id: ID,
    title: "\u50F5\u5C38\u5371\u673A3",
    seats: 4,
    hz: 25,
    width: WIDTH4,
    height: HEIGHT4,
    controls: "WASD / \u65B9\u5411\u952E\u79FB\u52A8\u4E0E\u7784\u51C6\uFF1B\u7A7A\u683C / J \u5C04\u51FB\uFF1BQ / E \u524D\u540E\u6362\u67AA\uFF08K / X \u4E5F\u53EF\uFF09\uFF1B1\u20130 \u9009\u6B66\u5668\u3002\u9ED8\u8BA4\u5F00\u542F\u53CB\u4F24\uFF0C\u7206\u70B8\u4E5F\u4F1A\u4F24\u5230\u81EA\u5DF1\uFF1B\u6B7B\u4EA1\u6E05\u7A7A\u975E\u624B\u67AA\u5F39\u836F\uFF0C\u961F\u53CB\u5B58\u6D3B\u65F6\u53EF\u590D\u6D3B\u3002",
    maps: MAPS2.map(({ id, label }) => ({ id, label })),
    create: create3,
    step: step3,
    valid: valid3,
    render: render3,
    confirm,
    setSound,
    setVolume,
    consumeInput(s, seat, input) {
      const p = s.players.find((p2) => p2.seat === seat);
      if (p) {
        p.lastAttack = Math.max(p.lastAttack, input.attack);
        p.lastAlt = Math.max(p.lastAlt, input.alt);
        p.triggerDown = false;
      }
    },
    predict(s, seat, input, fraction) {
      const p = s.players.find((p2) => p2.seat === seat);
      if (!p?.alive) return;
      const dx = Number(input.right) - Number(input.left), dy = Number(input.down) - Number(input.up);
      if (dx || dy) {
        p.dir = Math.atan2(dy, dx);
        move(s, p, dx * 5.12 * fraction, dy * 5.12 * fraction);
      }
    }
  };

  // src/expanded/gunmayhem-data.json
  var gunmayhem_data_default = [{ id: "1838", label: "Classic", platforms: [{ x: 467.06, y: 175, w: 194.62, h: 23.02 }, { x: 219.87, y: 251.74, w: 553.43, h: 23.02 }, { x: 40, y: 328.49, w: 346.82, h: 23.02 }, { x: 522.41, y: 328.49, w: 336.67, h: 23.02 }, { x: 139.62, y: 405.23, w: 554.35, h: 23.02 }, { x: 251.23, y: 481.98, w: 187.24, h: 23.02 }] }, { id: "1872", label: "Twin Towers", platforms: [{ x: 282.58, y: 175, w: 337.7, h: 23.02 }, { x: 63.78, y: 251.74, w: 274.92, h: 23.02 }, { x: 578.42, y: 251.74, w: 272.06, h: 23.02 }, { x: 275.92, y: 328.49, w: 348.17, h: 23.02 }, { x: 40, y: 405.23, w: 819.05, h: 23.02 }, { x: 109.44, y: 481.98, w: 683.97, h: 23.02 }] }, { id: "1875", label: "Crossfire", platforms: [{ x: 75.69, y: 175, w: 263.94, h: 23.02 }, { x: 555.67, y: 175, w: 266.76, h: 23.02 }, { x: 43.76, y: 251.74, w: 806.85, h: 23.02 }, { x: 332.12, y: 328.49, w: 236.7, h: 23.02 }, { x: 62.54, y: 405.23, w: 766.46, h: 23.02 }, { x: 40, y: 481.98, w: 284.6, h: 23.02 }, { x: 580.09, y: 481.98, w: 279.91, h: 23.02 }] }];

  // src/expanded/gunmayhem.ts
  var ID2 = "97734-server";
  var W = 900;
  var H = 600;
  var GUNS = [{ name: "M1911", art: "pistol", rate: 11, pellets: 1, speed: 24, force: 4.8, ammo: -1 }, { name: "AK47", art: "ak47", rate: 5, pellets: 1, speed: 27, force: 3.2, ammo: 45 }, { name: "KSG", art: "shotgun", rate: 25, pellets: 5, speed: 22, force: 3.5, ammo: 12 }, { name: "AWM", art: "sniper", rate: 33, pellets: 1, speed: 40, force: 12, ammo: 10 }];
  function numeric(v, keys) {
    return keys.every((k) => Number.isFinite(v[k]));
  }
  function entities(s) {
    return s.bullets.every((v) => numeric(v, ["id", "vx", "vy", "owner", "force", "life"])) && s.grenades.every((v) => numeric(v, ["id", "vx", "vy", "owner", "life"])) && s.crates.every((v) => numeric(v, ["id", "vy", "life"]) && Number.isInteger(v.weapon) && v.weapon > 0 && v.weapon < GUNS.length) && s.effects.every((v) => numeric(v, ["life"]));
  }
  function accept2(s, p, candidate) {
    const at = p.seat - 1, current = s.inputs[at];
    let next;
    if (!validInput3(candidate)) next = { ...current, left: false, right: false, up: false, down: false };
    else if (candidate.seq < current.seq) next = current;
    else if (candidate.seq === current.seq) next = { ...current, left: current.left && candidate.left, right: current.right && candidate.right, up: current.up && candidate.up, down: current.down && candidate.down, attack: Math.max(current.attack, p.lastAttack), alt: Math.max(current.alt, p.lastAlt) };
    else next = { ...candidate, attack: Math.max(candidate.attack, current.attack, p.lastAttack), alt: Math.max(candidate.alt, current.alt, p.lastAlt) };
    s.inputs[at] = { ...next };
    return next;
  }
  function rnd(s) {
    s.rng = Math.imul(s.rng, 1664525) + 1013904223 >>> 0;
    return s.rng / 4294967296;
  }
  function platforms(s) {
    return gunmayhem_data_default.find((m) => m.id === s.mapId).platforms;
  }
  function respawn(s, p) {
    const choices = platforms(s).filter((r2) => r2.w > 85 && r2.y < 460);
    const r = choices[(p.seat - 1 + Math.floor(rnd(s) * choices.length)) % choices.length];
    p.x = r.x + r.w * (0.25 + rnd(s) * 0.5);
    p.y = r.y - 28;
    p.vx = 0;
    p.vy = 0;
    p.invul = 70;
    p.jumps = 0;
    p.grounded = true;
    p.damage = 0;
  }
  function pose(s, p, input, f = 1) {
    const dx = Number(input.right) - Number(input.left);
    if (dx) p.facing = dx;
    p.vx = Math.max(-22, Math.min(22, p.vx + dx * 0.7 * f));
    p.vx *= Math.pow(p.grounded ? 0.93 : 0.88, f);
    p.vy = Math.min(25, p.vy + 0.88 * f);
    const prev = p.y;
    p.x += p.vx * f;
    p.y += p.vy * f;
    p.grounded = false;
    if (p.vy >= 0 && p.drop === 0) {
      for (const r of platforms(s)) if (p.x + 13 > r.x && p.x - 13 < r.x + r.w && prev + 28 <= r.y + 1 && p.y + 28 >= r.y) {
        p.y = r.y - 28;
        p.vy = 0;
        p.grounded = true;
        p.jumps = 0;
        break;
      }
    }
  }
  function hit2(s, p, force, dir, owner) {
    if (p.invul > 0) return;
    p.damage = Math.min(250, p.damage + force * 3);
    p.vx += dir * force * (1 + p.damage / 100);
    p.vy -= Math.min(13, force * 0.65 * (1 + p.damage / 150));
    p.lastHit = owner;
    p.hitTick = s.tick;
  }
  function blast(s, g) {
    s.effects.push({ x: g.x, y: g.y, life: 14 });
    for (const p of s.players) if (p.alive && Math.hypot(p.x - g.x, p.y - g.y) < 105) hit2(s, p, 13 * (1 - Math.hypot(p.x - g.x, p.y - g.y) / 130), p.x >= g.x ? 1 : -1, g.owner);
  }
  var adapter4 = {
    id: ID2,
    title: "\u6DF7\u4E71\u5927\u67AA\u62182",
    seats: 4,
    hz: 35,
    width: W,
    height: H,
    controls: "\u65B9\u5411\u952E / WASD \u79FB\u52A8\uFF0C\u4E0A\u952E\u8DF3\u8DC3\uFF08\u53EF\u4E8C\u6BB5\u8DF3\uFF09\uFF0C\u4E0B\u952E\u7A7F\u8FC7\u5E73\u53F0\uFF1B\u7A7A\u683C / J \u5C04\u51FB\uFF1BK / X \u6295\u63B7\u624B\u96F7\u3002\u5C06\u5BF9\u624B\u51FB\u51FA\u5730\u56FE\uFF0C\u6700\u540E\u5B58\u6D3B\u8005\u83B7\u80DC\u3002",
    maps: gunmayhem_data_default.map(({ id, label }) => ({ id, label })),
    create(round, playing2, seats, seed, mapId) {
      const active = [...new Set(seats)].filter((n) => Number.isInteger(n) && n >= 1 && n <= 4).sort();
      const s = { gameId: ID2, round, tick: 0, phase: playing2 ? "playing" : "waiting", winner: null, ack: [0, 0, 0, 0], inputs: Array.from({ length: 4 }, () => ({ ...EMPTY_INPUT })), rng: seed >>> 0, mapId: gunmayhem_data_default.some((m) => m.id === mapId) ? mapId : gunmayhem_data_default[Math.max(0, round - 1) % gunmayhem_data_default.length].id, players: active.map((seat) => ({ seat, x: 0, y: 0, vx: 0, vy: 0, alive: true, lives: 5, facing: seat % 2 ? 1 : -1, damage: 0, weapon: 0, ammo: -1, cooldown: 0, grenades: 5, nadeCooldown: 0, invul: 70, jumps: 0, jumpHeld: false, grounded: false, drop: 0, lastAttack: 0, lastAlt: 0, killedBy: 0, deaths: 0, respawn: 0, lastHit: 0, hitTick: 0, kills: 0 })), bullets: [], grenades: [], crates: [], effects: [], nextId: 0, nextCrate: 150 };
      for (const p of s.players) respawn(s, p);
      return s;
    },
    consumeInput(s, seat, input) {
      const p = s.players.find((p2) => p2.seat === seat);
      if (p) {
        p.lastAttack = Math.max(p.lastAttack, input.attack);
        p.lastAlt = Math.max(p.lastAlt, input.alt);
        p.jumpHeld = input.up;
      }
    },
    step(s, inputs) {
      if (s.phase !== "playing") return;
      s.tick++;
      s.effects = s.effects.filter((e) => --e.life > 0);
      for (const p of s.players) {
        const input = accept2(s, p, inputs[p.seat - 1]);
        s.ack[p.seat - 1] = Math.max(s.ack[p.seat - 1], input.seq);
        const attack = input.attack > p.lastAttack, alt = input.alt > p.lastAlt, jump = input.up && !p.jumpHeld;
        p.lastAttack = Math.max(p.lastAttack, input.attack);
        p.lastAlt = Math.max(p.lastAlt, input.alt);
        p.jumpHeld = input.up;
        if (!p.alive) continue;
        if (p.respawn > 0) {
          if (--p.respawn === 0) respawn(s, p);
          continue;
        }
        if (p.invul > 0) p.invul--;
        if (p.cooldown > 0) p.cooldown--;
        if (p.nadeCooldown > 0) p.nadeCooldown--;
        if (p.drop > 0) p.drop--;
        if (jump && p.jumps < 2) {
          p.vy = -13.5;
          p.jumps++;
          p.grounded = false;
        }
        if (input.down && p.grounded) {
          p.drop = 12;
          p.y += 5;
          p.grounded = false;
        }
        pose(s, p, input);
        if (attack && p.cooldown === 0) {
          if (p.ammo === 0) {
            p.weapon = 0;
            p.ammo = -1;
          }
          const gun = GUNS[p.weapon];
          p.cooldown = gun.rate;
          if (p.ammo > 0) p.ammo--;
          for (let k = 0; k < gun.pellets; k++) s.bullets.push({ id: ++s.nextId, x: p.x + p.facing * 23, y: p.y - 3, vx: p.facing * gun.speed, vy: (k - (gun.pellets - 1) / 2) * 2.3, owner: p.seat, force: gun.force, life: 40 });
          p.vx -= p.facing * (p.weapon === 3 ? 2 : 0.2);
        }
        if (alt && p.grenades > 0 && p.nadeCooldown === 0) {
          p.grenades--;
          p.nadeCooldown = 22;
          s.grenades.push({ id: ++s.nextId, x: p.x, y: p.y - 15, vx: p.facing * 7 + p.vx * 0.2, vy: -8, owner: p.seat, life: 65 });
        }
      }
      for (const b of s.bullets) {
        const prev = b.x;
        b.x += b.vx;
        b.y += b.vy;
        b.life--;
        for (const p of s.players) if (p.alive && p.respawn === 0 && p.invul === 0 && p.seat !== b.owner && Math.abs(p.y - b.y) < 27 && p.x + 14 >= Math.min(prev, b.x) && p.x - 14 <= Math.max(prev, b.x)) {
          hit2(s, p, b.force, b.vx > 0 ? 1 : -1, b.owner);
          b.life = 0;
          break;
        }
        if (b.x < -60 || b.x > 960 || b.y < -80 || b.y > 650) b.life = 0;
      }
      s.bullets = s.bullets.filter((b) => b.life > 0);
      for (const g of s.grenades) {
        const prev = g.y;
        g.vy += 0.65;
        g.x += g.vx;
        g.y += g.vy;
        for (const r of platforms(s)) if (g.vy > 0 && g.x > r.x && g.x < r.x + r.w && prev + 5 <= r.y && g.y + 5 >= r.y) {
          g.y = r.y - 5;
          g.vy = -g.vy * 0.55;
          g.vx *= 0.8;
          break;
        }
        if (--g.life <= 0) blast(s, g);
      }
      s.grenades = s.grenades.filter((g) => g.life > 0);
      if (s.tick >= s.nextCrate && s.crates.length < 4) {
        const r = platforms(s)[Math.floor(rnd(s) * platforms(s).length)];
        s.crates.push({ id: ++s.nextId, x: r.x + r.w / 2, y: r.y - 180, vy: 0, weapon: 1 + Math.floor(rnd(s) * 3), life: 800 });
        s.nextCrate = s.tick + 220;
      }
      for (const crate of s.crates) {
        const prev = crate.y;
        crate.vy = Math.min(10, crate.vy + 0.5);
        crate.y += crate.vy;
        for (const r of platforms(s)) if (crate.x > r.x && crate.x < r.x + r.w && prev + 12 <= r.y && crate.y + 12 >= r.y) {
          crate.y = r.y - 12;
          crate.vy = 0;
          break;
        }
        for (const p of s.players) if (p.alive && !p.respawn && Math.hypot(p.x - crate.x, p.y - crate.y) < 35) {
          p.weapon = crate.weapon;
          p.ammo = GUNS[p.weapon].ammo;
          p.grenades = Math.min(5, p.grenades + 1);
          crate.life = 0;
        }
        crate.life--;
      }
      s.crates = s.crates.filter((c) => c.life > 0 && c.y < 650);
      for (const p of s.players) if (p.alive && !p.respawn && (p.x < -85 || p.x > 985 || p.y > 690 || p.y < -300)) {
        p.lives--;
        p.deaths++;
        const killer = s.players.find((q) => q.seat === p.lastHit && q.seat !== p.seat);
        if (killer && s.tick - p.hitTick < 200) {
          killer.kills++;
          p.killedBy = killer.seat;
        } else p.killedBy = 0;
        if (p.lives <= 0) p.alive = false;
        else p.respawn = 45;
      }
      const alive = s.players.filter((p) => p.alive);
      if (s.players.length > 1 && alive.length <= 1) {
        s.phase = "finished";
        s.winner = alive[0]?.seat ?? 0;
      }
      if (s.tick >= 35 * 60 * 8) {
        const rank = [...alive].sort((a, b) => b.lives - a.lives || b.kills - a.kills || a.damage - b.damage);
        s.phase = "finished";
        s.winner = rank.length > 1 && rank[0].lives === rank[1].lives && rank[0].kills === rank[1].kills ? 0 : rank[0]?.seat ?? 0;
      }
    },
    valid(value) {
      if (!value || typeof value !== "object") return false;
      const s = value;
      return s.gameId === ID2 && Number.isSafeInteger(s.tick) && s.tick >= 0 && Number.isSafeInteger(s.round) && ["waiting", "playing", "finished"].includes(s.phase) && [null, 0, 1, 2, 3, 4].includes(s.winner) && Array.isArray(s.ack) && s.ack.length === 4 && s.ack.every((n) => Number.isSafeInteger(n) && n >= 0) && gunmayhem_data_default.some((m) => m.id === s.mapId) && Array.isArray(s.players) && s.players.length <= 4 && new Set(s.players.map((p) => p?.seat)).size === s.players.length && s.players.every((p) => p && [1, 2, 3, 4].includes(p.seat) && typeof p.alive === "boolean" && typeof p.jumpHeld === "boolean" && typeof p.grounded === "boolean" && numeric(p, ["deaths", "killedBy", "x", "y", "vx", "vy", "damage", "lives", "facing", "lastAttack", "lastAlt", "cooldown", "invul", "ammo", "kills", "respawn", "drop", "jumps", "grenades", "nadeCooldown", "lastHit", "hitTick"]) && Number.isInteger(p.weapon) && p.weapon >= 0 && p.weapon < GUNS.length) && ["bullets", "grenades", "crates", "effects"].every((k) => Array.isArray(s[k]) && s[k].length < 1500 && s[k].every((e) => e && Number.isFinite(e.x) && Number.isFinite(e.y))) && Array.isArray(s.inputs) && s.inputs.length === 4 && s.inputs.every(validInput3) && numeric(s, ["rng", "nextId", "nextCrate"]) && entities(s);
    },
    render(canvas, s, seat) {
      const c = canvas.getContext("2d");
      if (!c) return;
      canvas.width = W;
      canvas.height = H;
      const bg = c.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#93c6e3");
      bg.addColorStop(1, "#dcebec");
      c.fillStyle = bg;
      c.fillRect(0, 0, W, H);
      c.fillStyle = "#b6c7d0";
      for (let i = 0; i < 8; i++) {
        c.beginPath();
        c.moveTo(i * 145 - 100, 560);
        c.lineTo(i * 145 + 15, 345 + i % 3 * 30);
        c.lineTo(i * 145 + 140, 560);
        c.fill();
      }
      if (!s) return;
      for (const r of platforms(s)) {
        c.fillStyle = "#333b42";
        c.fillRect(r.x, r.y, r.w, r.h);
        c.fillStyle = "#708580";
        c.fillRect(r.x, r.y, r.w, 6);
        c.strokeStyle = "#22313b";
        c.strokeRect(r.x, r.y, r.w, r.h);
      }
      for (const cr of s.crates) {
        draw2(c, "crate", cr.x - 16, cr.y - 15, 32, 27);
        c.fillStyle = "#263344";
        c.font = "11px sans-serif";
        c.fillText(GUNS[cr.weapon].name, cr.x - 18, cr.y - 18);
      }
      for (const g of s.grenades) {
        c.fillStyle = "#253e30";
        c.beginPath();
        c.arc(g.x, g.y, 6, 0, Math.PI * 2);
        c.fill();
      }
      for (const e of s.effects) {
        c.fillStyle = `rgba(255,130,15,${e.life / 14})`;
        c.beginPath();
        c.arc(e.x, e.y, 110 * (1 - e.life / 18), 0, Math.PI * 2);
        c.fill();
      }
      for (const p of s.players) if (p.alive && !p.respawn) {
        c.save();
        c.translate(p.x, p.y);
        if (p.invul > 0) c.globalAlpha = 0.55 + Math.sin(s.tick) * 0.25;
        if (p.facing < 0) c.scale(-1, 1);
        draw2(c, "player", -17, -28, 34, 56);
        draw2(c, GUNS[p.weapon].art, 2, -5, p.weapon === 0 ? 26 : 40, 13);
        c.restore();
        c.fillStyle = ["", "#c02634", "#236ac0", "#1c8b48", "#904cc0"][p.seat];
        c.font = "bold 15px sans-serif";
        c.textAlign = "center";
        c.fillText(`P${p.seat}${seat === p.seat ? " \u25BC" : ""}`, p.x, p.y - 34);
        c.textAlign = "left";
      }
      for (const b of s.bullets) {
        c.strokeStyle = "#ffed6c";
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(b.x, b.y);
        c.lineTo(b.x - b.vx * 0.4, b.y - b.vy * 0.4);
        c.stroke();
      }
      c.fillStyle = "#183247";
      c.fillRect(0, 0, W, 65);
      c.fillStyle = "#fff";
      c.font = "bold 18px sans-serif";
      c.fillText("GUN MAYHEM 2 \xB7 " + gunmayhem_data_default.find((m) => m.id === s.mapId).label, 20, 24);
      c.font = "14px sans-serif";
      c.fillText(s.players.map((p) => `P${p.seat} \u2665${p.lives} \xB7 ${GUNS[p.weapon].name} ${p.ammo < 0 ? "\u221E" : p.ammo} \xB7 \u96F7${p.grenades} \xB7 \u51FB\u9000${Math.round(p.damage)}%`).join("    "), 20, 49);
      if (s.phase !== "playing") {
        c.fillStyle = "#123c";
        c.fillRect(200, 255, 500, 80);
        c.fillStyle = "#fff";
        c.textAlign = "center";
        c.font = "bold 27px sans-serif";
        c.fillText(s.phase === "waiting" ? "2\u20134 \u4EBA\u67AA\u6218 \xB7 \u51C6\u5907\u540E\u5F00\u59CB" : s.winner ? `P${s.winner} \u83B7\u80DC\uFF01` : "\u5E73\u5C40", 450, 305);
        c.textAlign = "left";
      }
    },
    predict(s, seat, input, fraction) {
      const p = s.players.find((p2) => p2.seat === seat);
      if (p?.alive && !p.respawn) pose(s, p, input, fraction);
    }
  };
  var images3 = /* @__PURE__ */ new Map();
  function get(name) {
    let im = images3.get(name);
    if (!im) {
      im = new Image();
      im.src = "/expanded/assets/gunmayhem/" + name + ".png";
      images3.set(name, im);
    }
    return im;
  }
  function draw2(c, name, x, y, w, h) {
    const im = get(name);
    if (im.complete && im.naturalWidth) c.drawImage(im, x, y, w, h);
  }

  // src/expanded/brawler-data.json
  var brawler_data_default = { sha256: "c23074f428e1a3bdb4a6c44779627d87b7b3ff0ad00518ceaab94dd3943b8f77", stages: [{ id: "Rooftop", label: "\u5C4B\u9876", platforms: [{ id: 0, name: "Fixed1", x: 214.2996951749846, y: 254.04995188102754, w: 747.0717539500308, h: 538.9325882379451, moving: false }, { id: 1, name: "Moving2", x: 354.0498099874522, y: 152.64999894233702, w: 465.6868701250957, h: 11.845827435325958, moving: true }, { id: 2, name: "Moving1", x: 148.6999700919806, y: 300.74999908653257, w: 73.2992221160388, h: 10.230836762934814, moving: true }, { id: 3, name: "Moving3", x: 953.2499700919806, y: 300.74999892105103, w: 73.29922211603878, h: 12.084230397897898, moving: true }, { id: 4, name: "Fixed4", x: 876.5999805726321, y: 229.49999780914305, w: 47.61301413473575, h: 24.537602221713882, moving: false }, { id: 5, name: "Fixed5", x: 308.69998057263217, y: 230.04999780914306, w: 47.613014134735636, h: 24.537602221713882, moving: false }, { id: 6, name: "Moving4", x: 524.0999851055604, y: 89.74999936599733, w: 36.50361521887908, h: 7.100831228005347, moving: true }], spawns: [{ x: 358.25, y: 253.05 }, { x: 215.2, y: 253.05 }, { x: 923.85, y: 253.05 }, { x: 353.7, y: 153 }], bounds: [-50, -200, 1150, 500], artBounds: [148.6999700919806, 16.75, 1026.9, 792.9825401189726], backgroundBounds: [-247.94991248800002, -106.03146821499998, 1039.627178744, 531.98321175] }, { id: "Mogadishu", label: "\u57CE\u5E02", platforms: [{ id: 0, name: "Fixed2", x: -401.4, y: 122.09962061896199, w: 156.00494236894284, h: 257.000437381038, moving: false }, { id: 1, name: "Fixed3", x: -245.4, y: 149.0996603651408, w: 244.84501159933058, h: 230.0755668348592, moving: false }, { id: 2, name: "Fixed4", x: -0.55, y: 97.9995851583534, w: 154.85825824238023, h: 281.0221754416466, moving: false }, { id: 3, name: "Fixed5", x: 154.3, y: 180.54970675729803, w: 134.88698179194478, h: 198.64857524270198, moving: false }, { id: 4, name: "Fixed6", x: 331.3, y: 180.249640540771, w: 134.88698179194478, h: 243.504998459229, moving: false }, { id: 5, name: "Fixed7", x: 463.5, y: 124.099625133492, w: 157.84437458335003, h: 253.942202866508, moving: false }, { id: 6, name: "Fixed8", x: 662.1, y: 188.54970010565282, w: 132.25655265419903, h: 203.1545350943472, moving: false }, { id: 7, name: "Fixed9", x: 793.9, y: 154.54967189932322, w: 153.78778883782672, h: 222.26207690067682, moving: false }, { id: 8, name: "Fixed10", x: 947.7, y: 238.94979649911738, w: 242.80401997300373, h: 137.85564010088262, moving: false }, { id: 9, name: "Fixed11", x: 1190.5, y: 186.14971873328, w: 156.83996311801525, h: 190.53580126672, moving: false }, { id: 10, name: "Fixed1", x: -1157.5, y: 376.699811664212, w: 3048.9959286952344, h: 127.582496335788, moving: false }, { id: 11, name: "Moving1", x: -127.9, y: 97.99998898425292, w: 127.3344425103052, h: 7.462291295747079, moving: true }, { id: 12, name: "Moving2", x: 467.4, y: -31.65001101574708, w: 147.35315058135598, h: 7.462291295747082, moving: true }, { id: 13, name: "Moving3", x: 1064.2, y: 186.14998898425293, w: 126.28430887195032, h: 7.462291295747065, moving: true }, { id: 14, name: "Fixed12", x: 288.7, y: 301.69988682559057, w: 42.5949972815763, h: 76.66664857440941, moving: false }, { id: 15, name: "Fixed13", x: 621.35, y: 302.5498868255906, w: 40.857185066524835, h: 76.66664857440941, moving: false }], spawns: [{ x: -127.9, y: 90.75 }, { x: 463.5, y: 111.1 }, { x: 1064.15, y: 173.15 }, { x: 467.4, y: -47.55 }], bounds: [-1e3, -200, 1700, 500], artBounds: [-1235.85, -96.1, 1955.95, 1122.8], backgroundBounds: [-1388.1, -146.98053549600002, 2359.0114654, 386.896138184] }, { id: "B52", label: "\u8F70\u70B8\u673A", platforms: [{ id: 0, name: "Fixed3", x: 741.2999338490295, y: 11.19999732860575, w: 162.12423223194105, h: 29.919620942788494, moving: false }, { id: 1, name: "Moving2", x: 815.8499145501094, y: 211.54999915004728, w: 209.42244395978128, h: 9.519472219905452, moving: true }, { id: 2, name: "Fixed1", x: 332.24983309887597, y: 11.199996146087502, w: 409.04489180224806, h: 43.16382770782499, moving: false }, { id: 3, name: "Fixed2", x: 281.5999793309638, y: 24.44999732860575, w: 50.65612200807249, h: 29.919620942788494, moving: false }, { id: 4, name: "Moving1", x: 20.249914550109317, y: 194.64999915004728, w: 209.4224439597814, h: 9.519472219905452, moving: true }], spawns: [{ x: 348.25, y: 11.75 }, { x: 453.2, y: 11.75 }, { x: 558.15, y: 11.75 }, { x: 663.1, y: 11.75 }], bounds: [-50, -300, 1150, 400], artBounds: [-3697.5798066499997, -78.15, 1296.9685741500004, 807.61457625], backgroundBounds: [-189, -302.95, 811, 235.05] }, { id: "Space", label: "\u592A\u7A7A", platforms: [{ id: 0, name: "Fixed1", x: -237.55, y: 156.4998962434712, w: 509.69688723994443, h: 70.2867845565288, moving: false }, { id: 1, name: "Fixed2", x: 411.7, y: -84.8500633651408, w: 314.3709981772068, h: 42.92483616514081, moving: false }, { id: 2, name: "Moving1", x: -674.2, y: 20.79998776290872, w: 300.6768465976742, h: 8.289654717091281, moving: true }, { id: 3, name: "Fixed5", x: -602.3, y: 273.1497451213046, w: 168.18655473558943, h: 172.66001627869537, moving: false }, { id: 4, name: "Fixed6", x: 462.25, y: 340.6997538476248, w: 222.40590333826685, h: 166.7486293523752, moving: false }, { id: 5, name: "Fixed3", x: -384.25, y: -224.70004031002787, w: 142.6173591250418, h: 27.30683339002789, moving: false }, { id: 6, name: "Fixed4", x: 449.1, y: -41.9501326903664, w: 242.85822278214596, h: 89.8871550903664, moving: false }, { id: 7, name: "Fixed7", x: -364.4, y: -197.4000578146962, w: 98.7842145003375, h: 39.16485201469618, moving: false }, { id: 8, name: "Fixed8", x: -143.85, y: 226.7997415329616, w: 313.9644937591041, h: 175.0908328670384, moving: false }], spawns: [{ x: -225.55, y: 156.55 }, { x: -602.25, y: 273.15 }, { x: 462.25, y: 340.7 }, { x: -373.55, y: -224.7 }], bounds: [-900, -500, 800, 700], artBounds: [-674.2074020340001, -237.7, 737, 507.85], backgroundBounds: [-895.1877910148701, -819.4035923080532, 1227.2592877489947, 1057.3587269530415] }], fighters: [{ id: "DefaultPlayer", frames: ["DefaultPlayer-1.png", "DefaultPlayer-2.png", "DefaultPlayer-3.png", "DefaultPlayer-4.png"], bounds: [-13, -26.013897682, 13.212686022, 0.8111084080000026] }, { id: "CoffeePlayer", frames: ["CoffeePlayer-1.png", "CoffeePlayer-2.png", "CoffeePlayer-3.png", "CoffeePlayer-4.png"], bounds: [-13, -27.1, 13.212686022, 0.8000000000000007] }, { id: "AuberginePlayer", frames: ["AuberginePlayer-1.png", "AuberginePlayer-2.png", "AuberginePlayer-3.png", "AuberginePlayer-4.png"], bounds: [-13, -32.35, 13.212686022, 0.8000000000000007] }, { id: "SBLPlayer", frames: ["SBLPlayer-1.png", "SBLPlayer-2.png", "SBLPlayer-3.png", "SBLPlayer-4.png"], bounds: [-13, -30.8, 13.212686022, 0.8000000000000007] }, { id: "TrashPlayer", frames: ["TrashPlayer-1.png", "TrashPlayer-2.png", "TrashPlayer-3.png", "TrashPlayer-4.png"], bounds: [-13, -35.25, 13.212686022, 0.8000000000000007] }, { id: "PeachPlayer", frames: ["PeachPlayer-1.png", "PeachPlayer-2.png", "PeachPlayer-3.png", "PeachPlayer-4.png"], bounds: [-13.3, -28.3, 13.212686022, 0.8000000000000007] }] };

  // src/expanded/brawler.ts
  var HZ5 = 30;
  var stages = brawler_data_default.stages;
  var stats = [{ weight: 0.5, speed: 0.5, power: 0.5 }, { weight: 0.4, speed: 0.7, power: 0.4 }, { weight: 0.5, speed: 0.6, power: 0.4 }, { weight: 0.5, speed: 0.5, power: 0.5 }, { weight: 0.6, speed: 0.4, power: 0.5 }, { weight: 0.4, speed: 0.5, power: 0.6 }];
  var clamp2 = (n, a, b) => Math.max(a, Math.min(b, n));
  var stageOf = (s) => stages.find((m) => m.id === s.mapId);
  var random4 = (s) => {
    s.seed = Math.imul(s.seed, 1664525) + 1013904223 >>> 0;
    return s.seed / 4294967296;
  };
  function create4(round, playing2, seats, seed, mapId) {
    const stage = stages.find((m) => m.id === mapId) || stages[0];
    const players = seats.filter((s) => s >= 1 && s <= 4).map((seat, i) => {
      const pt = stage.spawns[i % stage.spawns.length];
      return { seat, x: pt.x + 14, y: pt.y - 2, vx: 0, vy: 0, alive: true, damage: 0, stocks: 3, facing: i % 2 ? -1 : 1, grounded: false, jumps: 0, stun: 0, invincible: 60, cooldown: 0, attackFrame: 0, shield: 100, guarding: false, lastAttack: 0, lastAlt: 0, upHeld: false, killedBy: null, kos: 0, deaths: 0, respawn: 0, combo: 2, character: (seat - 1) % brawler_data_default.fighters.length };
    });
    return { gameId: "6232-server", round, tick: 0, phase: playing2 && players.length >= 2 ? "playing" : "waiting", winner: null, ack: [0, 0, 0, 0], inputs: Array.from({ length: 4 }, () => ({ ...EMPTY_INPUT })), mapId: stage.id, players, platforms: stage.platforms.map((p) => ({ ...p })), items: [], seed: seed >>> 0, nextItem: 0, flashes: [] };
  }
  function hit3(s, p, owner, amount, power, angle) {
    if (!p.alive || p.invincible || p.respawn) return;
    if (p.guarding && p.shield > 0) {
      p.shield = Math.max(0, p.shield - amount * 2);
      p.stun = p.shield === 0 ? 45 : 3;
      return;
    }
    const sender = s.players.find((x) => x.seat === owner);
    p.damage += Math.floor(amount * p.combo / 2);
    p.combo = clamp2(p.combo + 1, 2, 6);
    p.killedBy = owner;
    const launch = power + power * (sender ? stats[sender.character].weight : 1) - power * stats[p.character].weight + p.damage / 100 * Math.log(power) * power + p.combo / 4;
    p.vx = Math.cos(angle) * launch;
    p.vy = -Math.sin(angle) * launch;
    p.stun = clamp2(Math.ceil(launch * launch / 8), 6, 70);
    p.grounded = false;
    p.jumps = Math.max(1, p.jumps);
    p.attackFrame = 0;
    p.invincible = 6;
    if (sender) s.flashes.push({ x: p.x, y: p.y - 13, life: 7 });
  }
  function melee(s, p, i) {
    const special = i.down, upper = i.up, air = !p.grounded;
    p.cooldown = special ? 25 : upper ? 21 : 13;
    p.attackFrame = p.cooldown;
    const range = special ? 64 : upper ? 36 : 42, damage2 = special ? 10 : upper || air ? 10 : 5, power = special ? 5 : upper || air ? 6 : 3;
    for (const other of s.players) {
      if (other.seat === p.seat || !other.alive) continue;
      const dx = other.x - p.x, dy = other.y - p.y;
      const inFront = dx * p.facing >= -10;
      if (Math.abs(dx) <= range && Math.abs(dy) < (upper ? 75 : 32) && (inFront || special)) hit3(s, other, p.seat, damage2, power, upper ? Math.PI / 2 : Math.PI / 4 + (p.facing < 0 ? Math.PI / 2 : 0));
    }
  }
  function explode2(s, item) {
    s.flashes.push({ x: item.x, y: item.y - 12, life: 14 });
    for (const p of s.players) if (Math.hypot(p.x - item.x, p.y - 13 - item.y) < 90) hit3(s, p, item.owner, 20, 8, (p.x < item.x ? 3 : 1) * Math.PI / 4);
  }
  function loseStock(s, p) {
    p.stocks--;
    p.deaths++;
    p.alive = p.stocks > 0;
    p.respawn = p.alive ? 55 : 0;
    const killer = s.players.find((x) => x.seat === p.killedBy);
    if (killer && killer !== p) killer.kos++;
    p.damage = 0;
    p.vx = 0;
    p.vy = 0;
    p.stun = 0;
    p.jumps = 0;
    p.attackFrame = 0;
    p.guarding = false;
  }
  function move2(p, platforms2, down) {
    const oldY = p.y;
    p.x += p.vx;
    p.y += p.vy;
    p.grounded = false;
    for (const q of [...platforms2].sort((a, b) => a.y - b.y)) {
      if (p.x + 11 <= q.x || p.x - 11 >= q.x + q.w) continue;
      if (p.vy >= 0 && oldY <= q.y + 3 && p.y >= q.y && !(down && q.moving)) {
        p.y = q.y;
        p.vy = 0;
        p.grounded = true;
        p.jumps = 0;
        p.combo = 2;
        break;
      }
      if (!q.moving && q.h > 30 && p.y > q.y + 5 && p.y - 26 < q.y + q.h) {
        if (p.vx > 0 && p.x - 11 < q.x) {
          p.x = q.x - 11;
          p.vx = 0;
        } else if (p.vx < 0 && p.x + 11 > q.x + q.w) {
          p.x = q.x + q.w + 11;
          p.vx = 0;
        }
      }
    }
  }
  function step4(state, inputs) {
    const s = state;
    if (s.phase !== "playing") return;
    s.tick++;
    const stage = stageOf(s);
    s.flashes = s.flashes.filter((f) => --f.life > 0);
    for (const p of s.players) {
      const i = inputs[p.seat - 1] || EMPTY_INPUT;
      s.inputs[p.seat - 1] = { ...i };
      s.ack[p.seat - 1] = Math.max(s.ack[p.seat - 1], i.seq);
      const attack = i.attack > p.lastAttack, jump = i.alt > p.lastAlt || i.up && !p.upHeld;
      p.lastAttack = Math.max(p.lastAttack, i.attack);
      p.lastAlt = Math.max(p.lastAlt, i.alt);
      p.upHeld = i.up;
      if (!p.alive) continue;
      if (p.respawn) {
        if (--p.respawn === 0) {
          const pt = stage.spawns[(p.seat + s.tick) % stage.spawns.length];
          p.x = pt.x + 14;
          p.y = pt.y - 3;
          p.invincible = 65;
          p.shield = 100;
          p.killedBy = null;
        }
        continue;
      }
      if (p.invincible > 0) p.invincible--;
      if (p.cooldown > 0) p.cooldown--;
      if (p.attackFrame > 0) p.attackFrame--;
      if (p.stun > 0) p.stun--;
      p.guarding = i.down && p.grounded && !p.stun && !attack;
      p.shield = clamp2(p.shield + (p.guarding ? -0.28 : 0.35), 0, 100);
      if (!p.stun && !p.guarding) {
        const dir = Number(i.right) - Number(i.left);
        if (dir) {
          p.facing = dir;
          p.vx = 8 * stats[p.character].speed * dir;
        } else p.vx *= p.grounded ? 0.4 : 0.96;
        if (i.down && !p.grounded) p.vy = 8;
        if (jump && !p.cooldown && (p.jumps === 0 || p.jumps === 1 && p.vy >= -3)) {
          p.vy = -9;
          p.jumps++;
          p.grounded = false;
        }
        if (attack && !p.cooldown) {
          const pickup = s.items.find((it) => !it.armed && Math.hypot(it.x - p.x, it.y - p.y) < 30);
          if (pickup) {
            pickup.owner = p.seat;
            pickup.armed = true;
            pickup.vx = 7 * p.facing;
            pickup.vy = -5;
            pickup.timer = pickup.type === "grenade" ? 60 : 15;
            p.cooldown = 15;
          } else melee(s, p, i);
        }
      }
      p.vy = Math.min(p.stun ? 18 : 6, p.vy + 0.5);
      move2(p, s.platforms, i.down);
      if (p.x < stage.bounds[0] || p.x > stage.bounds[2] || p.y < stage.bounds[1] || p.y > stage.bounds[3]) loseStock(s, p);
    }
    if (s.tick % 210 === 0 && s.items.length < 6) {
      const q = s.platforms[Math.floor(random4(s) * s.platforms.length)];
      s.items.push({ id: s.nextItem++, type: random4(s) < 0.5 ? "grenade" : "mine", x: q.x + q.w * (0.15 + 0.7 * random4(s)), y: q.y - 80, vx: 0, vy: 0, timer: 600, owner: null, armed: false });
    }
    const dead = /* @__PURE__ */ new Set();
    for (const it of s.items) {
      const old = it.y;
      it.vy = Math.min(10, it.vy + 0.5);
      it.x += it.vx;
      it.y += it.vy;
      for (const q of s.platforms) if (it.x >= q.x && it.x < q.x + q.w && old <= q.y && it.y >= q.y) {
        it.y = q.y;
        it.vy = it.type === "grenade" && it.armed ? -Math.abs(it.vy) * 0.4 : 0;
        it.vx *= 0.7;
        break;
      }
      if (it.type === "mine" && it.armed && it.timer < 1 && s.players.some((p) => p.alive && p.seat !== it.owner && !p.respawn && Math.hypot(p.x - it.x, p.y - it.y) < 32)) {
        explode2(s, it);
        dead.add(it.id);
      } else if (--it.timer <= 0) {
        if (it.armed && it.type === "grenade") explode2(s, it);
        if (it.type === "grenade" || !it.armed) dead.add(it.id);
      }
      if (it.y > stage.bounds[3] + 100) dead.add(it.id);
    }
    s.items = s.items.filter((it) => !dead.has(it.id));
    const alive = s.players.filter((p) => p.alive);
    if (alive.length <= 1) {
      s.phase = "finished";
      s.winner = alive[0]?.seat ?? null;
    } else if (s.tick >= HZ5 * 300) {
      const ranked = [...alive].sort((a, b) => b.stocks - a.stocks || a.damage - b.damage);
      s.phase = "finished";
      s.winner = ranked[0].stocks === ranked[1].stocks && ranked[0].damage === ranked[1].damage ? null : ranked[0].seat;
    }
  }
  function valid4(value) {
    if (!value || typeof value !== "object") return false;
    const s = value;
    if (s.gameId !== "6232-server" || !stages.some((m) => m.id === s.mapId) || !["waiting", "playing", "finished"].includes(s.phase) || !Number.isSafeInteger(s.round) || !Number.isSafeInteger(s.tick) || s.tick < 0 || !Array.isArray(s.players) || s.players.length > 4 || !Array.isArray(s.ack) || s.ack.length !== 4 || !Array.isArray(s.platforms) || s.platforms.length > 30 || !Array.isArray(s.items) || s.items.length > 8 || !Array.isArray(s.flashes) || s.flashes.length > 50) return false;
    return Array.isArray(s.inputs) && s.inputs.length === 4 && s.inputs.every(validInput3) && s.players.every((p) => p && Number.isInteger(p.seat) && p.seat >= 1 && p.seat <= 4 && typeof p.alive === "boolean" && [p.x, p.y, p.vx, p.vy, p.damage, p.lastAttack, p.lastAlt, p.shield].every(Number.isFinite) && Number.isInteger(p.stocks) && p.stocks >= 0 && p.stocks <= 3 && Number.isSafeInteger(p.deaths) && p.deaths >= 0) && new Set(s.players.map((p) => p.seat)).size === s.players.length && s.platforms.every((p) => p && [p.x, p.y, p.w, p.h].every(Number.isFinite)) && s.items.every((i) => i && [i.x, i.y, i.vx, i.vy, i.timer].every(Number.isFinite) && ["mine", "grenade"].includes(i.type)) && s.flashes.every((f) => f && [f.x, f.y, f.life].every(Number.isFinite)) && s.ack.every((n) => Number.isSafeInteger(n) && n >= 0);
  }
  var images4 = {};
  function img(name) {
    if (!images4[name]) {
      images4[name] = new Image();
      images4[name].src = "/expanded/assets/brawler/" + name + ".png";
    }
    return images4[name];
  }
  function render4(canvas, state, seat) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = state || create4(0, false, [1, 2, 3, 4], 1), stage = stageOf(s);
    const bounds = stage.bounds, worldW = bounds[2] - bounds[0], worldH = bounds[3] - bounds[1];
    const scale = Math.min(canvas.width / worldW, (canvas.height - 75) / worldH);
    ctx.fillStyle = stage.id === "Space" ? "#09051c" : "#142030";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate((canvas.width - worldW * scale) / 2 - bounds[0] * scale, 45 - bounds[1] * scale);
    ctx.scale(scale, scale);
    const background = img(stage.id + "_Background"), bb = stage.backgroundBounds;
    if (background.complete && background.naturalWidth && bb) ctx.drawImage(background, bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]);
    const art2 = img(stage.id), ab = stage.artBounds;
    if (art2.complete && art2.naturalWidth && ab) ctx.drawImage(art2, ab[0], ab[1], ab[2] - ab[0], ab[3] - ab[1]);
    for (const p of s.platforms) {
      ctx.fillStyle = p.moving ? "#ab9974" : "#646979";
      ctx.fillRect(p.x, p.y, p.w, Math.min(p.h, 9));
      ctx.fillStyle = "#e2c878";
      ctx.fillRect(p.x, p.y, p.w, 2);
    }
    for (const it of s.items) {
      ctx.fillStyle = it.type === "grenade" ? "#77994c" : "#986c53";
      ctx.beginPath();
      ctx.arc(it.x, it.y - 5, 6, 0, Math.PI * 2);
      ctx.fill();
      if (it.armed) {
        ctx.fillStyle = "#f47b45";
        ctx.fillRect(it.x - 2, it.y - 13, 4, 4);
      }
    }
    const colors = ["#76e6ff", "#ff7b8c", "#a6f27b", "#dac0ff"];
    for (const p of s.players) {
      if (!p.alive || p.respawn) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(p.facing, 1);
      ctx.globalAlpha = p.invincible && Math.floor(s.tick / 3) % 2 ? 0.4 : 1;
      const fi = p.grounded ? Math.abs(p.vx) > 0.2 ? 2 : 1 : p.jumps > 1 ? 4 : 3;
      const sprite3 = img(brawler_data_default.fighters[p.character].id + "-" + fi);
      if (sprite3.complete && sprite3.naturalWidth) ctx.drawImage(sprite3, -14, -29, 28, 30);
      else {
        ctx.fillStyle = colors[p.seat - 1];
        ctx.fillRect(-10, -26, 20, 26);
      }
      if (p.guarding) {
        ctx.strokeStyle = colors[p.seat - 1];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -14, 20 * p.shield / 100 + 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (p.attackFrame > 0) {
        ctx.strokeStyle = "#ffe495";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(10, -16, 25, -1, 1);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = colors[p.seat - 1];
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.seat === seat ? "\u4F60" : `P${p.seat}`, p.x, p.y - 36);
    }
    for (const f of s.flashes) {
      ctx.fillStyle = "rgba(255,198,78,.65)";
      ctx.beginPath();
      ctx.arc(f.x, f.y, (15 - f.life) * 4 + 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,.65)";
    ctx.fillRect(0, 0, canvas.width, 44);
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ecdfb9";
    ctx.fillText(`\u75AF\u72C2\u5C0F\u6597\u58EB \xB7 ${stage.label}   \u51FB\u98DE\u51FA\u754C / 3 \u6761\u751F\u547D`, 18, 28);
    const width = canvas.width / 4;
    for (const p of s.players) {
      ctx.fillStyle = colors[p.seat - 1];
      ctx.font = "bold 17px sans-serif";
      ctx.fillText(`P${p.seat}  ${p.damage}%  ${"\u25CF".repeat(p.stocks)}  KO:${p.kos}`, (p.seat - 1) * width + 12, canvas.height - 15);
    }
    if (s.phase === "finished") {
      ctx.fillStyle = "rgba(0,0,0,.7)";
      ctx.fillRect(150, canvas.height / 2 - 50, canvas.width - 300, 100);
      ctx.fillStyle = "#ffe2a1";
      ctx.font = "bold 30px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(s.winner === null ? "\u5E73\u5C40" : `P${s.winner} \u83B7\u80DC\uFF01`, canvas.width / 2, canvas.height / 2 + 10);
    }
  }
  var adapter5 = { id: "6232-server", title: "\u75AF\u72C2\u5C0F\u4EBA\u6218\u6597", seats: 4, hz: HZ5, width: 1e3, height: 650, controls: "A/D \u6216 \u2190/\u2192 \u79FB\u52A8\uFF0CW/\u2191 \u4E8C\u6BB5\u8DF3\uFF0CJ/\u7A7A\u683C \u653B\u51FB/\u62FE\u53D6\uFF0C\u2191+\u653B\u51FB \u4E0A\u51FB\uFF0C\u2193+\u653B\u51FB \u7279\u6280\uFF0C\u2193 \u9632\u5FA1/\u7A7F\u8FC7\u8584\u5E73\u53F0\u3002", maps: stages.map((m) => ({ id: m.id, label: m.label })), create: create4, step: step4, valid: valid4, render: render4, consumeInput(state, seat, input) {
    const p = state.players.find((x) => x.seat === seat);
    if (p) {
      p.lastAttack = Math.max(p.lastAttack, input.attack);
      p.lastAlt = Math.max(p.lastAlt, input.alt);
      p.upHeld = input.up;
    }
  } };

  // src/expanded/forest-data.json
  var forest_data_default = { levels: [{ id: "forest_01", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0, 2, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 6, 6, 6, 6, 0, 0, 0, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 16, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 64, y: 896, properties: { char: "fb" } }, { gid: 17, height: 64, id: 5, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 64, y: 768, properties: { char: "wg" } }, { gid: 19, height: 64, id: 9, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1136, y: 192, properties: { char: "wg" } }, { gid: 18, height: 64, id: 10, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1024, y: 192, properties: { char: "fb" } }, { gid: 21, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 720, y: 496, properties: { char: "wg" } }, { gid: 21, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 728, y: 176, properties: { char: "wg" } }, { gid: 21, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 40, y: 216, properties: { char: "wg" } }, { gid: 20, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 338, y: 112, properties: { char: "fb" } }, { gid: 20, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 208, y: 456, properties: { char: "fb" } }, { gid: 20, height: 64, id: 17, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 624, y: 880, properties: { char: "fb" } }, { gid: 21, height: 64, id: 18, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 880, y: 878, properties: { char: "wg" } }, { gid: 24, height: 64, id: 20, name: "", properties: { group: 5 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 960, y: 384 }, { gid: 24, height: 64, id: 22, name: "", properties: { group: 5 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 320, y: 512 }, { gid: 26, height: 64, id: 25, name: "", properties: { group: 4, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 272, y: 672 }, { height: 32, id: 30, name: "", properties: { dx: 0, dy: -3, group: 5 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 128, x: 1088, y: 384 }, { gid: 28, height: 64, id: 32, name: "", rotation: 0, type: "box", visible: true, width: 64, x: 704, y: 288, properties: {} }, { height: 32, id: 33, name: "", properties: { dx: 0, dy: -3, group: 4 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 128, x: 32, y: 480 }], properties: {}, sha256: "35c499b8a25b59ab0907f91818d333320dc62ec7da5c079c9bb51424486d2289" }, { id: "forest_02", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, 7, 7, 7, 7, 7, 7, 7, 7, 7, 0, 0, 0, 0, 0, 0, 7, 7, 7, 7, 7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1, 5, 5, 5, 5, 5, 5, 5, 5, 5, -1, -1, -1, -1, -1, -1, -1, 6, 6, 6, 6, 6, 6, 6, 6, 6, -1, -1, -1, -1, 1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 6, 6, 6, 6, 6, 6, 6, 6, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 16, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 40, y: 896, properties: { char: "fb" } }, { gid: 17, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 120, y: 896, properties: { char: "wg" } }, { gid: 18, height: 64, id: 5, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 64, y: 160, properties: { char: "fb" } }, { gid: 19, height: 64, id: 6, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 176, y: 160, properties: { char: "wg" } }, { gid: 21, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 624, y: 152, properties: { char: "wg" } }, { gid: 21, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 640, y: 424, properties: { char: "wg" } }, { gid: 21, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 304, y: 624, properties: { char: "wg" } }, { gid: 21, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 232, y: 800, properties: { char: "wg" } }, { gid: 21, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 376, y: 800, properties: { char: "wg" } }, { gid: 21, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 744, y: 896, properties: { char: "wg" } }, { gid: 21, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 888, y: 896, properties: { char: "wg" } }, { gid: 21, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 744, y: 624, properties: { char: "wg" } }, { gid: 20, height: 64, id: 17, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 888, y: 624, properties: { char: "fb" } }, { gid: 20, height: 64, id: 18, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 464, y: 624, properties: { char: "fb" } }, { gid: 20, height: 64, id: 19, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 560, y: 152, properties: { char: "fb" } }, { gid: 20, height: 64, id: 20, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 576, y: 424, properties: { char: "fb" } }, { gid: 20, height: 64, id: 21, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 240, y: 896, properties: { char: "fb" } }, { gid: 20, height: 64, id: 22, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 376, y: 896, properties: { char: "fb" } }, { gid: 20, height: 64, id: 23, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 744, y: 800, properties: { char: "fb" } }, { gid: 20, height: 64, id: 24, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 888, y: 800, properties: { char: "fb" } }, { gid: 23, height: 64, id: 25, name: "", rotation: 0, type: "pusher", visible: true, width: 64, x: 1008, y: 672, properties: { group: 0 } }, { gid: 23, height: 64, id: 26, name: "", rotation: 0, type: "pusher", visible: true, width: 64, x: 160, y: 672, properties: { group: 0 } }, { gid: 23, height: 64, id: 27, name: "", properties: { group: 2 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 288, y: 192 }, { gid: 23, height: 64, id: 28, name: "", properties: { group: 2 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 880, y: 192 }, { height: 32, id: 32, name: "", properties: { dx: 5, group: 2 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 160, x: 704, y: 160 }, { height: 128, id: 36, name: "", properties: { dx: 0, dy: 4 }, propertytypes: { dx: "int", dy: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 624, y: 512 }, { height: 0, id: 41, name: "", polyline: [{ x: 0, y: 0 }, { x: 0, y: 144 }, { x: 0, y: 152 }], properties: { fullRotation: true }, propertytypes: { fullRotation: "bool" }, rotation: 0, type: "hanging", visible: true, width: 0, x: 384, y: 264 }, { height: 0, id: 42, name: "", polyline: [{ x: 0, y: 0 }, { x: 0, y: 160 }], properties: { fullRotation: true }, propertytypes: { fullRotation: "bool" }, rotation: 0, type: "hanging", visible: true, width: 0, x: 864, y: 264 }], properties: {}, sha256: "6842996e0277a3eb3f5e20c42725e251da22bd9278b01c7840065fd75ea1bdad" }, { id: "forest_03", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, 0, 0, 4, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 6, 6, 6, 6, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 5, 5, 5, 5, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 6, 6, 6, 6, 6, 6, 6, 6, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 6, 6, 6, 6, 6, 6, 6, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0], objects: [{ gid: 16, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 32, y: 896, properties: { char: "fb" } }, { gid: 17, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 1152, y: 895, properties: { char: "wg" } }, { gid: 18, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 351, y: 575, properties: { char: "fb" } }, { gid: 19, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 832, y: 576, properties: { char: "wg" } }, { gid: 20, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 336, y: 416, properties: { char: "fb" } }, { gid: 20, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 704, y: 320, properties: { char: "fb" } }, { gid: 20, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 752, y: 128, properties: { char: "fb" } }, { gid: 20, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1136, y: 384, properties: { char: "fb" } }, { gid: 20, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1138, y: 290, properties: { char: "fb" } }, { gid: 20, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1136, y: 192, properties: { char: "fb" } }, { gid: 20, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 848, y: 704, properties: { char: "fb" } }, { gid: 20, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 960, y: 704, properties: { char: "fb" } }, { gid: 20, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 224, y: 896, properties: { char: "fb" } }, { gid: 20, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 336, y: 896, properties: { char: "fb" } }, { gid: 20, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 440, y: 840, properties: { char: "fb" } }, { gid: 21, height: 64, id: 18, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 430, y: 128, properties: { char: "wg" } }, { gid: 21, height: 64, id: 19, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 48, y: 192, properties: { char: "wg" } }, { gid: 21, height: 64, id: 20, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 48, y: 288, properties: { char: "wg" } }, { gid: 21, height: 64, id: 21, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 48, y: 384, properties: { char: "wg" } }, { gid: 21, height: 64, id: 22, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 848, y: 416, properties: { char: "wg" } }, { gid: 21, height: 64, id: 23, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 848, y: 896, properties: { char: "wg" } }, { gid: 21, height: 64, id: 24, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 960, y: 896, properties: { char: "wg" } }, { gid: 21, height: 64, id: 25, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 741, y: 842, properties: { char: "wg" } }, { gid: 21, height: 64, id: 26, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 224, y: 704, properties: { char: "wg" } }, { gid: 21, height: 64, id: 27, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 336, y: 704, properties: { char: "wg" } }, { gid: 21, height: 64, id: 31, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 480, y: 320, properties: { char: "wg" } }, { gid: 25, height: 96, id: 28, name: "", properties: { group: 0, length: 15, initialState: 1 }, propertytypes: { initialState: "int", length: "float" }, rotation: -89.4044002997939, type: "wind", visible: true, width: 64, x: 1216, y: 512 }, { gid: 25, height: 96, id: 29, name: "", properties: { group: 0, length: 15, initialState: 1 }, propertytypes: { initialState: "int", length: "float" }, rotation: -88.661910879657, type: "wind", visible: true, width: 64, x: 128, y: 512 }], properties: {}, sha256: "a44c2bea56579af14235ca412d3e7da112cc7da497db229159e2e69e495e4bfe" }, { id: "forest_04", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 1, 0, 0, 6, 6, 6, 6, 6, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, 0, 0, 4, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 16, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 160, y: 896, properties: { char: "fb" } }, { gid: 17, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 1152, y: 160, properties: { char: "wg" } }, { gid: 18, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 176, y: 736, properties: { char: "fb" } }, { gid: 19, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 272, y: 736, properties: { char: "wg" } }, { gid: 21, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 880, y: 320, properties: { char: "wg" } }, { gid: 21, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 880, y: 416, properties: { char: "wg" } }, { gid: 21, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1136, y: 528, properties: { char: "wg" } }, { gid: 21, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 976, y: 816, properties: { char: "wg" } }, { gid: 21, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 744, y: 752, properties: { char: "wg" } }, { gid: 21, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 560, y: 688, properties: { char: "wg" } }, { gid: 20, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 48, y: 112, properties: { char: "fb" } }, { gid: 20, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 48, y: 464, properties: { char: "fb" } }, { gid: 20, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 48, y: 624, properties: { char: "fb" } }, { gid: 20, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 464, y: 784, properties: { char: "fb" } }, { gid: 20, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 664, y: 752, properties: { char: "fb" } }, { gid: 20, height: 64, id: 25, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 480, y: 544, properties: { char: "fb" } }, { gid: 26, height: 64, id: 16, name: "", properties: { group: 4, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 112, y: 160 }, { gid: 24, height: 64, id: 17, name: "", properties: { group: 5 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 1008, y: 480 }, { height: 136, id: 22, name: "", properties: { dx: 0, dy: -4, group: 5 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 224, y: 64 }, { height: 128, id: 24, name: "", properties: { dx: 0, dy: -4, group: 4 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 352, y: 672 }, { gid: 28, height: 64, id: 26, name: "", rotation: 0, type: "box", visible: true, width: 64, x: 1055, y: 159, properties: {} }, { height: 0, id: 28, name: "", polyline: [{ x: 0, y: -10 }, { x: 0, y: -840 }, { x: 832, y: -840 }, { x: 832, y: -696 }], rotation: 0, type: "pulley", visible: true, width: 0, x: 80, y: 890, properties: {} }], properties: {}, sha256: "7c5db152abb76dc5a81e8e856fc4399f97e93bf644a56365b72d862511de55a1" }, { id: "forest_05", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, 5, 5, 5, 5, 5, 5, 5, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 6, 6, 6, 6, 6, 6, 6, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, 0, -1, -1, -1, 1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, 0, -1, -1, -1, 1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, 0, -1, -1, -1, 1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 16, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 384, y: 896, properties: { char: "fb" } }, { gid: 17, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 800, y: 896, properties: { char: "wg" } }, { gid: 19, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 272, y: 544, properties: { char: "wg" } }, { gid: 18, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 916, y: 544, properties: { char: "fb" } }, { gid: 21, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 112, y: 768, properties: { char: "wg" } }, { gid: 21, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 112, y: 544, properties: { char: "wg" } }, { gid: 21, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 112, y: 160, properties: { char: "wg" } }, { gid: 21, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 304, y: 112, properties: { char: "wg" } }, { gid: 21, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 640, y: 224, properties: { char: "wg" } }, { gid: 21, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 240, y: 416, properties: { char: "wg" } }, { gid: 20, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 881, y: 115, properties: { char: "fb" } }, { gid: 20, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 544, y: 224, properties: { char: "fb" } }, { gid: 20, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 940, y: 417, properties: { char: "fb" } }, { gid: 20, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1072, y: 160, properties: { char: "fb" } }, { gid: 20, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1072, y: 544, properties: { char: "fb" } }, { gid: 20, height: 64, id: 17, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1072, y: 768, properties: { char: "fb" } }, { gid: 21, height: 64, id: 25, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 800, y: 704, properties: { char: "wg" } }, { gid: 20, height: 64, id: 59, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 384, y: 512, properties: { char: "fb" } }, { height: 32, id: 52, name: "", properties: { group: 2 }, propertytypes: { group: "int" }, rotation: 0, type: "platform", visible: true, width: 128, x: 608, y: 608 }, { gid: 25, height: 64, id: 53, name: "", rotation: 0, type: "lever", visible: true, width: 64, x: 392, y: 352, properties: { group: 0, onis: -1, startPos: 1 } }, { gid: 25, height: 64, id: 54, name: "", properties: { group: 3, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 392, y: 734 }, { height: 32, id: 55, name: "", properties: { dx: -4 }, propertytypes: { dx: "int" }, rotation: 0, type: "platform", visible: true, width: 128, x: 512, y: 417 }, { height: 32, id: 56, name: "", properties: { dx: -4, group: 3 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 136, x: 504, y: 802 }, { gid: 24, height: 64, id: 57, name: "", properties: { group: 2, onis: 1, startPos: -1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 784, y: 546 }, { height: 0, id: 58, name: "", polyline: [{ x: 0, y: -32 }, { x: 0, y: -784 }, { x: 960, y: -784 }, { x: 960, y: -640 }], rotation: 0, type: "pulley", visible: true, width: 0, x: 144, y: 832, properties: {} }], properties: {}, sha256: "fe63f5b429d0683ffe48b90aa708a3757a7d8867c8b6a717673ddf112ee371f3" }, { id: "forest_06", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, 3, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, 3, 2, -1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, 3, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 4, -1, -1, -1, -1, -1, 0, 0, -1, -1, 1, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, 1, 0, 0, 2, -1, 1, 4, -1, 0, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 1, 0, 0, 0, 2, -1, -1, 1, 0, 0, 0, 0, 0, 4, -1, -1, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, 3, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 2, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 4, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, -1, 1, 4, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 3, 0, 6, 6, 6, 6, 0, 0, 6, 6, 6, 6, 0, 0, 6, 6, 6, 6, 0, 4, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, 0, 0, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, -1, 3, 2, -1, 1, 0, 0, 2, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, -1, -1, 3, 0, 0, 0, 0, 0, 2, -1, -1, 1, 0, 0, 0, 2, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, 0, 0, 6, 6, 6, 0, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, 4, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 17, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 80, y: 544, properties: { char: "wg" } }, { gid: 16, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 1096, y: 160, properties: { char: "fb" } }, { gid: 18, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1008, y: 480, properties: { char: "fb" } }, { gid: 19, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 144, y: 896, properties: { char: "wg" } }, { gid: 20, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 816, y: 208, properties: { char: "fb" } }, { gid: 20, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 624, y: 208, properties: { char: "fb" } }, { gid: 20, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 432, y: 208, properties: { char: "fb" } }, { gid: 20, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 304, y: 112, properties: { char: "fb" } }, { gid: 20, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 128, y: 240, properties: { char: "fb" } }, { gid: 20, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 96, y: 368, properties: { char: "fb" } }, { gid: 20, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 512, y: 352, properties: { char: "fb" } }, { gid: 20, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 768, y: 352, properties: { char: "fb" } }, { gid: 21, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 368, y: 592, properties: { char: "wg" } }, { gid: 21, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 560, y: 592, properties: { char: "wg" } }, { gid: 21, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 752, y: 592, properties: { char: "wg" } }, { gid: 21, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 880, y: 496, properties: { char: "wg" } }, { gid: 21, height: 64, id: 17, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1056, y: 624, properties: { char: "wg" } }, { gid: 21, height: 64, id: 18, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 672, y: 736, properties: { char: "wg" } }, { gid: 21, height: 64, id: 19, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1088, y: 752, properties: { char: "wg" } }, { gid: 21, height: 64, id: 20, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 416, y: 736, properties: { char: "wg" } }], properties: {}, sha256: "c2c9663ab2419b5ef43cfe8f59e788f93f894eb394d068c506d89772dc48c8b2" }, { id: "forest_07", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, 0, 0, 6, 6, 6, 6, 6, 2, -1, -1, 1, 0, 2, -1, -1, -1, 1, 0, 0, 0, 0, 2, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, -1, -1, -1, 3, 0, 0, 0, 0, 0, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, 0, 0, 2, -1, -1, -1, 0, 0, 0, 0, 2, -1, 3, 0, 0, 4, -1, -1, -1, -1, -1, 1, 0, 0, 4, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, 0, -1, 0, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, 3, 0, -1, 1, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, 0, -1, 0, 0, 2, -1, -1, 0, -1, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 0, -1, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 4, -1, 3, 0, -1, -1, 0, -1, 0, 0, -1, 0, 0, 0, 2, -1, -1, -1, -1, -1, 1, 4, -1, -1, 0, -1, 3, 0, -1, -1, -1, -1, 0, -1, -1, 0, 0, 0, 4, -1, -1, -1, 3, 2, -1, 0, -1, 0, 0, 4, -1, -1, -1, 3, 4, -1, -1, -1, 1, 4, -1, -1, 1, 0, 2, -1, 3, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 4, -1, -1, -1, -1, 3, 0, 2, -1, 3, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 2, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, -1, -1, 3, 2, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 4, -1, 0, 0, -1, -1, -1, 3, 2, -1, 1, 0, 0, 4, -1, 2, -1, -1, -1, -1, -1, -1, 0, -1, -1, 3, 0, 0, 0, 0, 0, 7, 7, 7, 7, 7, 0, 4, -1, -1, 1, 0, 0, 2, -1, -1, -1, 3, 0, 0, 0, 4, -1, 1, 4, -1, -1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, 0, 0, 0, 0, 2, -1, -1, -1, -1, 0, -1, -1, 4, -1, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, 0, 0, 4, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, 4, -1, 1, 0, 0, 0, -1, -1, 1, 4, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, 0, 0, -1, -1, -1, -1, 1, 0, 0, 4, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 1, 0, 0, -1, -1, -1, 1, 0, 0, 4, -1, -1, -1, -1, -1, 1, 0, 4, -1, -1, -1, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 1, -1, 0, 0, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, -1, -1, 2, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, -1, -1, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, 0, 0, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 17, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 480, y: 128, properties: { char: "wg" } }, { gid: 16, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 816, y: 128, properties: { char: "fb" } }, { gid: 18, height: 64, id: 23, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 760, y: 896, properties: { char: "fb" } }, { gid: 19, height: 64, id: 24, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 879, y: 895, properties: { char: "wg" } }, { gid: 22, height: 64, id: 25, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 792, y: 720, properties: { char: "silver" } }, { height: 96, id: 13, name: "", properties: { dx: 0, dy: 3, group: 5 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 576, y: 736 }, { height: 96, id: 14, name: "", properties: { dtheta: 90, group: 0, offsetY: -1 }, propertytypes: { dtheta: "float", group: "int", offsetY: "float" }, rotation: 0, type: "platform", visible: true, width: 32, x: 1056, y: 800 }, { height: 96, id: 15, name: "", properties: { dtheta: 90, group: 1, offsetY: -1 }, propertytypes: { dtheta: "float", group: "int", offsetY: "float" }, rotation: 0, type: "platform", visible: true, width: 32, x: 640, y: 576 }, { height: 96, id: 16, name: "", properties: { dtheta: 90, group: 3, offsetY: -1 }, propertytypes: { dtheta: "float", group: "int", offsetY: "float" }, rotation: 0, type: "platform", visible: true, width: 32, x: 1056, y: 640 }, { height: 96, id: 17, name: "", properties: { dtheta: 90, group: 2, offsetY: -1 }, propertytypes: { dtheta: "float", group: "int", offsetY: "float" }, rotation: 0, type: "platform", visible: true, width: 32, x: 288, y: 704 }, { gid: 23, height: 64, id: 18, name: "", properties: { group: 5 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 224, y: 832 }, { gid: 23, height: 64, id: 19, name: "", properties: { group: 2 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 320, y: 832 }, { gid: 23, height: 64, id: 20, name: "", properties: { group: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 640, y: 736 }, { gid: 23, height: 64, id: 21, name: "", properties: { group: 3 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 864, y: 352 }, { gid: 25, height: 64, id: 22, name: "", rotation: 0, type: "lever", visible: true, width: 64, x: 480, y: 832, properties: { group: 0, onis: -1, startPos: 1 } }, { gid: 33, height: 64, id: 26, name: "", rotation: 0, type: "ball", visible: true, width: 64, x: 1056, y: 128, properties: {} }, { gid: 33, height: 64, id: 27, name: "", rotation: 0, type: "ball", visible: true, width: 64, x: 608, y: 256, properties: {} }, { gid: 33, height: 64, id: 28, name: "", rotation: 0, type: "ball", visible: true, width: 64, x: 288, y: 224, properties: {} }], properties: {}, sha256: "6f2cb761d48e251c091594141d68992f58355057dea36bc4992cf39660aa7681" }, { id: "forest_08", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, 0, 5, 5, 5, 5, 5, 0, 6, 6, 6, 0, 5, 5, 5, 5, 5, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 2, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, 3, 0, 0, 0, -1, 0, 0, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, 0, 0, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, 0, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, 0, -1, 0, 0, 0, -1, 0, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, 0, -1, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, 0, 0, 4, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 1, -1, -1, 0, 0, -1, 0, 0, -1, -1, -1, 0, 0, 0, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 3, 2, -1, 3, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 6, 6, 6, 6, 4, -1, -1, -1, 0, 2, -1, 3, 2, -1, 3, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 2, -1, 3, 2, -1, 3, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, 0, -1, -1, 0, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, 0, -1, -1, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 6, 6, 6, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 17, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 128, y: 192, properties: { char: "wg" } }, { gid: 16, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 32, y: 192, properties: { char: "fb" } }, { gid: 18, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 352, y: 384, properties: { char: "fb" } }, { gid: 19, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 704, y: 384, properties: { char: "wg" } }, { gid: 21, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 688, y: 192, properties: { char: "wg" } }, { gid: 21, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 368, y: 192, properties: { char: "wg" } }, { gid: 21, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 768, y: 496, properties: { char: "wg" } }, { gid: 21, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 288, y: 736, properties: { char: "wg" } }, { gid: 21, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 32, y: 496, properties: { char: "wg" } }, { gid: 20, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 704, y: 736, properties: { char: "fb" } }, { gid: 20, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 720, y: 896, properties: { char: "fb" } }, { gid: 20, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1120, y: 96, properties: { char: "fb" } }, { gid: 20, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 128, y: 544, properties: { char: "fb" } }, { gid: 23, height: 64, id: 14, name: "", properties: { group: 5 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 1152, y: 928 }, { gid: 23, height: 64, id: 15, name: "", rotation: 0, type: "pusher", visible: true, width: 64, x: 1056, y: 928, properties: { group: 0 } }, { gid: 25, height: 64, id: 16, name: "", properties: { group: 1, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 416, y: 928 }, { gid: 24, height: 64, id: 17, name: "", properties: { group: 2, onis: 1, startPos: -1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 160, y: 928 }, { height: 96, id: 20, name: "", properties: { dx: 0, dy: -3 }, propertytypes: { dx: "int", dy: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 608, y: 384 }, { height: 160, id: 24, name: "", properties: { dx: 0, dy: 4, group: 2 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 480, y: 224 }, { height: 160, id: 27, name: "", properties: { dx: 0, dy: 4, group: 1 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 608, y: 225 }, { gid: 33, height: 64, id: 29, name: "", rotation: 0, type: "ball", visible: true, width: 64, x: 1056, y: 192, properties: {} }, { gid: 33, height: 64, id: 30, name: "", rotation: 0, type: "ball", visible: true, width: 64, x: 960, y: 384, properties: {} }, { height: 32, id: 32, name: "", properties: { dx: 2, group: 5 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 1120, y: 704 }], properties: {}, sha256: "1deaf266162b24ca5ef1458cd9b875dcd6dd22177c3de7c7bedc77ae657944a6" }, { id: "forest_09", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 2, -1, -1, -1, 3, 0, 0, 4, -1, -1, -1, 3, 0, 0, 0, -1, -1, 0, 0, 0, 0, 6, 6, 6, 0, 0, 5, 5, 5, 0, 0, 6, 6, 6, 0, 0, 4, -1, -1, 3, 2, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 3, 2, -1, -1, 1, -1, -1, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 5, 5, 0, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 2, -1, 0, 0, 0, 0, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, 0, 0, -1, -1, 3, 0, -1, -1, 0, 0, -1, -1, 0, 5, 5, 0, 0, 5, 5, 5, 0, 0, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, 3, -1, -1, 0, 0, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, 3, 0, 0, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 2, -1, -1, 0, 0, -1, -1, 0, 0, 5, 5, 5, 5, 5, 0, 0, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 4, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 1, 0, 4, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 5, 5, 5, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, 1, 0, 4, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 1, 7, 7, 7, 7, 7, 7, 7, 7, 7, 0, 0, 0, -1, 0, 0, 0, 2, -1, -1, 1, 4, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 17, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 128, y: 192, properties: { char: "wg" } }, { gid: 16, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 48, y: 160, properties: { char: "fb" } }, { gid: 18, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 160, y: 864, properties: { char: "fb" } }, { gid: 19, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 64, y: 864, properties: { char: "wg" } }, { gid: 20, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 240, y: 192, properties: { char: "fb" } }, { gid: 20, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 560, y: 192, properties: { char: "fb" } }, { gid: 20, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 400, y: 656, properties: { char: "fb" } }, { gid: 20, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 896, y: 720, properties: { char: "fb" } }, { gid: 20, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 928, y: 336, properties: { char: "fb" } }, { gid: 20, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 544, y: 352, properties: { char: "fb" } }, { gid: 20, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 288, y: 351, properties: { char: "fb" } }, { gid: 21, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1104, y: 720, properties: { char: "wg" } }, { gid: 21, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 992, y: 560, properties: { char: "wg" } }, { gid: 21, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 448, y: 776, properties: { char: "wg" } }, { gid: 21, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 240, y: 128, properties: { char: "wg" } }, { gid: 21, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 560, y: 128, properties: { char: "wg" } }, { gid: 21, height: 64, id: 17, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 400, y: 192, properties: { char: "wg" } }, { gid: 21, height: 64, id: 18, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 992, y: 144, properties: { char: "wg" } }, { gid: 25, height: 96, id: 19, name: "", properties: { group: 4, length: 15, initialState: 1 }, propertytypes: { group: "int", initialState: "int", length: "float" }, rotation: 0, type: "wind", visible: true, width: 64, x: 866, y: 579 }, { gid: 27, height: 64, id: 20, name: "", properties: { group: 4, onis: 1, startPos: 1 }, propertytypes: { group: "int", onis: "int", startPos: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 176, y: 640 }], properties: {}, sha256: "51669bd28afac67b548a4e8c5880ed2c87f91910b629ae3b3735f530822baaa8" }, { id: "forest_10", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, 4, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, -1, 0, 0, 4, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 1, 0, 6, 6, 6, 6, 6, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, -1, -1, 0, -1, -1, -1, 1, 5, 5, 5, 5, 5, 5, 5, 0, 4, -1, -1, 0, 0, 6, 6, 6, 0, 6, 6, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 0, 0, -1, -1, 0, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, 0, -1, -1, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 2, -1, -1, 0, 0, 0, 0, 0, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, -1, 0, -1, -1, 3, 0, 0, 0, 0, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 5, 5, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, -1, -1, -1, -1, -1, -1, 1, 0, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, 0, 0, 5, 5, 0, 5, 5, 5, 0, 0, 5, 5, 5, 0, 2, -1, -1, 0, 0, 4, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 0, 4, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 1, 2, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, 1, 2, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 16, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 528, y: 160, properties: { char: "fb" } }, { gid: 17, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 560, y: 160, properties: { char: "wg" } }, { gid: 19, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 48, y: 800, properties: { char: "wg" } }, { gid: 18, height: 64, id: 5, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1136, y: 640, properties: { char: "fb" } }, { gid: 20, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 400, y: 752, properties: { char: "fb" } }, { gid: 20, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1120, y: 160, properties: { char: "fb" } }, { gid: 20, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 752, y: 208, properties: { char: "fb" } }, { gid: 20, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 240, y: 128, properties: { char: "fb" } }, { gid: 20, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 736, y: 416, properties: { char: "fb" } }, { gid: 20, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 384, y: 528, properties: { char: "fb" } }, { gid: 21, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 192, y: 368, properties: { char: "wg" } }, { gid: 21, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 416, y: 216, properties: { char: "wg" } }, { gid: 21, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 960, y: 272, properties: { char: "wg" } }, { gid: 21, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 800, y: 608, properties: { char: "wg" } }, { gid: 21, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 912, y: 816, properties: { char: "wg" } }, { gid: 21, height: 64, id: 17, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1056, y: 480, properties: { char: "wg" } }, { gid: 25, height: 64, id: 18, name: "", properties: { group: 4, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 1088, y: 224 }, { gid: 24, height: 64, id: 19, name: "", properties: { group: 3, onis: 1, startPos: -1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 288, y: 416 }, { height: 96, id: 21, name: "", properties: { dx: 0, dy: 3, group: 4 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 384, y: 32 }, { height: 32, id: 24, name: "", properties: { dx: -3, group: 3 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 128, x: 1024, y: 288 }], properties: {}, sha256: "71e6a1f5e0e7a3cdb9f8e02fecc281527d1461cbaf06f3bbb437557a39b9a44d" }, { id: "forest_11", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, 0, 2, -1, -1, 1, 0, 2, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, 0, -1, -1, 3, 2, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, 0, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, 0, 2, 1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, 0, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, 1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 2, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 0, 0, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, 0, -1, 0, 0, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 6, 6, 6, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, 0, 0, -1, 3, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 3, 4, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 4, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 2, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, 1, 0, 6, 6, 6, 6, 6, 2, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 18, height: 64, id: 1, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 432, y: 896, properties: { char: "fb" } }, { gid: 19, height: 64, id: 2, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1136, y: 896, properties: { char: "wg" } }, { gid: 16, height: 64, id: 3, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 960, y: 895, properties: { char: "fb" } }, { gid: 17, height: 64, id: 4, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 528, y: 896, properties: { char: "wg" } }, { gid: 22, height: 64, id: 18, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 96, y: 672, properties: { char: "silver" } }, { gid: 26, height: 64, id: 5, name: "", properties: { group: 3, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 768, y: 704 }, { gid: 26, height: 64, id: 6, name: "", properties: { group: 2, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 64, y: 928 }, { gid: 24, height: 64, id: 7, name: "", properties: { group: 5 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 480, y: 576 }, { height: 32, id: 8, name: "", properties: { dx: 3, group: 5 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 896, y: 480 }, { height: 96, id: 10, name: "", properties: { dx: 0, dy: -3, group: 3 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 864, y: 736 }, { height: 96, id: 16, name: "", properties: { dx: 0, dy: 3, group: 2 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 128, y: 480 }], properties: {}, sha256: "151d8252bb66098efa8b0739384f9d091bc009a1e4c9002e6b153ea92c3e9183" }, { id: "forest_12", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, 3, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 4, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, 3, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 4, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 4, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 4, -1, -1, 3, 0, 2, -1, -1, -1, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, -1, 1, 0, 4, -1, -1, 3, 0, 0, -1, -1, -1, -1, 3, 0, 2, -1, -1, -1, 1, 0, 4, 3, 0, 2, -1, -1, -1, -1, -1, 1, 0, 4, 3, 0, 2, -1, -1, -1, 1, 0, 4, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 4, -1, -1, 3, 0, 2, -1, -1, -1, 1, 0, 4, -1, -1, 3, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, 1, 0, 0, 0, 4, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 3, 0, 2, -1, -1, -1, 1, 0, 4, -1, 3, 0, 4, -1, 3, 0, 2, -1, -1, -1, 1, 0, 4, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 6, 6, 6, 0, 4, -1, -1, -1, -1, -1, -1, -1, 3, 0, 5, 5, 5, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 1, 0, 0, 4, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 3, 0, 0, 2, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 7, 7, 7, 7, 7, 7, 7, 7, 7, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 16, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 64, y: 160, properties: { char: "fb" } }, { gid: 17, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 1120, y: 160, properties: { char: "wg" } }, { gid: 20, height: 64, id: 3, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 224, y: 240, properties: { char: "fb" } }, { gid: 20, height: 64, id: 4, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 544, y: 256, properties: { char: "fb" } }, { gid: 20, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 816, y: 416, properties: { char: "fb" } }, { gid: 20, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1024, y: 640, properties: { char: "fb" } }, { gid: 20, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 864, y: 816, properties: { char: "fb" } }, { gid: 20, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 696, y: 720, properties: { char: "fb" } }, { gid: 20, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 440, y: 720, properties: { char: "fb" } }, { gid: 20, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 568, y: 688, properties: { char: "fb" } }, { gid: 20, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 224, y: 864, properties: { char: "fb" } }, { gid: 20, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1120, y: 352, properties: { char: "fb" } }, { gid: 21, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 64, y: 352, properties: { char: "wg" } }, { gid: 21, height: 64, id: 17, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 640, y: 256, properties: { char: "wg" } }, { gid: 21, height: 64, id: 18, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 960, y: 240, properties: { char: "wg" } }, { gid: 21, height: 64, id: 19, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 368, y: 416, properties: { char: "wg" } }, { gid: 21, height: 64, id: 20, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 160, y: 640, properties: { char: "wg" } }, { gid: 21, height: 64, id: 21, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 320, y: 816, properties: { char: "wg" } }, { gid: 21, height: 64, id: 22, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 960, y: 864, properties: { char: "wg" } }, { gid: 21, height: 64, id: 23, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 744, y: 721, properties: { char: "wg" } }, { gid: 21, height: 64, id: 24, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 616, y: 688, properties: { char: "wg" } }, { gid: 21, height: 64, id: 25, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 488, y: 720, properties: { char: "wg" } }, { gid: 19, height: 64, id: 26, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1104, y: 896, properties: { char: "wg" } }, { gid: 18, height: 64, id: 27, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 80, y: 896, properties: { char: "fb" } }, { height: 0, id: 31, name: "", polyline: [{ x: 0, y: 0 }, { x: 0, y: 176 }], properties: { fullRotation: true }, propertytypes: { fullRotation: "bool" }, rotation: 0, type: "hanging", visible: true, width: 0, x: 752, y: 560 }, { height: 0, id: 32, name: "", polyline: [{ x: 0, y: 0 }, { x: 0, y: 176 }], properties: { fullRotation: true }, propertytypes: { fullRotation: "bool" }, rotation: 0, type: "hanging", visible: true, width: 0, x: 496, y: 560 }, { height: 0, id: 33, name: "", polyline: [{ x: 0, y: 0 }, { x: 0, y: 176 }], properties: { fullRotation: true }, propertytypes: { fullRotation: "bool" }, rotation: 0, type: "hanging", visible: true, width: 0, x: 624, y: 528 }], properties: {}, sha256: "8ea1e3375ad96b7fd902fc907dfbe13b4bd876688597732008c86db9995b30d3" }, { id: "forest_13", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, 0, 0, 4, 0, 3, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 0, 0, 4, 0, 3, 0, 0, -1, -1, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, -1, -1, 0, 0, 2, 0, 1, 0, 0, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, 0, 0, 2, 0, 1, 0, 0, -1, -1, 0, 0, 0, 4, -1, -1, 3, 0, 0, 0, 0, 0, 4, -1, -1, 3, 0, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 4, -1, -1, 3, 0, 0, 0, 0, 0, 4, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, -1, -1, -1, 0, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 18, height: 64, id: 1, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 64, y: 768, properties: { char: "fb" } }, { gid: 19, height: 64, id: 2, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 192, y: 768, properties: { char: "wg" } }, { gid: 17, height: 64, id: 3, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 192, y: 608, properties: { char: "wg" } }, { gid: 16, height: 64, id: 4, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 64, y: 608, properties: { char: "fb" } }, { gid: 22, height: 64, id: 24, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 688, y: 112, properties: { char: "silver" } }, { gid: 25, height: 64, id: 5, name: "", properties: { group: 3, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 64, y: 928 }, { gid: 25, height: 64, id: 6, name: "", properties: { group: 1, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 320, y: 928 }, { gid: 25, height: 64, id: 7, name: "", properties: { group: 2, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 832, y: 928 }, { gid: 25, height: 64, id: 8, name: "", properties: { group: 5, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 1120, y: 928 }, { gid: 25, height: 64, id: 9, name: "", rotation: 0, type: "lever", visible: true, width: 64, x: 464, y: 800, properties: { group: 0, onis: -1, startPos: 1 } }, { gid: 23, height: 64, id: 10, name: "", properties: { group: 4 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 768, y: 800 }, { gid: 23, height: 64, id: 11, name: "", properties: { group: 4 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 496, y: 288 }, { gid: 27, height: 64, id: 12, name: "", rotation: 0, type: "box", visible: true, width: 64, x: 1121, y: 93, properties: {} }, { gid: 27, height: 64, id: 13, name: "", rotation: 0, type: "box", visible: true, width: 64, x: 830, y: 93, properties: {} }, { gid: 27, height: 64, id: 14, name: "", rotation: 0, type: "box", visible: true, width: 64, x: 352, y: 96, properties: {} }, { gid: 27, height: 64, id: 15, name: "", rotation: 0, type: "box", visible: true, width: 64, x: 64, y: 96, properties: {} }, { height: 32, id: 17, name: "", properties: { dx: -2, group: 3 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 64, y: 96 }, { height: 32, id: 18, name: "", properties: { dx: 2, group: 1 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 320, y: 96 }, { height: 32, id: 19, name: "", properties: { dx: -2, group: 2 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 94, x: 834, y: 96 }, { height: 32, id: 20, name: "", properties: { dx: 2, group: 5 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 1088, y: 96 }, { height: 32, id: 21, name: "", properties: { dx: -3, group: 0 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 480, y: 160 }, { height: 136, id: 22, name: "", properties: { dx: 0, dy: 4, group: 4 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 864, y: 640 }], properties: {}, sha256: "1dbcf715ec043999d7f76e8a11c2a01e9f2d6e7eb88ccb12bd33b66d258dc529" }, { id: "forest_14", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, -1, -1, -1, -1, 1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, 0, 0, -1, -1, -1, 1, 4, -1, -1, -1, 3, 0, 2, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, 3, 0, 0, 0, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 32, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 32, y: 864, properties: { char: "fb" } }, { gid: 33, height: 64, id: 4, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 96, y: 864, properties: { char: "wg" } }, { gid: 37, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 272, y: 784, properties: { char: "wg" } }, { gid: 37, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 672, y: 784, properties: { char: "wg" } }, { gid: 36, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 448, y: 752, properties: { char: "fb" } }, { gid: 36, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 832, y: 720, properties: { char: "fb" } }, { gid: 36, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 704, y: 560, properties: { char: "fb" } }, { gid: 36, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 160, y: 560, properties: { char: "fb" } }, { gid: 36, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 48, y: 512, properties: { char: "fb" } }, { gid: 36, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 256, y: 368, properties: { char: "fb" } }, { gid: 36, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 576, y: 400, properties: { char: "fb" } }, { gid: 36, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 320, y: 176, properties: { char: "fb" } }, { gid: 37, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 472, y: 176, properties: { char: "wg" } }, { gid: 37, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 416, y: 416, properties: { char: "wg" } }, { gid: 37, height: 64, id: 17, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 47, y: 601, properties: { char: "wg" } }, { gid: 37, height: 64, id: 18, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 576, y: 528, properties: { char: "wg" } }, { gid: 37, height: 64, id: 19, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 864, y: 560, properties: { char: "wg" } }, { gid: 34, height: 64, id: 23, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 64, y: 256, properties: { char: "fb" } }, { gid: 35, height: 64, id: 24, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 160, y: 256, properties: { char: "wg" } }, { gid: 41, height: 96, id: 20, name: "", properties: { group: 2, length: 10, initialState: 1 }, propertytypes: { group: "int", initialState: "int" }, rotation: -90, type: "wind", visible: true, width: 64, x: 128, y: 688 }, { gid: 20, height: 64, id: 25, name: "", rotation: 0, type: "box", visible: true, width: 64, x: 1054, y: 191, properties: {} }, { height: 0, id: 26, name: "", polygon: [{ x: 0, y: 0 }, { x: 208, y: -80 }, { x: 208, y: 0 }], rotation: 0, type: "roman", visible: true, width: 0, x: 640, y: 416, properties: {} }], properties: {}, sha256: "9a9df09f157a46e0bac66649ddafaeae14103ead92144bcb8021173fc1faba53" }, { id: "forest_15", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 0, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 0, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 17, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 832, y: 768, properties: { char: "wg" } }, { gid: 16, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 928, y: 768, properties: { char: "fb" } }, { gid: 18, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 64, y: 128, properties: { char: "fb" } }, { gid: 19, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 176, y: 128, properties: { char: "wg" } }, { gid: 20, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 320, y: 112, properties: { char: "fb" } }, { gid: 20, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 320, y: 240, properties: { char: "fb" } }, { gid: 20, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 192, y: 368, properties: { char: "fb" } }, { gid: 20, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 256, y: 496, properties: { char: "fb" } }, { gid: 20, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1032, y: 112, properties: { char: "fb" } }, { gid: 20, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1024, y: 496, properties: { char: "fb" } }, { gid: 20, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 816, y: 625, properties: { char: "fb" } }, { gid: 20, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 832, y: 880, properties: { char: "fb" } }, { gid: 21, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 400, y: 112, properties: { char: "wg" } }, { gid: 21, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1112, y: 112, properties: { char: "wg" } }, { gid: 21, height: 64, id: 17, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 896, y: 240, properties: { char: "wg" } }, { gid: 21, height: 64, id: 18, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 912, y: 624, properties: { char: "wg" } }, { gid: 21, height: 64, id: 19, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 832, y: 496, properties: { char: "wg" } }, { gid: 21, height: 64, id: 20, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 832, y: 368, properties: { char: "wg" } }, { gid: 21, height: 64, id: 21, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 224, y: 880, properties: { char: "wg" } }, { gid: 21, height: 64, id: 22, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 224, y: 752, properties: { char: "wg" } }, { height: 32, id: 23, name: "", properties: { dx: 5, group: 5 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 160, x: 1024, y: 256 }, { height: 32, id: 24, name: "", properties: { dx: 5, group: 4 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 128, x: 640, y: 127 }, { height: 32, id: 25, name: "", properties: { dx: 5, group: 0 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 160, x: 1024, y: 640 }, { height: 32, id: 26, name: "", properties: { dx: -5, group: 1 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 160, x: 64, y: 512 }, { height: 32, id: 27, name: "", properties: { dx: 4, group: 1 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 128, x: 480, y: 384 }, { height: 96, id: 28, name: "", properties: { dx: 0, dy: -3, group: 2 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 608, y: 544 }, { height: 96, id: 30, name: "", properties: { dx: 0, dy: 3, group: 3 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 608, y: 416 }, { height: 96, id: 31, name: "", properties: { dx: -4, dy: 0, group: 51 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 608, y: 800 }, { height: 96, id: 32, name: "", properties: { dx: -4, dy: 0, group: 51 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 480, y: 800 }, { gid: 23, height: 64, id: 33, name: "", properties: { group: 5 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 896, y: 160 }, { gid: 23, height: 64, id: 34, name: "", properties: { group: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 928, y: 544 }, { gid: 23, height: 64, id: 35, name: "", properties: { group: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 512, y: 672 }, { gid: 23, height: 64, id: 36, name: "", properties: { group: 3 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 64, y: 672 }, { gid: 25, height: 64, id: 38, name: "", properties: { group: 4, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 320, y: 416 }, { gid: 25, height: 64, id: 39, name: "", rotation: 0, type: "lever", visible: true, width: 64, x: 64, y: 800, properties: { group: 0, onis: -1, startPos: 1 } }, { gid: 25, height: 64, id: 40, name: "", properties: { group: 2, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 64, y: 928 }, { gid: 24, height: 64, id: 42, name: "", properties: { group: 51, onis: 1, startPos: -1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 1120, y: 928 }], properties: {}, sha256: "d320585d08fafb2ff39bbd55ef73cea2dd4be9634dabd228153973fd9240c52e" }, { id: "forest_16", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 1, 0, 0, 0, 0, 4, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 2, -1, -1, -1, 0, 0, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, 3, 0, 2, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, 0, 0, 2, -1, 0, 0, 4, -1, -1, 0, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 4, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, -1, -1, 1, 4, -1, -1, -1, 0, 0, -1, -1, 3, 0, -1, -1, 3, 0, -1, -1, -1, -1, 3, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 4, -1, -1, 0, -1, -1, -1, 1, 0, 0, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 2, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, 1, 0, -1, -1, -1, 0, 0, 0, 4, -1, -1, 0, 4, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, 0, 0, 2, -1, -1, 3, 0, 0, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, 1, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, 0, 0, -1, -1, 3, 0, -1, -1, 3, 0, -1, -1, -1, 1, 4, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 2, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, 1, 4, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, 0, 0, 4, -1, -1, 0, 4, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 4, -1, -1, -1, -1, 3, 4, -1, -1, -1, 3, 0, 0, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, 0, 0, -1, -1, 3, 0, -1, -1, 3, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 2, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, 0, 0, 4, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, -1, -1, 3, 0, 2, -1, -1, -1, 1, -1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, 0, 0, 4, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 2, -1, 1, 4, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, -1, -1, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, 1, 0, 0, 0, 6, 6, 6, 6, 6, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 1, 0, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 32, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 1056, y: 896, properties: { char: "fb" } }, { gid: 33, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 1056, y: 768, properties: { char: "wg" } }, { gid: 34, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1136, y: 768, properties: { char: "fb" } }, { gid: 35, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1136, y: 896, properties: { char: "wg" } }, { gid: 37, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 608, y: 848, properties: { char: "wg" } }, { gid: 37, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 224, y: 688, properties: { char: "wg" } }, { gid: 37, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 320, y: 400, properties: { char: "wg" } }, { gid: 37, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 320, y: 208, properties: { char: "wg" } }, { gid: 37, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 512, y: 272, properties: { char: "wg" } }, { gid: 37, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 832, y: 560, properties: { char: "wg" } }, { gid: 36, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 480, y: 112, properties: { char: "fb" } }, { gid: 36, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 752, y: 344, properties: { char: "fb" } }, { gid: 36, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 992, y: 112, properties: { char: "fb" } }, { gid: 36, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 544, y: 560, properties: { char: "fb" } }, { gid: 36, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 496, y: 688, properties: { char: "fb" } }, { gid: 36, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 224, y: 848, properties: { char: "fb" } }, { gid: 17, height: 64, id: 17, name: "", properties: { group: 4, onis: 1, startPos: -1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 480, y: 608 }, { gid: 17, height: 64, id: 18, name: "", properties: { group: 3, onis: 1, startPos: -1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 688, y: 640 }, { height: 32, id: 19, name: "", properties: { dx: 0, dy: -3, group: 3 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 352, y: 576 }, { height: 32, id: 21, name: "", properties: { dx: 0, dy: -3, group: 4 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 352, y: 736 }], properties: {}, sha256: "c0b242303d5a41be3e9b0d92f4a11abfdd96e23864733e2db5dec60a7a37dd51" }, { id: "forest_17", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 2, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 3, 0, -1, 2, -1, -1, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 3, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 1, 0, 0, 0, 2, -1, -1, -1, 1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 2, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 17, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 992, y: 128, properties: { char: "wg" } }, { gid: 16, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 96, y: 896, properties: { char: "fb" } }, { gid: 18, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 64, y: 128, properties: { char: "fb" } }, { gid: 19, height: 64, id: 5, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 160, y: 128, properties: { char: "wg" } }, { gid: 22, height: 64, id: 25, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 48, y: 240, properties: { char: "silver" } }, { gid: 25, height: 64, id: 6, name: "", properties: { group: 5, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 576, y: 224 }, { gid: 25, height: 64, id: 7, name: "", properties: { group: 2, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 704, y: 192 }, { gid: 25, height: 64, id: 8, name: "", rotation: 0, type: "lever", visible: true, width: 64, x: 864, y: 224, properties: { group: 0, onis: -1, startPos: 1 } }, { gid: 25, height: 64, id: 9, name: "", properties: { group: 3, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 288, y: 288 }, { gid: 24, height: 64, id: 10, name: "", properties: { group: 1, onis: 1, startPos: -1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 1120, y: 672 }, { height: 32, id: 11, name: "", properties: { dx: 0, dy: 4 }, propertytypes: { dx: "int", dy: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 384, y: 384 }, { height: 32, id: 13, name: "", properties: { dx: 0, dy: 4 }, propertytypes: { dx: "int", dy: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 384, y: 512 }, { height: 32, id: 14, name: "", rotation: 0, type: "platform", visible: true, width: 96, x: 704, y: 640, properties: {} }, { height: 32, id: 15, name: "", rotation: 0, type: "platform", visible: true, width: 96, x: 832, y: 384, properties: {} }, { height: 32, id: 16, name: "", properties: { dx: 3, group: 1 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 1120, y: 256 }, { height: 32, id: 18, name: "", properties: { dx: 0, dy: 4, group: 2 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 960, y: 640 }, { height: 32, id: 19, name: "", properties: { dx: 0, dy: -4, group: 2 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 128, y: 256 }, { height: 96, id: 20, name: "", properties: { dx: 8, group: 5 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 928, y: 416 }, { height: 96, id: 22, name: "", properties: { group: 2 }, propertytypes: { group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 480, y: 544 }, { height: 96, id: 23, name: "", properties: { dx: 0, dy: -3, group: 3 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 480, y: 32 }, { height: 32, id: 24, name: "", properties: { dx: -4, group: 5 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 160, y: 768 }], properties: {}, sha256: "205ac42e5c3e165aed911845af358beb2966bf639459efa6d107291a49aa75ae" }, { id: "forest_18", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 1, 0, 2, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 1, 0, 7, 7, 7, 7, 7, 7, 7, 0, 0, 0, 2, -1, -1, 3, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 1, 0, 0, -1, -1, 1, 0, 0, 0, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 2, -1, -1, 4, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 0, 2, -1, -1, -1, -1, 3, -1, -1, 1, 4, -1, -1, -1, -1, 1, 6, 6, 6, 6, 6, 6, 6, 0, 0, 0, 0, 0, 0, -1, -1, -1, 3, 0, 0, 0, 4, -1, 3, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, 0, 0, 0, 4, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 2, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, 2, -1, -1, 1, 0, 0, 0, 2, -1, -1, -1, -1, 3, 2, 1, 0, 2, 1, 4, -1, -1, -1, -1, 1, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 6, 6, 6, 0, 2, -1, -1, 0, 0, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, 6, 6, 6, 0, -1, -1, -1, 1, 5, 5, 5, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 1, 5, 5, 5, 5, 0, 0, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, 3, 4, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, 1, -1, -1, 1, 0, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, 1, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 1, 0, -1, 0, 2, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, -1, 0, 0, -1, -1, 1, 0, -1, 0, 2, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 21, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 208, y: 456, properties: { char: "wg" } }, { gid: 16, height: 64, id: 14, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 544, y: 416, properties: { char: "fb" } }, { gid: 20, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 960, y: 112, properties: { char: "fb" } }, { gid: 19, height: 64, id: 16, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 352, y: 896, properties: { char: "wg" } }, { gid: 20, height: 64, id: 17, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 192, y: 736, properties: { char: "fb" } }, { gid: 20, height: 64, id: 18, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1008, y: 512, properties: { char: "fb" } }, { gid: 18, height: 64, id: 19, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1088, y: 896, properties: { char: "fb" } }, { gid: 21, height: 64, id: 20, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 608, y: 864, properties: { char: "wg" } }, { gid: 21, height: 64, id: 21, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1056, y: 672, properties: { char: "wg" } }, { gid: 17, height: 64, id: 22, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 608, y: 416, properties: { char: "wg" } }, { gid: 20, height: 64, id: 23, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 120, y: 456, properties: { char: "fb" } }, { gid: 21, height: 64, id: 24, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 832, y: 864, properties: { char: "wg" } }, { gid: 20, height: 64, id: 39, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 560, y: 104, properties: { char: "fb" } }, { gid: 26, height: 64, id: 26, name: "", rotation: 0, type: "lever", visible: true, width: 64, x: 336, y: 736, properties: { group: 0, onis: -1, startPos: 1 } }, { gid: 24, height: 64, id: 27, name: "", properties: { group: 3 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 848, y: 736 }, { height: 96, id: 28, name: "", properties: { dtheta: 90, offsetY: -1 }, propertytypes: { dtheta: "float", offsetY: "float" }, rotation: 0, type: "platform", visible: true, width: 32, x: 448, y: 608 }, { height: 96, id: 30, name: "", properties: { dtheta: 90, offsetY: -1 }, propertytypes: { dtheta: "float", offsetY: "float" }, rotation: 0, type: "platform", visible: true, width: 32, x: 704, y: 608 }, { height: 32, id: 33, name: "", properties: { dx: 0, dy: 4, group: 3 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 192, y: 768 }, { height: 32, id: 35, name: "", properties: { dx: 0, dy: -3, group: 8 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 544, y: 16 }, { gid: 24, height: 64, id: 38, name: "", properties: { group: 8 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 32, y: 128 }, { gid: 25, height: 64, id: 41, name: "", properties: { group: 2, onis: 1, startPos: -1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 416, y: 256 }, { height: 96, id: 44, name: "", properties: { dtheta: 90, group: 2, offsetY: -1 }, propertytypes: { dtheta: "float", group: "int", offsetY: "float" }, rotation: 0, type: "platform", visible: true, width: 32, x: 896, y: 352 }], properties: {}, sha256: "62404d56cf389d557aa5f4c67b9c9432098cb043759db65dbcea932e59049a8a" }, { id: "forest_19", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 7, 7, 7, 7, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 3, 7, 7, 7, 7, 7, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, 0, 0, -1, 4, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 3, 0, 5, 5, 5, 5, 5, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 7, 7, 7, 7, 7, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 5, 5, 5, 5, 5, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, -1, -1, -1, 0, 0, -1, -1, 1, 0, 0, 0, -1, -1, -1, 0, 0, 0, 7, 7, 7, 7, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, -1, -1, -1, 0, 0, 2, -1, 0, -1, -1, -1, -1, -1, -1, 4, -1, -1, 3, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, -1, -1, -1, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, 1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 1, 5, 5, 5, 5, 0, 0, 2, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, 1, 4, -1, 3, 2, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 4, 1, 0, 2, 3, 2, -1, 1, 0, 0, 0, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 2, -1, -1, 3, 4, 1, 0, 0, 0, 2, 3, 0, 4, -1, -1, 3, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, -1, -1, 1, -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 17, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 64, y: 160, properties: { char: "wg" } }, { gid: 16, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 1008, y: 160, properties: { char: "fb" } }, { gid: 20, height: 64, id: 3, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 80, y: 304, properties: { char: "fb" } }, { gid: 20, height: 64, id: 4, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 144, y: 304, properties: { char: "fb" } }, { gid: 20, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 592, y: 560, properties: { char: "fb" } }, { gid: 20, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 816, y: 688, properties: { char: "fb" } }, { gid: 20, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1040, y: 720, properties: { char: "fb" } }, { gid: 20, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1032, y: 304, properties: { char: "fb" } }, { gid: 20, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 728, y: 168, properties: { char: "fb" } }, { gid: 21, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 856, y: 408, properties: { char: "wg" } }, { gid: 21, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 656, y: 344, properties: { char: "wg" } }, { gid: 21, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 464, y: 280, properties: { char: "wg" } }, { gid: 21, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 864, y: 880, properties: { char: "wg" } }, { gid: 21, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1024, y: 880, properties: { char: "wg" } }, { gid: 18, height: 64, id: 30, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 560, y: 896, properties: { char: "fb" } }, { gid: 19, height: 64, id: 31, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 656, y: 896, properties: { char: "wg" } }, { gid: 34, height: 64, id: 15, name: "", rotation: 0, type: "ball", visible: true, width: 64, x: 128, y: 448, properties: {} }, { gid: 24, height: 64, id: 16, name: "", properties: { group: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 128, y: 608 }, { gid: 24, height: 64, id: 17, name: "", properties: { group: 5 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 544, y: 160 }, { gid: 24, height: 64, id: 18, name: "", properties: { group: 5 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 1120, y: 928 }, { height: 32, id: 21, name: "", properties: { dx: 0, dy: -4, group: 5 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 224, y: 320 }, { height: 32, id: 23, name: "", properties: { dx: 0, dy: -4, group: 5 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 224, y: 448 }, { height: 32, id: 24, name: "", properties: { dx: 0, dy: 4, group: 5 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 1120, y: 320 }, { height: 32, id: 25, name: "", properties: { dx: 0, dy: 4, group: 5 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 1120, y: 448 }, { height: 32, id: 26, name: "", properties: { dx: -3, dy: 0, group: 1 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 64, x: 32, y: 768 }, { gid: 24, height: 64, id: 27, name: "", properties: { group: 2 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 32, y: 928 }, { height: 96, id: 28, name: "", properties: { dx: 0, dy: 3, group: 2 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 512, y: 800 }, { height: 0, id: 32, name: "", polyline: [{ x: 0, y: 0 }, { x: 0, y: 144 }], rotation: 0, type: "hanging", visible: true, width: 0, x: 784, y: 240, properties: {} }, { height: 0, id: 33, name: "", polyline: [{ x: 0, y: 0 }, { x: 0, y: 176 }], rotation: 0, type: "hanging", visible: true, width: 0, x: 400, y: 80, properties: {} }], properties: {}, sha256: "806c3cbe8d6457d2b16961e67b74d96ed612cbe6d2fcecb25bdd2eac8db37799" }, { id: "forest_20", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, 3, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, 0, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 3, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, -1, 0, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, -1, 0, -1, -1, 0, 0, 0, 0, -1, 3, 0, 0, 0, 0, 4, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, -1, 0, -1, 1, 4, -1, -1, 3, 2, -1, 0, -1, -1, 4, -1, 1, 4, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, -1, 3, 0, 4, -1, 1, 2, -1, 3, -1, -1, -1, -1, -1, 1, 4, -1, 1, 2, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, -1, -1, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 36, height: 64, id: 45, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 704, y: 160, properties: { char: "wg" } }, { gid: 35, height: 64, id: 46, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 544, y: 160, properties: { char: "fb" } }, { gid: 37, height: 64, id: 47, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 752, y: 800, properties: { char: "fb" } }, { gid: 38, height: 64, id: 48, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 912, y: 864, properties: { char: "wg" } }, { gid: 41, height: 64, id: 49, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 624, y: 256, properties: { char: "silver" } }, { gid: 16, height: 64, id: 23, name: "", properties: { group: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 320, y: 928 }, { height: 32, id: 24, name: "", properties: { dx: 3, group: 2 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 1120, y: 640 }, { gid: 26, height: 64, id: 25, name: "", rotation: 0, type: "ball", visible: true, width: 64, x: 64, y: 640, properties: {} }, { gid: 16, height: 64, id: 26, name: "", properties: { group: 4 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 992, y: 576 }, { gid: 26, height: 64, id: 27, name: "", rotation: 0, type: "ball", visible: true, width: 64, x: 352, y: 704, properties: {} }, { height: 32, id: 28, name: "", properties: { dx: -2, group: 3 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 64, y: 832 }, { gid: 16, height: 64, id: 29, name: "", properties: { group: 31 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 240, y: 576 }, { gid: 16, height: 64, id: 30, name: "", properties: { group: 3 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 160, y: 928 }, { gid: 34, height: 96, id: 31, name: "", properties: { group: 21, length: 12 }, propertytypes: { group: "int", length: "float" }, rotation: -90.736, type: "wind", visible: true, width: 64, x: 704, y: 544 }, { gid: 26, height: 64, id: 32, name: "", rotation: 0, type: "ball", visible: true, width: 64, x: 448, y: 704, properties: {} }, { height: 32, id: 33, name: "", properties: { dx: -2, group: 1 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 224, y: 832 }, { gid: 17, height: 64, id: 34, name: "", rotation: 0, type: "lever", visible: true, width: 64, x: 864, y: 576, properties: { group: 0, onis: 1, startPos: -1 } }, { height: 32, id: 35, name: "", properties: { dx: 3, group: 0 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 736, y: 544 }, { gid: 16, height: 64, id: 36, name: "", properties: { group: 5 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 896, y: 448 }, { gid: 16, height: 64, id: 37, name: "", properties: { group: 2 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 736, y: 928 }, { gid: 17, height: 64, id: 38, name: "", properties: { group: 21, onis: 1, startPos: -1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 480, y: 576 }, { height: 32, id: 39, name: "", properties: { dx: -3, group: 31 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 224, y: 416 }, { height: 96, id: 40, name: "", properties: { dx: 0, dy: 4, group: 4 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 576, y: 320 }, { height: 96, id: 43, name: "", properties: { dx: 0, dy: 4, group: 4 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 704, y: 320 }, { height: 96, id: 44, name: "", properties: { dx: 0, dy: 3, group: 5 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 384, y: 448 }], properties: {}, sha256: "80c70024868efbd1a4a505edb878efcb7534177a46a25ce90038f5079f6af98a" }, { id: "forest_21", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 4, -1, -1, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 4, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 4, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, 1, 0, 0, 0, 0, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 0, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 0, -1, -1, -1, 3, 0, 0, 0, 0, 0, 4, -1, 3, 0, 2, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, 0, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 2, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 4, -1, 3, 0, 0, 0, -1, -1, -1, -1, -1, 0, -1, -1, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, -1, 0, 0, 0, -1, -1, -1, -1, -1, 0, 5, 5, 0, -1, -1, -1, 0, 0, 0, 4, -1, -1, 3, 0, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 2, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1, 3, 0, 0, 0, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, 4, 3, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 1, 0, 0, 2, 1, 4, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, 1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 3, 4, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 1, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, 1, 0, 0, 0, 0, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 2, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 19, height: 64, id: 1, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 96, y: 896, properties: { char: "wg" } }, { gid: 18, height: 64, id: 2, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 480, y: 192, properties: { char: "fb" } }, { gid: 17, height: 64, id: 3, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 64, y: 352, properties: { char: "wg" } }, { gid: 16, height: 64, id: 4, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 1152, y: 128, properties: { char: "fb" } }, { gid: 21, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 160, y: 256, properties: { char: "wg" } }, { gid: 21, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 160, y: 112, properties: { char: "wg" } }, { gid: 21, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 160, y: 704, properties: { char: "wg" } }, { gid: 21, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 480, y: 800, properties: { char: "wg" } }, { gid: 21, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 560, y: 512, properties: { char: "wg" } }, { gid: 20, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1136, y: 352, properties: { char: "fb" } }, { gid: 20, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 992, y: 544, properties: { char: "fb" } }, { gid: 20, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 896, y: 688, properties: { char: "fb" } }, { gid: 20, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 784, y: 352, properties: { char: "fb" } }, { gid: 20, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 624, y: 208, properties: { char: "fb" } }, { gid: 27, height: 64, id: 15, name: "", rotation: 0, type: "box", visible: true, width: 64, x: 463, y: 320, properties: {} }, { gid: 25, height: 64, id: 16, name: "", properties: { group: 1, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 928, y: 928 }, { gid: 24, height: 64, id: 17, name: "", properties: { group: 3, onis: 1, startPos: 1 }, propertytypes: { group: "int", startPos: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 352, y: 928 }, { gid: 24, height: 64, id: 18, name: "", properties: { group: 4, onis: 1, startPos: 1 }, propertytypes: { group: "int", startPos: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 320, y: 704 }, { gid: 41, height: 96, id: 20, name: "", properties: { group: 1, length: 12 }, propertytypes: { group: "int", length: "float" }, rotation: -89.5239538210532, type: "wind", visible: true, width: 64, x: 256, y: 528 }, { gid: 41, height: 96, id: 21, name: "", properties: { group: 3, length: 10 }, propertytypes: { group: "int" }, rotation: 180, type: "wind", visible: true, width: 64, x: 984, y: 256 }, { gid: 41, height: 96, id: 22, name: "", properties: { group: 4, length: 12 }, propertytypes: { group: "int", length: "float" }, rotation: -90, type: "wind", visible: true, width: 64, x: 1216, y: 624 }, { height: 0, id: 23, name: "", polyline: [{ x: 0, y: -32 }, { x: 0, y: -208 }, { x: 224, y: -208 }, { x: 224, y: 408 }], rotation: 0, type: "pulley", visible: true, width: 0, x: 592, y: 480, properties: {} }], properties: {}, sha256: "d7f2c799e8302ae692a33cab99de9588149d3c07ab6e97eca4616ce2385e33f3" }, { id: "forest_22", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, 3, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 1, 0, 0, 2, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 4, -1, -1, -1, -1, -1, 1, 4, -1, -1, 3, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, 4, 3, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 2, -1, -1, 0, 0, 0, -1, -1, -1, 0, 0, 4, 1, 2, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, 3, 0, 2, 3, 2, -1, -1, -1, -1, 1, 0, 0, 0, 0, 4, -1, 3, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 2, 3, 0, 2, 3, 2, -1, -1, 1, 0, 0, 0, 4, -1, -1, -1, -1, -1, 3, 0, 2, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 2, 3, 0, 2, 3, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 4, 3, 2, 3, 0, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 4, 1, 2, 3, 2, 4, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, 0, 0, 2, 3, 0, 2, 4, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, 3, 0, 4, -1, -1, 0, 0, 0, 2, 3, 4, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 2, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 2, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 2, -1, -1, -1, -1, 0, 0, 0, 0, 0, 4, -1, -1, -1, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 4, 3, 2, 3, 0, 0, 4, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 4, 3, 4, 1, 2, 0, 2, 3, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 4, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 1, -1, -1, 0, 0, 4, -1, 1, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, 4, 1, 0, 0, 0, -1, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, 3, 0, 2, 3, 0, 4, 0, -1, 0, 1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 1, 0, 0, 0, 0, 0, 4, 1, 0, 0, 2, -1, 1, 0, 2, 3, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 17, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 320, y: 672, properties: { char: "wg" } }, { gid: 16, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 96, y: 160, properties: { char: "fb" } }, { gid: 18, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 64, y: 672, properties: { char: "fb" } }, { gid: 19, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 48, y: 160, properties: { char: "wg" } }, { gid: 20, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 704, y: 96, properties: { char: "fb" } }, { gid: 20, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 576, y: 224, properties: { char: "fb" } }, { gid: 20, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 912, y: 624, properties: { char: "fb" } }, { gid: 20, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1e3, y: 880, properties: { char: "fb" } }, { gid: 20, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 752, y: 800, properties: { char: "fb" } }, { gid: 20, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 464, y: 576, properties: { char: "fb" } }, { gid: 21, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 624, y: 576, properties: { char: "wg" } }, { gid: 21, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 640, y: 96, properties: { char: "wg" } }, { gid: 21, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 640, y: 224, properties: { char: "wg" } }, { gid: 21, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 904, y: 368, properties: { char: "wg" } }, { gid: 21, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 864, y: 880, properties: { char: "wg" } }, { gid: 21, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 184, y: 784, properties: { char: "wg" } }, { gid: 25, height: 96, id: 23, name: "", properties: { group: 4, length: 9, initialState: 1 }, propertytypes: { group: "int", initialState: "int", length: "float" }, rotation: -90, type: "wind", visible: true, width: 64, x: 832, y: 912 }, { gid: 25, height: 96, id: 24, name: "", properties: { group: 4, length: 8, initialState: 1 }, propertytypes: { group: "int", initialState: "int", length: "float" }, rotation: -90, type: "wind", visible: true, width: 64, x: 256, y: 912 }, { gid: 25, height: 96, id: 25, name: "", properties: { group: 4, length: 8, initialState: 1 }, propertytypes: { group: "int", initialState: "int", length: "float" }, rotation: -90, type: "wind", visible: true, width: 64, x: 704, y: 688 }, { gid: 25, height: 96, id: 26, name: "", properties: { group: 4, length: 8, initialState: 1, windWidth: 1.5 }, propertytypes: { group: "int", initialState: "int", length: "float", windWidth: "float" }, rotation: -90, type: "wind", visible: true, width: 64, x: 1216, y: 912 }, { gid: 25, height: 96, id: 27, name: "", properties: { group: 4, length: 8, initialState: 1 }, propertytypes: { group: "int", initialState: "int", length: "float" }, rotation: -90, type: "wind", visible: true, width: 64, x: 544, y: 688 }, { height: 32, id: 28, name: "", properties: { dx: 5, group: 5 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 160, x: 320, y: 160 }, { height: 32, id: 30, name: "", properties: { dx: 0, dy: -3, group: 0 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 1120, y: 192 }, { height: 32, id: 31, name: "", properties: { dx: 0, dy: -3, group: 0 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 1120, y: 96 }, { height: 32, id: 32, name: "", properties: { dx: 3, group: 0 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 1120, y: 704 }, { gid: 26, height: 64, id: 33, name: "", properties: { group: 5 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 48, y: 928 }, { gid: 26, height: 64, id: 34, name: "", rotation: 0, type: "pusher", visible: true, width: 64, x: 928, y: 928, properties: { group: 0 } }, { height: 96, id: 37, name: "", properties: { dx: 0, dy: 3, group: 5 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 1024, y: 416 }], properties: {}, sha256: "3743c673859a22d5963c84289fabe294caca53ca99b256d79343811df74bec72" }, { id: "forest_23", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, 1, 4, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, 4, -1, -1, -1, 3, 2, -1, -1, -1, -1, 1, 4, -1, -1, -1, 3, 2, -1, -1, -1, -1, 1, 0, 0, 5, 5, 5, 5, 2, -1, -1, -1, 0, 0, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 7, 7, 7, 7, 7, 7, 7, 7, 7, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 3, 5, 5, 5, 2, -1, -1, -1, -1, -1, 1, 0, 0, 0, 2, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, 3, 0, 0, 5, 5, 5, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 1, 0, 0, 0, 2, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 5, 5, 5, 0, 0, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 1, 0, -1, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, 1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 6, 6, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, 1, 0, 0, 0, 4, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 1, 0, 4, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 4, -1, -1, -1, -1, 1, 0, 0, 0, -1, -1, 1, 4, -1, -1, -1, -1, -1, 1, 0, 4, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, 1, 4, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, 1, 4, 3, 0, 0, -1, -1, -1, 1, 4, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 2, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, 0, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, 0, 0, 0, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 7, 7, 7, 7, 7, 7, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 16, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 160, y: 128, properties: { char: "fb" } }, { gid: 17, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 224, y: 128, properties: { char: "wg" } }, { gid: 18, height: 64, id: 9, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1040, y: 512, properties: { char: "fb" } }, { gid: 19, height: 64, id: 10, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1136, y: 896, properties: { char: "wg" } }, { gid: 22, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 416, y: 880, properties: { char: "silver" } }, { height: 96, id: 5, name: "", properties: { dx: 0, dy: 3, group: 2 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 608, y: 480 }, { height: 96, id: 6, name: "", properties: { dx: 0, dy: -3 }, propertytypes: { dx: "int", dy: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 1088, y: 672 }, { height: 32, id: 7, name: "", properties: { dx: 3, group: 5 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 512, y: 800 }, { gid: 23, height: 64, id: 11, name: "", properties: { group: 5 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 176, y: 576 }, { gid: 23, height: 64, id: 12, name: "", properties: { group: 2 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 528, y: 928 }, { gid: 24, height: 64, id: 13, name: "", rotation: 0, type: "lever", visible: true, width: 64, x: 624, y: 480, properties: { group: 0, onis: 1, startPos: -1 } }], properties: {}, sha256: "d23f435f9b718e406022875a51565cdefa238da8048ce84e80e1840f93f639f5" }, { id: "forest_24", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, 0, 0, -1, -1, 1, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 2, -1, -1, 0, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, 0, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, -1, 0, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, 0, 0, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, 0, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 1, 0, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 1, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, 0, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 4, -1, -1, -1, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 16, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 160, y: 512, properties: { char: "fb" } }, { gid: 17, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 224, y: 512, properties: { char: "wg" } }, { gid: 18, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1134, y: 672, properties: { char: "fb" } }, { gid: 19, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1136, y: 896, properties: { char: "wg" } }, { gid: 21, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 960, y: 704, properties: { char: "wg" } }, { gid: 21, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 672, y: 704, properties: { char: "wg" } }, { gid: 21, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 256, y: 688, properties: { char: "wg" } }, { gid: 21, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 136, y: 768, properties: { char: "wg" } }, { gid: 21, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 256, y: 368, properties: { char: "wg" } }, { gid: 21, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1120, y: 224, properties: { char: "wg" } }, { gid: 21, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1120, y: 416, properties: { char: "wg" } }, { gid: 20, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 592, y: 240, properties: { char: "fb" } }, { gid: 20, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 816, y: 208, properties: { char: "fb" } }, { gid: 20, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 368, y: 208, properties: { char: "fb" } }, { gid: 20, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 928, y: 368, properties: { char: "fb" } }, { gid: 20, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 64, y: 224, properties: { char: "fb" } }, { gid: 20, height: 64, id: 17, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 64, y: 416, properties: { char: "fb" } }, { gid: 20, height: 64, id: 18, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 496, y: 704, properties: { char: "fb" } }, { gid: 27, height: 64, id: 19, name: "", rotation: 0, type: "box", visible: true, width: 64, x: 320, y: 512, properties: {} }, { height: 32, id: 21, name: "", properties: { dx: -3, group: 3 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 64, y: 512 }, { gid: 23, height: 64, id: 23, name: "", properties: { group: 3 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 1120, y: 544 }, { height: 0, id: 24, name: "", polyline: [{ x: 0, y: 0 }, { x: 0, y: -112 }, { x: 128, y: -112 }, { x: 128, y: 216 }], rotation: 0, type: "pulley", visible: true, width: 0, x: 400, y: 672, properties: {} }, { height: 0, id: 28, name: "", polygon: [{ x: 0, y: 0 }, { x: 0, y: -64 }, { x: 168, y: 0 }], rotation: 0, type: "roman", visible: true, width: 0, x: 624, y: 512, properties: {} }, { height: 0, id: 29, name: "", polygon: [{ x: 0, y: 0 }, { x: 0, y: -64 }, { x: 192, y: 0 }], rotation: 0, type: "roman", visible: true, width: 0, x: 864, y: 896, properties: {} }], properties: {}, sha256: "8688852b1a06dbeb3ae3dcf61d2c149220316c2d1b362c452cbb65ac353694aa" }, { id: "forest_25", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 4, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 3, 0, 0, 0, 0, -1, -1, -1, -1, 3, 0, 2, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 2, -1, 1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 3, 0, 2, -1, -1, -1, -1, -1, 1, 0, 4, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 3, 0, 5, 5, 5, 5, 5, 0, 4, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, 0, 3, 0, 2, -1, -1, -1, -1, 3, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 4, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 1, 4, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 1, 4, -1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 0, -1, -1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 3, 2, -1, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 3, 2, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 2, -1, -1, 0, 0, 0, 2, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 16, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 1056, y: 128, properties: { char: "fb" } }, { gid: 17, height: 64, id: 3, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 1120, y: 128, properties: { char: "wg" } }, { gid: 18, height: 64, id: 6, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 54, y: 896, properties: { char: "fb" } }, { gid: 19, height: 64, id: 7, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 176, y: 896, properties: { char: "wg" } }, { gid: 21, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1096, y: 688, properties: { char: "wg" } }, { gid: 21, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 896, y: 240, properties: { char: "wg" } }, { gid: 21, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 928, y: 112, properties: { char: "wg" } }, { gid: 21, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 448, y: 208, properties: { char: "wg" } }, { gid: 21, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 32, y: 528, properties: { char: "wg" } }, { gid: 21, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 448, y: 608, properties: { char: "wg" } }, { gid: 20, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 192, y: 240, properties: { char: "fb" } }, { gid: 20, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 192, y: 432, properties: { char: "fb" } }, { gid: 20, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 512, y: 608, properties: { char: "fb" } }, { gid: 20, height: 64, id: 17, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1096, y: 504, properties: { char: "fb" } }, { gid: 20, height: 64, id: 18, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 832, y: 240, properties: { char: "fb" } }, { gid: 20, height: 64, id: 19, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 864, y: 112, properties: { char: "fb" } }, { gid: 26, height: 96, id: 20, name: "", properties: { group: 4, length: 14 }, propertytypes: { group: "int", length: "float" }, rotation: -180.02216848755, type: "wind", visible: true, width: 64, x: 1248, y: 160 }, { gid: 28, height: 64, id: 22, name: "", properties: { group: 4, onis: -1, startPos: -1 }, propertytypes: { group: "int", onis: "int", startPos: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 464, y: 480 }, { gid: 28, height: 64, id: 23, name: "", properties: { group: 3, onis: 1, startPos: -1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 1120, y: 928 }, { gid: 27, height: 64, id: 24, name: "", rotation: 0, type: "pusher", visible: true, width: 64, x: 48, y: 160, properties: { group: 0 } }, { height: 96, id: 25, name: "", properties: { dx: 0, dy: 3 }, propertytypes: { dx: "int", dy: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 1056, y: 800 }, { height: 32, id: 27, name: "", properties: { dx: 3, group: 3 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 96, y: 736 }, { height: 0, id: 29, name: "", polyline: [{ x: 0, y: 0 }, { x: 0, y: 248 }], properties: { barWidth: 9, fullRotation: true }, propertytypes: { barWidth: "float", fullRotation: "bool" }, rotation: 0, type: "hanging", visible: true, width: 0, x: 688, y: 496 }], properties: {}, sha256: "13f075c9f4703f289ec1cf82594ecc8e4c635ea83b4e4826b86ae084e0a2f361" }, { id: "forest_26", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 6, 6, 6, 6, 6, 6, 6, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, 0, 0, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, 3, 0, 4, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 2, -1, -1, -1, 1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, 3, 0, 0, 4, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, 3, 0, 0, 4, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, 0, 0, 2, -1, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 4, -1, -1, -1, 3, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, 1, 0, 0, 0, 2, -1, -1, -1, 3, 2, -1, -1, -1, 1, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, 1, 4, -1, -1, -1, 1, 0, 0, 0, 0, 4, -1, -1, -1, -1, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, -1, -1, -1, -1, 3, 0, 0, 0, 4, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, 0, 0, -1, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, 3, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 3, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 4, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 2, -1, -1, 3, 0, 0, 0, 0, 0, 4, -1, -1, 1, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, 3, 0, 2, -1, -1, 3, 0, 0, 0, 4, -1, -1, 1, 0, 4, -1, 3, 0, 4, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 2, -1, -1, 3, 0, 4, -1, -1, 1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 4, -1, 3, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 4, -1, 3, 0, 0, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, 0, 0, 2, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 16, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 624, y: 128, properties: { char: "fb" } }, { gid: 17, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 560, y: 128, properties: { char: "wg" } }, { gid: 18, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 312, y: 288, properties: { char: "fb" } }, { gid: 19, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 872, y: 288, properties: { char: "wg" } }, { gid: 21, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 440, y: 128, properties: { char: "wg" } }, { gid: 21, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 160, y: 112, properties: { char: "wg" } }, { gid: 21, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 48, y: 256, properties: { char: "wg" } }, { gid: 21, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 96, y: 480, properties: { char: "wg" } }, { gid: 21, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 128, y: 768, properties: { char: "wg" } }, { gid: 21, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 288, y: 848, properties: { char: "wg" } }, { gid: 21, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 352, y: 656, properties: { char: "wg" } }, { gid: 21, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 288, y: 528, properties: { char: "wg" } }, { gid: 21, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 416, y: 496, properties: { char: "wg" } }, { gid: 21, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 592, y: 384, properties: { char: "wg" } }, { gid: 21, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 704, y: 224, properties: { char: "wg" } }, { gid: 21, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 912, y: 400, properties: { char: "wg" } }, { gid: 20, height: 64, id: 17, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 752, y: 128, properties: { char: "fb" } }, { gid: 20, height: 64, id: 18, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1024, y: 112, properties: { char: "fb" } }, { gid: 20, height: 64, id: 19, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1136, y: 256, properties: { char: "fb" } }, { gid: 20, height: 64, id: 20, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1088, y: 480, properties: { char: "fb" } }, { gid: 20, height: 64, id: 21, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1056, y: 768, properties: { char: "fb" } }, { gid: 20, height: 64, id: 22, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 896, y: 848, properties: { char: "fb" } }, { gid: 20, height: 64, id: 23, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 656, y: 832, properties: { char: "fb" } }, { gid: 21, height: 64, id: 24, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 528, y: 832, properties: { char: "wg" } }, { gid: 20, height: 64, id: 25, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 832, y: 656, properties: { char: "fb" } }, { gid: 20, height: 64, id: 26, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 928, y: 528, properties: { char: "fb" } }, { gid: 20, height: 64, id: 27, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 768, y: 496, properties: { char: "fb" } }, { gid: 20, height: 64, id: 28, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 592, y: 448, properties: { char: "fb" } }, { gid: 20, height: 64, id: 29, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 480, y: 224, properties: { char: "fb" } }, { gid: 20, height: 64, id: 30, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 272, y: 400, properties: { char: "fb" } }, { gid: 25, height: 96, id: 31, name: "", properties: { group: 5, length: 10, initialState: 1 }, propertytypes: { group: "int", initialState: "int", length: "float" }, rotation: 180, type: "wind", visible: true, width: 64, x: 568, y: 576 }, { gid: 25, height: 96, id: 32, name: "", properties: { group: 5, length: 7, initialState: 1 }, propertytypes: { group: "int", initialState: "int", length: "float" }, rotation: -90, type: "wind", visible: true, width: 64, x: 736, y: 912 }, { gid: 25, height: 96, id: 33, name: "", properties: { group: 5, length: 10, initialState: 1 }, propertytypes: { group: "int", initialState: "int", length: "float" }, rotation: 0, type: "wind", visible: true, width: 64, x: 672, y: 672 }, { gid: 25, height: 96, id: 34, name: "", properties: { group: 5, length: 7, initialState: 1 }, propertytypes: { group: "int", initialState: "int", length: "float" }, rotation: -90, type: "wind", visible: true, width: 64, x: 608, y: 912 }, { gid: 25, height: 96, id: 36, name: "", properties: { group: 5, length: 10, initialState: 1 }, propertytypes: { group: "int", initialState: "int", length: "float" }, rotation: -90, type: "wind", visible: true, width: 64, x: 672, y: 528 }], properties: {}, sha256: "b8ac24a08b3a0c0f14af72cbf44967722b709a2dffa7cfcb83a8d126433bb81a" }, { id: "forest_27", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 1, 3, 2, -1, 3, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, 2, 3, 2, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, 0, 6, 6, 6, 6, 6, 0, 0, 6, 6, 6, 6, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 3, 2, 3, 2, -1, 3, 0, -1, -1, -1, -1, -1, -1, -1, 1, 4, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 2, 3, 2, 3, 2, -1, 3, 2, -1, -1, -1, -1, -1, 3, 4, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 3, 2, 3, 2, 3, 2, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 3, 2, 3, 2, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 2, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 2, 3, 2, -1, 3, 0, 0, 0, 2, -1, -1, -1, -1, -1, 3, 0, 2, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 4, -1, 3, 2, -1, -1, -1, -1, 3, 2, -1, -1, -1, 1, 2, 3, 0, 2, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 2, -1, -1, -1, 0, -1, -1, -1, 3, 0, 0, 0, 2, -1, 3, 0, 2, 3, 0, 0, 2, 3, 0, 2, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 2, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 2, 3, 0, 0, 0, 0, 2, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 2, -1, -1, -1, -1, 3, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 2, 3, 4, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 3, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 1, 0, 0, 0, 0, -1, -1, -1, 3, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 2, -1, -1, -1, 0, -1, -1, 1, 0, 2, -1, -1, 1, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, 0, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 3, 0, 0, 2, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, 1, 4, -1, 0, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 2, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, 0, -1, -1, 0, -1, -1, -1, 3, 0, 2, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 2, -1, -1, -1, 3, 0, 0, 0, 4, -1, -1, 3, 2, -1, -1, 2, 3, 0, 2, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, 3, 0, 2, -1, -1, -1, -1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, 1, 2, 3, 2, 3, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, -1, 3, 4, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 1, 6, 6, 6, 6, 6, 2, -1, -1, 0, 0, 6, 6, 6, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 17, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 256, y: 128, properties: { char: "wg" } }, { gid: 16, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 736, y: 768, properties: { char: "fb" } }, { gid: 18, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 768, y: 896, properties: { char: "fb" } }, { gid: 19, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 864, y: 896, properties: { char: "wg" } }, { gid: 22, height: 64, id: 28, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 48, y: 880, properties: { char: "silver" } }, { height: 96, id: 18, name: "", properties: { dtheta: 90, dx: 0, dy: -3, group: 0, offsetY: -1 }, propertytypes: { dtheta: "float", dx: "int", dy: "int", group: "int", offsetY: "float" }, rotation: 0, type: "platform", visible: true, width: 32, x: 992, y: 800 }, { height: 96, id: 19, name: "", properties: { dtheta: 90, dx: 0, dy: -3, group: 0, offsetY: -1 }, propertytypes: { dtheta: "float", dx: "int", dy: "int", group: "int", offsetY: "float" }, rotation: 0, type: "platform", visible: true, width: 32, x: 674, y: 801 }, { height: 96, id: 20, name: "", properties: { dx: 0, dy: -3, group: 3 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 384, y: 800 }, { gid: 25, height: 96, id: 21, name: "", properties: { group: 4, length: 10 }, propertytypes: { group: "int", length: "float" }, rotation: -90, type: "wind", visible: true, width: 64, x: 128, y: 784 }, { gid: 28, height: 64, id: 22, name: "", rotation: 0, type: "lever", visible: true, width: 64, x: 1120, y: 224, properties: { group: 0, onis: -1, startPos: 1 } }, { gid: 25, height: 96, id: 23, name: "", properties: { group: 4, length: 12 }, propertytypes: { group: "int", length: "float" }, rotation: -90, type: "wind", visible: true, width: 64, x: 128, y: 464 }, { gid: 26, height: 64, id: 24, name: "", properties: { group: 3 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 640, y: 704 }, { gid: 25, height: 96, id: 25, name: "", properties: { group: 4, length: 6 }, propertytypes: { group: "int", length: "float" }, rotation: -90, type: "wind", visible: true, width: 64, x: 256, y: 592 }, { gid: 28, height: 64, id: 26, name: "", properties: { group: 4, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 1008, y: 480 }, { gid: 36, height: 64, id: 29, name: "", rotation: 0, type: "ball", visible: true, width: 64, x: 144, y: 160, properties: {} }], properties: {}, sha256: "bfe70fc4c082cde5c1fa035facd370a331ac650c43e726ee98caa9e36d4968cd" }, { id: "forest_28", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 5, 0, 6, 6, 6, 6, 6, 6, 6, 0, 5, 5, 5, 6, 6, 6, 0, 0, 0, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 5, 5, 5, 5, 5, 5, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 6, 6, 6, 6, 6, 6, 6, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 0, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 6, 6, 6, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 16, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 32, y: 256, properties: { char: "fb" } }, { gid: 17, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 96, y: 256, properties: { char: "wg" } }, { gid: 18, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1120, y: 896, properties: { char: "fb" } }, { gid: 19, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 480, y: 704, properties: { char: "wg" } }, { gid: 20, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 688, y: 608, properties: { char: "fb" } }, { gid: 20, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 656, y: 400, properties: { char: "fb" } }, { gid: 20, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 432, y: 360, properties: { char: "fb" } }, { gid: 20, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 448, y: 256, properties: { char: "fb" } }, { gid: 20, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 544, y: 256, properties: { char: "fb" } }, { gid: 20, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 240, y: 144, properties: { char: "fb" } }, { gid: 20, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 128, y: 480, properties: { char: "fb" } }, { gid: 20, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 192, y: 880, properties: { char: "fb" } }, { gid: 20, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 848, y: 896, properties: { char: "fb" } }, { gid: 21, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 848, y: 832, properties: { char: "wg" } }, { gid: 21, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1080, y: 544, properties: { char: "wg" } }, { gid: 21, height: 64, id: 17, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1040, y: 144, properties: { char: "wg" } }, { gid: 21, height: 64, id: 18, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 496, y: 144, properties: { char: "wg" } }, { gid: 21, height: 64, id: 19, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 192, y: 256, properties: { char: "wg" } }, { gid: 21, height: 64, id: 20, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 288, y: 256, properties: { char: "wg" } }, { gid: 21, height: 64, id: 21, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 224, y: 704, properties: { char: "wg" } }, { gid: 21, height: 64, id: 22, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 320, y: 704, properties: { char: "wg" } }, { gid: 21, height: 64, id: 23, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 32, y: 480, properties: { char: "wg" } }, { gid: 26, height: 96, id: 25, name: "", properties: { group: 4, length: 11 }, propertytypes: { group: "int", length: "float" }, rotation: 0, type: "wind", visible: true, width: 64, x: 352, y: 384 }, { gid: 26, height: 96, id: 27, name: "", properties: { group: 1, length: 20, initialState: 1 }, propertytypes: { group: "int", initialState: "int", length: "float" }, rotation: 0, type: "wind", visible: true, width: 64, x: 32, y: 896 }, { gid: 28, height: 64, id: 28, name: "", properties: { group: 1, onis: -1, startPos: -1 }, propertytypes: { group: "int", onis: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 416, y: 928 }, { gid: 28, height: 64, id: 29, name: "", properties: { group: 4, onis: 1, startPos: 1 }, propertytypes: { group: "int", startPos: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 1120, y: 768 }, { gid: 29, height: 64, id: 30, name: "", properties: { group: 3, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 480, y: 416 }, { gid: 29, height: 64, id: 31, name: "", rotation: 0, type: "lever", visible: true, width: 64, x: 80, y: 544, properties: { group: 0, onis: -1, startPos: 1 } }, { height: 32, id: 32, name: "", properties: { dx: 5, group: 3 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 416, y: 576 }, { height: 96, id: 34, name: "", properties: { dx: 0, dy: 3 }, propertytypes: { dx: "int", dy: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 1056, y: 800 }], properties: {}, sha256: "67ba8f59343e1d9f565e4b5b425fd1bb69120246ab00dfb630f45752469e82cf" }, { id: "forest_29", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 1, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, 0, 2, -1, -1, 0, 0, -1, -1, -1, -1, 3, 0, 2, -1, -1, -1, -1, 1, 0, 4, 3, 0, 0, -1, -1, 0, -1, 0, -1, -1, -1, -1, -1, -1, 1, 0, -1, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 3, 0, 5, 5, 5, 0, 0, 4, -1, -1, 3, 0, -1, -1, 0, -1, -1, -1, 1, 0, 2, -1, 1, 0, 0, -1, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, -1, -1, -1, -1, 0, 0, -1, 0, -1, -1, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, 1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, -1, -1, -1, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, -1, 0, 0, 0, 4, -1, 1, 0, -1, -1, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, -1, 0, 0, 4, -1, 1, 0, 0, 2, -1, -1, 1, 0, 0, 2, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, 4, -1, -1, -1, 0, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, 1, 4, -1, -1, 3, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, 0, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 5, 5, 5, 5, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0, -1, -1, -1, 0, -1, -1, 2, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, 4, -1, 1, -1, -1, -1, 0, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, 7, 7, 7, 0, 0, 0, 4, -1, -1, 1, 0, -1, -1, -1, 0, -1, -1, -1, 4, -1, -1, -1, -1, -1, -1, -1, 1, -1, -1, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 4, -1, 1, 0, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 0, -1, -1, 0, -1, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 1, 0, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 0, -1, -1, 0, -1, -1, -1, 0, 0, 2, -1, -1, 1, -1, -1, 1, 0, -1, -1, 0, -1, -1, -1, 0, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 0, -1, -1, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 6, 6, 0, -1, -1, -1, 0, 6, 6, 6, 6, 6, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 17, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 832, y: 480, properties: { char: "wg" } }, { gid: 16, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 464, y: 160, properties: { char: "fb" } }, { gid: 18, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 64, y: 896, properties: { char: "fb" } }, { gid: 19, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 192, y: 896, properties: { char: "wg" } }, { gid: 22, height: 64, id: 19, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 832, y: 640, properties: { char: "silver" } }, { gid: 28, height: 64, id: 6, name: "", rotation: 0, type: "box", visible: true, width: 64, x: 336, y: 544, properties: {} }, { height: 160, id: 7, name: "", properties: { dx: 0, dy: 4, group: 2 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 928, y: 640 }, { height: 96, id: 9, name: "", properties: { dx: 0, dy: -3, group: 2 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 992, y: 64 }, { height: 32, id: 10, name: "", properties: { dx: 3, group: 5 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 448, y: 608 }, { gid: 24, height: 64, id: 12, name: "", properties: { group: 5 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 288, y: 768 }, { gid: 24, height: 64, id: 13, name: "", properties: { group: 0 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 320, y: 928 }, { height: 96, id: 14, name: "", properties: { dx: 0, dy: -3, group: 0 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 128, y: 512 }, { gid: 25, height: 64, id: 18, name: "", properties: { group: 2, onis: 1, startPos: -1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 448, y: 448 }, { gid: 34, height: 64, id: 20, name: "", rotation: 0, type: "ball", visible: true, width: 64, x: 736, y: 256, properties: {} }, { height: 0, id: 21, name: "", polyline: [{ x: 0, y: 0 }, { x: 0, y: -200 }, { x: 192, y: -200 }, { x: 192, y: 192 }], rotation: 0, type: "pulley", visible: true, width: 0, x: 368, y: 544, properties: {} }], properties: {}, sha256: "43e2882feb206db00a0bbb28f7d1e715d4fb5e79b1ca34415ebf41bf195d442f" }, { id: "forest_30", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 6, 6, 6, 6, 6, 6, 6, 0, 0, 0, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 5, 5, 5, 5, 5, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 6, 6, 6, 6, 6, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 4, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, 0, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 5, 5, 5, 5, 5, 5, 0, 0, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, -1, 0, -1, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, 0, -1, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 16, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 544, y: 192, properties: { char: "fb" } }, { gid: 17, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 704, y: 192, properties: { char: "wg" } }, { gid: 18, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 48, y: 736, properties: { char: "fb" } }, { gid: 19, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 176, y: 640, properties: { char: "wg" } }, { gid: 21, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 288, y: 192, properties: { char: "wg" } }, { gid: 21, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 416, y: 192, properties: { char: "wg" } }, { gid: 21, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 80, y: 352, properties: { char: "wg" } }, { gid: 21, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 448, y: 384, properties: { char: "wg" } }, { gid: 20, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 832, y: 192, properties: { char: "fb" } }, { gid: 20, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 960, y: 192, properties: { char: "fb" } }, { gid: 20, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1040, y: 352, properties: { char: "fb" } }, { gid: 20, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 1120, y: 560, properties: { char: "fb" } }, { height: 0, id: 13, name: "", polyline: [{ x: 0, y: 24 }, { x: 0, y: -328 }, { x: 384, y: -328 }, { x: 384, y: 24 }], rotation: 0, type: "pulley", visible: true, width: 0, x: 336, y: 568, properties: {} }, { gid: 27, height: 64, id: 14, name: "", rotation: 0, type: "box", visible: true, width: 64, x: 1032, y: 448, properties: {} }, { gid: 24, height: 64, id: 15, name: "", properties: { group: 3, onis: 1, startPos: -1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 1120, y: 864 }, { gid: 23, height: 64, id: 16, name: "", rotation: 0, type: "pusher", visible: true, width: 64, x: 448, y: 448, properties: { group: 0 } }, { gid: 23, height: 64, id: 17, name: "", properties: { group: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 560, y: 512 }, { gid: 27, height: 64, id: 18, name: "", rotation: 0, type: "box", visible: true, width: 64, x: 304, y: 576, properties: {} }, { height: 128, id: 20, name: "", properties: { dtheta: 90, dx: 0, dy: 4, offsetY: -1.5 }, propertytypes: { dtheta: "float", dx: "int", dy: "int", offsetY: "float" }, rotation: 0, type: "platform", visible: true, width: 32, x: 1024, y: 472 }, { height: 128, id: 24, name: "", properties: { dtheta: 90, dx: 0, dy: -4, group: 1, offsetY: -1.5 }, propertytypes: { dtheta: "float", dx: "int", dy: "int", group: "int", offsetY: "float" }, rotation: 0, type: "platform", visible: true, width: 32, x: 1024, y: 608 }, { height: 128, id: 28, name: "", properties: { dx: 0, dy: 4, group: 3 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 352, y: 768 }, { gid: 27, height: 64, id: 30, name: "", rotation: 0, type: "box", visible: true, width: 64, x: 480, y: 896, properties: {} }], properties: {}, sha256: "440194c67176b572dab0d8dd6054856e847707aeb1e7ee4061ec3f0247adb719" }, { id: "forest_31", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 1, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 2, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 4, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 4, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, 3, 4, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, 1, 0, 4, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, -1, -1, 0, 0, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, 3, -1, -1, -1, -1, -1, -1, -1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 2, -1, -1, 1, 0, 0, 0, 0, -1, -1, 3, 0, 6, 6, 6, 6, 6, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, 1, 4, -1, -1, -1, -1, 1, 0, 5, 5, 5, 5, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 4, -1, -1, -1, 1, 4, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 4, -1, -1, -1, 1, 4, -1, -1, -1, 1, 0, 4, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 2, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 4, -1, -1, -1, 1, 0, -1, -1, 1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 0, 0, 5, 5, 0, 0, 0, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, 0, 6, 6, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 2, -1, -1, -1, -1, 0, -1, -1, -1, -1, 0, 0, 4, -1, -1, -1, -1, -1, -1, 3, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 2, -1, -1, 3, 0, 0, 6, 6, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, 0, 0, 0, -1, -1, -1, 1, 0, 0, 2, -1, -1, 0, 0, -1, -1, 1, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, 0, 6, 6, 6, 6, 0, 0, 5, 5, 5, 5, 2, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 2, -1, -1, -1, 1, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 2, -1, -1, -1, 1, 0, 0, 7, 7, 0, 0, 0, 7, 7, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 17, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 992, y: 129, properties: { char: "wg" } }, { gid: 16, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 64, y: 128, properties: { char: "fb" } }, { gid: 20, height: 64, id: 3, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 288, y: 112, properties: { char: "fb" } }, { gid: 20, height: 64, id: 4, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 88, y: 272, properties: { char: "fb" } }, { gid: 20, height: 64, id: 5, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 240, y: 472, properties: { char: "fb" } }, { gid: 20, height: 64, id: 6, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 512, y: 400, properties: { char: "fb" } }, { gid: 20, height: 64, id: 7, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 672, y: 448, properties: { char: "fb" } }, { gid: 20, height: 64, id: 8, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 256, y: 720, properties: { char: "fb" } }, { gid: 20, height: 64, id: 9, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 336, y: 848, properties: { char: "fb" } }, { gid: 21, height: 64, id: 10, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 880, y: 272, properties: { char: "wg" } }, { gid: 21, height: 64, id: 11, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 800, y: 464, properties: { char: "wg" } }, { gid: 21, height: 64, id: 12, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 944, y: 720, properties: { char: "wg" } }, { gid: 21, height: 64, id: 13, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 680, y: 696, properties: { char: "wg" } }, { gid: 21, height: 64, id: 14, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 608, y: 512, properties: { char: "wg" } }, { gid: 21, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 448, y: 720, properties: { char: "wg" } }, { gid: 21, height: 64, id: 16, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 400, y: 848, properties: { char: "wg" } }, { gid: 18, height: 64, id: 18, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 960, y: 896, properties: { char: "fb" } }, { gid: 19, height: 64, id: 19, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 1056, y: 896, properties: { char: "wg" } }, { gid: 24, height: 64, id: 20, name: "", rotation: 0, type: "pusher", visible: true, width: 64, x: 1152, y: 928, properties: { group: 0 } }, { gid: 24, height: 64, id: 21, name: "", rotation: 0, type: "pusher", visible: true, width: 64, x: 608, y: 928, properties: { group: 0 } }, { gid: 26, height: 64, id: 22, name: "", properties: { group: 1, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 960, y: 800 }, { gid: 26, height: 64, id: 23, name: "", properties: { group: 3, onis: -1, startPos: 1 }, propertytypes: { group: "int" }, rotation: 0, type: "lever", visible: true, width: 64, x: 64, y: 544 }, { height: 96, id: 26, name: "", properties: { dtheta: 90, dx: 0, dy: 3, offsetY: -1 }, propertytypes: { dtheta: "float", dx: "int", dy: "int", offsetY: "float" }, rotation: 0, type: "platform", visible: true, width: 32, x: 832, y: 800 }, { height: 32, id: 27, name: "", properties: { dx: 3, group: 3 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 544, y: 544 }, { height: 32, id: 31, name: "", properties: { dx: -3, group: 1 }, propertytypes: { dx: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 99, x: 669, y: 704 }], properties: {}, sha256: "3b1c76d63c3d483fd0480afdf8c787deba9fdbefffcb10b7748ea876d4075382" }, { id: "forest_32", width: 39, height: 29, tile: 32, ground: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 2, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 4, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, 0, 0, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 0, 0, 0, 7, 7, 7, 7, 7, 7, 7, 7, 0, 0, 0, 0, 2, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, 1, 0, 0, 0, 0, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, 1, 0, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 2, -1, -1, -1, -1, 1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], objects: [{ gid: 16, height: 64, id: 1, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 736, y: 864, properties: { char: "fb" } }, { gid: 17, height: 64, id: 2, name: "", rotation: 0, type: "char", visible: true, width: 64, x: 832, y: 864, properties: { char: "wg" } }, { gid: 18, height: 64, id: 3, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 544, y: 128, properties: { char: "fb" } }, { gid: 19, height: 64, id: 4, name: "", rotation: 0, type: "door", visible: true, width: 64, x: 672, y: 128, properties: { char: "wg" } }, { gid: 22, height: 64, id: 15, name: "", rotation: 0, type: "diamond", visible: true, width: 64, x: 48, y: 112, properties: { char: "silver" } }, { gid: 27, height: 64, id: 7, name: "", rotation: 0, type: "box", visible: true, width: 64, x: 336, y: 640, properties: {} }, { gid: 23, height: 64, id: 8, name: "", properties: { group: 5 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 1120, y: 928 }, { gid: 23, height: 64, id: 9, name: "", properties: { group: 2 }, propertytypes: { group: "int" }, rotation: 0, type: "pusher", visible: true, width: 64, x: 1120, y: 512 }, { height: 96, id: 10, name: "", properties: { dx: 0, dy: 3, group: 2 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 32, x: 128, y: 32 }, { height: 32, id: 13, name: "", properties: { dx: 0, dy: 3, group: 5 }, propertytypes: { dx: "int", dy: "int", group: "int" }, rotation: 0, type: "platform", visible: true, width: 96, x: 32, y: 864 }, { gid: 33, height: 64, id: 18, name: "", rotation: 0, type: "ball", visible: true, width: 64, x: 1120, y: 128, properties: {} }], properties: {}, sha256: "1626d77dd2038815d346d6e1bb6b65884b81e7017049093270607a288a2a3387" }], atlases: { CharAssets: { _default0000: { filename: "_default0000", frame: { x: 2008, y: 0, w: 34, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 34, h: 34 }, sourceSize: { w: 34, h: 34 } }, death_smoke0000: { filename: "death_smoke0000", frame: { x: 116, y: 1341, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0001: { filename: "death_smoke0001", frame: { x: 222, y: 1341, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0002: { filename: "death_smoke0002", frame: { x: 1203, y: 1413, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0003: { filename: "death_smoke0003", frame: { x: 1309, y: 1413, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0004: { filename: "death_smoke0004", frame: { x: 1415, y: 1413, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0005: { filename: "death_smoke0005", frame: { x: 1521, y: 1413, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0006: { filename: "death_smoke0006", frame: { x: 1627, y: 1413, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0007: { filename: "death_smoke0007", frame: { x: 1733, y: 1413, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0008: { filename: "death_smoke0008", frame: { x: 1839, y: 1413, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0009: { filename: "death_smoke0009", frame: { x: 518, y: 1430, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0010: { filename: "death_smoke0010", frame: { x: 116, y: 1452, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0011: { filename: "death_smoke0011", frame: { x: 222, y: 1452, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0012: { filename: "death_smoke0012", frame: { x: 0, y: 1457, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0013: { filename: "death_smoke0013", frame: { x: 969, y: 1457, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0014: { filename: "death_smoke0014", frame: { x: 1075, y: 1457, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0015: { filename: "death_smoke0015", frame: { x: 624, y: 1460, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0016: { filename: "death_smoke0016", frame: { x: 730, y: 1460, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0017: { filename: "death_smoke0017", frame: { x: 836, y: 1460, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0018: { filename: "death_smoke0018", frame: { x: 328, y: 1462, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0019: { filename: "death_smoke0019", frame: { x: 1181, y: 1524, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0020: { filename: "death_smoke0020", frame: { x: 1287, y: 1524, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0021: { filename: "death_smoke0021", frame: { x: 1393, y: 1524, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0022: { filename: "death_smoke0022", frame: { x: 1499, y: 1524, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0023: { filename: "death_smoke0023", frame: { x: 1605, y: 1524, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0024: { filename: "death_smoke0024", frame: { x: 1711, y: 1524, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0025: { filename: "death_smoke0025", frame: { x: 1817, y: 1524, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0026: { filename: "death_smoke0026", frame: { x: 1923, y: 1524, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0027: { filename: "death_smoke0027", frame: { x: 434, y: 1541, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0028: { filename: "death_smoke0028", frame: { x: 106, y: 1563, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0029: { filename: "death_smoke0029", frame: { x: 212, y: 1563, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0030: { filename: "death_smoke0030", frame: { x: 0, y: 1568, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0031: { filename: "death_smoke0031", frame: { x: 942, y: 1568, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0032: { filename: "death_smoke0032", frame: { x: 1048, y: 1568, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0033: { filename: "death_smoke0033", frame: { x: 540, y: 1571, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0034: { filename: "death_smoke0034", frame: { x: 646, y: 1571, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0035: { filename: "death_smoke0035", frame: { x: 752, y: 1571, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0036: { filename: "death_smoke0036", frame: { x: 318, y: 1573, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0037: { filename: "death_smoke0037", frame: { x: 1154, y: 1635, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0038: { filename: "death_smoke0038", frame: { x: 1260, y: 1635, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0039: { filename: "death_smoke0039", frame: { x: 1366, y: 1635, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0040: { filename: "death_smoke0040", frame: { x: 1472, y: 1635, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0041: { filename: "death_smoke0041", frame: { x: 1578, y: 1635, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0042: { filename: "death_smoke0042", frame: { x: 1684, y: 1635, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0043: { filename: "death_smoke0043", frame: { x: 1790, y: 1635, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, death_smoke0044: { filename: "death_smoke0044", frame: { x: 1896, y: 1635, w: 102, h: 107 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 107 }, sourceSize: { w: 102, h: 107 } }, diamond_fb0000: { filename: "diamond_fb0000", frame: { x: 1086, y: 1339, w: 113, h: 114 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 114 }, sourceSize: { w: 113, h: 114 } }, diamond_fbwg0000: { filename: "diamond_fbwg0000", frame: { x: 0, y: 1341, w: 112, h: 112 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 112, h: 112 }, sourceSize: { w: 112, h: 112 } }, diamond_silver0000: { filename: "diamond_silver0000", frame: { x: 848, y: 1339, w: 117, h: 117 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 117, h: 117 }, sourceSize: { w: 117, h: 117 } }, diamond_wg0000: { filename: "diamond_wg0000", frame: { x: 969, y: 1339, w: 113, h: 114 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 114 }, sourceSize: { w: 113, h: 114 } }, fire_glow0000: { filename: "fire_glow0000", frame: { x: 1944, y: 1266, w: 94, h: 104 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 94, h: 104 }, sourceSize: { w: 94, h: 104 } }, fire_head_falling0000: { filename: "fire_head_falling0000", frame: { x: 1340, y: 800, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_falling0001: { filename: "fire_head_falling0001", frame: { x: 1474, y: 800, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_falling0002: { filename: "fire_head_falling0002", frame: { x: 1608, y: 800, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_falling0003: { filename: "fire_head_falling0003", frame: { x: 1742, y: 800, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_falling0004: { filename: "fire_head_falling0004", frame: { x: 1876, y: 800, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0000: { filename: "fire_head_idle0000", frame: { x: 0, y: 862, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0001: { filename: "fire_head_idle0001", frame: { x: 134, y: 862, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0002: { filename: "fire_head_idle0002", frame: { x: 268, y: 862, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0003: { filename: "fire_head_idle0003", frame: { x: 402, y: 862, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0004: { filename: "fire_head_idle0004", frame: { x: 536, y: 862, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0005: { filename: "fire_head_idle0005", frame: { x: 670, y: 862, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0006: { filename: "fire_head_idle0006", frame: { x: 804, y: 892, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0007: { filename: "fire_head_idle0007", frame: { x: 938, y: 892, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0008: { filename: "fire_head_idle0008", frame: { x: 1072, y: 892, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0009: { filename: "fire_head_idle0009", frame: { x: 1206, y: 892, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0010: { filename: "fire_head_idle0010", frame: { x: 1340, y: 966, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0011: { filename: "fire_head_idle0011", frame: { x: 1474, y: 966, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0012: { filename: "fire_head_idle0012", frame: { x: 1608, y: 966, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0013: { filename: "fire_head_idle0013", frame: { x: 1742, y: 966, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0014: { filename: "fire_head_idle0014", frame: { x: 1876, y: 966, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0015: { filename: "fire_head_idle0015", frame: { x: 0, y: 1028, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0016: { filename: "fire_head_idle0016", frame: { x: 134, y: 1028, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0017: { filename: "fire_head_idle0017", frame: { x: 268, y: 1028, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_idle0018: { filename: "fire_head_idle0018", frame: { x: 402, y: 1028, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, fire_head_jumping0000: { filename: "fire_head_jumping0000", frame: { x: 536, y: 1028, w: 156, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 156, h: 130 }, sourceSize: { w: 156, h: 130 } }, fire_head_jumping0001: { filename: "fire_head_jumping0001", frame: { x: 696, y: 1058, w: 156, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 156, h: 130 }, sourceSize: { w: 156, h: 130 } }, fire_head_jumping0002: { filename: "fire_head_jumping0002", frame: { x: 856, y: 1058, w: 156, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 156, h: 130 }, sourceSize: { w: 156, h: 130 } }, fire_head_jumping0003: { filename: "fire_head_jumping0003", frame: { x: 1016, y: 1058, w: 156, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 156, h: 130 }, sourceSize: { w: 156, h: 130 } }, fire_head_jumping0004: { filename: "fire_head_jumping0004", frame: { x: 1176, y: 1058, w: 156, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 156, h: 130 }, sourceSize: { w: 156, h: 130 } }, fire_head_jumping0005: { filename: "fire_head_jumping0005", frame: { x: 1336, y: 1132, w: 156, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 156, h: 130 }, sourceSize: { w: 156, h: 130 } }, fire_head_jumping0006: { filename: "fire_head_jumping0006", frame: { x: 1496, y: 1132, w: 156, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 156, h: 130 }, sourceSize: { w: 156, h: 130 } }, fire_head_jumping0007: { filename: "fire_head_jumping0007", frame: { x: 1656, y: 1132, w: 156, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 156, h: 130 }, sourceSize: { w: 156, h: 130 } }, fire_head_jumping0008: { filename: "fire_head_jumping0008", frame: { x: 1816, y: 1132, w: 156, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 156, h: 130 }, sourceSize: { w: 156, h: 130 } }, fire_head_jumping0009: { filename: "fire_head_jumping0009", frame: { x: 536, y: 1162, w: 156, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 156, h: 130 }, sourceSize: { w: 156, h: 130 } }, fire_head_jumping0010: { filename: "fire_head_jumping0010", frame: { x: 696, y: 1192, w: 156, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 156, h: 130 }, sourceSize: { w: 156, h: 130 } }, fire_head_rising0000: { filename: "fire_head_rising0000", frame: { x: 408, y: 1194, w: 106, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 106, h: 130 }, sourceSize: { w: 106, h: 130 } }, fire_head_rising0001: { filename: "fire_head_rising0001", frame: { x: 518, y: 1296, w: 106, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 106, h: 130 }, sourceSize: { w: 106, h: 130 } }, fire_head_rising0002: { filename: "fire_head_rising0002", frame: { x: 628, y: 1326, w: 106, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 106, h: 130 }, sourceSize: { w: 106, h: 130 } }, fire_head_rising0003: { filename: "fire_head_rising0003", frame: { x: 738, y: 1326, w: 106, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 106, h: 130 }, sourceSize: { w: 106, h: 130 } }, fire_head_rising0004: { filename: "fire_head_rising0004", frame: { x: 408, y: 1328, w: 106, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 106, h: 130 }, sourceSize: { w: 106, h: 130 } }, fire_ice_legs0000: { filename: "fire_ice_legs0000", frame: { x: 664, y: 1896, w: 72, h: 88 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 72, h: 88 }, sourceSize: { w: 72, h: 88 } }, fire_ice_legs0001: { filename: "fire_ice_legs0001", frame: { x: 148, y: 1898, w: 72, h: 88 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 72, h: 88 }, sourceSize: { w: 72, h: 88 } }, fire_ice_legs0002: { filename: "fire_ice_legs0002", frame: { x: 224, y: 1898, w: 72, h: 88 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 72, h: 88 }, sourceSize: { w: 72, h: 88 } }, fire_legs_idle0000: { filename: "fire_legs_idle0000", frame: { x: 134, y: 354, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, fire_legs_running0000: { filename: "fire_legs_running0000", frame: { x: 1024, y: 208, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, fire_legs_running0001: { filename: "fire_legs_running0001", frame: { x: 1158, y: 208, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, fire_legs_running0002: { filename: "fire_legs_running0002", frame: { x: 1292, y: 208, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, fire_legs_running0003: { filename: "fire_legs_running0003", frame: { x: 1426, y: 292, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, fire_legs_running0004: { filename: "fire_legs_running0004", frame: { x: 1560, y: 292, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, fire_legs_running0005: { filename: "fire_legs_running0005", frame: { x: 1694, y: 292, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, fire_legs_running0006: { filename: "fire_legs_running0006", frame: { x: 1828, y: 292, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, fire_legs_running0007: { filename: "fire_legs_running0007", frame: { x: 0, y: 354, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, fire_stairs0000: { filename: "fire_stairs0000", frame: { x: 1962, y: 292, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0001: { filename: "fire_stairs0001", frame: { x: 328, y: 1341, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0002: { filename: "fire_stairs0002", frame: { x: 858, y: 1571, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0003: { filename: "fire_stairs0003", frame: { x: 424, y: 1652, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0004: { filename: "fire_stairs0004", frame: { x: 106, y: 1674, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0005: { filename: "fire_stairs0005", frame: { x: 181, y: 1674, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0006: { filename: "fire_stairs0006", frame: { x: 858, y: 1678, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0007: { filename: "fire_stairs0007", frame: { x: 0, y: 1679, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0008: { filename: "fire_stairs0008", frame: { x: 933, y: 1679, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0009: { filename: "fire_stairs0009", frame: { x: 1008, y: 1679, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0010: { filename: "fire_stairs0010", frame: { x: 499, y: 1682, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0011: { filename: "fire_stairs0011", frame: { x: 574, y: 1682, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0012: { filename: "fire_stairs0012", frame: { x: 649, y: 1682, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0013: { filename: "fire_stairs0013", frame: { x: 724, y: 1682, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0014: { filename: "fire_stairs0014", frame: { x: 256, y: 1684, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0015: { filename: "fire_stairs0015", frame: { x: 331, y: 1684, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0016: { filename: "fire_stairs0016", frame: { x: 1083, y: 1746, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0017: { filename: "fire_stairs0017", frame: { x: 1158, y: 1746, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0018: { filename: "fire_stairs0018", frame: { x: 1233, y: 1746, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0019: { filename: "fire_stairs0019", frame: { x: 1308, y: 1746, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0020: { filename: "fire_stairs0020", frame: { x: 1383, y: 1746, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0021: { filename: "fire_stairs0021", frame: { x: 1458, y: 1746, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0022: { filename: "fire_stairs0022", frame: { x: 1533, y: 1746, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0023: { filename: "fire_stairs0023", frame: { x: 1608, y: 1746, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0024: { filename: "fire_stairs0024", frame: { x: 1683, y: 1746, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0025: { filename: "fire_stairs0025", frame: { x: 1758, y: 1746, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0026: { filename: "fire_stairs0026", frame: { x: 1833, y: 1746, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0027: { filename: "fire_stairs0027", frame: { x: 1908, y: 1746, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0028: { filename: "fire_stairs0028", frame: { x: 406, y: 1759, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, fire_stairs0029: { filename: "fire_stairs0029", frame: { x: 75, y: 1781, w: 71, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 71, h: 103 }, sourceSize: { w: 71, h: 103 } }, water_glow0000: { filename: "water_glow0000", frame: { x: 1945, y: 1374, w: 94, h: 104 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 94, h: 104 }, sourceSize: { w: 94, h: 104 } }, water_head_falling0000: { filename: "water_head_falling0000", frame: { x: 0, y: 0, w: 130, h: 204 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 204 }, sourceSize: { w: 130, h: 204 } }, water_head_falling0001: { filename: "water_head_falling0001", frame: { x: 134, y: 0, w: 130, h: 204 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 204 }, sourceSize: { w: 130, h: 204 } }, water_head_falling0002: { filename: "water_head_falling0002", frame: { x: 268, y: 0, w: 130, h: 204 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 204 }, sourceSize: { w: 130, h: 204 } }, water_head_falling0003: { filename: "water_head_falling0003", frame: { x: 402, y: 0, w: 130, h: 204 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 204 }, sourceSize: { w: 130, h: 204 } }, water_head_falling0004: { filename: "water_head_falling0004", frame: { x: 536, y: 0, w: 130, h: 204 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 204 }, sourceSize: { w: 130, h: 204 } }, water_head_falling0005: { filename: "water_head_falling0005", frame: { x: 670, y: 0, w: 130, h: 204 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 204 }, sourceSize: { w: 130, h: 204 } }, water_head_falling0006: { filename: "water_head_falling0006", frame: { x: 804, y: 0, w: 130, h: 204 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 204 }, sourceSize: { w: 130, h: 204 } }, water_head_falling0007: { filename: "water_head_falling0007", frame: { x: 938, y: 0, w: 130, h: 204 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 204 }, sourceSize: { w: 130, h: 204 } }, water_head_falling0008: { filename: "water_head_falling0008", frame: { x: 1072, y: 0, w: 130, h: 204 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 204 }, sourceSize: { w: 130, h: 204 } }, water_head_falling0009: { filename: "water_head_falling0009", frame: { x: 1206, y: 0, w: 130, h: 204 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 204 }, sourceSize: { w: 130, h: 204 } }, water_head_falling0010: { filename: "water_head_falling0010", frame: { x: 1340, y: 0, w: 130, h: 204 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 204 }, sourceSize: { w: 130, h: 204 } }, water_head_idle0000: { filename: "water_head_idle0000", frame: { x: 1340, y: 468, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0001: { filename: "water_head_idle0001", frame: { x: 1474, y: 468, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0002: { filename: "water_head_idle0002", frame: { x: 1608, y: 468, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0003: { filename: "water_head_idle0003", frame: { x: 1742, y: 468, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0004: { filename: "water_head_idle0004", frame: { x: 1876, y: 468, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0005: { filename: "water_head_idle0005", frame: { x: 0, y: 530, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0006: { filename: "water_head_idle0006", frame: { x: 134, y: 530, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0007: { filename: "water_head_idle0007", frame: { x: 268, y: 530, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0008: { filename: "water_head_idle0008", frame: { x: 402, y: 530, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0009: { filename: "water_head_idle0009", frame: { x: 536, y: 530, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0010: { filename: "water_head_idle0010", frame: { x: 670, y: 530, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0011: { filename: "water_head_idle0011", frame: { x: 804, y: 560, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0012: { filename: "water_head_idle0012", frame: { x: 938, y: 560, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0013: { filename: "water_head_idle0013", frame: { x: 1072, y: 560, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0014: { filename: "water_head_idle0014", frame: { x: 1206, y: 560, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0015: { filename: "water_head_idle0015", frame: { x: 1340, y: 634, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0016: { filename: "water_head_idle0016", frame: { x: 1474, y: 634, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0017: { filename: "water_head_idle0017", frame: { x: 1608, y: 634, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0018: { filename: "water_head_idle0018", frame: { x: 1742, y: 634, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0019: { filename: "water_head_idle0019", frame: { x: 1876, y: 634, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0020: { filename: "water_head_idle0020", frame: { x: 0, y: 696, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0021: { filename: "water_head_idle0021", frame: { x: 134, y: 696, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0022: { filename: "water_head_idle0022", frame: { x: 268, y: 696, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0023: { filename: "water_head_idle0023", frame: { x: 402, y: 696, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0024: { filename: "water_head_idle0024", frame: { x: 536, y: 696, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0025: { filename: "water_head_idle0025", frame: { x: 670, y: 696, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0026: { filename: "water_head_idle0026", frame: { x: 804, y: 726, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0027: { filename: "water_head_idle0027", frame: { x: 938, y: 726, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0028: { filename: "water_head_idle0028", frame: { x: 1072, y: 726, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_idle0029: { filename: "water_head_idle0029", frame: { x: 1206, y: 726, w: 130, h: 162 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 162 }, sourceSize: { w: 130, h: 162 } }, water_head_jumping0000: { filename: "water_head_jumping0000", frame: { x: 1474, y: 0, w: 174, h: 142 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 174, h: 142 }, sourceSize: { w: 174, h: 142 } }, water_head_jumping0001: { filename: "water_head_jumping0001", frame: { x: 1652, y: 0, w: 174, h: 142 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 174, h: 142 }, sourceSize: { w: 174, h: 142 } }, water_head_jumping0002: { filename: "water_head_jumping0002", frame: { x: 1830, y: 0, w: 174, h: 142 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 174, h: 142 }, sourceSize: { w: 174, h: 142 } }, water_head_jumping0003: { filename: "water_head_jumping0003", frame: { x: 1474, y: 146, w: 174, h: 142 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 174, h: 142 }, sourceSize: { w: 174, h: 142 } }, water_head_jumping0004: { filename: "water_head_jumping0004", frame: { x: 1652, y: 146, w: 174, h: 142 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 174, h: 142 }, sourceSize: { w: 174, h: 142 } }, water_head_jumping0005: { filename: "water_head_jumping0005", frame: { x: 1830, y: 146, w: 174, h: 142 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 174, h: 142 }, sourceSize: { w: 174, h: 142 } }, water_head_jumping0006: { filename: "water_head_jumping0006", frame: { x: 0, y: 208, w: 174, h: 142 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 174, h: 142 }, sourceSize: { w: 174, h: 142 } }, water_head_jumping0007: { filename: "water_head_jumping0007", frame: { x: 178, y: 208, w: 174, h: 142 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 174, h: 142 }, sourceSize: { w: 174, h: 142 } }, water_head_jumping0008: { filename: "water_head_jumping0008", frame: { x: 356, y: 208, w: 174, h: 142 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 174, h: 142 }, sourceSize: { w: 174, h: 142 } }, water_head_jumping0009: { filename: "water_head_jumping0009", frame: { x: 534, y: 208, w: 174, h: 142 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 174, h: 142 }, sourceSize: { w: 174, h: 142 } }, water_head_jumping0010: { filename: "water_head_jumping0010", frame: { x: 712, y: 208, w: 174, h: 142 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 174, h: 142 }, sourceSize: { w: 174, h: 142 } }, water_head_rising0000: { filename: "water_head_rising0000", frame: { x: 856, y: 1192, w: 132, h: 143 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 132, h: 143 }, sourceSize: { w: 132, h: 143 } }, water_head_rising0001: { filename: "water_head_rising0001", frame: { x: 992, y: 1192, w: 132, h: 143 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 132, h: 143 }, sourceSize: { w: 132, h: 143 } }, water_head_rising0002: { filename: "water_head_rising0002", frame: { x: 1128, y: 1192, w: 132, h: 143 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 132, h: 143 }, sourceSize: { w: 132, h: 143 } }, water_head_rising0003: { filename: "water_head_rising0003", frame: { x: 0, y: 1194, w: 132, h: 143 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 132, h: 143 }, sourceSize: { w: 132, h: 143 } }, water_head_rising0004: { filename: "water_head_rising0004", frame: { x: 136, y: 1194, w: 132, h: 143 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 132, h: 143 }, sourceSize: { w: 132, h: 143 } }, water_head_rising0005: { filename: "water_head_rising0005", frame: { x: 272, y: 1194, w: 132, h: 143 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 132, h: 143 }, sourceSize: { w: 132, h: 143 } }, water_head_rising0006: { filename: "water_head_rising0006", frame: { x: 1264, y: 1266, w: 132, h: 143 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 132, h: 143 }, sourceSize: { w: 132, h: 143 } }, water_head_rising0007: { filename: "water_head_rising0007", frame: { x: 1400, y: 1266, w: 132, h: 143 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 132, h: 143 }, sourceSize: { w: 132, h: 143 } }, water_head_rising0008: { filename: "water_head_rising0008", frame: { x: 1536, y: 1266, w: 132, h: 143 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 132, h: 143 }, sourceSize: { w: 132, h: 143 } }, water_head_rising0009: { filename: "water_head_rising0009", frame: { x: 1672, y: 1266, w: 132, h: 143 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 132, h: 143 }, sourceSize: { w: 132, h: 143 } }, water_head_rising0010: { filename: "water_head_rising0010", frame: { x: 1808, y: 1266, w: 132, h: 143 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 132, h: 143 }, sourceSize: { w: 132, h: 143 } }, water_ice_legs0000: { filename: "water_ice_legs0000", frame: { x: 1976, y: 1132, w: 66, h: 110 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 66, h: 110 }, sourceSize: { w: 66, h: 110 } }, water_ice_legs0001: { filename: "water_ice_legs0001", frame: { x: 150, y: 1781, w: 66, h: 110 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 66, h: 110 }, sourceSize: { w: 66, h: 110 } }, water_ice_legs0002: { filename: "water_ice_legs0002", frame: { x: 799, y: 1785, w: 66, h: 110 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 66, h: 110 }, sourceSize: { w: 66, h: 110 } }, water_legs_idle0000: { filename: "water_legs_idle0000", frame: { x: 890, y: 208, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, water_legs_running0000: { filename: "water_legs_running0000", frame: { x: 268, y: 354, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, water_legs_running0001: { filename: "water_legs_running0001", frame: { x: 402, y: 354, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, water_legs_running0002: { filename: "water_legs_running0002", frame: { x: 536, y: 354, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, water_legs_running0003: { filename: "water_legs_running0003", frame: { x: 670, y: 354, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, water_legs_running0004: { filename: "water_legs_running0004", frame: { x: 804, y: 384, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, water_legs_running0005: { filename: "water_legs_running0005", frame: { x: 938, y: 384, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, water_legs_running0006: { filename: "water_legs_running0006", frame: { x: 1072, y: 384, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, water_legs_running0007: { filename: "water_legs_running0007", frame: { x: 1206, y: 384, w: 130, h: 172 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 172 }, sourceSize: { w: 130, h: 172 } }, water_stairs0000: { filename: "water_stairs0000", frame: { x: 0, y: 1786, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0001: { filename: "water_stairs0001", frame: { x: 869, y: 1786, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0002: { filename: "water_stairs0002", frame: { x: 943, y: 1786, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0003: { filename: "water_stairs0003", frame: { x: 481, y: 1789, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0004: { filename: "water_stairs0004", frame: { x: 555, y: 1789, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0005: { filename: "water_stairs0005", frame: { x: 629, y: 1789, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0006: { filename: "water_stairs0006", frame: { x: 703, y: 1789, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0007: { filename: "water_stairs0007", frame: { x: 220, y: 1791, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0008: { filename: "water_stairs0008", frame: { x: 294, y: 1791, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0009: { filename: "water_stairs0009", frame: { x: 1017, y: 1853, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0010: { filename: "water_stairs0010", frame: { x: 1091, y: 1853, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0011: { filename: "water_stairs0011", frame: { x: 1165, y: 1853, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0012: { filename: "water_stairs0012", frame: { x: 1239, y: 1853, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0013: { filename: "water_stairs0013", frame: { x: 1313, y: 1853, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0014: { filename: "water_stairs0014", frame: { x: 1387, y: 1853, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0015: { filename: "water_stairs0015", frame: { x: 1461, y: 1853, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0016: { filename: "water_stairs0016", frame: { x: 1535, y: 1853, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0017: { filename: "water_stairs0017", frame: { x: 1609, y: 1853, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0018: { filename: "water_stairs0018", frame: { x: 1683, y: 1853, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0019: { filename: "water_stairs0019", frame: { x: 1757, y: 1853, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0020: { filename: "water_stairs0020", frame: { x: 1831, y: 1853, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0021: { filename: "water_stairs0021", frame: { x: 1905, y: 1853, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0022: { filename: "water_stairs0022", frame: { x: 368, y: 1866, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0023: { filename: "water_stairs0023", frame: { x: 74, y: 1888, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0024: { filename: "water_stairs0024", frame: { x: 0, y: 1893, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0025: { filename: "water_stairs0025", frame: { x: 869, y: 1893, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0026: { filename: "water_stairs0026", frame: { x: 943, y: 1893, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0027: { filename: "water_stairs0027", frame: { x: 442, y: 1896, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0028: { filename: "water_stairs0028", frame: { x: 516, y: 1896, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } }, water_stairs0029: { filename: "water_stairs0029", frame: { x: 590, y: 1896, w: 70, h: 103 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 70, h: 103 }, sourceSize: { w: 70, h: 103 } } }, GroundAssets: { BeamDust0000: { filename: "BeamDust0000", frame: { x: 0, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0001: { filename: "BeamDust0001", frame: { x: 58, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0002: { filename: "BeamDust0002", frame: { x: 116, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0003: { filename: "BeamDust0003", frame: { x: 174, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0004: { filename: "BeamDust0004", frame: { x: 232, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0005: { filename: "BeamDust0005", frame: { x: 290, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0006: { filename: "BeamDust0006", frame: { x: 348, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0007: { filename: "BeamDust0007", frame: { x: 406, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0008: { filename: "BeamDust0008", frame: { x: 464, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0009: { filename: "BeamDust0009", frame: { x: 522, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0010: { filename: "BeamDust0010", frame: { x: 580, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0011: { filename: "BeamDust0011", frame: { x: 638, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0012: { filename: "BeamDust0012", frame: { x: 696, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0013: { filename: "BeamDust0013", frame: { x: 754, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0014: { filename: "BeamDust0014", frame: { x: 812, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0015: { filename: "BeamDust0015", frame: { x: 870, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0016: { filename: "BeamDust0016", frame: { x: 928, y: 0, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0017: { filename: "BeamDust0017", frame: { x: 0, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0018: { filename: "BeamDust0018", frame: { x: 58, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0019: { filename: "BeamDust0019", frame: { x: 116, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0020: { filename: "BeamDust0020", frame: { x: 174, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0021: { filename: "BeamDust0021", frame: { x: 232, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0022: { filename: "BeamDust0022", frame: { x: 290, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0023: { filename: "BeamDust0023", frame: { x: 348, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0024: { filename: "BeamDust0024", frame: { x: 406, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0025: { filename: "BeamDust0025", frame: { x: 464, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0026: { filename: "BeamDust0026", frame: { x: 522, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0027: { filename: "BeamDust0027", frame: { x: 580, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0028: { filename: "BeamDust0028", frame: { x: 638, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0029: { filename: "BeamDust0029", frame: { x: 696, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0030: { filename: "BeamDust0030", frame: { x: 754, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0031: { filename: "BeamDust0031", frame: { x: 812, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0032: { filename: "BeamDust0032", frame: { x: 870, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0033: { filename: "BeamDust0033", frame: { x: 928, y: 57, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0034: { filename: "BeamDust0034", frame: { x: 0, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0035: { filename: "BeamDust0035", frame: { x: 58, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0036: { filename: "BeamDust0036", frame: { x: 116, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0037: { filename: "BeamDust0037", frame: { x: 174, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0038: { filename: "BeamDust0038", frame: { x: 232, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0039: { filename: "BeamDust0039", frame: { x: 290, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0040: { filename: "BeamDust0040", frame: { x: 348, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0041: { filename: "BeamDust0041", frame: { x: 406, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0042: { filename: "BeamDust0042", frame: { x: 464, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0043: { filename: "BeamDust0043", frame: { x: 522, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0044: { filename: "BeamDust0044", frame: { x: 580, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0045: { filename: "BeamDust0045", frame: { x: 638, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0046: { filename: "BeamDust0046", frame: { x: 696, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0047: { filename: "BeamDust0047", frame: { x: 754, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0048: { filename: "BeamDust0048", frame: { x: 812, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0049: { filename: "BeamDust0049", frame: { x: 870, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0050: { filename: "BeamDust0050", frame: { x: 928, y: 114, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0051: { filename: "BeamDust0051", frame: { x: 0, y: 171, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0052: { filename: "BeamDust0052", frame: { x: 58, y: 171, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0053: { filename: "BeamDust0053", frame: { x: 116, y: 171, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0054: { filename: "BeamDust0054", frame: { x: 174, y: 171, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0055: { filename: "BeamDust0055", frame: { x: 232, y: 171, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0056: { filename: "BeamDust0056", frame: { x: 290, y: 171, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0057: { filename: "BeamDust0057", frame: { x: 348, y: 171, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0058: { filename: "BeamDust0058", frame: { x: 406, y: 171, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamDust0059: { filename: "BeamDust0059", frame: { x: 464, y: 171, w: 54, h: 53 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 54, h: 53 }, sourceSize: { w: 54, h: 53 } }, BeamGradient0000: { filename: "BeamGradient0000", frame: { x: 522, y: 171, w: 10, h: 20 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 10, h: 20 }, sourceSize: { w: 10, h: 20 } }, BlackBox0000: { filename: "BlackBox0000", frame: { x: 536, y: 171, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBox0001: { filename: "BlackBox0001", frame: { x: 590, y: 171, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBox0002: { filename: "BlackBox0002", frame: { x: 644, y: 171, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBox0003: { filename: "BlackBox0003", frame: { x: 698, y: 171, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBox0004: { filename: "BlackBox0004", frame: { x: 752, y: 171, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBox0005: { filename: "BlackBox0005", frame: { x: 806, y: 171, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBox0006: { filename: "BlackBox0006", frame: { x: 860, y: 171, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBox0007: { filename: "BlackBox0007", frame: { x: 914, y: 171, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBox0008: { filename: "BlackBox0008", frame: { x: 968, y: 171, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBox0009: { filename: "BlackBox0009", frame: { x: 0, y: 228, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBox0010: { filename: "BlackBox0010", frame: { x: 54, y: 228, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBox0011: { filename: "BlackBox0011", frame: { x: 108, y: 228, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBox0012: { filename: "BlackBox0012", frame: { x: 162, y: 228, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBox0013: { filename: "BlackBox0013", frame: { x: 216, y: 228, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBox0014: { filename: "BlackBox0014", frame: { x: 270, y: 228, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, BlackBoxLeft0000: { filename: "BlackBoxLeft0000", frame: { x: 324, y: 228, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxLeft0001: { filename: "BlackBoxLeft0001", frame: { x: 378, y: 228, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxLeft0002: { filename: "BlackBoxLeft0002", frame: { x: 432, y: 228, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxLeft0003: { filename: "BlackBoxLeft0003", frame: { x: 486, y: 228, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxLeft0004: { filename: "BlackBoxLeft0004", frame: { x: 540, y: 228, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxLeft0005: { filename: "BlackBoxLeft0005", frame: { x: 594, y: 228, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxLeft0006: { filename: "BlackBoxLeft0006", frame: { x: 648, y: 228, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxLeft0007: { filename: "BlackBoxLeft0007", frame: { x: 702, y: 228, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxLeft0008: { filename: "BlackBoxLeft0008", frame: { x: 756, y: 228, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxLeft0009: { filename: "BlackBoxLeft0009", frame: { x: 810, y: 228, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxLeft0010: { filename: "BlackBoxLeft0010", frame: { x: 864, y: 228, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxLeft0011: { filename: "BlackBoxLeft0011", frame: { x: 918, y: 228, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxLeft0012: { filename: "BlackBoxLeft0012", frame: { x: 972, y: 228, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxLeft0013: { filename: "BlackBoxLeft0013", frame: { x: 0, y: 282, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxLeft0014: { filename: "BlackBoxLeft0014", frame: { x: 54, y: 282, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, BlackBoxRight0000: { filename: "BlackBoxRight0000", frame: { x: 108, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, BlackBoxRight0001: { filename: "BlackBoxRight0001", frame: { x: 162, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, BlackBoxRight0002: { filename: "BlackBoxRight0002", frame: { x: 216, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, BlackBoxRight0003: { filename: "BlackBoxRight0003", frame: { x: 270, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, BlackBoxRight0004: { filename: "BlackBoxRight0004", frame: { x: 324, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, BlackBoxRight0005: { filename: "BlackBoxRight0005", frame: { x: 378, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, BlackBoxRight0006: { filename: "BlackBoxRight0006", frame: { x: 432, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, BlackBoxRight0007: { filename: "BlackBoxRight0007", frame: { x: 486, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, BlackBoxRight0008: { filename: "BlackBoxRight0008", frame: { x: 540, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, BlackBoxRight0009: { filename: "BlackBoxRight0009", frame: { x: 594, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, BlackBoxRight0010: { filename: "BlackBoxRight0010", frame: { x: 648, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, BlackBoxRight0011: { filename: "BlackBoxRight0011", frame: { x: 702, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, BlackBoxRight0012: { filename: "BlackBoxRight0012", frame: { x: 756, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, BlackBoxRight0013: { filename: "BlackBoxRight0013", frame: { x: 810, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, BlackBoxRight0014: { filename: "BlackBoxRight0014", frame: { x: 864, y: 282, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, DarkDisk0000: { filename: "DarkDisk0000", frame: { x: 0, y: 329, w: 301, h: 300 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 301, h: 300 }, sourceSize: { w: 301, h: 300 } }, Dust0000: { filename: "Dust0000", frame: { x: 305, y: 329, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0001: { filename: "Dust0001", frame: { x: 422, y: 329, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0002: { filename: "Dust0002", frame: { x: 539, y: 329, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0003: { filename: "Dust0003", frame: { x: 656, y: 329, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0004: { filename: "Dust0004", frame: { x: 773, y: 329, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0005: { filename: "Dust0005", frame: { x: 890, y: 329, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0006: { filename: "Dust0006", frame: { x: 0, y: 633, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0007: { filename: "Dust0007", frame: { x: 117, y: 633, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0008: { filename: "Dust0008", frame: { x: 234, y: 633, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0009: { filename: "Dust0009", frame: { x: 351, y: 633, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0010: { filename: "Dust0010", frame: { x: 468, y: 633, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0011: { filename: "Dust0011", frame: { x: 585, y: 633, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0012: { filename: "Dust0012", frame: { x: 702, y: 633, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0013: { filename: "Dust0013", frame: { x: 819, y: 633, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0014: { filename: "Dust0014", frame: { x: 0, y: 736, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0015: { filename: "Dust0015", frame: { x: 117, y: 736, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0016: { filename: "Dust0016", frame: { x: 234, y: 736, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0017: { filename: "Dust0017", frame: { x: 351, y: 736, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0018: { filename: "Dust0018", frame: { x: 468, y: 736, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0019: { filename: "Dust0019", frame: { x: 585, y: 736, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0020: { filename: "Dust0020", frame: { x: 702, y: 736, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0021: { filename: "Dust0021", frame: { x: 819, y: 736, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0022: { filename: "Dust0022", frame: { x: 0, y: 839, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0023: { filename: "Dust0023", frame: { x: 117, y: 839, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0024: { filename: "Dust0024", frame: { x: 234, y: 839, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0025: { filename: "Dust0025", frame: { x: 351, y: 839, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0026: { filename: "Dust0026", frame: { x: 468, y: 839, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0027: { filename: "Dust0027", frame: { x: 585, y: 839, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0028: { filename: "Dust0028", frame: { x: 702, y: 839, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0029: { filename: "Dust0029", frame: { x: 819, y: 839, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0030: { filename: "Dust0030", frame: { x: 0, y: 942, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0031: { filename: "Dust0031", frame: { x: 117, y: 942, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0032: { filename: "Dust0032", frame: { x: 234, y: 942, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0033: { filename: "Dust0033", frame: { x: 351, y: 942, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0034: { filename: "Dust0034", frame: { x: 468, y: 942, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0035: { filename: "Dust0035", frame: { x: 585, y: 942, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0036: { filename: "Dust0036", frame: { x: 702, y: 942, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0037: { filename: "Dust0037", frame: { x: 819, y: 942, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0038: { filename: "Dust0038", frame: { x: 0, y: 1045, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0039: { filename: "Dust0039", frame: { x: 117, y: 1045, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0040: { filename: "Dust0040", frame: { x: 234, y: 1045, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0041: { filename: "Dust0041", frame: { x: 351, y: 1045, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0042: { filename: "Dust0042", frame: { x: 468, y: 1045, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0043: { filename: "Dust0043", frame: { x: 585, y: 1045, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0044: { filename: "Dust0044", frame: { x: 702, y: 1045, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0045: { filename: "Dust0045", frame: { x: 819, y: 1045, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0046: { filename: "Dust0046", frame: { x: 0, y: 1148, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0047: { filename: "Dust0047", frame: { x: 117, y: 1148, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0048: { filename: "Dust0048", frame: { x: 234, y: 1148, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0049: { filename: "Dust0049", frame: { x: 351, y: 1148, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0050: { filename: "Dust0050", frame: { x: 468, y: 1148, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0051: { filename: "Dust0051", frame: { x: 585, y: 1148, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0052: { filename: "Dust0052", frame: { x: 702, y: 1148, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0053: { filename: "Dust0053", frame: { x: 819, y: 1148, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0054: { filename: "Dust0054", frame: { x: 0, y: 1251, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0055: { filename: "Dust0055", frame: { x: 117, y: 1251, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0056: { filename: "Dust0056", frame: { x: 234, y: 1251, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0057: { filename: "Dust0057", frame: { x: 351, y: 1251, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0058: { filename: "Dust0058", frame: { x: 468, y: 1251, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, Dust0059: { filename: "Dust0059", frame: { x: 585, y: 1251, w: 113, h: 99 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 113, h: 99 }, sourceSize: { w: 113, h: 99 } }, FireBox0000: { filename: "FireBox0000", frame: { x: 702, y: 1251, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBox0001: { filename: "FireBox0001", frame: { x: 756, y: 1251, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBox0002: { filename: "FireBox0002", frame: { x: 810, y: 1251, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBox0003: { filename: "FireBox0003", frame: { x: 864, y: 1251, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBox0004: { filename: "FireBox0004", frame: { x: 918, y: 1251, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBox0005: { filename: "FireBox0005", frame: { x: 972, y: 1251, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBox0006: { filename: "FireBox0006", frame: { x: 0, y: 1354, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBox0007: { filename: "FireBox0007", frame: { x: 54, y: 1354, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBox0008: { filename: "FireBox0008", frame: { x: 108, y: 1354, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBox0009: { filename: "FireBox0009", frame: { x: 162, y: 1354, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBox0010: { filename: "FireBox0010", frame: { x: 216, y: 1354, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBox0011: { filename: "FireBox0011", frame: { x: 270, y: 1354, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBox0012: { filename: "FireBox0012", frame: { x: 324, y: 1354, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBox0013: { filename: "FireBox0013", frame: { x: 378, y: 1354, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBox0014: { filename: "FireBox0014", frame: { x: 432, y: 1354, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, FireBoxLeft0000: { filename: "FireBoxLeft0000", frame: { x: 486, y: 1354, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxLeft0001: { filename: "FireBoxLeft0001", frame: { x: 540, y: 1354, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxLeft0002: { filename: "FireBoxLeft0002", frame: { x: 594, y: 1354, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxLeft0003: { filename: "FireBoxLeft0003", frame: { x: 648, y: 1354, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxLeft0004: { filename: "FireBoxLeft0004", frame: { x: 702, y: 1354, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxLeft0005: { filename: "FireBoxLeft0005", frame: { x: 756, y: 1354, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxLeft0006: { filename: "FireBoxLeft0006", frame: { x: 810, y: 1354, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxLeft0007: { filename: "FireBoxLeft0007", frame: { x: 864, y: 1354, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxLeft0008: { filename: "FireBoxLeft0008", frame: { x: 918, y: 1354, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxLeft0009: { filename: "FireBoxLeft0009", frame: { x: 972, y: 1354, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxLeft0010: { filename: "FireBoxLeft0010", frame: { x: 0, y: 1408, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxLeft0011: { filename: "FireBoxLeft0011", frame: { x: 54, y: 1408, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxLeft0012: { filename: "FireBoxLeft0012", frame: { x: 108, y: 1408, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxLeft0013: { filename: "FireBoxLeft0013", frame: { x: 162, y: 1408, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxLeft0014: { filename: "FireBoxLeft0014", frame: { x: 216, y: 1408, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, FireBoxRight0000: { filename: "FireBoxRight0000", frame: { x: 270, y: 1408, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FireBoxRight0001: { filename: "FireBoxRight0001", frame: { x: 324, y: 1408, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FireBoxRight0002: { filename: "FireBoxRight0002", frame: { x: 378, y: 1408, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FireBoxRight0003: { filename: "FireBoxRight0003", frame: { x: 432, y: 1408, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FireBoxRight0004: { filename: "FireBoxRight0004", frame: { x: 486, y: 1408, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FireBoxRight0005: { filename: "FireBoxRight0005", frame: { x: 540, y: 1408, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FireBoxRight0006: { filename: "FireBoxRight0006", frame: { x: 594, y: 1408, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FireBoxRight0007: { filename: "FireBoxRight0007", frame: { x: 648, y: 1408, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FireBoxRight0008: { filename: "FireBoxRight0008", frame: { x: 702, y: 1408, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FireBoxRight0009: { filename: "FireBoxRight0009", frame: { x: 756, y: 1408, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FireBoxRight0010: { filename: "FireBoxRight0010", frame: { x: 810, y: 1408, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FireBoxRight0011: { filename: "FireBoxRight0011", frame: { x: 864, y: 1408, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FireBoxRight0012: { filename: "FireBoxRight0012", frame: { x: 918, y: 1408, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FireBoxRight0013: { filename: "FireBoxRight0013", frame: { x: 972, y: 1408, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FireBoxRight0014: { filename: "FireBoxRight0014", frame: { x: 0, y: 1456, w: 50, h: 44 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 44 }, sourceSize: { w: 50, h: 44 } }, FreezeEffect0000: { filename: "FreezeEffect0000", frame: { x: 54, y: 1456, w: 98, h: 100 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 98, h: 100 }, sourceSize: { w: 98, h: 100 } }, GreenBox0000: { filename: "GreenBox0000", frame: { x: 156, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBox0001: { filename: "GreenBox0001", frame: { x: 210, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBox0002: { filename: "GreenBox0002", frame: { x: 264, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBox0003: { filename: "GreenBox0003", frame: { x: 318, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBox0004: { filename: "GreenBox0004", frame: { x: 372, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBox0005: { filename: "GreenBox0005", frame: { x: 426, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBox0006: { filename: "GreenBox0006", frame: { x: 480, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBox0007: { filename: "GreenBox0007", frame: { x: 534, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBox0008: { filename: "GreenBox0008", frame: { x: 588, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBox0009: { filename: "GreenBox0009", frame: { x: 642, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBox0010: { filename: "GreenBox0010", frame: { x: 696, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBox0011: { filename: "GreenBox0011", frame: { x: 750, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBox0012: { filename: "GreenBox0012", frame: { x: 804, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBox0013: { filename: "GreenBox0013", frame: { x: 858, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBox0014: { filename: "GreenBox0014", frame: { x: 912, y: 1456, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, GreenBoxLeft0000: { filename: "GreenBoxLeft0000", frame: { x: 966, y: 1456, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxLeft0001: { filename: "GreenBoxLeft0001", frame: { x: 0, y: 1560, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxLeft0002: { filename: "GreenBoxLeft0002", frame: { x: 54, y: 1560, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxLeft0003: { filename: "GreenBoxLeft0003", frame: { x: 108, y: 1560, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxLeft0004: { filename: "GreenBoxLeft0004", frame: { x: 162, y: 1560, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxLeft0005: { filename: "GreenBoxLeft0005", frame: { x: 216, y: 1560, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxLeft0006: { filename: "GreenBoxLeft0006", frame: { x: 270, y: 1560, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxLeft0007: { filename: "GreenBoxLeft0007", frame: { x: 324, y: 1560, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxLeft0008: { filename: "GreenBoxLeft0008", frame: { x: 378, y: 1560, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxLeft0009: { filename: "GreenBoxLeft0009", frame: { x: 432, y: 1560, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxLeft0010: { filename: "GreenBoxLeft0010", frame: { x: 486, y: 1560, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxLeft0011: { filename: "GreenBoxLeft0011", frame: { x: 540, y: 1560, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxLeft0012: { filename: "GreenBoxLeft0012", frame: { x: 594, y: 1560, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxLeft0013: { filename: "GreenBoxLeft0013", frame: { x: 648, y: 1560, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxLeft0014: { filename: "GreenBoxLeft0014", frame: { x: 702, y: 1560, w: 50, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 42 }, sourceSize: { w: 50, h: 42 } }, GreenBoxRight0000: { filename: "GreenBoxRight0000", frame: { x: 756, y: 1560, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, GreenBoxRight0001: { filename: "GreenBoxRight0001", frame: { x: 810, y: 1560, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, GreenBoxRight0002: { filename: "GreenBoxRight0002", frame: { x: 864, y: 1560, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, GreenBoxRight0003: { filename: "GreenBoxRight0003", frame: { x: 918, y: 1560, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, GreenBoxRight0004: { filename: "GreenBoxRight0004", frame: { x: 972, y: 1560, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, GreenBoxRight0005: { filename: "GreenBoxRight0005", frame: { x: 0, y: 1607, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, GreenBoxRight0006: { filename: "GreenBoxRight0006", frame: { x: 54, y: 1607, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, GreenBoxRight0007: { filename: "GreenBoxRight0007", frame: { x: 108, y: 1607, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, GreenBoxRight0008: { filename: "GreenBoxRight0008", frame: { x: 162, y: 1607, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, GreenBoxRight0009: { filename: "GreenBoxRight0009", frame: { x: 216, y: 1607, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, GreenBoxRight0010: { filename: "GreenBoxRight0010", frame: { x: 270, y: 1607, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, GreenBoxRight0011: { filename: "GreenBoxRight0011", frame: { x: 324, y: 1607, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, GreenBoxRight0012: { filename: "GreenBoxRight0012", frame: { x: 378, y: 1607, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, GreenBoxRight0013: { filename: "GreenBoxRight0013", frame: { x: 432, y: 1607, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, GreenBoxRight0014: { filename: "GreenBoxRight0014", frame: { x: 486, y: 1607, w: 50, h: 43 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 43 }, sourceSize: { w: 50, h: 43 } }, IceBox0000: { filename: "IceBox0000", frame: { x: 540, y: 1607, w: 46, h: 46 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 46 }, sourceSize: { w: 46, h: 46 } }, IceBoxLeft0000: { filename: "IceBoxLeft0000", frame: { x: 590, y: 1607, w: 46, h: 46 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 46 }, sourceSize: { w: 46, h: 46 } }, IceBoxRight0000: { filename: "IceBoxRight0000", frame: { x: 640, y: 1607, w: 46, h: 46 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 46 }, sourceSize: { w: 46, h: 46 } }, MaskBox00000: { filename: "MaskBox00000", frame: { x: 690, y: 1607, w: 34, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 34, h: 34 }, sourceSize: { w: 34, h: 34 } }, MaskBox00001: { filename: "MaskBox00001", frame: { x: 728, y: 1607, w: 34, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 34, h: 34 }, sourceSize: { w: 34, h: 34 } }, MaskBox00002: { filename: "MaskBox00002", frame: { x: 766, y: 1607, w: 34, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 34, h: 34 }, sourceSize: { w: 34, h: 34 } }, MaskBox00003: { filename: "MaskBox00003", frame: { x: 804, y: 1607, w: 34, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 34, h: 34 }, sourceSize: { w: 34, h: 34 } }, MaskBox10000: { filename: "MaskBox10000", frame: { x: 842, y: 1607, w: 34, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 34, h: 34 }, sourceSize: { w: 34, h: 34 } }, MaskBox20000: { filename: "MaskBox20000", frame: { x: 880, y: 1607, w: 34, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 34, h: 34 }, sourceSize: { w: 34, h: 34 } }, MaskBox30000: { filename: "MaskBox30000", frame: { x: 918, y: 1607, w: 34, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 34, h: 34 }, sourceSize: { w: 34, h: 34 } }, MaskBox40000: { filename: "MaskBox40000", frame: { x: 956, y: 1607, w: 34, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 34, h: 34 }, sourceSize: { w: 34, h: 34 } }, MaskBox50000: { filename: "MaskBox50000", frame: { x: 0, y: 1657, w: 35, h: 35 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 35, h: 35 }, sourceSize: { w: 35, h: 35 } }, MaskBox60000: { filename: "MaskBox60000", frame: { x: 39, y: 1657, w: 35, h: 35 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 35, h: 35 }, sourceSize: { w: 35, h: 35 } }, MaskBox70000: { filename: "MaskBox70000", frame: { x: 78, y: 1657, w: 35, h: 35 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 35, h: 35 }, sourceSize: { w: 35, h: 35 } }, MaskBox80000: { filename: "MaskBox80000", frame: { x: 117, y: 1657, w: 36, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 36, h: 34 }, sourceSize: { w: 36, h: 34 } }, MaskBox90000: { filename: "MaskBox90000", frame: { x: 157, y: 1657, w: 35, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 35, h: 34 }, sourceSize: { w: 35, h: 34 } }, SnowFlat0000: { filename: "SnowFlat0000", frame: { x: 196, y: 1657, w: 60, h: 60 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 60, h: 60 }, sourceSize: { w: 60, h: 60 } }, SnowSlope0000: { filename: "SnowSlope0000", frame: { x: 260, y: 1657, w: 50, h: 51 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 51 }, sourceSize: { w: 50, h: 51 } }, SnowSlope0001: { filename: "SnowSlope0001", frame: { x: 314, y: 1657, w: 50, h: 51 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 51 }, sourceSize: { w: 50, h: 51 } }, WaterBox0000: { filename: "WaterBox0000", frame: { x: 368, y: 1657, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBox0001: { filename: "WaterBox0001", frame: { x: 418, y: 1657, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBox0002: { filename: "WaterBox0002", frame: { x: 468, y: 1657, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBox0003: { filename: "WaterBox0003", frame: { x: 518, y: 1657, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBox0004: { filename: "WaterBox0004", frame: { x: 568, y: 1657, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBox0005: { filename: "WaterBox0005", frame: { x: 618, y: 1657, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBox0006: { filename: "WaterBox0006", frame: { x: 668, y: 1657, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBox0007: { filename: "WaterBox0007", frame: { x: 718, y: 1657, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBox0008: { filename: "WaterBox0008", frame: { x: 768, y: 1657, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBox0009: { filename: "WaterBox0009", frame: { x: 818, y: 1657, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBox0010: { filename: "WaterBox0010", frame: { x: 868, y: 1657, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBox0011: { filename: "WaterBox0011", frame: { x: 918, y: 1657, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBox0012: { filename: "WaterBox0012", frame: { x: 968, y: 1657, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBox0013: { filename: "WaterBox0013", frame: { x: 0, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBox0014: { filename: "WaterBox0014", frame: { x: 50, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0000: { filename: "WaterBoxLeft0000", frame: { x: 100, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0001: { filename: "WaterBoxLeft0001", frame: { x: 150, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0002: { filename: "WaterBoxLeft0002", frame: { x: 200, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0003: { filename: "WaterBoxLeft0003", frame: { x: 250, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0004: { filename: "WaterBoxLeft0004", frame: { x: 300, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0005: { filename: "WaterBoxLeft0005", frame: { x: 350, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0006: { filename: "WaterBoxLeft0006", frame: { x: 400, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0007: { filename: "WaterBoxLeft0007", frame: { x: 450, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0008: { filename: "WaterBoxLeft0008", frame: { x: 500, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0009: { filename: "WaterBoxLeft0009", frame: { x: 550, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0010: { filename: "WaterBoxLeft0010", frame: { x: 600, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0011: { filename: "WaterBoxLeft0011", frame: { x: 650, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0012: { filename: "WaterBoxLeft0012", frame: { x: 700, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0013: { filename: "WaterBoxLeft0013", frame: { x: 750, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxLeft0014: { filename: "WaterBoxLeft0014", frame: { x: 800, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0000: { filename: "WaterBoxRight0000", frame: { x: 850, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0001: { filename: "WaterBoxRight0001", frame: { x: 900, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0002: { filename: "WaterBoxRight0002", frame: { x: 950, y: 1721, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0003: { filename: "WaterBoxRight0003", frame: { x: 0, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0004: { filename: "WaterBoxRight0004", frame: { x: 50, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0005: { filename: "WaterBoxRight0005", frame: { x: 100, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0006: { filename: "WaterBoxRight0006", frame: { x: 150, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0007: { filename: "WaterBoxRight0007", frame: { x: 200, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0008: { filename: "WaterBoxRight0008", frame: { x: 250, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0009: { filename: "WaterBoxRight0009", frame: { x: 300, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0010: { filename: "WaterBoxRight0010", frame: { x: 350, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0011: { filename: "WaterBoxRight0011", frame: { x: 400, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0012: { filename: "WaterBoxRight0012", frame: { x: 450, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0013: { filename: "WaterBoxRight0013", frame: { x: 500, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, WaterBoxRight0014: { filename: "WaterBoxRight0014", frame: { x: 550, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, _default0000: { filename: "_default0000", frame: { x: 600, y: 1772, w: 34, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 34, h: 34 }, sourceSize: { w: 34, h: 34 } }, frost0000: { filename: "frost0000", frame: { x: 638, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, frost0001: { filename: "frost0001", frame: { x: 688, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, frost0002: { filename: "frost0002", frame: { x: 738, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, frost0003: { filename: "frost0003", frame: { x: 788, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, frost0004: { filename: "frost0004", frame: { x: 838, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, frost0005: { filename: "frost0005", frame: { x: 888, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, frost0006: { filename: "frost0006", frame: { x: 938, y: 1772, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, frost0007: { filename: "frost0007", frame: { x: 0, y: 1823, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, frost0008: { filename: "frost0008", frame: { x: 50, y: 1823, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, frost0009: { filename: "frost0009", frame: { x: 100, y: 1823, w: 46, h: 47 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 47 }, sourceSize: { w: 46, h: 47 } }, vapor0000: { filename: "vapor0000", frame: { x: 150, y: 1823, w: 81, h: 86 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 81, h: 86 }, sourceSize: { w: 81, h: 86 } }, vapor0001: { filename: "vapor0001", frame: { x: 235, y: 1823, w: 81, h: 86 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 81, h: 86 }, sourceSize: { w: 81, h: 86 } }, vapor0002: { filename: "vapor0002", frame: { x: 320, y: 1823, w: 81, h: 86 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 81, h: 86 }, sourceSize: { w: 81, h: 86 } }, vapor0003: { filename: "vapor0003", frame: { x: 405, y: 1823, w: 81, h: 86 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 81, h: 86 }, sourceSize: { w: 81, h: 86 } }, vapor0004: { filename: "vapor0004", frame: { x: 490, y: 1823, w: 81, h: 86 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 81, h: 86 }, sourceSize: { w: 81, h: 86 } }, vapor0005: { filename: "vapor0005", frame: { x: 575, y: 1823, w: 81, h: 86 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 81, h: 86 }, sourceSize: { w: 81, h: 86 } }, vapor0006: { filename: "vapor0006", frame: { x: 660, y: 1823, w: 81, h: 86 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 81, h: 86 }, sourceSize: { w: 81, h: 86 } }, vapor0007: { filename: "vapor0007", frame: { x: 745, y: 1823, w: 81, h: 86 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 81, h: 86 }, sourceSize: { w: 81, h: 86 } }, vapor0008: { filename: "vapor0008", frame: { x: 830, y: 1823, w: 81, h: 86 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 81, h: 86 }, sourceSize: { w: 81, h: 86 } }, vapor0009: { filename: "vapor0009", frame: { x: 915, y: 1823, w: 81, h: 86 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 81, h: 86 }, sourceSize: { w: 81, h: 86 } } }, MechAssets: { BackgroundCover0000: { filename: "BackgroundCover0000", frame: { x: 0, y: 0, w: 32, h: 32 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 } }, BarCapLeft0000: { filename: "BarCapLeft0000", frame: { x: 1696, y: 0, w: 46, h: 48 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 48 }, sourceSize: { w: 46, h: 48 } }, BarCapRight0000: { filename: "BarCapRight0000", frame: { x: 1746, y: 0, w: 48, h: 46 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 48, h: 46 }, sourceSize: { w: 48, h: 46 } }, BarCenter0000: { filename: "BarCenter0000", frame: { x: 1798, y: 0, w: 108, h: 48 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 108, h: 48 }, sourceSize: { w: 108, h: 48 } }, BoxMirror0000: { filename: "BoxMirror0000", frame: { x: 764, y: 0, w: 68, h: 69 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 68, h: 69 }, sourceSize: { w: 68, h: 69 } }, SliderDot0000: { filename: "SliderDot0000", frame: { x: 1433, y: 1058, w: 33, h: 33 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 33, h: 33 }, sourceSize: { w: 33, h: 33 } }, SliderTrack0000: { filename: "SliderTrack0000", frame: { x: 1470, y: 1058, w: 218, h: 19 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 218, h: 19 }, sourceSize: { w: 218, h: 19 } }, WindowCenter0000: { filename: "WindowCenter0000", frame: { x: 264, y: 1802, w: 108, h: 46 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 108, h: 46 }, sourceSize: { w: 108, h: 46 } }, WindowLeft0000: { filename: "WindowLeft0000", frame: { x: 376, y: 1802, w: 46, h: 48 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 48 }, sourceSize: { w: 46, h: 48 } }, WindowRight0000: { filename: "WindowRight0000", frame: { x: 426, y: 1802, w: 46, h: 46 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 46 }, sourceSize: { w: 46, h: 46 } }, _default0000: { filename: "_default0000", frame: { x: 836, y: 0, w: 34, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 34, h: 34 }, sourceSize: { w: 34, h: 34 } }, ball0000: { filename: "ball0000", frame: { x: 36, y: 0, w: 40, h: 40 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 40, h: 40 }, sourceSize: { w: 40, h: 40 } }, beamer0000: { filename: "beamer0000", frame: { x: 422, y: 0, w: 110, h: 110 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 110, h: 110 }, sourceSize: { w: 110, h: 110 } }, beamer_light_off0000: { filename: "beamer_light_off0000", frame: { x: 536, y: 0, w: 110, h: 110 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 110, h: 110 }, sourceSize: { w: 110, h: 110 } }, beamer_light_on0000: { filename: "beamer_light_on0000", frame: { x: 650, y: 0, w: 110, h: 110 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 110, h: 110 }, sourceSize: { w: 110, h: 110 } }, hanging_anchor0000: { filename: "hanging_anchor0000", frame: { x: 389, y: 860, w: 38, h: 35 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 38, h: 35 }, sourceSize: { w: 38, h: 35 } }, hanging_base0000: { filename: "hanging_base0000", frame: { x: 431, y: 860, w: 32, h: 28 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 32, h: 28 }, sourceSize: { w: 32, h: 28 } }, hanging_platform0000: { filename: "hanging_platform0000", frame: { x: 467, y: 860, w: 142, h: 22 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 142, h: 22 }, sourceSize: { w: 142, h: 22 } }, infinitemirror0000: { filename: "infinitemirror0000", frame: { x: 125, y: 1058, w: 130, h: 130 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 130, h: 130 }, sourceSize: { w: 130, h: 130 } }, infinitemirror_light_off0000: { filename: "infinitemirror_light_off0000", frame: { x: 259, y: 1058, w: 250, h: 250 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 250, h: 250 }, sourceSize: { w: 250, h: 250 } }, lever_base0000: { filename: "lever_base0000", frame: { x: 874, y: 0, w: 110, h: 110 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 110, h: 110 }, sourceSize: { w: 110, h: 110 } }, lever_base_light_off0000: { filename: "lever_base_light_off0000", frame: { x: 988, y: 0, w: 108, h: 108 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 108, h: 108 }, sourceSize: { w: 108, h: 108 } }, lever_base_light_on0000: { filename: "lever_base_light_on0000", frame: { x: 1100, y: 0, w: 108, h: 108 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 108, h: 108 }, sourceSize: { w: 108, h: 108 } }, lever_stick0000: { filename: "lever_stick0000", frame: { x: 1212, y: 0, w: 108, h: 108 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 108, h: 108 }, sourceSize: { w: 108, h: 108 } }, lever_stick_light_off0000: { filename: "lever_stick_light_off0000", frame: { x: 1324, y: 0, w: 108, h: 108 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 108, h: 108 }, sourceSize: { w: 108, h: 108 } }, lever_stick_light_on0000: { filename: "lever_stick_light_on0000", frame: { x: 1436, y: 0, w: 106, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 106, h: 164 }, sourceSize: { w: 106, h: 164 } }, lightpusher_base0000: { filename: "lightpusher_base0000", frame: { x: 80, y: 0, w: 110, h: 110 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 110, h: 110 }, sourceSize: { w: 110, h: 110 } }, lightpusher_light_off0000: { filename: "lightpusher_light_off0000", frame: { x: 194, y: 0, w: 110, h: 110 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 110, h: 110 }, sourceSize: { w: 110, h: 110 } }, lightpusher_light_on0000: { filename: "lightpusher_light_on0000", frame: { x: 308, y: 0, w: 110, h: 110 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 110, h: 110 }, sourceSize: { w: 110, h: 110 } }, moving_platform_light_off0000: { filename: "moving_platform_light_off0000", frame: { x: 1910, y: 0, w: 138, h: 26 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 138, h: 26 }, sourceSize: { w: 138, h: 26 } }, moving_platform_light_on0000: { filename: "moving_platform_light_on0000", frame: { x: 0, y: 168, w: 142, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 142, h: 34 }, sourceSize: { w: 142, h: 34 } }, movingbox0000: { filename: "movingbox0000", frame: { x: 1546, y: 0, w: 74, h: 76 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 74, h: 76 }, sourceSize: { w: 74, h: 76 } }, movingbox20000: { filename: "movingbox20000", frame: { x: 1624, y: 0, w: 68, h: 69 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 68, h: 69 }, sourceSize: { w: 68, h: 69 } }, portal0000: { filename: "portal0000", frame: { x: 146, y: 168, w: 82, h: 166 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 166 }, sourceSize: { w: 82, h: 166 } }, portal_center0000: { filename: "portal_center0000", frame: { x: 232, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0001: { filename: "portal_center0001", frame: { x: 318, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0002: { filename: "portal_center0002", frame: { x: 404, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0003: { filename: "portal_center0003", frame: { x: 490, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0004: { filename: "portal_center0004", frame: { x: 576, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0005: { filename: "portal_center0005", frame: { x: 662, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0006: { filename: "portal_center0006", frame: { x: 748, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0007: { filename: "portal_center0007", frame: { x: 834, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0008: { filename: "portal_center0008", frame: { x: 920, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0009: { filename: "portal_center0009", frame: { x: 1006, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0010: { filename: "portal_center0010", frame: { x: 1092, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0011: { filename: "portal_center0011", frame: { x: 1178, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0012: { filename: "portal_center0012", frame: { x: 1264, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0013: { filename: "portal_center0013", frame: { x: 1350, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0014: { filename: "portal_center0014", frame: { x: 1436, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0015: { filename: "portal_center0015", frame: { x: 1522, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0016: { filename: "portal_center0016", frame: { x: 1608, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0017: { filename: "portal_center0017", frame: { x: 1694, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0018: { filename: "portal_center0018", frame: { x: 1780, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0019: { filename: "portal_center0019", frame: { x: 1866, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0020: { filename: "portal_center0020", frame: { x: 1952, y: 168, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0021: { filename: "portal_center0021", frame: { x: 0, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0022: { filename: "portal_center0022", frame: { x: 86, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0023: { filename: "portal_center0023", frame: { x: 172, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0024: { filename: "portal_center0024", frame: { x: 258, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0025: { filename: "portal_center0025", frame: { x: 344, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0026: { filename: "portal_center0026", frame: { x: 430, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0027: { filename: "portal_center0027", frame: { x: 516, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0028: { filename: "portal_center0028", frame: { x: 602, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0029: { filename: "portal_center0029", frame: { x: 688, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0030: { filename: "portal_center0030", frame: { x: 774, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0031: { filename: "portal_center0031", frame: { x: 860, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0032: { filename: "portal_center0032", frame: { x: 946, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0033: { filename: "portal_center0033", frame: { x: 1032, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0034: { filename: "portal_center0034", frame: { x: 1118, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0035: { filename: "portal_center0035", frame: { x: 1204, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0036: { filename: "portal_center0036", frame: { x: 1290, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0037: { filename: "portal_center0037", frame: { x: 1376, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0038: { filename: "portal_center0038", frame: { x: 1462, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_center0039: { filename: "portal_center0039", frame: { x: 1548, y: 338, w: 82, h: 164 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 164 }, sourceSize: { w: 82, h: 164 } }, portal_glow0000: { filename: "portal_glow0000", frame: { x: 1634, y: 338, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0001: { filename: "portal_glow0001", frame: { x: 1790, y: 338, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0002: { filename: "portal_glow0002", frame: { x: 0, y: 512, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0003: { filename: "portal_glow0003", frame: { x: 156, y: 512, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0004: { filename: "portal_glow0004", frame: { x: 312, y: 512, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0005: { filename: "portal_glow0005", frame: { x: 468, y: 512, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0006: { filename: "portal_glow0006", frame: { x: 624, y: 512, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0007: { filename: "portal_glow0007", frame: { x: 780, y: 512, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0008: { filename: "portal_glow0008", frame: { x: 936, y: 512, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0009: { filename: "portal_glow0009", frame: { x: 1092, y: 512, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0010: { filename: "portal_glow0010", frame: { x: 1248, y: 512, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0011: { filename: "portal_glow0011", frame: { x: 1404, y: 512, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0012: { filename: "portal_glow0012", frame: { x: 1560, y: 512, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0013: { filename: "portal_glow0013", frame: { x: 1716, y: 512, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0014: { filename: "portal_glow0014", frame: { x: 1872, y: 512, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0015: { filename: "portal_glow0015", frame: { x: 0, y: 686, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0016: { filename: "portal_glow0016", frame: { x: 156, y: 686, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0017: { filename: "portal_glow0017", frame: { x: 312, y: 686, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0018: { filename: "portal_glow0018", frame: { x: 468, y: 686, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0019: { filename: "portal_glow0019", frame: { x: 624, y: 686, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0020: { filename: "portal_glow0020", frame: { x: 780, y: 686, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0021: { filename: "portal_glow0021", frame: { x: 936, y: 686, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0022: { filename: "portal_glow0022", frame: { x: 1092, y: 686, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0023: { filename: "portal_glow0023", frame: { x: 1248, y: 686, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0024: { filename: "portal_glow0024", frame: { x: 1404, y: 686, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0025: { filename: "portal_glow0025", frame: { x: 1560, y: 686, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0026: { filename: "portal_glow0026", frame: { x: 1716, y: 686, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0027: { filename: "portal_glow0027", frame: { x: 1872, y: 686, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0028: { filename: "portal_glow0028", frame: { x: 0, y: 860, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_glow0029: { filename: "portal_glow0029", frame: { x: 156, y: 860, w: 152, h: 170 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 152, h: 170 }, sourceSize: { w: 152, h: 170 } }, portal_light_off0000: { filename: "portal_light_off0000", frame: { x: 312, y: 860, w: 29, h: 187 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 29, h: 187 }, sourceSize: { w: 29, h: 187 } }, portal_light_on0000: { filename: "portal_light_on0000", frame: { x: 345, y: 860, w: 40, h: 194 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 40, h: 194 }, sourceSize: { w: 40, h: 194 } }, pulley_anchor0000: { filename: "pulley_anchor0000", frame: { x: 613, y: 860, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, pulley_base0000: { filename: "pulley_base0000", frame: { x: 667, y: 860, w: 104, h: 158 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 104, h: 158 }, sourceSize: { w: 104, h: 158 } }, pulley_platform0000: { filename: "pulley_platform0000", frame: { x: 775, y: 860, w: 102, h: 22 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 102, h: 22 }, sourceSize: { w: 102, h: 22 } }, pulley_rope0000: { filename: "pulley_rope0000", frame: { x: 881, y: 860, w: 82, h: 19 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 82, h: 19 }, sourceSize: { w: 82, h: 19 } }, pusher_block0000: { filename: "pusher_block0000", frame: { x: 967, y: 860, w: 110, h: 86 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 110, h: 86 }, sourceSize: { w: 110, h: 86 } }, pusher_block_light0000: { filename: "pusher_block_light0000", frame: { x: 1081, y: 860, w: 64, h: 62 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 64, h: 62 }, sourceSize: { w: 64, h: 62 } }, pusher_block_silver0000: { filename: "pusher_block_silver0000", frame: { x: 1149, y: 860, w: 110, h: 87 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 110, h: 87 }, sourceSize: { w: 110, h: 87 } }, roman_bar0000: { filename: "roman_bar0000", frame: { x: 1753, y: 860, w: 116, h: 30 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 116, h: 30 }, sourceSize: { w: 116, h: 30 } }, roman_base0000: { filename: "roman_base0000", frame: { x: 1873, y: 860, w: 138, h: 194 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 138, h: 194 }, sourceSize: { w: 138, h: 194 } }, roman_center0000: { filename: "roman_center0000", frame: { x: 0, y: 1058, w: 44, h: 42 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 44, h: 42 }, sourceSize: { w: 44, h: 42 } }, roman_end0000: { filename: "roman_end0000", frame: { x: 48, y: 1058, w: 73, h: 30 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 73, h: 30 }, sourceSize: { w: 73, h: 30 } }, rotmirror0000: { filename: "rotmirror0000", frame: { x: 513, y: 1058, w: 250, h: 250 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 250, h: 250 }, sourceSize: { w: 250, h: 250 } }, rotmirror_circle0000: { filename: "rotmirror_circle0000", frame: { x: 767, y: 1058, w: 154, h: 154 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 154, h: 154 }, sourceSize: { w: 154, h: 154 } }, rotmirror_light_off0000: { filename: "rotmirror_light_off0000", frame: { x: 925, y: 1058, w: 250, h: 250 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 250, h: 250 }, sourceSize: { w: 250, h: 250 } }, rotmirror_light_on0000: { filename: "rotmirror_light_on0000", frame: { x: 1179, y: 1058, w: 250, h: 250 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 250, h: 250 }, sourceSize: { w: 250, h: 250 } }, slider_light_off0000: { filename: "slider_light_off0000", frame: { x: 1692, y: 1058, w: 20, h: 20 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 20, h: 20 }, sourceSize: { w: 20, h: 20 } }, slider_light_on0000: { filename: "slider_light_on0000", frame: { x: 1716, y: 1058, w: 55, h: 57 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 55, h: 57 }, sourceSize: { w: 55, h: 57 } }, timed_pusher_base0000: { filename: "timed_pusher_base0000", frame: { x: 1263, y: 860, w: 124, h: 152 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 124, h: 152 }, sourceSize: { w: 124, h: 152 } }, timed_pusher_base_old0000: { filename: "timed_pusher_base_old0000", frame: { x: 1391, y: 860, w: 124, h: 124 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 124, h: 124 }, sourceSize: { w: 124, h: 124 } }, timed_pusher_light_off0000: { filename: "timed_pusher_light_off0000", frame: { x: 1519, y: 860, w: 108, h: 108 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 108, h: 108 }, sourceSize: { w: 108, h: 108 } }, timed_pusher_light_on0000: { filename: "timed_pusher_light_on0000", frame: { x: 1631, y: 860, w: 118, h: 148 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 118, h: 148 }, sourceSize: { w: 118, h: 148 } }, wind_base0000: { filename: "wind_base0000", frame: { x: 1775, y: 1058, w: 118, h: 80 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 118, h: 80 }, sourceSize: { w: 118, h: 80 } }, wind_base0001: { filename: "wind_base0001", frame: { x: 1897, y: 1058, w: 118, h: 80 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 118, h: 80 }, sourceSize: { w: 118, h: 80 } }, wind_base0002: { filename: "wind_base0002", frame: { x: 0, y: 1312, w: 118, h: 80 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 118, h: 80 }, sourceSize: { w: 118, h: 80 } }, wind_base0003: { filename: "wind_base0003", frame: { x: 122, y: 1312, w: 118, h: 80 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 118, h: 80 }, sourceSize: { w: 118, h: 80 } }, wind_base_light_off0000: { filename: "wind_base_light_off0000", frame: { x: 244, y: 1312, w: 32, h: 34 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 32, h: 34 }, sourceSize: { w: 32, h: 34 } }, wind_base_light_on0000: { filename: "wind_base_light_on0000", frame: { x: 280, y: 1312, w: 46, h: 48 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 46, h: 48 }, sourceSize: { w: 46, h: 48 } }, wind_effect0000: { filename: "wind_effect0000", frame: { x: 330, y: 1312, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0001: { filename: "wind_effect0001", frame: { x: 462, y: 1312, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0002: { filename: "wind_effect0002", frame: { x: 594, y: 1312, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0003: { filename: "wind_effect0003", frame: { x: 726, y: 1312, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0004: { filename: "wind_effect0004", frame: { x: 858, y: 1312, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0005: { filename: "wind_effect0005", frame: { x: 990, y: 1312, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0006: { filename: "wind_effect0006", frame: { x: 1122, y: 1312, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0007: { filename: "wind_effect0007", frame: { x: 1254, y: 1312, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0008: { filename: "wind_effect0008", frame: { x: 1386, y: 1312, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0009: { filename: "wind_effect0009", frame: { x: 1518, y: 1312, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0010: { filename: "wind_effect0010", frame: { x: 1650, y: 1312, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0011: { filename: "wind_effect0011", frame: { x: 1782, y: 1312, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0012: { filename: "wind_effect0012", frame: { x: 1914, y: 1312, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0013: { filename: "wind_effect0013", frame: { x: 0, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0014: { filename: "wind_effect0014", frame: { x: 132, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0015: { filename: "wind_effect0015", frame: { x: 264, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0016: { filename: "wind_effect0016", frame: { x: 396, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0017: { filename: "wind_effect0017", frame: { x: 528, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0018: { filename: "wind_effect0018", frame: { x: 660, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0019: { filename: "wind_effect0019", frame: { x: 792, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0020: { filename: "wind_effect0020", frame: { x: 924, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0021: { filename: "wind_effect0021", frame: { x: 1056, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0022: { filename: "wind_effect0022", frame: { x: 1188, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0023: { filename: "wind_effect0023", frame: { x: 1320, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0024: { filename: "wind_effect0024", frame: { x: 1452, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0025: { filename: "wind_effect0025", frame: { x: 1584, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0026: { filename: "wind_effect0026", frame: { x: 1716, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0027: { filename: "wind_effect0027", frame: { x: 1848, y: 1557, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0028: { filename: "wind_effect0028", frame: { x: 0, y: 1802, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } }, wind_effect0029: { filename: "wind_effect0029", frame: { x: 132, y: 1802, w: 128, h: 241 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 128, h: 241 }, sourceSize: { w: 128, h: 241 } } }, TempleAssets: { BackGround0000: { filename: "BackGround0000", frame: { x: 260, y: 520, w: 256, h: 256 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 256, h: 256 }, sourceSize: { w: 256, h: 256 } }, Clock0000: { filename: "Clock0000", frame: { x: 0, y: 780, w: 268, h: 100 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 268, h: 100 }, sourceSize: { w: 268, h: 100 } }, Diamond1_Bkg_Empty0000: { filename: "Diamond1_Bkg_Empty0000", frame: { x: 814, y: 1704, w: 108, h: 111 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 108, h: 111 }, sourceSize: { w: 108, h: 111 } }, FinishBoy0000: { filename: "FinishBoy0000", frame: { x: 776, y: 0, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0001: { filename: "FinishBoy0001", frame: { x: 776, y: 142, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0002: { filename: "FinishBoy0002", frame: { x: 776, y: 284, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0003: { filename: "FinishBoy0003", frame: { x: 780, y: 426, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0004: { filename: "FinishBoy0004", frame: { x: 780, y: 568, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0005: { filename: "FinishBoy0005", frame: { x: 780, y: 710, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0006: { filename: "FinishBoy0006", frame: { x: 272, y: 780, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0007: { filename: "FinishBoy0007", frame: { x: 439, y: 780, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0008: { filename: "FinishBoy0008", frame: { x: 606, y: 780, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0009: { filename: "FinishBoy0009", frame: { x: 773, y: 852, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0010: { filename: "FinishBoy0010", frame: { x: 0, y: 884, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0011: { filename: "FinishBoy0011", frame: { x: 167, y: 922, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0012: { filename: "FinishBoy0012", frame: { x: 334, y: 922, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0013: { filename: "FinishBoy0013", frame: { x: 501, y: 922, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0014: { filename: "FinishBoy0014", frame: { x: 668, y: 994, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0015: { filename: "FinishBoy0015", frame: { x: 835, y: 994, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0016: { filename: "FinishBoy0016", frame: { x: 0, y: 1026, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0017: { filename: "FinishBoy0017", frame: { x: 167, y: 1064, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0018: { filename: "FinishBoy0018", frame: { x: 334, y: 1064, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0019: { filename: "FinishBoy0019", frame: { x: 501, y: 1064, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0020: { filename: "FinishBoy0020", frame: { x: 668, y: 1136, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishBoy0021: { filename: "FinishBoy0021", frame: { x: 835, y: 1136, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0000: { filename: "FinishGirl0000", frame: { x: 0, y: 1168, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0001: { filename: "FinishGirl0001", frame: { x: 167, y: 1206, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0002: { filename: "FinishGirl0002", frame: { x: 334, y: 1206, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0003: { filename: "FinishGirl0003", frame: { x: 501, y: 1206, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0004: { filename: "FinishGirl0004", frame: { x: 668, y: 1278, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0005: { filename: "FinishGirl0005", frame: { x: 835, y: 1278, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0006: { filename: "FinishGirl0006", frame: { x: 0, y: 1310, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0007: { filename: "FinishGirl0007", frame: { x: 167, y: 1348, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0008: { filename: "FinishGirl0008", frame: { x: 334, y: 1348, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0009: { filename: "FinishGirl0009", frame: { x: 501, y: 1348, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0010: { filename: "FinishGirl0010", frame: { x: 668, y: 1420, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0011: { filename: "FinishGirl0011", frame: { x: 835, y: 1420, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0012: { filename: "FinishGirl0012", frame: { x: 0, y: 1452, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0013: { filename: "FinishGirl0013", frame: { x: 167, y: 1490, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0014: { filename: "FinishGirl0014", frame: { x: 334, y: 1490, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0015: { filename: "FinishGirl0015", frame: { x: 501, y: 1490, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0016: { filename: "FinishGirl0016", frame: { x: 668, y: 1562, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0017: { filename: "FinishGirl0017", frame: { x: 835, y: 1562, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0018: { filename: "FinishGirl0018", frame: { x: 0, y: 1594, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0019: { filename: "FinishGirl0019", frame: { x: 167, y: 1632, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0020: { filename: "FinishGirl0020", frame: { x: 334, y: 1632, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, FinishGirl0021: { filename: "FinishGirl0021", frame: { x: 501, y: 1632, w: 163, h: 138 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 163, h: 138 }, sourceSize: { w: 163, h: 138 } }, ForeGround0000: { filename: "ForeGround0000", frame: { x: 520, y: 520, w: 256, h: 256 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 256, h: 256 }, sourceSize: { w: 256, h: 256 } }, Icon0000: { filename: "Icon0000", frame: { x: 516, y: 0, w: 256, h: 256 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 256, h: 256 }, sourceSize: { w: 256, h: 256 } }, Icon0001: { filename: "Icon0001", frame: { x: 516, y: 260, w: 256, h: 256 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 256, h: 256 }, sourceSize: { w: 256, h: 256 } }, Icon0002: { filename: "Icon0002", frame: { x: 0, y: 516, w: 256, h: 256 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 256, h: 256 }, sourceSize: { w: 256, h: 256 } }, MenuBackground0000: { filename: "MenuBackground0000", frame: { x: 0, y: 0, w: 512, h: 512 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 512, h: 512 }, sourceSize: { w: 512, h: 512 } }, decor_A0000: { filename: "decor_A0000", frame: { x: 947, y: 421, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, decor_O_10000: { filename: "decor_O_10000", frame: { x: 943, y: 305, w: 58, h: 58 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 58, h: 58 }, sourceSize: { w: 58, h: 58 } }, decor_O_20000: { filename: "decor_O_20000", frame: { x: 943, y: 367, w: 50, h: 50 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 50 }, sourceSize: { w: 50, h: 50 } }, decor_T_10000: { filename: "decor_T_10000", frame: { x: 943, y: 0, w: 50, h: 106 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 50, h: 106 }, sourceSize: { w: 50, h: 106 } }, decor_T_20000: { filename: "decor_T_20000", frame: { x: 943, y: 110, w: 62, h: 63 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 62, h: 63 }, sourceSize: { w: 62, h: 63 } }, decor_T_30000: { filename: "decor_T_30000", frame: { x: 943, y: 177, w: 60, h: 60 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 60, h: 60 }, sourceSize: { w: 60, h: 60 } }, decor_V0000: { filename: "decor_V0000", frame: { x: 668, y: 1704, w: 142, h: 142 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 142, h: 142 }, sourceSize: { w: 142, h: 142 } }, decor_X0000: { filename: "decor_X0000", frame: { x: 943, y: 241, w: 60, h: 60 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 60, h: 60 }, sourceSize: { w: 60, h: 60 } } } } };

  // src/expanded/forest.ts
  var levels = forest_data_default.levels;
  var T = 32;
  var HZ6 = 60;
  var clamp3 = (n, a, b) => Math.max(a, Math.min(b, n));
  function overlap(a, b) {
    const r = b.rotation || 0;
    if (!r) return a.x - a.w / 2 < b.x + b.w / 2 && a.x + a.w / 2 > b.x - b.w / 2 && a.y - a.h < b.y && a.y > b.y - b.h;
    const ax = a.x, ay = a.y - a.h / 2, bx = b.x, by = b.y - b.h / 2, c = Math.cos(r), n = Math.sin(r), dx = ax - bx, dy = ay - by;
    return Math.abs(dx) < a.w / 2 + Math.abs(c) * b.w / 2 + Math.abs(n) * b.h / 2 && Math.abs(dy) < a.h / 2 + Math.abs(n) * b.w / 2 + Math.abs(c) * b.h / 2 && Math.abs(dx * c + dy * n) < b.w / 2 + Math.abs(c) * a.w / 2 + Math.abs(n) * a.h / 2 && Math.abs(-dx * n + dy * c) < b.h / 2 + Math.abs(n) * a.w / 2 + Math.abs(c) * a.h / 2;
  }
  var levelOf = (s) => levels.find((l) => l.id === s.levelId);
  var body = (id, x, y, w, h) => ({ id, x, y, w, h, vx: 0, vy: 0, grounded: false, support: -1, alive: true });
  function device(o) {
    const p = o.properties, r = (o.rotation || 0) * Math.PI / 180 + (o.type === "wind" ? Math.PI / 2 : 0);
    let x = o.x, y = o.y, w = o.width || 64, h = o.height || 64;
    if (o.type === "platform") {
      x += w / 2;
      y += h;
    } else if (o.type === "wind") {
      x += -48 * Math.cos(r) + 32 * Math.sin(r);
      y += -48 * Math.sin(r) - 32 * Math.cos(r);
      w = 80;
      h = 20;
      y += h / 2;
    } else if (o.type === "hanging" || o.type === "pulley") {
      const pt = o.polyline?.[0] || { x: 0, y: 0 };
      const end = o.type === "hanging" ? o.polyline?.[1] : pt;
      x += end?.x || 0;
      y += end?.y || 0;
      w = (p.barWidth || 3.2) * T;
      h = 8;
    } else if (o.type === "roman") {
      const pts = o.polygon || [];
      const xs = pts.map((pt) => pt.x), ys = pts.map((pt) => pt.y);
      w = Math.max(...xs) - Math.min(...xs);
      h = 10;
      x += w / 2;
      y += Math.min(...ys) / 2;
    } else {
      x += 32 * Math.cos(r) + 32 * Math.sin(r);
      y += 32 * Math.sin(r) - 32 * Math.cos(r);
      h = o.type.includes("pusher") ? 12 : o.type === "lever" ? 44 : 56;
      w = o.type.includes("pusher") ? 56 : 56;
      y += h / 2;
    }
    return { ...body(o.id, x, y, w, h), type: o.type, group: Number(p.group || 0), active: o.type === "lever" ? Number(p.startPos || 1) * Number(p.onis || 1) < 0 : !!p.initialState, timer: 0, baseX: x, baseY: y, dx: Number(p.dx ?? 4) * T, dy: Number(p.dy ?? 0) * T, amount: 0, rotation: r, props: p, pair: -1, anchorX: o.x, anchorY: o.y, swing: 0, angularVelocity: 0 };
  }
  function create5(round, playing2, seats, seed, mapId) {
    const l = levels.find((x) => x.id === mapId) || levels[0];
    const players = seats.filter((x) => x >= 1 && x <= 2).map((seat) => {
      const element = seat === 1 ? "fb" : "wg";
      const o = l.objects.find((x) => x.type === "char" && x.properties.char === element) || { x: 64 + (seat - 1) * 80, y: 896 };
      return { ...body(-seat, o.x + 32, o.y - 16, 28, 45), seat, element, facing: 1, gems: 0, lastAttack: 0, lastAlt: 0, upHeld: false, teleport: 0, inExit: false };
    });
    const devices = l.objects.filter((o) => !["char", "diamond", "door"].includes(o.type)).map(device);
    for (const o of l.objects.filter((o2) => o2.type === "pulley")) {
      const a = devices.find((d) => d.id === o.id);
      const pt = o.polyline[3];
      const b = { ...a, id: 1e4 + o.id, x: o.x + pt.x, y: o.y + pt.y, baseX: o.x + pt.x, baseY: o.y + pt.y };
      a.pair = b.id;
      b.pair = a.id;
      devices.push(b);
    }
    for (const d of devices.filter((d2) => d2.type === "portal")) {
      const other = devices.find((x) => x.type === "portal" && x.id !== d.id && (x.props.portalId || 0) === (d.props.portalId || 0));
      if (other) d.pair = other.id;
    }
    const liquids = [];
    for (let y = 0; y < l.height; y++) for (let x = 0; x < l.width; x++) {
      const type = l.ground[y * l.width + x];
      if (![5, 6, 7, 55].includes(type)) continue;
      let w = 1;
      while (x + w < l.width && l.ground[y * l.width + x + w] === type) w++;
      liquids.push({ x: x * T, y: y * T, w: w * T, h: T / 2, type: type === 55 ? 5 : type, frozen: type === 55 });
      x += w - 1;
    }
    return { gameId: "fbw_forest-server", round, tick: 0, phase: playing2 && players.length === 2 ? "playing" : "waiting", winner: null, ack: [0, 0], inputs: [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }], levelId: l.id, seed: seed >>> 0, players, devices, gems: l.objects.filter((o) => o.type === "diamond").map((o) => ({ id: o.id, x: o.x + 32, y: o.y - 32, element: o.properties.char, taken: false })), exits: l.objects.filter((o) => o.type === "door").map((o) => ({ x: o.x + 32, y: o.y, element: o.properties.char })), liquids, beams: [], success: false, elapsed: 0, collected: 0 };
  }
  function tileSolid(l, x, y) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= l.width || ty >= l.height) return false;
    const type = l.ground[ty * l.width + tx], px = x - tx * T, py = y - ty * T;
    if (type < 0 || [5, 6, 7, 55].includes(type)) return false;
    if (type === 1 || type === 11) return py <= T - px;
    if (type === 2 || type === 12) return py <= px;
    if (type === 3) return py >= px;
    if (type === 4) return py >= T - px;
    return true;
  }
  function solidAt(s, x, y) {
    if (tileSolid(levelOf(s), x, y)) return true;
    return s.liquids.some((q) => x >= q.x && x < q.x + q.w && y >= q.y + (q.frozen ? 0 : q.h) && y < q.y + T);
  }
  var solidDevice = (d) => ["platform", "hanging", "pulley", "roman", "box", "boxheavy", "boxmirror", "ball"].includes(d.type);
  function collides2(s, b, others) {
    const points = [[b.x - b.w / 2 + 1, b.y - b.h + 1], [b.x + b.w / 2 - 1, b.y - b.h + 1], [b.x - b.w / 2 + 1, b.y - 1], [b.x + b.w / 2 - 1, b.y - 1], [b.x, b.y - 1], [b.x, b.y - b.h / 2]];
    return points.some(([x, y]) => solidAt(s, x, y)) || others.some((o) => o.id !== b.id && overlap(b, o));
  }
  function move3(s, b, others) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.vx), Math.abs(b.vy)) / 4));
    const vx = b.vx / steps, vy = b.vy / steps;
    b.grounded = false;
    b.support = -1;
    for (let i = 0; i < steps; i++) {
      b.x += vx;
      if (collides2(s, b, others)) {
        let climbed = false;
        if (vy >= 0 && b.h <= 45) {
          for (let n = 1; n <= 5; n++) {
            b.y -= 1;
            if (!collides2(s, b, others)) {
              climbed = true;
              break;
            }
          }
          if (!climbed) b.y += 5;
        }
        if (!climbed) {
          b.x -= vx;
          b.vx = 0;
        }
      }
      b.y += vy;
      if (collides2(s, b, others)) {
        b.y -= vy;
        if (vy >= 0) {
          b.grounded = true;
          const below = { ...b, y: b.y + 2 };
          b.support = others.find((o) => o.id !== b.id && overlap(below, o))?.id ?? -1;
        }
        b.vy = 0;
      }
    }
    if (!b.grounded) {
      b.y += 1.5;
      if (collides2(s, b, others)) {
        b.grounded = true;
        b.vy = Math.max(0, b.vy);
        b.support = others.find((o) => o.id !== b.id && overlap(b, o))?.id ?? -1;
      }
      b.y -= 1.5;
    }
  }
  function castBeams(s) {
    s.beams = [];
    for (const emitter of s.devices.filter((d) => d.type === "beamer" && d.active)) {
      let x = emitter.x, y = emitter.y - emitter.h / 2, dx = -Math.cos(emitter.rotation), dy = -Math.sin(emitter.rotation);
      let startX = x, startY = y;
      const color = String(emitter.props.color || "yellow");
      let reflected = -1;
      for (let n = 0; n < 900; n++) {
        x += dx * 4;
        y += dy * 4;
        const mirror = s.devices.find((d) => ["rotmirror", "infinitemirror", "boxmirror"].includes(d.type) && d.id !== reflected && Math.abs(d.x - x) < 20 && Math.abs(d.y - d.h / 2 - y) < 20);
        if (mirror) {
          s.beams.push({ x: startX, y: startY, tx: x, ty: y, color });
          const a = mirror.rotation + Math.PI / 4;
          const nx = -Math.sin(a), ny = Math.cos(a), dot = dx * nx + dy * ny;
          dx -= 2 * dot * nx;
          dy -= 2 * dot * ny;
          startX = x;
          startY = y;
          reflected = mirror.id;
          if (s.beams.length > 24) break;
          continue;
        }
        const sensor = s.devices.find((d) => d.type === "lightpusher" && Math.abs(d.x - x) < 24 && Math.abs(d.y - y) < 24 && String(d.props.color || "yellow") === color);
        if (sensor) {
          sensor.active = true;
          sensor.timer = 3;
        }
        const liquid = s.liquids.find((q) => x >= q.x && x < q.x + q.w && y >= q.y - 2 && y < q.y + T / 2);
        if (liquid && liquid.type === 5) {
          if (color === "blue") liquid.frozen = true;
          if (color === "red") liquid.frozen = false;
        }
        if (solidAt(s, x, y) || x < 0 || y < 0 || x > 1248 || y > 928) {
          s.beams.push({ x: startX, y: startY, tx: x, ty: y, color });
          break;
        }
      }
    }
  }
  function step5(state, inputs) {
    const s = state;
    if (s.phase !== "playing") return;
    s.tick++;
    s.elapsed++;
    const groups = /* @__PURE__ */ new Set();
    for (const d of s.devices) {
      if (d.timer > 0) d.timer--;
      if (d.type === "pusher" || d.type === "timedpusher") {
        const touch = [...s.players, ...s.devices.filter(solidDevice)].some((b) => b.id !== d.id && Math.abs(b.x - d.x) < (b.w + d.w) / 2 && Math.abs(b.y - (d.baseY - 3)) < 14);
        if (touch) d.timer = d.type === "timedpusher" ? Math.ceil(Number(d.props.time || 2e3) * HZ6 / 1e3) : 2;
        d.active = d.timer > 0;
      }
      if (d.type === "lightpusher") d.active = d.timer > 0;
      if (d.active && ["lever", "pusher", "timedpusher", "lightpusher"].includes(d.type)) groups.add(d.group);
    }
    for (const d of s.devices) {
      if (["platform", "portal", "wind", "beamer", "rotmirror", "infinitemirror"].includes(d.type)) {
        const control = s.devices.some((x) => x.group === d.group && ["lever", "pusher", "timedpusher", "lightpusher"].includes(x.type));
        d.active = control ? groups.has(d.group) : !!d.props.initialState;
        if (d.props.invertInput) d.active = !d.active;
      }
      if (d.type === "platform") {
        const oldX = d.x, oldY = d.y;
        const distance = Math.hypot(d.dx, d.dy);
        d.amount = clamp3(d.amount + (d.active ? 1 : -1) * (d.props.dtheta != null ? 0.015 : distance ? 64 / HZ6 / distance : 0), 0, 1);
        if (d.props.dtheta != null) {
          d.rotation = Number(d.props.dtheta) * Math.PI / 180 * d.amount;
          const ox = Number(d.props.offsetX || 0) * T, oy = Number(d.props.offsetY || 0) * T;
          d.x = d.baseX - ox + ox * Math.cos(d.rotation) - oy * Math.sin(d.rotation);
          d.y = d.baseY - oy + ox * Math.sin(d.rotation) + oy * Math.cos(d.rotation);
        } else {
          d.x = d.baseX + d.dx * d.amount;
          d.y = d.baseY + d.dy * d.amount;
        }
        for (const b of [...s.players, ...s.devices.filter((x) => ["box", "boxheavy", "boxmirror", "ball"].includes(x.type))]) if (b.support === d.id) {
          b.x += d.x - oldX;
          b.y += d.y - oldY;
        }
      }
      if (d.type === "hanging") {
        const oldX = d.x;
        const weight = s.players.filter((p) => p.support === d.id).reduce((n, p) => n + (p.x - d.x) * 4e-4, 0);
        d.angularVelocity += weight - d.swing * 0.02;
        d.angularVelocity *= 0.96;
        d.swing = clamp3(d.swing + d.angularVelocity, -0.7, 0.7);
        d.x = d.baseX + Math.sin(d.swing) * (d.baseY - d.anchorY);
        d.rotation = d.swing;
        for (const p of s.players) if (p.support === d.id) p.x += d.x - oldX;
      }
      if (d.type === "pulley" && d.id < 1e4) {
        const other = s.devices.find((x) => x.id === d.pair);
        const a = s.players.filter((p) => p.support === d.id).length, b = s.players.filter((p) => p.support === other.id).length;
        const change = clamp3((a - b) * 0.5, -0.5, 0.5);
        const offset = clamp3(d.y - d.baseY + change, -480, 480);
        const delta = d.baseY + offset - d.y;
        d.y += delta;
        other.y -= delta;
        for (const p of s.players) {
          if (p.support === d.id) p.y += delta;
          if (p.support === other.id) p.y -= delta;
        }
      }
    }
    const solids = s.devices.filter(solidDevice);
    for (const box of solids.filter((d) => ["box", "boxheavy", "boxmirror", "ball"].includes(d.type))) {
      box.vy = clamp3(box.vy + 1e3 / HZ6 / HZ6, -20, 20);
      box.vx *= 0.9;
      move3(s, box, solids);
    }
    for (const p of s.players) {
      const i = inputs[p.seat - 1] || EMPTY_INPUT;
      s.inputs[p.seat - 1] = { ...i };
      s.ack[p.seat - 1] = Math.max(s.ack[p.seat - 1], i.seq);
      if (!p.alive) continue;
      const jump = i.alt > p.lastAlt || i.up && !p.upHeld, attack = i.attack > p.lastAttack;
      p.lastAlt = Math.max(p.lastAlt, i.alt);
      p.lastAttack = Math.max(p.lastAttack, i.attack);
      p.upHeld = i.up;
      if (p.teleport > 0) p.teleport--;
      const ice = s.liquids.some((q) => q.frozen && p.x >= q.x && p.x <= q.x + q.w && Math.abs(p.y - q.y) < 4) || [10, 11, 12].some((type) => {
        const l = levelOf(s);
        return l.ground[Math.floor((p.y + 3) / T) * l.width + Math.floor(p.x / T)] === type;
      });
      const dir = Number(i.right) - Number(i.left), max = ice && p.element === "wg" ? 2 * T / HZ6 : 8.5 * T / HZ6;
      if (dir) {
        p.facing = dir;
        p.vx = clamp3(p.vx + dir * (p.grounded ? 0.45 : 0.27), -max, max);
      } else p.vx *= ice && p.element === "fb" ? 0.99 : 0.76;
      if (jump && p.grounded) {
        p.vy = -(ice ? p.element === "fb" ? 3 : 10 : 15.5) * T / HZ6;
        p.grounded = false;
      }
      p.vy = clamp3(p.vy + 1e3 / HZ6 / HZ6, -20, 20);
      for (const wind of s.devices.filter((d) => d.type === "wind" && d.active)) {
        const r = wind.rotation, len = Number(wind.props.length || 10) * T, dx = Math.sin(r), dy = -Math.cos(r);
        const tx = p.x - wind.x, ty = p.y - p.h / 2 - (wind.y - wind.h / 2);
        const along = tx * dx + ty * dy, across = tx * dy - ty * dx;
        if (Math.abs(across) < Number(wind.props.windWidth || 2.6) * T / 2 && along > 0 && along < len) {
          const force = (1.8 + 0.2 * Math.sin(s.tick / HZ6)) * (1 - along / len);
          p.vx = (p.vx + dx * force) * 0.975;
          p.vy = (p.vy + dy * force) * 0.975;
        }
      }
      for (const box of solids.filter((d) => ["box", "boxheavy", "boxmirror", "ball"].includes(d.type))) {
        if (overlap({ ...p, x: p.x + p.vx }, box)) {
          box.vx = p.vx * (box.type === "boxheavy" ? 0.4 : 0.9);
          move3(s, box, solids);
        }
      }
      move3(s, p, solids);
      for (const lever of s.devices.filter((d) => d.type === "lever")) if (Math.abs(p.x - lever.x) < 34 && Math.abs(p.y - lever.y) < 60) {
        if (attack) lever.active = !lever.active;
        else if (Math.abs(p.vx) > 0.1) lever.active = p.vx * Number(lever.props.onis || 1) < 0;
      }
      for (const portal of s.devices.filter((d) => d.type === "portal" && d.active)) if (!p.teleport && portal.pair !== -1 && Math.abs(p.x - portal.x) < 24 && Math.abs(p.y - portal.y) < 70) {
        const other = s.devices.find((d) => d.id === portal.pair);
        p.x = other.x + Math.cos(other.rotation) * (other.props.inverted ? -40 : 40);
        p.y = other.y;
        p.teleport = 45;
        break;
      }
      for (const gem of s.gems) if (!gem.taken && (gem.element === p.element || ["silver", "fbwg"].includes(gem.element)) && Math.abs(p.x - gem.x) < 26 && Math.abs(p.y - p.h / 2 - gem.y) < 32) {
        gem.taken = true;
        p.gems++;
        s.collected++;
      }
      for (const q of s.liquids) if (!q.frozen && p.x + p.w / 2 > q.x + 4 && p.x - p.w / 2 < q.x + q.w - 4 && p.y > q.y + 4 && p.y - p.h < q.y + q.h && (q.type === 7 || q.type === 5 && p.element === "fb" || q.type === 6 && p.element === "wg")) {
        p.alive = false;
        s.phase = "finished";
        s.success = false;
        s.winner = null;
      }
      if (p.y > levelOf(s).height * T + 100 || p.x < -100 || p.x > levelOf(s).width * T + 100) {
        p.alive = false;
        s.phase = "finished";
        s.success = false;
      }
      p.inExit = s.exits.some((e) => e.element === p.element && Math.abs(p.x - e.x) < 25 && Math.abs(p.y - e.y) < 28 && p.grounded);
    }
    castBeams(s);
    if (s.phase === "playing" && s.players.length === 2 && s.players.every((p) => p.alive && p.inExit)) {
      s.phase = "finished";
      s.success = true;
      s.winner = 1;
    }
  }
  function valid5(value) {
    if (!value || typeof value !== "object") return false;
    const s = value;
    if (s.gameId !== "fbw_forest-server" || !levels.some((l) => l.id === s.levelId) || !["waiting", "playing", "finished"].includes(s.phase) || !Number.isSafeInteger(s.tick) || s.tick < 0 || !Number.isSafeInteger(s.round) || !Array.isArray(s.players) || s.players.length > 2 || !Array.isArray(s.devices) || s.devices.length > 180 || !Array.isArray(s.gems) || s.gems.length > 100 || !Array.isArray(s.ack) || s.ack.length !== 2) return false;
    if (s.players.some((p) => !p || typeof p !== "object") || new Set(s.players.map((p) => p.seat)).size !== s.players.length || !s.players.every((p) => [1, 2].includes(p.seat) && p.element === (p.seat === 1 ? "fb" : "wg") && typeof p.alive === "boolean" && [p.x, p.y, p.vx, p.vy, p.lastAttack, p.lastAlt].every(Number.isFinite)) || !Array.isArray(s.inputs) || s.inputs.length !== 2 || !s.inputs.every(validInput3)) return false;
    return s.devices.every((d) => d && typeof d.type === "string" && [d.x, d.y, d.vx, d.vy, d.amount, d.rotation].every(Number.isFinite)) && s.gems.every((g) => g && Number.isFinite(g.x) && Number.isFinite(g.y) && typeof g.taken === "boolean") && Array.isArray(s.exits) && s.exits.every((e) => e && [e.x, e.y].every(Number.isFinite) && ["fb", "wg"].includes(e.element)) && Array.isArray(s.liquids) && s.liquids.every((q) => q && [q.x, q.y, q.w, q.h].every(Number.isFinite) && [5, 6, 7].includes(q.type) && typeof q.frozen === "boolean") && Array.isArray(s.beams) && s.beams.every((b) => b && [b.x, b.y, b.tx, b.ty].every(Number.isFinite)) && typeof s.success === "boolean" && s.ack.every((n) => Number.isSafeInteger(n) && n >= 0);
  }
  var images5 = {};
  var stone = null;
  function stonePattern(ctx) {
    const f = forest_data_default.atlases.TempleAssets.ForeGround0000.frame;
    if (!images5.TempleAssets) {
      images5.TempleAssets = new Image();
      images5.TempleAssets.src = "/expanded/assets/forest/TempleAssets.png";
    }
    if (!stone && images5.TempleAssets.complete && images5.TempleAssets.naturalWidth) {
      const tile = document.createElement("canvas");
      tile.width = 128;
      tile.height = 128;
      tile.getContext("2d").drawImage(images5.TempleAssets, f.x, f.y, f.w, f.h, 0, 0, 128, 128);
      stone = ctx.createPattern(tile, "repeat");
    }
    return stone;
  }
  function atlas(ctx, key, name, x, y, w, h) {
    const frame = forest_data_default.atlases[key]?.[name]?.frame;
    if (!frame) return false;
    if (!images5[key]) {
      images5[key] = new Image();
      images5[key].src = "/expanded/assets/forest/" + key + ".png";
    }
    if (!images5[key].complete || !images5[key].naturalWidth) return false;
    ctx.drawImage(images5[key], frame.x, frame.y, frame.w, frame.h, x, y, w ?? frame.w, h ?? frame.h);
    return true;
  }
  function render5(canvas, state, seat) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = state || create5(0, false, [1, 2], 1), l = levelOf(s);
    const sx = canvas.width / 1248, sy = canvas.height / 928;
    ctx.save();
    ctx.scale(sx, sy);
    ctx.fillStyle = "#2b271a";
    ctx.fillRect(0, 0, 1248, 928);
    if (!images5.background) {
      images5.background = new Image();
      images5.background.src = "/expanded/assets/forest/TempleHallForest.jpg";
    }
    if (images5.background.complete && images5.background.naturalWidth) {
      ctx.globalAlpha = 0.2;
      ctx.drawImage(images5.background, 0, 0, 1248, 928);
      ctx.globalAlpha = 1;
    }
    for (let y = 0; y < l.height; y++) for (let x = 0; x < l.width; x++) {
      const type = l.ground[y * l.width + x];
      if (type < 0 || [5, 6, 7, 55].includes(type)) continue;
      ctx.fillStyle = stonePattern(ctx) || "#8b7448";
      ctx.beginPath();
      const xx = x * T, yy = y * T;
      if ([1, 11].includes(type)) {
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx + T, yy);
        ctx.lineTo(xx, yy + T);
      } else if ([2, 12].includes(type)) {
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx + T, yy);
        ctx.lineTo(xx + T, yy + T);
      } else if (type === 3) {
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx, yy + T);
        ctx.lineTo(xx + T, yy + T);
      } else if (type === 4) {
        ctx.moveTo(xx + T, yy);
        ctx.lineTo(xx, yy + T);
        ctx.lineTo(xx + T, yy + T);
      } else ctx.rect(xx, yy, T, T);
      ctx.fill();
      ctx.strokeStyle = "#4d432d";
      ctx.stroke();
      if ((x + y * 3) % 13 === 0 && type === 0) atlas(ctx, "TempleAssets", "decor_X0000", xx + 8, yy + 8, 16, 16);
    }
    for (const q of s.liquids) {
      ctx.fillStyle = q.frozen ? "#badcde" : q.type === 5 ? "#338bd5" : q.type === 6 ? "#ef542d" : "#77c842";
      ctx.fillRect(q.x, q.y + 3, q.w, T - 3);
      for (let x = q.x; x < q.x + q.w; x += 32) atlas(ctx, "GroundAssets", (q.frozen ? "IceBox" : q.type === 5 ? "WaterBox" : q.type === 6 ? "FireBox" : "GreenBox") + "0000", x, q.y, 32, 32);
    }
    for (const e of s.exits) {
      const at = s.players.some((p) => p.element === e.element && p.inExit);
      if (!atlas(ctx, "TempleAssets", (e.element === "fb" ? "FinishBoy" : "FinishGirl") + String(at ? 21 : 0).padStart(4, "0"), e.x - 28, e.y - 65, 56, 69)) {
        ctx.fillStyle = e.element === "fb" ? "#e5673e" : "#50bddc";
        ctx.fillRect(e.x - 22, e.y - 60, 44, 60);
      }
    }
    for (const g of s.gems) if (!g.taken) atlas(ctx, "CharAssets", "diamond_" + g.element + "0000", g.x - 16, g.y - 16, 32, 32);
    for (const d of s.devices) {
      ctx.save();
      ctx.translate(d.x, d.y - d.h / 2);
      ctx.rotate(d.rotation);
      if (solidDevice(d)) {
        ctx.fillStyle = d.active ? "#c6aa4b" : "#8e8061";
        ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      }
      const name = d.type === "box" ? "movingbox0000" : d.type === "boxheavy" ? "movingbox20000" : d.type === "boxmirror" ? "BoxMirror0000" : d.type === "platform" ? "BarCenter0000" : d.type === "hanging" ? "hanging_platform0000" : d.type === "pulley" ? "pulley_platform0000" : d.type === "pusher" ? "pusher_block0000" : d.type === "timedpusher" ? "timed_pusher_base0000" : d.type === "lightpusher" ? "lightpusher_base0000" : d.type === "lever" ? "lever_base0000" : d.type + "0000";
      atlas(ctx, "MechAssets", name, -d.w / 2, -d.h / 2, d.w, d.h);
      if (d.type === "lever") {
        ctx.rotate(d.active ? -0.6 : 0.6);
        atlas(ctx, "MechAssets", "lever_stick0000", -8, -35, 16, 45);
      }
      ctx.restore();
    }
    for (const beam of s.beams) {
      ctx.strokeStyle = beam.color === "blue" ? "#58c8ff" : beam.color === "red" ? "#ff6259" : "#ffee8a";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y);
      ctx.lineTo(beam.tx, beam.ty);
      ctx.stroke();
    }
    for (const p of s.players) {
      ctx.save();
      ctx.globalAlpha = p.alive ? 1 : 0.25;
      const prefix = p.element === "fb" ? "fire" : "water";
      const anim = p.grounded ? "idle" : p.vy < 0 ? "rising" : "falling";
      const n = p.grounded ? s.tick % 30 : Math.floor(s.tick / 4) % 5;
      ctx.translate(p.x, p.y - 19);
      ctx.scale(p.facing, 1);
      atlas(ctx, "CharAssets", prefix + "_legs_" + (Math.abs(p.vx) > 0.2 ? "running" + String(Math.floor(s.tick / 2) % 8).padStart(4, "0") : "idle0000"), -23, -42, 46, 60);
      atlas(ctx, "CharAssets", prefix + "_head_" + anim + String(n).padStart(4, "0"), -23, -47, 46, 57);
      ctx.restore();
      if (p.seat === seat) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("\u4F60", p.x, p.y - 70);
      }
    }
    ctx.fillStyle = "rgba(0,0,0,.65)";
    ctx.fillRect(0, 0, 1248, 35);
    ctx.fillStyle = "#eee0b6";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`\u68EE\u6797\u795E\u6BBF ${Number(s.levelId.slice(-2))}/32   \u25C6 ${s.collected}/${s.gems.length}   ${Math.floor(s.elapsed / HZ6)} \u79D2   \u4E24\u4EBA\u5230\u8FBE\u5404\u81EA\u51FA\u53E3\u5373\u53EF\u901A\u5173`, 20, 24);
    if (s.phase === "finished") {
      ctx.fillStyle = "rgba(0,0,0,.65)";
      ctx.fillRect(250, 360, 748, 130);
      ctx.fillStyle = "#ffe7a4";
      ctx.font = "bold 38px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(s.success ? "\u5408\u4F5C\u901A\u5173\uFF01" : "\u4F19\u4F34\u5012\u4E0B\u4E86 \xB7 \u91CD\u65B0\u51C6\u5907\u518D\u8BD5", 624, 437);
    }
    ctx.restore();
  }
  var adapter6 = { id: "fbw_forest-server", title: "\u68EE\u6797\u51B0\u706B\u4EBA", seats: 2, hz: HZ6, width: 1248, height: 928, controls: "A/D \u6216 \u2190/\u2192 \u79FB\u52A8\uFF0CW/\u2191 \u8DF3\u8DC3\uFF0CJ/\u7A7A\u683C \u64CD\u4F5C\u62C9\u6746\uFF1B\u7EA2\u4EBA\u907F\u84DD\u6C34\uFF0C\u84DD\u4EBA\u907F\u7194\u5CA9\uFF0C\u4E24\u4EBA\u907F\u7EFF\u6C34\u3002", maps: levels.map((l, i) => ({ id: l.id, label: `\u68EE\u6797\u795E\u6BBF ${i + 1}` })), create: create5, step: step5, valid: valid5, render: render5, consumeInput(state, seat, input) {
    const p = state.players.find((x) => x.seat === seat);
    if (p) {
      p.lastAttack = Math.max(p.lastAttack, input.attack);
      p.lastAlt = Math.max(p.lastAlt, input.alt);
      p.upHeld = input.up;
    }
  } };

  // src/expanded/registry.ts
  var ADAPTERS = [adapter, adapter2, adapter3, adapter4, adapter5, adapter6];
  var getAdapter = (id) => ADAPTERS.find((adapter7) => adapter7.id === id);

  // src/authority/protocol.ts
  var grids = ["board", "items", "flames", "flameOwners", "ice"];
  var valid6 = (state) => {
    if (state && typeof state === "object" && "gameId" in state) return getAdapter(String(state.gameId))?.valid(state) || false;
    return validState(state) || validState2(state);
  };
  function hashState(state) {
    let hash = 2166136261;
    const add = (text) => {
      for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    };
    const visit = (value) => {
      if (Array.isArray(value)) {
        add("[");
        for (const item of value) {
          visit(item);
          add(",");
        }
        add("]");
      } else if (value && typeof value === "object") {
        add("{");
        for (const key of Object.keys(value).sort()) {
          const child = value[key];
          if (child === void 0) continue;
          add(JSON.stringify(key));
          add(":");
          visit(child);
          add(",");
        }
        add("}");
      } else add(JSON.stringify(value) ?? "null");
    };
    visit(state);
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function applyUpdate(current, message) {
    if (!message || message.t !== "auth" || !Number.isSafeInteger(message.round) || !Number.isSafeInteger(message.tick) || !Number.isFinite(message.serverTime) || typeof message.hash !== "string") return null;
    if (current && (message.round < current.round || message.round === current.round && message.tick < current.tick)) return null;
    let next;
    if (message.kind === "full") {
      if (!valid6(message.state)) return null;
      next = JSON.parse(JSON.stringify(message.state));
    } else if (message.kind === "delta") {
      if (!current || current.round !== message.round || message.base !== current.tick || message.tick <= current.tick || !message.patch || typeof message.patch !== "object" || Array.isArray(message.patch)) return null;
      next = JSON.parse(JSON.stringify(current));
      const target = next;
      for (const key of Object.keys(message.patch)) {
        if (!(key in target) || ["__proto__", "constructor", "prototype"].includes(key)) return null;
        target[key] = message.patch[key];
      }
      if (message.cells) for (const [key, changes] of Object.entries(message.cells)) {
        if (!grids.includes(key) || !Array.isArray(target[key]) || !Array.isArray(changes)) return null;
        const array = target[key];
        if (changes.length > array.length) return null;
        const seen = /* @__PURE__ */ new Set();
        for (const pair of changes) {
          if (!Array.isArray(pair) || pair.length !== 2 || !Number.isInteger(pair[0]) || pair[0] < 0 || pair[0] >= array.length || seen.has(pair[0])) return null;
          seen.add(pair[0]);
          array[pair[0]] = pair[1];
        }
      }
      if (!valid6(next)) return null;
    } else return null;
    if (next.round !== message.round || next.tick !== message.tick || hashState(next) !== message.hash) return null;
    return next;
  }

  // src/authority/client.ts
  var AuthorityClient = class {
    constructor(name, session, roomName, gameId) {
      this.name = name;
      this.session = session;
      this.roomName = roomName;
      this.gameId = gameId;
      this.id = "";
      this.connected = false;
      this.authority = null;
      this.rtt = 0;
      this.sentBytes = 0;
      this.receivedBytes = 0;
      this.fullUpdates = 0;
      this.deltaUpdates = 0;
      this.resyncs = 0;
      this.lastSnapshotAt = 0;
      this.lastServerTime = 0;
      this.transport = "server";
      this.onRoom = () => {
      };
      this.onSnapshot = () => {
      };
      this.onStatus = () => {
      };
      this.ws = null;
      this.stopped = false;
      this.heartbeat = 0;
      this.lastResyncAt = -Infinity;
      this.clockAt = 0;
      this.clockServerTime = 0;
      this.room = {
        t: "state",
        gameId,
        room: roomName,
        hostId: null,
        controllerId: null,
        seats: { 1: null, 2: null, 3: null, 4: null },
        members: []
      };
    }
    get seat() {
      return this.room.members.find((member) => member.id === this.id)?.seat ?? null;
    }
    get isController() {
      return !!this.id && this.room.controllerId === this.id;
    }
    get isHost() {
      return false;
    }
    get snapshotAge() {
      return this.lastSnapshotAt ? performance.now() - this.lastSnapshotAt : Infinity;
    }
    serverNow(at = performance.now()) {
      return this.clockServerTime ? this.clockServerTime + Math.max(0, at - this.clockAt) : Date.now();
    }
    start() {
      this.connect();
      this.heartbeat = window.setInterval(() => {
        if (this.connected) this.control({ t: "authPing", at: performance.now() });
      }, 1e3);
    }
    connect() {
      if (this.stopped) return;
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
      this.ws = ws;
      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.connected = true;
        this.authority = null;
        this.control({ t: "join", gameId: this.gameId, room: this.roomName, name: this.name, session: this.session, rtcCapable: false });
        this.onStatus("\u5DF2\u8FDE\u63A5\uFF0C\u6B63\u5728\u540C\u6B65\u623F\u95F4");
      };
      ws.onmessage = (event) => {
        if (this.ws !== ws || typeof event.data !== "string") return;
        this.receivedBytes += event.data.length;
        try {
          const message = JSON.parse(event.data);
          if (message.t === "welcome") this.id = message.id;
          else if (message.t === "state") {
            this.room = message;
            this.onRoom(this.room);
          } else if (message.t === "auth") this.receive(message);
          else if (message.t === "authPong" && Number.isFinite(message.at) && Number.isFinite(message.serverTime)) {
            const now = performance.now(), rtt = now - message.at;
            if (rtt >= 0 && rtt < 1e4) {
              this.rtt = rtt;
              if (rtt <= 250) {
                this.clockServerTime = message.serverTime + rtt / 2;
                this.clockAt = now;
              }
            }
          } else if (message.t === "err") this.onStatus(String(message.msg || "\u623F\u95F4\u8BF7\u6C42\u672A\u5B8C\u6210"));
        } catch {
          this.requestFull();
        }
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.connected = false;
        this.onStatus("\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u91CD\u8FDE");
        if (!this.stopped) window.setTimeout(() => this.connect(), 1e3);
      };
      ws.onerror = () => {
      };
    }
    receive(message) {
      const next = applyUpdate(this.authority, message);
      if (!next) {
        this.requestFull();
        return;
      }
      const now = performance.now();
      const longGap = !!this.lastSnapshotAt && now - this.lastSnapshotAt > 350;
      this.authority = next;
      this.lastSnapshotAt = now;
      this.lastServerTime = message.serverTime;
      if (!this.clockServerTime || this.serverNow(now) < message.serverTime) {
        this.clockServerTime = message.serverTime;
        this.clockAt = now;
      }
      if (message.kind === "full") this.fullUpdates++;
      else this.deltaUpdates++;
      this.control({ t: "authAck", round: message.round, tick: message.tick, hash: message.hash });
      this.onSnapshot(next, message.serverTime, now);
      if (longGap && message.kind !== "full" || this.serverNow(now) - message.serverTime > 350) this.requestFull();
    }
    control(message) {
      if (this.ws?.readyState !== WebSocket.OPEN || this.ws.bufferedAmount > 64 * 1024) return false;
      const value = JSON.stringify(message);
      this.ws.send(value);
      this.sentBytes += value.length;
      return true;
    }
    requestFull() {
      const now = performance.now();
      if (now - this.lastResyncAt < 250) return;
      if (this.control({ t: "authResync" })) {
        this.resyncs++;
        this.lastResyncAt = now;
      }
    }
    close() {
      this.stopped = true;
      window.clearInterval(this.heartbeat);
      this.ws?.close();
    }
  };

  // src/authority/presentation.ts
  var PREDICTION_MS = 200;
  var INTERPOLATION_MS = 90;
  var isBomb = (state) => !("gameId" in state) && "board" in state;
  var copy = (value) => JSON.parse(JSON.stringify(value));
  var mix = (a, b, amount) => a + (b - a) * amount;
  var vectors = [[-1, 0], [0, -1], [1, 0], [0, 1]];
  function bombMove(world, player, dir, fraction = 1) {
    if (!player.alive || player.frozen > 0 || player.actionLock > 0) return;
    if (player.moveDir < 0 && dir >= 0) {
      player.dir = dir;
      const [dx, dy] = vectors[dir], x = player.x + dx, y = player.y + dy;
      if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || world.board[index(x, y)] !== 0 || world.ice[index(x, y)] > world.tick || world.bombs.some((bomb) => bomb.x === x && bomb.y === y)) return;
      player.moveDir = dir;
      player.progress = 0;
      player.moveTicks = player.slow > 0 ? 20 : player.speed;
    }
    if (player.moveDir >= 0) {
      player.progress += fraction;
      if (player.progress >= player.moveTicks) {
        const [dx, dy] = vectors[player.moveDir];
        player.x += dx;
        player.y += dy;
        player.moveDir = -1;
        player.progress = 0;
      }
    }
  }
  var Presentation = class {
    constructor(requestFull) {
      this.requestFull = requestFull;
      this.state = null;
      this.reconciliations = 0;
      this.discardedPredictions = 0;
      this.predictionSteps = 0;
      this.samples = [];
      this.pending = [];
      this.latest = null;
      this.changed = false;
      this.stale = false;
      this.inputFloor = 0;
    }
    receive(state, time, receivedAt) {
      const previous = this.latest;
      if (!previous || previous.state.round !== state.round || receivedAt - previous.receivedAt > 350 || time - previous.time > 350) {
        this.clearPrediction();
        this.samples = [];
        this.inputFloor = receivedAt;
      }
      this.latest = { state, time, receivedAt };
      this.samples.push(this.latest);
      this.samples = this.samples.filter((sample) => time - sample.time <= 300).slice(-6);
      this.changed = true;
      this.stale = false;
    }
    input(input, at) {
      this.pending.push({ input: { ...input }, at });
      this.pending = this.pending.slice(-10);
    }
    clearPrediction() {
      if (this.pending.length) this.discardedPredictions++;
      this.pending = [];
    }
    render(now, serverNow, seat, held, hz) {
      this.predictionSteps = 0;
      const latest = this.latest;
      if (!latest) return this.state = null;
      if (this.changed) {
        this.reconciliations++;
        const ack = seat ? latest.state.ack[seat - 1] || 0 : 0;
        this.pending = this.pending.filter((entry) => entry.input.seq > ack && now - entry.at <= PREDICTION_MS);
        this.changed = false;
      }
      const age = Math.max(now - latest.receivedAt, serverNow - latest.time);
      if (latest.state.phase === "playing" && age > 350 && !this.stale) {
        this.stale = true;
        this.clearPrediction();
        this.samples = [latest];
        this.inputFloor = now;
        this.requestFull();
      }
      const next = copy(latest.state);
      if (next.phase !== "playing" || this.stale) return this.state = next;
      if ("gameId" in next) {
        const adapter7 = getAdapter(next.gameId);
        const target2 = serverNow - INTERPOLATION_MS;
        const before2 = [...this.samples].reverse().find((sample) => sample.time <= target2);
        const after2 = this.samples.find((sample) => sample.time >= target2);
        if (before2 && after2 && before2 !== after2 && before2.state.round === next.round && after2.state.round === next.round && after2.time - before2.time <= 200) {
          const amount = Math.max(0, Math.min(1, (target2 - before2.time) / (after2.time - before2.time)));
          for (const player of next.players) {
            if (player.seat === seat || !player.alive || player.respawn || player.respawnAt > next.tick) continue;
            const a = before2.state.players.find((p) => p.seat === player.seat), b = after2.state.players.find((p) => p.seat === player.seat);
            if (!a || !b || !a.alive || !b.alive || a.respawn || b.respawn || a.respawnAt > before2.state.tick || b.respawnAt > after2.state.tick) continue;
            const pose2 = (p) => {
              const vector = p.moveDir >= 0 ? vectors[p.moveDir] : null, f = vector ? p.progress / Math.max(1, p.moveTicks) : 0;
              return { x: p.x + (vector?.[0] || 0) * f, y: p.y + (vector?.[1] || 0) * f };
            };
            const start2 = pose2(a), end = pose2(b), limit = "board" in next ? 2 : 100;
            if (Math.hypot(end.x - start2.x, end.y - start2.y) > limit) continue;
            player.x = mix(start2.x, end.x, amount);
            player.y = mix(start2.y, end.y, amount);
            if ("moveDir" in player) {
              player.progress = 0;
              player.moveDir = -1;
            }
            if (Number.isFinite(a.angle) && Number.isFinite(b.angle)) player.angle = a.angle + Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle)) * amount;
          }
        }
        if (adapter7?.predict && seat && held && age <= PREDICTION_MS) {
          const entries2 = this.pending.filter((entry) => entry.at >= this.inputFloor && now - entry.at <= PREDICTION_MS);
          for (const entry of entries2.slice(-Math.ceil(hz * PREDICTION_MS / 1e3))) {
            adapter7.predict(next, seat, entry.input, 1);
            this.predictionSteps++;
          }
        }
        return this.state = next;
      }
      const target = serverNow - INTERPOLATION_MS;
      const before = [...this.samples].reverse().find((sample) => sample.time <= target);
      const after = this.samples.find((sample) => sample.time >= target);
      if (before && after && before !== after && before.state.round === next.round && after.state.round === next.round && before.state.phase === after.state.phase && after.time - before.time <= 200) {
        const amount = Math.max(0, Math.min(1, (target - before.time) / (after.time - before.time)));
        for (let i = 0; i < next.players.length; i++) {
          if (i === (seat || 0) - 1) continue;
          if (isBomb(next) && isBomb(before.state) && isBomb(after.state)) {
            if (!next.players[i].alive || before.state.players[i].alive !== after.state.players[i].alive) continue;
            const a = position(before.state.players[i]), b = position(after.state.players[i]);
            if (Math.hypot(b.x - a.x, b.y - a.y) > 2) continue;
            next.players[i].x = mix(a.x, b.x, amount);
            next.players[i].y = mix(a.y, b.y, amount);
            next.players[i].progress = 0;
          } else if (!isBomb(next) && !isBomb(before.state) && !isBomb(after.state)) {
            next.players[i].x = mix(before.state.players[i].x, after.state.players[i].x, amount);
            next.players[i].y = mix(before.state.players[i].y, after.state.players[i].y, amount);
          }
        }
        if (!isBomb(next) && !isBomb(before.state) && !isBomb(after.state) && before.state.rally === "flight" && after.state.rally === "flight" && before.state.lastPoint === after.state.lastPoint) {
          next.birdie.x = mix(before.state.birdie.x, after.state.birdie.x, amount);
          next.birdie.y = mix(before.state.birdie.y, after.state.birdie.y, amount);
        }
      }
      if (!seat || !held || !next.players[seat - 1] || age > PREDICTION_MS) return this.state = next;
      const entries = this.pending.filter((entry) => entry.at >= this.inputFloor && now - entry.at <= PREDICTION_MS);
      const frameMs = 1e3 / hz;
      const total = Math.min(hz * PREDICTION_MS / 1e3, entries.length + Math.max(0, now - (entries[entries.length - 1]?.at ?? now)) / frameMs);
      for (let i = 0; i < Math.ceil(total); i++) {
        const input = entries[i]?.input || held, fraction = Math.min(1, total - i);
        if (isBomb(next)) bombMove(next, next.players[seat - 1], input.dir, fraction);
        else {
          const item = input, local = next.players[seat - 1];
          const originalX = local.x;
          movePlayer(next, seat, Number(item.right) - Number(item.left));
          local.x = mix(originalX, local.x, fraction);
          if (fraction === 1) {
            local.y = Math.min(GROUND, local.y + local.vy + 1);
            local.vy = local.y >= GROUND ? 0 : local.vy + 1;
            if (item.jump > local.lastJump) {
              local.lastJump = item.jump;
              if (next.serve !== seat && local.y >= GROUND) local.vy = -12;
            }
          }
        }
        this.predictionSteps++;
      }
      return this.state = next;
    }
  };

  // src/authority/bomb-status.ts
  var BOMB_FIELD_WIDTH = 716;
  var BOMB_PANEL_WIDTH = 176;
  var BOMB_CANVAS_WIDTH = BOMB_FIELD_WIDTH + BOMB_PANEL_WIDTH;
  var asset3 = (id) => `/authority/assets/item-${id}.png`;
  function bombWeapon(p) {
    return p.weapon && p.ammo > 0 ? { src: `/authority/assets/hud-weapon-${p.weapon}.png`, label: ITEM_LABELS[p.weapon], value: `\xD7${p.ammo}` } : null;
  }
  function bombStatus(s) {
    return s.players.filter((p) => s.options.mode !== "online" || s.options.activeSeats?.includes(p.seat)).map((p) => ({
      seat: p.seat,
      alive: p.alive,
      portrait: `/authority/assets/hud-portrait-${p.character}.png`,
      color: ["#ffb2d2", "#ffe27e", "#8aceff", "#b2e78f"][p.character - 1],
      title: p.alive ? `\u751F\u547D ${p.life}` : "\u5DF2\u51FA\u5C40",
      note: p.frozen ? "\u51BB\u7ED3\u4E2D" : p.slow ? "\u51CF\u901F\u4E2D" : p.invulnerable ? "\u4FDD\u62A4\u4E2D" : "",
      icons: [
        { src: asset3("bomb"), label: "\u53EF\u7528\u70B8\u5F39", value: String(Math.max(0, p.capacity - s.bombs.filter((b) => b.owner === p.seat).length)) },
        { src: asset3("range"), label: "\u7206\u70B8\u5A01\u529B", value: String(p.range) },
        { src: asset3("speed"), label: "\u901F\u5EA6", value: String(7 - p.speed) },
        { src: asset3("life"), label: "\u751F\u547D", value: String(p.life) },
        { src: asset3("push"), label: "\u624B\u5957", value: p.push ? "\u2713" : "\u2014", active: p.push },
        { src: asset3("shield"), label: "\u62A4\u76FE", value: p.shield ? "\u2713" : "\u2014", active: p.shield }
      ],
      weapon: bombWeapon(p)
    }));
  }
  function bombBadgeAnchor(p) {
    const pos = position(p);
    return { x: 28 + (pos.x + 0.5) * 44, y: 66 + (pos.y + 1) * 44 - 53 };
  }

  // src/authority/bomb-view.ts
  var CELL3 = 44;
  var LEFT = 28;
  var TOP = 66;
  var GameView = class {
    constructor(canvas) {
      this.canvas = canvas;
      this.images = /* @__PURE__ */ new Map();
      this.audio = new NativeAudio(BOMB_SOUND_FILES);
      this.seat = null;
      this.sound = true;
      this.volume = 0.24;
      this.fps = 0;
      this.frameCount = 0;
      this.fpsAt = performance.now();
      this.finishedRound = 0;
      this.finishedAt = 0;
      canvas.width = BOMB_CANVAS_WIDTH;
      canvas.height = TOP + HEIGHT * CELL3 + 28;
      this.ctx = canvas.getContext("2d", { alpha: false });
      for (const name of [
        "floor",
        "crate",
        "wall",
        "bomb",
        "mine",
        "gas",
        "grenade",
        "fx-fire",
        "fx-ice",
        "fx-blast",
        "fx-death",
        ...Array.from({ length: 12 }, (_, i) => `bomb1-blast-${i + 1}`),
        ...["life", "push", "bomb", "shield", "range", "speed", ...WEAPONS].map((item) => `item-${item}`),
        ...[0, 1, 2, 3].map((d) => `rocket-${d}`),
        ...[1, 2, 3, 4].flatMap((hero) => [0, 1, 2, 3].flatMap((direction2) => [`hero-${hero}-${direction2}`, `walk-${hero}-${direction2}`]))
      ]) {
        const image2 = new Image();
        image2.src = `/authority/assets/${name}.png`;
        this.images.set(name, image2);
      }
      for (const name of [
        ...new Set(ORIGINAL_MAPS.flatMap((map) => [...map.floorFrames].map((frame) => `floor-${frame}`))),
        ...Array.from({ length: 58 }, (_, i) => `brick-${i + 1}`)
      ]) {
        const image2 = new Image();
        image2.src = `/authority/assets/maps/${name}.png`;
        this.images.set(name, image2);
      }
    }
    animation(name, frame, x, bottom, width, height) {
      const image2 = this.images.get(name);
      if (image2?.complete && image2.naturalWidth) this.ctx.drawImage(image2, Math.max(0, Math.floor(frame)) % 8 * 64, 0, 64, 72, x - width / 2, bottom - height, width, height);
    }
    walking(hero, direction2, frame, x, bottom) {
      const image2 = this.images.get(`walk-${hero}-${direction2}`);
      if (!image2?.complete || !image2.naturalWidth) return;
      const width = 40 * CELL3 * 1.12 / 53;
      const height = CELL3 * 1.12;
      this.ctx.drawImage(
        image2,
        Math.max(0, Math.floor(frame)) % 8 * 64 + 12,
        23,
        40,
        49,
        x - width / 2,
        bottom - height,
        width,
        height
      );
    }
    sprite(name, x, bottom, width, height) {
      const image2 = this.images.get(name);
      if (!image2?.complete || !image2.naturalWidth) return;
      const scale = Math.min(width / image2.width, height / image2.height);
      this.ctx.drawImage(image2, x - image2.width * scale / 2, bottom - image2.height * scale, image2.width * scale, image2.height * scale);
    }
    mapBrick(frame, x, y) {
      const image2 = this.images.get(`brick-${frame}`);
      if (!image2?.complete || !image2.naturalWidth) return;
      const scale = CELL3 / 30;
      this.ctx.drawImage(
        image2,
        LEFT + x * CELL3 + BRICK_RASTER_ORIGIN.x * scale,
        TOP + y * CELL3 + BRICK_RASTER_ORIGIN.y * scale,
        image2.width * scale,
        image2.height * scale
      );
    }
    setSound(enabled2) {
      this.sound = enabled2;
      this.audio.setSound(enabled2);
    }
    setVolume(volume2) {
      this.volume = Math.max(0, Math.min(1, volume2));
      this.audio.setVolume(this.volume);
    }
    // Only confirmed authority changes produce audio: prediction replay cannot
    // repeatedly play an explosion or an unconfirmed placement.
    confirm(state) {
      this.audio.confirm(state, this.seat, state.winner);
    }
    render(state, seat) {
      this.seat = seat;
      const now = performance.now();
      this.frameCount++;
      if (now - this.fpsAt >= 1e3) {
        this.fps = Math.round(this.frameCount * 1e3 / (now - this.fpsAt));
        this.frameCount = 0;
        this.fpsAt = now;
      }
      const ctx = this.ctx;
      ctx.fillStyle = "#10272b";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.font = "bold 21px system-ui";
      ctx.fillStyle = "#f5f2db";
      ctx.textAlign = "left";
      ctx.fillText(`\u6CE1\u6CE1\u5802 \xB7 ${state?.options.mode === "online" ? "\u591A\u4EBA\u8054\u673A" : state?.options.mode === "coop" ? "\u5408\u4F5C\u5BF9\u6297" : state?.options.mode === "practice" ? "\u4EBA\u673A\u7EC3\u4E60" : "\u53CC\u4EBA\u5BF9\u6218"}`, LEFT, 39);
      if (!state) return;
      const theme = originalMap(state.options.map);
      const visual = state.mapVisual;
      const draws = [];
      if (theme && visual) draws.push({ depth: 6 * WIDTH + (WIDTH - 6), draw: () => this.mapBrick(visual.landmark, 6, 5) });
      ctx.textAlign = "right";
      ctx.font = "600 18px system-ui";
      const seconds = Math.max(0, Math.ceil((ROUND_TICKS - state.tick) / HZ));
      ctx.fillText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, BOMB_FIELD_WIDTH - LEFT, 39);
      for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
        const px = LEFT + x * CELL3, py = TOP + y * CELL3, cell = index(x, y);
        ctx.fillStyle = (x + y) % 2 ? "#b2c9a6" : "#bdd3b0";
        ctx.fillRect(px, py, CELL3, CELL3);
        const floor = this.images.get(theme && visual ? `floor-${visual.floor}` : "floor");
        if (floor?.complete && floor.naturalWidth) ctx.drawImage(floor, px, py, CELL3, CELL3);
        if (state.options.map === "lanes" || state.options.map === "open") {
          ctx.fillStyle = state.options.map === "lanes" ? "#729cd333" : "#efc97044";
          ctx.fillRect(px, py, CELL3, CELL3);
        }
        ctx.strokeStyle = "#23433b18";
        ctx.strokeRect(px, py, CELL3, CELL3);
        if (state.board[cell] === 1) {
          if (theme && visual) {
            if (!(x >= 6 && x <= 7 && y >= 5 && y <= 6)) draws.push({ depth: y * WIDTH + (WIDTH - x), draw: () => this.mapBrick(visual.tiles[cell], x, y) });
          } else {
            ctx.fillStyle = "#536d66";
            ctx.fillRect(px + 1, py + 1, CELL3 - 2, CELL3 - 2);
            this.sprite("wall", px + CELL3 / 2, py + CELL3 - 2, CELL3 - 2, CELL3 - 1);
          }
        } else if (state.board[cell] === 2) {
          if (theme && visual) draws.push({ depth: y * WIDTH + (WIDTH - x), draw: () => this.mapBrick(visual.tiles[cell], x, y) });
          else this.sprite("crate", px + CELL3 / 2, py + CELL3 - 1, CELL3 - 2, CELL3 - 1);
        }
        if (state.flames[cell] > state.tick) {
          let original = false;
          for (const blast2 of state.blasts) {
            const dx = x - blast2.x, dy = y - blast2.y;
            if (dx && dy) continue;
            const dir = dx < 0 ? 0 : dy < 0 ? 1 : dx > 0 ? 2 : 3, distance = Math.abs(dx) + Math.abs(dy);
            if (distance && distance > blast2.lengths[dir]) continue;
            const tip = distance === blast2.lengths[dir] && (!blast2.active[dir] || blast2.distance >= blast2.range);
            const frame = (state.players.find((p) => p.seat === blast2.owner)?.character || blast2.owner) + (distance ? tip ? 8 : 4 : 0);
            ctx.save();
            ctx.translate(px + CELL3 / 2, py + CELL3 / 2);
            if (distance) ctx.rotate((dir + 2) * Math.PI / 2);
            this.sprite(`bomb1-blast-${frame}`, 0, CELL3 / 2, CELL3, CELL3);
            ctx.restore();
            original = true;
            break;
          }
          if (!original) this.animation("fx-blast", state.tick / 2, px + CELL3 / 2, py + CELL3, CELL3, CELL3);
        } else if (state.ice[cell] > state.tick) {
          ctx.fillStyle = "#9cdef3bd";
          ctx.fillRect(px + 1, py + 1, CELL3 - 2, CELL3 - 2);
          this.animation("fx-ice", state.tick / 4, px + CELL3 / 2, py + CELL3, CELL3, CELL3);
        } else if (state.items[cell]) {
          const type = state.items[cell];
          this.sprite(`item-${type}`, px + CELL3 / 2, py + CELL3 - 2, CELL3 * 0.86, CELL3 * 0.9);
        }
      }
      for (const s of visibleSpecials(state, seat)) {
        let x = s.x, y = s.y, lift = 0;
        const age = state.tick - s.born;
        if (s.kind === "grenade") {
          const ratio = Math.min(1, age / 18), [dx, dy] = [[-1, 0], [0, -1], [1, 0], [0, 1]][Math.max(0, s.dir)];
          x += dx * ratio * 2;
          y += dy * ratio * 2;
          lift = Math.sin(ratio * Math.PI) * CELL3;
        }
        if (s.kind === "fire" || s.kind === "ice") {
          const [dx, dy] = [[-1, 0], [0, -1], [1, 0], [0, 1]][Math.max(0, s.dir)];
          for (let d = 1; d <= s.distance; d++) {
            const cell = index(x + dx * d, y + dy * d);
            if ((s.kind === "fire" ? state.flames[cell] : state.ice[cell]) > state.tick)
              this.animation(`fx-${s.kind}`, age / 4, LEFT + (x + dx * d + 0.5) * CELL3, TOP + (y + dy * d + 1) * CELL3, CELL3, CELL3 * 1.1);
          }
        } else {
          const specialX = x, specialY = y, specialLift = lift;
          draws.push({ depth: y * WIDTH + WIDTH - x - 0.5, draw: () => this.sprite(s.kind === "rocket" ? `rocket-${s.dir}` : s.kind, LEFT + (specialX + 0.5) * CELL3, TOP + (specialY + 1) * CELL3 - specialLift, CELL3 * 0.85, CELL3 * 0.8) });
          if (s.kind === "mine" || s.kind === "gas") {
            ctx.fillStyle = s.kind === "mine" ? "#fd6670" : "#ac79ec";
            ctx.beginPath();
            ctx.arc(LEFT + (x + 0.5) * CELL3, TOP + (y + 0.75) * CELL3, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      for (const bomb of state.bombs) {
        const x = LEFT + (bomb.x + 0.5) * CELL3, y = TOP + (bomb.y + 1) * CELL3;
        draws.push({ depth: bomb.y * WIDTH + WIDTH - bomb.x - 0.5, draw: () => {
          this.sprite("bomb", x, y - 2, CELL3 * 0.85, CELL3 * 0.9);
          ctx.fillStyle = bomb.explodeAt - state.tick < 20 ? "#ff6a35" : "#ffdd73";
          ctx.beginPath();
          ctx.arc(x + 5, y - CELL3 + 5, 3 + Math.sin(now / 55), 0, Math.PI * 2);
          ctx.fill();
        } });
      }
      for (const player of [...state.players].sort((a, b) => position(a).y - position(b).y)) {
        if (state.options.mode === "online" && !state.options.activeSeats?.includes(player.seat)) continue;
        const pos = position(player), x = LEFT + (pos.x + 0.5) * CELL3, y = TOP + (pos.y + 1) * CELL3;
        if (!player.alive) {
          if (state.tick - player.diedAt < 28) draws.push({ depth: pos.y * WIDTH + WIDTH - pos.x - player.seat / 10, draw: () => this.animation("fx-death", (state.tick - player.diedAt) / 4, x, y, CELL3, CELL3 * 1.2) });
          continue;
        }
        draws.push({ depth: pos.y * WIDTH + WIDTH - pos.x - player.seat / 10, draw: () => {
          ctx.fillStyle = "#102b3a44";
          ctx.beginPath();
          ctx.ellipse(x, y - 3, 13, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          if (player.seat === seat || player.shield) {
            ctx.strokeStyle = player.shield ? "#f6ed8f" : "#ffffff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(x, y - 3, 17, 7, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = player.invulnerable > 0 && state.tick % 4 < 2 ? 0.5 : 1;
          if (player.moveDir >= 0 && !player.frozen) this.walking(player.character, Math.max(0, player.dir), state.tick / 2, x, y);
          else this.sprite(`hero-${player.character}-${Math.max(0, player.dir)}`, x, y, CELL3 * 0.9, CELL3 * 1.12);
          ctx.globalAlpha = 1;
          if (player.frozen) {
            ctx.fillStyle = "#92dcff99";
            ctx.fillRect(x - 15, y - 38, 30, 38);
          }
          if (player.slow) {
            ctx.strokeStyle = "#a97be3";
            ctx.lineWidth = 3;
            ctx.strokeRect(x - 17, y - 5, 34, 5);
          }
        } });
      }
      for (const { draw: draw3 } of draws.sort((a, b) => a.depth - b.depth)) draw3();
      if (state.phase === "playing") for (const player of state.players) {
        if (!player.alive || !player.weapon || player.ammo <= 0) continue;
        const anchor = bombBadgeAnchor(player), weapon = bombWeapon(player);
        if (weapon) weaponBadge(ctx, weapon, anchor.x, anchor.y, 18);
      }
      if (state.phase !== "playing") {
        ctx.fillStyle = "#10272bd9";
        ctx.fillRect(LEFT, TOP, WIDTH * CELL3, HEIGHT * CELL3);
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff5dc";
        ctx.font = "bold 32px system-ui";
        const winner = !state.winner ? "\u5E73\u5C40" : state.options.mode === "coop" ? state.winner === 1 ? "\u5408\u4F5C\u961F\u4F0D\u83B7\u80DC" : "\u7535\u8111\u961F\u4F0D\u83B7\u80DC" : `P${state.winner} \u83B7\u80DC`;
        ctx.fillText(state.phase === "waiting" ? "\u51C6\u5907\u5F00\u5C40" : winner, BOMB_FIELD_WIDTH / 2, this.canvas.height / 2 - 12);
        ctx.font = "17px system-ui";
        ctx.fillStyle = "#c3d5ca";
        if (state.phase === "finished" && state.round !== this.finishedRound) {
          this.finishedRound = state.round;
          this.finishedAt = now;
        }
        ctx.fillText(state.phase === "waiting" ? "\u81F3\u5C11\u4E24\u4EBA\u5165\u5EA7\uFF0C\u5168\u5458\u51C6\u5907\u540E\u5F00\u5C40" : `\u4E0B\u4E00\u5C40\u5C06\u5728 ${Math.max(0, Math.ceil((3e3 - (now - this.finishedAt)) / 1e3))} \u79D2\u540E\u81EA\u52A8\u5F00\u59CB`, BOMB_FIELD_WIDTH / 2, this.canvas.height / 2 + 24);
      }
      drawPlayerStatus(ctx, bombStatus(state), BOMB_FIELD_WIDTH, TOP, this.canvas.width - BOMB_FIELD_WIDTH, HEIGHT * CELL3, seat);
    }
  };

  // src/badminton/view.ts
  var ASSET_ROOT = "/authority/assets/badminton/";
  var BadmintonView = class {
    constructor(canvas) {
      this.canvas = canvas;
      this.images = /* @__PURE__ */ new Map();
      this.frames = 0;
      this.fpsAt = performance.now();
      this.fps = 0;
      canvas.width = WIDTH2 * 2;
      canvas.height = HEIGHT2 * 2;
      this.ctx = canvas.getContext("2d");
      for (const name of ["court", "birdie", "p1-body", "p1-body-alt", "p2-body", "p2-head"]) this.load(name);
      for (const side of ["p1", "p2"]) {
        for (let frame = 1; frame <= 15; frame++) this.load(`${side}-swing-${String(frame).padStart(2, "0")}`);
        for (let frame = 1; frame <= 13; frame++) this.load(`${side}-serve-${String(frame).padStart(2, "0")}`);
      }
      for (let frame = 1; frame <= 14; frame++) this.load(`p1-underhand-${String(frame).padStart(2, "0")}`);
    }
    load(name) {
      const image2 = new Image();
      image2.src = `${ASSET_ROOT}${name}.png`;
      this.images.set(name, image2);
    }
    draw(name, x, y) {
      const image2 = this.images.get(name);
      if (image2?.complete && image2.naturalWidth) this.ctx.drawImage(image2, x, y);
    }
    render(state, seat) {
      const ctx = this.ctx;
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = "#a5a29b";
      ctx.fillRect(0, 0, WIDTH2, HEIGHT2);
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
    player(state, index3) {
      const p = state.players[index3];
      const side = index3 === 0 ? "p1" : "p2";
      const moving = state.inputs[index3].left !== state.inputs[index3].right;
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (index3 === 0) this.draw(moving && p.y >= GROUND && state.tick % 2 === 0 ? "p1-body-alt" : "p1-body", -14, -78);
      else {
        this.draw("p2-body", -12, -62);
        this.draw("p2-head", -8, -81);
      }
      ctx.restore();
      const serving = p.servePose > 0 || state.rally === "serve" && state.serve === index3 + 1;
      const kind = serving ? "serve" : p.underhand && p.swing > 0 ? "underhand" : "swing";
      const frame = p.swing > 0 ? serving ? 15 - p.swing : 16 - p.swing : 1;
      const bounded = Math.max(1, Math.min(serving ? 13 : kind === "underhand" ? 14 : 15, kind === "underhand" ? frame - 1 : frame));
      const key = `${side}-${kind}-${String(bounded).padStart(2, "0")}`;
      ctx.save();
      ctx.translate(p.x, p.y - 58);
      if (index3 === 1) ctx.scale(-1, 1);
      if (serving) ctx.scale(1, -1);
      this.draw(key, serving ? index3 === 0 ? -77 : -101 : index3 === 0 ? -67 : -69, -(serving ? 108 : 95));
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

  // src/authority/nameplates.ts
  function nameAnchors(state, width, height) {
    return state.players.filter((p) => p.alive !== false && !p.respawn && !(p.respawnAt > state.tick) && (!("options" in state) || state.options.mode !== "online" || state.options.activeSeats.includes(p.seat))).map((p) => {
      let x = p.x, y = p.y;
      if (!("gameId" in state)) {
        if ("board" in state) {
          const pos = position(p);
          x = 28 + (pos.x + 0.5) * 44;
          y = 66 + (pos.y + 1) * 44 - (p.weapon && p.ammo > 0 ? 87 : 67);
        } else {
          x *= 2;
          y = Math.max(108, y - 96) * 2;
        }
      } else if (state.gameId === "9109-server") {
        const vectors2 = [[-1, 0], [0, -1], [1, 0], [0, 1]], delta = vectors2[p.moveDir] || [0, 0], f = p.progress / p.moveTicks;
        x = 45 + (p.x + 0.5 + delta[0] * f) * 30;
        y = 66 + (p.y + 1 + delta[1] * f) * 30 - (bomb2Weapon(state, p) ? 72 : 53);
      } else if (state.gameId === "137953-server") {
        const scale = Math.min(680 / (state.width * 50), 365 / (state.height * 50));
        x = (712 - state.width * 50 * scale) / 2 + p.x * scale;
        y = 48 + (365 - state.height * 50 * scale) / 2 + (p.y + 18) * scale;
      } else if (state.gameId === "6232-server") {
        const bounds = brawler_data_default.stages.find((stage) => stage.id === state.mapId).bounds;
        const worldW = bounds[2] - bounds[0], worldH = bounds[3] - bounds[1];
        const scale = Math.min(width / worldW, (height - 75) / worldH);
        x = (width - worldW * scale) / 2 + (p.x - bounds[0]) * scale;
        y = 45 + (p.y - bounds[1] - 49) * scale;
      } else if (state.gameId === "fbw_forest-server") {
        x *= width / 1248;
        y = (p.y - 82) * height / 928;
      } else if (state.gameId === "50737-server") {
        const cam = camera(state, width, height);
        x = cam.x + p.x * cam.scale;
        y = cam.y + (p.y - 87) * cam.scale;
      } else y -= 46;
      const fieldWidth = "gameId" in state ? state.gameId === "9109-server" ? BOMB2_FIELD_WIDTH : width : "board" in state ? BOMB_FIELD_WIDTH : width;
      return { seat: p.seat, x: Math.max(36, Math.min(fieldWidth - 36, x)), y: Math.max(12, Math.min(height - 20, y)) };
    });
  }
  var Nameplates = class {
    constructor(stage) {
      this.layer = document.createElement("div");
      this.labels = /* @__PURE__ */ new Map();
      this.layer.className = "player-nameplates";
      stage.append(this.layer);
    }
    render(state, canvas, members, ownSeat) {
      this.layer.style.left = `${canvas.offsetLeft}px`;
      this.layer.style.top = `${canvas.offsetTop}px`;
      this.layer.style.width = `${canvas.clientWidth}px`;
      this.layer.style.height = `${canvas.clientHeight}px`;
      const scale = Math.min(canvas.clientWidth / canvas.width, canvas.clientHeight / canvas.height);
      const unit = state && "gameId" in state && state.gameId === "50737-server" ? Math.min(1.5, camera(state, canvas.width, canvas.height).scale) : 1;
      const fullscreen = !!document.fullscreenElement || document.body.classList.contains("game-fullscreen");
      this.layer.style.setProperty("--name-font", `${Math.max(6, Math.min(fullscreen ? 16 : 11, 10 * scale * unit))}px`);
      this.layer.style.setProperty("--name-line", `${Math.max(8, Math.min(fullscreen ? 19 : 13, 12 * scale * unit))}px`);
      this.layer.style.setProperty("--name-width", `${Math.max(32, Math.min(fullscreen ? 112 : 86, 86 * scale * unit))}px`);
      this.layer.style.setProperty("--name-pad", `${Math.max(1, 2 * scale)}px`);
      const anchors = state && state.phase === "playing" ? nameAnchors(state, canvas.width, canvas.height) : [];
      const visible = /* @__PURE__ */ new Set();
      const placed = [];
      for (const anchor of anchors) {
        const member = members.find((member2) => member2.seat === anchor.seat);
        if (!member) continue;
        visible.add(anchor.seat);
        let label = this.labels.get(anchor.seat);
        if (!label) {
          label = document.createElement("span");
          label.className = "player-nameplate";
          label.dataset.playerSeat = String(anchor.seat);
          this.labels.set(anchor.seat, label);
          this.layer.append(label);
        }
        if (label.textContent !== member.name) {
          label.textContent = member.name;
          label.title = member.name;
        }
        label.hidden = false;
        label.classList.toggle("mine", ownSeat === anchor.seat);
        const half = label.offsetWidth / 2;
        const x = Math.max(half, Math.min(canvas.clientWidth - half, anchor.x / canvas.width * canvas.clientWidth));
        let top = Math.max(0, Math.min(canvas.clientHeight - label.offsetHeight, anchor.y / canvas.height * canvas.clientHeight));
        for (let attempt = 0; attempt < 8; attempt++) {
          const overlap2 = placed.find((r) => x + half + 2 > r.left && x - half - 2 < r.right && top + label.offsetHeight + 1 > r.top && top - 1 < r.bottom);
          if (!overlap2) break;
          const above = overlap2.top - label.offsetHeight - 2;
          top = above >= 0 ? above : Math.min(canvas.clientHeight - label.offsetHeight, overlap2.bottom + 2);
        }
        placed.push({ left: x - half, right: x + half, top, bottom: top + label.offsetHeight });
        label.style.left = `${x}px`;
        label.style.top = `${top}px`;
      }
      for (const [seat, label] of this.labels) if (!visible.has(seat)) label.hidden = true;
    }
  };

  // src/authority/main.ts
  if (ensureName()) start();
  function start() {
    const el = (id) => document.getElementById(id);
    const params = new URLSearchParams(location.search), badminton = params.get("game") === "46923-server";
    const adapter7 = getAdapter(params.get("game") || "");
    const recordsEnabled = !badminton && adapter7?.id !== "fbw_forest-server";
    const gameId = adapter7?.id || (badminton ? "46923-server" : "3881-server"), title = adapter7?.title || (badminton ? "\u706B\u67F4\u4EBA\u6253\u7FBD\u6BDB\u7403" : "Q\u7248\u6CE1\u6CE1\u5802");
    const room2 = (params.get("room") || "lobby").slice(0, 20), hz = adapter7?.hz || (badminton ? HZ2 : HZ);
    const net = new AuthorityClient(arcadeName(), arcadeSession(), room2, gameId);
    const presentation = new Presentation(() => net.requestFull());
    const canvas = el("game-canvas");
    const nameplates = new Nameplates(el("native-stage"));
    const bombView = badminton || adapter7 ? null : new GameView(canvas), badmintonView = badminton ? new BadmintonView(canvas) : null;
    let seat = null, round = -1, seq = 0, bomb = 0, jump = 0, hit4 = 0;
    let held = null, lastHitAt = 0, lastFrameAt = performance.now();
    let selectedWeapon;
    let weaponStep = 1;
    let cancelledAttack = 0;
    let inputEnabled = true, uiAt = 0, confirmedRound = -1, confirmedTick = -1;
    let inputAt = 0, responseMs = 0, maxFrameMs = 0;
    let adapterFrames = 0, adapterFps = 0, fpsAt = performance.now();
    const keys = /* @__PURE__ */ new Map();
    const bombDirections = { KeyA: 0, ArrowLeft: 0, KeyW: 1, ArrowUp: 1, KeyD: 2, ArrowRight: 2, KeyS: 3, ArrowDown: 3 };
    const tank = adapter7?.id === "137953-server", bomb2 = adapter7?.id === "9109-server", shooters = adapter7?.id === "50737-server" || adapter7?.id === "97734-server";
    const boxhead = adapter7?.id === "50737-server";
    const actions = badminton ? ["KeyS", "ArrowDown", "Space", "Enter"] : adapter7 ? ["Space", "Enter", ...boxhead ? [] : ["KeyE"], ...tank || bomb2 ? [] : ["KeyJ", "KeyZ"]] : ["Space", "Enter", "KeyE", "ShiftLeft", "ShiftRight"];
    const jumps = adapter7 ? ["KeyK", "KeyX", ...boxhead ? ["KeyQ", "KeyE"] : [], ...tank || bomb2 ? ["KeyJ", "ShiftLeft", "ShiftRight"] : []] : ["KeyW", "ArrowUp"];
    let sound3 = localStorage.getItem("arcade_native_sound") !== "off";
    let volume2 = Math.max(0, Math.min(100, Number(localStorage.getItem("arcade_native_volume") ?? 24)));
    if (!Number.isFinite(volume2)) volume2 = 24;
    let heard = null;
    const sounds = { whoosh: "badminton-whoosh", hit: "badminton-hit", score: "badminton-score", cheer: "badminton-cheer" };
    document.title = `${title} \xB7 \u5728\u7EBF\u8054\u673A - ArcadeOnline`;
    document.body.classList.toggle("badminton-page", badminton);
    el("game-title").textContent = title;
    el("room-name").textContent = room2;
    el("my-name").textContent = arcadeName();
    localStorage.setItem("arcade_recent_game", gameId);
    if (badminton) {
      el("battle-records").hidden = true;
      el("round-options").hidden = true;
      el("seat-3").hidden = true;
      el("seat-4").hidden = true;
      el("weapon-status").hidden = true;
      el("controls-guide").textContent = "A/D \u6216 \u2190/\u2192 \u79FB\u52A8\uFF0CW/\u2191 \u8DF3\u8DC3\uFF0CS/\u2193 \u53D1\u7403\u548C\u6325\u62CD\u3002\u5148\u5F97 7 \u5206\u83B7\u80DC\u3002";
      el("mode-note").textContent = "\u4E24\u4EBA\u5165\u5EA7\u5E76\u51C6\u5907\u540E\u5F00\u59CB\u3002\u6BD4\u8D5B\u7ED3\u675F 3 \u79D2\u540E\u81EA\u52A8\u5F00\u4E0B\u4E00\u5C40\uFF1B\u53D6\u6D88\u51C6\u5907\u53EF\u9000\u51FA\u4E0B\u4E00\u5C40\u3002";
      el("attack-button-text").textContent = "\u53D1\u7403 / \u6325\u62CD";
      el("attack-button").dataset.key = "KeyS";
      el("touch-down").hidden = true;
      el("touch-up").setAttribute("aria-label", "\u8DF3\u8DC3");
    }
    if (adapter7) {
      canvas.width = adapter7.width;
      canvas.height = adapter7.height;
      el("battle-records").hidden = !recordsEnabled;
      el("weapon-status").hidden = true;
      el("records-note").textContent = adapter7.id === "50737-server" ? "\u539F\u7248\u6301\u7EED\u751F\u5B58\uFF1A\u8BB0\u5F55\u51FB\u6740\u4E0E\u5012\u5730\u6B21\u6570\uFF1B\u961F\u4F0D\u5168\u706D\u7ED3\u675F\u3002" : "\u6309\u9020\u6210\u51FB\u6740\u7684\u73A9\u5BB6\u8BA1\u5206\uFF1B\u81EA\u6740\u53EA\u8BA1\u6B7B\u4EA1\uFF0C\u6362\u5EA7\u4E0E\u7EED\u5C40\u4FDD\u7559\u6218\u7EE9\u3002";
      el("controls-guide").textContent = adapter7.controls;
      el("mode-note").textContent = "\u81F3\u5C11\u4E24\u4EBA\u5165\u5EA7\uFF0C\u5168\u5458\u51C6\u5907\u5F00\u5C40\uFF1B\u7ED3\u675F\u540E\u81EA\u52A8\u7EE7\u7EED\u4E0B\u4E00\u5C40\u3002";
      el("attack-button-text").textContent = "\u653B\u51FB / \u64CD\u4F5C";
      el("alt-button").hidden = !(tank || bomb2 || shooters);
      el("alt-button").textContent = tank ? "\u526F\u64CD\u4F5C" : bomb2 ? "\u6B66\u5668" : adapter7.id === "50737-server" ? "\u6362\u6B66\u5668" : "\u624B\u96F7";
      for (let number = adapter7.seats + 1; number <= 4; number++) el(`seat-${number}`).hidden = true;
      el("round-options").hidden = !adapter7.maps?.length;
      el("game-loadout").parentElement.hidden = true;
      el("sound-toggle").parentElement.hidden = !adapter7.setSound;
    }
    canvas.style.setProperty("--game-aspect", String(canvas.width / canvas.height));
    const mapSelect = el("game-map");
    const modeSelect = el("game-mode");
    const characterSelect = el("game-character"), difficultySelect = el("game-difficulty");
    const bombSettings = gameId === "3881-server" || gameId === "9109-server";
    characterSelect.parentElement.hidden = !bombSettings;
    difficultySelect.parentElement.hidden = !bombSettings;
    if (adapter7?.modes) {
      modeSelect.parentElement.hidden = false;
      for (const mode of adapter7.modes) {
        const option = document.createElement("option");
        option.value = mode.id;
        option.textContent = mode.label;
        modeSelect.append(option);
      }
    }
    for (const map of adapter7?.maps || ORIGINAL_MAPS) {
      const option = document.createElement("option");
      option.value = map.id;
      option.textContent = map.label;
      mapSelect.append(option);
    }
    function notice(message) {
      el("connection-note").textContent = message;
    }
    function clearInput() {
      if (boxhead && actions.some((code) => keys.has(code))) cancelledAttack = bomb;
      keys.clear();
      held = null;
      presentation.clearPrediction();
    }
    function resetRound(next) {
      round = next;
      seq = 0;
      bomb = 0;
      jump = 0;
      hit4 = 0;
      lastHitAt = 0;
      selectedWeapon = void 0;
      cancelledAttack = 0;
      clearInput();
    }
    function alignCounters(state) {
      if (!seat) return;
      seq = Math.max(seq, state.ack[seat - 1]);
      const player = "gameId" in state ? state.players.find((player2) => player2.seat === seat) : state.players[seat - 1];
      if (!player) return;
      if ("gameId" in state) {
        bomb = Math.max(bomb, player.lastAttack || 0);
        jump = Math.max(jump, player.lastAlt || 0);
      } else if (isBomb(state)) bomb = Math.max(bomb, player.lastBomb);
      else {
        jump = Math.max(jump, player.lastJump);
        hit4 = Math.max(hit4, player.lastHit);
      }
    }
    net.onRoom = () => {
      if (seat !== net.seat) {
        seat = net.seat;
        clearInput();
        if (net.authority) alignCounters(net.authority);
      }
      updateUi();
    };
    net.onStatus = (message) => {
      notice(message);
      if (!net.connected) clearInput();
      updateUi();
    };
    net.onSnapshot = (state, time, receivedAt) => {
      if (round !== state.round) {
        resetRound(state.round);
        notice(state.phase === "playing" ? "\u6BD4\u8D5B\u8FDB\u884C\u4E2D" : state.phase === "finished" ? "\u672C\u5C40\u7ED3\u675F" : "\u540C\u6B65\u5B8C\u6210\uFF0C\u5165\u5EA7\u5E76\u51C6\u5907\u5373\u53EF\u5F00\u59CB");
      }
      alignCounters(state);
      presentation.receive(state, time, receivedAt);
    };
    function play(name) {
      if (!sound3 || volume2 <= 0) return;
      const audio2 = new Audio(`/authority/assets/${sounds[name]}.mp3`);
      audio2.volume = volume2 / 100;
      void audio2.play().catch(() => {
      });
    }
    function confirm2(state) {
      if (state.round === confirmedRound && state.tick === confirmedTick) return;
      confirmedRound = state.round;
      confirmedTick = state.tick;
      if ("gameId" in state) {
        adapter7?.confirm?.(state);
        return;
      }
      if (isBomb(state)) bombView.confirm(state);
      else {
        const next = { round: state.round, score: state.score.join(":"), hitter: state.birdie.lastHitter, winner: state.winner };
        if (heard?.round === state.round) {
          if (next.score !== heard.score) play("score");
          else if (next.hitter && next.hitter !== heard.hitter) play("hit");
          if (next.winner && next.winner !== heard.winner) play("cheer");
        }
        heard = next;
      }
    }
    function currentInput(now) {
      if (adapter7 && !boxhead && (shooters || tank) && actions.some((code) => keys.has(code)) && now - lastHitAt >= 1e3 / hz) {
        bomb++;
        lastHitAt = now;
      }
      if (adapter7) return {
        seq: ++seq,
        left: keys.has("KeyA") || keys.has("ArrowLeft"),
        right: keys.has("KeyD") || keys.has("ArrowRight"),
        up: keys.has("KeyW") || keys.has("ArrowUp"),
        down: keys.has("KeyS") || keys.has("ArrowDown"),
        attack: bomb,
        alt: jump,
        ...boxhead ? { trigger: actions.some((code) => keys.has(code)), cancelledAttack, weaponStep, ...selectedWeapon !== void 0 ? { weapon: selectedWeapon } : {} } : {}
      };
      if (badminton) {
        if (actions.some((code) => keys.has(code)) && now - lastHitAt >= 500) {
          hit4++;
          lastHitAt = now;
        }
        return { seq: ++seq, left: keys.has("KeyA") || keys.has("ArrowLeft"), right: keys.has("KeyD") || keys.has("ArrowRight"), jump, hit: hit4 };
      }
      let dir = -1, time = -1;
      for (const [code, at] of keys) if (bombDirections[code] !== void 0 && at >= time) {
        dir = bombDirections[code];
        time = at;
      }
      return { seq: ++seq, dir, bomb, special: 0 };
    }
    const timer = window.setInterval(() => {
      if (!inputEnabled || !net.connected || !seat || net.authority?.phase !== "playing") return;
      const now = performance.now();
      held = currentInput(now);
      if (net.control({ t: "authInput", round, input: held, serverTime: net.serverNow(now) })) presentation.input(held, now);
    }, 1e3 / hz);
    function press(code, down) {
      if (!down) {
        keys.delete(code);
        return;
      }
      if (!seat || net.authority?.phase !== "playing" || keys.has(code)) return;
      const now = performance.now();
      keys.set(code, now);
      inputAt = now;
      if (actions.includes(code)) {
        if (badminton) {
          hit4++;
          lastHitAt = now;
          play("whoosh");
        } else {
          bomb++;
          lastHitAt = now;
        }
      }
      if ((badminton || adapter7) && jumps.includes(code)) {
        jump++;
        selectedWeapon = void 0;
        weaponStep = code === "KeyQ" ? -1 : 1;
      }
      if (adapter7?.id === "50737-server" && /^Digit[0-9]$/.test(code)) {
        selectedWeapon = (Number(code.slice(-1)) + 9) % 10;
        jump++;
      }
    }
    function keyboard(event, down) {
      if (event.target?.matches("input, textarea, select, button")) return;
      if (bombDirections[event.code] === void 0 && !actions.includes(event.code) && !jumps.includes(event.code) && !(adapter7?.id === "50737-server" && /^Digit[0-9]$/.test(event.code))) return;
      event.preventDefault();
      press(event.code, down);
    }
    window.addEventListener("keydown", (event) => keyboard(event, true));
    window.addEventListener("keyup", (event) => keyboard(event, false));
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", () => {
      clearInput();
      if (!document.hidden) net.requestFull();
    });
    for (const button of document.querySelectorAll("[data-key]")) {
      button.onpointerdown = (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        press(button.dataset.key, true);
      };
      const release = () => {
        press(button.dataset.key, false);
        button.blur();
      };
      button.onpointerup = release;
      button.onpointercancel = release;
      button.onlostpointercapture = release;
    }
    for (const button of document.querySelectorAll("[data-seat]")) button.onclick = () => {
      const requested = Number(button.dataset.seat);
      net.control(seat === requested ? { t: "leaveSeat" } : { t: "sit", seat: requested });
      button.blur();
    };
    function toggleReady(autoSit = false) {
      if (!net.connected) return;
      if (seat) {
        const mine = net.room.members.find((member) => member.id === net.id);
        net.control({ t: "ready", ready: !mine?.ready });
      } else if (autoSit) {
        const available = Object.keys(net.room.seats).map(Number).find((number) => !net.room.seats[number]);
        if (!available) return;
        net.control({ t: "sit", seat: available });
        net.control({ t: "ready", ready: true });
      }
      canvas.focus({ preventScroll: true });
    }
    el("start-game").onclick = () => toggleReady();
    el("fullscreen-ready").onclick = () => toggleReady(true);
    for (const key of ["map", "mode", "loadout", "difficulty"]) el(`game-${key}`).onchange = () => {
      if (net.isController) net.control({ t: "authOptions", map: mapSelect.value, ...adapter7?.modes ? { gameMode: modeSelect.value } : {}, ...bombSettings ? { difficulty: difficultySelect.value } : {}, loadout: el("game-loadout").value });
    };
    characterSelect.onchange = () => {
      net.control({ t: "authCharacter", character: Number(characterSelect.value) });
      characterSelect.blur();
    };
    el("copy-invite").onclick = async () => {
      const invite = new URL(location.href);
      invite.searchParams.delete("debug");
      try {
        await navigator.clipboard.writeText(invite.href);
        notice("\u9080\u8BF7\u94FE\u63A5\u5DF2\u590D\u5236");
      } catch {
        const field = el("invite-link");
        field.hidden = false;
        field.value = invite.href;
        field.select();
        notice("\u590D\u5236\u4E0B\u65B9\u94FE\u63A5\u5373\u53EF\u9080\u8BF7\u597D\u53CB");
      }
    };
    el("leave-room").onclick = (event) => {
      event.preventDefault();
      net.control({ t: "leave" });
      net.close();
      location.href = "/";
    };
    function soundUi() {
      el("sound-toggle").textContent = sound3 ? "\u97F3\u6548\uFF1A\u5F00" : "\u97F3\u6548\uFF1A\u5173";
      el("sound-toggle").setAttribute("aria-pressed", String(sound3));
      el("sound-volume").value = String(volume2);
      el("sound-volume-value").textContent = `${volume2}%`;
      bombView?.setSound(sound3);
      bombView?.setVolume(volume2 / 100);
      adapter7?.setSound?.(sound3);
      adapter7?.setVolume?.(volume2 / 100);
    }
    el("sound-toggle").onclick = () => {
      sound3 = !sound3;
      localStorage.setItem("arcade_native_sound", sound3 ? "on" : "off");
      soundUi();
      el("sound-toggle").blur();
    };
    el("sound-volume").oninput = (event) => {
      volume2 = Number(event.target.value);
      localStorage.setItem("arcade_native_volume", String(volume2));
      soundUi();
    };
    soundUi();
    const fullscreen = el("fullscreen-room");
    function fullscreenUi() {
      const active = !!document.fullscreenElement || fullscreen.classList.contains("fullscreen-fallback");
      document.documentElement.classList.toggle("game-fullscreen", active);
      document.body.classList.toggle("game-fullscreen", active);
      el("fullscreen-stage").textContent = active ? "\u9000\u51FA\u5168\u5C4F" : "\u5168\u5C4F";
      clearInput();
      canvas.focus({ preventScroll: true });
    }
    async function exitFullscreen() {
      if (document.fullscreenElement) await document.exitFullscreen();
      fullscreen.classList.remove("fullscreen-fallback");
      fullscreenUi();
    }
    el("fullscreen-stage").onclick = async () => {
      if (document.fullscreenElement || fullscreen.classList.contains("fullscreen-fallback")) {
        await exitFullscreen();
        return;
      }
      try {
        await fullscreen.requestFullscreen();
      } catch {
        fullscreen.classList.add("fullscreen-fallback");
      }
      fullscreenUi();
    };
    el("exit-fullscreen").onclick = exitFullscreen;
    document.addEventListener("fullscreenchange", fullscreenUi);
    window.addEventListener("keydown", (event) => {
      if (event.code === "Escape" && fullscreen.classList.contains("fullscreen-fallback")) void exitFullscreen();
    });
    function updateUi() {
      const state = net.authority, mine = net.room.members.find((member) => member.id === net.id);
      el("conn-badge").textContent = net.connected ? "\u5DF2\u8FDE\u63A5" : "\u8FDE\u63A5\u4E2D";
      el("role-status").textContent = seat ? `P${seat}` : "\u89C2\u6218";
      el("transport-status").textContent = "\u670D\u52A1\u5668\u8FDE\u63A5";
      el("latency-status").textContent = net.rtt ? `${Math.round(net.rtt)} ms` : "\u91C7\u6837\u4E2D";
      el("render-status").textContent = `${bombView?.fps ?? badmintonView?.fps ?? adapterFps} FPS`;
      el("member-count").textContent = `${net.room.members.length} \u4EBA`;
      el("host-line").textContent = adapter7 ? net.isController ? `\u4F60\u53EF\u4EE5\u9009\u62E9\u4E0B\u4E00\u5C40\u7684${adapter7.modes ? "\u6A21\u5F0F\u548C" : ""}\u5730\u56FE` : `\u623F\u95F4\u7BA1\u7406\u8005\u53EF\u9009\u62E9${adapter7.modes ? "\u6A21\u5F0F\u548C" : ""}\u5730\u56FE` : net.isController ? "\u4F60\u53EF\u4EE5\u9009\u62E9\u4E0B\u4E00\u5C40\u7684\u5730\u56FE\u548C\u5F00\u5C40\u6B66\u5668" : "\u623F\u95F4\u7BA1\u7406\u8005\u53EF\u9009\u62E9\u5730\u56FE\u548C\u5F00\u5C40\u6B66\u5668";
      for (let number = 1; number <= (adapter7?.seats || (badminton ? 2 : 4)); number++) {
        const row = el(`seat-${number}`), member = net.room.members.find((member2) => member2.seat === number);
        row.querySelector(".who").textContent = member ? `${member.name}${member.id === net.id ? "\uFF08\u4F60\uFF09" : ""} \xB7 ${member.ready ? "\u5DF2\u51C6\u5907" : "\u672A\u51C6\u5907"}` : "\u7A7A\u95F2";
        const button = row.querySelector("button");
        button.textContent = seat === number ? "\u79BB\u5EA7" : "\u5165\u5EA7";
        button.disabled = !net.connected || !!member && member.id !== net.id;
        row.classList.toggle("mine", seat === number);
        row.classList.toggle("ready", !!member?.ready);
      }
      const ready2 = el("start-game");
      ready2.disabled = !net.connected || !seat;
      if (recordsEnabled) {
        const body2 = el("records-body");
        body2.replaceChildren();
        const records = net.room.auth?.records || [];
        if (!records.length) {
          const row = document.createElement("tr"), cell = document.createElement("td");
          cell.setAttribute("colspan", "5");
          cell.textContent = "\u5F00\u5C40\u540E\u5F00\u59CB\u7EDF\u8BA1";
          row.append(cell);
          body2.append(row);
        }
        for (const record of records) {
          const row = document.createElement("tr");
          row.classList.toggle("mine", record.id === net.id);
          const name = `${record.name}${record.id === net.id ? "\uFF08\u4F60\uFF09" : ""}${net.room.members.some((member) => member.id === record.id) ? "" : " \xB7 \u5DF2\u79BB\u5F00"}`;
          for (const value of [name, record.kills, record.deaths, record.wins, record.rounds]) {
            const cell = document.createElement("td");
            cell.textContent = String(value);
            row.append(cell);
          }
          body2.append(row);
        }
      }
      ready2.textContent = mine?.ready ? "\u53D6\u6D88\u51C6\u5907" : "\u51C6\u5907";
      ready2.setAttribute("aria-pressed", String(!!mine?.ready));
      const fullscreenReady = el("fullscreen-ready");
      const hasOpenSeat = Object.values(net.room.seats).some((id) => !id);
      fullscreenReady.disabled = !net.connected || !seat && !hasOpenSeat;
      fullscreenReady.textContent = seat ? ready2.textContent : hasOpenSeat ? "\u5165\u5EA7\u5E76\u51C6\u5907" : "\u5E2D\u4F4D\u5DF2\u6EE1";
      fullscreenReady.setAttribute("aria-pressed", String(!!mine?.ready));
      if (state && isBomb(state)) {
        mapSelect.value = state.options.map;
        el("game-loadout").value = state.options.loadout;
        const player = seat ? state.players[seat - 1] : null;
        el("weapon-status").textContent = player?.weapon && player.ammo > 0 ? `${ITEM_LABELS[player.weapon]} \xB7 ${player.ammo} \u53D1` : "\u7A7A\u683C / \u56DE\u8F66 \u653E\u70B8\u5F39";
        el("attack-button-text").textContent = player?.weapon && player.ammo > 0 ? ITEM_LABELS[player.weapon] : "\u653E\u70B8\u5F39";
      }
      if (adapter7 && net.room.auth?.options?.map) mapSelect.value = net.room.auth.options.map;
      if (adapter7?.modes) {
        modeSelect.value = net.room.auth?.options?.gameMode || adapter7.modes[0].id;
        const mode = adapter7.modes.find((item) => item.id === modeSelect.value);
        el("mode-note").textContent = `${mode?.description || ""} \u81F3\u5C11\u4E24\u4EBA\u5165\u5EA7\uFF0C\u5168\u5458\u51C6\u5907\u5F00\u5C40\uFF1B\u7ED3\u675F 3 \u79D2\u540E\u81EA\u52A8\u7EED\u5C40\u3002`;
        const playingKill = bomb2 && state && "gameId" in state && state.mode === "kill";
        el("attack-button-text").textContent = playingKill ? "\u4F7F\u7528\u6B66\u5668" : "\u653E\u70B8\u5F39";
        el("controls-guide").textContent = playingKill ? "\u65B9\u5411\u952E / WASD \u79FB\u52A8\uFF1B\u7A7A\u683C / J / Shift \u4F7F\u7528\u5F53\u524D\u6B66\u5668\uFF1B\u57FA\u7840\u9524\u5B50\u53EF\u53CD\u590D\u4F7F\u7528\u3002" : adapter7.controls;
        const player = bomb2 && state && "gameId" in state ? state.players.find((p) => p.seat === seat) : null;
        if (player) {
          el("weapon-status").hidden = false;
          el("weapon-status").textContent = weaponLabel(state, player);
        } else el("weapon-status").hidden = true;
        if (bomb2 && state && "gameId" in state) el("score-line").textContent = state.mode === "kill" ? state.players.map((p) => `P${p.seat} ${p.points}/10 \u5206${p.points >= 8 ? " \xB7 \u5373\u5C06\u83B7\u80DC" : ""}`).join("\u3000") : "";
      }
      mapSelect.disabled = !net.isController || state?.phase === "playing";
      modeSelect.disabled = mapSelect.disabled;
      el("game-loadout").disabled = mapSelect.disabled;
      difficultySelect.disabled = mapSelect.disabled;
      if (bombSettings) {
        const people = state?.players || [];
        const me = people.find((p) => p.seat === seat);
        if (me?.character) characterSelect.value = String(me.character);
        characterSelect.disabled = !seat || state?.phase === "playing";
        for (const option of characterSelect.options) option.disabled = people.some((p) => p.seat !== seat && net.room.members.some((m) => m.seat === p.seat) && p.character === Number(option.value));
        difficultySelect.value = net.room.auth?.options?.difficulty || "normal";
        if (bomb2 && state && "gameId" in state) {
          const p = state.players.find((p2) => p2.seat === seat);
          el("attack-button-text").textContent = p && (p.weapon || p.attack || state.mode === "kill" || state.bombs.some((b) => b.owner === seat && b.kind === "remote")) ? "\u4F7F\u7528\u6B66\u5668" : "\u653E\u70B8\u5F39";
        }
      }
      const nextAt = net.room.auth?.nextRoundAt;
      if (!net.connected) el("round-status").textContent = "\u8FDE\u63A5\u4E2D";
      else if (state?.phase === "playing") el("round-status").textContent = "\u6BD4\u8D5B\u8FDB\u884C\u4E2D";
      else if (state?.phase === "finished" && nextAt) el("round-status").textContent = `${Math.max(0, Math.ceil((nextAt - net.serverNow()) / 1e3))} \u79D2\u540E\u5F00\u59CB\u4E0B\u4E00\u5C40`;
      else el("round-status").textContent = "\u5165\u5EA7\u5E76\u51C6\u5907\u540E\u81EA\u52A8\u5F00\u59CB";
      if (badminton && state && !isBomb(state)) el("score-line").textContent = `P1 ${state.score[0]} : ${state.score[1]} P2`;
      el("metrics-age").textContent = Number.isFinite(net.snapshotAge) ? `${Math.round(net.snapshotAge)} ms` : "\u7B49\u5F85\u540C\u6B65";
      el("metrics-bandwidth").textContent = `${Math.round(net.receivedBytes / 1024)} KB \u6536 / ${Math.round(net.sentBytes / 1024)} KB \u53D1`;
      el("metrics-predict").textContent = responseMs ? `${Math.round(responseMs)} ms` : "\u64CD\u4F5C\u540E\u91C7\u6837";
    }
    function render6(now) {
      adapterFrames++;
      if (now - fpsAt >= 1e3) {
        adapterFps = Math.round(adapterFrames * 1e3 / (now - fpsAt));
        adapterFrames = 0;
        fpsAt = now;
      }
      const gap = now - lastFrameAt;
      lastFrameAt = now;
      maxFrameMs = Math.max(maxFrameMs, gap);
      if (gap > 350) {
        presentation.clearPrediction();
        net.requestFull();
      }
      const state = presentation.render(now, net.serverNow(now), seat, held, hz);
      if (net.authority) confirm2(net.authority);
      if (adapter7) adapter7.render(canvas, state, seat);
      else if (badminton) badmintonView.render(state, seat);
      else bombView.render(state && isBomb(state) ? state : null, seat);
      nameplates.render(state, canvas, net.room.members, seat);
      if (inputAt && presentation.predictionSteps > 0) {
        responseMs = now - inputAt;
        inputAt = 0;
      }
      if (now - uiAt >= 150) {
        uiAt = now;
        updateUi();
      }
      requestAnimationFrame(render6);
    }
    if (params.get("debug") === "1") Object.assign(window, { __authorityTest: {
      network: net,
      client: net,
      presentation,
      get authority() {
        return net.authority;
      },
      get state() {
        return presentation.state;
      },
      get seat() {
        return seat;
      },
      get transport() {
        return net.transport;
      },
      get hash() {
        return net.authority ? hashState(net.authority) : null;
      },
      get maxFrameMs() {
        return maxFrameMs;
      },
      get predictionMs() {
        return PREDICTION_MS;
      },
      get interpolationMs() {
        return INTERPOLATION_MS;
      },
      get inputEnabled() {
        return inputEnabled;
      },
      set inputEnabled(value) {
        inputEnabled = value;
        clearInput();
      },
      resync: () => net.requestFull(),
      input: (code, down) => press(code, down),
      clearInput,
      snapshot: () => net.authority ? JSON.parse(JSON.stringify(net.authority)) : null
    } });
    window.addEventListener("pagehide", () => {
      window.clearInterval(timer);
      net.close();
    });
    updateUi();
    net.start();
    requestAnimationFrame(render6);
  }
})();
