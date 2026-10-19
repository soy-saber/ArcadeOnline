"use strict";
(() => {
  // src/native/core.ts
  var HZ = 35;
  var STEP_MS = 1e3 / HZ;
  var WIDTH = 15;
  var HEIGHT = 13;
  var FUSE_TICKS = 60;
  var ROUND_TICKS = HZ * 180;
  var WEAPONS = ["rocket", "mine", "grenade", "gas", "ice", "fire"];
  var ITEM_LABELS = { bomb: "\u70B8\u5F39\u7CD6", range: "\u5A01\u529B\u836F", speed: "\u98DE\u978B", shield: "\u76FE\u724C", life: "\u751F\u547D", push: "\u63A8\u5F39\u624B\u5957", rocket: "\u706B\u7BAD", mine: "\u5730\u96F7", grenade: "\u624B\u69B4\u5F39", gas: "\u6C7D\u5F39", ice: "\u51B0\u7BAD", fire: "\u706B\u7130\u7BAD" };
  var DEFAULT_OPTIONS = { mode: "duel", map: "classic", loadout: "none", bots: [] };
  var EMPTY_INPUT = { seq: 0, dir: -1, bomb: 0, special: 0 };
  var DIRECTIONS = [[-1, 0], [0, -1], [1, 0], [0, 1]];
  var index = (x, y) => y * WIDTH + x;
  var cloneState = (state) => JSON.parse(JSON.stringify(state));
  function random(state) {
    let x = state.rng | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    state.rng = x >>> 0;
    return state.rng / 4294967296;
  }
  function createGame(seed, round = 1, playing = true, options = {}) {
    const config = { ...DEFAULT_OPTIONS, ...options, bots: [...options.bots || []] };
    if (config.mode === "coop") config.bots = [.../* @__PURE__ */ new Set([...config.bots, 3, 4])];
    const count = config.mode === "coop" ? 4 : 2;
    const state = {
      version: 2,
      round,
      tick: 0,
      rng: seed >>> 0 || 1,
      nextBomb: 1,
      options: config,
      phase: playing ? "playing" : "waiting",
      winner: null,
      board: Array(WIDTH * HEIGHT).fill(0),
      items: Array(WIDTH * HEIGHT).fill(null),
      flames: Array(WIDTH * HEIGHT).fill(0),
      ice: Array(WIDTH * HEIGHT).fill(0),
      bombs: [],
      specials: [],
      ack: Array(count).fill(0),
      inputs: Array.from({ length: count }, () => ({ ...EMPTY_INPUT })),
      players: []
    };
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      const pillar = config.map === "open" ? x % 4 === 0 && y % 4 === 0 : config.map === "lanes" ? x % 4 === 0 && y % 3 !== 1 : x % 2 === 0 && y % 2 === 0;
      const wall = x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1 || pillar;
      state.board[index(x, y)] = wall ? 1 : random(state) < (config.map === "open" ? 0.4 : 0.6) ? 2 : 0;
    }
    for (const [seat, x, y] of [[1, 1, 1], [2, WIDTH - 2, HEIGHT - 2], [3, WIDTH - 2, 1], [4, 1, HEIGHT - 2]].slice(0, count)) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (x + dx > 0 && x + dx < WIDTH - 1 && y + dy > 0 && y + dy < HEIGHT - 1 && Math.abs(dx) + Math.abs(dy) <= 1) {
          state.board[index(x + dx, y + dy)] = 0;
        }
      }
      state.players.push({
        seat,
        x,
        y,
        dir: 3,
        moveDir: -1,
        progress: 0,
        speed: 6,
        alive: true,
        capacity: 1,
        range: 1,
        shield: false,
        invulnerable: 0,
        lastBomb: 0,
        life: 1,
        push: false,
        weapon: config.loadout === "none" ? null : config.loadout,
        ammo: config.loadout === "none" ? 0 : config.loadout === "ice" ? 1 : 2,
        lastSpecial: 0,
        slow: 0,
        frozen: 0,
        moveTicks: 6,
        diedAt: 0
      });
    }
    return state;
  }
  function position(player) {
    const delta = player.moveDir < 0 ? [0, 0] : DIRECTIONS[player.moveDir];
    return {
      x: player.x + delta[0] * player.progress / player.moveTicks,
      y: player.y + delta[1] * player.progress / player.moveTicks
    };
  }
  function takeItem(state, player) {
    const cell = index(player.x, player.y);
    switch (state.items[cell]) {
      case "bomb":
        player.capacity = Math.min(8, player.capacity + 1);
        break;
      case "range":
        player.range = Math.min(10, player.range + 1);
        break;
      case "speed":
        player.speed = Math.max(3, player.speed - 1);
        break;
      case "shield":
        player.shield = true;
        break;
      case "life":
        player.life = Math.min(5, player.life + 1);
        break;
      case "push":
        player.push = true;
        break;
      default: {
        const item = state.items[cell];
        if (item && WEAPONS.includes(item)) {
          player.weapon = item;
          player.ammo = item === "ice" ? 1 : 2;
        }
      }
    }
    state.items[cell] = null;
  }
  function placeBomb(state, player) {
    if (state.bombs.filter((bomb) => bomb.owner === player.seat).length >= player.capacity) return;
    if (state.bombs.some((bomb) => bomb.x === player.x && bomb.y === player.y)) return;
    state.bombs.push({
      id: state.nextBomb++,
      x: player.x,
      y: player.y,
      owner: player.seat,
      range: player.range,
      explodeAt: state.tick + FUSE_TICKS
    });
  }
  function breakCrate(state, cell) {
    if (state.board[cell] !== 2) return;
    state.board[cell] = 0;
    if (random(state) >= 0.65) return;
    if (random(state) >= 0.8) state.items[cell] = WEAPONS[Math.floor(random(state) * WEAPONS.length)];
    else {
      const roll = random(state);
      state.items[cell] = roll < 0.01 ? "life" : roll < 0.15 ? "push" : roll < 0.4 ? "bomb" : roll < 0.5 ? "shield" : roll < 0.75 ? "range" : "speed";
    }
  }
  var inside = (x, y) => x > 0 && x < WIDTH - 1 && y > 0 && y < HEIGHT - 1;
  function passable(state, x, y) {
    return inside(x, y) && state.board[index(x, y)] === 0 && state.ice[index(x, y)] <= state.tick && !state.bombs.some((bomb) => bomb.x === x && bomb.y === y);
  }
  function ignite(state, x, y, until = state.tick + 12) {
    if (!inside(x, y) || state.board[index(x, y)] === 1) return;
    const cell = index(x, y);
    state.flames[cell] = Math.max(state.flames[cell], until);
    state.ice[cell] = 0;
    breakCrate(state, cell);
  }
  function explodeBombs(state) {
    const queue = state.bombs.filter((bomb) => bomb.explodeAt <= state.tick || state.flames[index(bomb.x, bomb.y)] > state.tick);
    const exploded = /* @__PURE__ */ new Set();
    const flame = (x, y) => {
      ignite(state, x, y);
      const other = state.bombs.find((bomb) => bomb.x === x && bomb.y === y && !exploded.has(bomb.id));
      if (other) queue.push(other);
    };
    for (let i = 0; i < queue.length; i++) {
      const bomb = queue[i];
      if (exploded.has(bomb.id)) continue;
      exploded.add(bomb.id);
      flame(bomb.x, bomb.y);
      for (const [dx, dy] of DIRECTIONS) for (let distance = 1; distance <= bomb.range; distance++) {
        const x = bomb.x + dx * distance, y = bomb.y + dy * distance;
        if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) break;
        const cell = index(x, y);
        if (state.board[cell] === 1) break;
        const crate = state.board[cell] === 2;
        flame(x, y);
        if (crate) break;
      }
    }
    state.bombs = state.bombs.filter((bomb) => !exploded.has(bomb.id));
  }
  function useSpecial(state, player) {
    if (!player.weapon || player.ammo <= 0 || player.moveDir >= 0 || state.specials.length >= 64 || state.bombs.some((bomb) => bomb.x === player.x && bomb.y === player.y)) return;
    const kind = player.weapon, dir = Math.max(0, player.dir);
    const [dx, dy] = DIRECTIONS[dir];
    if (kind === "grenade" && (!inside(player.x + dx * 2, player.y + dy * 2) || state.board[index(player.x + dx * 2, player.y + dy * 2)] === 1)) return;
    if (kind === "ice" && !passable(state, player.x + dx, player.y + dy)) return;
    if (kind === "fire" && (!inside(player.x + dx, player.y + dy) || state.board[index(player.x + dx, player.y + dy)] === 1)) return;
    if (state.specials.some((s) => s.kind === kind && s.x === player.x && s.y === player.y)) return;
    state.specials.push({
      id: state.nextBomb++,
      kind,
      owner: player.seat,
      x: player.x,
      y: player.y,
      dir,
      born: state.tick,
      until: state.tick + (kind === "grenade" ? 18 : kind === "ice" || kind === "fire" ? 49 : kind === "rocket" ? HZ * 4 : ROUND_TICKS),
      distance: 0
    });
    player.ammo--;
    if (!player.ammo) player.weapon = null;
  }
  function updateSpecials(state) {
    for (const s of state.specials) {
      const age = state.tick - s.born, [dx, dy] = DIRECTIONS[Math.max(0, s.dir)];
      if (s.kind === "rocket") {
        const distance = Math.floor((age * (age + 1) / 2 + 15) / 30);
        while (s.distance < distance && s.until > state.tick) {
          const x = s.x + dx, y = s.y + dy;
          if (!inside(x, y) || state.board[index(x, y)] === 1) {
            ignite(state, s.x, s.y);
            s.until = state.tick;
            break;
          }
          s.x = x;
          s.y = y;
          s.distance++;
          if (state.board[index(x, y)] === 2 || state.bombs.some((b) => b.x === x && b.y === y) || state.players.some((p) => p.alive && p.seat !== s.owner && Math.hypot(position(p).x - x, position(p).y - y) < 0.6)) {
            ignite(state, x, y);
            s.until = state.tick;
          }
        }
        if (state.players.some((p) => p.alive && p.seat !== s.owner && Math.hypot(position(p).x - s.x, position(p).y - s.y) < 0.5)) {
          ignite(state, s.x, s.y);
          s.until = state.tick;
        }
      } else if (s.kind === "mine" || s.kind === "gas") {
        const victim = state.players.find((p) => p.alive && p.seat !== s.owner && Math.hypot(position(p).x - s.x, position(p).y - s.y) < 0.5);
        if (victim || state.flames[index(s.x, s.y)] > state.tick) {
          if (s.kind === "mine") ignite(state, s.x, s.y);
          else if (victim) victim.slow = 600;
          s.until = state.tick;
        }
      } else if (s.kind === "grenade" && state.tick >= s.until) {
        const x = s.x + dx * 2, y = s.y + dy * 2;
        ignite(state, x, y);
        for (const [a, b] of DIRECTIONS) ignite(state, x + a, y + b);
      } else if ((s.kind === "ice" || s.kind === "fire") && age > 0 && age <= 12 && age % 4 === 0 && s.distance < 3) {
        s.distance++;
        const x = s.x + dx * s.distance, y = s.y + dy * s.distance;
        if (!inside(x, y) || state.board[index(x, y)] === 1 || s.kind === "ice" && !passable(state, x, y)) {
          s.distance = 3;
          continue;
        }
        if (s.kind === "fire") ignite(state, x, y, s.until);
        else state.ice[index(x, y)] = s.until;
      }
    }
    state.specials = state.specials.filter((s) => s.until > state.tick);
  }
  function slideBombs(state) {
    for (const bomb of state.bombs) {
      if (bomb.slide === void 0 || bomb.slide < 0) continue;
      bomb.slideTick = (bomb.slideTick || 0) + 1;
      if (bomb.slideTick < 2) continue;
      bomb.slideTick = 0;
      const [dx, dy] = DIRECTIONS[bomb.slide];
      if (passable(state, bomb.x + dx, bomb.y + dy)) {
        bomb.x += dx;
        bomb.y += dy;
      } else {
        bomb.slide = -1;
        bomb.explodeAt = state.tick;
      }
    }
  }
  function bombCells(state, bomb) {
    const cells = [index(bomb.x, bomb.y)];
    for (const [dx, dy] of DIRECTIONS) for (let d = 1; d <= bomb.range; d++) {
      const x = bomb.x + dx * d, y = bomb.y + dy * d;
      if (!inside(x, y) || state.board[index(x, y)] === 1) break;
      cells.push(index(x, y));
      if (state.board[index(x, y)] === 2) break;
    }
    return cells;
  }
  function botInput(state, player) {
    const input = { seq: state.tick, dir: -1, bomb: player.lastBomb, special: player.lastSpecial };
    if (!player.alive || player.frozen || player.moveDir >= 0) return input;
    const danger = Array(WIDTH * HEIGHT).fill(Infinity);
    for (let i = 0; i < danger.length; i++) if (state.flames[i] > state.tick) danger[i] = state.tick;
    for (const bomb of state.bombs) for (const cell of bombCells(state, bomb)) danger[cell] = Math.min(danger[cell], state.tick + 18);
    for (const special of state.specials) {
      if (special.kind === "mine" && special.owner !== player.seat) danger[index(special.x, special.y)] = state.tick;
      const [dx2, dy2] = DIRECTIONS[Math.max(0, special.dir)];
      if (special.kind === "grenade") {
        const x = special.x + dx2 * 2, y = special.y + dy2 * 2;
        for (const [a, b] of [[0, 0], ...DIRECTIONS]) if (inside(x + a, y + b)) danger[index(x + a, y + b)] = special.until;
      }
      if (special.kind === "fire" || special.kind === "ice" || special.kind === "rocket") {
        for (let d = 0; d <= (special.kind === "rocket" ? WIDTH : 3); d++) {
          const x = special.x + dx2 * d, y = special.y + dy2 * d;
          if (!inside(x, y) || state.board[index(x, y)] === 1) break;
          danger[index(x, y)] = state.tick + 4;
        }
      }
    }
    const origin = index(player.x, player.y), offset = Math.floor(random(state) * 4);
    const search = (hazards, escape) => {
      const queue = [{ x: player.x, y: player.y, dir: -1, depth: 0 }], seen = /* @__PURE__ */ new Set([origin]);
      let best = -Infinity, chosen = -1;
      for (let n = 0; n < queue.length; n++) {
        const current = queue[n], cell = index(current.x, current.y);
        if (current.depth && hazards[cell] === Infinity) {
          if (escape) return current.dir;
          const crates = DIRECTIONS.filter(([dx2, dy2]) => state.board[index(current.x + dx2, current.y + dy2)] === 2).length;
          const enemies = state.players.filter((p) => p.alive && p.seat !== player.seat && (state.options.mode !== "coop" || p.seat <= 2 !== player.seat <= 2));
          const distance = Math.min(30, ...enemies.map((p) => Math.abs(p.x - current.x) + Math.abs(p.y - current.y)));
          const score = (state.items[cell] ? 18 : 0) + crates * 3 - current.depth * 0.7 - distance * 0.3;
          if (score > best) {
            best = score;
            chosen = current.dir;
          }
        }
        if (current.depth >= 12) continue;
        for (let d = 0; d < 4; d++) {
          const dir = (d + offset) % 4, [dx2, dy2] = DIRECTIONS[dir];
          const x = current.x + dx2, y = current.y + dy2, cell2 = index(x, y);
          const arrival = state.tick + (current.depth + 1) * (player.slow ? 20 : player.speed);
          if (!passable(state, x, y) || seen.has(cell2) || hazards[cell2] <= arrival) continue;
          seen.add(cell2);
          queue.push({ x, y, dir: current.dir === -1 ? dir : current.dir, depth: current.depth + 1 });
        }
      }
      return escape ? -1 : chosen;
    };
    if (danger[origin] !== Infinity) {
      input.dir = search(danger, true);
      return input;
    }
    const probe = { id: 0, x: player.x, y: player.y, owner: player.seat, range: player.range, explodeAt: state.tick + FUSE_TICKS };
    const blast = bombCells(state, probe);
    const useful = blast.some((c) => state.board[c] === 2 || state.players.some((p) => p.alive && p.seat !== player.seat && index(p.x, p.y) === c && (state.options.mode !== "coop" || p.seat <= 2 !== player.seat <= 2)));
    if (useful && !state.bombs.some((b) => b.x === player.x && b.y === player.y) && state.bombs.filter((b) => b.owner === player.seat).length < player.capacity) {
      const future = [...danger];
      for (const c of blast) future[c] = Math.min(future[c], probe.explodeAt);
      const escape = search(future, true);
      if (escape >= 0) {
        input.bomb++;
        input.dir = escape;
        return input;
      }
    }
    const [dx, dy] = DIRECTIONS[Math.max(0, player.dir)];
    if (player.weapon && state.tick % 35 === 0 && (player.weapon === "mine" || player.weapon === "gas" || state.players.some((p) => p.alive && p.seat !== player.seat && (state.options.mode !== "coop" || p.seat <= 2 !== player.seat <= 2) && (dx ? p.y === player.y && (p.x - player.x) * dx > 0 : p.x === player.x && (p.y - player.y) * dy > 0)))) input.special = player.lastSpecial + 1;
    input.dir = search(danger, false);
    return input;
  }
  function step(state, inputs) {
    if (state.phase !== "playing") return;
    state.tick++;
    const resolved = state.players.map((player, i) => state.options.bots.includes(player.seat) ? botInput(state, player) : inputs[i] || EMPTY_INPUT);
    slideBombs(state);
    for (let i = 0; i < state.players.length; i++) {
      const player = state.players[i];
      const raw = resolved[i];
      const input = { seq: raw.seq, dir: raw.dir, bomb: raw.bomb, special: raw.special || 0 };
      state.ack[i] = Math.max(state.ack[i], input.seq);
      state.inputs[i] = { ...input };
      if (!player.alive) continue;
      if (player.invulnerable > 0) player.invulnerable--;
      if (player.slow > 0) player.slow--;
      if (player.frozen > 0) {
        player.frozen--;
        player.lastBomb = Math.max(player.lastBomb, input.bomb);
        player.lastSpecial = Math.max(player.lastSpecial, input.special || 0);
        continue;
      }
      if ((input.special || 0) > player.lastSpecial && player.moveDir < 0) {
        player.lastSpecial = input.special;
        if (input.dir >= 0) player.dir = input.dir;
        useSpecial(state, player);
      }
      if (input.bomb > player.lastBomb) {
        player.lastBomb = input.bomb;
        placeBomb(state, player);
      }
      if (player.moveDir < 0 && input.dir >= 0) {
        player.dir = input.dir;
        const [dx, dy] = DIRECTIONS[input.dir];
        const x = player.x + dx, y = player.y + dy;
        const pushed = state.bombs.find((bomb) => bomb.x === x && bomb.y === y);
        if (pushed && player.push && passable(state, x + dx, y + dy)) {
          pushed.x += dx;
          pushed.y += dy;
          pushed.slide = input.dir;
          pushed.slideTick = 0;
        }
        if (passable(state, x, y)) {
          player.moveDir = input.dir;
          player.progress = 0;
          player.moveTicks = player.slow > 0 ? 20 : player.speed;
        }
      }
      if (player.moveDir >= 0 && ++player.progress >= player.moveTicks) {
        const [dx, dy] = DIRECTIONS[player.moveDir];
        player.x += dx;
        player.y += dy;
        player.moveDir = -1;
        player.progress = 0;
        takeItem(state, player);
      }
    }
    updateSpecials(state);
    explodeBombs(state);
    for (const s of state.specials) if ((s.kind === "mine" || s.kind === "gas") && state.flames[index(s.x, s.y)] > state.tick) {
      if (s.kind === "mine") ignite(state, s.x, s.y);
      s.until = state.tick;
    }
    state.specials = state.specials.filter((s) => s.until > state.tick);
    for (const player of state.players) {
      if (!player.alive) continue;
      const pos = position(player);
      if (state.ice[index(Math.round(pos.x), Math.round(pos.y))] > state.tick) player.frozen = 300;
      if (player.invulnerable > 0) continue;
      if (state.flames[index(Math.round(pos.x), Math.round(pos.y))] > state.tick) {
        player.frozen = 0;
        if (player.shield) {
          player.shield = false;
          player.invulnerable = 60;
        } else if (--player.life > 0) player.invulnerable = 60;
        else {
          player.alive = false;
          player.diedAt = state.tick;
        }
      }
    }
    const survivors = state.players.filter((player) => player.alive);
    const teams = new Set(survivors.map((p) => state.options.mode === "coop" ? p.seat <= 2 ? 1 : 3 : p.seat));
    if (teams.size < 2 || state.tick >= ROUND_TICKS) {
      state.phase = "finished";
      state.winner = teams.size === 1 ? [...teams][0] : 0;
    }
  }
  function validInput(value) {
    if (!value || typeof value !== "object") return false;
    const v = value;
    return Number.isSafeInteger(v.seq) && v.seq >= 0 && v.seq <= 1e9 && Number.isInteger(v.dir) && v.dir >= -1 && v.dir <= 3 && Number.isSafeInteger(v.bomb) && v.bomb >= 0 && v.bomb <= 1e9 && (v.special === void 0 || Number.isSafeInteger(v.special) && v.special >= 0 && v.special <= 1e9);
  }
  function validState(value) {
    if (!value || typeof value !== "object") return false;
    const s = value;
    const integer = (v, low, high) => Number.isInteger(v) && v >= low && v <= high;
    const o = s.options;
    if (!o || !["duel", "practice", "coop"].includes(o.mode) || !["classic", "lanes", "open"].includes(o.map) || !["none", ...WEAPONS].includes(o.loadout)) return false;
    const count = o.mode === "coop" ? 4 : 2;
    if (!Array.isArray(o.bots) || o.bots.length > count || new Set(o.bots).size !== o.bots.length || !o.bots.every((v) => integer(v, 1, count)) || o.mode === "duel" && o.bots.length > 0 || o.mode === "coop" && (!o.bots.includes(3) || !o.bots.includes(4))) return false;
    if (s.version !== 2 || !integer(s.round, 1, Number.MAX_SAFE_INTEGER) || !integer(s.tick, 0, ROUND_TICKS + 1) || !integer(s.rng, 0, 4294967295) || !integer(s.nextBomb, 1, 1e6) || !["waiting", "playing", "finished"].includes(s.phase) || !(s.winner === null || integer(s.winner, 0, count))) return false;
    if (!Array.isArray(s.board) || s.board.length !== WIDTH * HEIGHT || !s.board.every((v) => integer(v, 0, 2)) || !Array.isArray(s.flames) || s.flames.length !== WIDTH * HEIGHT || !s.flames.every((v) => integer(v, 0, ROUND_TICKS + 100)) || !Array.isArray(s.ice) || s.ice.length !== WIDTH * HEIGHT || !s.ice.every((v) => integer(v, 0, ROUND_TICKS + 100)) || !Array.isArray(s.items) || s.items.length !== WIDTH * HEIGHT || !s.items.every((v) => v === null || typeof v === "string" && Object.prototype.hasOwnProperty.call(ITEM_LABELS, v))) return false;
    if (!Array.isArray(s.players) || s.players.length !== count || !s.players.every((p, i) => p && p.seat === i + 1 && integer(p.x, 0, WIDTH - 1) && integer(p.y, 0, HEIGHT - 1) && integer(p.dir, -1, 3) && integer(p.moveDir, -1, 3) && integer(p.speed, 3, 6) && integer(p.moveTicks, 3, 20) && integer(p.progress, 0, p.moveTicks - 1) && integer(p.capacity, 1, 8) && integer(p.range, 1, 10) && integer(p.invulnerable, 0, 60) && integer(p.life, 0, 5) && typeof p.push === "boolean" && (p.weapon === null || WEAPONS.includes(p.weapon)) && integer(p.ammo, 0, 2) && integer(p.lastSpecial, 0, 1e9) && integer(p.slow, 0, 600) && integer(p.frozen, 0, 300) && integer(p.diedAt, 0, ROUND_TICKS) && integer(p.lastBomb, 0, 1e9) && typeof p.alive === "boolean" && typeof p.shield === "boolean")) return false;
    return Array.isArray(s.ack) && s.ack.length === count && s.ack.every((v) => integer(v, 0, 1e9)) && Array.isArray(s.inputs) && s.inputs.length === count && s.inputs.every(validInput) && Array.isArray(s.specials) && s.specials.length <= 64 && s.specials.every((v) => v && integer(v.id, 1, 1e6) && WEAPONS.includes(v.kind) && integer(v.owner, 1, count) && integer(v.x, 0, WIDTH - 1) && integer(v.y, 0, HEIGHT - 1) && integer(v.dir, 0, 3) && integer(v.born, 0, ROUND_TICKS) && integer(v.until, v.born, ROUND_TICKS * 2) && integer(v.distance, 0, 1e3)) && Array.isArray(s.bombs) && s.bombs.length <= count * 8 && s.bombs.every((b) => b && integer(b.id, 1, 1e6) && integer(b.x, 0, WIDTH - 1) && integer(b.y, 0, HEIGHT - 1) && integer(b.owner, 1, count) && (b.slide === void 0 || integer(b.slide, -1, 3)) && (b.slideTick === void 0 || integer(b.slideTick, 0, 1)) && integer(b.range, 1, 10) && integer(b.explodeAt, 0, ROUND_TICKS + FUSE_TICKS));
  }
  function reconcile(snapshot, seat, pending) {
    const remaining = pending.filter((input) => input.seq > snapshot.ack[seat - 1]).slice(-HZ * 2);
    const state = cloneState(snapshot);
    for (const input of remaining) {
      const inputs = state.inputs.map((value) => ({ ...value }));
      inputs[seat - 1] = input;
      step(state, inputs);
    }
    return { state, pending: remaining };
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
      this.room = { t: "state", gameId: "3881-native", room: "", hostId: null, seats: { 1: null, 2: null }, members: [] };
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

  // src/native/view.ts
  var CELL = 44;
  var LEFT = 28;
  var TOP = 66;
  var GameView = class {
    constructor(canvas) {
      this.canvas = canvas;
      this.images = /* @__PURE__ */ new Map();
      this.observedBombs = /* @__PURE__ */ new Set();
      this.observedRound = 0;
      this.observedSpecials = /* @__PURE__ */ new Set();
      this.observedItems = 0;
      this.audioReady = false;
      this.sound = true;
      this.fps = 0;
      this.frameCount = 0;
      this.fpsAt = performance.now();
      canvas.width = LEFT * 2 + WIDTH * CELL;
      canvas.height = TOP + HEIGHT * CELL + 28;
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
        ...["life", "push", "bomb", "shield", "range", "speed", ...WEAPONS].map((item) => `item-${item}`),
        ...[0, 1, 2, 3].map((d) => `rocket-${d}`),
        ...[1, 2, 3, 4].flatMap((hero) => [0, 1, 2, 3].flatMap((direction) => [`hero-${hero}-${direction}`, `walk-${hero}-${direction}`]))
      ]) {
        const image = new Image();
        image.src = `/native/assets/${name}.png`;
        this.images.set(name, image);
      }
      window.addEventListener("pointerdown", () => {
        this.audioReady = true;
      });
      window.addEventListener("keydown", () => {
        this.audioReady = true;
      });
    }
    animation(name, frame, x, bottom, width, height) {
      const image = this.images.get(name);
      if (image?.complete && image.naturalWidth) this.ctx.drawImage(image, Math.max(0, Math.floor(frame)) % 8 * 64, 0, 64, 72, x - width / 2, bottom - height, width, height);
    }
    sprite(name, x, bottom, width, height) {
      const image = this.images.get(name);
      if (!image?.complete || !image.naturalWidth) return;
      const scale = Math.min(width / image.width, height / image.height);
      this.ctx.drawImage(image, x - image.width * scale / 2, bottom - image.height * scale, image.width * scale, image.height * scale);
    }
    play(name) {
      if (!this.sound || !this.audioReady) return;
      const audio = new Audio(`/native/assets/${name}.mp3`);
      audio.volume = 0.24;
      void audio.play().catch(() => {
      });
    }
    // Only confirmed authority changes produce audio: prediction replay cannot
    // repeatedly play an explosion or an unconfirmed placement.
    confirm(state) {
      const current = new Set(state.bombs.map((bomb) => bomb.id));
      const specials = new Set(state.specials.map((s) => s.id));
      const items = state.items.filter(Boolean).length;
      if (state.round === this.observedRound) {
        if ([...current].some((id) => !this.observedBombs.has(id))) this.play("place");
        if ([...this.observedBombs].some((id) => !current.has(id))) this.play("explode");
        if ([...specials].some((id) => !this.observedSpecials.has(id))) this.play("place");
        if (items < this.observedItems) this.play("item");
      }
      this.observedBombs = current;
      this.observedRound = state.round;
      this.observedSpecials = specials;
      this.observedItems = items;
    }
    render(state, seat) {
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
      ctx.fillText(`\u6CE1\u6CE1\u5802 \xB7 ${state?.options.mode === "coop" ? "\u5408\u4F5C\u5BF9\u6297" : state?.options.mode === "practice" ? "\u4EBA\u673A\u7EC3\u4E60" : "\u53CC\u4EBA\u5BF9\u6218"}`, LEFT, 39);
      if (!state) return;
      ctx.textAlign = "right";
      ctx.font = "600 18px system-ui";
      const seconds = Math.max(0, Math.ceil((ROUND_TICKS - state.tick) / HZ));
      ctx.fillText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, this.canvas.width - LEFT, 39);
      for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
        const px = LEFT + x * CELL, py = TOP + y * CELL, cell = index(x, y);
        ctx.fillStyle = (x + y) % 2 ? "#b2c9a6" : "#bdd3b0";
        ctx.fillRect(px, py, CELL, CELL);
        const floor = this.images.get("floor");
        if (floor?.complete && floor.naturalWidth) ctx.drawImage(floor, px, py, CELL, CELL);
        if (state.options.map !== "classic") {
          ctx.fillStyle = state.options.map === "lanes" ? "#729cd333" : "#efc97044";
          ctx.fillRect(px, py, CELL, CELL);
        }
        ctx.strokeStyle = "#23433b18";
        ctx.strokeRect(px, py, CELL, CELL);
        if (state.board[cell] === 1) {
          ctx.fillStyle = "#536d66";
          ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
          this.sprite("wall", px + CELL / 2, py + CELL - 2, CELL - 2, CELL - 1);
        } else if (state.board[cell] === 2) this.sprite("crate", px + CELL / 2, py + CELL - 1, CELL - 2, CELL - 1);
        if (state.flames[cell] > state.tick) {
          ctx.fillStyle = "#ffb631cc";
          ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
          ctx.fillStyle = "#fff1a5";
          ctx.beginPath();
          ctx.arc(px + CELL / 2, py + CELL / 2, 12 + Math.sin(now / 60) * 3, 0, Math.PI * 2);
          ctx.fill();
          this.animation("fx-blast", state.tick / 2, px + CELL / 2, py + CELL, CELL, CELL);
        } else if (state.ice[cell] > state.tick) {
          ctx.fillStyle = "#9cdef3bd";
          ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
          this.animation("fx-ice", state.tick / 4, px + CELL / 2, py + CELL, CELL, CELL);
        } else if (state.items[cell]) {
          const type = state.items[cell];
          this.sprite(`item-${type}`, px + CELL / 2, py + CELL - 2, CELL * 0.86, CELL * 0.9);
        }
      }
      for (const s of state.specials) {
        let x = s.x, y = s.y, lift = 0;
        const age = state.tick - s.born;
        if (s.kind === "grenade") {
          const ratio = Math.min(1, age / 18), [dx, dy] = [[-1, 0], [0, -1], [1, 0], [0, 1]][Math.max(0, s.dir)];
          x += dx * ratio * 2;
          y += dy * ratio * 2;
          lift = Math.sin(ratio * Math.PI) * CELL;
        }
        if (s.kind === "fire" || s.kind === "ice") {
          const [dx, dy] = [[-1, 0], [0, -1], [1, 0], [0, 1]][Math.max(0, s.dir)];
          for (let d = 1; d <= s.distance; d++) {
            const cell = index(x + dx * d, y + dy * d);
            if ((s.kind === "fire" ? state.flames[cell] : state.ice[cell]) > state.tick)
              this.animation(`fx-${s.kind}`, age / 4, LEFT + (x + dx * d + 0.5) * CELL, TOP + (y + dy * d + 1) * CELL, CELL, CELL * 1.1);
          }
        } else {
          this.sprite(s.kind === "rocket" ? `rocket-${s.dir}` : s.kind, LEFT + (x + 0.5) * CELL, TOP + (y + 1) * CELL - lift, CELL * 0.85, CELL * 0.8);
          if (s.kind === "mine" || s.kind === "gas") {
            ctx.fillStyle = s.kind === "mine" ? "#fd6670" : "#ac79ec";
            ctx.beginPath();
            ctx.arc(LEFT + (x + 0.5) * CELL, TOP + (y + 0.75) * CELL, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      for (const bomb of state.bombs) {
        const x = LEFT + (bomb.x + 0.5) * CELL, y = TOP + (bomb.y + 1) * CELL;
        this.sprite("bomb", x, y - 2, CELL * 0.85, CELL * 0.9);
        ctx.fillStyle = bomb.explodeAt - state.tick < 20 ? "#ff6a35" : "#ffdd73";
        ctx.beginPath();
        ctx.arc(x + 5, y - CELL + 5, 3 + Math.sin(now / 55), 0, Math.PI * 2);
        ctx.fill();
      }
      for (const player of [...state.players].sort((a, b) => position(a).y - position(b).y)) {
        const pos = position(player), x = LEFT + (pos.x + 0.5) * CELL, y = TOP + (pos.y + 1) * CELL;
        if (!player.alive) {
          if (state.tick - player.diedAt < 28) this.animation("fx-death", (state.tick - player.diedAt) / 4, x, y, CELL, CELL * 1.2);
          continue;
        }
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
        if (player.moveDir >= 0 && !player.frozen) this.animation(`walk-${player.seat}-${Math.max(0, player.dir)}`, state.tick / 2, x, y, CELL, CELL * 1.12);
        else this.sprite(`hero-${player.seat}-${Math.max(0, player.dir)}`, x, y, CELL * 0.9, CELL * 1.12);
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
        ctx.font = "bold 11px system-ui";
        ctx.textAlign = "center";
        ctx.fillStyle = "#173534";
        ctx.fillText(`${state.options.bots.includes(player.seat) ? "CPU" : "P"}${player.seat}${player.life > 1 ? ` \u2665${player.life}` : ""}`, x, y - CELL - 8);
      }
      if (state.phase !== "playing") {
        ctx.fillStyle = "#10272bd9";
        ctx.fillRect(LEFT, TOP, WIDTH * CELL, HEIGHT * CELL);
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff5dc";
        ctx.font = "bold 32px system-ui";
        const winner = !state.winner ? "\u5E73\u5C40" : state.options.mode === "coop" ? state.winner === 1 ? "\u5408\u4F5C\u961F\u4F0D\u83B7\u80DC" : "\u7535\u8111\u961F\u4F0D\u83B7\u80DC" : `${state.options.bots.includes(state.winner) ? "CPU" : "P"}${state.winner} \u83B7\u80DC`;
        ctx.fillText(state.phase === "waiting" ? "\u51C6\u5907\u5F00\u5C40" : winner, this.canvas.width / 2, this.canvas.height / 2 - 12);
        ctx.font = "17px system-ui";
        ctx.fillStyle = "#c3d5ca";
        ctx.fillText(state.phase === "waiting" ? state.options.mode === "duel" ? "\u4E24\u4EBA\u5165\u5EA7\u540E\uFF0C\u7531\u623F\u4E3B\u5F00\u59CB\u6E38\u620F" : "\u81F3\u5C11\u4E00\u4EBA\u5165\u5EA7\uFF0C\u7531\u623F\u4E3B\u5F00\u59CB\u6E38\u620F" : "\u623F\u4E3B\u70B9\u51FB\u300C\u518D\u6765\u4E00\u5C40\u300D\u5373\u53EF\u5F00\u59CB", this.canvas.width / 2, this.canvas.height / 2 + 24);
      }
    }
  };

  // src/native/main.ts
  var params = new URLSearchParams(location.search);
  if (ensureName()) start();
  function start() {
    const element = (id) => document.getElementById(id);
    const roomName = (params.get("room") || "lobby").slice(0, 20);
    const net = new Network(arcadeName(), arcadeSession(), roomName, "3881-native", params.get("debug") === "1" && params.get("turn") === "1");
    const view = new GameView(element("game-canvas"));
    let state = null, authority = null;
    let pending = [], sequence = 0, bombCounter = 0, specialCounter = 0;
    let options = { ...DEFAULT_OPTIONS, bots: [] };
    let hostId = null, seat = null, roster = "";
    let lastSnapshotAt = 0, counter = 0, corrections = 0;
    let inputAt = 0, awaitingPaint = false;
    const responseSamples = [];
    const keys = /* @__PURE__ */ new Map();
    const remote = /* @__PURE__ */ new Map();
    let byteSample = { at: performance.now(), bytes: 0, rate: 0 };
    const directions = { KeyA: 0, ArrowLeft: 0, KeyW: 1, ArrowUp: 1, KeyD: 2, ArrowRight: 2, KeyS: 3, ArrowDown: 3 };
    element("room-name").textContent = roomName;
    element("my-name").textContent = arcadeName();
    localStorage.setItem("arcade_recent_game", "3881-native");
    function notice(text) {
      element("connection-note").textContent = text;
    }
    function clearInput() {
      keys.clear();
    }
    function resetInput() {
      clearInput();
      sequence = 0;
      bombCounter = 0;
      specialCounter = 0;
      pending = [];
      remote.clear();
    }
    function newRound(playing) {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      options.bots = options.mode === "duel" ? [] : [1, 2].filter((number) => !net.room.seats[number]);
      authority = createGame(seed, Math.max(Date.now(), (authority?.round || 0) + 1, (state?.round || 0) + 1), playing, options);
      state = authority;
      resetInput();
      broadcast();
      if (playing) notice("\u6E38\u620F\u8FDB\u884C\u4E2D");
    }
    function broadcast() {
      if (!authority || !net.isHost) return;
      for (const member of net.room.members) if (member.id !== net.id) net.send(member.id, { type: "snapshot", state: authority });
      view.confirm(authority);
    }
    net.onStatus = (text) => {
      notice(text);
      if (!net.connected) clearInput();
      updateUi();
    };
    net.onRoom = (room) => {
      const changedHost = hostId !== room.hostId;
      const changedRoster = roster !== JSON.stringify(room.seats);
      hostId = room.hostId;
      roster = JSON.stringify(room.seats);
      if (seat !== net.seat || changedHost) resetInput();
      seat = net.seat;
      if (net.isHost && (changedHost || changedRoster || !authority)) {
        newRound(false);
        notice(changedHost ? "\u623F\u4E3B\u5DF2\u5C31\u7EEA\uFF0C\u8BF7\u4E24\u4F4D\u73A9\u5BB6\u5165\u5EA7" : "\u5E2D\u4F4D\u5DF2\u66F4\u65B0\uFF0C\u7B49\u5F85\u5F00\u59CB");
      } else if (!net.isHost && changedHost) {
        state = null;
        authority = null;
        lastSnapshotAt = 0;
        notice("\u6B63\u5728\u540C\u6B65\u623F\u95F4");
      }
      updateUi();
    };
    net.onPacket = (from, packet) => {
      if (packet.type === "input" && net.isHost && authority && packet.round === authority.round && validInput(packet.input)) {
        const member = net.room.members.find((member2) => member2.id === from);
        if (member?.seat !== 1 && member?.seat !== 2) return;
        const previous = remote.get(from);
        if (packet.input.seq > (previous?.input.seq || 0)) remote.set(from, { input: packet.input, at: performance.now() });
      }
      if (packet.type === "snapshot" && !net.isHost && from === net.room.hostId && validState(packet.state)) {
        const snapshot = packet.state;
        if (authority && (snapshot.round < authority.round || snapshot.round === authority.round && snapshot.tick < authority.tick)) return;
        const newGame = !authority || snapshot.round !== authority.round;
        const before = state && seat ? position(state.players[seat - 1]) : null;
        if (newGame) resetInput();
        authority = snapshot;
        lastSnapshotAt = performance.now();
        if (seat) {
          sequence = Math.max(sequence, snapshot.ack[seat - 1]);
          bombCounter = Math.max(bombCounter, snapshot.players[seat - 1].lastBomb);
          specialCounter = Math.max(specialCounter, snapshot.players[seat - 1].lastSpecial);
        }
        if (seat && !newGame) {
          const result = reconcile(snapshot, seat, pending);
          state = result.state;
          pending = result.pending;
        } else state = cloneState(snapshot);
        if (before && seat && !newGame) {
          const after = position(state.players[seat - 1]);
          if (Math.hypot(before.x - after.x, before.y - after.y) > 0.35) corrections++;
        }
        view.confirm(snapshot);
        if (newGame) {
          notice(snapshot.phase === "playing" ? "\u6E38\u620F\u8FDB\u884C\u4E2D" : "\u540C\u6B65\u5B8C\u6210\uFF0C\u7B49\u5F85\u623F\u4E3B\u5F00\u59CB");
          updateUi();
        }
      }
    };
    function currentInput() {
      let latest = -1, direction = -1;
      for (const [key2, time] of keys) if (directions[key2] !== void 0 && time >= latest) {
        latest = time;
        direction = directions[key2];
      }
      return { seq: ++sequence, dir: direction, bomb: bombCounter, special: specialCounter };
    }
    function tick() {
      counter++;
      if (!net.connected || !state || !authority) return;
      const input = seat && state.phase === "playing" ? currentInput() : { ...EMPTY_INPUT };
      if (net.isHost) {
        const inputs = [1, 2].map((number) => {
          const id = net.room.seats[number];
          if (id === net.id) return input;
          const item = id ? remote.get(id) : null;
          return item && performance.now() - item.at < 600 ? item.input : { ...item?.input || EMPTY_INPUT, dir: -1 };
        });
        step(authority, inputs);
        state = authority;
        if (counter % 3 === 0) broadcast();
      } else if (seat && authority.phase === "playing") {
        if (input.seq === 0) Object.assign(input, currentInput());
        net.send(net.room.hostId, { type: "input", round: authority.round, input });
        if (performance.now() - lastSnapshotAt < 1800) {
          pending.push(input);
          pending = pending.slice(-HZ * 2);
          const inputs = state.inputs.map((value) => ({ ...value }));
          inputs[seat - 1] = input;
          step(state, inputs);
        }
      }
      if (inputAt) awaitingPaint = true;
    }
    function key(event, pressed) {
      if (event.target?.matches("input, textarea, select, button")) return;
      if (!(event.code in directions) && !["Space", "Enter", "KeyE", "ShiftLeft", "ShiftRight"].includes(event.code)) return;
      event.preventDefault();
      if (!seat || state?.phase !== "playing") return;
      if (pressed) {
        if (!keys.has(event.code)) {
          if (event.code === "Space" || event.code === "Enter") bombCounter++;
          if (["KeyE", "ShiftLeft", "ShiftRight"].includes(event.code)) specialCounter++;
          keys.set(event.code, performance.now());
          inputAt = performance.now();
        }
      } else keys.delete(event.code);
    }
    window.addEventListener("keydown", (event) => key(event, true));
    window.addEventListener("keyup", (event) => key(event, false));
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearInput();
    });
    for (const button of document.querySelectorAll("[data-key]")) {
      const code = button.dataset.key;
      button.onpointerdown = (event) => {
        if (!seat || state?.phase !== "playing") return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        if (code === "Space" && !keys.has(code)) bombCounter++;
        if (code === "KeyE" && !keys.has(code)) specialCounter++;
        keys.set(code, performance.now());
        inputAt = performance.now();
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
    function enoughPlayers() {
      return options.mode === "duel" ? !!net.room.seats[1] && !!net.room.seats[2] : !!net.room.seats[1] || !!net.room.seats[2];
    }
    for (const key2 of ["mode", "map", "loadout"]) {
      element(`game-${key2}`).onchange = (event) => {
        if (!net.isHost || authority?.phase === "playing") return;
        options = { ...options, [key2]: event.target.value };
        newRound(false);
        updateUi();
      };
    }
    element("start-game").onclick = () => {
      if (net.isHost && enoughPlayers() && authority?.phase !== "playing") newRound(true);
      element("start-game").blur();
      updateUi();
    };
    element("copy-invite").onclick = async () => {
      const invite = new URL(location.href);
      invite.searchParams.delete("debug");
      invite.searchParams.delete("turn");
      try {
        await navigator.clipboard.writeText(invite.href);
        notice("\u9080\u8BF7\u94FE\u63A5\u5DF2\u590D\u5236");
      } catch {
        const field = element("invite-link");
        field.hidden = false;
        field.value = invite.href;
        field.select();
        notice("\u590D\u5236\u4E0B\u65B9\u94FE\u63A5\u5373\u53EF\u9080\u8BF7\u597D\u53CB");
      }
    };
    element("sound-toggle").onclick = () => {
      view.sound = !view.sound;
      element("sound-toggle").textContent = view.sound ? "\u97F3\u6548\uFF1A\u5F00" : "\u97F3\u6548\uFF1A\u5173";
    };
    element("fullscreen-stage").onclick = () => {
      void element("native-stage").requestFullscreen().catch(() => {
      });
    };
    element("leave-room").onclick = (event) => {
      event.preventDefault();
      net.stop();
      location.href = "/";
    };
    function updateUi() {
      element("role-status").textContent = seat ? `P${seat} \u73A9\u5BB6` : "\u89C2\u6218";
      element("member-count").textContent = `${net.room.members.length} \u4EBA`;
      element("conn-badge").textContent = net.connected ? "\u5DF2\u8FDE\u63A5" : "\u91CD\u8FDE\u4E2D";
      element("conn-badge").className = `badge ${net.connected ? "ok" : "bad"}`;
      const host = net.room.members.find((member) => member.id === net.room.hostId);
      element("host-line").textContent = net.isHost ? "\u4F60\u662F\u623F\u4E3B" : `\u623F\u4E3B\uFF1A${host?.name || "\u7B49\u5F85\u4E2D"}`;
      for (const number of [1, 2]) {
        const row = element(`seat-${number}`), member = net.room.members.find((value) => value.id === net.room.seats[number]);
        row.querySelector(".who").textContent = member?.name || (state?.options.bots.includes(number) ? "\u7535\u8111\uFF08\u5165\u5EA7\u53EF\u66FF\u6362\uFF09" : "\u7A7A\u95F2");
        const button = row.querySelector("button");
        button.textContent = seat === number ? "\u79BB\u5EA7" : "\u5165\u5EA7";
        button.disabled = !!member && member.id !== net.id;
        row.classList.toggle("occupied", !!member);
        const player = state?.players[number - 1];
        row.querySelector(".player-stats").textContent = player ? `\u751F\u547D ${player.life} \xB7 \u70B8\u5F39 ${player.capacity} \xB7 \u706B\u529B ${player.range} \xB7 \u901F\u5EA6 ${7 - player.speed}${player.shield ? " \xB7 \u62A4\u76FE" : ""}${player.push ? " \xB7 \u63A8\u5F39" : ""}${player.weapon ? ` \xB7 ${ITEM_LABELS[player.weapon]} \xD7${player.ammo}` : ""}${player.frozen ? " \xB7 \u51BB\u7ED3" : player.slow ? " \xB7 \u51CF\u901F" : ""}` : "";
      }
      for (const key2 of ["mode", "map", "loadout"]) {
        const select = element(`game-${key2}`);
        select.disabled = !net.isHost || authority?.phase === "playing";
        if (state) select.value = state.options[key2];
      }
      const inventory = seat && state ? state.players[seat - 1] : null;
      const weapon = inventory?.weapon;
      element("weapon-status-text").textContent = weapon ? `${ITEM_LABELS[weapon]} \xD7${inventory.ammo} \xB7 E / Shift \u4F7F\u7528` : "\u5C1A\u672A\u62FE\u53D6\u7279\u6B8A\u6B66\u5668";
      element("special-button-text").textContent = weapon ? `${ITEM_LABELS[weapon]} \xD7${inventory.ammo}` : "\u7279\u6B8A\u6B66\u5668";
      for (const id of ["weapon-icon", "special-button-icon"]) {
        const icon = element(id);
        icon.hidden = !weapon;
        if (weapon) icon.src = `/native/assets/item-${weapon}.png`;
      }
      element("mode-note").textContent = state?.options.mode === "coop" ? "\u4E24\u4F4D\u73A9\u5BB6\u540C\u961F\u5BF9\u6297\u4E24\u53F0\u7535\u8111\uFF1B\u7A7A\u4F4D\u7531\u7535\u8111\u8865\u9F50\u3002\u7206\u70B8\u4ECD\u4F1A\u4F24\u53CA\u961F\u53CB\u3002" : state?.options.mode === "practice" ? "\u4E00\u4EBA\u5373\u53EF\u5F00\u59CB\uFF0C\u7A7A\u4F4D\u7531\u7535\u8111\u8865\u9F50\u3002" : "\u4E24\u4EBA\u5165\u5EA7\u540E\u5F00\u59CB\uFF0C\u6700\u540E\u5B58\u6D3B\u8005\u83B7\u80DC\u3002";
      const startButton = element("start-game");
      startButton.disabled = !net.connected || !net.isHost || !enoughPlayers() || authority?.phase === "playing";
      startButton.textContent = authority?.phase === "finished" ? "\u518D\u6765\u4E00\u5C40" : "\u5F00\u59CB\u6E38\u620F";
      element("seat-caption").textContent = seat ? "WASD / \u65B9\u5411\u952E\u79FB\u52A8 \xB7 \u7A7A\u683C\u653E\u70B8\u5F39 \xB7 E / Shift \u7279\u6B8A\u6B66\u5668" : "\u5165\u5EA7\u540E\u5373\u53EF\u64CD\u4F5C\uFF0C\u53CC\u65B9\u90FD\u4F7F\u7528\u81EA\u5DF1\u7684\u952E\u76D8";
      const other = net.isHost ? net.room.members.find((member) => member.id !== net.id && member.seat)?.id : net.room.hostId;
      const transport = other ? net.transport(other) : "waiting";
      element("transport-status").textContent = transport === "p2p" ? "\u5BF9\u7B49\u8FDE\u63A5" : transport === "relay" ? "\u4E2D\u7EE7\u8FDE\u63A5" : "\u7B49\u5F85\u597D\u53CB";
      const rtt = other ? net.rtt.get(other) : void 0;
      element("latency-status").textContent = rtt == null ? "\u2014" : `${Math.round(rtt)} ms`;
      element("render-status").textContent = `${view.fps} FPS`;
      element("metrics-rtt").textContent = rtt == null ? "\u7B49\u5F85\u91C7\u6837" : `${rtt.toFixed(1)} ms`;
      element("metrics-predict").textContent = responseSamples.length ? `${Math.max(...responseSamples.slice(-20)).toFixed(1)} ms\uFF08\u6700\u8FD1 20 \u6B21\u6700\u5927\uFF09` : "\u64CD\u4F5C\u540E\u91C7\u6837";
      element("metrics-correction").textContent = String(corrections);
      element("metrics-age").textContent = net.isHost ? "\u672C\u673A\u6743\u5A01" : lastSnapshotAt ? `${Math.round(performance.now() - lastSnapshotAt)} ms` : "\u7B49\u5F85\u540C\u6B65";
      const now = performance.now(), bytes = net.sentBytes + net.receivedBytes;
      if (now - byteSample.at > 1e3) byteSample = { at: now, bytes, rate: (bytes - byteSample.bytes) / (now - byteSample.at) };
      element("metrics-bandwidth").textContent = `${byteSample.rate.toFixed(1)} KB/s`;
      const stale = !net.connected || !net.isHost && lastSnapshotAt > 0 && now - lastSnapshotAt > 1800;
      element("connection-overlay").hidden = !stale;
      element("connection-overlay").textContent = "\u8FDE\u63A5\u6062\u590D\u4E2D\uFF0C\u6B63\u5728\u7B49\u5F85\u6700\u65B0\u72B6\u6001\u2026";
      element("native-stage").dataset.transport = transport;
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
      view.render(state, seat);
      if (awaitingPaint && inputAt) {
        responseSamples.push(performance.now() - inputAt);
        if (responseSamples.length > 100) responseSamples.shift();
        inputAt = 0;
        awaitingPaint = false;
      }
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
    window.setInterval(updateUi, 250);
    window.addEventListener("pagehide", () => {
      worker.terminate();
      net.stop(false);
    });
    if (params.get("debug") === "1") {
      Object.assign(window, { __nativeTest: {
        get state() {
          return state && cloneState(state);
        },
        get authority() {
          return authority && cloneState(authority);
        },
        get pending() {
          return pending.length;
        },
        get seat() {
          return seat;
        },
        get responseSamples() {
          return [...responseSamples];
        },
        get corrections() {
          return corrections;
        },
        network: net
      } });
    }
    void net.start();
  }
})();
