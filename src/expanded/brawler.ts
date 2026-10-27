import type {Adapter,Input,State} from './types';
import {EMPTY_INPUT,validInput} from './types';
import data from './brawler-data.json';
import * as native from './brawler-native';
import * as combat from './brawler-combat';
import {move,jump,animate,advance,movement,type Fighter} from './brawler-movement';
import {overlap,collision,platformBounds,type Platform} from './brawler-world';
import * as fx from './brawler-effects';
import * as audio from './brawler-audio';
import {MODES,rules,validRules,newGarbageFrame,standings,type Rules,type Settings} from './brawler-options';
type Shot=fx.Sprite&{id:number;owner:number;vx:number;vy:number;life:number;dead:boolean;born:number;visualUntil:number};
type Item=fx.Sprite&{id:number;owner:number|null;vx:number;vy:number;state:number;active:number;artAge:number;influenced:number[];dead:boolean};
type Explosion={x:number;y:number;size:number;owner:number|null;age:number;influenced:number[];born:number;parts:fx.Sprite[]};
interface BrawlerState extends State {gameId:string;mapId:string;players:Fighter[];platforms:Platform[];items:Item[];shots:Shot[];explosions:Explosion[];seed:number;nextItem:number;animationClock:number;nextSpawn:number;soundSeq:number;sounds:audio.SoundEvent[];mode:'stock'|'time';paused:boolean;actionAck:number[];remaining:number;numDead:number;ranks:number[];options:Rules&{characters:number[]}}
const HZ=40,stages=data.stages;
const stageOf=(s:BrawlerState)=>stages.find(m=>m.id===s.mapId)!;
const random=(s:BrawlerState)=>{s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;};
function create(round:number,playing:boolean,seats:number[],seed:number,mapId?:string,mode?:string,settings?:Settings&{characters?:number[]}):BrawlerState {
 const matchRules=rules(settings),matchMode=mode==='time'?'time':'stock';
 const stage=stages.find(m=>m.id===mapId)||stages[0],characters=settings?.characters?[...settings.characters]:[1,2,3,4];
 const players=[...new Set(seats)].filter(n=>Number.isInteger(n)&&n>=1&&n<=4).sort((a,b)=>a-b).map((seat,i):Fighter=>{
  const pt=stage.spawns[i];return {...combat.fighter(seat,characters[seat-1]-1),x:pt.x,y:pt.y,alive:true,stocks:matchMode==='stock'?matchRules.stocks:-1,deaths:0,kos:0,nativeKos:0,suicides:0,deathOrder:null,killedBy:null,respawn:0,hitX:pt.x,hitY:pt.y,hitAnimation:native.animation(),moveQueue:'',goThrough:false,lastAttack:0,lastAlt:0,lastJump:0,leftHeld:false,rightHeld:false,downHeld:false,upHeld:false,shieldHeld:false,upTicks:0,upCombo:false,spawnType:1,spawnFrame:1,spawnAge:0,spawnX:pt.x,spawnY:pt.y,blinker:0};
 });
 return {gameId:'6232-server',round,tick:0,phase:playing&&players.length>=2?'playing':'waiting',winner:null,ack:[0,0,0,0],inputs:Array.from({length:4},()=>({...EMPTY_INPUT})),mapId:stage.id,players,platforms:stage.platforms.map(q=>({...q})),items:[],shots:[],explosions:[],seed:seed>>>0,nextItem:0,animationClock:0,nextSpawn:matchRules.itemFrequency?Math.floor(10000/matchRules.itemFrequency):0,soundSeq:0,sounds:[],mode:matchMode,paused:false,actionAck:[0,0,0,0],remaining:matchRules.seconds,numDead:0,ranks:[],options:{characters,...matchRules}};
}
function sprite(name:string,x:number,y:number,sx=1,sy=sx):fx.Sprite{return {name,x,y,sx,sy,rotation:0,age:0,variant:1};}
function explosion(s:BrawlerState,x:number,y:number,size:number,owner:number|null):void {
 const parts:fx.Sprite[]=[];const scaled=(name:string,x:number,y:number,w:number,h=w)=>{const b=fx.initialSize(name);parts.push(sprite(name,x,y,w/b[0],h/b[1]));};
 for(let n=0;n<size;n++)scaled('BoomMatter',x+Math.floor(random(s)*size*10)-size*5,y+Math.floor(random(s)*size*10)-size*5,size);
 scaled('BoomWave',x,y,size*2);scaled('BoomStar',x,y,size*50);
 s.explosions.push({x,y,size,owner,age:0,influenced:[],born:s.tick,parts});
}
function hooks(s:BrawlerState):combat.Hooks {return {
 lookup:seat=>s.players.find(p=>p.seat===seat),random:()=>random(s),interrupted:p=>{if(p.throwVictim!==null||s.players.some(q=>q.throwVictim===p.seat)){releaseGrab(s,p as Fighter);p.hasControl=true;}},sound:(action,name)=>{const list=audio.sounds[name];if(!list)return;s.sounds.push({id:++s.soundSeq,tick:s.tick,action,name,variant:action==='play'?Math.floor(random(s)*list.length):0});},
 launch(p,launch){const v=launch.properties,name=launch.name,sign=p.facing,speed=name==='EnergyBall'?5:name==='Poop'||name==='Pencil'?7:name==='Garbage'?8:name==='Bullet'?20:0;
  s.shots.push({...sprite(name,native.twip(v._x),native.twip(v._y),v._xscale/100,v._yscale/100),id:s.nextItem++,owner:p.seat,vx:v.xInc??speed*sign,vy:v.yInc??(name==='Garbage'?-2:0),life:name==='Garbage'?500:name==='EnergyBall'?2000:name==='Pencil'?2500:3000,rotation:v._rotation??0,variant:name==='Garbage'?newGarbageFrame(launch.extra??0,()=>random(s)):1,dead:false,born:s.tick,visualUntil:0});
 }
};}
function releaseGrab(s:BrawlerState,p:Fighter):void {
 // Online death/disconnect must not leave another human without controls.
 for(const q of s.players)if(q.throwVictim===p.seat||p.throwVictim===q.seat){q.hasControl=true;q.throwVictim=null;if(q.attack==='specialBackThrow'){q.attack='';q.attackDone=true;}}
 p.throwVictim=null;
}
function loseStock(s:BrawlerState,p:Fighter):void {
 const sender=s.players.find(q=>q.seat===p.lastSender);if(sender){sender.nativeKos++;if(sender!==p)sender.kos++;}else p.suicides++;releaseGrab(s,p);
 if(s.mode==='stock')p.stocks--;p.deaths++;p.alive=s.mode==='time'||p.stocks>0;if(!p.alive)p.deathOrder=s.numDead++;p.damage=0;p.x=Math.floor(random(s)*400)+100;p.y=0;p.vx=p.vy=p.controlLoss=p.paralyzed=0;p.state='stop';p.hasControl=p.alive;p.dying=false;p.facing=1;p.jumps=0;p.attack='';p.attackDone=true;p.rotation=0;p.hitX=p.x;p.hitY=p.y;p.moveQueue='';p.goThrough=false;p.animation=native.animation();p.hitAnimation=native.animation();
 if(p.alive){p.spawnType=Math.floor(random(s)*2)+1;p.spawnFrame=1;p.spawnAge=0;p.spawnX=p.x;p.spawnY=p.y;p.state='spawn';p.hasControl=false;p.grounded=true;p.spawnProtection=3000;p.invincible=true;p.spawning=true;p.respawn=Math.ceil((10*p.spawnType-1)*4/3);}
}
function spawn(p:Fighter):void {
 if(p.spawnProtection>0)p.spawnProtection-=25;
 if(p.state==='spawn'){
  const film=fx.frame({...sprite('Spawn'+p.spawnType,p.spawnX,p.spawnY),age:(p.spawnFrame-1)*1000/30});p.x=native.twip(p.spawnX+film.native.position[0]);p.y=native.twip(p.spawnY+film.native.position[1]);
  if(p.spawnProtection<=0)move(p,'stop');native.selectAnimation(p,'still');p.respawn=Math.max(0,Math.ceil((10*p.spawnType-p.spawnFrame)*4/3));
  if(p.spawnFrame>=10*p.spawnType)p.hasControl=true;
 }
 if(p.state!=='spawn'&&p.spawning){p.respawn=0;if(p.spawnProtection<=0){p.spawning=false;p.invincible=false;}}
}
const itemSprite=(item:Item):fx.Sprite=>({...item,age:item.artAge});
function useItem(s:BrawlerState,p:Fighter):void {
 if(!p.attack.startsWith('punch'))return;const it=s.items.find(q=>q.state===3&&q.owner===p.seat);if(!it)return;
 const g=native.geometry(p),hand=g.marks.hand;if(!hand)return;
 const tx=Number(g.transform[0]),ty=Number(g.transform[1]);it.x=native.twip(Number(hand[0])*p.facing+tx*p.facing+p.x+tx);it.y=native.twip(Number(hand[1])+p.y+ty);
 const upper=p.attack==='punchUp',power=upper?15:8;let angle=(upper?90:10)*p.facing;if(angle<0)angle=180+angle;angle*=Math.PI/180;if(upper)it.x=p.x;
 it.vx=Math.cos(angle)*power+p.vx;it.vy=-Math.sin(angle)*power+p.vy;it.state=2;it.artAge=0;it.variant=it.name==='Mine'?8:10;
}
function controls(s:BrawlerState,p:Fighter,i:Input):void {
 const punch=i.attack>p.lastAttack&&(i.cancelledAttack??-1)<i.attack,special=i.alt>p.lastAlt&&(i.cancelledAlt??-1)<i.alt;
 p.lastAttack=Math.max(p.lastAttack,i.attack);p.lastAlt=Math.max(p.lastAlt,i.alt);
 const released=i.jump===undefined&&i.up===false&&p.upHeld,edgeJump=(i.jump??0)>p.lastJump&&(i.cancelledJump??-1)<(i.jump??0);p.lastJump=Math.max(p.lastJump,i.jump??0);
 if(!p.alive)return;
 if(i.shield&&!p.shieldHeld&&p.vx===0)p.shielded=true;if(!i.shield&&p.shieldHeld)p.shielded=false;p.shieldHeld=!!i.shield;
 if(i.left&&!p.leftHeld)move(p,'left');if(i.right&&!p.rightHeld)move(p,'right');
 if(!i.left&&p.leftHeld&&!i.right||!i.right&&p.rightHeld&&!i.left)move(p,'stop');
 if(i.down)move(p,'down');else if(p.downHeld)move(p,'stop');
 if(i.up){if(!p.upHeld){p.upTicks=0;p.upCombo=true;}p.upTicks++;if(p.upTicks>2){p.upCombo=false;jump(p);}}
 else if(p.upHeld){p.upTicks=0;}
 if(punch||special){const type=special?'special':'punch';let started=false;if(p.upCombo||(special?i.upperAlt===i.alt:i.upperAttack===i.attack)){started=combat.attack(p,type,'up');p.upCombo=false;}if(!started)started=combat.attack(p,type,'none');if(started)useItem(s,p);}
 if(released||edgeJump)jump(p);if(!i.up)p.upCombo=false;
 p.leftHeld=i.left;p.rightHeld=i.right;p.downHeld=i.down;p.upHeld=i.up;
}
function shots(s:BrawlerState,h:combat.Hooks):void {
 const stage=stageOf(s);
 for(const q of s.shots){
  if(q.dead||q.born===s.tick)continue;
  q.x=native.twip(q.x+q.vx);if(q.name==='EnergyBall')q.y=native.twip(q.y+Math.sin(q.x*Math.PI/180*10)*2);
  if(q.name==='Pencil')q.rotation+=15;
  if(q.name==='Garbage'||q.name==='Rocket'){q.vy+=.5;q.y=native.twip(q.y+q.vy);q.rotation=q.name==='Garbage'?q.rotation+20:Math.atan2(q.vy,q.vx)*180/Math.PI+90;}
  q.age+=25;const b=fx.bounds(q),wall=s.platforms.some(p=>!p.moving&&overlap(b,platformBounds(p))),out=q.x<stage.bounds[0]||q.x>stage.bounds[2]||q.y<stage.bounds[1]||q.y>stage.bounds[3];
  if(q.age>q.life||wall||out){if(q.name==='EnergyBall'&&q.age<=q.life){q.vx*=-1;q.x=native.twip(q.x+(q.vx>0?15:-15));}else if(q.name!=='Rocket'||q.age>q.life)q.dead=true;}
  for(const p of s.players){if(!p.alive||p.seat===q.owner||p.invincible||p.state==='ko'||!overlap(b,native.bounds(p)))continue;const owner=h.lookup(q.owner),direction=q.vx<=0?-1:1;
   if(q.name==='Rocket')explosion(s,q.x,q.y,5,q.owner);
   else {const amount=q.name==='EnergyBall'?7:q.name==='Poop'?15:q.name==='Pencil'?20:q.name==='Garbage'?6:10;combat.damage(p,amount,owner,h);if(q.name==='EnergyBall'){p.electrocuted=true;p.paralyzed=100;}combat.throwFighter(p,q.name==='EnergyBall'?2.5:q.name==='Pencil'?3.5:3,(q.name==='Pencil'?50:45)*direction,owner,h);}
   q.dead=true;
  }
  if(q.dead)q.visualUntil=s.tick+2;
 }
 // Retain two logic ticks of a spent projectile for 20Hz network presentation.
 s.shots=s.shots.filter(q=>!q.dead||q.visualUntil>=s.tick);
}
function items(s:BrawlerState,h:combat.Hooks):void {
 const stage=stageOf(s);
 if(s.options.itemFrequency&&s.tick*25>=s.nextSpawn){s.nextSpawn+=Math.floor(10000/s.options.itemFrequency);const kind=Math.floor(random(s)*Math.floor(2+50/s.options.itemFrequency));if(kind<2){const r=stage.itemSpawns[Math.floor(random(s)*4)];s.items.push({...sprite(kind===0?'Mine':'Grenade',native.twip(r.x+Math.floor(random(s)*Math.floor(r.w))),native.twip(r.y-2)),id:s.nextItem++,owner:null,vx:0,vy:0,state:1,active:0,artAge:0,influenced:[],variant:2,dead:false});}}
 for(const q of s.items){q.age+=25;q.artAge+=25;
  if(q.state===1&&q.age>10000){q.dead=true;continue;}
  if(q.state===2){q.x=native.twip(q.x+q.vx);q.vy=q.vy>6?6:q.vy+.6;q.y=native.twip(q.y+q.vy);const b=fx.bounds(itemSprite(q)),c=b?collision(b,s.platforms,true,true):null;
   if(c?.hit){if(q.name==='Grenade'){explosion(s,q.x,q.y,4,q.owner);q.dead=true;}
    else if(c.platform){if(c.rightBC&&!c.bottom&&!c.leftBC){q.x=c.platform.x;q.rotation=-90;}else if(c.leftBC&&!c.bottom&&!c.rightBC){q.x=c.platform.x+c.platform.w;q.rotation=90;}else if(c.bottom&&q.vy>0){q.y=c.floor;q.rotation=0;}else continue;q.state=0;q.variant=9;q.artAge=0;}}
   for(const p of s.players){if(!p.alive||p.seat===q.owner||q.influenced.includes(p.seat)||!overlap(fx.bounds(itemSprite(q)),native.bounds(p)))continue;
    if(q.name==='Grenade'){explosion(s,q.x,q.y,4,q.owner);q.dead=true;}
    else {const owner=q.owner===null?undefined:h.lookup(q.owner);combat.throwFighter(p,2,45,owner,h);combat.damage(p,20,owner,h);const a=(q.vx<=0?5:175)*Math.PI/180,power=Math.abs(q.vx)*.6;q.x=native.twip(q.x-q.vx);q.vx=Math.cos(a)*power+(owner?.vx??0);q.vy=-Math.sin(a)*power+(owner?.vy??0);q.influenced.push(p.seat);}
   }
   if(q.name==='Grenade')q.rotation+=10;
   if(q.x<stage.bounds[0]||q.x>stage.bounds[2]||q.y<stage.bounds[1]||q.y>stage.bounds[3])q.dead=true;
  }else if(q.state===0){q.active+=25;if(q.active>=1000&&s.players.some(p=>p.alive&&overlap(fx.bounds(itemSprite(q)),native.bounds(p)))){explosion(s,q.x,q.y,3,q.owner);q.dead=true;}}
 }
 s.items=s.items.filter(q=>!q.dead);
}
function finish(s:BrawlerState):void {s.ranks=standings(s.mode,s.players,s.numDead).map(p=>p.seat);s.winner=s.ranks[0]??null;s.phase='finished';}
function step(state:State,inputs:Input[]):void {
 const s=state as BrawlerState;if(s.phase!=='playing'||s.paused)return;s.tick++;s.sounds=s.sounds.filter(e=>s.tick-e.tick<=16);const h=hooks(s),stage=stageOf(s);s.animationClock+=3;
 if(s.animationClock>=4){s.animationClock-=4;for(const p of s.players)advance(p);}
 for(const p of s.players){const i=inputs[p.seat-1]||EMPTY_INPUT;s.inputs[p.seat-1]={...i};s.ack[p.seat-1]=Math.max(s.ack[p.seat-1],i.seq);controls(s,p,i);if(!p.alive)continue;
  p.spawnAge+=25;const active=movement(p,s.platforms,h);if(!active)continue;
  if(p.x<stage.bounds[0]||p.x>stage.bounds[2]||p.y<stage.bounds[1]||p.y>stage.bounds[3])loseStock(s,p);
  if(!p.alive)continue;
  if(p.attack||p.state==='thrown'){
   if(p.attack.startsWith('special'))combat.secondary(p,h);
   for(const other of s.players)if(other!==p&&other.alive&&overlap(native.bounds(p),native.bounds(other)))combat.contact(p,other,h);
   if(['punchGround','punchUp'].includes(p.attack)&&!s.items.some(q=>q.owner===p.seat&&q.state===3))for(const item of s.items)if(item.state===1&&overlap(native.bounds(p),fx.bounds(itemSprite(item)))){item.state=3;item.owner=p.seat;break;}
  }
  animate(p);spawn(p);p.hitX=p.x;p.hitY=p.y;
 }
 shots(s,h);items(s,h);
 for(const e of s.explosions){if(e.born===s.tick)continue;e.age+=25;for(const part of e.parts)part.age=e.age;
  if(e.age*30/1000<fx.frames('BoomMatter')-1)for(const p of s.players)if(p.alive&&!e.influenced.includes(p.seat)&&(p.x-e.x)**2+(p.y-e.y)**2<=(e.size*10)**2+400){const owner=e.owner===null?undefined:h.lookup(e.owner);combat.damage(p,e.size*5,owner,h,true);combat.throwFighter(p,e.size*2,45*(p.x<=e.x?-1:1),owner,h,true);e.influenced.push(p.seat);}
 }
 s.explosions=s.explosions.filter(e=>e.age*30/1000<fx.frames('BoomWave')-1);
 if(s.mode==='time'&&s.options.seconds>0){s.remaining=Math.max(0,s.options.seconds-Math.floor(s.tick/HZ));if(s.remaining===0){finish(s);}return;}
 const alive=s.players.filter(p=>p.alive);if(s.mode==='stock'&&alive.length<=1){finish(s);}
}
function valid(value:unknown):value is BrawlerState {
 if(!value||typeof value!=='object')return false;const s=value as BrawlerState;
 if(!Number.isSafeInteger(s.numDead)||s.numDead<0||!Array.isArray(s.ranks)||s.ranks.length>4||new Set(s.ranks).size!==s.ranks.length)return false;
 if(!validRules(s.options)||!['stock','time'].includes(s.mode)||typeof s.paused!=='boolean'||!Array.isArray(s.actionAck)||s.actionAck.length!==4||!s.actionAck.every(n=>Number.isSafeInteger(n)&&n>=0)||!Number.isSafeInteger(s.remaining)||s.remaining<0||s.remaining>s.options.seconds)return false;
 if(s.gameId!=='6232-server'||!stages.some(m=>m.id===s.mapId)||!['waiting','playing','finished'].includes(s.phase)||!Number.isSafeInteger(s.soundSeq)||s.soundSeq<0||!Array.isArray(s.sounds)||s.sounds.length>512||!s.sounds.every(e=>e&&Number.isSafeInteger(e.id)&&Number.isSafeInteger(e.tick)&&['play','stop'].includes(e.action)&&Object.prototype.hasOwnProperty.call(audio.sounds,e.name)&&Number.isInteger(e.variant)&&e.variant>=0&&e.variant<audio.sounds[e.name].length)||![s.round,s.tick,s.nextItem,s.animationClock].every(n=>Number.isSafeInteger(n)&&n>=0)||!Array.isArray(s.players)||s.players.length>4||!Array.isArray(s.ack)||s.ack.length!==4||!Array.isArray(s.platforms)||s.platforms.length>30||!Array.isArray(s.items)||s.items.length>512||!Array.isArray(s.shots)||s.shots.length>512||!Array.isArray(s.explosions)||s.explosions.length>128)return false;
 const numeric=(o:object,keys:string[])=>keys.every(k=>Number.isFinite((o as Record<string,unknown>)[k]));
 if(s.ranks.some(seat=>!s.players.some(p=>p?.seat===seat))||s.numDead!==s.players.filter(p=>p?.alive===false).length||s.mode==='time'&&s.numDead!==0||s.paused&&s.phase!=='playing')return false;
 if(s.phase==='finished'?(s.ranks.length!==s.players.length||s.winner!==s.ranks[0]):s.ranks.length!==0||s.winner!==null)return false;
 if(s.mode==='time'&&s.options.seconds>0&&s.remaining!==Math.max(0,s.options.seconds-Math.floor(s.tick/HZ)))return false;
 return !!s.options&&Array.isArray(s.options.characters)&&s.options.characters.length===4&&s.options.characters.every(n=>Number.isInteger(n)&&n>=1&&n<=data.fighters.length)&&Array.isArray(s.inputs)&&s.inputs.length===4&&s.inputs.every(validInput)&&s.players.every(p=>p&&Number.isInteger(p.seat)&&p.seat>=1&&p.seat<=4&&p.character===s.options.characters[p.seat-1]-1&&native.COLORS.includes(p.color)&&typeof p.alive==='boolean'&&numeric(p,['x','y','vx','vy','damage','lastAttack','lastAlt','lastJump','shield','paralyzed','controlLoss','hitX','hitY','spawnProtection'])&&Number.isSafeInteger(p.stocks)&&(s.mode==='time'?p.stocks===-1:p.stocks>=0&&p.stocks<=s.options.stocks)&&Number.isSafeInteger(p.nativeKos)&&p.nativeKos>=0&&Number.isSafeInteger(p.suicides)&&p.suicides>=0&&(p.deathOrder===null||Number.isSafeInteger(p.deathOrder)&&p.deathOrder>=0&&p.deathOrder<s.numDead)&&Number.isSafeInteger(p.deaths)&&p.deaths>=0&&native.validAnimation(p.character,p.animation)&&native.validAnimation(p.character,p.hitAnimation)&&['stop','goright','goleft','crouch','thrown','ko','spawn','electrocuted'].includes(p.state)&&['alive','hasControl','invincible','dying','shielded','spawning','grounded','attackDone','specialUp','emitted'].every(k=>typeof (p as unknown as Record<string,unknown>)[k]==='boolean'))&&new Set(s.players.map(p=>p.seat)).size===s.players.length&&s.platforms.every(p=>p&&numeric(p,['x','y','w','h','floor']))&&s.items.every(q=>fx.valid(q)&&['Mine','Grenade'].includes(q.name)&&[0,1,2,3].includes(q.state)&&numeric(q,['vx','vy','active','artAge'])&&q.artAge>=0&&Array.isArray(q.influenced))&&s.shots.every(q=>fx.valid(q)&&['EnergyBall','Poop','Pencil','Garbage','Bullet','Rocket'].includes(q.name)&&numeric(q,['vx','vy','life']))&&s.explosions.every(e=>e&&numeric(e,['x','y','size','age'])&&Array.isArray(e.parts)&&e.parts.length<=20&&e.parts.every(fx.valid)&&Array.isArray(e.influenced))&&s.ack.every(n=>Number.isSafeInteger(n)&&n>=0);
}
const images:Record<string,HTMLImageElement>={};
function image(path:string):HTMLImageElement {if(!images[path]){images[path]=new Image();images[path].fetchPriority='high';images[path].src=path;}return images[path];}
function assetsReady(state:State):boolean {
 const s=state as BrawlerState;let ready=true;
 for(let seat=1;seat<=4;seat++){const im=image(native.imagePath(s.options.characters[seat-1]-1,native.COLORS[seat-1]));if(!fx.imageReady(im))ready=false;}
 for(const name of [s.mapId,s.mapId+'_Background']){const im=image('/expanded/assets/brawler/'+name+'.png');if(!fx.imageReady(im))ready=false;}
 return fx.preload()&&ready;
}
function render(canvas:HTMLCanvasElement,state:State|null,seat:number|null):void {
 const ctx=canvas.getContext('2d');if(!ctx)return;const s=(state||create(0,false,[1,2,3,4],1)) as BrawlerState,stage=stageOf(s),b=stage.bounds,w=b[2]-b[0],h=b[3]-b[1],scale=Math.min(canvas.width/w,(canvas.height-75)/h);
 const loaded=assetsReady(s);
 ctx.fillStyle=stage.id==='Space'?'#09051c':'#142030';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate((canvas.width-w*scale)/2-b[0]*scale,45-b[1]*scale);ctx.scale(scale,scale);
 for(const [name,rect]of [[stage.id+'_Background',stage.backgroundBounds],[stage.id,stage.artBounds]] as [string,number[]][]){const im=image('/expanded/assets/brawler/'+name+'.png');if(fx.imageReady(im))ctx.drawImage(im,rect[0],rect[1],rect[2]-rect[0],rect[3]-rect[1]);}
 for(const it of s.items)if(it.state!==3&&!(it.state===1&&it.age>7000&&it.age%2===0))fx.draw(ctx,itemSprite(it));
 for(const q of s.shots)fx.draw(ctx,q);
 const colors=['#76e6ff','#ff7b8c','#a6f27b','#dac0ff'];
 for(const p of s.players){if(!p.alive)continue;
  if(p.state==='spawn'&&p.spawnFrame<10*p.spawnType){fx.draw(ctx,{...sprite('Spawn'+p.spawnType,p.x,p.y),age:Math.max(0,(p.spawnFrame-1)*1000/30)});continue;}
  const art=native.nativeFrame(p),im=image(native.imagePath(p.character,p.color));ctx.save();ctx.translate(p.x,p.y);ctx.scale(p.facing,1);ctx.rotate(p.rotation*Math.PI/180);ctx.globalAlpha=p.spawning&&Math.cos(p.blinker)<0?.55:1;
  if(fx.imageReady(im)&&art[2]&&art[3])ctx.drawImage(im,art[0],art[1],art[2],art[3],art[4],art[5],art[2],art[3]);ctx.restore();
  const held=s.items.find(it=>it.owner===p.seat&&it.state===3);if(held)fx.draw(ctx,{...held,x:p.x+10*p.facing,y:p.y-10,age:0,variant:2});
  if(p.shielded&&p.vx===0)fx.draw(ctx,{...sprite('Shield',p.x,p.y-14,p.shield/100),variant:p.seat});
  ctx.fillStyle=colors[p.seat-1];ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText(p.seat===seat?'你':`P${p.seat}`,p.x,p.y-40);
 }
 for(const e of s.explosions)for(const part of e.parts)fx.draw(ctx,part);ctx.restore();
 ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(0,0,canvas.width,44);ctx.font='bold 16px sans-serif';ctx.textAlign='left';ctx.fillStyle='#ecdfb9';ctx.fillText(`疯狂小人战斗 · ${stage.label}   ${s.mode==='stock'?`击飞出界 / ${s.options.stocks} 条生命`:s.options.seconds===0?'计时制 / 不限时':`计时制 / ${Math.floor(s.remaining/60)}:${String(s.remaining%60).padStart(2,'0')}`}`,18,28);
 for(const p of s.players){ctx.fillStyle=colors[p.seat-1];ctx.font='bold 17px sans-serif';ctx.fillText(`P${p.seat}  ${p.damage}%  ${s.mode==='time'?`分:${p.nativeKos-p.deaths}`:p.stocks<6?'●'.repeat(p.stocks):`×${p.stocks}`}  KO:${p.nativeKos}`,(p.seat-1)*canvas.width/4+12,canvas.height-15);}
 if(!loaded){ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillRect(200,canvas.height/2-25,canvas.width-400,50);ctx.fillStyle='#ffe2a1';ctx.font='20px sans-serif';ctx.textAlign='center';ctx.fillText('正在加载人物与场景素材…',canvas.width/2,canvas.height/2+7);}
 if(s.paused){ctx.fillStyle='rgba(0,0,0,.75)';ctx.fillRect(250,canvas.height/2-30,canvas.width-500,60);ctx.fillStyle='#ffe2a1';ctx.font='bold 25px sans-serif';ctx.textAlign='center';ctx.fillText('已暂停 · P 继续',canvas.width/2,canvas.height/2+8);}
 if(s.phase==='finished'){ctx.fillStyle='rgba(0,0,0,.85)';ctx.fillRect(150,canvas.height/2-85,canvas.width-300,200);ctx.fillStyle='#ffe2a1';ctx.font='bold 28px sans-serif';ctx.textAlign='center';ctx.fillText(s.winner===null?'平局':`P${s.winner} 获胜！`,canvas.width/2,canvas.height/2-43);ctx.font='17px sans-serif';s.ranks.forEach((seat,index)=>{const p=s.players.find(p=>p.seat===seat)!;ctx.fillText(`${index+1}. P${seat}  KO:${p.nativeKos}  ${s.mode==='time'?`死亡:${p.deaths}  得分:${p.nativeKos-p.deaths}`:`自杀:${p.suicides}`}`,canvas.width/2,canvas.height/2-8+index*28);});}
}
export const adapter:Adapter={id:'6232-server',title:'疯狂小人战斗',seats:4,hz:HZ,width:1000,height:650,controls:'A/D 或 ←/→ 移动，W/↑ 二段跳，J/空格 攻击/拾取，再次攻击投掷；K/X 特技，快速 W/↑+J/K 上击/上特技，Shift 防御，S/↓ 蹲下/穿过薄平台。',characters:['圆球','咖啡杯','茄子','草莓','垃圾桶','桃子'],characterIds:data.fighters.map((_,i)=>i),duplicateCharacters:true,modes:MODES,maps:stages.map(m=>({id:m.id,label:m.label})),create,step,valid,render,assetsReady,setSound:audio.setSound,setVolume:audio.setVolume,confirm(state){audio.confirm(state as BrawlerState);},consumeInput(state,seat,i){const p=(state as BrawlerState).players.find(q=>q.seat===seat);if(p){p.lastAttack=Math.max(p.lastAttack,i.attack);p.lastAlt=Math.max(p.lastAlt,i.alt);p.lastJump=Math.max(p.lastJump,i.jump??0);p.upHeld=false;p.upCombo=false;p.upTicks=0;p.leftHeld=false;p.rightHeld=false;p.downHeld=false;p.shieldHeld=false;p.shielded=false;move(p,'stop');}}};
