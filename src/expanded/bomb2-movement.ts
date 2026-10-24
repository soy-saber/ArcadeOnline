import type {State} from './types';
import {CELL,moveRight,moveLeft,moveUp,moveDown,type MotionMap,type MovingBody} from './bomb2-motion';
import {walkingAt,moveWalking,stopWalking,type Walking} from './bomb2-walking';
import {conveyorDirection,CONVEYOR_SPEED,KICK_SPEED} from './bomb2-conveyor';
import {burningBombAt} from './bomb2-blasts';
import VEHICLES from './bomb2-vehicle-art.json';
const dirs=[[-1,0],[0,-1],[1,0],[0,1]];
export function syncWalking(p:any):Walking {
  // Grid relocations (spawn, sand, spring) also relocate the continuous body.
  if(!p.walking||p.walking.gridX!==p.x||p.walking.gridY!==p.y)p.walking=walkingAt(p.x,p.y);
  return p.walking;
}
export function relocate(p:any,x:number,y:number):void {p.x=x;p.y=y;p.walking=walkingAt(x,y);p.progress=0;p.moveDir=-1;}
export function conveyActor(s:State,p:any):void {
  const body=syncWalking(p);if(p.vehicle!==11)convey(s,body,motionMap(s,p,p),true);register(p,body);
}
export function coastActor(s:State,p:any):void {
  const body=syncWalking(p),ice=s.hazards.some((h:any)=>h.kind==='IceFace'&&h.x===p.x&&h.y===p.y);
  moveWalking(body,motionMap(s,p,p),-1,0,ice?.8:.6);register(p,body);
}
function tramBody(s:State):MovingBody|null {
  const rail=s.hazards.filter((h:any)=>h.kind==='Rail');if(!rail.length)return null;
  const n=Math.floor(s.tram),f=s.tram-n,a=rail[n%rail.length],b=rail[(n+1)%rail.length];
  return{x:(a.x+(b.x-a.x)*f)*CELL,y:(a.y+(b.y-a.y)*f)*CELL,w:CELL,h:CELL,blocked:false,aspect:{x:Math.sign(b.x-a.x),y:Math.sign(b.y-a.y)}};
}
export function moveActor(s:State,p:any,direction:number,onHit:(x:number,y:number)=>void):void {
  const body=syncWalking(p),map=motionMap(s,p,p,onHit);
  const ice=p.vehicle!==11&&s.hazards.some((h:any)=>h.kind==='IceFace'&&h.x===p.x&&h.y===p.y);
  const velocity=p.vehicle===12?VEHICLES.rules.bulldozerVelocity:p.vehicle===13?VEHICLES.rules.carVelocity:p.vehicle===14?VEHICLES.rules.frogVelocity:p.vehicle?1.5:1.5+(8-p.speed)*.3;
  const oldX=body.x,oldY=body.y;
  if(p.actionLock>0||p.attack)stopWalking(body);
  else moveWalking(body,map,direction,velocity,ice?.8:.6);
  if(p.walking!==body)return;
  if(p.vehicle!==11&&p.rideMotion?.kind!=='frog')convey(s,body,map,true);
  register(p,body);
  p.moveDir=body.x===oldX&&body.y===oldY?-1:Math.abs(body.x-oldX)>Math.abs(body.y-oldY)?body.x<oldX?0:2:body.y<oldY?1:3;
  p.progress=0;
}
function motionMap(s:State,actor:any,ignore:any,onHit?:(x:number,y:number)=>void):MotionMap {
  const tram=tramBody(s);
  return {moving:tram?[tram]:[],transSpeed:{x:actor?.walking?.transX||0,y:actor?.walking?.transY||0},onHit:onHit?[onHit]:[],
    passable(x,y){
      if(x<0||x>=17||y<0||y>=15)return false;
      const cell=s.board[y*17+x];if(cell===1||cell===2&&actor?.vehicle!==11)return false;
      if(s.bombs.some((b:any)=>b!==ignore&&b.slide<0&&b.x===x&&b.y===y&&b.kind!=='mine'))return false;
      if(burningBombAt(s,x,y,true))return false;
      if((actor?.vehicle===12||actor?.vehicle===13)&&s.hazards.some((h:any)=>h.kind==='SpringBoard'&&h.x===x&&h.y===y))return false;
      return !tram||Math.floor((tram.x+15)/CELL)!==x||Math.floor((tram.y+15)/CELL)!==y;
    },
    item(x,y){
      if(tram&&Math.floor((tram.x+15)/CELL)===x&&Math.floor((tram.y+15)/CELL)===y)return tram;
      const bomb=s.bombs.find((b:any)=>b!==ignore&&b.slide<0&&b.kind!=='mine'&&b.x===x&&b.y===y);
      const blast=burningBombAt(s,x,y,true);
      return bomb?syncWalking(bomb):blast?{x:blast.px,y:blast.py,w:CELL,h:CELL,blocked:false}:{x:x*CELL,y:y*CELL,w:CELL,h:CELL,blocked:false};
    }
  };
}
function convey(s:State,body:Walking,map:MotionMap,robot=false):void {
  const cx=Math.floor((body.x+15)/CELL),cy=Math.floor((body.y+15)/CELL);
  const conveyor=s.hazards.find((h:any)=>h.kind==='Transmittal'&&h.x===cx&&h.y===cy);
  if(conveyor){const dir=conveyorDirection(conveyor,s.tick);if(dir>=0){const [dx,dy]=dirs[dir];[moveLeft,moveUp,moveRight,moveDown][dir](body,map,CONVEYOR_SPEED*(dx||dy));if(robot){body.transX=dx*CONVEYOR_SPEED;body.transY=dy*CONVEYOR_SPEED;}}}
  else if(robot){body.transX=0;body.transY=0;}
}
function register(p:any,body:Walking):void {
  body.x=Math.max(0,Math.min(16*CELL,body.x));body.y=Math.max(0,Math.min(14*CELL,body.y));
  p.x=body.gridX=Math.floor((body.x+15)/CELL);p.y=body.gridY=Math.floor((body.y+15)/CELL);
}
export function moveBomb(s:State,bomb:any):void {
  const body=syncWalking(bomb),map=motionMap(s,null,bomb);
  body.blocked=false;
  if(bomb.slide>=0){
    // BombShoes removes the bomb from the grid and replaces its engine with
    // kickedFly. Fuse counting and conveyor movement resume after collision.
    if(bomb.kind!=='mine')bomb.explodeAt++;
    const dir=bomb.slide,[dx,dy]=dirs[dir];
    [moveLeft,moveUp,moveRight,moveDown][dir](body,map,KICK_SPEED*(dx||dy));
    if(body.blocked)bomb.slide=-1;
  }else convey(s,body,map);
  register(bomb,body);
}
export function validWalking(p:any):boolean {
  const b=p.walking;
  return !!b&&[b.x,b.y,b.vx,b.vy,b.gridX,b.gridY,b.transX,b.transY].every(Number.isFinite)&&b.x>=0&&b.x<=480&&b.y>=0&&b.y<=420&&Math.abs(b.vx)<=50&&Math.abs(b.vy)<=50&&Math.abs(b.transX)<=CONVEYOR_SPEED&&Math.abs(b.transY)<=CONVEYOR_SPEED&&b.w===CELL&&b.h===CELL&&typeof b.blocked==='boolean'&&b.gridX===p.x&&b.gridY===p.y;
}
