import type {State} from './types';
import ART from './bomb2-blast-art.json';

export const BLAST_TICKS=ART.lifetimeTicks;
export const MAX_BLAST_DELAY=63;
export interface BlastTile {x:number;y:number;frame:number}
export interface Blast {
  id:number;owner:number;x:number;y:number;px:number;py:number;
  born:number;until:number;delay:number;kind:'normal'|'mine';blocking:boolean;tiles:BlastTile[];fires:number[];
}
export function burningBombAt(s:State,x:number,y:number,solidOnly=false,ending=false):Blast|undefined {
  return s.blasts.find((b:Blast)=>b.blocking&&(!solidOnly||b.kind!=='mine')&&(ending?b.until>=s.tick:b.until>s.tick)&&b.x===x&&b.y===y);
}
export function expireBlasts(s:State):void {
  // Original Grid.fire is a boolean. Bomb.deleFire clears every cell it set;
  // a later overlapping explosion does not retain a reference to that cell.
  // Control runs bombs before these callbacks, including on the expiry frame.
  for(let i=0;i<s.blasts.length;i++){
    const b=s.blasts[i] as Blast;if(b.until>s.tick)continue;
    for(const cell of b.fires){s.flames[cell]=0;s.owners[cell]=0;}
    s.blasts.splice(i,1);
    // Control.minBlast splices the live array during AVM2 index enumeration.
    // The callback shifted into this index misses this frame, even if it is a
    // newly added or not-yet-ending blast. Its visual timeline keeps playing.
    const skipped=s.blasts[i] as Blast|undefined;
    if(skipped){skipped.delay++;skipped.until++;for(const cell of skipped.fires)if(s.flames[cell]>0)s.flames[cell]=Math.max(s.flames[cell],skipped.until);}
  }
}
export function blastSprite(kind:'normal'|'mine',frame:number,age:number){
  const selector=ART.selectors[kind][frame-1],meta=ART.timelines[selector.timeline as keyof typeof ART.timelines];
  return {name:'native-flame-'+selector.timeline,meta,matrix:selector.matrix,frame:Math.max(0,Math.min(meta.frames-1,Math.floor(age)))};
}
export function validBlasts(s:State):boolean {
  const int=(v:any,min:number,max:number)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  return Array.isArray(s.blasts)&&s.blasts.length<=64&&new Set(s.blasts.map((b:any)=>b?.id)).size===s.blasts.length&&s.blasts.every((b:any)=>
    b&&int(b.id,1,s.nextId-1)&&s.players.some(p=>p.seat===b.owner)&&int(b.x,0,16)&&int(b.y,0,14)&&
    Number.isFinite(b.px)&&b.px>=0&&b.px<=480&&Number.isFinite(b.py)&&b.py>=0&&b.py<=420&&
    int(b.born,0,s.tick)&&int(b.delay,0,MAX_BLAST_DELAY)&&b.until===b.born+BLAST_TICKS+b.delay&&b.until>s.tick&&['normal','mine'].includes(b.kind)&&typeof b.blocking==='boolean'&&
    Array.isArray(b.tiles)&&b.tiles.length>=1&&b.tiles.length<=41&&new Set(b.tiles.map((t:any)=>t&&t.x+','+t.y)).size===b.tiles.length&&
    b.tiles.every((t:any)=>t&&int(t.x,0,16)&&int(t.y,0,14)&&int(t.frame,1,9))&&b.tiles[0].x===b.x&&b.tiles[0].y===b.y&&b.tiles[0].frame===1&&
    Array.isArray(b.fires)&&b.fires.length===b.tiles.length+(b.kind==='mine'?[-1,1].flatMap(dx=>[-1,1].map(dy=>[b.x+dx,b.y+dy])).filter(([x,y])=>x>=0&&x<=16&&y>=0&&y<=14).length:0)&&
    new Set(b.fires).size===b.fires.length&&b.fires.every((cell:any)=>int(cell,0,254))&&b.tiles.every((t:any)=>b.fires.includes(t.y*17+t.x))&&
    (b.kind!=='mine'||[-1,1].every(dx=>[-1,1].every(dy=>b.x+dx<0||b.x+dx>16||b.y+dy<0||b.y+dy>14||b.fires.includes((b.y+dy)*17+b.x+dx)))));
}
