import type { State } from './types';
import { CELL, room, solid, knockback } from './boxhead-world';
import { cell, reserve } from './boxhead-navigation';

export type HitKind='bullet'|'fireball'|'explosion'|'melee';
export interface Affect {kind:HitKind;damage:number;owner:number;sourceId:number|null;x:number;y:number;z:number;angle:number;range:number|null;born:number}
export function creatureBody(player:boolean,devil=false) {
  return {phase:player?'control':'normal',counter:0,action:'stand',frame:0,alpha:1,vx:0,vy:0,returnAngle:0,
    radius:(devil?.42:.45)*CELL,mass:player?2:devil?5:1,collidable:true,affectEnabled:true,deadFlag:false,floor:false,
    loggedKill:false,disposeAt:null as number|null,affects:[] as Affect[],damageSample:0,deathSample:0};
}
export function canAffect(p:any):boolean {return p.body.affectEnabled&&(!p.ai||p.ai.registered&&p.ai.collidable);}
export function queueAffect(s:State,p:any,kind:HitKind,damage:number,owner:number,source:{id?:number;x:number;y:number;z?:number;dir?:number;angle?:number},range:number|null=null):void {
  if(!canAffect(p))return;
  p.body.affects.push({kind,damage,owner,sourceId:source.id??null,x:source.x,y:source.y,z:source.z??0,angle:source.angle??source.dir??0,range,born:s.tick});
}
interface Hooks {random():number;sound(name:string):void;blood(p:any,size:number):void;dying(p:any):void;resume(p:any):void;respawn(p:any):boolean;playerDead(p:any):void}
function clearCell(s:State,p:any):void {if(p.ai)reserve(s,p,null);}
function dying(s:State,p:any,h:Hooks):void {
  const b=p.body;b.phase='dying';b.counter=0;b.action='dying';b.frame=0;b.deadFlag=true;b.collidable=false;b.affectEnabled=false;clearCell(s,p);
  h.sound(p.seat?'Creature.Player.Scream.1.wav':`Creature.Zombie.Ambience.${b.deathSample+1}.wav`);
  if(!b.loggedKill){b.loggedKill=true;h.dying(p);}
}
function processAffects(s:State,p:any,h:Hooks):void {
  const b=p.body,queued=b.affects;b.affects=[];
  if(!queued.length||p.invul>0)return;
  b.returnAngle=p.dir;
  for(const affect of [...queued].reverse()){
    const source=affect.sourceId===null?affect:[...s.players,...s.zombies,...s.bullets].find(v=>v.id===affect.sourceId)||affect;
    let damage=affect.damage;
    if(affect.kind==='explosion'){
      const distance=Math.hypot(p.x-source.x,p.y-source.y),fraction=distance/affect.range!;
      damage=fraction>1?0:damage*(fraction>.75?.5:fraction>.5?.75:1);
    }
    p.hp-=damage;p.hitAt=s.tick;if(p.seat)p.killedBy=affect.owner>0?affect.owner:0;else p.owner=affect.owner;
    const speed=affect.kind==='explosion'?Math.min(damage/5*2/CELL/b.mass,.3):affect.kind==='melee'?Math.max(damage/5/CELL/b.mass,.3):Math.max(damage/5*2/CELL,.3)/b.mass;
    const dx=p.x-source.x,dy=p.y-source.y,dz=-(source.z??affect.z),length=Math.hypot(dx,dy,dz),factor=length?speed*CELL/length:0;
    b.vx=dx*factor;b.vy=dy*factor;p.dir=Math.atan2(b.vy,b.vx)+Math.PI;
    b.phase=affect.kind==='explosion'?'explosion-hit':affect.kind==='melee'?'melee-hit':'bullet-hit';
    b.counter=0;for(let length=Math.hypot(b.vx,b.vy)/CELL;length>=.01;length*=.65)b.counter++;
    clearCell(s,p);b.action=h.random()<.5?'hitrear':'hitfront';b.frame=0;h.blood(p,1);
    if(!p.seat)h.sound(`Creature.Zombie.Ambience.${b.damageSample+1}.wav`);
    if(solid(room(s),p.x,p.y)){b.vx=0;b.vy=0;}
  }
}
/** True permits the normal AI/control callback. Hit, death and waits consume it. */
export function stepCreature(s:State,p:any,h:Hooks):boolean {
  const b=p.body;processAffects(s,p,h);
  if(['bullet-hit','melee-hit','explosion-hit'].includes(b.phase)){
    knockback(s,p);b.vx*=.65;b.vy*=.65;
    if(b.phase!=='explosion-hit')h.blood(p,0);
    if(p.hp<=0){b.affectEnabled=false;b.deadFlag=true;}
    if(--b.counter<0){if(p.hp<=0||b.deadFlag)dying(s,p,h);else{p.dir=b.returnAngle;b.phase='sleep';b.counter=3;b.action='stand';b.frame=0;}}
    return false;
  }
  if(b.phase==='sleep'){
    if(--b.counter<=0){b.phase=p.seat?'control':'normal';h.resume(p);return !!p.seat;}
    return false;
  }
  if(b.phase==='dying'){
    h.blood(p,1);b.frame+=.34;
    if(b.frame>=5){h.sound('Creature.HitFloor.wav');b.phase='dead';b.counter=p.seat?100:50;b.action='dead';b.frame=0;b.floor=true;clearCell(s,p);h.blood(p,5);}
    return false;
  }
  if(b.phase==='dead'){
    if(p.seat&&b.counter<25)h.playerDead(p);
    b.alpha=b.counter<25?b.counter/25:1;
    if(--b.counter<0){if(p.seat){b.phase='respawn';b.counter=25;}else{b.phase='disposed';b.disposeAt=s.tick+1;}}
    return false;
  }
  if(b.phase==='respawn'){
    if(--b.counter<0&&h.respawn(p)){h.resume(p);return true;}
    return false;
  }
  if(b.phase==='disposed')return false;
  // External invalid-position/fatal arrangements still use the native death
  // transition rather than an instant corpse or a negative-health controller.
  if(p.hp<=0||b.deadFlag){dying(s,p,h);return false;}
  return true;
}
export function validCreature(s:State,p:any):boolean {
  const b=p.body;
  return !!b&&['control','normal','bullet-hit','melee-hit','explosion-hit','sleep','dying','dead','respawn','disposed'].includes(b.phase)&&
    ['counter','frame','alpha','vx','vy','returnAngle','radius','mass','damageSample','deathSample'].every(k=>Number.isFinite(b[k]))&&
    Number.isSafeInteger(b.counter)&&b.radius===(p.devil?.42:.45)*CELL&&b.mass===(p.seat?2:p.devil?5:1)&&b.alpha>=0&&b.alpha<=1&&b.frame>=0&&b.frame<5&&
    ['stand','hitfront','hitrear','dying','dead'].includes(b.action)&&['collidable','affectEnabled','deadFlag','floor','loggedKill'].every(k=>typeof b[k]==='boolean')&&
    [b.damageSample,b.deathSample].every(n=>Number.isInteger(n)&&n>=0&&n<4)&&
    (b.phase==='disposed'?Number.isSafeInteger(b.disposeAt)&&b.disposeAt===s.tick+1:b.disposeAt===null)&&
    Array.isArray(b.affects)&&b.affects.length<1500&&b.affects.every((a:any)=>!!a&&['bullet','fireball','explosion','melee'].includes(a.kind)&&
      ['damage','x','y','z','angle'].every(k=>Number.isFinite(a[k]))&&a.damage>0&&a.z>=0&&Number.isSafeInteger(a.owner)&&a.owner>=0&&a.owner<=4&&
      (a.sourceId===null||Number.isSafeInteger(a.sourceId)&&a.sourceId>=0)&&(a.range===null||Number.isFinite(a.range)&&a.range>0)&&
      (a.kind!=='explosion'||a.range!==null)&&Number.isSafeInteger(a.born)&&a.born>=0&&a.born<=s.tick);
}
