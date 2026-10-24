import type {State} from './types';
import ART from './bomb2-protection-art.json';
export const SHORT_PROTECTION_TICKS=ART.rules.shortCounterLimit+2;
export const POWER_TICKS=ART.rules.powerSeconds*ART.rules.frameRate+2;
export interface Glow {color:number;offset:number}
export interface Guard {born:number;age:number;alpha:number;clip:string}
export type Aura={phase:'intro';born:number;order:number;frame:number;glow:Glow|null}|{phase:'active';born:number;order:number;age:number;paused:boolean;glow:Glow|null};
const clip=(p:any)=>`${p.character}:${p.vehicle}:${p.dir}:${p.travel?.kind==='spring'?'jump':''}`;
export function beginProtection(s:State,p:any):void {
  p.guard={born:s.tick,age:0,alpha:p.guard?.alpha??1,clip:clip(p)};p.invulnerable=SHORT_PROTECTION_TICKS;
}
export function clearProtection(p:any):void {p.guard=null;p.aura=null;p.invulnerable=0;}
export function resetBody(p:any):void {p.heroAnim=null;if(p.guard)p.guard.alpha=1;}
export function updateBody(s:State,p:any,dir:number):void {
  if(p.vehicle||p.travel?.kind==='spring'){p.heroAnim=null;return;}
  const key=clip(p);let a=p.heroAnim;
  if(!a||a.clip!==key){a=p.heroAnim={clip:key,frame:0,at:s.tick,playing:false};if(p.guard)p.guard.alpha=1;}
  if(p.travel?.kind==='sand'){a.frame=0;a.playing=false;}
  else {
    a.playing=dir>=0&&!p.actionLock&&!p.attack;
    if(a.playing&&a.at<s.tick)a.frame=(a.frame+1)%24;
  }
  a.at=s.tick;
}
export function collectInvincibility(s:State,p:any):boolean {
  const previous=p.aura as Aura|null;
  if(previous?.phase==='intro'){previous.born=s.tick;previous.frame=0;return false;}
  p.aura={phase:'intro',born:s.tick,order:s.tick,frame:0,glow:previous?.glow??null};
  return true;
}
export function pauseAura(p:any):void {if(p.aura?.phase==='active')p.aura.paused=true;}
export function resumeAura(p:any):void {if(p.aura?.phase==='active')p.aura.paused=false;}
function guardStep(s:State,p:any):void {
  const guard=p.guard as Guard|null;if(!guard)return;
  const key=clip(p);if(guard.clip!==key){guard.clip=key;guard.alpha=1;}
  if(guard.born===s.tick)return;
  if(guard.age>ART.rules.shortCounterLimit){p.guard=null;p.invulnerable=0;return;}
  guard.age++;
  if(guard.age%ART.rules.flashEvery===0)guard.alpha+=guard.alpha>ART.rules.flashAlphaThreshold?-ART.rules.flashAlphaStep:ART.rules.flashAlphaStep;
  // Original short and power effects share the ifBurst flag. In particular,
  // a short timer ending may leave a still-visible power effect vulnerable.
  if(p.invulnerable>0)p.invulnerable=SHORT_PROTECTION_TICKS-guard.age;
}
function auraStep(s:State,p:any,onHit:(victim:any,owner:number)=>void):void {
  const a=p.aura as Aura|null;if(!a)return;
  if(a.phase==='intro'){
    a.frame=s.tick-a.born;
    if(a.frame>=ART.timelines['invincibility-intro'].frames-1){p.aura={phase:'active',born:s.tick,order:s.tick,age:0,paused:false,glow:a.glow};p.invulnerable=POWER_TICKS;}
    return;
  }
  if(a.paused||a.born===s.tick)return;
  if(a.age>ART.rules.powerSeconds*ART.rules.frameRate){p.aura=null;p.invulnerable=0;return;}
  // A newly collected source prop owns fresh color counters even while the
  // previous filter remains visible during its intro and first active frame.
  a.glow={color:Math.floor((a.age+1)/2)%ART.rules.colors.length,offset:a.age%2===0?ART.rules.colorStep:0};a.age++;
  if(p.invulnerable>0)p.invulnerable=POWER_TICKS-a.age;
  // getRobot is a grid registration query, not a distance collision. Quicksand
  // removes fading targets from this registry; jumping frogs remain in it.
  for(const q of s.players)if(q!==p&&q.alive&&!q.respawnAt&&q.travel?.kind!=='sand'&&q.x===p.x&&q.y===p.y)onHit(q,p.seat);
}
export function advanceProtections(s:State,onHit:(victim:any,owner:number)=>void):void {
  for(const p of s.players){
    if(!p.alive||p.respawnAt>s.tick)continue;
    // inEngineArr executes callbacks in registration order. New power counters
    // register when the intro ends; short guards register on spawn or a hit.
    const callbacks=[...(p.guard?[{order:p.guard.born,run:()=>guardStep(s,p)}]:[]),...(p.aura?[{order:p.aura.order,run:()=>auraStep(s,p,onHit)}]:[])].sort((a,b)=>a.order-b.order);
    for(const callback of callbacks){if(!p.alive||p.respawnAt>s.tick)break;callback.run();}
  }
}
export function bodyAlpha(p:any):number {return p.guard?.alpha??1;}
export function nativeHero(p:any,_tick:number){const key=`hero-${p.character-1}-${['left','up','right','down'][p.dir]}` as keyof typeof ART.timelines,meta=ART.timelines[key],frame=p.heroAnim?.clip===clip(p)?p.heroAnim.frame:0;return{name:'native-'+key,meta,frame};}
export function introSprite(p:any){const aura=p.aura as Aura|null;if(aura?.phase!=='intro')return null;return{name:'native-invincibility-intro',meta:ART.timelines['invincibility-intro'],frame:aura.frame};}
export function shieldVisible(p:any):boolean {return p.shield&&!p.vehicle&&p.travel?.kind!=='spring';}
export function protectionHead(p:any):number {const sprite=introSprite(p);return sprite?sprite.meta.y+(sprite.meta.bounds[sprite.frame]?.[1]??0):Infinity;}
export function validProtections(s:State):boolean {
  const int=(n:any,min:number,max:number)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
  const glow=(g:any)=>g===null||g&&int(g.color,0,ART.rules.colors.length-1)&&[0,ART.rules.colorStep].includes(g.offset);
  return s.players.every(p=>{
    const guard=p.guard,a=p.aura;
    const body=p.heroAnim;
    if(body!==null&&(!body||typeof body.clip!=='string'||body.clip.length>64||!int(body.frame,0,23)||!int(body.at,0,s.tick)||typeof body.playing!=='boolean'))return false;
    if(guard!==null&&(!guard||!int(guard.born,0,s.tick)||!int(guard.age,0,ART.rules.shortCounterLimit+1)||!Number.isFinite(guard.alpha)||![1,1-ART.rules.flashAlphaStep].some(v=>Math.abs(v-guard.alpha)<1e-8)||typeof guard.clip!=='string'||guard.clip.length>64))return false;
    if(a===null)return true;
    if(!a||!int(a.born,0,s.tick)||!int(a.order,0,s.tick)||!glow(a.glow))return false;
    if(a.phase==='intro')return int(a.frame,0,ART.timelines['invincibility-intro'].frames-2);
    return a.phase==='active'&&int(a.age,0,POWER_TICKS-1)&&typeof a.paused==='boolean';
  });
}
