// Bomb It reconstruction: a serializable 35 Hz simulation, independent of DOM,
// rendering, wall clocks and transport. See SWF_RECONSTRUCTION.md for provenance.
export const HZ = 35;
export const STEP_MS = 1000 / HZ;
export const WIDTH = 15;
export const HEIGHT = 13;
export const FUSE_TICKS = 60;
export const ROUND_TICKS = HZ * 180;
export type Direction = -1 | 0 | 1 | 2 | 3;
export const WEAPONS = ["rocket", "mine", "grenade", "gas", "ice", "fire"] as const;
export type Weapon = typeof WEAPONS[number];
export type Item = "bomb" | "range" | "speed" | "shield" | "life" | "push" | Weapon;
export const ITEM_LABELS: Record<Item, string> = { bomb: "炸弹糖", range: "威力药", speed: "飞鞋", shield: "盾牌", life: "生命", push: "推弹手套", rocket: "火箭", mine: "地雷", grenade: "手榴弹", gas: "汽弹", ice: "冰箭", fire: "火焰箭" };
export interface Input { seq: number; dir: Direction; bomb: number; special?: number }
export interface GameOptions {
  mode: "duel" | "practice" | "coop" | "online";
  map: "classic" | "lanes" | "open";
  loadout: Weapon | "none";
  bots: number[];
  activeSeats?: number[];
}
export const DEFAULT_OPTIONS: GameOptions = { mode: "duel", map: "classic", loadout: "none", bots: [] };
export interface Player {
  seat: number; x: number; y: number; dir: Direction; moveDir: Direction;
  progress: number; speed: number; alive: boolean; capacity: number; range: number;
  shield: boolean; invulnerable: number; lastBomb: number;
  life: number; push: boolean; weapon: Weapon | null; ammo: number; lastSpecial: number;
  slow: number; frozen: number; moveTicks: number; diedAt: number;
}
export interface Bomb { id: number; x: number; y: number; owner: number; range: number; explodeAt: number; slide?: Direction; slideTick?: number }
export interface Special {
  id: number; kind: Weapon; owner: number; x: number; y: number; dir: Direction;
  born: number; until: number; distance: number;
}
export interface GameState {
  version: 2; round: number; tick: number; rng: number; nextBomb: number; options: GameOptions;
  phase: "waiting" | "playing" | "finished"; winner: number | null;
  board: number[]; items: (Item | null)[]; flames: number[];
  players: Player[]; bombs: Bomb[]; specials: Special[]; ice: number[]; ack: number[]; inputs: Input[];
}
export const EMPTY_INPUT: Input = { seq: 0, dir: -1, bomb: 0, special: 0 };
const DIRECTIONS: readonly (readonly [number, number])[] = [[-1, 0], [0, -1], [1, 0], [0, 1]];
export const index = (x: number, y: number): number => y * WIDTH + x;
export const cloneState = (state: GameState): GameState => JSON.parse(JSON.stringify(state));

function random(state: GameState): number {
  let x = state.rng | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4294967296;
}

export function createGame(seed: number, round = 1, playing = true, options: Partial<GameOptions> = {}): GameState {
  const config = { ...DEFAULT_OPTIONS, ...options, bots: [...(options.bots || [])], activeSeats: [...(options.activeSeats || [1, 2])] };
  if (config.mode === "coop") config.bots = [...new Set([...config.bots, 3, 4])];
  if (config.mode === "online") config.bots = [];
  const count = config.mode === "coop" || config.mode === "online" ? 4 : 2;
  const state: GameState = {
    version: 2, round, tick: 0, rng: (seed >>> 0) || 1, nextBomb: 1, options: config,
    phase: playing ? "playing" : "waiting", winner: null,
    board: Array(WIDTH * HEIGHT).fill(0), items: Array(WIDTH * HEIGHT).fill(null),
    flames: Array(WIDTH * HEIGHT).fill(0), ice: Array(WIDTH * HEIGHT).fill(0), bombs: [], specials: [],
    ack: Array(count).fill(0), inputs: Array.from({ length: count }, () => ({ ...EMPTY_INPUT })), players: []
  };
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const pillar = config.map === "open" ? x % 4 === 0 && y % 4 === 0 :
      config.map === "lanes" ? x % 4 === 0 && y % 3 !== 1 : x % 2 === 0 && y % 2 === 0;
    const wall = x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1 || pillar;
    state.board[index(x, y)] = wall ? 1 : random(state) < (config.map === "open" ? .4 : .6) ? 2 : 0;
  }
  // A symmetric experimental arena; original art and movement/fuse cadence.
  for (const [seat, x, y] of [[1, 1, 1], [2, WIDTH - 2, HEIGHT - 2], [3, WIDTH - 2, 1], [4, 1, HEIGHT - 2]].slice(0, count)) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx > 0 && x + dx < WIDTH - 1 && y + dy > 0 && y + dy < HEIGHT - 1 && Math.abs(dx) + Math.abs(dy) <= 1) {
        state.board[index(x + dx, y + dy)] = 0;
      }
    }
    const active = config.mode !== "online" || config.activeSeats.includes(seat);
    state.players.push({ seat, x, y, dir: 3, moveDir: -1, progress: 0, speed: 6,
      alive: active, capacity: 1, range: 1, shield: false, invulnerable: 0, lastBomb: 0,
      life: active ? 1 : 0, push: false, weapon: config.loadout === "none" ? null : config.loadout,
      ammo: config.loadout === "none" ? 0 : config.loadout === "ice" ? 1 : 2,
      lastSpecial: 0, slow: 0, frozen: 0, moveTicks: 6, diedAt: 0 });
  }
  return state;
}

