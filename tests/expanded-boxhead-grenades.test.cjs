'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),source=require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(name,module);m.paths=module.paths;m._compile(source,name);return m.exports;}
const a=load('../src/expanded/boxhead.ts').adapter,g=load('../src/expanded/boxhead-grenades.ts'),world=load('../src/expanded/boxhead-world.ts');
const walls=load('../src/expanded/boxhead-walls.ts'),registration=load('../src/expanded/boxhead-registration.ts'),explosions=load('../src/expanded/boxhead-explosions.ts'),protocol=load('../src/authority/protocol.ts'),placement=load('../src/expanded/boxhead-placement.ts');
const attach=require('./helpers/boxhead-enemy.cjs'),grenadeState=require('./helpers/boxhead-grenade.cjs');
const input=(seq,patch={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...patch}),close=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function arena(){const s=a.create(1,true,[1,2],42);s.progression.level.zombieCountdown=s.progression.level.devilCountdown=1e9;s.barrels=[];s.pickups=[];Object.assign(s.players[0],{x:144,y:400,dir:0});Object.assign(s.players[1],{x:624,y:464});return s;}
function ticks(s,n=1,controls=[]){for(let i=0;i<n;i++)a.step(s,controls);}
function equip(s){const p=s.players[0];p.unlocked[4]=true;p.weapon=4;p.inventory[4]=world.weaponStats(s,4).ammo;p.ammo=p.inventory[4];return p;}
function grenade(s,patch={}){const b={...grenadeState(s),id:++s.nextId,x:144,y:272,z:20,vx:20,vy:8,vz:0,weapon:4,owner:1,damage:150,life:30,bang:0,cluster:false,...patch};s.bullets.push(b);return b;}
function wall(s,x=176,y=272){const b={id:++s.nextId,x,y,z:0,kind:'wall',owner:0,armed:0,exploded:false,...walls.wallState(),...registration.objectRegistration(),registered:true,objectPhase:'normal',collidable:true,radius:13.44};s.barrels.push(b);return b;}

test('grenade waits for Init at its captured original weapon position before setting40px height, power and first gravity step',()=>{
 const s=arena(),p=equip(s);ticks(s,1,[input(1,{attack:1})]);const b=s.bullets[0],origin={x:b.x,y:b.y,z:b.z};
 assert.equal(b.grenadePhase,'init');assert.notEqual(b.z,40);assert.equal(b.grenadePower,.25);assert.equal(b.life,60);assert.equal(b.vx,0);assert.equal(b.radius,3.2);assert(a.valid(s));
 p.x+=64;p.dir=Math.PI;ticks(s);assert.equal(b.grenadePhase,'normal');assert.equal(b.life,59);close(b.x,origin.x+8);close(b.y,origin.y);close(b.z,42.08);close(b.vz,2.08);assert(a.valid(s));
});

test('oblique round-object contact reflects against the correction normal rather than flipping world axes',()=>{
 const s=arena(),b=grenade(s);wall(s);const sounds=[];g.stepGrenade(s,b,n=>sounds.push(n));
 close(b.vx,-1/13);close(b.vy,70/13);close(b.x,144-1/13);close(b.y,272+70/13);close(b.z,18.08);assert.deepEqual(sounds,['Shot.Grenade.Bounce.wav']);
});

test('the proposed height strictly gates one-cell objects, including their own placement elevation',()=>{
 for(const [height,objectZ,hit]of [[32,0,false],[31.999,0,true],[48,16,false],[47.999,16,true]]){
  const s=arena(),b=grenade(s,{z:height,vz:0}),w=wall(s);w.z=objectZ;assert.equal(g.bounceGrenade(s,b),hit);if(!hit)assert.equal(b.vx,20);
 }
});

test('native player and devil heights differ; parent, unregistered enemies and noncollidable corpses are excluded',()=>{
 const s=arena(),b=grenade(s,{z:48,vx:20,vy:8});const q=s.players[1];q.x=176;q.y=272;assert.equal(g.bounceGrenade(s,b),false);b.z=47.999;assert(g.bounceGrenade(s,b));
 const t=arena(),c=grenade(t,{z:54}),z=attach(t,{id:++t.nextId,x:176,y:272,hp:1000,devil:true,attack:0,dir:0,owner:0,hitAt:-99,attackAt:-99});t.zombies.push(z);assert(g.bounceGrenade(t,c));
 for(const patch of [{registered:false},{collidable:false}]){const u=arena(),d=grenade(u,{z:20});const enemy=attach(u,{id:++u.nextId,x:176,y:272,hp:100,devil:false,attack:0,dir:0,owner:0,hitAt:-99,attackAt:-99});u.zombies.push(enemy);if('registered'in patch)enemy.ai.registered=false;else enemy.body.collidable=false;assert.equal(g.bounceGrenade(u,d),false);}
 const u=arena(),d=grenade(u),parent=u.players[0];parent.x=176;parent.y=272;assert.equal(g.bounceGrenade(u,d),false);
});

