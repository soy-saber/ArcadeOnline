import { GameState, GROUND, HEIGHT, NET_TOP, NET_X, WIDTH } from "./core";

export class BadmintonView {
  private ctx: CanvasRenderingContext2D;
  private lastFrame = 0;
  private frames = 0;
  private fpsAt = performance.now();
  fps = 0;
  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = WIDTH * 2; canvas.height = HEIGHT * 2;
    this.ctx = canvas.getContext("2d")!;
  }
  render(state: GameState | null, seat: number | null): void {
    const ctx = this.ctx;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#9ccedb"); sky.addColorStop(.72, "#e8dfbf"); sky.addColorStop(1, "#d5ae78");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#789b88"; ctx.fillRect(0, 255, WIDTH, 30);
    for (let x = 0; x < WIDTH; x += 38) {
      ctx.fillStyle = x % 76 ? "#77907f" : "#6d8878";
      ctx.beginPath(); ctx.arc(x, 258, 18, Math.PI, 0); ctx.fill();
    }
    ctx.fillStyle = "#d8ad76"; ctx.fillRect(0, 282, WIDTH, HEIGHT - 282);
    ctx.fillStyle = "#c89862"; ctx.fillRect(0, GROUND + 2, WIDTH, 65);
    ctx.strokeStyle = "#fff1c9"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(12, GROUND + 1); ctx.lineTo(WIDTH - 12, GROUND + 1);
    ctx.moveTo(27, GROUND + 17); ctx.lineTo(WIDTH - 27, GROUND + 17);
    ctx.moveTo(NET_X, GROUND + 1); ctx.lineTo(NET_X, GROUND + 28); ctx.stroke();
    ctx.fillStyle = "#344d48"; ctx.fillRect(NET_X - 3, NET_TOP, 6, GROUND - NET_TOP);
    ctx.strokeStyle = "#e9e4d0"; ctx.lineWidth = 1;
    for (let y = NET_TOP + 9; y < GROUND; y += 10) { ctx.beginPath(); ctx.moveTo(NET_X - 12, y); ctx.lineTo(NET_X + 12, y); ctx.stroke(); }
    ctx.fillStyle = "#f6ebcf"; ctx.fillRect(NET_X - 13, NET_TOP - 3, 26, 4);
    if (state) {
      state.players.forEach((p, i) => this.player(p.x, p.y, i === 0 ? "#263a46" : "#8f4a39", p.swing, i === 0 ? 1 : -1, state.tick));
      const b = state.birdie;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
      ctx.fillStyle = "#f9f5e6"; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(-6, 3); ctx.lineTo(6, 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#e2b94f"; ctx.beginPath(); ctx.arc(0, 5, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.textAlign = "center"; ctx.font = "bold 18px system-ui"; ctx.fillStyle = "#263b3c";
      ctx.fillText(`${state.score[0]}  :  ${state.score[1]}`, NET_X, 38);
      ctx.font = "12px system-ui";
      ctx.fillText(`P1${seat === 1 ? " · 你" : ""}`, 105, 40);
      ctx.fillText(`P2${seat === 2 ? " · 你" : ""}`, 445, 40);
      if (state.phase === "waiting") this.banner("双方入座并准备后开始");
      else if (state.phase === "finished") this.banner(`P${state.winner} 获胜 · 点击准备再来一局`);
      else if (state.rally === "serve") this.banner(`P${state.serve} 发球 · 按 S / ↓`);
      else if (state.rally === "point") this.banner(`P${state.lastPoint} 得分`);
    } else this.banner("正在连接房间…");
    this.frames++;
    const now = performance.now();
    if (now - this.fpsAt >= 1000) { this.fps = Math.round(this.frames * 1000 / (now - this.fpsAt)); this.frames = 0; this.fpsAt = now; }
    this.lastFrame = now;
  }
  private player(x: number, y: number, color: string, swing: number, dir: number, tick: number): void {
    const ctx = this.ctx;
    const moving = Math.sin(tick * .5) * 3;
    ctx.strokeStyle = "#382d27"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y - 32); ctx.lineTo(x - 8, y - 15); ctx.lineTo(x - 11 + moving, y);
    ctx.moveTo(x - 8, y - 15); ctx.lineTo(x + 8, y - 15); ctx.lineTo(x + 13 - moving, y); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(x, y - 55); ctx.lineTo(x - 8, y - 15); ctx.stroke();
    ctx.fillStyle = "#efc9a1"; ctx.beginPath(); ctx.arc(x, y - 67, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#382d27"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x - 2, y - 46); ctx.lineTo(x + dir * 15, y - 42); ctx.lineTo(x + dir * 23, swing ? y - 66 : y - 36); ctx.stroke();
    ctx.strokeStyle = "#6a503a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + dir * 23, swing ? y - 66 : y - 36); ctx.lineTo(x + dir * 31, swing ? y - 87 : y - 69); ctx.stroke();
    ctx.save(); ctx.translate(x + dir * 34, swing ? y - 92 : y - 77); ctx.rotate(dir * .35);
    ctx.strokeStyle = "#eee2c6"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 17, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = .7; for (let k = -5; k <= 5; k += 5) { ctx.beginPath(); ctx.moveTo(k, -14); ctx.lineTo(k, 14); ctx.stroke(); }
    ctx.restore();
  }
  private banner(message: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#213b3bdc"; ctx.fillRect(90, 70, 370, 44);
    ctx.fillStyle = "#fff4d8"; ctx.textAlign = "center"; ctx.font = "bold 17px system-ui";
    ctx.fillText(message, NET_X, 98);
  }
}
