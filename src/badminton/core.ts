// Stage geometry and frame cadence come from the original SWF (550×400, 30 FPS).
export const HZ = 30;
export const STEP_MS = 1000 / HZ;
export const WIDTH = 550;
export const HEIGHT = 400;
export const GROUND = 376.25;
export const NET_X = 275;
export const NET_TOP = 310;
export const TARGET = 7;
export const LEFT_WALL = 36.5;
export const RIGHT_WALL = 513.5;
const NET_HALF_WIDTH = 7;
const SWING_ROTATION = [0, 0, 18.6, 37.4, 74.9, 93.3, 112.1, 130.9, 149.5, 124.6, 99.6, 74.9, 49.9, 24.8, 0, 0];
const UNDERHAND_ROTATION = [0, 32.8, 65.7, 98.3, 131.4, 164.2, 196.8, 229.8];
// Racket head positions measured from the original gun sprite frames, relative to its handle.
const P1_TIP: readonly [number, number][] = [[-59,-43],[-59,-43],[-43,-57],[-24,-65],[18,-60],[35,-49],[47,-32],[54,-11],[54,9],[52,-19],[39,-43],[18,-60],[-10,-66],[-37,-60],[-59,-43]];
const P2_TIP: readonly [number, number][] = [[-61,-44],[-61,-44],[-45,-57],[-26,-65],[16,-61],[33,-49],[45,-32],[52,-12],[52,9],[51,-16],[44,-35],[32,-49],[16,-61],[-8,-67],[-61,-44]];
const P1_UNDERHAND_TIP: readonly [number, number][] = [[-59,-43],[-73,-11],[-67,30],[-44,57],[-12,66],[30,56],[53,29],[57,-12]];

export interface Input { seq: number; left: boolean; right: boolean; jump: number; hit: number }
export interface Player { x: number; y: number; vy: number; swing: number; servePose: number; underhand: number; lastJump: number; lastHit: number; facing: number }
export interface Birdie { x: number; y: number; vx: number; vy: number; lastHitter: number }
export interface GameState {
  round: number; tick: number; phase: "waiting" | "playing" | "finished";
  rally: "serve" | "flight" | "point"; serve: 1 | 2; winner: 0 | 1 | 2;
  score: [number, number]; players: [Player, Player]; birdie: Birdie;
  ack: [number, number]; inputs: [Input, Input]; pointTicks: number; lastPoint: 0 | 1 | 2;
}
export const EMPTY_INPUT: Input = { seq: 0, left: false, right: false, jump: 0, hit: 0 };
const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value));

export function createGame(round: number, playing: boolean): GameState {
  const players: [Player, Player] = [
    { x: 132.85, y: GROUND, vy: 0, swing: 0, servePose: 0, underhand: 0, lastJump: 0, lastHit: 0, facing: 1 },
    { x: 416.85, y: GROUND, vy: 0, swing: 0, servePose: 0, underhand: 0, lastJump: 0, lastHit: 0, facing: -1 }
  ];
  return { round, tick: 0, phase: playing ? "playing" : "waiting", rally: "serve", serve: 1,
    winner: 0, score: [0, 0], players, birdie: { x: 157.85, y: GROUND - 75, vx: 0, vy: 0, lastHitter: 0 },
    ack: [0, 0], inputs: [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }], pointTicks: 0, lastPoint: 0 };
}

export function cloneState(state: GameState): GameState { return JSON.parse(JSON.stringify(state)) as GameState; }

export function validInput(input: unknown): input is Input {
  if (!input || typeof input !== "object") return false;
  const item = input as Input;
  return Number.isSafeInteger(item.seq) && item.seq >= 0 && item.seq < 1e9 &&
    Number.isSafeInteger(item.jump) && item.jump >= 0 && item.jump < 1e9 &&
    Number.isSafeInteger(item.hit) && item.hit >= 0 && item.hit < 1e9 &&
    typeof item.left === "boolean" && typeof item.right === "boolean";
}

export function validState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const s = value as GameState;
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e15;
  return finite(s.round) && finite(s.tick) && ["waiting", "playing", "finished"].includes(s.phase) &&
    ["serve", "flight", "point"].includes(s.rally) && [1, 2].includes(s.serve) &&
    [0, 1, 2].includes(s.winner) && [0, 1, 2].includes(s.lastPoint) && finite(s.pointTicks) &&
    Array.isArray(s.score) && s.score.length === 2 && s.score.every((n) => finite(n) && n >= 0 && n <= TARGET) &&
    Array.isArray(s.players) && s.players.length === 2 && s.players.every((p) => p && [p.x, p.y, p.vy, p.swing, p.servePose, p.underhand, p.lastJump, p.lastHit, p.facing].every(finite)) &&
    !!s.birdie && [s.birdie.x, s.birdie.y, s.birdie.vx, s.birdie.vy, s.birdie.lastHitter].every(finite) &&
    Array.isArray(s.ack) && s.ack.length === 2 && s.ack.every(finite) &&
    Array.isArray(s.inputs) && s.inputs.length === 2 && s.inputs.every(validInput);
}

function beginServe(state: GameState): void {
  state.rally = "serve";
  // The original reset moves the server away from the net before the next serve.
  const server = state.players[state.serve - 1];
  server.x = state.serve === 1 ? Math.min(server.x, NET_X - 70) : Math.max(server.x, NET_X + 70);
  state.birdie = { x: server.x + (state.serve === 1 ? 25 : -25),
    y: server.y - 75, vx: 0, vy: 0, lastHitter: 0 };
  state.players.forEach((p) => { p.swing = 0; p.servePose = 0; p.underhand = 0; });
}

