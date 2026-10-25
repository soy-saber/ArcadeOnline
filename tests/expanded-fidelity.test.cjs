'use strict';
const attachEnemy=require('./helpers/boxhead-enemy.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),path=require('node:path');
function load(file){const name=path.resolve(__dirname,file),source=require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(name,module);m.paths=module.paths;m._compile(source,name);return m.exports;}
const box=load('../src/expanded/boxhead.ts').adapter,world=load('../src/expanded/boxhead-world.ts'),bomb=load('../src/authority/bomb-core.ts'),bomb2=load('../src/expanded/bomb2.ts');
const bs=load('../src/authority/bomb-status.ts'),b2s=load('../src/expanded/bomb2-status.ts');
const input=(seq,patch={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...patch});
function arena(){const s=box.create(1,true,[1,2,3,4],42);s.waveReady=0;s.spawnLeft=1;s.nextSpawn=1e9;s.barrels=[];s.pickups=[];s.players.forEach((p,i)=>{p.x=144+i*80;p.y=272;p.dir=0;p.invul=0;});return s;}
function equip(s,w){const p=s.players[0];p.weapon=w;p.unlocked[w]=true;p.inventory[w]=world.weaponStats(s,w).ammo;p.ammo=p.inventory[w];return p;}
const ticks=(s,n,controls=[])=>{for(let i=0;i<n;i++)box.step(s,controls);};
test('original default friendly bullets hit the nearer teammate, not the zombie behind; invulnerability remains effective',()=>{
 const s=arena(),[p,q]=s.players;q.hp=200;s.zombies=[attachEnemy(s,{id:999,x:p.x+140,y:p.y,hp:100,dir:0,owner:0,attack:0,devil:false,hitAt:-99,attackAt:-99})];box.step(s,[input(1,{attack:1})]);assert.equal(q.hp,174+200/(25*30));assert.equal(s.zombies[0].hp,100);assert.equal(p.hp,200);assert.equal(p.kills,0);
 q.invul=50;p.cooldown=0;box.step(s,[input(2,{attack:2})]);assert(q.hp>174&&q.hp<175);assert(box.valid(s));
});
test('railguns damage teammates and enemies along the same ray; friendly kills are deaths, not zombie score',()=>{
 const s=arena(),p=equip(s,9),q=s.players[1];q.hp=80;s.zombies=[attachEnemy(s,{id:999,x:p.x+160,y:p.y,hp:90,dir:0,owner:0,attack:0,devil:false,hitAt:-99,attackAt:-99})];box.step(s,[input(1,{attack:1})]);assert(!q.alive);assert.equal(q.deaths,1);assert.equal(q.killedBy,1);assert.equal(p.kills,1);assert.equal(s.score,100);
});
test('all original firearm families apply friendly damage through authoritative hits',()=>{
 for(const weapon of [0,1,2,7,9]){const s=arena(),p=equip(s,weapon),q=s.players[1];box.step(s,[input(1,{attack:1})]);ticks(s,10,[input(1,{attack:1})]);assert(q.hp<200,'friendly damage from '+world.WEAPONS[weapon].id);assert.equal(p.kills,0);assert.equal(s.score,0);assert(box.valid(s));}
});
test('native explosions hurt the owner and teammates with source distance falloff',()=>{
 const s=arena(),p=s.players[0],q=s.players[1];p.x=200;q.x=245;s.players[2].x=260;s.players[3].x=500;
 s.bullets=[{id:999,x:200,y:272,z:0,vz:0,vx:0,vy:0,owner:1,weapon:4,damage:100,life:1,bang:0,cluster:false}];box.step(s,[]);assert.equal(p.hp,200);assert.equal(s.explosions.length,1);box.step(s,[]);
 assert.equal(p.hp,100);assert.equal(q.hp,125);assert.equal(s.players[2].hp,150);assert.equal(s.players[3].hp,200);assert.equal(p.killedBy,1);
});
test('Q/E directions skip empty or locked weapons and consume a switch counter once',()=>{
 const s=arena(),p=s.players[0];for(const w of [1,2,7]){p.unlocked[w]=true;p.inventory[w]=world.WEAPONS[w].ammo;}p.inventory[2]=0;
 box.step(s,[input(1,{alt:1,weaponStep:1})]);assert.equal(p.weapon,1);
 box.step(s,[input(2,{alt:2,weaponStep:-1})]);assert.equal(p.weapon,0);
 box.step(s,[input(3,{alt:3,weaponStep:-1})]);assert.equal(p.weapon,7);
 box.step(s,[input(3,{alt:3,weaponStep:1})]);assert.equal(p.weapon,7);
 box.step(s,[input(4,{alt:4,weapon:2})]);assert.equal(p.weapon,7);
});
test('death empties every finite weapon, respawn does not refill it, pickup can restore an unlocked weapon',()=>{
 const s=arena(),p=s.players[0];p.unlocked.fill(true);p.inventory=world.WEAPONS.map(w=>w.ammo);p.weapon=7;p.ammo=20;p.hp=-1;
 ticks(s,1);assert.deepEqual(p.inventory,[-1,0,0,0,0,0,0,0,0,0]);assert.equal(p.weapon,0);
 ticks(s,125);assert(p.alive);assert.deepEqual(p.inventory,[-1,0,0,0,0,0,0,0,0,0]);
 box.step(s,[input(2,{alt:1,weapon:7})]);assert.equal(p.weapon,0);
 s.pickups=[{id:999,x:p.x,y:p.y,life:100}];ticks(s,1);assert(p.inventory.slice(1).some(n=>n>0));assert.equal(p.ammo,p.inventory[p.weapon]);
});
test('a dead player receives upgrade availability without new ammunition before revival',()=>{
 const s=arena(),p=s.players[1];p.hp=-1;ticks(s,1);s.combo=4;s.peakCombo=4;s.zombies=[attachEnemy(s,{id:999,x:s.players[0].x+30,y:272,hp:1,dir:0,owner:0,attack:0,devil:false,hitAt:-99,attackAt:-99})];box.step(s,[input(1,{attack:1})]);assert(p.unlocked[1]);assert.equal(p.inventory[1],0);assert.equal(p.weapon,0);
});
test('native single fire, unlocked rapid fire and UZI held fire use server cooldown and never refill ammo',()=>{
 const s=arena(),p=s.players[0];box.step(s,[input(1,{attack:1,trigger:true})]);const first=p.fireAt;ticks(s,20,[input(1,{attack:1,trigger:true})]);assert.equal(p.fireAt,first);
 s.peakCombo=3;box.step(s,[input(2,{attack:1,trigger:true})]);assert(p.fireAt>first);
 equip(s,1);p.cooldown=0;box.step(s,[input(3,{attack:2,trigger:true})]);ticks(s,12,[input(3,{attack:2,trigger:true})]);assert.equal(p.inventory[1],96);
 box.consumeInput(s,1,input(4,{attack:3,trigger:true}));const ammo=p.ammo;box.step(s,[input(4,{attack:3,trigger:false})]);assert.equal(p.ammo,ammo);
});
test('charged grenades launch on release; stale input cannot cause a delayed throw',()=>{
 const s=arena(),p=equip(s,4);box.step(s,[input(1,{attack:1,trigger:true})]);assert.equal(s.bullets.length,0);ticks(s,12,[input(1,{attack:1,trigger:true})]);box.step(s,[input(2,{attack:1,trigger:false})]);assert.equal(s.bullets[0].weapon,4);assert.equal(p.ammo,19);
 p.cooldown=0;box.step(s,[input(3,{attack:2,trigger:true})]);box.consumeInput(s,1,input(4,{attack:2,trigger:true}));box.step(s,[input(4,{attack:2,trigger:false})]);assert.equal(p.ammo,19);
});
test('a complete quick tap between network samples still fires automatic guns and throws a short grenade',()=>{
 for(const w of [1,4]){const s=arena(),p=equip(s,w);box.step(s,[input(1,{attack:1,trigger:false})]);assert.equal(p.ammo,world.WEAPONS[w].ammo-1);assert(s.bullets.length>0);}
});
test('clearing controls on blur or entering fullscreen cancels a charged throw until a new press',()=>{
 const s=arena(),p=equip(s,4);box.step(s,[input(1,{attack:1,trigger:true,cancelledAttack:0})]);box.step(s,[input(2,{attack:1,trigger:false,cancelledAttack:1})]);assert.equal(p.ammo,20);box.step(s,[input(3,{attack:2,trigger:false,cancelledAttack:1})]);assert.equal(p.ammo,19);
});
test('the new-wave cue uses the original World.End sample instead of the menu click',()=>{
 const s=arena();s.wave=1;s.spawnLeft=0;s.waveReady=1;box.step(s,[]);assert.equal(s.wave,2);assert(s.sounds.some(e=>e.name==='World.End.wav'));assert(!s.sounds.some(e=>e.name==='CLICK.wav'));
});
test('bomb status panels use authoritative counts and do not invent stock or cooldown changes',()=>{
 const s=bomb.createGame(1,1,true,{mode:'online',activeSeats:[1,4]}),p=s.players[0];p.weapon='ice';p.ammo=1;p.capacity=3;p.range=5;p.push=true;p.shield=true;p.speed=4;
 const status=bs.bombStatus(s);assert.deepEqual(status.map(p=>p.seat),[1,4]);assert.equal(status[0].weapon.value,'×1');assert.equal(status[0].icons[0].value,'3');assert.equal(status[0].icons[1].value,'5');assert.equal(status[0].icons[2].value,'3');assert(status[0].icons[4].active);assert.equal(bomb.PUSH_COOLDOWN_TICKS,14);assert.equal(bomb.SPECIAL_RECOVERY_TICKS,7);
 p.ammo=0;assert.equal(bs.bombWeapon(p),null);
 s.bombs.push({owner:1});assert.equal(bs.bombStatus(s)[0].icons[0].value,'2');s.bombs=[];assert.equal(bs.bombStatus(s)[0].icons[0].value,'3');
});
test('Bomb It 2 primary attack uses held specials in every mode and the head/panel counts decrement together',()=>{
 for(const mode of ['arcade','kill','collect','color']){const s=bomb2.create(1,true,[1,2],1,'mine-one',mode),p=s.players[0];s.board.fill(0);s.tiles.fill(0);p.invulnerable=100;p.weapon=16;p.ammo=2;
  const before=b2s.bomb2Weapon(s,p);assert.equal(before.value,'×2');bomb2.step(s,[input(1,{attack:1})]);assert.equal(s.bombs.length,0);assert.equal(p.attack.kind,16);assert.equal(p.ammo,1);assert.equal(b2s.bomb2Weapon(s,p).value,'×1');assert.equal(b2s.bomb2Status(s)[0].weapon.value,'×1');}
});
test('Bomb It 2 death clears weapon and powerups in all four modes, and speed has three native levels',()=>{
 for(const mode of ['arcade','kill','collect','color']){const s=bomb2.create(1,true,[1,2],1,'mine-one',mode),p=s.players[0];s.board.fill(0);s.tiles.fill(0);p.invulnerable=0;p.weapon=21;p.ammo=2;p.kick=true;p.capacity=4;p.range=5;p.speed=6;s.flames[bomb2.index(p.x,p.y)]=20;s.owners[bomb2.index(p.x,p.y)]=2;bomb2.step(s,[]);assert.equal(p.weapon,0);assert.equal(p.ammo,0);assert.equal(p.speed,8);assert.equal(p.capacity,1);assert.equal(p.range,1);assert.equal(p.kick,false);assert(bomb2.valid(s));}
 const s=bomb2.create(1,true,[1,2],1,'mine-one'),p=s.players[0];s.board.fill(0);s.tiles.fill(0);for(let n=0;n<5;n++){p.x=3;p.y=3;p.moveDir=-1;p.progress=0;s.items[bomb2.index(4,3)]=3;for(let t=0;t<12;t++)bomb2.step(s,[input(n*20+t,{right:true})]);}assert.equal(p.speed,6);assert.equal(b2s.bomb2Status(s)[0].icons[2].value,'3');
});
