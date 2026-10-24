import type {State} from './types';
import ART from './bomb2-landform-art.json';
import {syncWalking,relocate,moveActor} from './bomb2-movement';
import {rideHead} from './bomb2-vehicles';
import {pauseAura,resumeAura,nativeHero,resetBody} from './bomb2-protection';
const DIRS=[[-1,0],[0,-1],[1,0],[0,1]],DIRECTION_NAMES=['left','up','right','down'];
export type Travel={kind:'spring';born:number;dir:number;targetX:number;targetY:number;stepX:number;stepY:number}|{kind:'sand';born:number;source:number;target:number;alpha:number};
export function enterLandform(s:State,p:any):void {
  if(p.travel||p.vehicle===11)return;
  const cell=p.y*17+p.x;if(p.sandCell!==cell)p.sandCell=-1;
  const index=s.hazards.findIndex((h:any)=>h.x===p.x&&h.y===p.y),h=s.hazards[index];if(!h)return;
  if(h.kind==='QuickSand'&&h.target!==undefined&&p.sandCell!==cell){
    p.sandCell=cell;p.travel={kind:'sand',born:s.tick,source:index,target:h.target,alpha:1};p.moveDir=-1;
    pauseAura(p);
    s.sandLights[h.target]=s.tick;advanceLandform(s,p);
  }else if(h.kind==='SpringBoard'&&!p.vehicle){
    const [dx,dy]=DIRS[p.dir],targetX=p.x+dx*ART.rules.springCells,targetY=p.y+dy*ART.rules.springCells;
    if(targetX<0||targetX>16||targetY<0||targetY>14)return;
    const b=syncWalking(p),stepX=dx?dx*ART.rules.springSpeed:-Math.sign(b.x-p.x*30),stepY=dy?dy*ART.rules.springSpeed:-Math.sign(b.y-p.y*30);
    p.travel={kind:'spring',born:s.tick,dir:p.dir,targetX,targetY,stepX,stepY};p.moveDir=-1;
  }
}
export function advanceLandform(s:State,p:any):void {
  const t=p.travel as Travel|null;if(!t)return;const b=syncWalking(p);
  if(t.kind==='sand'){
    if(t.alpha<ART.rules.sandTransferAlpha){
      const target=s.hazards[t.target],vx=b.vx,vy=b.vy;relocate(p,target.x,target.y);p.walking.vx=vx;p.walking.vy=vy;p.dir=3;p.sandCell=target.y*17+target.x;p.travel=null;
      resetBody(p);resumeAura(p);
      moveActor(s,p,-1,()=>{});
    }else t.alpha-=ART.rules.sandAlphaStep;
    return;
  }
  if(s.tick-t.born<ART.rules.springWaitFrames)return;
  const horizontal=t.dir===0||t.dir===2,position=horizontal?b.x:b.y,target=(horizontal?t.targetX:t.targetY)*30;
  if(Math.abs(position-target)<1){p.travel=null;p.moveDir=-1;return;}
  if(horizontal){b.x+=Math.abs(t.stepX)<Math.abs(target-b.x)?t.stepX:target-b.x;if(Math.abs(b.y-t.targetY*30)>1)b.y+=t.stepY;}
  else {b.y+=Math.abs(t.stepY)<Math.abs(target-b.y)?t.stepY:target-b.y;if(Math.abs(b.x-t.targetX*30)>1)b.x+=t.stepX;}
  p.x=b.gridX=Math.floor((b.x+15)/30);p.y=b.gridY=Math.floor((b.y+15)/30);p.moveDir=t.dir;p.progress=0;
}
export function jumpSprite(p:any,tick:number){
  const t=p.travel as Travel|null;if(t?.kind!=='spring')return null;
  const key=`jump-${p.character-1}-${DIRECTION_NAMES[t.dir]}` as keyof typeof ART.timelines,meta=ART.timelines[key],frame=Math.min(meta.frames-1,Math.max(0,tick-t.born));
  return {name:'native-'+key,meta,frame};
}
export function heroHead(p:any,tick:number):number {const sprite=jumpSprite(p,tick)||(!p.vehicle?nativeHero(p,tick):null);return sprite?sprite.meta.y+(sprite.meta.bounds[sprite.frame]?.[1]??0):rideHead(p)??-7;}
export function travelAlpha(p:any):number {return p.travel?.kind==='sand'?p.travel.alpha:1;}
export function sandFrame(tick:number):number {return tick===0?0:ART.rules.sandLoopStart-1+(tick-1)%(ART.rules.sandLoopEnd-ART.rules.sandLoopStart+1);}
export function validLandforms(s:State):boolean {
  const int=(v:any,min:number,max:number)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  if(!Array.isArray(s.hazards)||!Array.isArray(s.sandLights)||s.sandLights.length!==s.hazards.length||!s.sandLights.every((v:any,i:number)=>int(v,0,s.tick)&&(v===0||s.hazards[i]?.kind==='QuickSand')))return false;
  return s.players.every(p=>{
    if(!int(p.sandCell,-1,254))return false;const t=p.travel;
    if(t===null)return true;if(!t||!int(t.born,0,s.tick))return false;
    if(t.kind==='sand'){const h=s.hazards[t.source];return int(t.source,0,s.hazards.length-1)&&int(t.target,0,s.hazards.length-1)&&h?.kind==='QuickSand'&&h.target===t.target&&s.hazards[t.target]?.kind==='QuickSand'&&h.x===p.x&&h.y===p.y&&Number.isFinite(t.alpha)&&t.alpha>=.45&&t.alpha<=1;}
    if(t.kind!=='spring'||!int(t.dir,0,3))return false;const [dx,dy]=DIRS[t.dir],speed=ART.rules.springSpeed;
    return int(t.targetX,0,16)&&int(t.targetY,0,14)&&Number.isInteger(t.stepX)&&Number.isInteger(t.stepY)&&(dx?t.stepX===dx*speed:Math.abs(t.stepX)<=1)&&(dy?t.stepY===dy*speed:Math.abs(t.stepY)<=1);
  });
}
