'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);return m.exports;}
const {adapter:a}=load('../src/expanded/boxhead.ts'),{AuthorityEngine}=load('../src/authority/engine.ts'),world=load('../src/expanded/boxhead-world.ts'),creature=load('../src/expanded/boxhead-creature.ts'),protocol=load('../src/authority/protocol.ts'),fixture=require('./fixtures/boxhead-options-source.json');
function duel(seats=[1,2],settings={}){return a.create(1,true,seats,42,'original-01','deathmatch',settings);}
function dying(s,p){p.hp=-1;p.invul=0;a.step(s,[]);assert.equal(p.body.phase,'dying');}
function advance(s,n=1){for(let i=0;i<n;i++)a.step(s,[]);}
test('original DeathMatch preset opens200 upgrades, all weapons with cleared non-pistol ammunition, resets to pistol and suppresses enemy waves/decay',()=>{
 assert.equal(fixture.deathmatchMultiplier,200);for(const preset of a.difficulties){const s=duel([1,2,3,4],{difficulty:preset.id,damage:false});assert(a.valid(s));assert.equal(s.peakCombo,fixture.deathmatchMultiplier);assert.equal(s.combo,200);assert.equal(s.options.damage,true);for(const p of s.players){assert(p.unlocked.every(Boolean));assert.deepEqual(p.inventory,[-1,0,0,0,0,0,0,0,0,0]);assert.equal(p.weapon,0);}advance(s,400);assert.equal(s.wave,0);assert.equal(s.waveReady,0);assert.equal(s.spawnLeft,0);assert.equal(s.zombies.length,0);assert.equal(s.combo,200);assert(a.valid(s));}
});
test('native death thresholds5/10/20/50 end the duel after the corpse countdown and credit only the remaining player',()=>{
 for(const limit of fixture.deathLimits){const s=duel([1,4],{deathLimit:limit}),p=s.players[1];p.deaths=limit-1;dying(s,p);assert.equal(p.deaths,limit);assert.equal(s.phase,'playing');for(let n=0;n<180&&s.phase==='playing';n++)advance(s);assert.equal(s.phase,'finished');assert.equal(s.winner,1);assert(a.valid(s));}
});
test('four-player elimination waits for the last participant; eliminated players do not respawn, and simultaneous exhaustion draws',()=>{
 const s=duel([1,2,3,4],{deathLimit:5});s.players[3].deaths=4;dying(s,s.players[3]);advance(s,180);assert.equal(s.phase,'playing');assert.equal(s.players[3].alive,false);assert.equal(s.players[3].body.phase,'respawn');assert.equal(s.players[3].deaths,5);
 for(const p of s.players.slice(0,2)){p.deaths=4;p.hp=-1;p.invul=0;}advance(s);for(let n=0;n<180&&s.phase==='playing';n++)advance(s);assert.equal(s.phase,'finished');assert.equal(s.winner,3);assert(a.valid(s));
 const tie=duel([1,4],{deathLimit:5});for(const p of tie.players){p.deaths=4;p.hp=-1;p.invul=0;}advance(tie);for(let n=0;n<180&&tie.phase==='playing';n++)advance(tie);assert.equal(tie.phase,'finished');assert.equal(tie.winner,0);assert(a.valid(tie));
});
test('deathmatch respawns far from opponents with one-second protection and retains full upgrades; all dead below the limit can recover',()=>{
 const s=duel(),p=s.players[0];dying(s,p);for(let n=0;n<200&&!p.alive;n++)advance(s);assert(p.alive);assert.equal(p.deaths,1);assert(p.invul>0&&p.invul<=25);assert.deepEqual(p.inventory,[-1,0,0,0,0,0,0,0,0,0]);assert.equal(p.weapon,0);assert(a.valid(s));
 const both=duel();for(const q of both.players){q.hp=-1;q.invul=0;}advance(both);for(let n=0;n<230&&!both.players.every(p=>p.alive);n++)advance(both);assert.equal(both.phase,'playing');assert(both.players.every(p=>p.alive));assert(a.valid(both));
});
test('source damage toggle suppresses player bullet/explosion affects but preserves hostile melee; deathmatch forces player damage',()=>{
 assert(fixture.damageForcedInDeathmatch);for(const mode of ['coop','deathmatch'])for(const damage of [false,true]){
  const s=a.create(1,true,[1,2],42,'original-01',mode,{damage}),p=s.players[0],q=s.players[1];s.waveReady=0;s.nextSpawn=s.nextDevil=1e9;s.barrels=[];s.pickups=[];advance(s);p.invul=0;p.x=144;p.y=272;q.x=192;q.y=272;q.dir=Math.PI;
  // Fire through the actual input/weapon/ray path, without a synthetic projectile.
  a.step(s,[undefined,{seq:1,left:false,right:false,up:false,down:false,attack:1,alt:0}]);advance(s,5);if(mode==='coop'&&!damage)assert.equal(p.hp,200);else assert(p.hp<200);assert(a.valid(s));
  for(let i=0;i<30&&p.body.phase!=='control';i++)advance(s);const before=p.hp;creature.queueAffect(s,p,'melee',10,0,q);advance(s);assert(p.hp<before);assert(a.valid(s));
 }
});
test('moving collision toggle permits entity overlap while keeping static map walls and hit knockback constraints',()=>{
 for(const collisions of [true,false]){const s=duel([1,2],{collisions});s.barrels=[];const p=s.players[0],q=s.players[1];p.x=144;p.y=272;q.x=170;q.y=272;world.move(s,p,5.12,0);assert.equal(p.x>149, !collisions);p.x=48;p.y=272;for(let i=0;i<20;i++)world.move(s,p,-5.12,0);assert(p.x>=40);}
});
test('authority option allowlists and native rate12.5/25/50 survive full/delta recovery and reject malformed settings',()=>{
 function setup(){const engine=new AuthorityEngine(()=>{}),p={id:'a',seat:1,ready:false,ws:null},q={id:'b',seat:2,ready:false,ws:null},room={gameId:a.id,seats:{1:'a',2:'b',3:null,4:null},members:new Map([['a',p],['b',q]])};engine.onRoom(room);return {engine,room,p,q};}
 for(const speed of fixture.speeds){const {engine,room,p,q}=setup();assert(engine.options(room,p,{map:'original-01',gameMode:'deathmatch',difficulty:'expert',speed,deathLimit:20,devils:false,damage:false,collisions:false}));assert.equal(a.rate(room.auth.state),25*speed);p.ready=q.ready=true;engine.onRoom(room);const at=room.auth.clock;for(let i=1;i<=20;i++)engine.pump(room,at+i*10);assert.equal(room.auth.state.tick,Math.floor(200*25*speed/1000));assert(a.valid(room.auth.state));const full=protocol.createUpdate(null,room.auth.state,at+200,true);assert.deepEqual(protocol.applyUpdate(null,full),room.auth.state);}
 const {engine,room,p}=setup();const before=JSON.stringify(room.auth.state);for(const bad of [{speed:0},{speed:'2'},{speed:null},{deathLimit:6},{deathLimit:'5'},{devils:0},{damage:'false'},{collisions:null}])assert.equal(engine.options(room,p,{map:'original-01',gameMode:'coop',difficulty:'beginner',...bad}),false);assert.equal(JSON.stringify(room.auth.state),before);
});
