import { GameState, HZ, WIDTH, HEIGHT, ROUND_TICKS, position, index, WEAPONS, ITEM_LABELS, visibleSpecials } from "./bomb-core";
import { ORIGINAL_MAPS, BRICK_RASTER_ORIGIN, originalMap } from "./maps";

const CELL = 44, LEFT = 28, TOP = 66;
export class GameView {
  private ctx: CanvasRenderingContext2D;
  private images = new Map<string, HTMLImageElement>();
  private observedBombs = new Set<number>();
  private observedRound = 0;
  private observedSpecials = new Set<number>();
  private observedItems = 0;
  private audioReady = false;
  private playingSounds = new Set<HTMLAudioElement>();
  sound = true;
  volume = 0.24;
  fps = 0;
  private frameCount = 0;
  private fpsAt = performance.now();
  private finishedRound = 0;
  private finishedAt = 0;
  constructor(readonly canvas: HTMLCanvasElement) {
    canvas.width = LEFT * 2 + WIDTH * CELL;
    canvas.height = TOP + HEIGHT * CELL + 28;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    for (const name of ["floor", "crate", "wall", "bomb", "mine", "gas", "grenade", "fx-fire", "fx-ice", "fx-blast", "fx-death",
      ...["life", "push", "bomb", "shield", "range", "speed", ...WEAPONS].map((item) => `item-${item}`),
      ...[0, 1, 2, 3].map((d) => `rocket-${d}`),
      ...[1, 2, 3, 4].flatMap((hero) => [0, 1, 2, 3].flatMap((direction) => [`hero-${hero}-${direction}`, `walk-${hero}-${direction}`]))]) {
      const image = new Image(); image.src = `/authority/assets/${name}.png`; this.images.set(name, image);
    }
    for (const name of [
      ...new Set(ORIGINAL_MAPS.flatMap((map) => [...map.floorFrames].map((frame) => `floor-${frame}`))),
      ...Array.from({ length: 58 }, (_, i) => `brick-${i + 1}`)
    ]) {
      const image = new Image(); image.src = `/authority/assets/maps/${name}.png`; this.images.set(name, image);
    }
    window.addEventListener("pointerdown", () => { this.audioReady = true; });
    window.addEventListener("keydown", () => { this.audioReady = true; });
  }
  private animation(name: string, frame: number, x: number, bottom: number, width: number, height: number): void {
    const image = this.images.get(name);
    if (image?.complete && image.naturalWidth) this.ctx.drawImage(image, Math.max(0, Math.floor(frame)) % 8 * 64, 0, 64, 72, x - width / 2, bottom - height, width, height);
  }
  private walking(hero: number, direction: number, frame: number, x: number, bottom: number): void {
    const image = this.images.get(`walk-${hero}-${direction}`);
    if (!image?.complete || !image.naturalWidth) return;
    // Each 64×72 exported frame has transparent margins. Crop the shared
    // 40×49 body area so switching from the 53px standing sprite keeps scale.
    const width = 40 * CELL * 1.12 / 53;
    const height = CELL * 1.12;
    this.ctx.drawImage(image, Math.max(0, Math.floor(frame)) % 8 * 64 + 12, 23, 40, 49,
      x - width / 2, bottom - height, width, height);
  }
  private sprite(name: string, x: number, bottom: number, width: number, height: number): void {
    const image = this.images.get(name);
    if (!image?.complete || !image.naturalWidth) return;
    const scale = Math.min(width / image.width, height / image.height);
    this.ctx.drawImage(image, x - image.width * scale / 2, bottom - image.height * scale, image.width * scale, image.height * scale);
  }
  private mapBrick(frame: number, x: number, y: number): void {
    const image = this.images.get(`brick-${frame}`);
    if (!image?.complete || !image.naturalWidth) return;
    // Use the authored Flash registration point instead of fitting each prop
    // into a square. Original large landmarks span the central four cells.
    const scale = CELL / 30;
    this.ctx.drawImage(image, LEFT + x * CELL + BRICK_RASTER_ORIGIN.x * scale,
      TOP + y * CELL + BRICK_RASTER_ORIGIN.y * scale, image.width * scale, image.height * scale);
  }
  private play(name: string): void {
    if (!this.sound || !this.audioReady || this.volume <= 0) return;
    const audio = new Audio(`/authority/assets/${name}.mp3`); audio.volume = this.volume;
    this.playingSounds.add(audio);
    const done = () => this.playingSounds.delete(audio);
    audio.addEventListener("ended", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    void audio.play().catch(done);
  }
  setSound(enabled: boolean): void {
    this.sound = enabled;
    if (!enabled) for (const audio of this.playingSounds) { audio.pause(); audio.currentTime = 0; }
    if (!enabled) this.playingSounds.clear();
  }
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    for (const audio of this.playingSounds) audio.volume = this.volume;
  }
  // Only confirmed authority changes produce audio: prediction replay cannot
  // repeatedly play an explosion or an unconfirmed placement.
  confirm(state: GameState): void {
    const current = new Set(state.bombs.map((bomb) => bomb.id));
    const specials = new Set(state.specials.map((s) => s.id));
    const items = state.items.filter(Boolean).length;
    if (state.round === this.observedRound) {
      if ([...current].some((id) => !this.observedBombs.has(id))) this.play("place");
      if ([...this.observedBombs].some((id) => !current.has(id))) this.play("explode");
      if ([...specials].some((id) => !this.observedSpecials.has(id))) this.play("place");
      if (items < this.observedItems) this.play("item");
    }
    this.observedBombs = current; this.observedRound = state.round;
    this.observedSpecials = specials; this.observedItems = items;
  }
  render(state: GameState | null, seat: number | null): void {
    const now = performance.now();
    this.frameCount++;
    if (now - this.fpsAt >= 1000) { this.fps = Math.round(this.frameCount * 1000 / (now - this.fpsAt)); this.frameCount = 0; this.fpsAt = now; }
    const ctx = this.ctx;
    ctx.fillStyle = "#10272b"; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = "bold 21px system-ui"; ctx.fillStyle = "#f5f2db"; ctx.textAlign = "left";
    ctx.fillText(`泡泡堂 · ${state?.options.mode === "online" ? "多人联机" : state?.options.mode === "coop" ? "合作对抗" : state?.options.mode === "practice" ? "人机练习" : "双人对战"}`, LEFT, 39);
    if (!state) return;
    const theme = originalMap(state.options.map);
    const visual = state.mapVisual;
    const draws: { depth: number; draw: () => void }[] = [];
    if (theme && visual) draws.push({ depth: 6 * WIDTH + (WIDTH - 6), draw: () => this.mapBrick(visual.landmark, 6, 5) });
    ctx.textAlign = "right"; ctx.font = "600 18px system-ui";
    const seconds = Math.max(0, Math.ceil((ROUND_TICKS - state.tick) / HZ));
    ctx.fillText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, this.canvas.width - LEFT, 39);
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      const px = LEFT + x * CELL, py = TOP + y * CELL, cell = index(x, y);
      ctx.fillStyle = (x + y) % 2 ? "#b2c9a6" : "#bdd3b0"; ctx.fillRect(px, py, CELL, CELL);
      const floor = this.images.get(theme && visual ? `floor-${visual.floor}` : "floor");
      if (floor?.complete && floor.naturalWidth) ctx.drawImage(floor, px, py, CELL, CELL);
      if (state.options.map === "lanes" || state.options.map === "open") { ctx.fillStyle = state.options.map === "lanes" ? "#729cd333" : "#efc97044"; ctx.fillRect(px, py, CELL, CELL); }
      ctx.strokeStyle = "#23433b18"; ctx.strokeRect(px, py, CELL, CELL);
      if (state.board[cell] === 1) {
        if (theme && visual) {
          if (!(x >= 6 && x <= 7 && y >= 5 && y <= 6)) draws.push({ depth: y * WIDTH + (WIDTH - x), draw: () => this.mapBrick(visual.tiles[cell], x, y) });
        } else {
          ctx.fillStyle = "#536d66"; ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
          this.sprite("wall", px + CELL / 2, py + CELL - 2, CELL - 2, CELL - 1);
        }
      } else if (state.board[cell] === 2) {
        if (theme && visual) draws.push({ depth: y * WIDTH + (WIDTH - x), draw: () => this.mapBrick(visual.tiles[cell], x, y) });
        else this.sprite("crate", px + CELL / 2, py + CELL - 1, CELL - 2, CELL - 1);
      }
      if (state.flames[cell] > state.tick) {
        ctx.fillStyle = "#ffb631cc"; ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        ctx.fillStyle = "#fff1a5"; ctx.beginPath(); ctx.arc(px + CELL / 2, py + CELL / 2, 12 + Math.sin(now / 60) * 3, 0, Math.PI * 2); ctx.fill();
        this.animation("fx-blast", state.tick / 2, px + CELL / 2, py + CELL, CELL, CELL);
      } else if (state.ice[cell] > state.tick) {
        ctx.fillStyle = "#9cdef3bd"; ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        this.animation("fx-ice", state.tick / 4, px + CELL / 2, py + CELL, CELL, CELL);
      } else if (state.items[cell]) {
        const type = state.items[cell]!;
        this.sprite(`item-${type}`, px + CELL / 2, py + CELL - 2, CELL * .86, CELL * .9);
      }
    }
    for (const s of visibleSpecials(state, seat)) {
      let x = s.x, y = s.y, lift = 0;
      const age = state.tick - s.born;
      if (s.kind === "grenade") {
        const ratio = Math.min(1, age / 18), [dx, dy] = [[-1, 0], [0, -1], [1, 0], [0, 1]][Math.max(0, s.dir)];
        x += dx * ratio * 2; y += dy * ratio * 2; lift = Math.sin(ratio * Math.PI) * CELL;
      }
      if (s.kind === "fire" || s.kind === "ice") {
        const [dx, dy] = [[-1, 0], [0, -1], [1, 0], [0, 1]][Math.max(0, s.dir)];
        for (let d = 1; d <= s.distance; d++) {
          const cell = index(x + dx * d, y + dy * d);
          if ((s.kind === "fire" ? state.flames[cell] : state.ice[cell]) > state.tick)
            this.animation(`fx-${s.kind}`, age / 4, LEFT + (x + dx * d + .5) * CELL, TOP + (y + dy * d + 1) * CELL, CELL, CELL * 1.1);
        }
      } else {
        const specialX = x, specialY = y, specialLift = lift;
        draws.push({ depth: y * WIDTH + WIDTH - x - .5, draw: () => this.sprite(s.kind === "rocket" ? `rocket-${s.dir}` : s.kind, LEFT + (specialX + .5) * CELL, TOP + (specialY + 1) * CELL - specialLift, CELL * .85, CELL * .8) });
        if (s.kind === "mine" || s.kind === "gas") {
          ctx.fillStyle = s.kind === "mine" ? "#fd6670" : "#ac79ec";
          ctx.beginPath(); ctx.arc(LEFT + (x + .5) * CELL, TOP + (y + .75) * CELL, 3, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    for (const bomb of state.bombs) {
      const x = LEFT + (bomb.x + .5) * CELL, y = TOP + (bomb.y + 1) * CELL;
      draws.push({ depth: bomb.y * WIDTH + WIDTH - bomb.x - .5, draw: () => {
      this.sprite("bomb", x, y - 2, CELL * .85, CELL * .9);
      ctx.fillStyle = bomb.explodeAt - state.tick < 20 ? "#ff6a35" : "#ffdd73";
      ctx.beginPath(); ctx.arc(x + 5, y - CELL + 5, 3 + Math.sin(now / 55), 0, Math.PI * 2); ctx.fill();
      } });
    }
    for (const player of [...state.players].sort((a, b) => position(a).y - position(b).y)) {
      if (state.options.mode === "online" && !state.options.activeSeats?.includes(player.seat)) continue;
      const pos = position(player), x = LEFT + (pos.x + .5) * CELL, y = TOP + (pos.y + 1) * CELL;
      if (!player.alive) {
        if (state.tick - player.diedAt < 28) draws.push({ depth: pos.y * WIDTH + WIDTH - pos.x - player.seat / 10, draw: () => this.animation("fx-death", (state.tick - player.diedAt) / 4, x, y, CELL, CELL * 1.2) });
        continue;
      }
      draws.push({ depth: pos.y * WIDTH + WIDTH - pos.x - player.seat / 10, draw: () => {
      ctx.fillStyle = "#102b3a44"; ctx.beginPath(); ctx.ellipse(x, y - 3, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
      if (player.seat === seat || player.shield) {
        ctx.strokeStyle = player.shield ? "#f6ed8f" : "#ffffff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y - 3, 17, 7, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = player.invulnerable > 0 && state.tick % 4 < 2 ? .5 : 1;
      if (player.moveDir >= 0 && !player.frozen) this.walking(player.seat, Math.max(0, player.dir), state.tick / 2, x, y);
      else this.sprite(`hero-${player.seat}-${Math.max(0, player.dir)}`, x, y, CELL * .9, CELL * 1.12);
      ctx.globalAlpha = 1;
      if (player.frozen) { ctx.fillStyle = "#92dcff99"; ctx.fillRect(x - 15, y - 38, 30, 38); }
      if (player.slow) { ctx.strokeStyle = "#a97be3"; ctx.lineWidth = 3; ctx.strokeRect(x - 17, y - 5, 34, 5); }
      ctx.font = "bold 11px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "#173534";
      ctx.fillText(`P${player.seat}${player.life > 1 ? ` ♥${player.life}` : ""}`, x, y - CELL - 8);
      } });
    }
    for (const { draw } of draws.sort((a, b) => a.depth - b.depth)) draw();
    if (state.phase === "playing") for (const player of state.players) {
      if (!player.alive || !player.weapon || player.ammo <= 0) continue;
      const pos = position(player), x = LEFT + (pos.x + .5) * CELL, y = TOP + (pos.y + 1) * CELL;
      const label = `${ITEM_LABELS[player.weapon]} ×${player.ammo}`;
      ctx.save(); ctx.font = "bold 12px system-ui"; ctx.textAlign = "center";
      const width = ctx.measureText(label).width + 28;
      ctx.fillStyle = "#10272be8"; ctx.fillRect(x - width / 2, y - CELL - 45, width, 20);
      this.sprite(`item-${player.weapon}`, x - width / 2 + 10, y - CELL - 27, 16, 16);
      ctx.fillStyle = "#fff2b0"; ctx.fillText(label, x + 9, y - CELL - 30); ctx.restore();
    }
    if (state.phase !== "playing") {
      ctx.fillStyle = "#10272bd9"; ctx.fillRect(LEFT, TOP, WIDTH * CELL, HEIGHT * CELL);
      ctx.textAlign = "center"; ctx.fillStyle = "#fff5dc"; ctx.font = "bold 32px system-ui";
      const winner = !state.winner ? "平局" : state.options.mode === "coop" ? state.winner === 1 ? "合作队伍获胜" : "电脑队伍获胜" : `P${state.winner} 获胜`;
      ctx.fillText(state.phase === "waiting" ? "准备开局" : winner, this.canvas.width / 2, this.canvas.height / 2 - 12);
      ctx.font = "17px system-ui"; ctx.fillStyle = "#c3d5ca";
      if (state.phase === "finished" && state.round !== this.finishedRound) { this.finishedRound = state.round; this.finishedAt = now; }
      ctx.fillText(state.phase === "waiting" ? "至少两人入座，全员准备后开局" : `下一局将在 ${Math.max(0, Math.ceil((3000 - (now - this.finishedAt)) / 1000))} 秒后自动开始`, this.canvas.width / 2, this.canvas.height / 2 + 24);
    }
  }
}
