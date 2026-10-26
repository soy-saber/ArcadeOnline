import { GameState, HEIGHT, WIDTH,actorKey } from "./core";
import characters from './character-art.json';
import {bodyPose} from './motion';
import ballArt from './ball-art.json';
import solo from './solo-art.json';

const ASSET_ROOT = "/authority/assets/badminton/";
type ImageKey = string;

export class BadmintonView {
  private ctx: CanvasRenderingContext2D;
  private images = new Map<ImageKey, HTMLImageElement>();
  private frames = 0;
  private fpsAt = performance.now();
  fps = 0;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = WIDTH * 2; canvas.height = HEIGHT * 2;
    this.ctx = canvas.getContext("2d")!;
    for (const name of ['court',...Object.keys(ballArt.art),...Object.values(characters.poses).flatMap(group=>Object.values(group).map(m=>m.file.replace('.png','')))])this.load(name);
    for(const side of ['p1','p2'] as const)for(const id of Object.values(solo.actors[side].racket))this.load((solo.exports as Record<string,{file:string}>)[String(id)].file.replace('.png',''));
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
    this.art('net',state?.net.frame??1);
    if (state) {
      // Native depths: net=27, P2=59998, P1=59999, bird=119999,
      // trail slots=180000+id. A playing net resumes rather than restarting.
      this.player(state,1);if(!state.robot)this.player(state,0);
      if (state.rally !== "serve") {
        const bird = state.birdie;
        const angle=bird.rotation*Math.PI/180,[dx,dy]=ballArt.shadowOffset;
        ctx.save();ctx.translate(bird.x+dx,bird.y+dy);ctx.rotate(angle);this.art('bird-shadow');ctx.restore();
        ctx.save();ctx.translate(bird.x,bird.y);ctx.rotate(angle);this.art('bird-glow');ctx.restore();
      }
      this.trails(state,'robot');if(state.robot)this.player(state,0);this.trails(state,'ball');
      if (state.phase === "waiting") this.banner(state.options.mode==='versus'?"双方入座并准备后开始":"P1 入座并准备后开始");
      else if (state.phase === "finished") this.banner(state.options.mode==='versus'?`P${state.winner} 获胜 · 即将开始下一局`:state.winner===2?'Good Try · 再试一次':state.level===6?'You Win · 六级挑战完成':`You Win · 前往第 ${state.level+1} 级`);
      else if(state.paused)this.banner('已暂停 · 按 P 继续');
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

  private trails(state:GameState,kind:'ball'|'robot'):void {
    const ctx=this.ctx;
    for(const p of state.particles.filter(p=>p.kind===kind).sort((a,b)=>a.id-b.id)){
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rotation*Math.PI/180);ctx.scale(p.scale,p.scale);
      if(kind==='ball')this.art('trail');else this.sheet(solo.exports['13']);
      ctx.restore();
    }
  }

  private sheet(m:{file:string;w:number;h:number;x:number;y:number},frame=1,x=0,y=0):void {
    const key=m.file.replace('.png','');if(!this.images.has(key))this.load(key);
    const image=this.images.get(key);
    if(image?.complete&&image.naturalWidth)this.ctx.drawImage(image,(frame-1)*m.w,0,m.w,m.h,x+m.x,y+m.y,m.w,m.h);
  }

  private art(key:keyof typeof ballArt.art,frame=1):void {
    const m=ballArt.art[key],image=this.images.get(key);
    if(image?.complete&&image.naturalWidth)this.ctx.drawImage(image,(frame-1)*m.w,0,m.w,m.h,m.x,m.y,m.w,m.h);
  }

  private player(state: GameState, index: number): void {
    const p = state.players[index];
    const profile=actorKey(state,index+1),actor=solo.actors[profile];
    const serving=state.serve===index+1;
    const id=actor.racket[serving?'serve':'swing'],frame=serving?p.racket.serveFrame:p.racket.frame;
    this.sheet((solo.exports as Record<string,{file:string;w:number;h:number;x:number;y:number}>)[String(id)],frame,p.x,p.y);
    // gunServe depth1 / gun depth8 precede the native body, head and shadow.
    const pose=bodyPose(index+1,p,state.tick,profile);this.sheet(pose.meta,pose.frame,p.x,p.y);
  }

  private banner(message: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#171717da"; ctx.fillRect(140, 67, 270, 33);
    ctx.fillStyle = "#f4eee8"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(message, 275, 88);
  }
}
