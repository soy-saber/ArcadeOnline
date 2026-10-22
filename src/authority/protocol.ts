import { GameState as BombState, cloneState as cloneBomb, validState as validBomb } from "./bomb-core";
import { GameState as BadmintonState, validState as validBadminton } from "../badminton/core";
import { State as ExpandedState } from "../expanded/types";
import { getAdapter } from "../expanded/registry";

export type State = BombState | BadmintonState | ExpandedState;
export type Cells = Partial<Record<"board" | "items" | "flames" | "flameOwners" | "ice", [number, number | string | null][]>>;
export interface Update {
  t: "auth"; kind: "full" | "delta"; round: number; tick: number;
  serverTime: number; hash: string; state?: State; base?: number;
  patch?: Record<string, unknown>; cells?: Cells;
}
const grids = ["board", "items", "flames", "flameOwners", "ice"] as const;
const scalarGrid = (value: unknown): value is (number | string | null)[] => Array.isArray(value) && value.every((cell) => cell === null || typeof cell === "number" || typeof cell === "string");
const valid = (state: unknown): state is State => {
  if (state && typeof state === "object" && "gameId" in state) return getAdapter(String(state.gameId))?.valid(state) || false;
  return validBomb(state) || validBadminton(state);
};

// Object key order must not affect checksums after a delta is reconstructed.
// This checksum detects accidental drift; it is not an authentication primitive.
export function hashState(state: State): string {
  let hash = 2166136261;
  const add = (text: string) => { for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); };
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { add("["); for (const item of value) { visit(item); add(","); } add("]"); }
    else if (value && typeof value === "object") {
      add("{");
      for (const key of Object.keys(value).sort()) {
        const child = (value as Record<string, unknown>)[key];
        if (child === undefined) continue;
        add(JSON.stringify(key)); add(":"); visit(child); add(",");
      }
      add("}");
    } else add(JSON.stringify(value) ?? "null");
  };
  visit(state); return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createUpdate(base: State | null, next: State, serverTime: number, full = false): Update {
  const envelope: Update = { t: "auth", kind: "full", round: next.round, tick: next.tick, serverTime, hash: hashState(next) };
  if (full || !base || base.round !== next.round || next.tick <= base.tick) return { ...envelope, state: cloneBomb(next as BombState) as State };
  const before = base as unknown as Record<string, unknown>, after = next as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {}, cells: Cells = {};
  for (const key of Object.keys(after)) {
    if (grids.includes(key as typeof grids[number]) && scalarGrid(after[key]) && scalarGrid(before[key]) && after[key].length === before[key].length) {
      const a = after[key] as (number | string | null)[], b = before[key] as (number | string | null)[];
      const changes: [number, number | string | null][] = [];
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changes.push([i, a[i]]);
      if (changes.length) cells[key as typeof grids[number]] = changes;
    } else if (JSON.stringify(after[key]) !== JSON.stringify(before[key])) patch[key] = after[key];
  }
  return { ...envelope, kind: "delta", base: base.tick, patch, ...(Object.keys(cells).length ? { cells } : {}) };
}

// A missing delta baseline or checksum mismatch requires a fresh full state.
export function applyUpdate(current: State | null, message: Update): State | null {
  if (!message || message.t !== "auth" || !Number.isSafeInteger(message.round) || !Number.isSafeInteger(message.tick) ||
      !Number.isFinite(message.serverTime) || typeof message.hash !== "string") return null;
  if (current && (message.round < current.round || (message.round === current.round && message.tick < current.tick))) return null;
  let next: State;
  if (message.kind === "full") {
    if (!valid(message.state)) return null;
    next = JSON.parse(JSON.stringify(message.state)) as State;
  } else if (message.kind === "delta") {
    if (!current || current.round !== message.round || message.base !== current.tick || message.tick <= current.tick ||
        !message.patch || typeof message.patch !== "object" || Array.isArray(message.patch)) return null;
    next = JSON.parse(JSON.stringify(current)) as State;
    const target = next as unknown as Record<string, unknown>;
    for (const key of Object.keys(message.patch)) {
      if (!(key in target) || ["__proto__", "constructor", "prototype"].includes(key)) return null;
      target[key] = message.patch[key];
    }
    if (message.cells) for (const [key, changes] of Object.entries(message.cells)) {
      if (!grids.includes(key as typeof grids[number]) || !Array.isArray(target[key]) || !Array.isArray(changes)) return null;
      const array = target[key] as unknown[];
      if (changes.length > array.length) return null;
      const seen = new Set<number>();
      for (const pair of changes) {
        if (!Array.isArray(pair) || pair.length !== 2 || !Number.isInteger(pair[0]) || pair[0] < 0 || pair[0] >= array.length || seen.has(pair[0])) return null;
        seen.add(pair[0]); array[pair[0]] = pair[1];
      }
    }
    if (!valid(next)) return null;
  } else return null;
  if (next.round !== message.round || next.tick !== message.tick || hashState(next) !== message.hash) return null;
  return next;
}
