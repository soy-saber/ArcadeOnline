import data from './boxhead-data.json';
import { EMPTY_INPUT, validInput, type Input, type State } from './types';
import { MAPS, WEAPONS, CHARACTERS, CELL, room, solid, blocked, move, openPosition, lineClear, weaponStats } from './boxhead-world';

export const ID = '50737-server';
export function random(s: State): number { s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296; }
function sound(s: State, name: string): void { s.sounds.push({id:++s.soundId,tick:s.tick,name}); }
function effect(s: State, kind: string, x: number, y: number, life = 12, extra = {}): void {
  s.effects.push({id:++s.nextId,kind,x,y,life,total:life,...extra});
}
function accept(s: State,p: any,candidate: unknown): Input {
  const at=p.seat-1,current=s.inputs[at] as Input;let next:Input;
  if(!validInput(candidate)) next={...current,left:false,right:false,up:false,down:false,trigger:false};
  else if(candidate.seq<current.seq) next=current;
  else if(candidate.seq===current.seq) next={...current,left:current.left&&candidate.left,right:current.right&&candidate.right,up:current.up&&candidate.up,down:current.down&&candidate.down,trigger:current.trigger===true&&candidate.trigger===true};
  else next={...candidate,attack:Math.max(candidate.attack,current.attack,p.lastAttack),alt:Math.max(candidate.alt,current.alt,p.lastAlt)};
  s.inputs[at]={...next};return next;
}
export function create(round: number, playing: boolean, seats: number[], seed: number, mapId?: string): State {
  const map=MAPS.find(m=>m.id===mapId)||MAPS[0];
  const s: State={gameId:ID,round,tick:0,phase:playing?'playing':'waiting',winner:null,ack:[0,0,0,0],inputs:Array.from({length:4},()=>({...EMPTY_INPUT})),rng:seed>>>0,mapId:map.id,
    players:[],zombies:[],bullets:[],barrels:[],pickups:[],effects:[],corpses:[],sounds:[],soundId:0,wave:0,spawnLeft:0,devilLeft:0,nextSpawn:0,nextDevil:0,waveReady:1,nextId:0,score:0,combo:1,peakCombo:1,comboUntil:75,message:'',messageUntil:0};
  for(const b of map.barrels) s.barrels.push({id:++s.nextId,...b,kind:'barrel',hp:60,owner:0,exploded:false,armed:0});
  for(const b of map.walls) s.barrels.push({id:++s.nextId,...b,kind:'wall',hp:100,owner:0,exploded:false,armed:0});
  for(const b of map.pickups) s.pickups.push({id:++s.nextId,...b,life:250});
  const primary=map.playerSpawns[0]||{x:map.width/2,y:map.height/2,dir:0};
  const spawns=[primary,...map.otherSpawns].sort((a,b)=>Math.hypot(a.x-primary.x,a.y-primary.y)-Math.hypot(b.x-primary.x,b.y-primary.y));
  for(const seat of [...new Set(seats)].filter(n=>Number.isInteger(n)&&n>=1&&n<=4).sort()) {
    const spawn=spawns[s.players.length]||primary, pos=openPosition(s,spawn.x,spawn.y,s.players);
    s.players.push({seat,x:pos.x,y:pos.y,dir:spawn.dir,character:CHARACTERS[seat-1],hp:200,alive:true,lives:1,respawn:0,kills:0,deaths:0,killedBy:0,
      weapon:0,unlocked:[true,...Array(9).fill(false)],inventory:WEAPONS.map((w,i)=>i===0?w.ammo:0),ammo:-1,cooldown:0,invul:200,lastAttack:0,lastAlt:0,moving:false,fireAt:-99,hitAt:-99,deadAt:0,triggerDown:false,triggerAt:0});
  }
  return s;
}
function beginWave(s: State): void {
  s.wave++;s.spawnLeft=10+5*(s.wave-1);s.devilLeft=s.wave===1?0:Math.floor(1+(s.wave-2)*.25);
  s.nextSpawn=s.tick+15;s.nextDevil=s.tick+100;s.waveReady=0;
  s.message=`第 ${s.wave} 波`;s.messageUntil=s.tick+65;
  // CSound.mSamples.Click is linked to World.End.wav, not the menu's CLICK.wav.
  if(s.wave>1)sound(s,'World.End.wav');
}
function spawnEnemy(s: State, devil: boolean): void {
  const map=room(s), locations=devil?map.devilSpawns:map.zombieSpawns;
  const marker=locations[Math.floor(random(s)*locations.length)]||map.zombieSpawns[0]||{x:48,y:48};
  const pos=openPosition(s,marker.x,marker.y);
  s.zombies.push({id:++s.nextId,x:pos.x,y:pos.y,hp:devil?1000:100,devil,attack:0,dir:0,owner:0,hitAt:-99,attackAt:-99});
}
function damage(s: State,target: any,amount: number,owner: number): void {
  if(target.hp<=0)return;target.hp-=amount;target.owner=owner;target.hitAt=s.tick;
  if('devil' in target) effect(s,'Effect.BloodSplat',target.x,target.y-14,8);
}
function hurt(s: State,p: any,amount: number,owner=0): void {
  if(!p.alive||p.hp<=0||p.invul>0)return;p.hp-=amount;p.hitAt=s.tick;p.killedBy=owner>0?owner:0;
}
function explode(s: State,x: number,y: number,amount: number,owner: number,bang=0,cluster=false): void {
  const radius=(2+Math.max(amount-100,0)*.005)*32;
  effect(s,'Effect.Explosion',x,y,10,{scale:1+bang*.3});effect(s,'Effect.ScorchMark',x,y,500);sound(s,'Effect.Explosion.wav');
  const area=radius+bang*22;
  const amountAt=(target:any)=>{const fraction=Math.hypot(target.x-x,target.y-y)/area;return fraction>1?0:amount*(fraction>.75?.5:fraction>.5?.75:1);};
  for(const z of s.zombies)if(amountAt(z))damage(s,z,amountAt(z),owner);
  for(const b of s.barrels)if(b.hp>0&&amountAt(b))damage(s,b,amountAt(b),owner);
  // The original default enables bullet/explosion damage, including friendly fire and self explosions.
  for(const p of s.players)if(amountAt(p))hurt(s,p,amountAt(p),owner);
  if(cluster) for(let i=0;i<4;i++) {const dir=i*Math.PI/2+random(s)*.2;s.bullets.push({id:++s.nextId,x,y,z:20,vz:5,vx:Math.cos(dir)*9,vy:Math.sin(dir)*9,owner,weapon:4,damage:amount,life:15,bang:0,cluster:false});}
}
function shot(s: State,p: any,angle: number,amount: number,range: number,pierce: boolean): void {
  let x=p.x,y=p.y;const hits=new Set<any>(), dx=Math.cos(angle)*4,dy=Math.sin(angle)*4;
  for(let n=0;n<range*CELL/4;n++) {
    x+=dx;y+=dy;
    if(solid(room(s),x,y)){effect(s,'Effect.BulletHit',x,y-18,5);break;}
    const target=[...s.barrels.filter((b:any)=>b.kind==='barrel'||b.kind==='wall'),...s.zombies,...s.players.filter(q=>q.seat!==p.seat&&q.alive)].find(t=>t.hp>0&&!hits.has(t)&&Math.hypot(t.x-x,t.y-y)<15);
    if(target){if(target.seat)hurt(s,target,amount,p.seat);else damage(s,target,amount,p.seat);hits.add(target);if(!pierce||target.kind==='wall')break;}
  }
  s.bullets.push({id:++s.nextId,x:p.x,y:p.y,tx:x,ty:y,vx:0,vy:0,owner:p.seat,weapon:p.weapon,damage:amount,life:2});
}
function fire(s: State,p: any): void {
  const gun=weaponStats(s,p.weapon);
  if(gun.id==='chargepack') {
    const packs=s.barrels.filter((b:any)=>b.kind==='chargepack'&&b.owner===p.seat&&b.hp>0);
    if(packs.length){for(const b of packs)b.hp=0;p.cooldown=6;return;}
  }
  if(p.inventory[p.weapon]===0) {p.weapon=0;p.ammo=-1;return;}
  if(['barrel','fakewall','mine','chargepack'].includes(gun.id)) {
    const x=Math.floor((p.x+Math.cos(p.dir)*34)/CELL)*CELL+16,y=Math.floor((p.y+Math.sin(p.dir)*34)/CELL)*CELL+16;
    if(blocked(s,x,y,12)||s.players.some(q=>q.alive&&Math.hypot(q.x-x,q.y-y)<24)||s.barrels.some((b:any)=>b.hp>0&&Math.hypot(b.x-x,b.y-y)<22))return;
    s.barrels.push({id:++s.nextId,x,y,kind:gun.id==='fakewall'?'wall':gun.id,hp:gun.id==='fakewall'?100:60,owner:p.seat,exploded:false,armed:s.tick,detonateAt:0});
    sound(s,gun.id==='mine'?'Weapon.Mine.Place.wav':'Object.Barrel.Place.wav');
  } else if(gun.id==='grenade'||gun.id==='rocket') {
    const speed=gun.id==='grenade'?Math.min(.75,Math.max(.25,(s.tick-p.triggerAt)/25)) * 32:16;
    s.bullets.push({id:++s.nextId,x:p.x+Math.cos(p.dir)*20,y:p.y+Math.sin(p.dir)*20,z:gun.id==='grenade'?40:18,vz:8,vx:Math.cos(p.dir)*speed,vy:Math.sin(p.dir)*speed,owner:p.seat,weapon:p.weapon,damage:gun.damage,life:gun.id==='grenade'?60:100,bang:gun.bang,cluster:gun.cluster});
  } else {
    const count=gun.id==='shotgun'?(gun.spread?5:3):1, spacing=1.25*(gun.spread+1)*Math.PI/180;
    for(let i=0;i<count;i++)shot(s,p,p.dir+(i-(count-1)/2)*spacing+(gun.id==='uzi'?(random(s)-.5)*.06:0),gun.damage,gun.range,gun.id==='railgun');
  }
  if(p.inventory[p.weapon]>0)p.inventory[p.weapon]--;
  p.ammo=p.inventory[p.weapon];p.cooldown=gun.rate;p.fireAt=s.tick;
  if(p.ammo===0&&gun.id!=='chargepack'){p.weapon=0;p.ammo=-1;}
  if(gun.sound)sound(s,'Weapon.'+gun.sound+'.Fire.wav');
}
function upgrade(s: State): void {
  if(s.combo<=s.peakCombo)return;
  const before=s.peakCombo;s.peakCombo=s.combo;
  for(const u of data.upgrades.filter(u=>u.threshold>before&&u.threshold<=s.peakCombo)) {
    s.message=u.mName;s.messageUntil=s.tick+90;
    if(u.mClassID==='CThing_Creature_Player') {
      const index=WEAPONS.findIndex(w=>w.id===u.mValue);
      if(index>=0)for(const p of s.players) {p.unlocked[index]=true;if(p.alive){p.inventory[index]=weaponStats(s,index).ammo;p.weapon=index;p.ammo=p.inventory[index];}}
    } else if(['DoubleAmmo','QuadAmmo','InfinateAmmo'].includes(u.mProp)) {
      const index=WEAPONS.findIndex(w=>'CThing_Weapon_'+w.classId===u.mClassID);
      if(index>=0)for(const p of s.players)if(p.alive){p.inventory[index]=weaponStats(s,index).ammo;p.ammo=p.inventory[p.weapon];}
    }
  }
}
function navigation(s: State): Int32Array {
  const map=room(s), distances=new Int32Array(map.columns*map.rows).fill(-1), queue:number[]=[];
  for(const p of s.players)if(p.alive){const cell=Math.floor(p.y/CELL)*map.columns+Math.floor(p.x/CELL);if(distances[cell]===-1){distances[cell]=0;queue.push(cell);}}
  for(let at=0;at<queue.length;at++){const cell=queue[at],x=cell%map.columns,y=Math.floor(cell/map.columns);
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){const nx=x+dx,ny=y+dy,index=ny*map.columns+nx;if(map.collision[ny]?.[nx]==='0'&&distances[index]===-1){distances[index]=distances[cell]+1;queue.push(index);}}
  }
  return distances;
}
function enemies(s: State): void {
  const map=room(s), field=navigation(s);
  for(const z of s.zombies) {
    if(z.hp<=0)continue;
    const p=s.players.filter(p=>p.alive).sort((a,b)=>Math.hypot(a.x-z.x,a.y-z.y)-Math.hypot(b.x-z.x,b.y-z.y))[0];if(!p)continue;
    const distance=Math.hypot(p.x-z.x,p.y-z.y),visible=lineClear(s,z.x,z.y,p.x,p.y);
    let tx=p.x,ty=p.y;
    if(!visible){const cx=Math.floor(z.x/CELL),cy=Math.floor(z.y/CELL);let best=Infinity;
      for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){const x=cx+dx,y=cy+dy,d=field[y*map.columns+x];if(map.collision[y]?.[x]==='0'&&d>=0&&d<best){best=d;tx=x*CELL+16;ty=y*CELL+16;}}
    }
    z.dir=Math.atan2(ty-z.y,tx-z.x);if(z.attack>0)z.attack--;
    const blocker=s.barrels.find((b:any)=>b.hp>0&&['barrel','wall'].includes(b.kind)&&Math.hypot(b.x-z.x,b.y-z.y)<35);
    if(blocker&&z.attack===0){damage(s,blocker,z.devil?100:50,0);z.attack=25;z.attackAt=s.tick;}
    if(distance<34&&visible&&z.attack===0){hurt(s,p,50);z.attack=25;z.attackAt=s.tick;sound(s,'Creature.Zombie.Attack.wav');}
    else if(z.devil&&visible&&distance<160&&z.attack===0){z.dir=Math.atan2(p.y-z.y,p.x-z.x);z.attack=60;z.attackAt=s.tick;s.bullets.push({id:++s.nextId,x:z.x,y:z.y,z:18,vx:Math.cos(z.dir)*7,vy:Math.sin(z.dir)*7,owner:-1,weapon:-1,damage:50,life:40});}
    else if(distance>27&&s.tick-z.attackAt>8){const speed=(z.devil?1.28:.64)*Math.min(1+s.wave*.1,5);const length=Math.max(1,Math.hypot(tx-z.x,ty-z.y));move(s,z,(tx-z.x)/length*speed,(ty-z.y)/length*speed,10);}
  }
}
function projectiles(s: State): void {
  for(const b of s.bullets) {
    if(b.life<=0)continue;
    if(b.tx!==undefined){b.life--;continue;}
    if(b.weapon===4){
      b.vz-=1.92;b.z+=b.vz;
      if(b.z<0){b.z=0;b.vz=Math.abs(b.vz)*.5;b.vx*=.5;b.vy*=.5;}
      if(blocked(s,b.x+b.vx,b.y,3)){b.vx*=-.25;sound(s,'Shot.Grenade.Bounce.wav');}
      if(blocked(s,b.x,b.y+b.vy,3)){b.vy*=-.25;sound(s,'Shot.Grenade.Bounce.wav');}
      b.x+=b.vx;b.y+=b.vy;
    }else{
      if(b.weapon===7){b.vx*=1.1;b.vy*=1.1;if(s.tick%2===0)effect(s,'Effect.RocketSmoke',b.x,b.y-16,12,{scale:.25});}
      const steps=Math.ceil(Math.hypot(b.vx,b.vy)/5);
      for(let n=0;n<steps;n++){
        b.x+=b.vx/steps;b.y+=b.vy/steps;
        if(solid(room(s),b.x,b.y)){b.life=0;break;}
        if(b.owner<0){const p=s.players.find(p=>p.alive&&Math.hypot(p.x-b.x,p.y-b.y)<16);if(p){hurt(s,p,b.damage);b.life=0;break;}}
        else if(s.zombies.some((z:any)=>z.hp>0&&Math.hypot(z.x-b.x,z.y-b.y)<17)||s.barrels.some((z:any)=>z.hp>0&&['wall','barrel'].includes(z.kind)&&Math.hypot(z.x-b.x,z.y-b.y)<17)||s.players.some(p=>p.alive&&p.seat!==b.owner&&Math.hypot(p.x-b.x,p.y-b.y)<17)){b.life=0;break;}
      }
    }
    if(--b.life<=0&&(b.weapon===4||b.weapon===7))explode(s,b.x,b.y,b.damage,b.owner,b.bang,b.cluster);
  }
  s.bullets=s.bullets.filter((b:any)=>b.life>0);
}
export function step(s: State,inputs: Input[]): void {
  if(s.phase!=='playing')return;s.tick++;
  s.effects=s.effects.filter((e:any)=>--e.life>0);s.corpses=s.corpses.filter((e:any)=>s.tick-e.deadAt<100);
  s.sounds=s.sounds.filter((e:any)=>s.tick-e.tick<10);
  if(s.combo>1&&s.tick>s.comboUntil){s.combo--;s.comboUntil=s.tick+Math.max(3,Math.round(Math.pow(101-Math.min(s.combo,100),2.5)/100000*72+3));}
  for(const p of s.players){
    const input=accept(s,p,inputs[p.seat-1]);s.ack[p.seat-1]=Math.max(s.ack[p.seat-1],input.seq);
    const attack=input.attack>p.lastAttack,alt=input.alt>p.lastAlt;
    const wasDown=p.triggerDown;p.triggerDown=input.trigger===true;
    if(p.triggerDown&&!wasDown)p.triggerAt=s.tick;
    p.lastAttack=Math.max(p.lastAttack,input.attack);p.lastAlt=Math.max(p.lastAlt,input.alt);
    p.cooldown=Math.max(0,p.cooldown-1);p.invul=Math.max(0,p.invul-1);
    if(!p.alive){p.respawn=Math.max(0,p.respawn-1);const other=s.players.find(q=>q.alive);
      if(!p.respawn&&other){const pos=openPosition(s,other.x+32,other.y,s.players.filter(q=>q.alive));p.x=pos.x;p.y=pos.y;p.alive=true;p.hp=200;p.weapon=0;p.ammo=-1;p.invul=125;p.inventory=WEAPONS.map((_,i)=>i===0?-1:0);}continue;}
    const dx=Number(input.right)-Number(input.left),dy=Number(input.down)-Number(input.up);p.moving=!!(dx||dy);
    if(p.moving){p.dir=Math.atan2(dy,dx);move(s,p,dx*5.12,dy*5.12);}
    if(p.hp>0)p.hp=Math.min(200,p.hp+200/(25*30));
    if(alt){
      if(input.weapon!==undefined){if(p.unlocked[input.weapon]&&p.inventory[input.weapon]!==0)p.weapon=input.weapon;}
      else for(let i=1;i<=10;i++){const index=(p.weapon+i*(input.weaponStep??1)+10)%10;if(p.unlocked[index]&&p.inventory[index]!==0){p.weapon=index;break;}}
      p.ammo=p.inventory[p.weapon];
    }
    const gun=weaponStats(s,p.weapon);
    // A complete tap can happen between two network samples. The press counter
    // preserves it even when the latest held state is already released.
    const wantsFire=input.trigger===undefined?attack:gun.auto?(p.triggerDown||attack):gun.onRelease?(!p.triggerDown&&(wasDown||attack)):attack;
    if(wantsFire&&p.cooldown===0&&(input.cancelledAttack===undefined||input.cancelledAttack<input.attack))fire(s,p);
  }
  if(s.waveReady&&s.tick>=s.waveReady)beginWave(s);
  if(s.spawnLeft>0&&s.tick>=s.nextSpawn&&s.zombies.filter((z:any)=>!z.devil&&z.hp>0).length<Math.min(10+5*(s.wave-1),60)){spawnEnemy(s,false);s.spawnLeft--;s.nextSpawn=s.tick+Math.max(25-(s.wave-1),1);}
  if(s.devilLeft>0&&s.tick>=s.nextDevil&&s.zombies.filter((z:any)=>z.devil&&z.hp>0).length<Math.min(1+(s.wave-2)*.3,5)){spawnEnemy(s,true);s.devilLeft--;s.nextDevil=s.tick+Math.max(250-(s.wave-1),25);}
  projectiles(s);enemies(s);
  for(const b of s.barrels)if(b.kind==='mine'&&b.hp>0){
    if(!b.detonateAt&&s.tick>=b.armed&&s.zombies.some((z:any)=>z.hp>0&&Math.hypot(z.x-b.x,z.y-b.y)<27)){b.detonateAt=s.tick+50;sound(s,'Object.Mine.Detonate.wav');}
    if(b.detonateAt&&s.tick>=b.detonateAt)b.hp=0;
  }
  // Iterate until the whole barrel chain is settled in this authoritative tick.
  let chain=true;while(chain){chain=false;for(const b of s.barrels)if(b.hp<=0&&!b.exploded){b.exploded=true;chain=true;if(b.kind!=='wall'){const index=b.kind==='mine'?6:b.kind==='chargepack'?8:3;const gun=weaponStats(s,index);explode(s,b.x,b.y,gun.damage,b.owner,gun.bang,gun.cluster);}}}
  s.barrels=s.barrels.filter((b:any)=>b.hp>0);
  for(const z of s.zombies.filter((z:any)=>z.hp<=0)){
    const p=s.players.find(p=>p.seat===z.owner);if(p)p.kills++;
    s.score+=(z.devil?1000:100)*s.combo;s.combo++;s.comboUntil=s.tick+Math.max(3,Math.round(Math.pow(101-Math.min(s.combo,100),2.5)/100000*72+3));upgrade(s);
    s.corpses.push({x:z.x,y:z.y,dir:z.dir,character:z.devil?'devil':'zombie',deadAt:s.tick});effect(s,'Effect.BloodPool',z.x,z.y,500);
    if(random(s)<.15)s.pickups.push({id:++s.nextId,x:z.x,y:z.y,life:250});sound(s,'Creature.Zombie.Hit.wav');
  }
  s.zombies=s.zombies.filter((z:any)=>z.hp>0);
  for(const item of s.pickups){for(const p of s.players)if(item.life>0&&p.alive&&Math.hypot(p.x-item.x,p.y-item.y)<25){
    const available=p.unlocked.map((v:boolean,i:number)=>v&&p.inventory[i]>=0&&p.inventory[i]<weaponStats(s,i).ammo?i:-1).filter((i:number)=>i>=0);
    if(p.hp>=200&&!available.length)continue;
    if(p.hp<200&&(!available.length||random(s)<1-p.hp/200))p.hp=200;
    else if(available.length){const i=available[Math.floor(random(s)*available.length)];p.inventory[i]=weaponStats(s,i).ammo;p.ammo=p.inventory[p.weapon];}
    item.life=0;sound(s,'Object.Pickup.wav');}item.life--;}
  s.pickups=s.pickups.filter((i:any)=>i.life>0);
  for(const p of s.players)if(p.alive&&p.hp<=0){p.hp=0;p.alive=false;p.deaths++;p.respawn=125;p.deadAt=s.tick;p.weapon=0;p.ammo=-1;p.inventory=WEAPONS.map((_,i)=>i===0?-1:0);p.triggerDown=false;p.cooldown=0;sound(s,'Creature.Player.Scream.1.wav');}
  if(s.players.length&&!s.players.some(p=>p.alive)){s.phase='finished';s.winner=0;sound(s,'World.End.wav');}
  if(s.spawnLeft===0&&s.devilLeft===0&&s.zombies.length===0&&!s.waveReady)s.waveReady=s.tick+65;
  // Bound purely visual history; authoritative combat entities remain intact.
  s.effects=s.effects.slice(-180);s.sounds=s.sounds.slice(-40);s.corpses=s.corpses.slice(-60);
}