export function position(player: Player): { x: number; y: number } {
  const delta = player.moveDir < 0 ? [0, 0] : DIRECTIONS[player.moveDir];
  return { x: player.x + delta[0] * player.progress / player.moveTicks,
    y: player.y + delta[1] * player.progress / player.moveTicks };
}

function takeItem(state: GameState, player: Player): void {
  const cell = index(player.x, player.y);
  switch (state.items[cell]) {
    case "bomb": player.capacity = Math.min(8, player.capacity + 1); break;
    case "range": player.range = Math.min(10, player.range + 1); break;
    case "speed": player.speed = Math.max(3, player.speed - 1); break;
    case "shield": player.shield = true; break;
    case "life": player.life = Math.min(5, player.life + 1); break;
    case "push": player.push = true; break;
    default: {
      const item = state.items[cell];
      if (item && WEAPONS.includes(item as Weapon)) { player.weapon = item as Weapon; player.ammo = item === "ice" ? 1 : 2; }
    }
  }
  state.items[cell] = null;
}

function placeBomb(state: GameState, player: Player): void {
  if (state.bombs.filter((bomb) => bomb.owner === player.seat).length >= player.capacity) return;
  if (state.bombs.some((bomb) => bomb.x === player.x && bomb.y === player.y)) return;
  state.bombs.push({ id: state.nextBomb++, x: player.x, y: player.y, owner: player.seat,
    range: player.range, explodeAt: state.tick + FUSE_TICKS });
}

function breakCrate(state: GameState, cell: number): void {
  if (state.board[cell] !== 2) return;
  state.board[cell] = 0;
  if (random(state) >= .65) return;
  if (random(state) >= .8) state.items[cell] = WEAPONS[Math.floor(random(state) * WEAPONS.length)];
  else {
    const roll = random(state);
    state.items[cell] = roll < .01 ? "life" : roll < .15 ? "push" : roll < .4 ? "bomb" :
      roll < .5 ? "shield" : roll < .75 ? "range" : "speed";
  }
}

const inside = (x: number, y: number): boolean => x > 0 && x < WIDTH - 1 && y > 0 && y < HEIGHT - 1;
function passable(state: GameState, x: number, y: number): boolean {
  return inside(x, y) && state.board[index(x, y)] === 0 && state.ice[index(x, y)] <= state.tick &&
    !state.bombs.some((bomb) => bomb.x === x && bomb.y === y);
}
function ignite(state: GameState, x: number, y: number, until = state.tick + 12): void {
  if (!inside(x, y) || state.board[index(x, y)] === 1) return;
  const cell = index(x, y);
  state.flames[cell] = Math.max(state.flames[cell], until);
  state.ice[cell] = 0;
  breakCrate(state, cell);
}

