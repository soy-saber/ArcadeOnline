import type { State } from './types';

const CELL=32;
export function sameCell(a:{x:number;y:number},b:{x:number;y:number}):boolean {
  return Math.floor(a.x/CELL)===Math.floor(b.x/CELL)&&Math.floor(a.y/CELL)===Math.floor(b.y/CELL);
}

/** A newly constructed Thing is not in Mapwho until its next Process_Init. */
export function objectRegistration() {
  return {registered:false,objectPhase:'init',radius:null,collidable:false,barrelAffects:[]};
}

export function objectBlocks(b:any):boolean {
  return b.registered===true&&b.collidable===true&&Number.isFinite(b.radius)&&b.radius>0;
}

export function stepRegistration(s:State):void {
  // Newer things receive callbacks first. Objects born during this callback wait.
  for(const b of [...s.barrels].reverse()) {
    if(!['barrel','wall'].includes(b.kind)||b.armed>=s.tick||b.hp<=0)continue;
    const playerOnCell=()=>s.players.some(p=>p.alive&&sameCell(p,b));
    if(b.objectPhase==='init') {
      b.registered=true;
      if(playerOnCell())b.objectPhase='waiting';
      else {b.radius=.42*CELL;b.collidable=true;b.objectPhase='normal';}
    }
    if(b.objectPhase==='waiting') {
      if(playerOnCell())continue;
      b.collidable=true;b.objectPhase='growing';
    }
    if(b.objectPhase==='growing') {
      // Retain the source's overshoot. Barrel resets .45 to .42 next time;
      // a wall grows past .48 to .50 and keeps that radius.
      const target=(b.kind==='barrel'?.42:.48)*CELL;
      if((b.radius??0)<target)b.radius=(b.radius??0)+.05*CELL;
      else {if(b.kind==='barrel')b.radius=.42*CELL;b.objectPhase='normal';}
    }
  }
}

/** Barrel Process_PlayerOnCell/GrowRadius defer its queued affects until normal. */
export function processBarrelAffects(s:State):void {
  for(const b of s.barrels)if(b.kind==='barrel'&&b.hp>0&&b.objectPhase==='normal'&&b.barrelAffects.length) {
    b.owner=b.barrelAffects[b.barrelAffects.length-1];b.barrelAffects=[];b.hp=0;
  }
}

export function validRegistration(b:any,tick:number):boolean {
  if(!['barrel','wall'].includes(b.kind))return true;
  if(typeof b.registered!=='boolean'||typeof b.collidable!=='boolean'||
    !['init','waiting','growing','normal'].includes(b.objectPhase)||
    !(b.radius===null||Number.isFinite(b.radius)&&b.radius>0&&b.radius<=.5*CELL+1e-10)||
    !Array.isArray(b.barrelAffects)||b.barrelAffects.length>1||
    !b.barrelAffects.every((n:any)=>Number.isInteger(n)&&n>=-1&&n<=4)||
    !Number.isSafeInteger(b.armed)||b.armed<0||b.armed>tick)return false;
  if(b.objectPhase==='init')return !b.registered&&!b.collidable&&b.radius===null;
  if(!b.registered)return false;
  if(b.objectPhase==='waiting')return !b.collidable&&b.radius===null;
  if(b.objectPhase==='growing')return b.collidable&&b.radius!==null;
  if(b.kind==='barrel')return b.collidable&&b.radius===.42*CELL;
  // Wall affects can interrupt waiting/growth without setting radius.
  return b.barrelAffects.length===0&&(b.collidable||b.radius===null);
}
