import data from './boxhead-data.json';
import { EMPTY_INPUT, validInput, type Input, type State } from './types';
import { MAPS, WEAPONS, CHARACTERS, CELL, room, move, openPosition, weaponStats } from './boxhead-world';
import { queueExplosion, processExplosions, validExplosions, type Explosion } from './boxhead-explosions';
import { ownedPacks, weaponEmpty, selectWeapon, stepExplosiveObjects, validExplosiveObject } from './boxhead-objects';
import { explosionFeedback, stepFeedback } from './boxhead-feedback';
import { wallState, wallBlocks, affectWall, processWallAffects, stepWalls, validWall } from './boxhead-walls';
import { objectRegistration, stepRegistration, processBarrelAffects, validRegistration } from './boxhead-registration';
import { playerPose, weaponPosition, advancePlayerPose, updateFireKey, renewFireKey, consumeFireKey, validPlayerPose } from './boxhead-player-pose';
import { placementCell } from './boxhead-placement';
import { navigationState, stepNavigation, validNavigation, cell, adjacent, flags, CREATURE, OBJECT, SOLID } from './boxhead-navigation';
import { enemyBrain, stepEnemy, transition, validEnemyAI } from './boxhead-ai';
import { stepFireball, validFireball } from './boxhead-fireball';
import { creatureBody, queueAffect, stepCreature, validCreature, type HitKind } from './boxhead-creature';
import { rayShot, stepRay, stepRocket, validShot } from './boxhead-shots';
import { grenadeShot, stepGrenade, validGrenade } from './boxhead-grenades';
import {DIFFICULTIES,MODES,SPEEDS,DEATH_LIMITS,frameRate,type Settings} from './boxhead-options';
import {stepPickups,dropPickup} from './boxhead-pickups';
import {initProgression,stepProgression,syncLiveCounts,enemyKilled,validProgression} from './boxhead-progression';
import {rebuildWeapon,refreshCurrentWeapon,validWeaponInventory} from './boxhead-weapon-upgrades';

