'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),golden=require('./fixtures/boxhead-progression-as2.json');
function load(file){const name=path.resolve(__dirname,file),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);return m.exports;}
const p=load('../src/expanded/boxhead-progression.ts'),{adapter:a}=load('../src/expanded/boxhead.ts');
const creature=load('../src/expanded/boxhead-creature.ts'),objects=load('../src/expanded/boxhead-objects.ts'),pickups=load('../src/expanded/boxhead-pickups.ts'),weapons=load('../src/expanded/boxhead-weapon-upgrades.ts'),world=load('../src/expanded/boxhead-world.ts'),nav=load('../src/expanded/boxhead-navigation.ts'),protocol=load('../src/authority/protocol.ts');
function state(fps,devils=true,mode='coop',tier=0){return a.create(1,true,mode==='single'?[1]:[1,2],42,'original-18',mode,{speed:fps/25,devils,difficulty:a.difficulties[tier].id});}
function same(actual,expected,label){assert.equal(actual.length,expected.length,label);for(let i=0;i<actual.length;i++)if(typeof expected[i]==='number')assert(Math.abs(actual[i]-expected[i])<=1e-10*Math.max(1,Math.abs(expected[i])),label+' index'+i+': '+actual[i]+' != '+expected[i]);else assert.equal(actual[i],expected[i],label+' index'+i);}
function values(s,score=s.score,drops=0,sounds=0){const x=s.progression,l=x.level;return [x.tick,s.wave,s.combo,x.multiplierTicks,x.multiplierTotal,x.multiple,x.multipleTicks,x.multipleTotal,l.zombieAlive,l.devilAlive,l.zombieLimit,l.zombieRemaining,l.devilLimit,l.devilRemaining,l.zombieCountdown,l.devilCountdown,score,drops,sounds];}
test('all100 source wave tables and FOREVER reuse agree with618 native AS2 observations across all speeds and devil options',()=>{
 let row=0;for(const fps of golden.rates)for(const devils of [false,true])for(let wave=1;wave<=103;wave++){
  const l=p.levelSettings(fps,devils,wave);same([wave,l.zombieRate,l.zombieLimit,l.zombieRemaining,l.devilRate,l.devilLimit,l.devilRemaining,Math.min(1+Math.min(wave,100)/100*10,5),devils?Math.min(1+Math.min(wave,100)/100*10,5):0],golden.groups.LEVEL[row++].values,'wave'+wave+'@'+fps);
 }
});
test('native difficulty/DeathMatch initialization matches30 source snapshots, including exact independent timer values',()=>{
 let row=0;for(const fps of golden.rates)for(const devils of [false,true])for(let tier=0;tier<5;tier++){
  const s=state(fps,devils,tier===4?'deathmatch':'coop',tier===4?0:tier);same(values(s),golden.groups.INIT[row++].values,'init');assert(a.valid(s));
 }
});
test('1080 native callbacks distinguish kill-chain expiry from multiplier decay, score after upgrade and fixed drop rules',()=>{
 let row=0;for(const fps of golden.rates)for(const dm of [false,true]){
  const s=state(fps,true,dm?'deathmatch':'coop',3);p.enterWave(s,100);let drops=0;
  for(let tick=1;tick<=180;tick++){
   s.tick=tick;const action=golden.stepActions[tick];if(action==='p'){if(dm)drops++;}
   else if(action){p.enemySpawned(s,action==='d');if(p.enemyKilled(s,action==='d',()=>{}))drops++;}
   p.stepProgression(s,{spawn:()=>false,upgrade:()=>{},wave:()=>{},hasCreatures:()=>false});same(values(s,s.score,drops),golden.groups.STEP[row++].values,'step'+tick+'@'+fps+' dm'+dm);
  }
 }
});
test('native spawn counter boundaries and corpse-delayed wave changes match75 actual source observations',()=>{
 let spawnRow=0,waveRow=0;for(const fps of golden.rates){const s=state(fps);let sounds=0;
  const hooks={spawn:()=>true,upgrade:()=>{},wave:()=>sounds++,hasCreatures:()=>s.progression.level.zombieAlive>0};
  for(let tick=1;tick<=100;tick++){s.tick=tick;p.stepProgression(s,hooks);if(tick<4||tick%5===0)same(values(s,0,0,sounds),golden.groups.SPAWN[spawnRow++].values,'spawn'+tick+'@'+fps);}
  s.progression.level.zombieLimit=s.progression.level.zombieRemaining=0;s.tick++;p.stepProgression(s,{...hooks,hasCreatures:()=>true});same(values(s,0,0,sounds),golden.groups.WAVE[waveRow++].values,'corpse');
  s.tick++;p.stepProgression(s,{...hooks,hasCreatures:()=>false});same(values(s,0,0,sounds),golden.groups.WAVE[waveRow++].values,'next wave');
 }
});
test('native death/fade and control-only regeneration retain wall-clock timing at12.5/25/50Hz',()=>{
 let row=0;for(const fps of golden.rates)for(const human of [false,true]){
  const s=state(fps),thing={x:144,y:272,dir:0,hp:-1,...(human?{seat:1}:{}),body:creature.creatureBody(human)};thing.body.phase='dying';thing.body.frame=4.8;thing.body.deadFlag=true;let notified=0;
  const hooks={random:()=>0,sound:()=>{},blood:()=>{},dying:()=>{},resume:()=>{},respawn:()=>false,playerDead:()=>notified++};creature.stepCreature(s,thing,hooks);const initial=thing.body.counter;let callbacks=0;
  while(thing.body.phase==='dead'){s.tick++;callbacks++;creature.stepCreature(s,thing,hooks);assert(callbacks<300);}
  same([initial,callbacks,notified,thing.body.counter,thing.body.alpha*100],golden.groups.DEAD[row++].values,'death@'+fps+' human'+human);
 }
 for(const [i,fps]of golden.rates.entries()){
  const s=state(fps,true,'deathmatch'),q=s.players[0];q.hp=100;for(let n=0;n<fps*8;n++)a.step(s,[]);same([q.hp],golden.groups.REGEN[i].values,'regen@'+fps);assert(a.valid(s));
 }
});
test('native mine/remote-pack callbacks, slow animation and one-off pickup lifetime/fade match all9 reference cases',()=>{
 let row=0;for(const fps of golden.rates)for(const pack of [false,true]){
  const s=state(fps),q=s.players[0],b={id:999,x:q.x,y:q.y,hp:1,armed:0,kind:pack?'chargepack':'mine',animation:0,detonating:pack,detonateCounter:null,detonateAt:0,mineWaiting:false};s.barrels=[b];s.enemyCells[nav.cell(s,b.x,b.y)]=true;let sounds=0,callbacks=0;
  while(b.hp>0){s.tick++;callbacks++;objects.stepExplosiveObjects(s,()=>sounds++);assert(callbacks<200);}
  const expected=golden.groups.OBJECT[row++].values;same([callbacks,sounds,b.animation],expected.slice(0,3),'detonation@'+fps+' pack'+pack);if(pack)assert.equal(b.detonateCounter,expected[3]);
 }
 for(const [i,fps]of golden.rates.entries()){
  const s=state(fps),position=s.players[0];s.players=[];s.pickups=[];pickups.dropPickup(s,position);const drop=s.pickups[0];let callbacks=0;
  while(s.pickups.length){s.tick++;callbacks++;pickups.stepPickups(s,()=>0,()=>{});assert(callbacks<600);}
  same([callbacks,drop.deleteCounter,drop.alpha*100],golden.groups.TTL[i].values,'drop lifetime@'+fps);
 }
});
test('NewWeapon keeps the selected gun and creates ammunition even for an already dead teammate; scoring uses the upgraded multiplier',()=>{
 const s=state(25),q=s.players[1];s.combo=s.peakCombo=4;s.progression.level.zombieCountdown=1e9;s.barrels=[];s.pickups=[];q.alive=false;q.hp=-1;q.body.phase='dead';q.body.counter=100;q.body.deadFlag=q.body.loggedKill=true;q.body.collidable=q.body.affectEnabled=false;
 s.zombies=[require('./helpers/boxhead-enemy.cjs')(s,{id:999,x:s.players[0].x+70,y:s.players[0].y,hp:-1,dir:0,owner:1,attack:0,devil:false,hitAt:-99,attackAt:-99})];a.step(s,[]);
 assert.deepEqual(golden.groups.NEW[0].values,[true,'pistol',1]);assert.equal(s.score,500);for(const human of s.players){assert(human.unlocked[1]);assert.equal(human.weapon,0);assert.equal(human.inventory[1],100);}assert(a.valid(s));
});
test('eight native weapon observations preserve deferred ammo/rate upgrades and refill once on later class changes',()=>{
 const s=state(25),q=s.players[0];q.weapon=1;q.unlocked[1]=true;weapons.rebuildWeapon(s,q,1);
 function compare(row,full=true){const e=golden.groups.WEAPON[row].values,stats=world.weaponStats(s,1);if(full)same([q.inventory[1],q.weaponCaps[1],stats.rate,stats.auto,stats.damage,stats.range,q.cooldown],e,'weapon'+row);else same([q.inventory[1],q.weaponCaps[1],q.cooldown],[e[0],e[1],e[6]],'deferred weapon'+row);}
 compare(0);q.inventory[1]=q.ammo=7;q.cooldown=5;s.peakCombo=13;compare(1,false);weapons.refreshCurrentWeapon(s,q);compare(2);s.peakCombo=17;compare(3,false);weapons.refreshCurrentWeapon(s,q);compare(4);q.inventory[1]=q.ammo=12;q.cooldown=3;s.peakCombo=23;compare(5,false);weapons.refreshCurrentWeapon(s,q);compare(6);q.inventory[1]=q.ammo=11;q.cooldown=2;weapons.refreshCurrentWeapon(s,q);compare(7);assert(a.valid(s));
});
test('deathmatch mines wait for their occupied cell to clear, then trigger when a player returns',()=>{
 const s=state(25,true,'deathmatch'),q=s.players[0],b={id:999,x:q.x,y:q.y,hp:1,armed:0,kind:'mine',animation:0,detonating:false,detonateCounter:null,detonateAt:0,mineWaiting:true};s.barrels=[b];let sounds=0;
 for(let i=0;i<5;i++){s.tick++;objects.stepExplosiveObjects(s,()=>sounds++);}assert(b.mineWaiting);assert.equal(sounds,0);const origin=q.x;for(const p of s.players)p.x+=200;s.tick++;objects.stepExplosiveObjects(s,()=>sounds++);assert.equal(b.mineWaiting,false);assert.equal(b.animation,0);q.x=origin;s.tick++;objects.stepExplosiveObjects(s,()=>sounds++);assert(b.detonating);assert.equal(sounds,1);
});
test('new progression/weapon/drop state recovers through full/delta snapshots and rejects malformed counters or inventories',()=>{
 const s=state(12.5),before=structuredClone(s);pickups.dropPickup(s,s.players[0]);for(let i=0;i<4;i++)a.step(s,[]);assert(a.valid(s));let client=protocol.applyUpdate(null,protocol.createUpdate(null,before,1000,true));client=protocol.applyUpdate(client,protocol.createUpdate(before,s,1200));assert.deepEqual(client,s);
 for(const mutate of [x=>x.progression.multiple=NaN,x=>x.progression.multiplierTicks=-20,x=>x.progression.level.zombieRate=0,x=>x.players[0].weaponCaps[1]=0,x=>x.players[0].weaponRevisions[1]=10000]){const bad=structuredClone(s);mutate(bad);assert.equal(a.valid(bad),false);}
});
