import { State } from "./protocol";
import { GameState as BombState, Input as BombInput, Player as BombPlayer, HEIGHT, WIDTH, index, position } from "./bomb-core";
import { GameState as BadmintonState, Input as BadmintonInput, GROUND, movePlayer } from "../badminton/core";
import { Input as ExpandedInput } from "../expanded/types";
import { getAdapter } from "../expanded/registry";

export type Input = BombInput | BadmintonInput | ExpandedInput;
interface Sample { state: State; time: number; receivedAt: number }
interface Pending { input: Input; at: number }
export const PREDICTION_MS = 200;
export const INTERPOLATION_MS = 90;
export const isBomb = (state: State): state is BombState => !("gameId" in state) && "board" in state;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
const vectors: readonly (readonly [number, number])[] = [[-1, 0], [0, -1], [1, 0], [0, 1]];

// This is exclusively a local visual movement preview. It never advances the
// world tick, items, bombs, damage, collision pushing, scoring or ball physics.
function bombMove(world: BombState, player: BombPlayer, dir: BombInput["dir"], fraction = 1): void {
  if (!player.alive || player.frozen > 0 || player.actionLock > 0) return;
  if (player.moveDir < 0 && dir >= 0) {
    player.dir = dir;
    const [dx, dy] = vectors[dir], x = player.x + dx, y = player.y + dy;
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || world.board[index(x, y)] !== 0 ||
        world.ice[index(x, y)] > world.tick || world.bombs.some((bomb) => bomb.x === x && bomb.y === y)) return;
    player.moveDir = dir; player.progress = 0; player.moveTicks = player.slow > 0 ? 20 : player.speed;
  }
  if (player.moveDir >= 0) {
    player.progress += fraction;
    if (player.progress >= player.moveTicks) {
      const [dx, dy] = vectors[player.moveDir];
      player.x += dx; player.y += dy; player.moveDir = -1; player.progress = 0;
    }
  }
}