export const ID = '50737-server';
export function random(s: State): number { s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296; }
function sound(s: State, name: string): void { s.sounds.push({id:++s.soundId,tick:s.tick,name}); }
function effect(s: State, kind: string, x: number, y: number, life = 12, extra = {}): void {
  s.effects.push({id:++s.nextId,kind,x,y,life,total:life,born:s.tick,...extra});
}
function accept(s: State,p: any,candidate: unknown): Input {
  const at=p.seat-1,current=s.inputs[at] as Input;let next:Input;
  if(!validInput(candidate)) next={...current,left:false,right:false,up:false,down:false,trigger:false};
  else if(candidate.seq<current.seq) next=current;
  else if(candidate.seq===current.seq) next={...current,left:current.left&&candidate.left,right:current.right&&candidate.right,up:current.up&&candidate.up,down:current.down&&candidate.down,trigger:current.trigger===true&&candidate.trigger===true};
  else next={...candidate,attack:Math.max(candidate.attack,current.attack,p.lastAttack),alt:Math.max(candidate.alt,current.alt,p.lastAlt)};
  s.inputs[at]={...next};return next;
}
export function create(round: number, playing: boolean, seats: number[], seed: number, mapId?: string,mode='coop',settings?:Settings): State {
  const map=MAPS.find(m=>m.id===mapId)||MAPS[0];
  const characters=settings?.characters?[...settings.characters]:[1,2,3,4];
  const s: State={gameId:ID,round,tick:0,phase:playing?'playing':'waiting',winner:null,ack:[0,0,0,0],inputs:Array.from({length:4},()=>({...EMPTY_INPUT})),rng:seed>>>0,mapId:map.id,
    players:[],zombies:[],bullets:[],barrels:[],pickups:[],effects:[],explosions:[],corpses:[],sounds:[],soundId:0,shakeY:0,brightness:playing?1:0,wave:0,spawnLeft:0,devilLeft:0,nextId:0,score:0,combo:1,peakCombo:1,message:'',messageUntil:0,mode,paused:false,actionAck:[0,0,0,0],options:{characters,difficulty:settings?.difficulty??'beginner',speed:settings?.speed??1,devils:settings?.devils??true,collisions:settings?.collisions??true,damage:mode==='deathmatch'?true:settings?.damage??true,deathLimit:settings?.deathLimit??10}};
  for(const b of map.barrels) s.barrels.push({id:++s.nextId,...b,z:0,kind:'barrel',hp:1,damage:100,owner:0,exploded:false,armed:0,...objectRegistration()});
  for(const b of map.walls) s.barrels.push({id:++s.nextId,...b,z:0,kind:'wall',...wallState(),owner:0,exploded:false,armed:0,...objectRegistration()});
  for(const b of map.pickups) s.pickups.push({id:++s.nextId,...b,life:250,born:0,permanent:true,reappearAt:null});
  s.enemyCells=Array(map.columns*map.rows).fill(false);s.navigation=navigationState(map.columns*map.rows);
  const primary=map.playerSpawns[0]||{x:map.width/2,y:map.height/2,dir:0};
  const spawns=[primary,...map.otherSpawns].sort((a,b)=>Math.hypot(a.x-primary.x,a.y-primary.y)-Math.hypot(b.x-primary.x,b.y-primary.y));
  for(const seat of [...new Set(seats)].filter(n=>Number.isInteger(n)&&n>=1&&n<=4).sort()) {
    const spawn=spawns[s.players.length]||primary, pos=openPosition(s,spawn.x,spawn.y,s.players);
    s.players.push({id:++s.nextId,seat,x:pos.x,y:pos.y,dir:spawn.dir,body:creatureBody(true),character:CHARACTERS[characters[seat-1]-1],hp:200,alive:true,lives:1,respawn:0,kills:0,deaths:0,killedBy:0,
      weapon:0,unlocked:[true,...Array(9).fill(false)],inventory:WEAPONS.map((w,i)=>i===0?w.ammo:0),weaponCaps:WEAPONS.map(w=>w.ammo),weaponRevisions:Array(10).fill(0),ammo:-1,cooldown:0,chargeDetonate:false,invul:200,lastAttack:0,lastAlt:0,selectionPending:false,selectionWeapon:null,selectionStep:1,moving:false,fireAt:-99,hitAt:-99,deadAt:0,triggerDown:false,triggerAt:0,...playerPose()});
  }
  initProgression(s);
  if(s.combo>1){
    upgrade(s);
    // Original SetDifficulty suppresses intermediate upgrade messages.
    s.message='';s.messageUntil=0;
  }
  for(const p of s.players){if(mode==='deathmatch')p.inventory=WEAPONS.map((_,i)=>i===0||p.unlocked[i]&&weaponStats(s,i).ammo<0?-1:0);p.weapon=0;p.ammo=-1;p.cooldown=0;}
  return s;
}
function announceWave(s: State): void {
  s.message=`第 ${s.wave} 波`;s.messageUntil=s.tick+65;
  // CSound.mSamples.Click is linked to World.End.wav, not the menu's CLICK.wav.
  if(s.wave>1)sound(s,'World.End.wav');
}
function spawnEnemy(s:State,devil:boolean):boolean {
  const map=room(s),locations=devil?map.devilSpawns:map.zombieSpawns;
  const start=Math.floor(random(s)*locations.length);
  for(let n=0;n<locations.length;n++) {
    const marker=locations[(start+n)%locations.length],at=cell(s,marker.x,marker.y);
    if(at<0)continue;
    let next=-1;for(const dir of [0,2,4,6]){const candidate=adjacent(s,at,dir);if(!(flags(s,candidate)&SOLID)){next=candidate;break;}}
    if(next<0||(flags(s,at)|flags(s,next))&(CREATURE|(devil?0:OBJECT)))continue;
    const z={id:++s.nextId,x:marker.x,y:marker.y,hp:devil?1000:100,devil,attack:0,dir:0,owner:0,hitAt:-99,attackAt:-99,ai:null as any};
    z.ai=enemyBrain(s,z);s.zombies.push(z);return true;
  }
  return false;
}
function damage(s: State,target: any,amount: number,owner: number,kind:HitKind='bullet',source:any=target,range:number|null=null): void {
  if(['barrel','wall'].includes(target.kind)&&!target.registered)return;
  if('devil'in target&&(!target.ai.registered||!target.ai.collidable))return;
  if(target.kind==='wall'){
    affectWall(target,amount,owner);return;
  }
  // Every accepted barrel affect is fatal; only the newest attribution is needed.
  if(target.kind==='barrel') {if(target.hp>0)target.barrelAffects=[owner];return;}
  queueAffect(s,target,kind,amount,owner,source,range);
}
function hurt(s: State,p: any,amount: number,owner=0,kind:HitKind='bullet',source:any=p,range:number|null=null): void {
  if(!s.options.damage&&(kind==='bullet'||kind==='explosion'))return;
  queueAffect(s,p,kind,amount,owner,source,range);
}
function explode(s: State,e:Explosion): void {
  const {x,y,damage:amount,owner}=e;
  explosionFeedback(s);
  const radius=(2+Math.max(amount-100,0)*.005)*32;
  effect(s,'Effect.Explosion',x,y,8,{scale:1,born:s.tick,z:e.z});effect(s,'Effect.ScorchMark',x,y,500);sound(s,'Effect.Explosion.wav');
  const amountAt=(target:any)=>{const fraction=Math.hypot(target.x-x,target.y-y)/radius;return fraction>1?0:amount*(fraction>.75?.5:fraction>.5?.75:1);};
  for(const z of s.zombies)if(amountAt(z))damage(s,z,amount,owner,'explosion',e,radius);
  for(const b of s.barrels)if(b.hp>0&&['barrel','wall'].includes(b.kind)&&amountAt(b))damage(s,b,amountAt(b),owner);
  // The original default enables bullet/explosion damage, including friendly fire and self explosions.
  for(const p of s.players)if(amountAt(p))hurt(s,p,amount,owner,'explosion',e,radius);
}
function fire(s: State,p: any): void {
  const gun=weaponStats(s,p.weapon),origin=weaponPosition(p);
  if(gun.id==='chargepack'&&p.chargeDetonate) {
    for(const b of ownedPacks(s,p.seat))b.detonating=true;
    p.chargeDetonate=false;return;
  }
  if(p.inventory[p.weapon]===0) {p.weapon=0;p.ammo=-1;return;}
  if(['barrel','fakewall','mine','chargepack'].includes(gun.id)) {
    // The native charge-pack placement cue precedes its occupancy check.
    if(gun.id==='chargepack')sound(s,'Weapon.Mine.Place.wav');
    const map=room(s),position=placementCell(s,origin,map.columns,map.rows);
    if(!position)return;
    s.barrels.push({id:++s.nextId,...position,kind:gun.id==='fakewall'?'wall':gun.id,hp:gun.id==='barrel'?1:60,...(gun.id==='fakewall'?wallState():{}),...(['barrel','fakewall'].includes(gun.id)?objectRegistration():{}),damage:gun.damage,owner:p.seat,exploded:false,armed:s.tick,detonateAt:0,animation:0,detonating:false,detonateCounter:null,...(gun.id==='mine'?{mineWaiting:s.mode==='deathmatch'}:{})});
    if(gun.id==='chargepack')p.chargeDetonate=true;
    else sound(s,gun.id==='mine'?'Weapon.Mine.Place.wav':'Object.Barrel.Place.wav');
  } else if(gun.id==='grenade') {
    grenadeShot(s,p,origin,Math.min(.75,Math.max(.25,(s.tick-p.triggerAt)/frameRate(s))),gun.damage,gun.bang,gun.cluster);
  } else if(gun.id==='rocket') {
    s.bullets.push({id:++s.nextId,...origin,vz:0,vx:Math.cos(p.dir)*16,vy:Math.sin(p.dir)*16,angle:p.dir,parent:p.id,owner:p.seat,weapon:p.weapon,damage:gun.damage,life:1,bang:gun.bang,cluster:gun.cluster,born:s.tick});
  } else {
    const spacing=1.25*(gun.spread+1)*Math.PI/180;
    const spriteKey=gun.id==='uzi'?'UZI.MuzzleFlash':gun.id==='shotgun'?'Shotgun.MuzzleFlash':gun.id==='railgun'?'Railgun.MuzzleFlash':'Pistol.MuzzleFlash';
    effect(s,'Effect.MuzzleFlash',origin.x,origin.y,2,{z:origin.z,angle:p.dir,spriteKey});
    rayShot(s,p,origin,p.dir,gun.damage,gun.range,()=>random(s));
    if(gun.id==='shotgun')for(let i=0;i<(gun.spread?2:1);i++)for(const sign of [-1,1])
      rayShot(s,p,origin,p.dir+sign*spacing*(i+1),gun.damage,gun.range,()=>random(s),i>=1);
  }
  if(p.inventory[p.weapon]>0)p.inventory[p.weapon]--;
  p.ammo=p.inventory[p.weapon];p.cooldown=gun.rate;p.fireAt=s.tick;
  if(gun.sound)sound(s,'Weapon.'+gun.sound+'.Fire.wav');
}
function upgrade(s: State): void {
  if(s.combo<=s.peakCombo)return;
  const before=s.peakCombo,target=s.combo;
  for(const u of data.upgrades.filter(u=>u.threshold>before&&u.threshold<=target)) {
    s.peakCombo=u.threshold;
    s.message=u.mName;s.messageUntil=s.tick+90;
    if(u.mClassID==='CThing_Creature_Player') {
      const index=WEAPONS.findIndex(w=>w.id===u.mValue);
      if(index>=0)for(const p of s.players) {p.unlocked[index]=true;rebuildWeapon(s,p,index);}
    }
  }
  s.peakCombo=target;
}
function projectiles(s: State): void {
  const hooks={random:()=>random(s),damage:(target:any,amount:number,b:any)=>target.seat?hurt(s,target,amount,b.owner,'bullet',b):damage(s,target,amount,b.owner,'bullet',b),
    sound:(name:string)=>sound(s,name),effect:(kind:string,x:number,y:number,life:number,extra:any)=>effect(s,kind,x,y,life,extra)};
  s.bullets=s.bullets.filter((b:any)=>b.life>0);
  for(const b of [...s.bullets].sort((a,b)=>b.id-a.id)) {
    if(b.life<=0)continue;
    if(b.born>=s.tick)continue;
    if(b.ray){stepRay(s,b,hooks);continue;}
    if(b.fireball){if(b.born<s.tick)stepFireball(s,b,{hurt:(p,amount)=>hurt(s,p,amount,0,'fireball',b),damage:(target,amount)=>damage(s,target,amount,0,'fireball',b)});continue;}
    if(b.weapon===7){if(stepRocket(s,b,hooks)){b.life=0;queueExplosion(s,b.x,b.y,b.damage,b.owner,b.bang,b.cluster,b.z);}continue;}
    if(b.weapon===4&&stepGrenade(s,b,name=>sound(s,name)))queueExplosion(s,b.x,b.y,b.damage,b.owner,b.bang,b.cluster,b.z);
  }
  s.bullets=s.bullets.filter((b:any)=>b.life>0||b.rayPhase==='delete'||b.grenadePhase==='delete');
}
export function step(s: State,inputs: Input[]): void {
  if(s.phase!=='playing'||s.paused)return;s.tick++;
  syncLiveCounts(s);
  stepWalls(s);
  stepRegistration(s);
  s.effects=s.effects.filter((e:any)=>--e.life>0);s.corpses=s.corpses.filter((e:any)=>s.tick-e.deadAt<100);
  for(const e of s.effects)if(e.kind==='Effect.RocketSmoke'){e.vx*=1.2;e.vy*=1.2;e.x+=e.vx;e.y+=e.vy;}
  s.zombies=s.zombies.filter((z:any)=>z.body.disposeAt===null||z.body.disposeAt>s.tick);
  s.sounds=s.sounds.filter((e:any)=>s.tick-e.tick<10);
  projectiles(s);processExplosions(s,random,e=>explode(s,e));
  const respawning=new Set<any>();
  const hooks={random:()=>random(s),sound:(name:string)=>sound(s,name),blood:(p:any,size:number)=>effect(s,'Effect.BloodSplat',p.x+(random(s)-.5)*16,p.y+(random(s)-.5)*16,500,{floor:true,bloodCount:size}),
    resume:(p:any)=>{if(p.seat)p.poseName='';else transition(s,p,'goto');},
    dying:(p:any)=>{
      p.deadAt=s.tick;
      if(p.seat){p.alive=false;p.deaths++;p.moving=false;if(s.mode==='deathmatch'){const killer=s.players.find(q=>q.seat===p.killedBy&&q!==p);if(killer)killer.kills++;dropPickup(s,p);}return;}
      p.ai.collidable=false;const owner=s.players.find(q=>q.seat===p.owner);if(owner)owner.kills++;
      if(enemyKilled(s,p.devil,()=>upgrade(s)))dropPickup(s,p);
    },
    playerDead:()=>{
      if(s.phase!=='playing')return;
      if(s.mode==='deathmatch'){
        const remaining=s.players.filter(p=>p.deaths<s.options.deathLimit);
        if(remaining.length<=1){s.phase='finished';s.winner=remaining[0]?.seat??0;sound(s,'World.End.wav');}
      }else if(!s.players.some(p=>!p.body.deadFlag)){s.phase='finished';s.winner=0;sound(s,'World.End.wav');}
    },
    respawn:(p:any)=>{
      const deathmatch=s.mode==='deathmatch';if(deathmatch&&p.deaths>=s.options.deathLimit)return false;
      const others=[...s.players].reverse().filter(q=>q!==p&&!q.body.deadFlag),other=others[0];if(!deathmatch&&!other)return false;
      const map=room(s),spawns=[...map.playerSpawns,...map.otherSpawns],start=Math.floor(random(s)*spawns.length);let best:any=null,distance=Infinity;
      for(let i=0;i<spawns.length;i++){
        const pos=spawns[(start+i)%spawns.length],mask=flags(s,cell(s,pos.x,pos.y));
        if(deathmatch){const d=others.length?Math.min(...others.map(q=>(pos.x-q.x)**2+(pos.y-q.y)**2)):Infinity;if(!(mask&(CREATURE|OBJECT|64))&&(!best||d>distance)){best=pos;distance=d;}continue;}
        const d=(pos.x-other.x)**2+(pos.y-other.y)**2;
        if(!(mask&(CREATURE|OBJECT|64))&&d>=4*CELL*CELL&&d<distance&&Math.abs(pos.x-other.x)<=19*CELL&&Math.abs(pos.y-other.y)<=13*CELL){best=pos;distance=d;}
      }
      if(!best)return false;
      p.x=best.x;p.y=best.y;p.dir=best.dir;p.alive=true;p.invul=deathmatch?25:125;p.body=creatureBody(true);
      p.poseName='';p.poseAction=p.drawAction='stand';p.poseFrame=p.drawFrame=0;respawning.add(p);return true;
    }};
  // Creature callbacks follow newest creation first. Other collection types
  // retain their dedicated phases pending the complete collection migration.
  for(const p of [...s.players,...s.zombies].sort((a,b)=>b.id-a.id)){
    if(!p.seat){if(stepCreature(s,p,hooks))stepEnemy(s,p,{random:()=>random(s),hurt:(q,n,source)=>hurt(s,q,n,0,'melee',source),damage:(target,n)=>damage(s,target,n,0)});else if(p.devil&&p.ai.state!=='init')p.ai.fireRateCount--;continue;}
    const input=accept(s,p,inputs[p.seat-1]);s.ack[p.seat-1]=Math.max(s.ack[p.seat-1],input.seq);
    const attack=input.attack>p.lastAttack,alt=input.alt>p.lastAlt;
    p.triggerDown=input.trigger===true;
    const cancelled=input.cancelledAttack!==undefined&&input.cancelledAttack>=input.attack&&input.attack>0;
    updateFireKey(p,p.triggerDown,attack,cancelled,s.tick);
    p.lastAttack=Math.max(p.lastAttack,input.attack);p.lastAlt=Math.max(p.lastAlt,input.alt);
    if(alt){p.selectionPending=true;p.selectionWeapon=input.weapon??null;p.selectionStep=input.weaponStep??1;}
    const normal=stepCreature(s,p,hooks);p.invul=Math.max(0,p.invul-1);
    if(p.body.phase!=='control'){p.poseName='';p.poseAction=p.body.action;p.poseFrame=p.body.frame;p.drawAction=p.body.action;p.drawFrame=p.body.frame;}
    p.respawn=p.body.phase==='dead'?Math.max(0,p.body.counter)+26:p.body.phase==='respawn'?Math.max(0,p.body.counter)+1:p.body.phase==='dying'?Math.ceil((5-p.body.frame)/.34)+4*frameRate(s)+27:0;
    if(!normal){p.moving=false;continue;}
    p.cooldown=Math.max(0,p.cooldown-1);
    const dx=Number(input.right)-Number(input.left),dy=Number(input.down)-Number(input.up),oldX=p.x,oldY=p.y;
    if(dx||dy)p.dir=Math.atan2(dy,dx);
    move(s,p,dx*5.12,dy*5.12);
    p.moving=p.x!==oldX||p.y!==oldY;
    const nextPose=WEAPONS[p.weapon].id+(p.moving?'walk':'stand');
    if(p.hp>0)p.hp=Math.min(200,p.hp+200/(frameRate(s)*30));
    if(p.selectionPending){
      p.selectionPending=false;
      if(p.selectionWeapon!==null){if(p.unlocked[p.selectionWeapon]&&!weaponEmpty(s,p,p.selectionWeapon)){selectWeapon(s,p,p.selectionWeapon);renewFireKey(p);}}
      else for(let i=1;i<=10;i++){const index=(p.weapon+i*p.selectionStep+10)%10;if(p.unlocked[index]&&!weaponEmpty(s,p,index)){selectWeapon(s,p,index);renewFireKey(p);break;}}
    }
    refreshCurrentWeapon(s,p);
    const empty=weaponEmpty(s,p,p.weapon);if(empty)selectWeapon(s,p,0);
    const gun=weaponStats(s,p.weapon);
    const firing=!empty&&p.cooldown===0&&!cancelled&&consumeFireKey(p,gun.auto,gun.onRelease);
    if(firing)fire(s,p);
    advancePlayerPose(p,nextPose,firing);
    if(respawning.has(p)){
      // State_Respawn calls PlayerControl_Init (and thus one control callback)
      // before renewing FIRE, restoring life and emptying/selecting weapons.
      renewFireKey(p);p.hp=200;p.inventory=WEAPONS.map((_,i)=>i===0||p.unlocked[i]&&weaponStats(s,i).ammo<0?-1:0);
      p.weapon=0;p.ammo=-1;p.cooldown=0;p.chargeDetonate=false;p.selectionPending=false;
    }
  }
  if(s.mode==='deathmatch'&&(s.phase as string)==='finished'){const remaining=s.players.filter(p=>p.deaths<s.options.deathLimit);s.winner=remaining.length===1?remaining[0].seat:0;}
  processWallAffects(s,b=>{
    const frames=data.objects['Effect.SmokeCloud'].frames;
    effect(s,'Effect.SmokeCloud',b.x,b.y,frames+1,{born:s.tick+1,scale:1,z:b.z});
    effect(s,'Effect.ScorchMark',b.x,b.y,500);
  });
  stepExplosiveObjects(s,sound);
  processBarrelAffects(s);
  for(const b of s.barrels)if(b.hp<=0&&!b.exploded){b.exploded=true;if(b.kind!=='wall'){
    const index=b.kind==='mine'?6:b.kind==='chargepack'?8:3,gun=weaponStats(s,index);
    // Native objects retain construction damage; object flags refresh on hit.
    queueExplosion(s,b.x,b.y,b.damage??100,b.owner,gun.bang,gun.cluster,b.z);
  }}
  s.barrels=s.barrels.filter((b:any)=>b.hp>0||wallBlocks(b,s.tick));
  stepPickups(s,()=>random(s),()=>sound(s,'Object.Pickup.wav'));
  // Only decals are disposable visual history. Active registered effects and
  // corpses also participate in native cell occupancy until their own disposal.
  const decals=new Set(s.effects.filter((e:any)=>['Effect.BloodSplat','Effect.BloodPool','Effect.ScorchMark'].includes(e.kind)).slice(-180));
  s.effects=s.effects.filter((e:any)=>!['Effect.BloodSplat','Effect.BloodPool','Effect.ScorchMark'].includes(e.kind)||decals.has(e));s.sounds=s.sounds.slice(-40);
  stepNavigation(s);
  stepProgression(s,{spawn:devil=>spawnEnemy(s,devil),upgrade:()=>upgrade(s),wave:()=>announceWave(s),hasCreatures:()=>s.zombies.some((z:any)=>z.body.phase!=='disposed')});
  stepFeedback(s);
}

