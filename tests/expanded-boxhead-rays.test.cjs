'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),source=require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(name,module);m.paths=module.paths;m._compile(source,name);return m.exports;}
const a=load('../src/expanded/boxhead.ts').adapter,rays=load('../src/expanded/boxhead-rays.ts'),shots=load('../src/expanded/boxhead-shots.ts'),world=load('../src/expanded/boxhead-world.ts');
const walls=load('../src/expanded/boxhead-walls.ts'),reg=load('../src/expanded/boxhead-registration.ts'),protocol=load('../src/authority/protocol.ts'),attach=require('./helpers/boxhead-enemy.cjs');
const input=(seq,patch={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...patch});
function arena(){const s=a.create(1,true,[1,2],42);s.waveReady=0;s.spawnLeft=1;s.nextSpawn=1e9;s.barrels=[];s.pickups=[];Object.assign(s.players[0],{x:144,y:272,dir:0});Object.assign(s.players[1],{x:624,y:464,invul:0});return s;}
function ticks(s,n=1,controls=[]){for(let i=0;i<n;i++)a.step(s,controls);}
function equip(s,index){const p=s.players[0];p.weapon=index;p.unlocked[index]=true;p.inventory[index]=world.weaponStats(s,index).ammo;p.ammo=p.inventory[index];return p;}
function target(s,x,y,hp=100){const z=attach(s,{id:++s.nextId,x,y,hp,devil:false,attack:0,dir:Math.PI,owner:0,hitAt:-99,attackAt:-99});s.zombies.push(z);return z;}
function wall(s,x,y){const b={id:++s.nextId,x,y,z:0,kind:'wall',owner:0,armed:0,exploded:false,...walls.wallState(),...reg.objectRegistration(),registered:true,objectPhase:'normal',collidable:true,radius:.48*32};s.barrels.push(b);return b;}
const close=(x,y)=>assert(Math.abs(x-y)<1e-9,`${x} != ${y}`);

test('native ray clips to exact map edges, including diagonals and the final short-step rectangle',()=>{
 const s=arena(),p1={x:144,y:272};assert.deepEqual(rays.collideLine(s,0,p1,{x:944,y:272},true),{type:'wall',x:672,y:272});
 assert.deepEqual(rays.collideLine(s,0,p1,{x:-40,y:88},true),{type:'wall',x:32,y:160});
 assert.deepEqual(rays.collideLine(s,0,{x:660,y:272},{x:680,y:272},true),{type:'wall',x:672,y:272});
 assert.equal(rays.collideLine(s,0,p1,{x:400,y:272},true),null);
});

test('thing ray uses strict infinite-line distance with cell bounds, without adding the query radius',()=>{
 const s=arena(),z=target(s,240,272+14.4000001),p1={x:144,y:272},p2={x:400,y:272};
 assert.equal(rays.collideLine(s,s.players[0].id,p1,p2),null);z.y-=.01;
 const hit=rays.collideLine(s,s.players[0].id,p1,p2);assert.equal(hit.thing,z);close(Math.hypot(hit.x-z.x,hit.y-z.y),14.4);
 assert.equal(rays.lineDistanceSquared({x:0,y:0},{x:10,y:0},{x:-100,y:4}),16);
 z.x=135;z.y=272;assert.equal(rays.collideLine(s,s.players[0].id,p1,p2).thing,z,'native expanded starting cell can include a target behind the origin');
});

test('same-cell query selects the first native object rather than globally sorting circle entry distances',()=>{
 const s=arena(),first=target(s,240,272),newer=target(s,248,272),hit=rays.collideLine(s,s.players[0].id,{x:144,y:272},{x:400,y:272});
 assert.equal(hit.thing,newer);assert.notEqual(hit.thing,first);close(hit.x,248-14.4);
 newer.body.affectEnabled=false;assert.equal(rays.collideLine(s,s.players[0].id,{x:144,y:272},{x:400,y:272}).thing,first);
});

test('firing constructs a full-range ray; damage waits for Init and tracer drifts for two callbacks before disposal',()=>{
 const s=arena(),p=s.players[0],q=s.players[1];q.x=240;q.y=272;ticks(s,1,[input(1,{attack:1})]);const b=s.bullets[0],initial={...b};
 assert.equal(q.hp,200);assert.equal(q.body.affects.length,0);assert.equal(b.rayPhase,'init');close(b.tx,b.x+256);assert(a.valid(s));
 ticks(s);assert.equal(q.hp,174);assert.equal(b.rayPhase,'normal');assert.equal(b.life,1);close(b.x,initial.x+initial.vx*.75);close(b.z,initial.z+initial.vz*.75);close(b.tz,initial.tz+initial.vz*.375);assert(b.tx<q.x);assert(a.valid(s));
 ticks(s);assert.equal(b.rayPhase,'delete');assert.equal(b.life,0);assert(s.bullets.includes(b));close(b.z,initial.z+initial.vz*(.75+.75**2));assert(a.valid(s));
 ticks(s);assert(!s.bullets.includes(b));assert.equal(q.hp,174);
});