function explodeBombs(state: GameState): void {
  const queue = state.bombs.filter((bomb) => bomb.explodeAt <= state.tick || state.flames[index(bomb.x, bomb.y)] > state.tick);
  const exploded = new Set<number>();
  const flame = (x: number, y: number): void => {
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

function useSpecial(state: GameState, player: Player): void {
  if (!player.weapon || player.ammo <= 0 || player.moveDir >= 0 || state.specials.length >= 64 ||
      state.bombs.some((bomb) => bomb.x === player.x && bomb.y === player.y)) return;
  const kind = player.weapon, dir = Math.max(0, player.dir) as Direction;
  const [dx, dy] = DIRECTIONS[dir];
  if (kind === "grenade" && (!inside(player.x + dx * 2, player.y + dy * 2) || state.board[index(player.x + dx * 2, player.y + dy * 2)] === 1)) return;
  if (kind === "ice" && !passable(state, player.x + dx, player.y + dy)) return;
  if (kind === "fire" && (!inside(player.x + dx, player.y + dy) || state.board[index(player.x + dx, player.y + dy)] === 1)) return;
  if (state.specials.some((s) => s.kind === kind && s.x === player.x && s.y === player.y)) return;
  state.specials.push({ id: state.nextBomb++, kind, owner: player.seat, x: player.x, y: player.y, dir,
    born: state.tick, until: state.tick + (kind === "grenade" ? 18 : kind === "ice" || kind === "fire" ? 49 : kind === "rocket" ? HZ * 4 : ROUND_TICKS), distance: 0 });
  player.ammo--;
  if (!player.ammo) player.weapon = null;
}

function updateSpecials(state: GameState): void {
  for (const s of state.specials) {
    const age = state.tick - s.born, [dx, dy] = DIRECTIONS[Math.max(0, s.dir)];
    if (s.kind === "rocket") {
      // Original rocket accelerates by one pixel/tick on a 30px cell.
      const distance = Math.floor((age * (age + 1) / 2 + 15) / 30);
      while (s.distance < distance && s.until > state.tick) {
        const x = s.x + dx, y = s.y + dy;
        if (!inside(x, y) || state.board[index(x, y)] === 1) { ignite(state, s.x, s.y); s.until = state.tick; break; }
        s.x = x; s.y = y; s.distance++;
        if (state.board[index(x, y)] === 2 || state.bombs.some((b) => b.x === x && b.y === y) ||
            state.players.some((p) => p.alive && p.seat !== s.owner && Math.hypot(position(p).x - x, position(p).y - y) < .6)) {
          ignite(state, x, y); s.until = state.tick;
        }
      }
      // Also collide with a player entering the current cell between advances.
      if (state.players.some((p) => p.alive && p.seat !== s.owner && Math.hypot(position(p).x - s.x, position(p).y - s.y) < .5)) {
        ignite(state, s.x, s.y); s.until = state.tick;
      }
    } else if (s.kind === "mine" || s.kind === "gas") {
      const victim = state.players.find((p) => p.alive && p.seat !== s.owner && Math.hypot(position(p).x - s.x, position(p).y - s.y) < .5);
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
      if (!inside(x, y) || state.board[index(x, y)] === 1 || (s.kind === "ice" && !passable(state, x, y))) { s.distance = 3; continue; }
      if (s.kind === "fire") ignite(state, x, y, s.until);
      else state.ice[index(x, y)] = s.until;
    }
  }
  state.specials = state.specials.filter((s) => s.until > state.tick);
}

function slideBombs(state: GameState): void {
  for (const bomb of state.bombs) {
    if (bomb.slide === undefined || bomb.slide < 0) continue;
    bomb.slideTick = (bomb.slideTick || 0) + 1;
    if (bomb.slideTick < 2) continue;
    bomb.slideTick = 0;
    const [dx, dy] = DIRECTIONS[bomb.slide];
    if (passable(state, bomb.x + dx, bomb.y + dy)) { bomb.x += dx; bomb.y += dy; }
    else { bomb.slide = -1; bomb.explodeAt = state.tick; }
  }
}

function bombCells(state: GameState, bomb: Bomb): number[] {
  const cells = [index(bomb.x, bomb.y)];
  for (const [dx, dy] of DIRECTIONS) for (let d = 1; d <= bomb.range; d++) {
    const x = bomb.x + dx * d, y = bomb.y + dy * d;
    if (!inside(x, y) || state.board[index(x, y)] === 1) break;
    cells.push(index(x, y));
    if (state.board[index(x, y)] === 2) break;
  }
  return cells;
}

export function botInput(state: GameState, player: Player): Input {
  const input: Input = { seq: state.tick, dir: -1, bomb: player.lastBomb, special: player.lastSpecial };
  if (!player.alive || player.frozen || player.moveDir >= 0) return input;
  const danger = Array(WIDTH * HEIGHT).fill(Infinity);
  for (let i = 0; i < danger.length; i++) if (state.flames[i] > state.tick) danger[i] = state.tick;
  // Conservatively treat every bomb ray as imminent; this includes chains.
  for (const bomb of state.bombs) for (const cell of bombCells(state, bomb)) danger[cell] = Math.min(danger[cell], state.tick + 18);
  for (const special of state.specials) {
    if (special.kind === "mine" && special.owner !== player.seat) danger[index(special.x, special.y)] = state.tick;
    const [dx, dy] = DIRECTIONS[Math.max(0, special.dir)];
    if (special.kind === "grenade") {
      const x = special.x + dx * 2, y = special.y + dy * 2;
      for (const [a, b] of [[0, 0], ...DIRECTIONS]) if (inside(x + a, y + b)) danger[index(x + a, y + b)] = special.until;
    }
    if (special.kind === "fire" || special.kind === "ice" || special.kind === "rocket") {
      for (let d = 0; d <= (special.kind === "rocket" ? WIDTH : 3); d++) {
        const x = special.x + dx * d, y = special.y + dy * d;
        if (!inside(x, y) || state.board[index(x, y)] === 1) break;
        danger[index(x, y)] = state.tick + 4;
      }
    }
  }
  const origin = index(player.x, player.y), offset = Math.floor(random(state) * 4);
  const search = (hazards: number[], escape: boolean): Direction => {
    const queue = [{ x: player.x, y: player.y, dir: -1 as Direction, depth: 0 }], seen = new Set([origin]);
    let best = -Infinity, chosen: Direction = -1;
    for (let n = 0; n < queue.length; n++) {
      const current = queue[n], cell = index(current.x, current.y);
      if (current.depth && hazards[cell] === Infinity) {
        if (escape) return current.dir;
        const crates = DIRECTIONS.filter(([dx, dy]) => state.board[index(current.x + dx, current.y + dy)] === 2).length;
        const enemies = state.players.filter((p) => p.alive && p.seat !== player.seat &&
          (state.options.mode !== "coop" || (p.seat <= 2) !== (player.seat <= 2)));
        const distance = Math.min(30, ...enemies.map((p) => Math.abs(p.x - current.x) + Math.abs(p.y - current.y)));
        const score = (state.items[cell] ? 18 : 0) + crates * 3 - current.depth * .7 - distance * .3;
        if (score > best) { best = score; chosen = current.dir; }
      }
      if (current.depth >= 12) continue;
      for (let d = 0; d < 4; d++) {
        const dir = (d + offset) % 4 as Direction, [dx, dy] = DIRECTIONS[dir];
        const x = current.x + dx, y = current.y + dy, cell = index(x, y);
        const arrival = state.tick + (current.depth + 1) * (player.slow ? 20 : player.speed);
        if (!passable(state, x, y) || seen.has(cell) || hazards[cell] <= arrival) continue;
        seen.add(cell); queue.push({ x, y, dir: current.dir === -1 ? dir : current.dir, depth: current.depth + 1 });
      }
    }
    return escape ? -1 : chosen;
  };
  if (danger[origin] !== Infinity) { input.dir = search(danger, true); return input; }
  const probe: Bomb = { id: 0, x: player.x, y: player.y, owner: player.seat, range: player.range, explodeAt: state.tick + FUSE_TICKS };
  const blast = bombCells(state, probe);
  const useful = blast.some((c) => state.board[c] === 2 || state.players.some((p) => p.alive && p.seat !== player.seat && index(p.x, p.y) === c &&
    (state.options.mode !== "coop" || (p.seat <= 2) !== (player.seat <= 2))));
  if (useful && !state.bombs.some((b) => b.x === player.x && b.y === player.y) && state.bombs.filter((b) => b.owner === player.seat).length < player.capacity) {
    const future = [...danger]; for (const c of blast) future[c] = Math.min(future[c], probe.explodeAt);
    const escape = search(future, true);
    if (escape >= 0) { input.bomb++; input.dir = escape; return input; }
  }
  // Bots use offensive inventory only when an enemy lies ahead; traps are rare.
  const [dx, dy] = DIRECTIONS[Math.max(0, player.dir)];
  if (player.weapon && state.tick % 35 === 0 && (player.weapon === "mine" || player.weapon === "gas" ||
      state.players.some((p) => p.alive && p.seat !== player.seat && (state.options.mode !== "coop" || (p.seat <= 2) !== (player.seat <= 2)) &&
        (dx ? p.y === player.y && (p.x - player.x) * dx > 0 : p.x === player.x && (p.y - player.y) * dy > 0)))) input.special = player.lastSpecial + 1;
  input.dir = search(danger, false);
  return input;
}

export function step(state: GameState, inputs: readonly Input[]): void {
  if (state.phase !== "playing") return;
  state.tick++;
  const resolved = state.players.map((player, i) => state.options.bots.includes(player.seat) ? botInput(state, player) : inputs[i] || EMPTY_INPUT);
  slideBombs(state);
  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[i];
    const raw = resolved[i];
    const input: Input = { seq: raw.seq, dir: raw.dir, bomb: raw.bomb, special: raw.special || 0 };
    state.ack[i] = Math.max(state.ack[i], input.seq);
    state.inputs[i] = { ...input };
    if (!player.alive) continue;
    if (player.invulnerable > 0) player.invulnerable--;
    if (player.slow > 0) player.slow--;
    if (player.frozen > 0) { player.frozen--; player.lastBomb = Math.max(player.lastBomb, input.bomb); player.lastSpecial = Math.max(player.lastSpecial, input.special || 0); continue; }
    // An action during movement is buffered by its counter until the next cell.
    if ((input.special || 0) > player.lastSpecial && player.moveDir < 0) {
      player.lastSpecial = input.special!;
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
        pushed.x += dx; pushed.y += dy; pushed.slide = input.dir; pushed.slideTick = 0;
      }
      if (passable(state, x, y)) {
        player.moveDir = input.dir;
        player.progress = 0;
        player.moveTicks = player.slow > 0 ? 20 : player.speed;
      }
    }
    if (player.moveDir >= 0 && ++player.progress >= player.moveTicks) {
      const [dx, dy] = DIRECTIONS[player.moveDir];
      player.x += dx; player.y += dy; player.moveDir = -1; player.progress = 0;
      takeItem(state, player);
    }
  }
  updateSpecials(state);
  explodeBombs(state);
  // A chain can ignite a mine or erase a gas trap during this same tick.
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
      if (player.shield) { player.shield = false; player.invulnerable = 60; }
      else if (--player.life > 0) player.invulnerable = 60;
      else { player.alive = false; player.diedAt = state.tick; }
    }
  }
  const survivors = state.players.filter((player) => player.alive);
  const teams = new Set(survivors.map((p) => state.options.mode === "coop" ? p.seat <= 2 ? 1 : 3 : p.seat));
  if (teams.size < 2 || state.tick >= ROUND_TICKS) {
    state.phase = "finished";
    state.winner = teams.size === 1 ? [...teams][0] : 0;
  }
}

