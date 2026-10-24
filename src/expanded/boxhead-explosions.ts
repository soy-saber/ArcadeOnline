import type { State } from './types';
import { CELL } from './boxhead-world';

export interface Explosion {
  id: number; x: number; y: number; z: number; damage: number; owner: number;
  bang: number; cluster: boolean; born: number; delay: number; initialized: boolean;
}

/** New collection entries begin their callbacks on the following simulation tick. */
export function queueExplosion(s: State, x: number, y: number, damage: number, owner: number, bang=0, cluster=false, z=0, delay=0): void {
  s.explosions.push({id:++s.nextId,x,y,z,damage,owner,bang,cluster,born:s.tick,delay,initialized:false});
}

export function processExplosions(s: State, random:(s:State)=>number, impact:(e:Explosion)=>void): void {
  // Snapshot the collection. A child may not initialize or move in its parent's callback.
  const pending=s.explosions as Explosion[];s.explosions=[];
  for(const e of pending) {
    if(e.born>=s.tick){s.explosions.push(e);continue;}
    if(!e.initialized) {
      e.initialized=true;
      if(e.cluster)for(let i=0;i<4;i++) {
        const angle=i*Math.PI/2+(random(s)-.5)*Math.PI/4;
        const life=16+Math.floor(random(s)*8),speed=(.05+random(s)*.05)*CELL;
        s.bullets.push({id:++s.nextId,x:e.x,y:e.y,z:e.z,vz:.5*CELL,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
          owner:e.owner,weapon:4,damage:e.damage,life,bang:0,cluster:false,clusterShell:true,born:s.tick});
      }
      if(e.bang) {
        const step=Math.PI*2/(e.bang*1.5);
        for(let angle=0;angle<Math.PI*2;angle+=step) {
          const direction=angle+(random(s)-.5)*step/4;
          queueExplosion(s,e.x+Math.cos(direction)*CELL,e.y+Math.sin(direction)*CELL,e.damage,e.owner,0,false,e.z,2+Math.floor(random(s)*4));
        }
      }
    }
    // Process_Init calls Process_Delay immediately. The original pre-decrement
    // activates a delay of 2 on its third callback, rather than its second.
    if(--e.delay>=0)s.explosions.push(e);
    else impact(e);
  }
}

/** Clone starts at zero, then Process_Normal immediately advances by 2.5. */
export function explosionFrame(tick:number,born:number):number {
  return Math.min(17,Math.max(0,Math.floor((tick-born+1)*2.5)));
}

export function validExplosions(s:State):boolean {
  return Array.isArray(s.explosions)&&s.explosions.length<1500&&s.explosions.every((e:Explosion)=>
    [e.x,e.y,e.z,e.damage].every(Number.isFinite)&&e.z>=0&&e.damage>0&&
    Number.isSafeInteger(e.id)&&e.id>0&&Number.isSafeInteger(e.owner)&&e.owner>=-1&&e.owner<=4&&
    Number.isSafeInteger(e.born)&&e.born>=0&&e.born<=s.tick&&[0,1,2].includes(e.bang)&&
    Number.isInteger(e.delay)&&e.delay>=0&&e.delay<=5&&typeof e.cluster==='boolean'&&typeof e.initialized==='boolean');
}
