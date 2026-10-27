export const MODES=[{id:'stock',label:'生命制',description:'耗尽生命出局，最后留场者获胜。',minPlayers:2,maxPlayers:4},{id:'time',label:'计时制',description:'无限复活，时间结束按原击杀减死亡分数排名；0秒为不限时。',minPlayers:2,maxPlayers:4}];
export interface Settings {brawlerStocks?:number;brawlerSeconds?:number;brawlerItems?:number}
export interface Rules {stocks:number;seconds:number;itemFrequency:number}
export const DEFAULTS:Rules={stocks:5,seconds:300,itemFrequency:3};
export function rules(settings:Settings={}):Rules {return {stocks:settings.brawlerStocks??DEFAULTS.stocks,seconds:settings.brawlerSeconds??DEFAULTS.seconds,itemFrequency:settings.brawlerItems??DEFAULTS.itemFrequency};}
export function validRules(o:Rules):boolean {return !!o&&Number.isSafeInteger(o.stocks)&&o.stocks>=1&&Number.isSafeInteger(o.seconds)&&o.seconds>=0&&Number.isInteger(o.itemFrequency)&&o.itemFrequency>=0&&o.itemFrequency<=5;}
/** Original frame1 random(7): gotoAndStop(0) leaves the initial frame1. */
const firstFrame=(random:()=>number)=>Math.max(1,Math.floor(random()*7));
export function garbageFrame(type:number,initial:number,random:()=>number):number {
 if(type===0)return initial;
 if(type===1)return initial===1?1:firstFrame(random);
 return type>=2&&type<=6?type:initial;
}
export function newGarbageFrame(type:number,random:()=>number):number {return garbageFrame(type,firstFrame(random),random);}
export function standings(mode:'stock'|'time',players:{seat:number;nativeKos:number;deaths:number;deathOrder:number|null}[],numDead:number):{seat:number;score:number}[] {
 const order=players.map(p=>({seat:p.seat,score:mode==='time'?p.nativeKos-p.deaths:p.deathOrder??numDead})),stack=[[0,order.length-1]];
 // AVM1 sortOn uses a left-pivot quicksort; equal scores can move during
 // partitioning. Native frame101 fixtures cover the resulting order.
 // Reference: ruffle-rs/ruffle nightly-2026-08-06, avm1/globals/array.rs qsort.
 while(stack.length){const [lo,hi]=stack.pop()!;if(lo>=hi)continue;const pivot=order[lo];let l=lo+1,r=hi;
  for(;;){while(l<r&&order[l].score-pivot.score>0)l++;while(r>lo&&order[r].score-pivot.score<=0)r--;if(l>=r)break;[order[l],order[r]]=[order[r],order[l]];}
  [order[lo],order[r]]=[order[r],order[lo]];stack.push([r+1,hi]);if(r>0)stack.push([lo,r-1]);
 }
 return order;
}