export class Presentation {
  state: State | null = null;
  reconciliations = 0;
  discardedPredictions = 0;
  predictionSteps = 0;
  private samples: Sample[] = [];
  private pending: Pending[] = [];
  private latest: Sample | null = null;
  private changed = false;
  private stale = false;
  private inputFloor = 0;
  constructor(private requestFull: () => void) {}
  receive(state: State, time: number, receivedAt: number): void {
    const previous = this.latest;
    if (!previous || previous.state.round !== state.round || receivedAt - previous.receivedAt > 350 || time - previous.time > 350) {
      this.clearPrediction(); this.samples = []; this.inputFloor = receivedAt;
    }
    this.latest = { state, time, receivedAt }; this.samples.push(this.latest);
    this.samples = this.samples.filter((sample) => time - sample.time <= 300).slice(-6);
    this.changed = true; this.stale = false;
  }
  input(input: Input, at: number): void { this.pending.push({ input: { ...input }, at }); this.pending = this.pending.slice(-10); }
  clearPrediction(): void { if (this.pending.length) this.discardedPredictions++; this.pending = []; }
  render(now: number, serverNow: number, seat: number | null, held: Input | null, hz: number): State | null {
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
      this.stale = true; this.clearPrediction(); this.samples = [latest]; this.inputFloor = now; this.requestFull();
    }
    const next = copy(latest.state);
    if (next.phase !== "playing" || this.stale) return this.state = next;
    // Interpolate remote poses without advancing game rules or replaying time.
    if ("gameId" in next) {
      const adapter = getAdapter(next.gameId);
      const target = serverNow - INTERPOLATION_MS;
      const before = [...this.samples].reverse().find((sample) => sample.time <= target);
      const after = this.samples.find((sample) => sample.time >= target);
      if (before && after && before !== after && before.state.round === next.round && after.state.round === next.round && after.time - before.time <= 200) {
        const amount = Math.max(0, Math.min(1, (target - before.time) / (after.time - before.time)));
        for (const player of next.players) {
          if (player.seat === seat || !player.alive || player.respawn || player.respawnAt > next.tick) continue;
          const a = before.state.players.find((p) => p.seat === player.seat), b = after.state.players.find((p) => p.seat === player.seat);
          if (!a || !b || !a.alive || !b.alive || a.respawn || b.respawn || a.respawnAt > before.state.tick || b.respawnAt > after.state.tick) continue;
          const pose = (p: any) => {
            const vector = p.moveDir >= 0 ? vectors[p.moveDir] : null, f = vector ? p.progress / Math.max(1, p.moveTicks) : 0;
            return { x: p.x + (vector?.[0] || 0) * f, y: p.y + (vector?.[1] || 0) * f };
          };
          const start = pose(a), end = pose(b), limit = "board" in next ? 2 : 100;
          if (Math.hypot(end.x - start.x, end.y - start.y) > limit) continue;
          player.x = mix(start.x, end.x, amount); player.y = mix(start.y, end.y, amount);
          if ("moveDir" in player) { player.progress = 0; player.moveDir = -1; }
          if (Number.isFinite(a.angle) && Number.isFinite(b.angle)) player.angle = a.angle + Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle)) * amount;
        }
      }
      if (adapter?.predict && seat && held && age <= PREDICTION_MS) {
        const entries = this.pending.filter((entry) => entry.at >= this.inputFloor && now - entry.at <= PREDICTION_MS);
        for (const entry of entries.slice(-Math.ceil(hz * PREDICTION_MS / 1000))) {
          adapter.predict(next, seat, entry.input as ExpandedInput, 1); this.predictionSteps++;
        }
      }
      return this.state = next;
    }

    const target = serverNow - INTERPOLATION_MS;
    const before = [...this.samples].reverse().find((sample) => sample.time <= target);
    const after = this.samples.find((sample) => sample.time >= target);
    if (before && after && before !== after && before.state.round === next.round && after.state.round === next.round &&
        before.state.phase === after.state.phase && after.time - before.time <= 200) {
      const amount = Math.max(0, Math.min(1, (target - before.time) / (after.time - before.time)));
      for (let i = 0; i < next.players.length; i++) {
        if (i === (seat || 0) - 1) continue;
        if (isBomb(next) && isBomb(before.state) && isBomb(after.state)) {
          if (!next.players[i].alive || before.state.players[i].alive !== after.state.players[i].alive) continue;
          const a = position(before.state.players[i]), b = position(after.state.players[i]);
          if (Math.hypot(b.x - a.x, b.y - a.y) > 2) continue;
          next.players[i].x = mix(a.x, b.x, amount); next.players[i].y = mix(a.y, b.y, amount); next.players[i].progress = 0;
        } else if (!isBomb(next) && !isBomb(before.state) && !isBomb(after.state)) {
          next.players[i].x = mix(before.state.players[i].x, after.state.players[i].x, amount);
          next.players[i].y = mix(before.state.players[i].y, after.state.players[i].y, amount);
        }
      }
      if (!isBomb(next) && !isBomb(before.state) && !isBomb(after.state) &&
          before.state.rally === "flight" && after.state.rally === "flight" && before.state.lastPoint === after.state.lastPoint) {
        next.birdie.x = mix(before.state.birdie.x, after.state.birdie.x, amount);
        next.birdie.y = mix(before.state.birdie.y, after.state.birdie.y, amount);
      }
    }
    if (!seat || !held || !next.players[seat - 1] || age > PREDICTION_MS) return this.state = next;
    // Pending input history is bounded in real time; a backlog never triggers
    // seconds of replay. Use the latest held input for any fractional preview.
    const entries = this.pending.filter((entry) => entry.at >= this.inputFloor && now - entry.at <= PREDICTION_MS);
    const frameMs = 1000 / hz;
    const total = Math.min(hz * PREDICTION_MS / 1000, entries.length + Math.max(0, now - (entries[entries.length - 1]?.at ?? now)) / frameMs);
    for (let i = 0; i < Math.ceil(total); i++) {
      const input = entries[i]?.input || held, fraction = Math.min(1, total - i);
      if (isBomb(next)) bombMove(next, next.players[seat - 1], (input as BombInput).dir, fraction);
      else {
        const item = input as BadmintonInput, local = next.players[seat - 1];
        const originalX = local.x;
        movePlayer(next as BadmintonState, seat as 1 | 2, Number(item.right) - Number(item.left));
        local.x = mix(originalX, local.x, fraction);
        if (fraction === 1) {
          local.y = Math.min(GROUND, local.y + local.vy + 1);
          local.vy = local.y >= GROUND ? 0 : local.vy + 1;
          if (item.jump > local.lastJump) { local.lastJump = item.jump; if (next.serve !== seat && local.y >= GROUND) local.vy = -12; }
        }
      }
      this.predictionSteps++;
    }
    // Keep every gameplay field from the confirmed snapshot. Only local pose
    // fields (movement and jump height) above are allowed to differ.
    return this.state = next;
  }
}
