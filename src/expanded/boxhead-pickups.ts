import type {State} from './types';
import {room,solid,CELL} from './boxhead-world';
import {cell} from './boxhead-navigation';
import {frameRate} from './boxhead-options';
import {rebuildWeapon} from './boxhead-weapon-upgrades';

/** Original RandomPickup: native object keys enumerate newest weapon first.
 * Even full weapons retain weight. With only a pistol, health weight is zero. */
export function pickupChoice(active:boolean[],ammo:number[],total:number[],hp:number,random:()=>number):number|'life'|null {
  const choices:{key:number|'life';end:number}[]=[];let sum=0;
  for(let i=active.length-1;i>=1;i--)if(active[i]){sum+=(1-ammo[i]/total[i])*.75+.25;choices.push({key:i,end:sum});}
  if(hp<200){sum+=(1-hp/200)*sum;choices.push({key:'life',end:sum});}
  const selected=random()*sum;return choices.find(c=>selected<c.end)?.key??null;
}
export function takePickup(s:State,p:any,random:()=>number):boolean {
  const choice=pickupChoice(p.unlocked,p.inventory,p.weaponCaps,p.hp,random);
  if(choice===null)return false;
  if(choice==='life')p.hp=200;
  else rebuildWeapon(s,p,choice);
  return true;
}
export function dropPickup(s:State,position:{x:number;y:number}):void {
  if(solid(room(s),position.x,position.y))return;
  const count=frameRate(s)*10;
  s.pickups.push({id:++s.nextId,x:Math.floor(position.x/CELL)*CELL+CELL/2,y:Math.floor(position.y/CELL)*CELL+CELL/2,
    life:count+2,born:s.tick,permanent:false,deleteCounter:count,initialized:false,alpha:1});
}
export function stepPickups(s:State,random:()=>number,sound:()=>void):void {
  for(const item of s.pickups){
    if((item.born??-1)>=s.tick)continue;
    if(!item.permanent){
      // A newly dropped pickup first registers its cell; DeleteCounter_Init
      // does not perform the normal decrement or pickup test in that callback.
      if(item.initialized===false){item.initialized=true;item.life=item.deleteCounter+1;continue;}
      if(item.deleteCounter===undefined)item.deleteCounter=item.life-1;
      if(--item.deleteCounter<0){item.life=0;continue;}
      item.life=item.deleteCounter+1;
      if(item.deleteCounter<frameRate(s))item.alpha=item.deleteCounter/frameRate(s);
    }
    if(item.permanent&&item.life<=0&&s.tick>=item.reappearAt){item.life=250;item.reappearAt=null;item.born=s.tick-1;}
    const occupant=[...s.players].sort((a,b)=>b.id-a.id).find(p=>cell(s,p.x,p.y)===cell(s,item.x,item.y));
    if(item.life>0&&occupant&&!occupant.body.deadFlag){
      takePickup(s,occupant,random);item.life=0;if(item.permanent)item.reappearAt=s.tick+frameRate(s)*(s.mode==='deathmatch'?10:30)+2;sound();
    }
  }
  s.pickups=s.pickups.filter((p:any)=>p.permanent||p.life>0);
}
