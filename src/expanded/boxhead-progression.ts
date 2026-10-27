import type {State} from './types';
import {difficulty,frameRate} from './boxhead-options';

export interface Level {
  zombieRate:number;zombieLimit:number;zombieRemaining:number;zombieAlive:number;zombieCountdown:number;
  devilRate:number;devilLimit:number;devilRemaining:number;devilAlive:number;devilCountdown:number;
}
export interface Progression {
  tick:number;multiple:number;multipleTicks:number;multipleTotal:number;
  multiplierTicks:number;multiplierTotal:number;level:Level;
}
/** InitLists builds sequential floating-point increments; retain that order. */
export function levelSettings(fps:number,devils:boolean,wave:number):Level {
  let zombieRate=fps,zombieLimit=10,zombieTotal=10,devilRate=10*fps,devilLimit=0,devilTotal=0;
  for(let i=1;i<Math.min(wave,100);i++){
    zombieRate=Math.max(zombieRate-1,1);zombieLimit=Math.min(zombieLimit+5,60);zombieTotal+=5;
    if(devils){devilLimit=Math.min(i!==1?devilLimit+.3:1,5);devilTotal=i!==1?devilTotal+.25:1;devilRate=Math.max(devilRate-1,fps);}
  }
  const zr=Math.floor(zombieRate),dr=devils?Math.floor(devilRate):0;
  return {zombieRate:zr,zombieLimit:Math.floor(zombieLimit),zombieRemaining:Math.floor(zombieTotal),zombieAlive:0,zombieCountdown:zr,
    devilRate:dr,devilLimit:devils?Math.floor(devilLimit):0,devilRemaining:devils?Math.floor(devilTotal):0,devilAlive:0,devilCountdown:dr};
}
export function getTicks(fps:number,index:number):number {
  return Math.pow(100-((index<=100?index:100)-1),2.5)/100000.00000000003*(fps*3-3)+3;
}
export function initProgression(s:State):void {
  const tier=difficulty(s.options.difficulty),multiplier=s.mode==='deathmatch'?200:tier.multiplier;
  s.wave=s.mode==='deathmatch'?1:tier.wave;s.combo=multiplier;
  const total=getTicks(frameRate(s),multiplier);
  s.progression={tick:0,multiple:0,multipleTicks:100000,multipleTotal:100000,multiplierTicks:total,multiplierTotal:total,level:levelSettings(frameRate(s),s.options.devils,s.wave)} satisfies Progression;
  summaries(s);
}
export function summaries(s:State):void {
  const l=(s.progression as Progression).level;
  s.spawnLeft=s.mode==='deathmatch'?0:Math.max(0,l.zombieRemaining-l.zombieAlive);
  s.devilLeft=s.mode==='deathmatch'?0:Math.max(0,l.devilRemaining-l.devilAlive);
}
export function enterWave(s:State,wave:number):void {
  s.wave=wave;(s.progression as Progression).level=levelSettings(frameRate(s),s.options.devils,wave);summaries(s);
}
export function setMultiplier(s:State,value:number,upgrade:()=>void):void {
  s.combo=Math.max(1,Math.min(999,value));const p=s.progression as Progression;
  p.multiplierTotal=p.multiplierTicks=getTicks(frameRate(s),s.combo);
  if(value>1)upgrade();
}
export function enemySpawned(s:State,devil:boolean):void {
  const l=(s.progression as Progression).level;if(devil)l.devilAlive++;else l.zombieAlive++;summaries(s);
}
/** World.LogKill decrements a live counter before scoring or deciding a drop. */
export function enemyKilled(s:State,devil:boolean,upgrade:()=>void):boolean {
  const p=s.progression as Progression,l=p.level;
  if(devil){l.devilAlive--;l.devilRemaining--;l.devilLimit=Math.min(l.devilLimit,l.devilRemaining);}
  else{l.zombieAlive--;l.zombieRemaining--;l.zombieLimit=Math.min(l.zombieLimit,l.zombieRemaining);}
  p.multiple++;p.multipleTotal=p.multipleTicks=getTicks(frameRate(s),p.multiple)/6;
  setMultiplier(s,s.combo+1,upgrade);s.score+=(devil?1000:100)*s.combo;summaries(s);
  return devil||p.multiple%5===0;
}
export function syncLiveCounts(s:State):void {
  const l=(s.progression as Progression).level;
  l.zombieAlive=s.zombies.filter((z:any)=>!z.devil&&!z.body.loggedKill).length;
  l.devilAlive=s.zombies.filter((z:any)=>z.devil&&!z.body.loggedKill).length;
}
export function stepProgression(s:State,hooks:{spawn(devil:boolean):boolean;upgrade():void;wave():void;hasCreatures():boolean}):void {
  if(s.mode==='deathmatch')return;
  const p=s.progression as Progression,l=p.level;p.tick++;
  if(l.zombieLimit<=0&&l.devilLimit<=0&&!hooks.hasCreatures()){
    enterWave(s,s.wave+1);hooks.wave();
  }else{
    if(l.zombieAlive<Math.min(l.zombieLimit,60)&&l.zombieCountdown--<=0&&hooks.spawn(false)){
      enemySpawned(s,false);l.zombieCountdown=l.zombieRate;
    }
    if(l.devilAlive<l.devilLimit&&(l.devilCountdown-=l.zombieLimit!==0?1:10)<=0&&hooks.spawn(true)){
      enemySpawned(s,true);l.devilCountdown=l.devilRate;
    }
  }
  if(p.multipleTicks--<0){p.multiple=0;p.multipleTicks=p.multipleTotal=100000;}
  if(p.multiplierTicks--<0)setMultiplier(s,s.combo-1,hooks.upgrade);
  summaries(s);
}
export function validProgression(s:State):boolean {
  const p=s.progression as Progression,l=p?.level;
  return !!p&&Number.isSafeInteger(p.tick)&&p.tick>=0&&p.tick<=s.tick&&Number.isSafeInteger(p.multiple)&&p.multiple>=0&&
    ['multipleTicks','multipleTotal','multiplierTicks','multiplierTotal'].every(k=>Number.isFinite(p[k as keyof Progression]))&&
    p.multipleTicks>=-1&&p.multipleTotal>0&&p.multiplierTicks>=-1&&p.multiplierTotal>0&&
    !!l&&Object.values(l).every(Number.isSafeInteger)&&l.zombieRate>=1&&l.devilRate>=0&&
    ['zombieLimit','zombieRemaining','zombieAlive','devilLimit','devilRemaining','devilAlive'].every(k=>l[k as keyof Level]>=0)&&
    Number.isSafeInteger(s.wave)&&s.wave>=1&&Number.isSafeInteger(s.combo)&&s.combo>=1&&s.combo<=999&&Number.isSafeInteger(s.peakCombo)&&s.peakCombo>=s.combo&&s.peakCombo<=999;
}
