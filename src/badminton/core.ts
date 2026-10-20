export const HZ = 35;
export const STEP_MS = 1000 / HZ;
export const WIDTH = 550;
export const HEIGHT = 400;
export const GROUND = 335;
export const NET_X = 275;
export const NET_TOP = 235;
export const TARGET = 7;

export interface Input { seq: number; left: boolean; right: boolean; jump: number; hit: number }
export interface Player { x: number; y: number; vy: number; swing: number; lastJump: number; lastHit: number; facing: number }
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
    { x: 125, y: GROUND, vy: 0, swing: 0, lastJump: 0, lastHit: 0, facing: 1 },
    { x: 425, y: GROUND, vy: 0, swing: 0, lastJump: 0, lastHit: 0, facing: -1 }
  ];
  return { round, tick: 0, phase: playing ? "playing" : "waiting", rally: "serve", serve: 1,
    winner: 0, score: [0, 0], players, birdie: { x: 155, y: GROUND - 69, vx: 0, vy: 0, lastHitter: 0 },
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
    Array.isArray(s.players) && s.players.length === 2 && s.players.every((p) => p && [p.x, p.y, p.vy, p.swing, p.lastJump, p.lastHit, p.facing].every(finite)) &&
    !!s.birdie && [s.birdie.x, s.birdie.y, s.birdie.vx, s.birdie.vy, s.birdie.lastHitter].every(finite) &&
    Array.isArray(s.ack) && s.ack.length === 2 && s.ack.every(finite) &&
    Array.isArray(s.inputs) && s.inputs.length === 2 && s.inputs.every(validInput);
}

function beginServe(state: GameState): void {
  state.rally = "serve";
  state.birdie = { x: state.players[state.serve - 1].x + (state.serve === 1 ? 28 : -28),
    y: state.players[state.serve - 1].y - 69, vx: 0, vy: 0, lastHitter: 0 };
  state.players.forEach((p) => { p.swing = 0; });
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
        state.birdie = { x: player.x + (i === 0 ? 28 : -28), y: player.y - 69,
          vx: i === 0 ? 10.5 : -10.5, vy: -12.5, lastHitter: i + 1 };
        player.swing = 9;
      } else if (state.rally === "flight" && player.swing === 0) player.swing = 9;
    }
  }
  const bird = state.birdie;
  if (state.rally === "serve") {
    const player = state.players[state.serve - 1];
    bird.x = player.x + (state.serve === 1 ? 28 : -28); bird.y = player.y - 69;
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
        bird.lastHitter = i + 1; player.swing = 0;
        break;
      }
    }
    const oldX = bird.x;
    bird.x += bird.vx;
    bird.y += bird.vy;
    bird.vy = bird.vy * .925 + .925;
    bird.vx *= .995;
    if (bird.x < 8 || bird.x > WIDTH - 8) { bird.x = clamp(bird.x, 8, WIDTH - 8); bird.vx *= -.65; }
    if ((oldX - NET_X) * (bird.x - NET_X) <= 0 && bird.y > NET_TOP) {
      bird.x = oldX < NET_X ? NET_X - 7 : NET_X + 7;
      bird.vx *= -.35;
    }
    if (bird.y >= GROUND - 7) { bird.y = GROUND - 7; award(state, bird.x < NET_X ? 2 : 1); }
  }
}

export function reconcile(snapshot: GameState, seat: number, pending: Input[]): { state: GameState; pending: Input[] } {
  const next = cloneState(snapshot);
  const remaining = pending.filter((input) => input.seq > snapshot.ack[seat - 1]).slice(-HZ * 2);
  // Prediction replays local movement only; scoring and ball physics stay authoritative.
  for (const input of remaining) {
    const player = next.players[seat - 1];
    player.x = clamp(player.x + (Number(input.right) - Number(input.left)) * 5.9,
      seat === 1 ? 22 : NET_X + 22, seat === 1 ? NET_X - 22 : WIDTH - 22);
  }
  return { state: next, pending: remaining };
}
