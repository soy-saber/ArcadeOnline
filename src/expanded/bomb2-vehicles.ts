import type {State} from './types';
import ART from './bomb2-vehicle-art.json';
import {syncWalking,moveActor,conveyActor,coastActor} from './bomb2-movement';
import {stopWalking} from './bomb2-walking';
import {burningBombAt} from './bomb2-blasts';
const names:Record<number,string>={12:'bulldozer',13:'car',14:'frog'},directions=['left','up','right','down'];
export type RideMotion={kind:'frog';born:number;dir:number;targetX:number;targetY:number;stepX:number;stepY:number}|{kind:'wreck';born:number;dir:number}|{kind:'crush';born:number;dir:number};
export function rideMeta(p:any,dir=p.dir){return ART.timelines[`vehicle-${p.character-1}-${names[p.vehicle]}-${directions[dir]}` as keyof typeof ART.timelines];}
function animation(s:State,p:any){
  if(!names[p.vehicle]){p.rideAnim=null;return null;}
  if(!p.rideAnim||p.rideAnim.vehicle!==p.vehicle||p.rideAnim.dir!==p.dir)p.rideAnim={vehicle:p.vehicle,dir:p.dir,frame:0,playing:false,at:s.tick};
  return p.rideAnim;
}
export function mount(s:State,p:any,vehicle:number):void {
  if(!p.vehicle&&p.weapon&&p.ammo>0)p.pendingWeapon={kind:p.weapon,ammo:p.ammo,record:false};
  p.weapon=0;p.ammo=0;p.attack=null;p.actionLock=0;p.vehicle=vehicle;p.vehicleUntil=0;p.rideMotion=null;p.rideAnim=null;
  animation(s,p);
}
export function stashWeapon(p:any,kind:number,ammo:number):void {p.pendingWeapon={kind,ammo,record:true};}
export function startWreck(s:State,p:any):boolean {
  const meta=rideMeta(p);if(!meta)return false;
  p.travel=null;p.rideMotion={kind:'wreck',born:s.tick,dir:p.dir};p.attack=null;p.actionLock=0;
  p.rideAnim={vehicle:p.vehicle,dir:p.dir,frame:meta.labels.dead-1,playing:true,at:s.tick};
  return true;
}
export function startCrush(s:State,p:any):void {
  coastActor(s,p);p.rideMotion={kind:'crush',born:s.tick,dir:p.dir};
  const a=animation(s,p);if(a){a.playing=false;a.at=s.tick;}
}
export function startFrogJump(s:State,p:any,x:number,y:number):boolean {
  if(p.vehicle!==14||p.rideMotion||p.travel)return false;
  const b=syncWalking(p),horizontal=b.vy===0,dir=horizontal?(b.vx>0?2:b.vx<0?0:-1):b.vx===0?(b.vy>0?3:b.vy<0?1:-1):-1;
  if(dir<0)return false;
  const dx=dir===0?-1:dir===2?1:0,dy=dir===1?-1:dir===3?1:0,targetX=x+dx,targetY=y+dy;
  if(targetX<0||targetX>16||targetY<0||targetY>14||s.board[targetY*17+targetX]||s.bombs.some((q:any)=>q.slide<0&&q.x===targetX&&q.y===targetY)||burningBombAt(s,targetX,targetY))return false;
  const resistance=s.hazards.some((h:any)=>h.kind==='IceFace'&&h.x===p.x&&h.y===p.y)?.8:.6,speed=ART.rules.frogVelocity/(1-resistance);
  p.dir=dir;p.rideMotion={kind:'frog',born:s.tick,dir,targetX,targetY,stepX:dx?dx*speed:-Math.sign(b.x-p.x*30),stepY:dy?dy*speed:-Math.sign(b.y-p.y*30)};
  p.rideAnim={vehicle:14,dir,frame:ART.rules.frogJumpStart-1,playing:true,at:s.tick};
  return true;
}
export function advanceRide(s:State,p:any):void {
  const t=p.rideMotion as RideMotion|null;if(!t)return;
  const b=syncWalking(p);
  if(t.kind==='crush'){
    if(s.tick-t.born>=ART.rules.bulldozerPauseLimit+2){p.rideMotion=null;moveActor(s,p,-1,()=>{});}
    else conveyActor(s,p);
    return;
  }
  if(t.kind==='wreck'){
    const meta=rideMeta(p,t.dir),age=s.tick-t.born,length=meta.frames-meta.labels.dead+1;
    if(age>=length){
      p.vehicle=0;p.rideMotion=null;p.rideAnim=null;p.moveDir=-1;
      if(p.pendingWeapon){const held=p.pendingWeapon;p.weapon=held.kind;p.ammo=held.ammo;if(held.record){p.weaponStock.push(held.kind);p.weaponStock=p.weaponStock.slice(-32);}p.pendingWeapon=null;}
      moveActor(s,p,-1,()=>{});
    }else{
      p.rideAnim.frame=meta.labels.dead-1+age;p.rideAnim.at=s.tick;
      // outOfControl stops player movement; the native engine still conveys it.
      conveyActor(s,p);
    }
    return;
  }
  const horizontal=t.dir===0||t.dir===2,target=(horizontal?t.targetX:t.targetY)*30,position=horizontal?b.x:b.y;
  if(Math.abs(position-target)<1){stopWalking(b);p.rideMotion=null;p.moveDir=-1;p.rideAnim.frame=0;p.rideAnim.playing=false;p.rideAnim.at=s.tick;return;}
  if(horizontal){b.x+=Math.abs(t.stepX)<Math.abs(target-b.x)?t.stepX:target-b.x;if(Math.abs(b.y-t.targetY*30)>1)b.y+=t.stepY;}
  else{b.y+=Math.abs(t.stepY)<Math.abs(target-b.y)?t.stepY:target-b.y;if(Math.abs(b.x-t.targetX*30)>1)b.x+=t.stepX;}
  p.x=b.gridX=Math.floor((b.x+15)/30);p.y=b.gridY=Math.floor((b.y+15)/30);p.moveDir=t.dir;
}
export function updateRideAnimation(s:State,p:any,dir:number):void {
  const a=animation(s,p);if(!a||p.rideMotion?.kind==='wreck'||p.rideMotion?.kind==='crush')return;
  if(p.travel?.kind==='sand'){a.frame=0;a.playing=false;a.at=s.tick;return;}
  const meta=rideMeta(p),frog=p.vehicle===14;
  if(!p.rideMotion){if(dir>=0&&!p.actionLock&&!p.attack)a.playing=true;else if(!frog||a.frame===0)a.playing=false;}
  if(a.at<s.tick&&a.playing){
    a.frame++;
    const end=p.rideMotion?.kind==='frog'&&a.frame>=ART.rules.frogJumpStart-1?meta.loopEnds[1]:meta.loopEnds[0];
    if(a.frame>=end-1){a.frame=0;if(frog&&!p.rideMotion&&dir<0)a.playing=false;}
  }
  a.at=s.tick;
}
export function rideSprite(p:any){
  if(!names[p.vehicle])return null;
  const meta=rideMeta(p),frame=p.rideAnim?.vehicle===p.vehicle&&p.rideAnim?.dir===p.dir?p.rideAnim.frame:0;
  return {name:`native-vehicle-${p.character-1}-${names[p.vehicle]}-${directions[p.dir]}`,meta,frame};
}
export function rideHead(p:any):number|null {const sprite=rideSprite(p);return sprite?sprite.meta.y+(sprite.meta.bounds[sprite.frame]?.[1]??0):null;}
export function validRides(s:State):boolean {
  const int=(v:any,min:number,max:number)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  return s.players.every(p=>{
    const a=p.rideAnim,t=p.rideMotion,held=p.pendingWeapon;
    if(held!==null&&(!held||!p.vehicle||!int(held.kind,15,21)||!int(held.ammo,1,held.kind===17||held.kind===18?1:2)||typeof held.record!=='boolean'))return false;
    if(a!==null&&(!a||!names[p.vehicle]||a.vehicle!==p.vehicle||!int(a.dir,0,3)||a.dir!==p.dir||!int(a.frame,0,rideMeta(p).frames-1)||!int(a.at,0,s.tick)||typeof a.playing!=='boolean'))return false;
    if(t===null)return true;
    if(!t||!a||!names[p.vehicle]||!int(t.born,0,s.tick)||!int(t.dir,0,3)||t.dir!==p.dir)return false;
    if(t.kind==='wreck')return a.frame>=rideMeta(p).labels.dead-1;
    if(t.kind==='crush')return p.vehicle===12&&s.tick-t.born<ART.rules.bulldozerPauseLimit+2;
    if(t.kind!=='frog'||p.vehicle!==14||!int(t.targetX,0,16)||!int(t.targetY,0,14)||![t.stepX,t.stepY].every(Number.isFinite))return false;
    const main=t.dir===0||t.dir===2?t.stepX:t.stepY,side=t.dir===0||t.dir===2?t.stepY:t.stepX;
    return Math.sign(main)===(t.dir<2?-1:1)&&Math.abs(main)>=ART.rules.frogVelocity&&Math.abs(main)<=ART.rules.frogVelocity/(1-.8)+1e-9&&Number.isInteger(side)&&Math.abs(side)<=1;
  });
}
