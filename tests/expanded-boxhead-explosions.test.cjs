'use strict';
const attachEnemy=require('./helpers/boxhead-enemy.cjs');
const grenadeState=require('./helpers/boxhead-grenade.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),source=require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(name,module);m.paths=module.paths;m._compile(source,name);return m.exports;}
const a=load('../src/expanded/boxhead.ts').adapter,world=load('../src/expanded/boxhead-world.ts'),explosions=load('../src/expanded/boxhead-explosions.ts');
const protocol=load('../src/authority/protocol.ts');
const input=(seq,patch={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...patch});
function arena(){const s=a.create(1,true,[1,2],17,'original-01');s.waveReady=0;s.spawnLeft=1;s.nextSpawn=1e9;s.barrels=[];s.pickups=[];s.players.forEach((p,i)=>{p.x=144+i*400;p.y=400;p.invul=100000;});return s;}
function ticks(s,n=1,controls=[]){for(let i=0;i<n;i++)a.step(s,controls);}
function equip(s,index){const p=s.players[0];p.weapon=index;p.unlocked[index]=true;p.inventory[index]=world.weaponStats(s,index).ammo;p.ammo=p.inventory[index];return p;}
function zombie(s,x,y,hp=10000){const z=attachEnemy(s,{id:++s.nextId,x,y,hp,devil:false,attack:0,dir:0,owner:0,hitAt:-99,attackAt:-99});s.zombies.push(z);return z;}

test('BigBang/BiggerBang create two/three delayed independent same-damage blasts at one cell radius',()=>{
 for(const [bang,count] of [[1,2],[2,3]]){
  const s=arena();explosions.queueExplosion(s,320,272,150,1,bang);assert(a.valid(s));ticks(s);
  assert.equal(s.effects.filter(e=>e.kind==='Effect.Explosion').length,1);
  assert.equal(s.explosions.length,count);
  for(const e of s.explosions){assert(Math.abs(Math.hypot(e.x-320,e.y-272)-32)<1e-10);assert.equal(e.damage,150);assert.equal(e.owner,1);assert.equal(e.bang,0);assert.equal(e.cluster,false);assert(e.delay>=2&&e.delay<=5);}
  const due=s.explosions.map(e=>({id:e.id,at:e.born+e.delay+1,x:e.x,y:e.y}));
  for(let n=0;n<7;n++){ticks(s);for(const e of due)assert.equal(s.effects.some(v=>v.kind==='Effect.Explosion'&&v.x===e.x&&v.y===e.y),s.tick>=e.at);assert(a.valid(s));}
  assert.equal(s.explosions.length,0);assert.equal(s.effects.filter(e=>e.kind==='Effect.Explosion').length,count+1);
  assert(s.effects.filter(e=>e.kind==='Effect.Explosion').every(e=>e.scale===1));
 }
});

test('enhancement leaves the parent radius and 50/75 percent falloff intact; damage waits for initialization',()=>{
 const s=arena(),p=s.players[0];p.x=320;p.y=272;p.invul=0;
 const z=zombie(s,389,272); // 69px: outside the damage-100 parent's 64px radius.
 explosions.queueExplosion(s,320,272,100,1,2);assert.equal(p.hp,200);assert.equal(z.hp,10000);ticks(s);
 assert.equal(p.hp,100);assert.equal(z.hp,10000);assert.equal(s.explosions.length,3);
 const t=arena();t.players[0].invul=0;t.players[0].x=320;t.players[0].y=272;t.players[1].invul=0;t.players[1].x=368;t.players[1].y=272;
 explosions.queueExplosion(t,320,272,100,1);ticks(t);assert.equal(t.players[0].hp,100);assert.equal(t.players[1].hp,125);
});

test('cluster shells inherit height and owner, spread in four sectors, and start physics only next tick',()=>{
 const s=arena();explosions.queueExplosion(s,320,272,150,2,0,true,9);ticks(s);
 assert.equal(s.bullets.length,4);
 for(const [i,b] of s.bullets.entries()){
  assert.equal(b.clusterShell,true);assert.equal(b.x,320);assert.equal(b.y,272);assert.equal(b.z,9);assert.equal(b.vz,16);assert(b.life>=16&&b.life<=23);assert.equal(b.damage,150);assert.equal(b.owner,2);assert.equal(b.bang,0);assert.equal(b.cluster,false);
  const speed=Math.hypot(b.vx,b.vy),angle=Math.atan2(Math.sin(Math.atan2(b.vy,b.vx)-i*Math.PI/2),Math.cos(Math.atan2(b.vy,b.vx)-i*Math.PI/2));assert(speed>=1.6&&speed<3.2);assert(Math.abs(angle)<=Math.PI/8);
 }
 const b={...s.bullets[0]};ticks(s);assert.equal(s.bullets[0].life,b.life-1);assert.equal(s.bullets[0].z,9+16-1.92);assert.equal(s.bullets[0].x,320+b.vx);
 const impacts=new Set(s.sounds.filter(e=>e.name==='Effect.Explosion.wav').map(e=>e.id));
 for(let i=0;i<24;i++){ticks(s);for(const e of s.sounds)if(e.name==='Effect.Explosion.wav')impacts.add(e.id);}
 assert.equal(s.bullets.length,0);assert.equal(s.explosions.length,0);assert.equal(impacts.size,5,'one parent plus four plain impacts; no recursive clusters');
});

test('cluster distributions use full native lifetime and speed intervals across seeded rounds',()=>{
 const lives=new Set(),speeds=[];
 for(let seed=1;seed<=64;seed++){const s=arena();s.rng=seed;explosions.queueExplosion(s,320,272,150,1,0,true);ticks(s);for(const b of s.bullets){lives.add(b.life);speeds.push(Math.hypot(b.vx,b.vy));}}
 assert.deepEqual([...lives].sort((a,b)=>a-b),[16,17,18,19,20,21,22,23]);assert(Math.min(...speeds)<1.7);assert(Math.max(...speeds)>3.1);
});

test('grenade launch power scales both axes, birth does not consume fuse, ground impact moves reflected delta',()=>{
 for(const hold of [0,12,30]){
  const s=arena(),p=equip(s,4);p.dir=0;
  a.step(s,[input(1,{attack:1,trigger:true})]);ticks(s,hold,[input(1,{attack:1,trigger:true})]);a.step(s,[input(2,{attack:1,trigger:false})]);
  const b=s.bullets[0],power=Math.min(.75,Math.max(.25,(hold+1)/25));assert.equal(b.grenadePhase,'init');assert.equal(b.grenadePower,power);assert.equal(b.vx,0);assert.equal(b.vz,0);assert.equal(b.life,60);const origin={x:b.x,y:b.y};ticks(s);assert.equal(b.vx,32*power);assert.equal(b.vz,16*power-1.92);assert.equal(b.z,40+b.vz);assert.equal(b.x,origin.x+b.vx);assert.equal(b.y,origin.y);assert.equal(b.life,59);
 }
 const s=arena();s.bullets=[{...grenadeState(s),id:++s.nextId,x:320,y:272,z:1,vz:-8,vx:4,vy:2,owner:1,weapon:4,damage:100,life:2,bang:0,cluster:false}];ticks(s);
 const b=s.bullets[0];assert.equal(b.vz,4.96);assert.equal(b.z,4.96);assert.equal(b.x,322);assert.equal(b.y,273);assert.equal(b.vy,1);assert.equal(b.life,1);assert(s.sounds.some(e=>e.name==='Shot.Grenade.Bounce.wav'));
});

test('a new complete grenade tap uses minimum charge rather than an old gun press timestamp',()=>{
 const s=arena(),p=equip(s,1);a.step(s,[input(1,{attack:1,trigger:true})]);a.step(s,[input(2,{attack:1,trigger:false})]);ticks(s,30);
 equip(s,4);p.weapon=1;p.ammo=p.inventory[1];a.step(s,[input(3,{alt:1,weapon:4,attack:1,trigger:false})]);a.step(s,[input(4,{attack:2,trigger:false})]);const b=s.bullets.find(b=>b.weapon===4);assert.equal(b.grenadePhase,'init');assert.equal(b.grenadePower,.25);assert.equal(b.vx,0);assert.equal(b.vz,0);assert.equal(b.life,60);ticks(s);assert.equal(b.vx,8);assert.equal(b.vz,2.08);assert.equal(b.life,59);
});

test('grounded subthreshold bounce is silent; a wall bounce damps both horizontal components',()=>{
 const s=arena();s.bullets=[{...grenadeState(s),id:++s.nextId,x:320,y:272,z:0,vz:0,vx:0,vy:0,owner:1,weapon:4,damage:100,life:4,bang:0,cluster:false}];ticks(s);assert.equal(s.bullets[0].z,0);assert.equal(s.bullets[0].vz,0);assert.equal(s.soundId,0);
 const t=arena();t.bullets=[{...grenadeState(t),id:++t.nextId,x:36,y:272,z:40,vz:0,vx:-8,vy:4,owner:1,weapon:4,damage:100,life:4,bang:0,cluster:false}];ticks(t);const b=t.bullets[0];assert.equal(b.vx,2);assert.equal(b.vy,1);assert.equal(b.x,38);assert.equal(b.y,273);
});

test('native explosion advances 2.5 frames at unit scale and leaves the last frame until deferred removal',()=>{
 const s=arena();explosions.queueExplosion(s,320,272,100,1);ticks(s);const e=s.effects.find(e=>e.kind==='Effect.Explosion'),frames=[];
 for(let i=0;i<8;i++){assert(s.effects.includes(e));assert.equal(e.scale,1);frames.push(explosions.explosionFrame(s.tick,e.born));ticks(s);}
 assert.deepEqual(frames,[2,5,7,10,12,15,17,17]);assert(!s.effects.includes(e));
});

test('delayed and initialized explosion graphs survive JSON full recovery without respawning children',()=>{
 const s=arena();explosions.queueExplosion(s,320,272,150,1,2,true);ticks(s,2);assert.equal(s.bullets.length,4);assert(s.explosions.length>0&&s.explosions.some(e=>e.initialized));
 const recovered=JSON.parse(JSON.stringify(s));assert(a.valid(recovered));for(let i=0;i<35;i++){ticks(s);ticks(recovered);assert.deepEqual(s,recovered);assert(a.valid(s));}
});

test('full/delta transport retains pending delay and cluster identities; missing baseline requires recovery',()=>{
 const s=arena();explosions.queueExplosion(s,320,272,150,1,2,true);ticks(s);
 let before=JSON.parse(JSON.stringify(s)),client=protocol.applyUpdate(null,protocol.createUpdate(null,s,1000));assert.deepEqual(client,s);
 for(let i=0;i<26;i++){
  ticks(s);const update=protocol.createUpdate(before,s,1000+s.tick*40);assert.equal(update.kind,'delta');client=protocol.applyUpdate(client,update);assert.deepEqual(client,s);
  if(i===1){assert.equal(protocol.applyUpdate(null,update),null);client=protocol.applyUpdate(null,protocol.createUpdate(null,s,1000+s.tick*40));assert.deepEqual(client,s);}
  before=JSON.parse(JSON.stringify(s));
 }
});

test('map barrels keep damage 100 and one-hit life; placed barrel damage is captured before later upgrades',()=>{
 const initial=a.create(1,true,[1,2],42);assert(initial.barrels.some(b=>b.kind==='barrel'));assert(initial.barrels.filter(b=>b.kind==='barrel').every(b=>b.hp===1&&b.damage===100));
 const s=arena(),p=equip(s,3);p.dir=0;a.step(s,[input(1,{attack:1})]);const barrel=s.barrels[0];assert.equal(barrel.hp,1);assert.equal(barrel.damage,150);s.peakCombo=44;barrel.hp=0;ticks(s);assert.equal(s.explosions[0].damage,150);assert.equal(s.explosions[0].bang,2);ticks(s);assert.equal(s.explosions.length,3);assert(s.explosions.every(e=>e.damage===150));
});

test('explosion damage does not detonate mines or charge packs lacking native affect flags',()=>{
 const s=arena();s.barrels=[{id:++s.nextId,x:320,y:272,z:0,kind:'mine',hp:60,owner:1,armed:0,exploded:false,animation:0,detonating:false,detonateAt:0},{id:++s.nextId,x:336,y:272,z:0,kind:'chargepack',hp:60,owner:1,armed:0,exploded:false,animation:0,detonating:false,detonateCounter:null}];explosions.queueExplosion(s,320,272,250,1);ticks(s);assert.equal(s.barrels.length,2);assert(s.barrels.every(b=>b.hp===60));assert(a.valid(s));
});

test('snapshot validation rejects corrupt delayed explosion and native projectile metadata',()=>{
 const s=arena();explosions.queueExplosion(s,320,272,150,1,2,true);ticks(s);assert(a.valid(s));
 for(const edit of [s=>s.explosions=undefined,s=>s.explosions[0].delay=NaN,s=>s.explosions[0].bang=3,s=>s.explosions[0].born=s.tick+1,s=>s.explosions[0].initialized=1,s=>s.explosions[0].damage=-1,s=>s.bullets[0].z=NaN,s=>s.bullets[0].clusterShell='yes',s=>s.effects.find(e=>e.kind==='Effect.Explosion').born=NaN,s=>s.effects.find(e=>e.kind==='Effect.Explosion').scale=1.6]){const bad=JSON.parse(JSON.stringify(s));edit(bad);assert.equal(a.valid(bad),false);}
});