export function validInput(value: unknown): value is Input {
  if (!value || typeof value !== "object") return false;
  const v = value as Input;
  return Number.isSafeInteger(v.seq) && v.seq >= 0 && v.seq <= 1e9 &&
    Number.isInteger(v.dir) && v.dir >= -1 && v.dir <= 3 &&
    Number.isSafeInteger(v.bomb) && v.bomb >= 0 && v.bomb <= 1e9 &&
    (v.special === undefined || Number.isSafeInteger(v.special) && v.special >= 0 && v.special <= 1e9);
}

export function validState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const s = value as GameState;
  const integer = (v: number, low: number, high: number) => Number.isInteger(v) && v >= low && v <= high;
  const o = s.options;
  if (!o || !["duel", "practice", "coop", "online"].includes(o.mode) || !["classic", "lanes", "open"].includes(o.map) ||
      !["none", ...WEAPONS].includes(o.loadout)) return false;
  const count = o.mode === "coop" || o.mode === "online" ? 4 : 2;
  if (!Array.isArray(o.bots) || o.bots.length > count || new Set(o.bots).size !== o.bots.length ||
      !o.bots.every((v) => integer(v, 1, count)) || (o.mode === "duel" && o.bots.length > 0) ||
      (o.mode === "coop" && (!o.bots.includes(3) || !o.bots.includes(4))) || (o.mode === "online" && o.bots.length > 0)) return false;
  if (o.mode === "online" && (!Array.isArray(o.activeSeats) || o.activeSeats.length > 4 ||
      (s.phase !== "waiting" && o.activeSeats.length < 2) ||
      new Set(o.activeSeats).size !== o.activeSeats.length || !o.activeSeats.every((v) => integer(v, 1, 4)))) return false;
  if (s.version !== 2 || !integer(s.round, 1, Number.MAX_SAFE_INTEGER) || !integer(s.tick, 0, ROUND_TICKS + 1) ||
      !integer(s.rng, 0, 0xffffffff) || !integer(s.nextBomb, 1, 1e6) ||
      !["waiting", "playing", "finished"].includes(s.phase) || !(s.winner === null || integer(s.winner, 0, count))) return false;
  if (!Array.isArray(s.board) || s.board.length !== WIDTH * HEIGHT || !s.board.every((v) => integer(v, 0, 2)) ||
      !Array.isArray(s.flames) || s.flames.length !== WIDTH * HEIGHT || !s.flames.every((v) => integer(v, 0, ROUND_TICKS + 100)) ||
      !Array.isArray(s.ice) || s.ice.length !== WIDTH * HEIGHT || !s.ice.every((v) => integer(v, 0, ROUND_TICKS + 100)) ||
      !Array.isArray(s.items) || s.items.length !== WIDTH * HEIGHT || !s.items.every((v) => v === null || typeof v === "string" && Object.prototype.hasOwnProperty.call(ITEM_LABELS, v))) return false;
  if (!Array.isArray(s.players) || s.players.length !== count || !s.players.every((p, i) => p && p.seat === i + 1 &&
      integer(p.x, 0, WIDTH - 1) && integer(p.y, 0, HEIGHT - 1) && integer(p.dir, -1, 3) &&
      integer(p.moveDir, -1, 3) && integer(p.speed, 3, 6) && integer(p.moveTicks, 3, 20) && integer(p.progress, 0, p.moveTicks - 1) &&
      integer(p.capacity, 1, 8) && integer(p.range, 1, 10) && integer(p.invulnerable, 0, 60) &&
      integer(p.life, 0, 5) && typeof p.push === "boolean" && (p.weapon === null || WEAPONS.includes(p.weapon)) &&
      integer(p.ammo, 0, 2) && integer(p.lastSpecial, 0, 1e9) && integer(p.slow, 0, 600) && integer(p.frozen, 0, 300) &&
      integer(p.diedAt, 0, ROUND_TICKS) &&
      integer(p.lastBomb, 0, 1e9) && typeof p.alive === "boolean" && typeof p.shield === "boolean")) return false;
  return Array.isArray(s.ack) && s.ack.length === count && s.ack.every((v) => integer(v, 0, 1e9)) &&
    Array.isArray(s.inputs) && s.inputs.length === count && s.inputs.every(validInput) &&
    Array.isArray(s.specials) && s.specials.length <= 64 && s.specials.every((v) => v && integer(v.id, 1, 1e6) &&
      WEAPONS.includes(v.kind) && integer(v.owner, 1, count) && integer(v.x, 0, WIDTH - 1) && integer(v.y, 0, HEIGHT - 1) &&
      integer(v.dir, 0, 3) && integer(v.born, 0, ROUND_TICKS) && integer(v.until, v.born, ROUND_TICKS * 2) && integer(v.distance, 0, 1000)) &&
    Array.isArray(s.bombs) && s.bombs.length <= count * 8 && s.bombs.every((b) => b && integer(b.id, 1, 1e6) &&
      integer(b.x, 0, WIDTH - 1) && integer(b.y, 0, HEIGHT - 1) && integer(b.owner, 1, count) &&
      (b.slide === undefined || integer(b.slide, -1, 3)) && (b.slideTick === undefined || integer(b.slideTick, 0, 1)) &&
      integer(b.range, 1, 10) && integer(b.explodeAt, 0, ROUND_TICKS + FUSE_TICKS));
}

export function reconcile(snapshot: GameState, seat: number, pending: Input[]): { state: GameState; pending: Input[] } {
  const remaining = pending.filter((input) => input.seq > snapshot.ack[seat - 1]).slice(-HZ * 2);
  const state = cloneState(snapshot);
  for (const input of remaining) {
    const inputs = state.inputs.map((value) => ({ ...value }));
    inputs[seat - 1] = input;
    step(state, inputs);
  }
  return { state, pending: remaining };
}
