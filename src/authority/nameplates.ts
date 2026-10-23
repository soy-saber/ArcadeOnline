import type { State } from "./protocol";
import { position } from "./bomb-core";
import brawlerData from "../expanded/brawler-data.json";
import { camera as boxheadCamera } from "../expanded/boxhead-world";
import { BOMB_FIELD_WIDTH } from './bomb-status';
import { BOMB2_FIELD_WIDTH, bomb2Weapon } from '../expanded/bomb2-status';

interface Anchor { seat: number; x: number; y: number }
export function nameAnchors(state: State, width: number, height: number): Anchor[] {
  return state.players.filter((p) => p.alive !== false && !p.respawn && !(p.respawnAt > state.tick) &&
    (!("options" in state) || state.options.mode !== "online" || state.options.activeSeats.includes(p.seat)))
    .map((p): Anchor => {
      let x = p.x, y = p.y;
      if (!("gameId" in state)) {
        if ("board" in state) { const pos = position(p); x = 28 + (pos.x + .5) * 44; y = 66 + (pos.y + 1) * 44 - (p.weapon&&p.ammo>0?87:67); }
        else { x *= 2; y = Math.max(108, y - 96) * 2; }
      } else if (state.gameId === "9109-server") {
        const vectors = [[-1,0],[0,-1],[1,0],[0,1]], delta = vectors[p.moveDir] || [0,0], f = p.progress / p.moveTicks;
        x = 45 + (p.x + .5 + delta[0] * f) * 30; y = 66 + (p.y + 1 + delta[1] * f) * 30 - (bomb2Weapon(state,p)?72:53);
      } else if (state.gameId === "137953-server") {
        const scale = Math.min(680 / (state.width * 50), 365 / (state.height * 50));
        x = (712 - state.width * 50 * scale) / 2 + p.x * scale;
        y = 48 + (365 - state.height * 50 * scale) / 2 + (p.y + 18) * scale;
      } else if (state.gameId === "6232-server") {
        const bounds = brawlerData.stages.find((stage) => stage.id === state.mapId)!.bounds;
        const worldW = bounds[2] - bounds[0], worldH = bounds[3] - bounds[1];
        const scale = Math.min(width / worldW, (height - 75) / worldH);
        x = (width - worldW * scale) / 2 + (p.x - bounds[0]) * scale;
        y = 45 + (p.y - bounds[1] - 49) * scale;
      } else if (state.gameId === "fbw_forest-server") { x *= width / 1248; y = (p.y - 82) * height / 928; }
      else if (state.gameId === "50737-server") { const cam=boxheadCamera(state,width,height);x=cam.x+p.x*cam.scale;y=cam.y+(p.y-87)*cam.scale; }
      else y -= 46;
      const fieldWidth='gameId' in state?state.gameId==='9109-server'?BOMB2_FIELD_WIDTH:width:'board' in state?BOMB_FIELD_WIDTH:width;
      return { seat: p.seat, x: Math.max(36, Math.min(fieldWidth - 36, x)), y: Math.max(12, Math.min(height - 20, y)) };
    });
}

export class Nameplates {
  private layer = document.createElement("div");
  private labels = new Map<number, HTMLSpanElement>();
  constructor(stage: HTMLElement) { this.layer.className = "player-nameplates"; stage.append(this.layer); }
  render(state: State | null, canvas: HTMLCanvasElement, members: {seat: number | null; name: string}[], ownSeat: number | null): void {
    this.layer.style.left = `${canvas.offsetLeft}px`; this.layer.style.top = `${canvas.offsetTop}px`;
    this.layer.style.width = `${canvas.clientWidth}px`; this.layer.style.height = `${canvas.clientHeight}px`;
    const scale=Math.min(canvas.clientWidth/canvas.width,canvas.clientHeight/canvas.height);
    const unit=state&&'gameId' in state&&state.gameId==='50737-server'?Math.min(1.5,boxheadCamera(state,canvas.width,canvas.height).scale):1;
    const fullscreen=!!document.fullscreenElement||document.body.classList.contains('game-fullscreen');
    this.layer.style.setProperty('--name-font',`${Math.max(6,Math.min(fullscreen?16:11,10*scale*unit))}px`);
    this.layer.style.setProperty('--name-line',`${Math.max(8,Math.min(fullscreen?19:13,12*scale*unit))}px`);
    this.layer.style.setProperty('--name-width',`${Math.max(32,Math.min(fullscreen?112:86,86*scale*unit))}px`);
    this.layer.style.setProperty('--name-pad',`${Math.max(1,2*scale)}px`);
    const anchors = state && state.phase === "playing" ? nameAnchors(state, canvas.width, canvas.height) : [];
    const visible = new Set<number>();
    const placed:{left:number;right:number;top:number;bottom:number}[]=[];
    for (const anchor of anchors) {
      const member = members.find((member) => member.seat === anchor.seat); if (!member) continue;
      visible.add(anchor.seat);
      let label = this.labels.get(anchor.seat);
      if (!label) { label = document.createElement("span"); label.className = "player-nameplate"; label.dataset.playerSeat = String(anchor.seat); this.labels.set(anchor.seat, label); this.layer.append(label); }
      if (label.textContent !== member.name) { label.textContent = member.name; label.title = member.name; }
      label.hidden = false; label.classList.toggle("mine", ownSeat === anchor.seat);
      const half = label.offsetWidth / 2;
      const x = Math.max(half, Math.min(canvas.clientWidth - half, anchor.x / canvas.width * canvas.clientWidth));
      let top=Math.max(0,Math.min(canvas.clientHeight-label.offsetHeight,anchor.y/canvas.height*canvas.clientHeight));
      for(let attempt=0;attempt<8;attempt++){
        const overlap=placed.find(r=>x+half+2>r.left&&x-half-2<r.right&&top+label.offsetHeight+1>r.top&&top-1<r.bottom);
        if(!overlap)break;
        const above=overlap.top-label.offsetHeight-2;
        top=above>=0?above:Math.min(canvas.clientHeight-label.offsetHeight,overlap.bottom+2);
      }
      placed.push({left:x-half,right:x+half,top,bottom:top+label.offsetHeight});
      label.style.left = `${x}px`; label.style.top = `${top}px`;
    }
    for (const [seat, label] of this.labels) if (!visible.has(seat)) label.hidden = true;
  }
}
