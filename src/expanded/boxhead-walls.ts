import type { State } from './types';

export const WALL_HP=1000;
export function wallState() {
  return {hp:WALL_HP,maxHp:WALL_HP,wallFrame:0,wallAlpha:100,fadeAt:null,deleteAt:null,affects:[]};
}

/** ClearAffects prevents further damage, but Dispose releases collision later. */
export function wallBlocks(b:any,tick:number):boolean {
  return b.kind==='wall'&&(b.deleteAt===null||b.deleteAt>=tick);
}

export function affectWall(b:any,amount:number,owner:number):void {
  if(b.hp>0){b.affects.push({amount,owner});if(b.registered)b.objectPhase='normal';}
}

export function processWallAffects(s:State,destroy:(b:any)=>void):void {
  for(const b of s.barrels)if(b.kind==='wall'&&b.affects.length) {
    const affects=b.affects;b.affects=[];
    // CThing.Affect pushes; the AS2 for-in callback enumerates newest keys first.
    for(let i=affects.length-1;i>=0;i--) {
      const affect=affects[i];
      b.hp-=affect.amount;b.owner=affect.owner;b.hitAt=s.tick;
      if(b.hp>0)b.wallFrame=Math.floor((1-b.hp/b.maxHp)*10);
      else {
        // The lethal affect clears pending affects and exits before GotoToFrame.
        // Keep the image from the last nonlethal affect in this callback.
        b.exploded=true;b.collidable=true;b.fadeAt=s.tick;b.wallAlpha=80;destroy(b);break;
      }
    }
  }
}

export function stepWalls(s:State):void {
  s.barrels=s.barrels.filter((b:any)=>b.kind!=='wall'||b.deleteAt===null||b.deleteAt>=s.tick);
  for(const b of s.barrels)if(b.kind==='wall'&&b.fadeAt!==null&&s.tick>b.fadeAt) {
    b.wallAlpha=Math.max(0,100-20*(s.tick-b.fadeAt+1));
    if(b.wallAlpha<10&&b.deleteAt===null)b.deleteAt=s.tick;
  }
}

export function smokeFrame(tick:number,born:number,frames:number):number {
  return Math.min(frames-1,Math.max(0,tick-born+1));
}

export function validWall(b:any,tick:number):boolean {
  if(b.kind!=='wall')return true;
  if(b.maxHp!==WALL_HP||!Number.isInteger(b.wallFrame)||b.wallFrame<0||b.wallFrame>9||
    ![0,20,40,60,80,100].includes(b.wallAlpha)||!Array.isArray(b.affects)||b.affects.length>=1500||
    !b.affects.every((a:any)=>Number.isFinite(a.amount)&&a.amount>0&&Number.isInteger(a.owner)&&a.owner>=-1&&a.owner<=4))return false;
  if(b.hp>0)return b.hp<=WALL_HP&&!b.exploded&&b.wallFrame===Math.floor((1-b.hp/WALL_HP)*10)&&b.wallAlpha===100&&b.fadeAt===null&&b.deleteAt===null;
  return b.exploded&&b.affects.length===0&&Number.isSafeInteger(b.fadeAt)&&b.fadeAt>=0&&b.fadeAt<=tick&&
    b.wallAlpha===Math.max(0,100-20*(tick-b.fadeAt+1))&&
    (b.wallAlpha>0?b.deleteAt===null:b.deleteAt===b.fadeAt+4);
}
