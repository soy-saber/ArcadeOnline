import type { State } from './types';
import { CELL } from './boxhead-world';
import { collideLine, affectLine } from './boxhead-rays';

interface Hooks {random():number;damage(target:any,amount:number,b:any):void;sound(name:string):void;effect(kind:string,x:number,y:number,life:number,extra:any):void}

export function rayShot(s:State,p:any,origin:{x:number;y:number;z:number},angle:number,damage:number,range:number,random:()=>number,delay=false):void {
  const dy=2+Math.floor(random()*4),dz=2+Math.floor(random()*4);
  s.bullets.push({id:++s.nextId,...origin,tx:origin.x+Math.cos(angle)*range*CELL,ty:origin.y+Math.sin(angle)*range*CELL,tz:origin.z,
    angle,vx:-Math.sin(angle)*dy||0,vy:Math.cos(angle)*dy||0,vz:dz,owner:p.seat,parent:p.id,weapon:p.weapon,damage,life:2,born:s.tick,
    ray:true,rayPhase:delay?'delay':'init'});
}

/** Init resolves the ray once, then immediately runs the first of two drift
 * callbacks. Delete still draws its terminal line until next-tick disposal. */
export function stepRay(s:State,b:any,h:Hooks):void {
  if(b.rayPhase==='delay'){b.rayPhase='init';return;}
  if(b.rayPhase==='init'){
    const rail=b.weapon===9,hit=collideLine(s,b.parent,b,{x:b.tx,y:b.ty},rail);
    if(hit){b.tx=hit.x;b.ty=hit.y;}
    if(rail){for(const p of affectLine(s,b.parent,b,{x:b.tx,y:b.ty}))h.damage(p,b.damage,b);}
    else if(hit){
      if(hit.thing)h.damage(hit.thing,b.damage,b);
      if(Math.floor(h.random()*3)===0)h.effect('Effect.BulletHit',b.tx,b.ty,14,{z:b.tz});
      h.sound(`Shot.HitWall.${1+Math.floor(h.random()*3)}.wav`);
    }
    b.rayPhase='normal';
  }
  b.vx*=.75;b.vy*=.75;b.vz*=.75;
  b.tx+=b.vx*.5;b.ty+=b.vy*.5;b.tz+=b.vz*.5;
  b.x+=b.vx;b.y+=b.vy;b.z+=b.vz;
  if(--b.life===0)b.rayPhase='delete';
}

/** Rocket has no fuse. Collision is tested before Move; its preconstructed
 * explosion shares the rocket position, so impact uses the last safe position. */
export function stepRocket(s:State,b:any,h:Hooks):boolean {
  if(Math.floor(h.random()*2))h.effect('Effect.RocketSmoke',b.x,b.y,7,{z:b.z,vx:-Math.cos(b.angle)*16||0,vy:-Math.sin(b.angle)*16||0});
  b.vx*=1.1;b.vy*=1.1;
  if(collideLine(s,b.parent,b,{x:b.x+b.vx,y:b.y+b.vy}))return true;
  b.x+=b.vx;b.y+=b.vy;return false;
}

export function validShot(b:any):boolean {
  if(b.ray===true)return [0,1,2,9].includes(b.weapon)&&['tx','ty','tz','z','vz','angle','parent'].every(k=>Number.isFinite(b[k]))&&
    b.z>=0&&b.tz>=0&&Number.isSafeInteger(b.parent)&&b.parent>0&&
    (['delay','init'].includes(b.rayPhase)?b.life===2:b.rayPhase==='normal'?b.life===1:b.rayPhase==='delete'&&b.life===0);
  if([0,1,2,9].includes(b.weapon)||b.ray!==undefined||b.tx!==undefined||b.ty!==undefined||b.rayPhase!==undefined)return false;
  if(b.weapon===7)return Number.isSafeInteger(b.parent)&&b.parent>0&&Number.isFinite(b.angle)&&b.life===1;
  return true;
}