test('UZI keeps the requested direction and consumes randomness only for native tracer drift',()=>{
 const s=arena(),p=equip(s,1);p.dir=Math.PI/4;const seed=s.rng;ticks(s,1,[input(1,{attack:1})]);const b=s.bullets[0];assert.equal(b.angle,p.dir);
 close((b.tx-b.x)/(b.ty-b.y),1);let expected=seed;for(let i=0;i<2;i++)expected=(Math.imul(expected,1664525)+1013904223)>>>0;assert.equal(s.rng,expected);
 assert.equal(p.ammo,99);
});

test('upgraded shotgun constructs center and symmetric pairs with the outer pair delayed one additional callback',()=>{
 const s=arena();s.peakCombo=100;const p=equip(s,2);ticks(s,1,[input(1,{attack:1})]);const spacing=3.75*Math.PI/180;
 assert.deepEqual(s.bullets.map(b=>b.angle),[0,-spacing,spacing,-2*spacing,2*spacing]);assert.deepEqual(s.bullets.map(b=>b.rayPhase),['init','init','init','delay','delay']);
 const outer=s.bullets.slice(3).map(b=>({...b}));ticks(s);assert.deepEqual(s.bullets.map(b=>b.life),[1,1,1,2,2]);assert(s.bullets.slice(3).every((b,i)=>b.x===outer[i].x&&b.z===outer[i].z&&b.rayPhase==='init'));
 ticks(s);assert.deepEqual(s.bullets.map(b=>b.life),[0,0,0,1,1]);assert(a.valid(s));ticks(s);assert.equal(s.bullets.length,2);assert(s.bullets.every(b=>b.rayPhase==='delete'));ticks(s);assert.equal(s.bullets.length,0);assert.equal(p.ammo,79);
});

test('railgun affects destructible walls and all creatures on its beam, while static map walls clip it',()=>{
 const s=arena(),p=equip(s,9),b=wall(s,208,272),z=target(s,272,272),q=s.players[1];q.x=336;q.y=272;
 ticks(s,1,[input(1,{attack:1})]);assert.equal(b.hp,1000);ticks(s);assert.equal(b.hp,900);assert.equal(z.hp,0);assert.equal(q.hp,100);assert(a.valid(s));
 const t=arena(),r=equip(t,9);t.mapId='original-04';r.x=240;r.y=304;const behind=target(t,400,304);ticks(t,2,[input(1,{attack:1})]);assert.equal(behind.hp,100);assert(t.bullets[0].tx<289);
});

test('normal bullet collisions choose native hit-wall samples even for creatures; railgun does not',()=>{
 const s=arena(),p=s.players[0];target(s,240,272);shots.rayShot(s,p,{x:144,y:272,z:10},0,26,8,()=>0);s.tick=1;const events=[],effects=[];
 shots.stepRay(s,s.bullets[0],{random:()=>0,damage:()=>{},sound:n=>events.push(n),effect:(...args)=>effects.push(args)});
 assert.deepEqual(events,['Shot.HitWall.1.wav']);assert.equal(effects[0][0],'Effect.BulletHit');assert.equal(effects[0][3],14);assert.equal(effects[0][4].z,10);
 const t=arena(),r=equip(t,9);shots.rayShot(t,r,{x:144,y:272,z:10},0,100,100,()=>0);shots.stepRay(t,t.bullets[0],{random:()=>0,damage:()=>{},sound:()=>assert.fail(),effect:()=>assert.fail()});
});

test('rocket accelerates before its first Move, retains source height, has no fuse countdown and explodes before moving into the contact',()=>{
 const s=arena(),p=equip(s,7);ticks(s,1,[input(1,{attack:1})]);const b=s.bullets[0],initial={...b};assert.equal(b.life,1);
 ticks(s);close(b.x,initial.x+17.6);close(b.z,initial.z);assert.equal(b.life,1);const before={...b};
 wall(s,b.x+32,b.y);ticks(s);assert(!s.bullets.includes(b));assert.equal(s.explosions.length,1);const e=s.explosions[0];close(e.x,before.x);close(e.y,before.y);close(e.z,before.z);assert.equal(e.born,s.tick);assert(!s.effects.some(e=>e.kind==='Effect.Explosion'));
 ticks(s);assert(s.effects.some(e=>e.kind==='Effect.Explosion'));assert(a.valid(s));
});