function nums(v:any,keys:string[]):boolean{return !!v&&keys.every(k=>Number.isFinite(v[k]));}
export function valid(value: unknown): value is State {
  if(!value||typeof value!=='object')return false;const s=value as State;
  return s.gameId===ID&&Number.isSafeInteger(s.tick)&&s.tick>=0&&Number.isSafeInteger(s.round)&&['waiting','playing','finished'].includes(s.phase)&&(s.mode==='deathmatch'?[null,0,1,2,3,4]:[null,0]).includes(s.winner)&&MAPS.some(m=>m.id===s.mapId)&&
    MODES.some(m=>m.id===s.mode)&&(s.mode!=='single'||Array.isArray(s.players)&&s.players.length<=1&&s.players.every(p=>p?.seat===1))&&
    typeof s.paused==='boolean'&&Array.isArray(s.actionAck)&&s.actionAck.length===4&&s.actionAck.every((n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<1e9)&&
    !!s.options&&Array.isArray(s.options.characters)&&s.options.characters.length===4&&s.options.characters.every((c:unknown)=>Number.isInteger(c)&&Number(c)>=1&&Number(c)<=4)&&
    DIFFICULTIES.some(d=>d.id===s.options.difficulty)&&
    SPEEDS.includes(s.options.speed)&&DEATH_LIMITS.includes(s.options.deathLimit)&&['devils','collisions','damage'].every(k=>typeof s.options[k]==='boolean')&&(s.mode!=='deathmatch'||s.options.damage&&s.spawnLeft===0&&s.devilLeft===0)&&
    Array.isArray(s.players)&&s.players.every(p=>p&&p.character===CHARACTERS[s.options.characters[p.seat-1]-1])&&
    (s.mode!=='deathmatch'||!s.winner||s.players.some(p=>p.seat===s.winner))&&
    Array.isArray(s.ack)&&s.ack.length===4&&s.ack.every(n=>Number.isSafeInteger(n)&&n>=0)&&Array.isArray(s.inputs)&&s.inputs.length===4&&s.inputs.every(validInput)&&
    Array.isArray(s.players)&&s.players.length<=4&&new Set(s.players.map(p=>p?.seat)).size===s.players.length&&s.players.every(p=>[1,2,3,4].includes(p?.seat)&&typeof p.alive==='boolean'&&typeof p.triggerDown==='boolean'&&typeof p.chargeDetonate==='boolean'&&CHARACTERS.includes(p.character)&&validPlayerPose(p)&&validCreature(s,p)&&nums(p,['id','x','y','dir','hp','lives','respawn','kills','deaths','killedBy','lastAttack','lastAlt','cooldown','invul','ammo','fireAt','hitAt','deadAt','triggerAt'])&&typeof p.selectionPending==='boolean'&&(p.selectionWeapon===null||Number.isInteger(p.selectionWeapon)&&p.selectionWeapon>=0&&p.selectionWeapon<10)&&[-1,1].includes(p.selectionStep)&&Number.isInteger(p.weapon)&&p.weapon>=0&&p.weapon<10&&Array.isArray(p.inventory)&&p.inventory.length===10&&p.inventory.every((v:any)=>Number.isSafeInteger(v)&&v>=-1)&&p.ammo===p.inventory[p.weapon]&&Array.isArray(p.unlocked)&&p.unlocked.length===10&&p.unlocked.every((v:any)=>typeof v==='boolean')&&validWeaponInventory(s,p))&&
    ['zombies','bullets','barrels','pickups','effects','corpses'].every(k=>Array.isArray(s[k])&&s[k].length<1500&&s[k].every((e:any)=>nums(e,['x','y'])))&&
    validProgression(s)&&validNavigation(s)&&validExplosions(s)&&s.zombies.every((z:any)=>nums(z,['id','hp','dir','attack','owner','hitAt','attackAt'])&&typeof z.devil==='boolean'&&validEnemyAI(s,z)&&validCreature(s,z))&&s.bullets.every((b:any)=>validGrenade(b)&&validShot(b)&&validFireball(b)&&nums(b,['id','vx','vy','damage','weapon','owner','life'])&&
      (b.weapon!==4&&b.weapon!==7||nums(b,['z','vz'])&&b.z>=0&&[0,1,2].includes(b.bang)&&typeof b.cluster==='boolean'&&(b.clusterShell===undefined||typeof b.clusterShell==='boolean'))&&
      (Number.isSafeInteger(b.born)&&b.born>=0&&b.born<=s.tick))&&
    s.barrels.every((b:any)=>nums(b,['id','hp','owner','armed','z'])&&b.z>=0&&['barrel','wall','mine','chargepack'].includes(b.kind)&&typeof b.exploded==='boolean'&&validRegistration(b,s.tick)&&validExplosiveObject(b)&&validWall(b,s.tick)&&(b.damage===undefined||Number.isFinite(b.damage)&&b.damage>0))&&s.pickups.every((p:any)=>nums(p,['id','life'])&&Number.isSafeInteger(p.born)&&p.born>=0&&p.born<=s.tick&&(p.permanent===undefined||typeof p.permanent==='boolean')&&(p.permanent!==false||Number.isSafeInteger(p.deleteCounter)&&p.deleteCounter>=0&&typeof p.initialized==='boolean'&&Number.isFinite(p.alpha)&&p.alpha>=0&&p.alpha<=1&&p.life===p.deleteCounter+(p.initialized?1:2))&&(!p.permanent||p.life>=0&&(p.life>0?p.reappearAt===null:Number.isSafeInteger(p.reappearAt)&&p.reappearAt>s.tick)))&&s.effects.every((e:any)=>nums(e,['life','total'])&&typeof e.kind==='string'&&Number.isSafeInteger(e.born)&&e.born>=0&&e.born<=s.tick+(e.kind==='Effect.SmokeCloud'?1:0)&&
      (e.floor===undefined||e.floor===true&&e.kind==='Effect.BloodSplat'&&[0,1,5].includes(e.bloodCount))&&
      (e.kind!=='Effect.RocketSmoke'||nums(e,['z','vx','vy'])&&e.z>=0&&e.total===7&&e.life===7-(s.tick-e.born))&&
      (e.kind!=='Effect.BulletHit'||Number.isFinite(e.z)&&e.z>=0&&e.total===14&&e.life===14-(s.tick-e.born))&&
      (e.kind!=='Effect.MuzzleFlash'||Number.isSafeInteger(e.born)&&e.born>=0&&e.born<=s.tick&&nums(e,['z','angle'])&&e.z>=0&&['Pistol.MuzzleFlash','UZI.MuzzleFlash','Shotgun.MuzzleFlash','Railgun.MuzzleFlash'].includes(e.spriteKey)&&e.total===2&&e.life===2-(s.tick-e.born))&&
      (e.kind!=='Effect.Explosion'||Number.isSafeInteger(e.born)&&e.born>=0&&e.born<=s.tick&&Number.isFinite(e.z)&&e.z>=0&&e.scale===1)&&
      (e.kind!=='Effect.SmokeCloud'||Number.isSafeInteger(e.born)&&e.born>=0&&e.born<=s.tick+1&&e.scale===1&&e.total===data.objects['Effect.SmokeCloud'].frames+1&&e.life===e.total-(s.tick-e.born+1)))&&s.corpses.every((e:any)=>nums(e,['dir','deadAt'])&&['zombie','devil'].includes(e.character))&&
    Array.isArray(s.sounds)&&s.sounds.length<=40&&s.sounds.every((e:any)=>nums(e,['id','tick'])&&Object.prototype.hasOwnProperty.call(data.audio,e.name))&&
    nums(s,['rng','wave','spawnLeft','devilLeft','nextId','score','combo','peakCombo','soundId','messageUntil','shakeY','brightness'])&&Math.abs(s.shakeY)<=32&&s.brightness>=0&&s.brightness<=1&&typeof s.message==='string';
}
