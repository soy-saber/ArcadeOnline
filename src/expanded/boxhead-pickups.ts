import type {State} from './types';
import {WEAPONS,weaponStats} from './boxhead-world';

/** Original RandomPickup: native object keys enumerate newest weapon first.
 * Even full weapons retain weight. With only a pistol, health weight is zero. */
export function pickupChoice(active:boolean[],ammo:number[],total:number[],hp:number,random:()=>number):number|'life'|null {
  const choices:{key:number|'life';end:number}[]=[];let sum=0;
  for(let i=active.length-1;i>=1;i--)if(active[i]){sum+=(1-ammo[i]/total[i])*.75+.25;choices.push({key:i,end:sum});}
  if(hp<200){sum+=(1-hp/200)*sum;choices.push({key:'life',end:sum});}
  const selected=random()*sum;return choices.find(c=>selected<c.end)?.key??null;
}
export function takePickup(s:State,p:any,random:()=>number):boolean {
  const totals=WEAPONS.map((_,i)=>weaponStats(s,i).ammo),choice=pickupChoice(p.unlocked,p.inventory,totals,p.hp,random);
  if(choice===null)return false;
  if(choice==='life')p.hp=200;
  else{p.inventory[choice]=totals[choice];if(p.weapon===choice){p.ammo=totals[choice];p.cooldown=0;}}
  return true;
}
export function stepPickups(s:State,random:()=>number,sound:()=>void):void {
  for(const item of s.pickups){
    if(item.permanent&&item.life<=0&&s.tick>=item.reappearAt){item.life=250;item.reappearAt=null;item.born=s.tick-1;}
    for(const p of s.players)if((item.born??-1)<s.tick&&item.life>0&&!p.body.deadFlag&&Math.hypot(p.x-item.x,p.y-item.y)<25){
      takePickup(s,p,random);item.life=0;if(item.permanent)item.reappearAt=s.tick+25*s.options.speed*(s.mode==='deathmatch'?10:30)+2;sound();break;
    }
    if(!item.permanent)item.life--;
  }
  s.pickups=s.pickups.filter((p:any)=>p.permanent||p.life>0);
}
