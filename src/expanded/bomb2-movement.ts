import type {State} from './types';
import {CELL,moveRight,moveLeft,moveUp,moveDown,type MotionMap,type MovingBody} from './bomb2-motion';
import {walkingAt,moveWalking,stopWalking,type Walking} from './bomb2-walking';
const dirs=[[-1,0],[0,-1],[1,0],[0,1]];
export function syncWalking(p:any):Walking {
  // Grid relocations (spawn, sand, spring) also relocate the continuous body.
  if(!p.walking||p.walking.gridX!==p.x||p.walking.gridY!==p.y)p.walking=walkingAt(p.x,p.y);
  return p.walking;
}
export function relocate(p:any,x:number,y:number):void {p.x=x;p.y=y;p.walking=walkingAt(x,y);p.progress=0;p.moveDir=-1;}
function tramBody(s:State):MovingBody|null {
  const rail=s.hazards.filter((h:any)=>h.kind==='Rail');if(!rail.length)return null;
  const n=Math.floor(s.tram),f=s.tram-n,a=rail[n%rail.length],b=rail[(n+1)%rail.length];
  return{x:(a.x+(b.x-a.x)*f)*CELL,y:(a.y+(b.y-a.y)*f)*CELL,w:CELL,h:CELL,blocked:false,aspect:{x:Math.sign(b.x-a.x),y:Math.sign(b.y-a.y)}};
}
export function moveActor(s:State,p:any,direction:number,onHit:(x:number,y:number)=>void):void {
  const body=syncWalking(p),tram=tramBody(s),moving=tram?[tram]:[];
  const map:MotionMap={moving,transSpeed:{x:0,y:0},onHit:[onHit],
    passable(x,y){
      if(x<0||x>=17||y<0||y>=15)return false;
      const cell=s.board[y*17+x];if(cell===1||cell===2&&p.vehicle!==11)return false;
      if(s.bombs.some((b:any)=>b.x===x&&b.y===y&&b.kind!=='mine'))return false;
      if((p.vehicle===12||p.vehicle===13)&&s.hazards.some((h:any)=>h.kind==='SpringBoard'&&h.x===x&&h.y===y))return false;
      return !tram||Math.floor((tram.x+15)/CELL)!==x||Math.floor((tram.y+15)/CELL)!==y;
    },
    item(x,y){return tram&&Math.floor((tram.x+15)/CELL)===x&&Math.floor((tram.y+15)/CELL)===y?tram:{x:x*CELL,y:y*CELL,w:CELL,h:CELL,blocked:false};}
  };
  const ice=p.vehicle!==11&&s.hazards.some((h:any)=>h.kind==='IceFace'&&h.x===p.x&&h.y===p.y);
  const velocity=p.vehicle===12?1:p.vehicle===13?2.2:p.vehicle?1.5:1.5+(8-p.speed)*.3;
  if(p.actionLock>0||p.attack){stopWalking(body);p.progress=0;p.moveDir=-1;return;}
  const oldX=body.x,oldY=body.y;
  moveWalking(body,map,direction,velocity,ice?.8:.6);
  if(p.walking!==body)return; // A frog collision relocated the actor.
  const cx=Math.floor((body.x+15)/CELL),cy=Math.floor((body.y+15)/CELL);
  const conveyor=p.vehicle!==11?s.hazards.find((h:any)=>h.kind==='Transmittal'&&h.x===cx&&h.y===cy):null;
  if(conveyor){const dir=[-1,0,2,1,3][conveyor.dir];if(dir>=0){const [dx,dy]=dirs[dir];map.transSpeed={x:dx,y:dy};[moveLeft,moveUp,moveRight,moveDown][dir](body,map,dx||dy);}}
  body.x=Math.max(0,Math.min(16*CELL,body.x));body.y=Math.max(0,Math.min(14*CELL,body.y));
  p.x=body.gridX=Math.floor((body.x+15)/CELL);p.y=body.gridY=Math.floor((body.y+15)/CELL);
  p.moveDir=body.x===oldX&&body.y===oldY?-1:Math.abs(body.x-oldX)>Math.abs(body.y-oldY)?body.x<oldX?0:2:body.y<oldY?1:3;
  p.progress=0;
}
export function validWalking(p:any):boolean {
  const b=p.walking;
  return !!b&&[b.x,b.y,b.vx,b.vy,b.gridX,b.gridY].every(Number.isFinite)&&b.x>=0&&b.x<=480&&b.y>=0&&b.y<=420&&Math.abs(b.vx)<=50&&Math.abs(b.vy)<=50&&b.w===CELL&&b.h===CELL&&typeof b.blocked==='boolean'&&b.gridX===p.x&&b.gridY===p.y;
}