test('temporary circle correction raises queryZ for later objects without altering actual vertical velocity',()=>{
 const s=arena(),b=grenade(s,{vx:16,vy:0,z:31}),first=wall(s,172,280);const reference={...b};assert(g.bounceGrenade(s,reference));
 const second=wall(s,164,272);first.id=++s.nextId; // Explicit unit enumeration: the oblique collider is newest.
 assert(first.id>second.id);assert(g.bounceGrenade(s,b));close(b.vx,reference.vx);close(b.vy,reference.vy);assert.equal(b.z,31);assert.equal(b.vz,0);
});

test('map resolution keeps native X/Y slide priority and reflects a blocked corner as a vector',()=>{
 const s=arena(),b=grenade(s,{x:36,y:272,z:40,vx:-8,vy:4});g.stepGrenade(s,b,()=>{});close(b.x,38);close(b.y,273);close(b.vx,2);close(b.vy,1);
 const t=arena(),c=grenade(t,{x:36,y:508,z:40,vx:-8,vy:8});g.stepGrenade(t,c,()=>{});close(c.vx,2);close(c.vy,-2);close(c.x,38);close(c.y,506);
});

test('growing radius and fading physical walls participate until actual collider disposal',()=>{
 const s=arena(),b=grenade(s),w=wall(s);w.hp=0;w.fadeAt=0;w.wallAlpha=80;assert(g.bounceGrenade(s,b));
 const t=arena(),c=grenade(t),v=wall(t);v.objectPhase='waiting';v.radius=null;v.collidable=false;assert.equal(g.bounceGrenade(t,c),false);
 const u=arena(),d=grenade(u),f=wall(u);f.objectPhase='growing';f.radius=1.6;assert.equal(g.bounceGrenade(u,d),false);
 f.radius=13.44;assert(g.bounceGrenade(u,d));
});

test('low rolling grenades reflect off a teammate without direct damage, and high trajectories clear the same teammate',()=>{
 const s=arena(),q=s.players[1];q.x=176;q.y=272;q.invul=0;const b=grenade(s);g.stepGrenade(s,b,()=>{});assert(b.vy>2);assert.equal(q.hp,200);assert.equal(q.body.affects.length,0);
 const t=arena(),p=t.players[1];p.x=176;p.y=272;const c=grenade(t,{z:60});g.stepGrenade(t,c,()=>{});assert.equal(c.x,164);assert.equal(c.y,280);close(c.z,58.08);assert.equal(c.vx,20);
});

test('ground impact damps all three components before circle contact, sound uses final3D speed, and small resting bounces are silent',()=>{
 const s=arena(),b=grenade(s,{x:320,y:272,z:1,vx:4,vy:2,vz:-8}),heard=[];g.stepGrenade(s,b,n=>heard.push(n));close(b.x,322);close(b.y,273);close(b.z,4.96);close(b.vx,2);close(b.vy,1);close(b.vz,4.96);assert.equal(heard.length,1);
 const c=grenade(s,{x:400,y:272,z:0,vx:0,vy:0,vz:0});g.stepGrenade(s,c,()=>assert.fail('subthreshold impact is silent'));assert.equal(c.z,0);assert.equal(c.vz,0);
});

test('last fuse callback still moves, retains terminal grenade through Delete and initializes explosion only next tick',()=>{
 const s=arena(),b=grenade(s,{x:320,y:272,z:10,vx:4,vy:2,vz:1,life:1});ticks(s);assert.equal(b.life,0);assert.equal(b.grenadePhase,'delete');assert(s.bullets.includes(b));assert.equal(s.explosions.length,1);
 const e=s.explosions[0];close(e.x,324);close(e.y,274);close(e.z,9.08);assert.equal(e.born,s.tick);assert(!s.effects.some(e=>e.kind==='Effect.Explosion'));assert(a.valid(s));
 ticks(s);assert(!s.bullets.includes(b));assert(s.effects.some(e=>e.kind==='Effect.Explosion'&&e.x===324&&e.y===274));assert(a.valid(s));
});

