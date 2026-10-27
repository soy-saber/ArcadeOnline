import source from './brawler-native-art.json';
import fighters from './brawler-data.json';

export const COLORS=['red','blue','green','orange'] as const;
export type Color=typeof COLORS[number];
export interface Animation {pose:string;frame:number;playing:boolean}
type Frame=number[];
export interface Geometry {bounds:(number|null)[];marks:Record<string,(number|boolean|null)[]>;transform:(number|null)[]}
interface Pose {rootFrame:number;frames:number;commands:Record<string,{goto?:number;play:boolean}[]>;art:Record<string,Record<string,Frame[]>>}
interface NativeArt {geometry:Geometry[];fighters:Record<string,{sheets:Record<string,string>;poses:Record<string,Pose>}>}
const art=source as unknown as NativeArt;
export const names=fighters.fighters.map(f=>f.id);
export function definition(character:number,pose:string):Pose{return art.fighters[names[character]].poses[pose];}
export function validAnimation(character:number,value:unknown):value is Animation {
 if(!value||typeof value!=='object')return false;const a=value as Animation,poses=art.fighters[names[character]]?.poses;
 return !!poses&&typeof a.pose==='string'&&Object.prototype.hasOwnProperty.call(poses,a.pose)&&Number.isInteger(a.frame)&&a.frame>=1&&a.frame<=Math.max(1,poses[a.pose].frames)&&typeof a.playing==='boolean';
}
export function animation(pose='still'):Animation{return {pose,frame:1,playing:true};}
export function selectAnimation(p:{animation:Animation},pose:string):void {
  if(p.animation.pose!==pose)p.animation=animation(pose);
}
export function restartAnimation(p:{animation:Animation},pose:string):void {p.animation=animation(pose);}
/** Root clips run at30FPS; their source stop/goto commands run on entry. */
export function advanceAnimation(character:number,a:Animation):void {
  const d=definition(character,a.pose);if(!a.playing||d.frames===0)return;
  a.frame=a.frame<d.frames?a.frame+1:1;
  const seen=new Set<number>();
  while(!seen.has(a.frame)){
    seen.add(a.frame);let jumped=false;
    for(const c of d.commands[String(a.frame)]||[]){a.playing=c.play;if(c.goto!==undefined){a.frame=Math.max(1,Math.min(d.frames,c.goto));jumped=true;}}
    if(!jumped)break;
  }
}
export function nativeFrame(p:{character:number;color:Color;animation:Animation;emitted?:boolean}):Frame {
  const d=definition(p.character,p.animation.pose),color=d.art[p.color];
  const list=p.emitted&&color.emitted?color.emitted:color.normal;
  return list[Math.min(list.length-1,Math.max(0,p.animation.frame-1))];
}
export function geometry(p:{character:number;color:Color;animation:Animation;emitted?:boolean}):Geometry {return art.geometry[nativeFrame(p)[6]];}
export function mark(p:{character:number;color:Color;animation:Animation;emitted?:boolean},name:string):number[] {
  const g=geometry(p),v=g.marks[name];return v?v.slice(0,7).map(Number):[NaN,NaN,NaN,NaN,NaN,NaN,NaN];
}
export function rootPose(p:{character:number;animation:Animation}):number{return definition(p.character,p.animation.pose).rootFrame;}
export function bounds(p:{character:number;color:Color;animation:Animation;emitted?:boolean;x:number;y:number;facing:number}):number[]|null {
  const b=geometry(p).bounds;if(b.some(n=>n===null||!Number.isFinite(n)))return null;
  const [left,top,right,bottom]=b as number[];if(left===right||top===bottom)return null;
  return [p.x+Math.min(left*p.facing,right*p.facing),p.y+top,p.x+Math.max(left*p.facing,right*p.facing),p.y+bottom];
}
/** MovieClip coordinate setters truncate toward zero at one twentieth pixel. */
export function twip(n:number):number {return Math.trunc(n*20)/20;}
export function imagePath(character:number,color:Color):string{return '/expanded/assets/brawler/native/'+art.fighters[names[character]].sheets[color];}