test('rocket smoke uses native random chance, full scale, backward acceleration and six animation callbacks',()=>{
 const s=arena(),p=equip(s,7),effects=[];const b={x:144,y:272,z:14,vx:16,vy:0,angle:0,parent:p.id};
 shots.stepRocket(s,b,{random:()=>.9,damage:()=>{},sound:()=>{},effect:(kind,x,y,life,extra)=>effects.push({id:++s.nextId,kind,x,y,life,total:life,born:s.tick,...extra})});
 assert.equal(effects.length,1);const e=effects[0];assert.equal(e.life,7);assert.equal(e.z,14);assert.equal(e.vx,-16);assert.equal(e.scale,undefined);s.effects=effects;
 ticks(s);close(e.x,144-19.2);close(e.vx,-19.2);ticks(s,5);assert(s.effects.includes(e));assert.equal(e.life,1);ticks(s);assert(!s.effects.includes(e));assert(a.valid(s));
});

test('full and delta snapshots recover every ray phase and rocket motion without reapplying or losing a hit',()=>{
 const s=arena();s.peakCombo=100;equip(s,2);target(s,272,272,2000);ticks(s,1,[input(1,{attack:1})]);
 const phases=new Set();for(let stage=0;stage<5;stage++){
  for(const b of s.bullets)phases.add(b.rayPhase);
  const base=JSON.parse(JSON.stringify(s)),full=protocol.createUpdate(null,s,100+stage,true);let recovered=protocol.applyUpdate(null,JSON.parse(JSON.stringify(full)));assert(recovered);assert(a.valid(recovered));assert.deepEqual(recovered,s);
  ticks(s);ticks(recovered);assert.deepEqual(recovered,s);
  const delta=protocol.createUpdate(base,s,200+stage,false);assert.deepEqual(protocol.applyUpdate(base,JSON.parse(JSON.stringify(delta))),s);
 }
 assert.deepEqual([...phases].sort(),['delay','delete','init','normal']);
 const t=arena();equip(t,7);ticks(t,2,[input(1,{attack:1})]);const r=protocol.applyUpdate(null,JSON.parse(JSON.stringify(protocol.createUpdate(null,t,300,true))));assert(r);for(let i=0;i<20;i++){ticks(t);ticks(r);assert.deepEqual(r,t);assert(a.valid(r));}
});

test('authority rejects incomplete ray, drift, lifecycle, parent and smoke states',()=>{
 const s=arena();ticks(s,1,[input(1,{attack:1})]);assert(a.valid(s));
 for(const edit of [b=>delete b.ray,b=>delete b.tx,b=>b.tz=NaN,b=>b.vz=Infinity,b=>b.parent=0,b=>b.rayPhase='delay-bad',b=>b.life=1,b=>b.angle=NaN]){const bad=JSON.parse(JSON.stringify(s));edit(bad.bullets[0]);assert(!a.valid(bad));}
 const t=arena();equip(t,7);ticks(t,1,[input(1,{attack:1})]);for(const edit of [b=>b.life=100,b=>delete b.parent,b=>delete b.angle]){const bad=JSON.parse(JSON.stringify(t));edit(bad.bullets[0]);assert(!a.valid(bad));}
});

test('native nested rocket and bullet-hit sheets retain all3 and13 distinct frames, source filters and SVG registration',()=>{
 const fs=require('node:fs'),crypto=require('node:crypto'),{PNG}=require('pngjs'),art=require('../src/expanded/boxhead-shot-art.json'),data=require('../src/expanded/boxhead-data.json');
 assert.equal(art.sourceSha256,data.sourceSha256);assert.deepEqual(art.contentsSymbols,{'Shot.Rocket':672,'Effect.BulletHit':610});
 for(const [name,count]of [['Shot.Rocket',3],['Effect.BulletHit',13]]){
  const m=art.timelines[name],file=fs.readFileSync(path.resolve(__dirname,'../public/expanded/assets/boxhead',m.file)),png=PNG.sync.read(file);
  assert.equal(crypto.createHash('sha256').update(file).digest('hex'),m.sha256);assert.equal(m.frames,count);assert.equal(png.width,m.w*count);assert.equal(png.height,m.h);assert.equal(new Set(m.frameSha256).size,count);
  assert.deepEqual(data.objects[name],{file:m.file,frames:m.frames,w:m.w,h:m.h,x:m.x,y:m.y});
  const hashes=[];for(let f=0;f<count;f++){const frame=Buffer.alloc(m.w*m.h*4);for(let y=0;y<m.h;y++)png.data.copy(frame,y*m.w*4,(y*png.width+f*m.w)*4,(y*png.width+(f+1)*m.w)*4);hashes.push(crypto.createHash('sha256').update(frame).digest('hex'));}assert.deepEqual(hashes,m.frameSha256);
 }
});
