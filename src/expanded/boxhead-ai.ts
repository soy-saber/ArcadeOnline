import type { State } from './types';
import { CELL, room, lineClear } from './boxhead-world';
import { cell, adjacent, flags, realFlags, reserve, direction, DELTAS, CREATURE, PLAYER, OBJECT, SOLID } from './boxhead-navigation';
import { creatureBody } from './boxhead-creature';

const TAU=Math.PI*2;
const wrap=(angle:number)=>(angle%TAU+TAU)%TAU;
const heading=(angle:number)=>Math.round(wrap(angle)/(Math.PI/4))&7;
const frames=(action:string)=>action==='walk'?8:action==='attack'?4:1;
export function enemyBrain(s:State,z:any,entering=true) {
  z.body=creatureBody(false,z.devil);z.body.collidable=!entering;z.body.affectEnabled=!entering;
  return {state:entering?'init':'goto',base:'goto',previous:'goto',counter:0,born:s.tick,registered:!entering,collidable:!entering,
    reserved:null as number|null,entry:null as number|null,targetSeat:null as number|null,targetDir:0,targetAngle:0,angleDelta:0,dx:0,dy:0,
    speed:(z.devil?.04:.02)*Math.min(1+s.wave*.1,5),radius:(z.devil?.42:.45)*CELL,
    action:entering?'stand':'walk',frame:0,canAttack:false,fireRateCount:z.devil?5:0,attackAngle:0,multiply:false};
}
function animation(z:any,action:string):void {
  if(z.ai.action!==action){z.ai.action=action;z.ai.frame=0;}
}
function animate(z:any,speed:number):boolean {
  const a=z.ai,next=a.frame+speed,count=frames(a.action);a.frame=next%count;return next>=count;
}
export function enemyRawFrame(z:any):number {
  return z.ai.action==='walk'?[0,1,2,3,4,3,2,1][Math.floor(z.ai.frame)]:Math.floor(z.ai.frame);
}
export function transition(s:State,z:any,state:string):void {
  const a=z.ai;a.previous=a.state;a.state=state;a.counter=0;
  if(state==='goto'){a.base='goto';animation(z,'walk');}
  else if(state==='enter') {
    reserve(s,z,cell(s,z.x,z.y));a.collidable=false;a.base='enter';a.entry=null;animation(z,'stand');
    z.body.collidable=false;z.body.affectEnabled=false;
    for(const dir of [0,2,4,6]){const next=adjacent(s,cell(s,z.x,z.y),dir);if(!(flags(s,next)&SOLID)){z.dir=dir*Math.PI/4;a.entry=next;break;}}
  }else if(state==='cell') {
    const [dx,dy]=DELTAS[heading(z.dir)],cx=Math.floor(z.x/CELL)*CELL+CELL/2,cy=Math.floor(z.y/CELL)*CELL+CELL/2;
    reserve(s,z,cell(s,z.x+dx*CELL,z.y+dy*CELL));
    a.counter=(dx&&dy?Math.SQRT2:1)/a.speed;
    a.dx=(dx*CELL+cx-z.x)/a.counter;a.dy=(dy*CELL+cy-z.y)/a.counter;animation(z,'walk');
  }else if(state==='turn') {
    let difference=wrap(a.targetAngle)-wrap(z.dir);if(difference>Math.PI)difference-=TAU;if(difference<-Math.PI)difference+=TAU;
    a.angleDelta=a.speed*10*Math.sign(difference);a.counter=a.angleDelta?Math.abs(difference/a.angleDelta):0;animation(z,'stand');
  }else if(state==='wait'){a.counter=25;animation(z,'stand');}
  else if(state==='sleep')animation(z,'stand');
  else if(state==='attack'){animation(z,'attack');z.attackAt=s.tick;}
  else if(state==='remove'){animation(z,'stand');}
}
function turnOr(s:State,z:any,next:string,target:number,wait=false):void {
  const a=z.ai,current=heading(z.dir);
  if(target===current){transition(s,z,next);return;}
  if(wait&&a.previous==='turn'){transition(s,z,'sleep');a.counter=25/3;return;}
  a.targetAngle=target*Math.PI/4;transition(s,z,'turn');
}
function closest(s:State,z:any):any {
  // GetClosestPlayer enumerates newest players first; equal distances retain it.
  const candidates=[...s.players].reverse().filter(p=>!p.body.deadFlag);
  return candidates.reduce((best,p)=>!best||Math.hypot(p.x-z.x,p.y-z.y)<Math.hypot(best.x-z.x,best.y-z.y)?p:best,null as any)||s.players[s.players.length-1];
}
function targetVisible(s:State,z:any,p:any):boolean {
  if(!lineClear(s,z.x,z.y,p.x,p.y))return false;
  const dx=p.x-z.x,dy=p.y-z.y,length=dx*dx+dy*dy;
  // Only other devils carry PlayerLineOfSight; barrels and ordinary zombies do not.
  return !s.zombies.some((other:any)=>{
    if(other===z||!other.devil||other.hp<=0||!other.ai.registered||!other.ai.collidable)return false;
    const t=((other.x-z.x)*dx+(other.y-z.y)*dy)/length;
    return t>0&&t<1&&Math.hypot(other.x-z.x-t*dx,other.y-z.y-t*dy)<other.ai.radius;
  });
}
export interface EnemyHooks {
  random():number;
  hurt(player:any,amount:number,source:any):void;
  damage(target:any,amount:number):void;
}
export function stepEnemy(s:State,z:any,hooks:EnemyHooks):void {
    const a=z.ai;
    if(a.state==='init') {
      if(a.born>=s.tick)return;
      z.body.damageSample=Math.floor(hooks.random()*4);z.body.deathSample=Math.floor(hooks.random()*4);
      z.x=Math.floor(z.x/CELL)*CELL+16;z.y=Math.floor(z.y/CELL)*CELL+16;a.registered=true;
      transition(s,z,'enter');return;
    }
    const at=cell(s,z.x,z.y);
    if(a.state==='enter') {
      if(a.entry===null||flags(s,a.entry)&CREATURE)transition(s,z,'wait');
      else {a.collidable=true;z.body.collidable=true;z.body.affectEnabled=true;a.base='goto';transition(s,z,z.devil?'remove':'cell');}
    }else if(a.state==='remove') {
      const next=adjacent(s,at,heading(z.dir));
      if(flags(s,next)&OBJECT){for(const b of s.barrels)if(b.registered&&cell(s,b.x,b.y)===next)hooks.damage(b,100000);}
      else transition(s,z,'goto');
    }else if(a.state==='goto') {
      const p=closest(s,z);if(!p)return;a.targetSeat=p.seat;
      if(z.devil) {
        if(a.canAttack&&a.fireRateCount<=0&&p.hp>0&&heading(Math.atan2(p.y-z.y,p.x-z.x))===heading(z.dir)&&Math.hypot(p.x-z.x,p.y-z.y)<=5*CELL&&targetVisible(s,z,p)) {
          a.multiply=false;a.attackAngle=Math.atan2(p.y-z.y,p.x-z.x);transition(s,z,'attack');a.fireRateCount--;return;
        }
        a.canAttack=true;
      }
      a.targetAngle=wrap(Math.atan2(Math.floor(p.y/CELL)*CELL+16-z.y,Math.floor(p.x/CELL)*CELL+16-z.x));a.targetDir=heading(a.targetAngle);
      const ahead=realFlags(s,at,a.targetDir);
      if(!z.devil&&ahead&PLAYER)turnOr(s,z,'attack',a.targetDir);
      else if(z.devil&&ahead&OBJECT){a.attackAngle=heading(z.dir)*Math.PI/4;a.multiply=true;turnOr(s,z,'attack',a.targetDir);}
      else {
        const dir=direction(s,at,heading(z.dir),a.targetDir,z.devil,hooks.random);a.targetDir=dir<0?a.targetDir:dir;
        if(dir<0)transition(s,z,'wait');else turnOr(s,z,'cell',dir,true);
      }
    }else if(a.state==='cell') {
      if(--a.counter<=0){z.x=Math.floor(z.x/CELL)*CELL+16;z.y=Math.floor(z.y/CELL)*CELL+16;transition(s,z,a.base);}
      else {a.frame=(a.frame+.34)%8;z.x+=a.dx;z.y+=a.dy;}
    }else if(a.state==='turn') {
      if(--a.counter<=0){z.dir=a.targetAngle;transition(s,z,a.base);}else z.dir=wrap(z.dir+a.angleDelta);
    }else if(a.state==='wait') {if(--a.counter<=0)transition(s,z,a.base);}
    else if(a.state==='sleep') {if(--a.counter<=0)transition(s,z,a.previous);}
    else if(a.state==='attack') {
      if(z.devil) {
        const before=Math.floor(a.frame),ended=animate(z,Math.min(.2*(a.speed*25*1.5),1));
        if(before!==Math.floor(a.frame)&&Math.floor(a.frame)===3) {
          // All64 native attack hand anchors lack XSIInfo, so use source fallback.
          const angle=a.attackAngle,radius=a.radius*1.5;
          s.bullets.push({id:++s.nextId,x:z.x+Math.cos(angle)*radius,y:z.y+Math.sin(angle)*radius,z:.84*CELL,vx:Math.cos(angle)*.15*CELL,vy:Math.sin(angle)*.15*CELL,
            owner:-1,parent:z.id,weapon:-1,damage:50,multiply:a.multiply,radius:a.multiply?CELL:.25*CELL,animation:0,fireball:true,life:1,born:s.tick});
          a.fireRateCount=0;
        }
        if(ended)transition(s,z,a.previous);
      }else if(animate(z,Math.min(.3*(a.speed*25*1.5),1))) {
        const target=adjacent(s,at,heading(z.dir));
        for(const p of s.players)if(p.alive&&cell(s,p.x,p.y)===target)hooks.hurt(p,50,z);
        for(const b of s.barrels)if(b.kind==='wall'&&b.registered&&cell(s,b.x,b.y)===target)hooks.damage(b,50);
        const previous=a.previous;transition(s,z,'sleep');a.counter=10;a.previous=previous;
      }
    }
    if(z.devil)a.fireRateCount--;
}
export function stepEnemies(s:State,hooks:EnemyHooks):void {for(const z of [...s.zombies].reverse())stepEnemy(s,z,hooks);}

