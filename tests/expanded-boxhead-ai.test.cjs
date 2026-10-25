'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),attachEnemy=require('./helpers/boxhead-enemy.cjs');
function load(file){const name=path.resolve(__dirname,file),source=require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(name,module);m.paths=module.paths;m._compile(source,name);return m.exports;}
const a=load('../src/expanded/boxhead.ts').adapter,ai=load('../src/expanded/boxhead-ai.ts'),nav=load('../src/expanded/boxhead-navigation.ts'),world=load('../src/expanded/boxhead-world.ts'),walls=load('../src/expanded/boxhead-walls.ts'),reg=load('../src/expanded/boxhead-registration.ts'),protocol=load('../src/authority/protocol.ts');
const close=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} vs ${b}`);
function arena(){const s=a.create(1,true,[1],17,'original-01');s.waveReady=0;s.spawnLeft=1;s.nextSpawn=1e9;s.barrels=[];s.pickups=[];s.players[0].x=400;s.players[0].y=272;s.players[0].invul=100000;return s;}
function enemy(s,x=144,y=272,devil=false,entering=false){const z=attachEnemy(s,{id:++s.nextId,x,y,hp:devil?1000:100,devil,attack:0,dir:0,owner:0,hitAt:-99,attackAt:-99},entering);s.zombies.push(z);return z;}
function ticks(s,n=1){for(let i=0;i<n;i++)a.step(s,[]);}
function fireball(s,extra={}){const b={id:++s.nextId,x:144,y:272,z:26.88,vx:4.8,vy:0,owner:-1,parent:999,weapon:-1,damage:50,multiply:false,radius:8,animation:0,fireball:true,life:1,born:s.tick,...extra};s.bullets.push(b);return b;}

test('native entry registers on the next callback, reserves the entrance and becomes collidable only when it can enter',()=>{
 const s=arena(),z=enemy(s,16,272,false,true);assert.equal(z.ai.registered,false);ticks(s);assert.equal(z.x,16);assert.equal(z.ai.state,'enter');assert(z.ai.registered);assert(!z.ai.collidable);assert.equal(z.ai.entry,nav.cell(s,48,272));assert(s.enemyCells[nav.cell(s,16,272)]);ticks(s);assert.equal(z.ai.state,'cell');assert(z.ai.collidable);assert.equal(z.ai.reserved,nav.cell(s,48,272));assert(!s.enemyCells[nav.cell(s,16,272)]);assert.equal(z.x,16);ticks(s,49);close(z.x,47.36);ticks(s);assert.equal(z.x,48);assert.equal(z.ai.state,'goto');assert(a.valid(s));
});

test('an occupied entrance causes the source25-callback wait rather than a teleport to a nearby free position',()=>{
 const s=arena(),z=enemy(s,16,272,false,true),blocker=enemy(s,48,272);blocker.ai.state='wait';blocker.ai.counter=1000;ticks(s,2);assert.equal(z.ai.state,'wait');assert.equal(z.ai.counter,25);ticks(s,24);assert.equal(z.ai.state,'wait');assert.equal(z.x,16);ticks(s);assert.equal(z.ai.state,'enter');assert(!z.ai.collidable);assert(a.valid(s));
});

test('cell-to-cell movement reserves its destination before its body moves, and diagonal motion uses sqrt2 duration',()=>{
 const s=arena(),z=enemy(s);ticks(s);assert.equal(z.ai.state,'cell');assert.equal(z.ai.reserved,nav.cell(s,176,272));assert.equal(z.x,144);close(z.ai.counter,50);ticks(s);close(z.x,144.64);
 const t=arena(),p=t.players[0],q=enemy(t);p.x=400;p.y=528;q.dir=Math.PI/4;ticks(t);assert.equal(q.ai.state,'cell');close(q.ai.counter,Math.SQRT2/.02);ticks(t);close(Math.hypot(q.x-144,q.y-272),.64);assert(q.x>144&&q.y>272);assert(a.valid(t));
});

test('turning takes the native angular callbacks, then returns to goto before beginning movement',()=>{
 const s=arena(),p=s.players[0],z=enemy(s);p.x=144;p.y=400;ticks(s);assert.equal(z.ai.state,'turn');close(z.ai.counter,Math.PI/2/.2);ticks(s,7);assert.equal(z.ai.state,'turn');close(z.dir,1.4);assert.equal(z.x,144);ticks(s);assert.equal(z.ai.state,'goto');close(z.dir,Math.PI/2);ticks(s);assert.equal(z.ai.state,'cell');assert(a.valid(s));
});

test('a new direction immediately after returning from a turn enters the fractional FPS/3 sleep',()=>{
 const s=arena(),p=s.players[0],z=enemy(s);p.x=144;p.y=400;z.ai.previous='turn';ticks(s);assert.equal(z.ai.state,'sleep');close(z.ai.counter,25/3);assert.equal(z.ai.previous,'goto');ticks(s,8);assert.equal(z.ai.state,'sleep');ticks(s);assert.equal(z.ai.state,'goto');
});

test('zombie damage arrives after its four-frame attack animation, followed by a ten-callback sleep',()=>{
 const s=arena(),p=s.players[0],z=enemy(s);p.x=176;p.invul=0;ticks(s);assert.equal(z.ai.state,'attack');assert.equal(p.hp,200);ticks(s,17);assert.equal(p.hp,200);assert.equal(z.ai.state,'attack');ticks(s);assert.equal(p.hp,150);assert.equal(z.ai.state,'sleep');assert.equal(z.ai.counter,10);ticks(s,9);assert.equal(z.ai.state,'sleep');ticks(s);assert.equal(z.ai.state,'goto');assert(a.valid(s));
});

test('melee affects only the facing adjacent cell; walking out during the animation avoids the hit',()=>{
 const s=arena(),p=s.players[0],z=enemy(s);p.x=176;p.invul=0;ticks(s);assert.equal(z.ai.state,'attack');p.x=240;ticks(s,18);assert.equal(p.hp,200);assert.equal(z.ai.state,'sleep');
});

test('a zombie attack can affect a wall sharing the player cell, but does not invent a free-wall attack',()=>{
 const s=arena(),p=s.players[0],z=enemy(s);p.x=176;const b={id:++s.nextId,x:176,y:272,z:0,kind:'wall',owner:0,exploded:false,armed:0,...walls.wallState(),...reg.objectRegistration()};s.barrels=[b];ticks(s,19);assert.equal(b.hp,950);assert.equal(b.objectPhase,'normal');assert.equal(b.radius,null);assert(!b.collidable);assert.equal(z.ai.state,'sleep');assert(a.valid(s));
});

test('mine detection uses the reserved destination32px away before the creature body enters that cell',()=>{
 const s=arena(),z=enemy(s),b={id:++s.nextId,x:176,y:272,z:0,kind:'mine',hp:60,damage:100,owner:1,exploded:false,armed:0,animation:0,detonating:false,detonateAt:0};s.barrels=[b];ticks(s);assert.equal(z.x,144);assert.equal(z.ai.reserved,nav.cell(s,b.x,b.y));assert.equal(b.detonating,true);assert.equal(b.detonateAt,s.tick+50);assert(a.valid(s));
});

test('dead creatures release their reserved flag instead of leaving a permanent blocked tile or armed mine trigger',()=>{
 const s=arena(),z=enemy(s);ticks(s);const reserved=z.ai.reserved;assert(s.enemyCells[reserved]);z.hp=0;ticks(s);assert(!s.enemyCells[reserved]);assert.equal(s.zombies.length,0);assert(a.valid(s));
});

test('diagonal navigation includes both side cells; a noncollidable registered wall still blocks routing',()=>{
 const s=arena(),at=nav.cell(s,144,272);s.barrels=[{x:176,y:272,registered:true,kind:'wall',hp:1000}];assert(nav.realFlags(s,at,1)&nav.OBJECT);assert(nav.realFlags(s,at,0)&nav.OBJECT);assert(!(nav.realFlags(s,at,2)&nav.OBJECT));
});

test('native navigation spreads five layers per callback and preserves root/first-neighbor distance0',()=>{
 const s=arena(),p=s.players[0];p.x=144;p.y=272;s.tick=1;nav.stepNavigation(s);assert.equal(s.navigation.distances[nav.cell(s,144,272)],0);assert.equal(s.navigation.distances[nav.cell(s,176,272)],0);assert.equal(s.navigation.tags[nav.cell(s,304,272)],1);assert.equal(s.navigation.tags[nav.cell(s,336,272)],-1);assert.equal(s.navigation.phase,'resume');s.tick=2;nav.stepNavigation(s);assert.equal(s.navigation.tags[nav.cell(s,336,272)],1);assert(nav.validNavigation(s));
});

test('cached navigation limits ordinary full scans to five; forced devil scans bypass that cap',()=>{
 const s=arena(),at=nav.cell(s,144,272),n=s.navigation;s.tick=10;n.timer=10;n.tags[at]=10;n.distances[at]=0;for(let d=0;d<8;d++)n.distances[nav.adjacent(s,at,d)]=0;
 for(let i=0;i<5;i++)assert(nav.direction(s,at,0,0,false,()=>.5)>=0);assert.equal(nav.direction(s,at,0,0,false,()=>.5),-1);assert(nav.direction(s,at,0,0,true,()=>.5)>=0);assert.equal(n.fullScans,6);
});

test('devil ranged attacks require the native160px range and facing, and release only on entering animation frame3',()=>{
 const s=arena(),p=s.players[0],z=enemy(s,144,272,true);p.x=272;z.ai.canAttack=true;z.ai.fireRateCount=0;ticks(s);assert.equal(z.ai.state,'attack');assert.equal(s.bullets.length,0);ticks(s,9);assert.equal(s.bullets.length,0);ticks(s);const b=s.bullets[0];assert(b);assert.equal(b.fireball,true);assert.equal(b.multiply,false);assert.equal(b.parent,z.id);close(b.x,144+.42*32*1.5);close(b.y,272);close(b.z,.84*32);close(b.vx,4.8);assert.equal(b.born,s.tick);assert(a.valid(s));
 for(const [x,dir]of [[400,0],[272,Math.PI]]){const t=arena(),q=enemy(t,144,272,true);t.players[0].x=x;q.dir=dir;q.ai.canAttack=true;q.ai.fireRateCount=0;ticks(t);assert.notEqual(q.ai.state,'attack');assert.equal(t.bullets.length,0);}
});

test('normal devil line of sight passes ordinary walls but another registered devil can occlude it',()=>{
 const s=arena(),p=s.players[0],z=enemy(s,144,272,true);p.x=272;z.ai.canAttack=true;z.ai.fireRateCount=0;s.barrels=[{id:++s.nextId,x:208,y:272,z:0,kind:'wall',owner:0,exploded:false,armed:0,...walls.wallState(),...reg.objectRegistration(),registered:true,objectPhase:'normal',radius:13.44,collidable:true}];ticks(s);assert.equal(z.ai.state,'attack');
 const t=arena(),q=enemy(t,144,272,true);t.players[0].x=272;q.ai.canAttack=true;q.ai.fireRateCount=0;const blocker=enemy(t,208,272,true);blocker.ai.state='wait';blocker.ai.counter=1000;ticks(t);assert.notEqual(q.ai.state,'attack');
});

test('fireballs accelerate by1.02, retain original height and have no arbitrary40-callback fuse',()=>{
 const s=arena(),b=fireball(s,{x:100,y:400,vx:.01});ticks(s);close(b.x,100+.0102);close(b.vx,.0102);assert.equal(b.z,26.88);ticks(s,45);assert(s.bullets.includes(b));assert.equal(b.life,1);assert(a.valid(s));
});

test('normal fireball impact affects expanded grid cells at the old position, not only the touched player',()=>{
 const s=arena(),p=s.players[0];p.x=160;p.invul=0;const q={...p,seat:2,x:176,character:'bond',inventory:[...p.inventory],unlocked:[...p.unlocked]};s.players.push(q);const b=fireball(s);ticks(s);assert.equal(s.bullets.length,0);assert.equal(b.x,144);assert.equal(p.hp,150);assert.equal(q.hp,150);assert(!s.effects.some(e=>e.kind==='Effect.Explosion'));assert(a.valid(s));
});

test('object-clearing fireballs use10000 DevilAttack damage and do not directly damage players',()=>{
 const s=arena(),p=s.players[0];p.x=144;p.invul=0;const b={id:++s.nextId,x:176,y:272,z:0,kind:'wall',owner:0,exploded:false,armed:0,...walls.wallState(),...reg.objectRegistration(),registered:true,objectPhase:'normal',radius:13.44,collidable:true};s.barrels.push(b);fireball(s,{multiply:true,radius:32});ticks(s);assert.equal(p.hp,200);assert.equal(b.hp,-9000);assert.equal(b.wallAlpha,80);assert.equal(s.bullets.length,0);assert(a.valid(s));
});

test('clearing fireball physically collides with its parent and affects objects around its original spawn point',()=>{
 const s=arena(),z=enemy(s,144,272,true);z.ai.state='wait';z.ai.counter=100;s.players[0].x=400;const b=fireball(s,{parent:z.id,x:z.x+z.ai.radius*1.5,multiply:true,radius:32,vx:4.8}),x=b.x;
 const wall={id:++s.nextId,x:112,y:272,z:0,kind:'wall',owner:0,exploded:false,armed:0,...walls.wallState(),...reg.objectRegistration(),registered:true,objectPhase:'normal',radius:13.44,collidable:true};s.barrels.push(wall);ticks(s);assert.equal(b.x,x);assert.equal(s.bullets.length,0);assert.equal(wall.hp,-9000);assert.equal(z.hp,1000);assert(a.valid(s));
});

test('full and delta recovery retain turns, reserved flags, navigation frontier and devil attack phases deterministically',()=>{
 const s=arena();enemy(s);enemy(s,208,336,true);ticks(s,4);const recovered=JSON.parse(JSON.stringify(s));assert(a.valid(recovered));let client=protocol.applyUpdate(null,protocol.createUpdate(null,s,1000)),before=JSON.parse(JSON.stringify(s));
 for(let i=0;i<150;i++){ticks(s);ticks(recovered);assert.deepEqual(s,recovered);client=protocol.applyUpdate(client,protocol.createUpdate(before,s,1000+s.tick*40));assert.deepEqual(client,s);assert(a.valid(s));before=JSON.parse(JSON.stringify(s));}
});

test('snapshots reject missing or corrupt AI states, reservations, frames, navigation caches and fireball metadata',()=>{
 const s=arena();enemy(s);assert(a.valid(s));for(const edit of [s=>delete s.zombies[0].ai,s=>s.zombies[0].ai.state='other',s=>s.zombies[0].ai.reserved=-1,s=>s.zombies[0].ai.speed=0,s=>s.zombies[0].ai.frame=9,s=>s.zombies[0].ai.collidable=1,s=>s.enemyCells.pop(),s=>s.navigation.frontier=[-1],s=>s.navigation.tags[0]=s.tick+1,s=>s.navigation.distances[0]=Infinity]){const bad=JSON.parse(JSON.stringify(s));edit(bad);assert(!a.valid(bad));}
 const t=arena();fireball(t);assert(a.valid(t));for(const edit of [b=>b.radius=9,b=>b.parent=NaN,b=>b.animation=-1,b=>b.multiply=1,b=>b.life=40,b=>delete b.fireball]){const bad=JSON.parse(JSON.stringify(t));edit(bad.bullets[0]);assert(!a.valid(bad));}
});

test('fireball sheet contains all16 original nested frames with native filters and registration',()=>{
 const fs=require('node:fs'),crypto=require('node:crypto'),{PNG}=require('pngjs'),art=require('../src/expanded/boxhead-fireball-art.json'),data=require('../src/expanded/boxhead-data.json'),m=art.timelines['Effect.FireBall'];
 const source=fs.readFileSync(path.resolve(__dirname,'../games/50737/game.swf'));assert.equal(crypto.createHash('sha256').update(source).digest('hex'),art.sourceSha256);
 const file=fs.readFileSync(path.resolve(__dirname,'../public/expanded/assets/boxhead',m.file)),png=PNG.sync.read(file);assert.equal(crypto.createHash('sha256').update(file).digest('hex'),m.sha256);assert.equal(m.frames,16);assert.equal(art.fireballContentsSymbol,590);assert.equal(png.width,m.w*16);assert.equal(png.height,m.h);assert.deepEqual(data.objects['Effect.FireBall'],{file:m.file,frames:m.frames,w:m.w,h:m.h,x:m.x,y:m.y});
 const hashes=[];for(let f=0;f<16;f++){const frame=Buffer.alloc(m.w*m.h*4);for(let y=0;y<m.h;y++)png.data.copy(frame,y*m.w*4,(y*png.width+f*m.w)*4,(y*png.width+(f+1)*m.w)*4);hashes.push(crypto.createHash('sha256').update(frame).digest('hex'));}assert.deepEqual(hashes,m.frameSha256);assert.equal(new Set(hashes).size,16);
});
