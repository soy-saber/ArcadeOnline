'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);return m.exports;}
const {birdie,fly}=load('../src/badminton/ball.ts'),particles=load('../src/badminton/particles.ts'),fixture=require('./fixtures/badminton-as2.json');
const close=(a,b,label)=>assert(Math.abs(a-b)<1e-9,`${label}: ${a} != ${b}`);

test('computed native matrices and44hitbox/angle getters match the independent AS2 runtime queries',()=>{
 const geometry=require('../src/badminton/geometry.json');let count=0;
 for(const [seat,keys]of [[1,['p1-swing','p1-underhand']],[2,['p2-swing']]])for(const key of keys)for(const p of geometry.timelines[key]){const native=fixture.geometry.rackets[seat].find(r=>r.frame===p.frame);assert.deepEqual(p.native.twips,native.twips);close(p.native.rotation,native.rotation,key+' '+p.frame);assert(native.minInclusive&&native.maxInclusive);count++;}assert.equal(count,44);
});

test('whole native service callback trace matches the authoritative birth delay, movement, clip flags and independent body phase',()=>{
 const core=load('../src/badminton/core.ts'),motion=load('../src/badminton/motion.ts'),state=core.createGame(42,true);
 const pressed=fixture.callbackTraces.filter(s=>s.startsWith('CONTROL|')).map(s=>s.split('|')).find(r=>r[2]==='true');const start=Number(pressed[1]),samples=new Map(fixture.snapshots.map(s=>[s.heroCallbacks,s]));assert(start>0);assert(samples.size>40);
 for(let tick=1;tick<=Math.max(...samples.keys());tick++){
  core.step(state,[{...core.EMPTY_INPUT,seq:tick,hit:tick>=start?1:0,hitHeld:tick>=start},{...core.EMPTY_INPUT,seq:tick}]);const n=samples.get(tick);if(!n)continue;
  const r=state.players[0].racket;assert.equal(r.frame,n.gun,tick+' gun');assert.equal(r.serveFrame,n.serveGun,tick+' service');assert.equal(r.ready,n.ready,tick+' ready');assert.equal(r.active,n.swing,tick+' swing');assert.equal(state.serve,n.serve,tick+' root.serve');assert.equal(motion.bodyPose(1,state.players[0],tick).frame,n.body,tick+' body');
  if(n.birdX!==undefined)for(const [key,native]of [['x','birdX'],['y','birdY'],['vx','birdVx'],['vy','birdVy']])close(state.birdie[key],n[native],tick+' '+key);
 }
});

test('all107 isolated original-AS2 vectors match native quantized motion, equality flags, pre-collision rotation and ordered collisions',()=>{
 assert.equal(fixture.balls.length,107);
 for(const [index,vector]of fixture.balls.entries()){
  const {input:i,output:o}=vector,b=birdie(i.x,i.y,i.vx,i.vy);for(const key of ['leftSide','rightSide','topSide','bottomSide'])if(i[key]!==undefined)b[key]=i[key];let netHits=0,trails=0,score=[0,0];
  fly(b,{random:()=>i.random,trail:()=>trails++,net:()=>netHits++,ground:()=>score[b.x<275?1:0]++});
  for(const key of ['x','y','vx','vy','rotation','speed'])close(b[key],o[key],index+' '+key);
  for(const key of ['leftSide','rightSide','topSide','bottomSide'])assert.equal(b[key],o[key],index+' '+key);
  assert.equal(netHits,o.netHits,index+' net');assert.equal(trails,o.trails,index+' trails');assert.deepEqual(score,o.score,index+' score');
 }
});

test('source particle trace retains opacity while moving/rotating/shrinking and deletes at the original rotated-width threshold',()=>{
 const s={tick:0,particles:[],nextParticle:0};particles.spawnTrail(s,100,100,()=>.25);const rows=fixture.particleRows;assert.equal(rows.length,18);
 for(const row of rows){const p=s.particles[0];assert(p);for(const key of ['x','y','rotation','scale','width'])close(p[key],row[key],row.age+' '+key);assert.equal(row.alpha,100);s.tick++;particles.advanceTrails(s);}
 assert.equal(s.tick,fixture.particleDeathAge);assert.equal(s.particles.length,0);
});

test('new particles keep their source initial transform for one callback and wrap the native1000depth slots',()=>{
 const s={tick:12,particles:[],nextParticle:999};particles.spawnTrail(s,10,20,()=>.25);const first={...s.particles[0]};particles.advanceTrails(s);assert.deepEqual(s.particles[0],first);assert.equal(s.nextParticle,0);particles.spawnTrail(s,20,30,()=>.75);assert.equal(s.particles[1].id,0);s.tick++;particles.advanceTrails(s);assert.notEqual(s.particles[0].x,first.x);
});

