'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),attachEnemy=require('./helpers/boxhead-enemy.cjs');
function load(file){const name=path.resolve(__dirname,file),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);return m.exports;}
const a=load('../src/expanded/boxhead.ts').adapter,c=load('../src/expanded/boxhead-creature.ts'),world=load('../src/expanded/boxhead-world.ts'),nav=load('../src/expanded/boxhead-navigation.ts'),protocol=load('../src/authority/protocol.ts');
const input=(seq,patch={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...patch});
function arena(){const s=a.create(1,true,[1,2],17,'original-01');s.progression.level.zombieCountdown=s.progression.level.devilCountdown=1e9;s.barrels=[];s.pickups=[];s.players.forEach((p,i)=>{p.x=144+i*400;p.y=272;p.dir=0;p.invul=0;});return s;}
function ticks(s,n=1,inputs=[]){for(let i=0;i<n;i++)a.step(s,inputs);}
function enemy(s,hp=100,devil=false){const z=attachEnemy(s,{id:++s.nextId,x:240,y:400,hp,devil,dir:0,owner:0,attack:0,hitAt:-99,attackAt:-99});s.zombies.push(z);return z;}
function hit(s,p,damage=26,kind='bullet',source={x:p.x-64,y:p.y,z:0},owner=1,range=null){c.queueAffect(s,p,kind,damage,owner,source,range);}
const close=(x,y)=>assert(Math.abs(x-y)<1e-9,`${x} versus ${y}`);

