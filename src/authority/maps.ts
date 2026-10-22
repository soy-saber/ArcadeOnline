// Observed in DefineSprite_554 frame_1 and the brick/bg sprite timelines.
// These are five themes of the original randomized arena, not fixed layouts.
export const ORIGINAL_MAPS = [
  { id: "forest", label: "森林", sceneStyle: 0, floorFrames: [1, 2, 3], crateFrames: [1, 2, 3, 4, 5, 6], wallFrames: [7, 8, 9], landmarkFrames: [52] },
  { id: "desert", label: "沙漠", sceneStyle: 1, floorFrames: [4, 5], crateFrames: [10, 11, 12], wallFrames: [13, 14, 15, 16, 17, 18, 19], landmarkFrames: [53, 54] },
  { id: "city", label: "城市", sceneStyle: 2, floorFrames: [6, 7], crateFrames: [20, 21, 22, 23], wallFrames: [24, 25, 26, 27, 28, 29, 30, 31], landmarkFrames: [55, 56] },
  { id: "treasure", label: "藏宝", sceneStyle: 3, floorFrames: [8, 9, 10], crateFrames: [32, 33, 34, 35, 36, 37, 38], wallFrames: [39, 40, 41], landmarkFrames: [57] },
  { id: "candy", label: "糖果屋", sceneStyle: 4, floorFrames: [11, 12], crateFrames: [42, 43, 44, 45, 46, 47], wallFrames: [48, 49, 50, 51], landmarkFrames: [58] }
] as const;
export type OriginalMapId = typeof ORIGINAL_MAPS[number]["id"];
export type MapId = OriginalMapId | "classic" | "lanes" | "open";
export const MAP_IDS: readonly MapId[] = [...ORIGINAL_MAPS.map((map) => map.id), "classic", "lanes", "open"];
export const ORIGINAL_SPAWNS = [[3, 3], [11, 3], [3, 9], [11, 9]] as const;
export const ORIGINAL_WIDTH = 15, ORIGINAL_HEIGHT = 13;
// FFDec raster origin derived from union of DefineSprite_196 shape bounds.
export const BRICK_RASTER_ORIGIN = { x: -257 / 20, y: -760 / 20 };
export interface MapVisual { floor: number; landmark: number; tiles: number[] }
export const originalMap = (id: string) => ORIGINAL_MAPS.find((map) => map.id === id);

/** Port of the SWF's topology construction, including its unusual shuffle and
 * original iteration bound after prepending the sixteen spawn diagonals.
 * Flash random() is replaced with the authority's reproducible RNG. */
export function generateOriginalMap(id: OriginalMapId, random: () => number): { board: number[]; visual: MapVisual } {
  const map = originalMap(id)!;
  const at = (x: number, y: number) => y * ORIGINAL_WIDTH + x;
  const inside = (x: number, y: number) => x >= 0 && x < ORIGINAL_WIDTH && y >= 0 && y < ORIGINAL_HEIGHT;
  const board = Array<number>(ORIGINAL_WIDTH * ORIGINAL_HEIGHT).fill(0);
  const tiles = Array<number>(board.length).fill(0);
  const roll = (length: number) => Math.floor(random() * length);
  const shuffle = (values: readonly number[]) => {
    const result = [...values];
    const last = result[result.length - 1];
    for (let i = 0; i < result.length; i++) {
      const j = roll(result.length); [result[i], result[j]] = [result[j], result[i]];
    }
    if (last === result[0]) [result[0], result[result.length - 1]] = [result[result.length - 1], result[0]];
    return result;
  };
  const crates = shuffle(map.crateFrames), walls = shuffle(map.wallFrames);
  const floor = map.floorFrames[roll(map.floorFrames.length)];
  for (let y = 5; y <= 6; y++) for (let x = 6; x <= 7; x++) board[at(x, y)] = 1;
  const landmark = map.landmarkFrames.length === 1 ? map.landmarkFrames[0] : map.landmarkFrames[roll(map.landmarkFrames.length)];
  const cardinal = [[-1, 0], [0, -1], [1, 0], [0, 1]];
  const around = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
  const candidates: number[][] = [];
  for (let y = 0; y < ORIGINAL_HEIGHT; y++) for (let x = 0; x < ORIGINAL_WIDTH; x++) {
    if (!ORIGINAL_SPAWNS.some(([sx, sy]) => x === sx && y === sy || cardinal.some(([dx, dy]) => x === sx + dx && y === sy + dy))) candidates.push([x, y]);
  }
  const limit = candidates.length;
  for (let i = 0; i < limit; i++) {
    const j = roll(limit); [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const [sx, sy] of ORIGINAL_SPAWNS) for (let j = 1; j < 8; j += 2) candidates.unshift([sx + around[j][0], sy + around[j][1]]);
  // Accessing a missing Flash tile yields undefined; undefined != "" blocks.
  const emptyAt = (x: number, y: number) => inside(x, y) && board[at(x, y)] === 0;
  for (let i = 0; i < limit; i++) {
    const [x, y] = candidates[i];
    if (!emptyAt(x, y)) continue;
    const emptyNeighbor = (j: number) => emptyAt(x + around[j % 8][0], y + around[j % 8][1]);
    let blocked = false;
    for (let j = 0; j < 8; j += 2) if (!emptyNeighbor(j) && !emptyNeighbor(j + 1) && !emptyNeighbor(j + 2)) { blocked = true; break; }
    if (blocked) continue;
    let empty = emptyNeighbor(0), totalEmpty = empty ? 1 : 0, totalBrick = empty ? 0 : 1;
    for (let j = 1; j < 8; j++) {
      if (empty) { if (!emptyNeighbor(j)) { empty = false; totalBrick++; } }
      else if (emptyNeighbor(j)) {
        if (j % 2 === 0 || emptyNeighbor(j + 1)) { empty = true; totalEmpty++; }
        else j += 2;
      }
    }
    if (totalEmpty + totalBrick <= 3) { board[at(x, y)] = 1; tiles[at(x, y)] = walls[roll(2)]; }
  }
  // frame_2: every non-solid cell has a 60% crate chance, using the first four
  // entries of the randomized crate palette; then clear all four spawn crosses.
  for (let cell = 0; cell < board.length; cell++) if (board[cell] !== 1 && roll(100) < 60) {
    board[cell] = 2; tiles[cell] = crates[roll(Math.min(4, crates.length))];
  }
  for (const [sx, sy] of ORIGINAL_SPAWNS) for (const [dx, dy] of [[0, 0], ...cardinal]) {
    board[at(sx + dx, sy + dy)] = 0; tiles[at(sx + dx, sy + dy)] = 0;
  }
  return { board, visual: { floor, landmark, tiles } };
}
