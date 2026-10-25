import type { State } from './types';
import { CELL, room } from './boxhead-world';
import { canAffect } from './boxhead-creature';

type Point={x:number;y:number};
export interface RayHit {type:'wall'|'thing';x:number;y:number;thing?:any}

/** CLine.QDistance_PointToLine_SQR is deliberately an infinite line test.
 * CMap's visited cells, rather than a clamped projection, bound the query. */
export function lineDistanceSquared(p1:Point,p2:Point,p:Point):number {
  const dx=p2.x-p1.x,dy=p2.y-p1.y,t=((p.x-p1.x)*dx+(p.y-p1.y)*dy)/(dx*dx+dy*dy);
  return (p.x-p1.x-dx*t)**2+(p.y-p1.y-dy*t)**2;
}

function thingsByCell(s:State,ignore:number):Map<number,any[]> {
  const map=room(s),cells=new Map<number,any[]>();
  const things=[...s.players,...s.zombies,...s.barrels].filter(p=>p.id!==ignore&&
    (p.body?canAffect(p):p.registered&&p.hp>0&&['wall','barrel'].includes(p.kind)&&Number.isFinite(p.radius)))
    .sort((a,b)=>b.id-a.id);
  for(const p of things){const at=Math.floor(p.y/CELL)*map.columns+Math.floor(p.x/CELL),list=cells.get(at)||[];list.push(p);cells.set(at,list);}
  return cells;
}

/** One-cell steps, rounded expanded bounds, reverse cell enumeration and the
 * asymmetric final rectangle follow CMap_Collide/CMap_Affect. Each cell is seen
 * once. Same-cell object enumeration currently uses newest allocated ID; the
 * complete Mapwho insertion history remains part of the collection port. */
function* areas(s:State,p1:Point,p2:Point):Generator<number[]> {
  const map=room(s),dx=p2.x-p1.x,dy=p2.y-p1.y,length=Math.hypot(dx,dy)/CELL;
  const seen=new Set<number>(),radius=.04;
  function batch(x:number,y:number):number[] {
    const left=Math.max(0,Math.round(x)-1),right=Math.min(map.columns-1,Math.round(x+2*radius));
    const top=Math.max(0,Math.round(y)-1),bottom=Math.min(map.rows-1,Math.round(y+2*radius)),result=[];
    for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++){
      const at=row*map.columns+col;if(!seen.has(at)){seen.add(at);result.push(at);}
    }
    return result.reverse();
  }
  // A zero-length line has no intersections in native CLine (NaN distance).
  if(!length)return;
  const stepX=dx/CELL/length,stepY=dy/CELL/length;
  for(let n=0;n<length;n++)yield batch(p1.x/CELL-radius+n*stepX,p1.y/CELL-radius+n*stepY);
  yield batch(p2.x/CELL,p2.y/CELL);
}

function wallIntersection(s:State,at:number,p1:Point,p2:Point):RayHit|null {
  const map=room(s),col=at%map.columns,row=Math.floor(at/map.columns);
  if(map.collision[row][col]==='0')return null;
  const dx=p2.x-p1.x,dy=p2.y-p1.y,left=col*CELL,top=row*CELL;
  let a:RayHit|null=null,b:RayHit|null=null;
  if(dx!==0){const x=dx>0?left:left+CELL,y=p1.y+(x-p1.x)*dy/dx;if(y>=top&&y<=top+CELL)a={type:'wall',x,y};}
  if(dy!==0){const y=dy>0?top:top+CELL,x=p1.x+(y-p1.y)*dx/dy;if(x>=left&&x<=left+CELL)b={type:'wall',x,y};}
  if(a&&b)return (a.x-p1.x)**2+(a.y-p1.y)**2<(b.x-p1.x)**2+(b.y-p1.y)**2?a:b;
  return a||b;
}

export function collideLine(s:State,ignore:number,p1:Point,p2:Point,mapOnly=false):RayHit|null {
  const cells=mapOnly?new Map<number,any[]>():thingsByCell(s,ignore);
  for(const batch of areas(s,p1,p2)){
    let hit:RayHit|null=null,best=Infinity;
    for(const at of batch){
      let candidate=wallIntersection(s,at,p1,p2);
      if(!candidate&&!mapOnly){
        const thing=cells.get(at)?.find(p=>lineDistanceSquared(p1,p2,p)<(p.body?p.body.radius:p.radius)**2);
        if(thing)candidate={type:'thing',x:thing.x,y:thing.y,thing};
      }
      if(candidate){const d=(candidate.x-p1.x)**2+(candidate.y-p1.y)**2;if(d<best){best=d;hit=candidate;}}
    }
    if(hit){
      if(hit.thing){const dx=hit.x-p1.x,dy=hit.y-p1.y,length=Math.hypot(dx,dy),r=hit.thing.body?.radius??hit.thing.radius;
        if(length){hit.x-=dx/length*r;hit.y-=dy/length*r;}
      }
      return hit;
    }
  }
  return null;
}

/** Railgun first clips against static map cells, then affects every intersected
 * thing, including destructible walls. A fake wall never stops its beam. */
export function affectLine(s:State,ignore:number,p1:Point,p2:Point):any[] {
  const cells=thingsByCell(s,ignore),hits=[];
  for(const batch of areas(s,p1,p2))for(const at of batch)for(const p of cells.get(at)||[])
    if(lineDistanceSquared(p1,p2,p)<(p.body?p.body.radius:p.radius)**2)hits.push(p);
  return hits.reverse();
}