test('grenade Mapwho occupancy excludes newborn Init and includes terminal Delete until disposal',()=>{
 const s=arena(),p=s.players[0];g.grenadeShot(s,p,{x:320,y:272,z:0},.25,150,0,false);const b=s.bullets[0];assert.equal(placement.cellChildCount(s,b),0);
 ticks(s);assert.equal(placement.cellChildCount(s,b),1);b.life=1;ticks(s);assert.equal(b.grenadePhase,'delete');assert.equal(placement.cellChildCount(s,b),1);ticks(s);assert(!s.bullets.includes(b));
});

test('cluster constructors preserve native phase, height, radius, owner exclusion and fuse; they do not initialize like thrown grenades',()=>{
 const s=arena();explosions.queueExplosion(s,320,272,150,2,0,true,9);ticks(s);const b=s.bullets[0],before={...b};assert.equal(b.grenadePhase,'normal');assert.equal(b.grenadePower,null);assert.equal(b.parent,s.players[1].id);assert.equal(b.radius,3.2);assert(a.valid(s));
 ticks(s);assert.equal(b.life,before.life-1);close(b.z,9+16-1.92);assert.notEqual(b.z,40);close(b.x,320+before.vx);
});

test('complete and delta snapshots resume Init, flight, grounded motion, terminal Delete and live cluster motion exactly',()=>{
 const s=arena();equip(s);ticks(s,1,[input(1,{attack:1})]);let baseline=null,client=null;const phases=new Set();let sawGroundBounce=false;
 for(let i=0;i<64;i++){
  for(const b of s.bullets)phases.add(b.grenadePhase);
  const full=protocol.applyUpdate(null,JSON.parse(JSON.stringify(protocol.createUpdate(null,s,100+i,true))));assert(full);assert(a.valid(full));assert.deepEqual(full,s);
  if(baseline){client=protocol.applyUpdate(client,JSON.parse(JSON.stringify(protocol.createUpdate(baseline,s,200+i,false))));assert.deepEqual(client,s);}else client=full;
  const recovered=JSON.parse(JSON.stringify(full)),before=s.bullets[0]?.vz;ticks(s);ticks(recovered);assert.deepEqual(recovered,s);if(before<0&&s.bullets[0]?.vz>0)sawGroundBounce=true;baseline=full;
 }
 assert.deepEqual([...phases].sort(),['delete','init','normal']);assert(sawGroundBounce);
 const roll=arena();grenade(roll,{x:320,y:272,z:0,vx:2,vy:1,vz:0,life:5});for(let i=0;i<4;i++){const r=protocol.applyUpdate(null,JSON.parse(JSON.stringify(protocol.createUpdate(null,roll,300+i,true))));assert(r);ticks(roll);ticks(r);assert.deepEqual(roll,r);assert.equal(roll.bullets[0].z,0);}
 const t=arena();explosions.queueExplosion(t,320,272,150,2,0,true,9);ticks(t);const r=JSON.parse(JSON.stringify(t));for(let i=0;i<27;i++){ticks(t);ticks(r);assert.deepEqual(t,r);assert(a.valid(r));}
});

test('authority rejects missing phase, wrong pending velocities, invalid power, radius, ownerID and impossible terminal fuse',()=>{
 const s=arena();equip(s);ticks(s,1,[input(1,{attack:1})]);assert(a.valid(s));
 for(const edit of [b=>delete b.grenadePhase,b=>b.grenadePhase='delete',b=>b.grenadePower=1,b=>b.grenadePower=null,b=>b.radius=4,b=>b.parent=NaN,b=>b.angle=Infinity,b=>b.vx=8,b=>b.life=59]){const bad=JSON.parse(JSON.stringify(s));edit(bad.bullets[0]);assert(!a.valid(bad));}
 const t=arena();explosions.queueExplosion(t,320,272,150,2,0,true);ticks(t);for(const edit of [b=>b.grenadePhase='init',b=>b.grenadePower=.25,b=>b.life=24,b=>delete b.parent]){const bad=JSON.parse(JSON.stringify(t));edit(bad.bullets[0]);assert(!a.valid(bad));}
});
