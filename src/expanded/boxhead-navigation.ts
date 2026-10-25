import type { State } from './types';
import { room, CELL } from './boxhead-world';

export const SOLID=1,CREATURE=32,PLAYER=64,OBJECT=128;
export const NON_MOVABLE=SOLID|CREATURE|PLAYER|OBJECT;
export const DELTAS=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
export function cell(s:State,x:number,y:number):number {
  const map=room(s),cx=Math.floor(x/CELL),cy=Math.floor(y/CELL);
  return cx<0||cy<0||cx>=map.columns||cy>=map.rows?-1:cy*map.columns+cx;
}
export function adjacent(s:State,index:number,dir:number):number {
  const map=room(s),[dx,dy]=DELTAS[dir&7];
  return cell(s,(index%map.columns+dx)*CELL, (Math.floor(index/map.columns)+dy)*CELL);
}
export function navigationState(size:number) {
  return {phase:'restart',timer:-1,session:-1,distance:0,frontier:[] as number[],tags:Array(size).fill(-1),distances:Array(size).fill(null),fullScans:0};
}
export function flags(s:State,index:number):number {
  const map=room(s);
  if(index<0||index>=map.columns*map.rows)return SOLID;
  let result=map.collision[Math.floor(index/map.columns)][index%map.columns]==='0'?0:SOLID;
  if(s.enemyCells[index])result|=CREATURE;
  // Player.Process_Normal writes this flag after every state callback, even
  // dying, dead and respawn. Affect/collision flags remain separate.
  if(s.players.some(p=>cell(s,p.x,p.y)===index))result|=PLAYER;
  if(s.barrels.some((b:any)=>b.registered&&['barrel','wall'].includes(b.kind)&&cell(s,b.x,b.y)===index))result|=OBJECT;
  return result;
}
export function realFlags(s:State,index:number,dir:number):number {
  let result=flags(s,adjacent(s,index,dir));
  if(dir&1)result|=flags(s,adjacent(s,index,(dir-1)&7))|flags(s,adjacent(s,index,(dir+1)&7));
  return result;
}
export function reserve(s:State,z:any,index:number|null):void {
  // SetCollideDirection clears the previous bit, then sets the destination bit.
  if(z.ai.reserved!==null)s.enemyCells[z.ai.reserved]=false;
  z.ai.reserved=index;
  if(index!==null&&index>=0)s.enemyCells[index]=true;
}
function localDirection(s:State,index:number,current:number,target:number,mask:number,random:()=>number):number {
  if(!(realFlags(s,index,target)&mask))return target;
  let turn:number;
  if(current!==target) {
    if(!(realFlags(s,index,current)&mask))return current;
    turn=target<=current?(Math.abs(target-current)<=4?-1:1):(Math.abs(target-current)<=4?1:-1);
  }else turn=Math.floor(random()*2)*2-1;
  const offsets=target&1?[1,3]:[2];
  for(const offset of offsets)for(const sign of [1,-1]) {
    const dir=(target+offset*turn*sign)&7;
    if(!(realFlags(s,index,dir)&mask))return dir;
  }
  return -1;
}
export function direction(s:State,index:number,current:number,target:number,force:boolean,random:()=>number):number {
  const nav=s.navigation,mask=NON_MOVABLE;
  if(nav.timer>=0&&nav.tags[index]>=0&&(nav.timer-nav.tags[index])*40<2000) {
    const distance=nav.distances[index];
    for(const dir of [target,current]) {
      const next=adjacent(s,index,dir),nextDistance=nav.distances[next];
      if(nextDistance!==null&&nextDistance!==undefined&&nextDistance<distance&&!(realFlags(s,index,dir)&mask))return dir;
    }
    if(!force&&++nav.fullScans>5)return -1;
    // Native sortOn(nDist, NUMERIC|DESCENDING|RETURNINDEXEDARRAY), read backwards.
    const candidates=DELTAS.map((_,dir)=>dir).sort((a,b)=>
      (nav.distances[adjacent(s,index,b)]??Infinity)-(nav.distances[adjacent(s,index,a)]??Infinity));
    for(let n=candidates.length-1;n>=0;n--)if(!(realFlags(s,index,candidates[n])&mask))return candidates[n];
    return -1;
  }
  return localDirection(s,index,current,target,mask,random);
}

/** Original breadth-first flood advances up to five layers after collection
 * callbacks. Replace its machine-dependent3ms timeout with deterministic layers. */
export function stepNavigation(s:State):void {
  const nav=s.navigation;
  nav.timer=s.tick;nav.fullScans=0;
  const visit=(index:number)=>{
    if(index>=0&&!(flags(s,index)&(SOLID|OBJECT))&&nav.tags[index]!==nav.session) {
      nav.tags[index]=nav.session;nav.distances[index]=nav.distance;nav.frontier.push(index);
    }
  };
  if(nav.phase==='restart'||nav.phase==='finished') {
    nav.session=s.tick;nav.distance=0;nav.frontier=[];
    for(const p of [...s.players].reverse())visit(cell(s,p.x,p.y));
  }
  for(let layer=0;layer<5&&nav.frontier.length;layer++) {
    const previous=nav.frontier;nav.frontier=[];
    for(let n=previous.length-1;n>=0;n--)for(const dir of [0,2,4,6])visit(adjacent(s,previous[n],dir));
    // Preserve NF_4's source order: root and its first neighbors both get0.
    nav.distance++;
  }
  nav.phase=nav.frontier.length?'resume':'finished';
}
export function validNavigation(s:State):boolean {
  const size=room(s).columns*room(s).rows,n=s.navigation;
  return Array.isArray(s.enemyCells)&&s.enemyCells.length===size&&s.enemyCells.every((v:any)=>typeof v==='boolean')&&!!n&&
    ['restart','resume','finished'].includes(n.phase)&&Number.isSafeInteger(n.timer)&&n.timer>=-1&&n.timer<=s.tick&&Number.isSafeInteger(n.session)&&n.session>=-1&&n.session<=s.tick&&
    Number.isSafeInteger(n.distance)&&n.distance>=0&&n.distance<=size&&Number.isSafeInteger(n.fullScans)&&n.fullScans>=0&&
    Array.isArray(n.frontier)&&n.frontier.length<=size&&new Set(n.frontier).size===n.frontier.length&&n.frontier.every((v:any)=>Number.isSafeInteger(v)&&v>=0&&v<size)&&
    Array.isArray(n.tags)&&n.tags.length===size&&n.tags.every((v:any)=>Number.isSafeInteger(v)&&v>=-1&&v<=s.tick)&&
    Array.isArray(n.distances)&&n.distances.length===size&&n.distances.every((v:any)=>v===null||Number.isSafeInteger(v)&&v>=0&&v<=size);
}