test('affects wait for creature callback and process newest first while preserving the pre-hit return angle',()=>{
 const s=arena(),z=enemy(s,1000);z.dir=Math.PI/2;hit(s,z,26,'bullet',{x:176,y:400,z:0},1);hit(s,z,35,'bullet',{x:304,y:400,z:0},2);assert.equal(z.hp,1000);ticks(s);assert.equal(z.hp,939);assert.equal(z.owner,1);close(z.x,250.4);close(z.body.vx,10.4*.65);close(z.body.returnAngle,Math.PI/2);assert.equal(z.body.affects.length,0);assert.equal(z.body.phase,'bullet-hit');assert(a.valid(s));
});
test('native mass and damage formulas distinguish bullet, melee and explosion displacement',()=>{
 for(const [who,kind,damage,expected]of [['player','bullet',26,5.2],['zombie','bullet',26,10.4],['devil','bullet',26,2.08],['player','melee',50,9.6],['player','explosion',100,9.6],['devil','explosion',50,4]]){
  const s=arena(),p=who==='player'?s.players[0]:enemy(s,1000,who==='devil'),x=p.x;hit(s,p,damage,kind,{x:x-64,y:p.y,z:0},0,kind==='explosion'?128:null);ticks(s);close(p.x-x,expected);close(p.body.vx,expected*.65);if(who==='devil')assert.equal(p.ai.fireRateCount,4);assert(a.valid(s));
 }
});
test('three-dimensional affect normalization retains source height before zeroing the vertical delta',()=>{
 const s=arena(),p=s.players[0],x=p.x;hit(s,p,26,'bullet',{x:x-64,y:p.y,z:64});ticks(s);close(p.x-x,5.2/Math.SQRT2);
 const t=arena(),q=t.players[0];hit(t,q,50,'fireball',{x:q.x,y:q.y,z:26.88});ticks(t);assert.equal(q.x,144);assert.equal(q.body.phase,'sleep');assert.equal(q.body.counter,3);assert.equal(q.hp,150);
});
test('hit callbacks damp resolved motion, freeze gun cooldown/regen/control and resume after native three-count sleep',()=>{
 const s=arena(),p=s.players[0],x=p.x;p.cooldown=7;hit(s,p);ticks(s,1,[input(1,{right:true,attack:1})]);assert.equal(p.hp,174);assert.equal(p.cooldown,7);assert.equal(p.lastAttack,1);assert.equal(p.fireAt,-99);assert.equal(p.body.counter,6);assert.equal(p.body.frame,0);assert.equal(p.body.action==='hitfront'||p.body.action==='hitrear',true);
 ticks(s,7,[input(1,{right:true,attack:1})]);assert.equal(p.body.phase,'sleep');assert.equal(p.body.counter,3);close(p.x-x,5.2*(1-.65**8)/(1-.65));assert.equal(p.cooldown,7);assert.equal(p.hp,174);
 ticks(s,2,[input(1,{right:true,attack:1})]);assert.equal(p.body.phase,'sleep');ticks(s,1,[input(1,{right:true,attack:1})]);assert.equal(p.body.phase,'control');assert.equal(p.cooldown,6);close(p.hp,174+200/750);assert.equal(p.dir,0);assert(a.valid(s));
});
test('wall and creature collision feed the actual resolved displacement back into hit friction without shortening the timer',()=>{
 const s=arena(),p=s.players[0];p.x=48;hit(s,p,26,'bullet',{x:112,y:272,z:0});ticks(s);assert.equal(p.x,48);assert.equal(p.body.vx,0);assert.equal(p.body.counter,6);ticks(s,7);assert.equal(p.body.phase,'sleep');assert.equal(p.body.counter,3);
 const t=arena(),q=t.players[0],z=attachEnemy(t,{id:++t.nextId,x:176,y:272,hp:100,devil:false,dir:0,owner:0,attack:0,hitAt:-99,attackAt:-99});t.zombies.push(z);hit(t,q);ticks(t);close(q.x,176-28.8);close(q.body.vx,3.2*.65);assert(a.valid(t));
});
test('pending gun edges and manual selection survive hit lock; expiry explicitly clears stale pending actions',()=>{
 const s=arena(),p=s.players[0];p.unlocked[1]=true;p.inventory[1]=100;hit(s,p);ticks(s,1,[input(1,{alt:1,weapon:1,attack:1})]);assert.equal(p.weapon,0);assert.equal(p.selectionPending,true);ticks(s,10,[input(1)]);assert.equal(p.weapon,1);assert.equal(p.selectionPending,false);assert.equal(p.ammo,100);
 const t=arena(),q=t.players[0];q.unlocked[1]=true;q.inventory[1]=100;hit(t,q);ticks(t,1,[input(1,{alt:1,weapon:1,attack:1})]);a.consumeInput(t,1,input(1));ticks(t,10,[input(1)]);assert.equal(q.weapon,0);assert.equal(q.fireAt,-99);assert(a.valid(t));
});
test('lethal hits clear affects and reservations during knockback, then log the kill once at Dying init',()=>{
 const s=arena(),z=enemy(s,20),at=z.ai.reserved;hit(s,z);ticks(s);assert.equal(z.hp,-6);assert.equal(z.body.deadFlag,true);assert.equal(z.body.affectEnabled,false);assert.equal(z.body.collidable,true);assert.equal(z.ai.reserved,null);assert(!s.enemyCells[at]);assert.equal(s.players[0].kills,0);assert.equal(s.score,0);assert.equal(s.zombies.length,1);hit(s,z);assert.equal(z.body.affects.length,0);
 ticks(s,8);assert.equal(z.body.phase,'bullet-hit');ticks(s);assert.equal(z.body.phase,'dying');assert.equal(z.body.frame,0);assert.equal(z.body.collidable,false);assert.equal(s.players[0].kills,1);assert.equal(s.score,200);ticks(s);assert.equal(s.players[0].kills,1);assert(a.valid(s));
});
test('dying advances original five frames at.34, then51 dead callbacks retain the actor until next disposal',()=>{
 const s=arena(),z=enemy(s,0);ticks(s);assert.equal(z.body.phase,'dying');const born=s.tick;for(let n=1;n<=14;n++){ticks(s);close(z.body.frame,.34*n);assert.equal(z.body.floor,false);}ticks(s);assert.equal(s.tick,born+15);assert.equal(z.body.phase,'dead');assert.equal(z.body.counter,50);assert.equal(z.body.floor,true);assert.equal(z.body.frame,0);assert(s.sounds.some(e=>e.name==='Creature.HitFloor.wav'));
 ticks(s,26);assert.equal(z.body.counter,24);assert.equal(z.body.alpha,1);ticks(s);close(z.body.alpha,24/25);ticks(s,24);assert.equal(z.body.phase,'disposed');assert.equal(z.body.disposeAt,s.tick+1);assert(s.zombies.includes(z));ticks(s);assert(!s.zombies.includes(z));assert(a.valid(s));
});
test('player reset occurs on native marker respawn after15 dying,101 dead and26 retry callbacks',()=>{
 const s=arena(),p=s.players[0];p.unlocked[1]=true;p.inventory[1]=73;p.weapon=1;p.ammo=73;p.hp=0;ticks(s);assert.equal(p.body.phase,'dying');assert.equal(p.deaths,1);assert.equal(p.alive,false);assert.equal(p.ammo,73);ticks(s,15);assert.equal(p.body.phase,'dead');assert.equal(p.body.counter,100);ticks(s,100);assert.equal(p.body.phase,'dead');ticks(s);assert.equal(p.body.phase,'respawn');assert.equal(p.body.counter,25);ticks(s,25);assert.equal(p.alive,false);ticks(s);assert.equal(p.alive,true);assert.equal(p.body.phase,'control');assert.equal(p.hp,200);assert.equal(p.weapon,0);assert.equal(p.inventory[1],0);assert.equal(p.invul,124);assert.equal(p.deaths,1);
 const map=world.room(s);assert([...map.playerSpawns,...map.otherSpawns].some(v=>v.x===p.x&&v.y===p.y));assert(a.valid(s));
});
test('all-player defeat waits until the original dead fade notification rather than ending at the lethal callback',()=>{
 const s=arena();s.players.forEach(p=>p.hp=0);ticks(s);assert(s.players.every(p=>!p.alive));assert.equal(s.phase,'playing');ticks(s,15+76);assert.equal(s.phase,'playing');ticks(s);assert.equal(s.phase,'finished');assert.equal(s.winner,0);assert(s.players.every(p=>p.deaths===1));
});
test('respawn runs its first native control callback with the previous weapon before FIRE renewal and finite-ammo reset',()=>{
 const s=arena(),p=s.players[0];p.alive=false;p.hp=0;p.unlocked[1]=true;p.inventory[1]=10;p.weapon=1;p.ammo=10;Object.assign(p.body,{phase:'respawn',counter:0,action:'dead',alpha:0,deadFlag:true,floor:true,collidable:false,affectEnabled:false,loggedKill:true});
 ticks(s,1,[input(1,{attack:1,trigger:true})]);assert(p.alive);assert.equal(p.hp,200);assert.equal(p.weapon,0);assert.equal(p.inventory[1],0);assert.equal(p.ammo,-1);assert.equal(p.invul,124);const shot=s.bullets.find(b=>b.owner===1);assert.equal(shot.weapon,1);assert.equal(shot.damage,35);close(shot.x,p.x);close(shot.y,p.y);assert.equal(shot.z,0);assert.equal(p.poseAction,'uzi-stand');assert.equal(p.drawAction,'stand');assert(!p.firePressed&&!p.fireReleased&&!p.fireTap);assert(a.valid(s));
});
test('occupied original respawn markers keep retrying each callback without a whole-map teleport or timer reset',()=>{
 const s=arena(),p=s.players[0],map=world.room(s);p.alive=false;p.hp=0;p.deaths=1;Object.assign(p.body,{phase:'respawn',counter:0,action:'dead',alpha:0,deadFlag:true,floor:true,collidable:false,affectEnabled:false,loggedKill:true});
 s.barrels=[...map.playerSpawns,...map.otherSpawns].map(v=>({id:++s.nextId,...v,z:0,kind:'barrel',hp:1,damage:100,owner:0,armed:0,exploded:false,registered:true,objectPhase:'normal',radius:13.44,collidable:true,barrelAffects:[]}));
 ticks(s,5);assert.equal(p.body.counter,-5);assert.equal(p.alive,false);assert.equal(p.x,144);assert.equal(p.y,272);assert(a.valid(s));s.barrels=[];ticks(s);assert(p.alive);assert.equal(p.body.phase,'control');assert.equal(p.hp,200);assert([...map.playerSpawns,...map.otherSpawns].some(v=>v.x===p.x&&v.y===p.y));assert(a.valid(s));
});
test('invincibility consumes queued affects without changing health, animation, velocity or hit timestamp',()=>{
 const s=arena(),p=s.players[0];p.invul=1;hit(s,p);ticks(s);assert.equal(p.hp,200);assert.equal(p.hitAt,-99);assert.equal(p.body.phase,'control');assert.equal(p.invul,0);assert.equal(p.body.affects.length,0);ticks(s);assert.equal(p.hp,200);
});
test('fatal knockback cannot consume a health pickup to undo its dead flag',()=>{
 const s=arena(),p=s.players[0];p.hp=20;hit(s,p);s.pickups=[{id:++s.nextId,x:p.x,y:p.y,life:250,born:0}];ticks(s);assert.equal(p.hp,-6);assert.equal(p.body.deadFlag,true);assert.equal(s.pickups.length,1);
});
test('full and delta recovery preserve queued affects, hit velocity, death animation, corpse fades and delayed respawn',()=>{
 const s=arena(),z=enemy(s,20);hit(s,z);hit(s,s.players[0],50,'melee');const recovered=JSON.parse(JSON.stringify(s));let client=protocol.applyUpdate(null,protocol.createUpdate(null,s,1000)),before=JSON.parse(JSON.stringify(s));assert.deepEqual(client,s);
 for(let i=0;i<180;i++){ticks(s);ticks(recovered);assert.deepEqual(s,recovered);client=protocol.applyUpdate(client,protocol.createUpdate(before,s,1000+s.tick*40));assert.deepEqual(client,s);assert(a.valid(s));before=JSON.parse(JSON.stringify(s));}
});
test('snapshots reject missing and malformed creature phases, hit queues, fades, masses and pending selections',()=>{
 const s=arena();enemy(s);assert(a.valid(s));for(const edit of [s=>delete s.players[0].body,s=>s.players[0].body.phase='other',s=>s.players[0].body.vx=NaN,s=>s.players[0].body.alpha=2,s=>s.players[0].body.mass=1,s=>s.players[0].body.damageSample=4,s=>s.players[0].selectionPending=1,s=>s.players[0].selectionWeapon=10,s=>s.zombies[0].body.radius=11,s=>s.zombies[0].body.disposeAt=s.tick,s=>s.players[0].body.affects=[{kind:'other'}]]){const bad=JSON.parse(JSON.stringify(s));edit(bad);assert(!a.valid(bad));}
});