function nums(v:any,keys:string[]):boolean{return !!v&&keys.every(k=>Number.isFinite(v[k]));}
export function valid(value: unknown): value is State {
  if(!value||typeof value!=='object')return false;const s=value as State;
  return s.gameId===ID&&Number.isSafeInteger(s.tick)&&s.tick>=0&&Number.isSafeInteger(s.round)&&['waiting','playing','finished'].includes(s.phase)&&[null,0].includes(s.winner)&&MAPS.some(m=>m.id===s.mapId)&&
    Array.isArray(s.ack)&&s.ack.length===4&&s.ack.every(n=>Number.isSafeInteger(n)&&n>=0)&&Array.isArray(s.inputs)&&s.inputs.length===4&&s.inputs.every(validInput)&&
    Array.isArray(s.players)&&s.players.length<=4&&new Set(s.players.map(p=>p?.seat)).size===s.players.length&&s.players.every(p=>[1,2,3,4].includes(p?.seat)&&typeof p.alive==='boolean'&&typeof p.triggerDown==='boolean'&&CHARACTERS.includes(p.character)&&nums(p,['x','y','dir','hp','lives','respawn','kills','deaths','killedBy','lastAttack','lastAlt','cooldown','invul','ammo','fireAt','hitAt','deadAt','triggerAt'])&&Number.isInteger(p.weapon)&&p.weapon>=0&&p.weapon<10&&Array.isArray(p.inventory)&&p.inventory.length===10&&p.inventory.every((v:any)=>Number.isSafeInteger(v)&&v>=-1)&&p.ammo===p.inventory[p.weapon]&&Array.isArray(p.unlocked)&&p.unlocked.length===10&&p.unlocked.every((v:any)=>typeof v==='boolean'))&&
    ['zombies','bullets','barrels','pickups','effects','corpses'].every(k=>Array.isArray(s[k])&&s[k].length<1500&&s[k].every((e:any)=>nums(e,['x','y'])))&&
    s.zombies.every((z:any)=>nums(z,['id','hp','dir','attack','owner','hitAt','attackAt'])&&typeof z.devil==='boolean')&&s.bullets.every((b:any)=>nums(b,['id','vx','vy','damage','weapon','owner','life']))&&
    s.barrels.every((b:any)=>nums(b,['id','hp','owner','armed'])&&['barrel','wall','mine','chargepack'].includes(b.kind)&&typeof b.exploded==='boolean')&&s.pickups.every((p:any)=>nums(p,['id','life']))&&s.effects.every((e:any)=>nums(e,['life','total'])&&typeof e.kind==='string')&&s.corpses.every((e:any)=>nums(e,['dir','deadAt'])&&['zombie','devil'].includes(e.character))&&
    Array.isArray(s.sounds)&&s.sounds.length<=40&&s.sounds.every((e:any)=>nums(e,['id','tick'])&&Object.prototype.hasOwnProperty.call(data.audio,e.name))&&
    nums(s,['rng','wave','spawnLeft','devilLeft','nextSpawn','nextDevil','waveReady','nextId','score','combo','peakCombo','comboUntil','soundId','messageUntil'])&&typeof s.message==='string';
}