function award(state: GameState, player: 1 | 2): void {
  if (state.rally !== "flight") return;
  state.score[player - 1]++;
  state.lastPoint = player;
  state.serve = player;
  state.rally = "point";
  state.pointTicks = Math.round(HZ * 1.5);
  if (state.score[player - 1] >= TARGET) { state.winner = player; state.phase = "finished"; }
}

export function step(state: GameState, incoming: readonly Input[]): void {
  if (state.phase !== "playing") return;
  state.tick++;
  for (let i = 0; i < 2; i++) {
    const input = validInput(incoming[i]) ? incoming[i] : EMPTY_INPUT;
    const player = state.players[i];
    const current = state.inputs[i];
    if (input.seq >= current.seq) { state.inputs[i] = { ...input }; state.ack[i] = input.seq; }
    const held = state.inputs[i];
    // The original character applies gravity before reading the current frame's keys.
    player.y = Math.min(GROUND, player.y + player.vy + 1);
    if (player.y >= GROUND) player.vy = 0;
    else player.vy += 1;
    if (player.swing > 0 && --player.swing === 0) player.servePose = 0;
    const speed = (Number(held.right) - Number(held.left)) * 5.9;
    if (speed) player.facing = speed > 0 ? 1 : -1;
    player.x = clamp(player.x + speed, i === 0 ? 50 : NET_X + 23, i === 0 ? NET_X - 23 : 500);
    const serving = state.rally === "serve" && state.serve === i + 1;
    if (held.jump > player.lastJump) {
      player.lastJump = held.jump;
      if (!serving && player.y >= GROUND) player.vy = -12;
    }
    if (held.hit > player.lastHit) {
      player.lastHit = held.hit;
      if (serving && player.swing === 0) { player.swing = 13; player.servePose = 1; }
      else if (state.rally === "flight" && player.swing === 0) {
        player.swing = 14; player.servePose = 0;
        player.underhand = i === 0 && state.birdie.y > player.y - 40 ? 1 : 0;
      }
    }
  }
  const bird = state.birdie;
  if (state.rally === "serve") {
    const player = state.players[state.serve - 1];
    bird.x = player.x + (state.serve === 1 ? 25 : -25); bird.y = player.y - 75;
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
        // The source uses racket._rotation (+/- 2.5°) and a 50×40 impulse.
        const jitter = ((state.round + state.tick * 73 + i * 397) % 1000) / 200 - 2.5;
        const rotation = (player.underhand ? UNDERHAND_ROTATION[frame - 2] : SWING_ROTATION[frame - 1]) + jitter;
        const degrees = i === 0 ? rotation + 122 : -rotation - 302;
        const radians = degrees * Math.PI / 180;
        bird.vx = -Math.cos(radians) * (i === 0 ? 52 : 50);
        bird.vy = -Math.sin(radians) * 40;
        bird.lastHitter = i + 1; player.swing = 0;
        break;
      }
    }
  }
  if (state.rally === "flight" || state.rally === "point") {
    const oldX = bird.x, oldY = bird.y;
    // Original AS2: dy -= 1; dy *= .925; dx *= .92; y -= dy; x -= dx.
    bird.vy = (bird.vy + (bird.vy === 0 ? 0 : 1)) * .925;
    bird.vx *= .92;
    bird.y += bird.vy; bird.x += bird.vx;
    if (bird.x >= RIGHT_WALL || bird.x <= LEFT_WALL) {
      bird.x = clamp(bird.x, LEFT_WALL, RIGHT_WALL);
      bird.vx *= -.8;
    }
    if (oldY >= NET_TOP && oldX < NET_X && bird.x > NET_X - NET_HALF_WIDTH) {
      bird.x = NET_X - NET_HALF_WIDTH; bird.y = oldY;
      bird.vx = Math.min(-2, bird.vx * -.2); bird.vy *= .1;
    } else if (oldY >= NET_TOP && oldX > NET_X && bird.x < NET_X + NET_HALF_WIDTH) {
      bird.x = NET_X + NET_HALF_WIDTH; bird.y = oldY;
      bird.vx = Math.max(2, bird.vx * -.2); bird.vy *= .1;
    } else if (oldY < NET_TOP && bird.y > NET_TOP && Math.abs(bird.x - NET_X) < NET_HALF_WIDTH) {
      bird.y = NET_TOP; bird.vx *= .5; bird.vy *= -1;
      if (Math.abs(bird.vx) < 3) bird.vx = ((state.tick * 73 + state.round) % 2) ? -3 : 3;
    }
    if (bird.y >= GROUND) {
      bird.y = GROUND; bird.vy *= -.4;
      if (Math.abs(bird.vx) > 1) bird.vx *= .9;
      if (Math.abs(bird.vy) < .5) bird.vy = 0;
      else if (Math.abs(bird.vx) < 2) bird.vx = bird.vx > 0 ? .7 : -.7;
      if (Math.abs(bird.vx) < .5) bird.vx *= .1;
      if (state.rally === "flight") award(state, bird.x < NET_X ? 2 : 1);
    }
  }
  if (state.rally === "point" && --state.pointTicks <= 0) beginServe(state);
}

export function reconcile(snapshot: GameState, seat: number, pending: Input[]): { state: GameState; pending: Input[] } {
  const next = cloneState(snapshot);
  const remaining = pending.filter((input) => input.seq > snapshot.ack[seat - 1]).slice(-HZ * 2);
  // Prediction replays local movement only; scoring and ball physics stay authoritative.
  for (const input of remaining) {
    const player = next.players[seat - 1];
    player.x = clamp(player.x + (Number(input.right) - Number(input.left)) * 5.9,
      seat === 1 ? 50 : NET_X + 23, seat === 1 ? NET_X - 23 : 500);
  }
  return { state: next, pending: remaining };
}
