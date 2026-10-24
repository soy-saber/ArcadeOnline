'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),source=require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(name,module);m.paths=module.paths;m._compile(source,name);return m.exports;}
const a=load('../src/expanded/boxhead.ts').adapter,world=load('../src/expanded/boxhead-world.ts'),protocol=load('../src/authority/protocol.ts');
const input=(seq,patch={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...patch});
function arena(){const s=a.create(1,true,[1,2],17,'original-01');s.waveReady=0;s.spawnLeft=1;s.nextSpawn=1e9;s.barrels=[];s.pickups=[];s.players.forEach((p,i)=>{p.x=144+i*400;p.y=272;p.dir=0;p.invul=100000;});return s;}
function ticks(s,n=1,controls=[]){for(let i=0;i<n;i++)a.step(s,controls);}
function equip(s,index){const p=s.players[0];p.weapon=index;p.unlocked[index]=true;p.inventory[index]=world.weaponStats(s,index).ammo;p.ammo=p.inventory[index];return p;}

test('charge pack second trigger runs three callbacks before queuing an explosion and consumes no ammo',()=>{
 const s=arena(),p=equip(s,8);a.step(s,[input(1,{attack:1})]);const b=s.barrels[0];assert.equal(p.ammo,9);assert.equal(p.chargeDetonate,true);assert.equal(b.animation,0);assert.equal(b.detonateCounter,null);
 a.step(s,[input(2,{attack:2})]);assert.equal(p.ammo,9);assert.equal(p.chargeDetonate,false);assert.equal(b.detonateCounter,1.5);assert.equal(s.explosions.length,0);assert(s.barrels.includes(b));assert.equal(s.sounds.filter(e=>e.name==='Object.Mine.Detonate.wav').length,1);
 ticks(s);assert.equal(b.detonateCounter,.5);assert(s.barrels.includes(b));ticks(s);assert(!s.barrels.includes(b));assert.equal(s.explosions.length,1);assert(!s.effects.some(e=>e.kind==='Effect.Explosion'));assert.equal(s.explosions[0].damage,150);assert.equal(s.explosions[0].owner,1);
 ticks(s);assert.equal(s.explosions.length,0);assert.equal(s.effects.filter(e=>e.kind==='Effect.Explosion').length,1);assert.equal(p.ammo,9);assert(a.valid(s));
});

test('reselecting the same charge weapon permits several owned packs and a later trigger detonates only that owner',()=>{
 const s=arena(),p=equip(s,8),q=s.players[1];q.weapon=8;q.unlocked[8]=true;q.inventory[8]=10;q.ammo=10;
 a.step(s,[input(1,{attack:1}),input(1,{attack:1})]);assert.equal(s.barrels.length,2);p.x+=64;
 a.step(s,[input(2,{alt:1,weapon:8,attack:2}),input(2,{attack:1})]);assert.equal(s.barrels.length,3);assert.equal(p.ammo,8);assert.equal(p.chargeDetonate,true);
 a.step(s,[input(3,{attack:3}),input(3,{attack:1})]);assert.equal(s.barrels.filter(b=>b.detonating).length,2);assert(s.barrels.filter(b=>b.detonating).every(b=>b.owner===1));
 ticks(s,2);assert.equal(s.barrels.length,1);assert.equal(s.barrels[0].owner,2);assert.equal(s.barrels[0].detonating,false);assert.equal(q.ammo,9);assert(a.valid(s));
});

test('last charge pack remains selectable after ammo reaches zero and returns to pistol only after all owned packs are gone',()=>{
 const s=arena(),p=equip(s,8);p.inventory[8]=p.ammo=1;a.step(s,[input(1,{attack:1})]);assert.equal(p.ammo,0);assert.equal(p.weapon,8);
 a.step(s,[input(2,{alt:1,weapon:0,attack:1})]);assert.equal(p.weapon,0);a.step(s,[input(3,{alt:2,weapon:8,attack:1})]);assert.equal(p.weapon,8);assert.equal(p.ammo,0);assert.equal(p.chargeDetonate,true);
 a.step(s,[input(4,{attack:2})]);ticks(s,2);assert.equal(s.barrels.length,0);assert.equal(p.weapon,8);ticks(s);assert.equal(p.weapon,0);assert.equal(p.ammo,-1);assert(a.valid(s));
});

