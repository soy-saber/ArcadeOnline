import type { State } from './types';
import { cell, flags, CREATURE } from './boxhead-navigation';

export function ownedPacks(s:State,seat:number):any[] {
  return s.barrels.filter((b:any)=>b.kind==='chargepack'&&b.owner===seat&&b.hp>0);
}

export function weaponEmpty(s:State,p:any,index:number):boolean {
  return p.inventory[index]===0&&(index!==8||ownedPacks(s,p.seat).length===0);
}

/** SelectWeapon calls Reset even when the selected weapon is already current. */
export function selectWeapon(s:State,p:any,index:number):void {
  p.weapon=index;p.ammo=p.inventory[index];p.cooldown=0;
  if(index===8)p.chargeDetonate=p.inventory[8]<=0&&ownedPacks(s,p.seat).length>0;
}

export function stepExplosiveObjects(s:State,sound:(s:State,name:string)=>void):void {
  for(const b of s.barrels) {
    if(b.hp<=0||!['mine','chargepack'].includes(b.kind)||b.armed>=s.tick)continue;
    if(b.kind==='mine') {
      if(!b.detonating) {
        b.animation=(b.animation+1/25)%2;
        if(flags(s,cell(s,b.x,b.y))&CREATURE) {
          b.detonating=true;b.detonateAt=s.tick+50;sound(s,'Object.Mine.Detonate.wav');
        }
      }
      if(b.detonating){b.animation=(b.animation+1)%2;if(s.tick>=b.detonateAt)b.hp=0;}
    } else {
      if(b.detonateCounter===null) {
        b.animation=(b.animation+1/25)%2;
        if(b.detonating){b.detonateCounter=25/10;sound(s,'Object.Mine.Detonate.wav');}
      }
      if(b.detonateCounter!==null){b.animation=(b.animation+1)%2;if(--b.detonateCounter<0)b.hp=0;}
    }
  }
}

export function validExplosiveObject(b:any):boolean {
  return !['mine','chargepack'].includes(b.kind)||
    Number.isFinite(b.animation)&&b.animation>=0&&b.animation<2&&typeof b.detonating==='boolean'&&
    (b.kind==='mine'?Number.isSafeInteger(b.detonateAt)&&b.detonateAt>=0:
      b.detonateCounter===null||b.detonating&&[1.5,.5].includes(b.detonateCounter));
}
