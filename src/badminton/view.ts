import { GameState, GROUND, HEIGHT, WIDTH } from "./core";
import geometry from './geometry.json';

const ASSET_ROOT = "/authority/assets/badminton/";
type ImageKey = "court" | "birdie" | "p1-body" | "p1-body-alt" | "p2-body" | "p2-head" | `${"p1" | "p2"}-${"swing" | "serve"}-${string}` | `p1-underhand-${string}`;

export class BadmintonView {
  private ctx: CanvasRenderingContext2D;
  private images = new Map<ImageKey, HTMLImageElement>();
  private frames = 0;
  private fpsAt = performance.now();
  fps = 0;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = WIDTH * 2; canvas.height = HEIGHT * 2;
    this.ctx = canvas.getContext("2d")!;
    for (const name of ["court", "birdie", "p1-body", "p1-body-alt", "p2-body", "p2-head"] as const) this.load(name);
    for (const side of ["p1", "p2"] as const) {
      for (let frame = 1; frame <= 15; frame++) this.load(`${side}-swing-${String(frame).padStart(2, "0")}`);
      for (let frame = 1; frame <= 13; frame++) this.load(`${side}-serve-${String(frame).padStart(2, "0")}`);
    }
    for (let frame = 1; frame <= 14; frame++) this.load(`p1-underhand-${String(frame).padStart(2, "0")}`);
  }

  private load(name: ImageKey): void {
    const image = new Image(); image.src = `${ASSET_ROOT}${name}.png`; this.images.set(name, image);
  }

  private draw(name: ImageKey, x: number, y: number): void {
    const image = this.images.get(name);
    if (image?.complete && image.naturalWidth) this.ctx.drawImage(image, x, y);
  }

  render(state: GameState | null, seat: number | null): void {
    const ctx = this.ctx;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = "#a5a29b"; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    this.draw("court", 0, 0);
    // The exported stage has its original title text; live score replaces it.
    ctx.fillStyle = "#171717"; ctx.fillRect(211, 15, 129, 37);
    ctx.fillStyle = "#f11920"; ctx.font = "bold 24px monospace"; ctx.textAlign = "center";
    ctx.shadowColor = "#f11920"; ctx.shadowBlur = 4;
    ctx.fillText(state ? `${String(state.score[0]).padStart(2, "0")} - ${String(state.score[1]).padStart(2, "0")}` : "00 - 00", 275, 42);
    ctx.shadowBlur = 0;
    if (state) {
      state.players.forEach((player, i) => this.player(state, i));
      if (state.rally !== "serve") {
        const bird = state.birdie;
        ctx.save(); ctx.translate(bird.x, bird.y);
        ctx.rotate(Math.atan2(bird.vy, bird.vx) + Math.PI / 2);
        this.draw("birdie", -20.5, -22);
        ctx.restore();
      }
      if (state.phase === "waiting") this.banner("双方入座并准备后开始");
      else if (state.phase === "finished") this.banner(`P${state.winner} 获胜 · 再次准备可重开`);
      else if (state.rally === "serve") this.banner(`P${state.serve} 发球 · 按 S / ↓`);
      else if (state.rally === "point") this.banner(`P${state.lastPoint} 得分`);
    } else this.banner("正在连接房间…");
    if (seat) {
      ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#191919";
      const player = state?.players[seat - 1];
      if (player) ctx.fillText("你", player.x, Math.max(115, player.y - 96));
    }
    this.frames++;
    const now = performance.now();
    if (now - this.fpsAt >= 1000) { this.fps = Math.round(this.frames * 1000 / (now - this.fpsAt)); this.frames = 0; this.fpsAt = now; }
  }

  private player(state: GameState, index: number): void {
    const p = state.players[index];
    const side = index === 0 ? "p1" : "p2";
    const moving = state.inputs[index].left !== state.inputs[index].right;
    const ctx = this.ctx;
    ctx.save(); ctx.translate(p.x, p.y);
    if (index === 0) this.draw(moving && p.y >= GROUND && state.tick % 2 === 0 ? "p1-body-alt" : "p1-body", -14, -78);
    else { this.draw("p2-body", -12, -62); this.draw("p2-head", -8, -81); }
    ctx.restore();

    const serving = p.servePose > 0 || (state.rally === "serve" && state.serve === index + 1);
    const kind = serving ? "serve" : p.underhand && p.swing > 0 ? "underhand" : "swing";
    const frame = p.swing > 0 ? (serving ? 15 - p.swing : 16 - p.swing) : 1;
    const bounded = Math.max(1, Math.min(serving ? 13 : kind === "underhand" ? 14 : 15, kind === "underhand" ? frame - 1 : frame));
    const key = `${side}-${kind}-${String(bounded).padStart(2, "0")}` as ImageKey;
    const meta=(geometry.art as Record<string,{x:number;y:number}>)[key];
    const matrix=geometry.gunMatrices[`${side}-${serving?'serve':'swing'}` as keyof typeof geometry.gunMatrices];
    ctx.save(); ctx.translate(p.x, p.y);ctx.transform(matrix[0],matrix[1],matrix[2],matrix[3],matrix[4],matrix[5]);
    this.draw(key,meta.x,meta.y);
    ctx.restore();
  }

  private banner(message: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#171717da"; ctx.fillRect(140, 67, 270, 33);
    ctx.fillStyle = "#f4eee8"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(message, 275, 88);
  }
}