test('36 original contact cases preserve cached angles, source multiply order and independent reset/hit flags',()=>{
 const c=load('../src/badminton/core.ts'),g=load('../src/badminton/geometry.ts');assert.equal(fixture.contacts.length,36);
 for(const {input:i,output:o} of fixture.contacts){
  const s=c.createGame(42,true);s.serve=0;s.rally='flight';s.birdie=c.birdie(100,100,3,2,i.seat);s.birdie.contactBy=i.priorHit;
  const p=s.players[i.seat-1],bounds=g.racketFramePose(i.seat,3).bounds;p.x=100-(bounds[0]+bounds[2])/2;p.y=100-(bounds[1]+bounds[3])/2;
  Object.assign(p.racket,{frame:2,playing:true,active:true,ready:false,angle:i.angle});c.step(s,[]);
  for(const key of ['x','y','vx','vy','rotation'])close(s.birdie[key],o[key],JSON.stringify(i)+' '+key);
  assert.equal(s.hits,o.hits);assert.equal(s.birdie.contactBy,o.p1Hit?1:o.p2Hit?2:0);assert.equal(p.racket.consumed,o.hits>0);
 }
});

test('normal controls carry native particles/net/random/contact state through full and delta recovery',()=>{
 const c=load('../src/badminton/core.ts'),protocol=load('../src/authority/protocol.ts'),s=c.createGame(42,true);let client=JSON.parse(JSON.stringify(s)),netAt=0;
 for(let n=1;n<=130;n++){
  const inputs=[{...c.EMPTY_INPUT,seq:n,hit:n>=30?1:0},{...c.EMPTY_INPUT,seq:n,right:n<=15,hit:n>=68?1:0}],before=JSON.parse(JSON.stringify(s)),recovered=JSON.parse(JSON.stringify(client));
  c.step(s,inputs);c.step(recovered,inputs);assert.deepEqual(recovered,s);client=protocol.applyUpdate(client,JSON.parse(JSON.stringify(protocol.createUpdate(before,s,n,n%7===0))));assert.deepEqual(client,s);assert(c.validState(s));
  if(s.net.hits&&!netAt)netAt=s.net.at;
  if(netAt&&s.tick<netAt+12)assert.equal(s.net.frame,s.tick-netAt+1);
  if(netAt&&s.tick===netAt+12){assert.equal(s.net.frame,1);assert(!s.net.playing);}
 }
 assert.equal(netAt,79);assert.equal(s.net.hits,1);assert(s.hits>=2);
 for(const edit of [s=>delete s.birdie.contactBy,s=>s.birdie.contactBy=3,s=>s.birdie.leftSide=s.birdie.rightSide=true,s=>s.birdie.rotation=NaN,s=>s.net.frame=13,s=>s.net.at=s.tick+1,s=>s.rng=-1,s=>s.particles=[null],s=>s.particles=[{id:1}],s=>s.nextParticle=1000,s=>s.players[0].racket.angle=NaN]){const bad=JSON.parse(JSON.stringify(s));edit(bad);assert.equal(c.validState(bad),false);}
});

test('native net/filter layers/trail keep original pixels and PNG filter padding in registration',()=>{
 const fs=require('fs'),crypto=require('crypto'),{PNG}=require('pngjs'),art=require('../src/badminton/ball-art.json'),g=require('../src/badminton/geometry.json'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 assert.equal(hash(fs.readFileSync(path.resolve(__dirname,'..',art.source))),art.sourceSha256);assert.equal(art.art.net.frames,12);assert.deepEqual(art.art.net.filterPadding,[7,2]);assert.deepEqual(art.art['bird-glow'].filterPadding,[5,5]);assert.deepEqual(art.art['bird-shadow'].filterPadding,[10,10]);assert.deepEqual(art.art.trail.filterPadding,[2,2]);
 for(const m of Object.values(art.art)){
  const file=fs.readFileSync(path.resolve(__dirname,'../public/authority/assets/badminton',m.file)),png=PNG.sync.read(file);assert.equal(hash(file),m.sha256);assert.equal(png.width,m.w*m.frames);assert.equal(png.height,m.h);assert.equal(m.x,m.svgX-m.filterPadding[0]);assert.equal(m.y,m.svgY-m.filterPadding[1]);
  for(let f=0;f<m.frames;f++){const pixels=Buffer.alloc(m.w*m.h*4);for(let y=0;y<m.h;y++)png.data.copy(pixels,y*m.w*4,(y*png.width+f*m.w)*4,(y*png.width+(f+1)*m.w)*4);assert.equal(hash(pixels),m.frameSha256[f]);}
  if(m.file==='bird-shadow.png'){let opaque=0;for(let p=0;p<png.data.length;p+=4){assert.equal(png.data[p]+png.data[p+1]+png.data[p+2],0);opaque+=png.data[p+3];}assert(opaque>0);}
 }
 for(const m of Object.values(g.art)){assert.equal(m.x,m.svgX-m.filterPadding[0]);assert.equal(m.y,m.svgY-m.filterPadding[1]);}
 assert.equal(hash(fs.readFileSync(path.resolve(__dirname,'../public/authority/assets/badminton/court.png'))),art.court.sha256);
 close(art.shadowOffset[0],Math.cos(.7853851318359375)*5,'shadow x');close(art.shadowOffset[1],Math.sin(.7853851318359375)*5,'shadow y');
});