export function validEnemyAI(s:State,z:any):boolean {
  const a=z.ai,size=room(s).columns*room(s).rows;
  return !!a&&['init','enter','goto','remove','cell','turn','wait','sleep','attack'].includes(a.state)&&['enter','goto'].includes(a.base)&&
    ['init','enter','goto','remove','cell','turn','wait','sleep','attack'].includes(a.previous)&&
    ['registered','collidable','canAttack','multiply'].every(k=>typeof a[k]==='boolean')&&Number.isSafeInteger(a.born)&&a.born>=0&&a.born<=s.tick&&
    ['counter','targetAngle','angleDelta','dx','dy','speed','radius','frame','fireRateCount','attackAngle'].every(k=>Number.isFinite(a[k]))&&a.speed>0&&a.speed<=.2&&a.radius===(z.devil?.42:.45)*CELL&&
    Number.isInteger(a.targetDir)&&a.targetDir>=0&&a.targetDir<8&&[a.reserved,a.entry].every(v=>v===null||Number.isInteger(v)&&v>=0&&v<size)&&
    (a.targetSeat===null||Number.isInteger(a.targetSeat)&&a.targetSeat>=1&&a.targetSeat<=4)&&['stand','walk','attack'].includes(a.action)&&a.frame>=0&&a.frame<frames(a.action)&&
    (a.state!=='init'||!a.registered&&!a.collidable&&a.reserved===null);
}