test('weapon switch Reset clears native fire cooldown but does not refill ammunition',()=>{
 const s=arena(),p=equip(s,1);a.step(s,[input(1,{attack:1})]);assert(p.cooldown>0);assert.equal(p.ammo,99);
 a.step(s,[input(2,{alt:1,weapon:1,attack:2})]);assert.equal(p.ammo,98);assert.equal(p.fireAt,s.tick);assert.equal(p.inventory[0],-1);
});

test('charge placement uses the native mine placement cue, including occupied attempts without consuming ammo',()=>{
 const s=arena(),p=equip(s,8);a.step(s,[input(1,{attack:1})]);assert.equal(s.sounds.filter(e=>e.name==='Weapon.Mine.Place.wav').length,1);assert(!s.sounds.some(e=>e.name==='Object.Barrel.Place.wav'));
 a.step(s,[input(2,{alt:1,weapon:8,attack:2})]);assert.equal(p.ammo,9);assert.equal(s.barrels.length,1);assert.equal(p.chargeDetonate,false);assert.equal(s.sounds.filter(e=>e.name==='Weapon.Mine.Place.wav').length,2);assert(!s.sounds.some(e=>e.name==='Object.Mine.Detonate.wav'));
});

test('mine and charge idle animation advances .04 per callback; detonation preserves phase and accelerates to one',()=>{
 for(const weapon of [6,8]){
  const s=arena(),p=equip(s,weapon);a.step(s,[input(1,{attack:1})]);const b=s.barrels[0];ticks(s,24);assert(Math.abs(b.animation-.96)<1e-12);assert.equal(Math.floor(b.animation),0);ticks(s);assert(Math.abs(b.animation-1)<1e-12);assert.equal(Math.floor(b.animation),1);
  if(weapon===6){s.zombies=[{id:++s.nextId,x:b.x,y:b.y,hp:100,dir:0,attack:9999,owner:0,devil:false,hitAt:-99,attackAt:s.tick}];ticks(s);assert.equal(b.detonateAt,s.tick+50);}
  else a.step(s,[input(2,{attack:2})]);
  assert(Math.abs(b.animation-.04)<1e-10);assert.equal(Math.floor(b.animation),0);ticks(s);assert(Math.abs(b.animation-1.04)<1e-10);assert.equal(Math.floor(b.animation),1);assert(a.valid(s));
 }
});

test('detonation in progress recovers through full and delta snapshots without replaying or extending the counter',()=>{
 const s=arena();equip(s,8);a.step(s,[input(1,{attack:1})]);a.step(s,[input(2,{attack:2})]);const recovered=JSON.parse(JSON.stringify(s));assert(a.valid(recovered));assert.equal(recovered.barrels[0].detonateCounter,1.5);
 let client=protocol.applyUpdate(null,protocol.createUpdate(null,s,1000)),before=JSON.parse(JSON.stringify(s));
 for(let i=0;i<10;i++){ticks(s);ticks(recovered);assert.deepEqual(s,recovered);client=protocol.applyUpdate(client,protocol.createUpdate(before,s,1000+s.tick*40));assert.deepEqual(client,s);before=JSON.parse(JSON.stringify(s));}
});

test('duplicate, stale and consumed trigger counters do not restart pack detonation',()=>{
 const s=arena();equip(s,8);a.step(s,[input(2,{attack:1})]);a.step(s,[input(4,{attack:2})]);const b=s.barrels[0];a.step(s,[input(4,{attack:2})]);assert.equal(b.detonateCounter,.5);a.step(s,[input(3,{attack:99})]);assert.equal(s.barrels.length,0);assert.equal(s.sounds.filter(e=>e.name==='Object.Mine.Detonate.wav').length,1);
 const t=arena(),p=equip(t,8);a.step(t,[input(1,{attack:1})]);a.consumeInput(t,1,input(2,{attack:2}));a.step(t,[input(3,{attack:2})]);assert.equal(t.barrels[0].detonating,false);assert.equal(p.ammo,9);
});

test('snapshot validation rejects missing pack state, malformed slow animation and invalid native countdown values',()=>{
 const s=arena();equip(s,8);a.step(s,[input(1,{attack:1})]);assert(a.valid(s));
 for(const edit of [s=>delete s.players[0].chargeDetonate,s=>s.barrels[0].animation=NaN,s=>s.barrels[0].animation=2,s=>s.barrels[0].detonating=1,s=>s.barrels[0].detonateCounter=2,s=>{s.barrels[0].detonateCounter=1.5;s.barrels[0].detonating=false;}]){const bad=JSON.parse(JSON.stringify(s));edit(bad);assert.equal(a.valid(bad),false);}
});
