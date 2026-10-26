'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),fs=require('node:fs'),crypto=require('node:crypto'),{PNG}=require('pngjs');
function load(file){const name=path.resolve(__dirname,file),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);return m.exports;}
const c=load('../src/badminton/core.ts'),cpu=load('../src/badminton/cpu.ts'),collision=load('../src/badminton/collision.ts'),art=require('../src/badminton/solo-art.json'),geometry=require('../src/badminton/actor-geometry.json'),fixture=require('./fixtures/badminton-solo-as2.json');
const close=(a,b,label)=>assert(Math.abs(a-b)<1e-9,`${label}: ${a} != ${b}`),names={hero:'p1',hero1p:'robot',...Object.fromEntries(Array.from({length:6},(_,i)=>['hero'+(i+2),'cpu-'+(i+1)]))};

test('native ball and robot particle slots coexist by depth across shared counter wrap, replacing only the same kind/depth',()=>{
 const p=load('../src/badminton/particles.ts'),s={tick:0,nextParticle:0,particles:[]};
 p.spawnTrail(s,10,20,()=>.25);const ball0=s.particles[0];s.nextParticle=0;p.spawnRobotTrail(s,30,40,()=>.25);const robot0=s.particles.find(p=>p.kind==='robot'&&p.id===0),robot1=s.particles.find(p=>p.kind==='robot'&&p.id===1);
 assert.deepEqual({case:'coexist',next:s.nextParticle,checks:[s.particles.includes(ball0),s.particles.includes(robot0),s.particles.includes(robot1),ball0.x===7.5&&robot0.x===28.5]},fixture.particleSlots[0]);
 s.nextParticle=999;p.spawnTrail(s,50,60,()=>.25);const ball999=s.particles.find(p=>p.kind==='ball'&&p.id===999);
 assert.deepEqual({case:'ball-wrap',next:s.nextParticle,checks:[ball999?.x===47.5,ball0.x===7.5&&s.particles.includes(ball0),robot0.x===28.5&&s.particles.includes(robot0)]},fixture.particleSlots[1]);
 s.nextParticle=999;p.spawnRobotTrail(s,70,80,()=>.25);
 assert.deepEqual({case:'robot-wrap',next:s.nextParticle,checks:[!s.particles.includes(robot0)&&s.particles.some(p=>p.kind==='robot'&&p.id===0&&p.x===68.5),s.particles.includes(robot1)&&robot1.x===28.5,s.particles.includes(ball0)&&ball0.x===7.5,s.particles.includes(ball999)&&ball999.x===47.5,s.particles.some(p=>p.kind==='robot'&&p.id===999)]},fixture.particleSlots[2]);assert.equal(s.particles.length,5);
});
test('all134 original actor racket getters and104service markers match f32/twip geometry, including short and special rackets',()=>{
 assert.equal(fixture.rackets.length,134);assert.equal(fixture.service.length,104);
 for(const r of fixture.rackets){const a=geometry.actors[names[r.name]].hitboxes[r.frame-1];assert.deepEqual(a.twips,r.twips,r.name+' '+r.frame);close(a.rotation,r.rotation,'angle');}
 for(const r of fixture.service){const a=geometry.actors[names[r.name]].service[r.frame-1];close(a.x,r.x,'marker x');close(a.y,r.y,'marker y');}
 assert.equal(geometry.actors['cpu-3'].service[3].y,-7.5);assert.equal(geometry.actors.robot.service[3].y,26.5);
});
test('all84 original shape/bounds edge queries match source winding and inverse rounding, including distinct left-wall boundaries',()=>{
 for(const p of fixture.shapes){assert.equal(collision.shapeContains(p.name,p.x,p.y),p.shape,JSON.stringify(p));assert.equal(collision.boundsContains(p.name,p.x,p.y),p.bounds,JSON.stringify(p));}
 for(const p of fixture.shapeBounds)assert.deepEqual(geometry.collisions[p.name].bounds,p.twips);
 assert(!collision.shapeContains('leftWall',26.5,376.25));assert(collision.shapeContains('leftWall',46.5,376.25));
});
test('all1376 original CPU callbacks match movement/pose, strict serve timer, persistent undefined branches, action order and random draws',()=>{
 for(const [index,{input:i,output:o}]of fixture.cpu.entries()){
  const p=c.createGame(42,true).players[1];Object.assign(p,{x:i.x,y:i.y,vy:i.vy,jumping:i.jump});Object.assign(p.racket,{ready:i.ready,active:i.active});const state={...cpu.cpuState(),numVar2:i.numVar2,swingVar:i.swingVar,swingVar2:i.swingVar2,chance3:i.chance3},actions=[];let draws=0;
  cpu.runCPU({tick:1,nowMs:i.now,level:i.level,paused:i.paused,pointOver:i.pointOver,serve:i.serve,servingSpot:i.spot,chance1:i.chance1,player:p,bird:i.bx===null?null:{x:i.bx,y:i.by,vx:i.vx,direction:i.direction},cpu:state},()=>{draws++;return .25;},a=>actions.push(a));
  for(const key of ['x','y','vy'])close(p[key],o[key],index+' '+key);assert.equal(p.jumping,o.jump,index+' jump');assert.equal({normal:1,walkforward:13,walkbackward:23,walkdown:33,walkup:45}[p.motion],o.body,index+' pose');assert.equal(p.racket.frame,o.gun,index+' racket');assert.equal(p.racket.serveFrame,o.service,index+' service');
  for(const key of ['serveReady','numVar2','swingVar','swingVar2','chance3'])assert.deepEqual(state[key],o[key],index+' '+key);assert.equal(draws,o.randomCalls,index+' RNG');assert.equal(p.racket.servePlaying,o.serviceStarted,index+' play');assert.deepEqual(actions,o.actions,index+' actions');
 }
});
test('all42 original sheets/495frames retain native pixels, root alpha/filters and corrected PNG registration',()=>{
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');assert.equal(hash(fs.readFileSync(path.resolve(__dirname,'..',art.source))),art.sourceSha256);let count=0;
 for(const m of Object.values(art.exports)){const file=fs.readFileSync(path.resolve(__dirname,'../public/authority/assets/badminton',m.file)),png=PNG.sync.read(file);assert.equal(hash(file),m.sha256);assert.equal(png.width,m.w*m.frames);assert.equal(png.height,m.h);assert.equal(m.x,m.svgX-m.filterPadding[0]);assert.equal(m.y,m.svgY-m.filterPadding[1]);for(let f=0;f<m.frames;f++){const pixels=Buffer.alloc(m.w*m.h*4);for(let y=0;y<m.h;y++)png.data.copy(pixels,y*m.w*4,(y*png.width+f*m.w)*4,(y*png.width+(f+1)*m.w)*4);assert.equal(hash(pixels),m.frameSha256[f]);count++;}}
 assert.equal(count,495);assert.equal(Object.keys(art.exports).length,42);assert.equal(Object.keys(art.actors).length,9);
 for(const sound of Object.values(art.sounds)){const original=fs.readFileSync(path.resolve(__dirname,'..',sound.source)),shipped=fs.readFileSync(path.resolve(__dirname,'..',sound.path));assert.equal(hash(shipped),sound.sha256);assert.deepEqual(shipped,original);}
});
test('all32 original robot callbacks match mouse follow/bob, serve clamp, pause/finish, pose-only jump and native trail spawn',()=>{
 const robot=load('../src/badminton/robot.ts'),particles=load('../src/badminton/particles.ts');
 for(const [index,{input:i,output:o,trails}]of fixture.robots.entries()){
  const p=c.createGame(42,true).players[0];Object.assign(p,{x:i.x,y:i.y});const r={phase:i.phase},world={tick:1,particles:[],nextParticle:0};let calls=0;
  robot.runRobot({tick:1,started:true,paused:i.paused,over:i.over,serve:i.serve,player:p,robot:r,pointer:{x:i.pointer[0],y:i.pointer[1]},hit:i.mouse,jump:i.space},(x,y)=>particles.spawnRobotTrail(world,x,y,()=>{calls++;return .25;}));
  for(const key of ['x','y','vy'])close(p[key],o[key],index+' '+key);close(r.phase,o.phase,index+' phase');assert.equal(p.jumping,o.jump);assert.equal({normal:1,walkbackward:12,walkforward:23,walkup:32,walkdown:43}[p.motion],o.body);assert.equal(p.racket.frame,o.gun);assert.equal(p.racket.serveFrame,o.service);assert.equal(calls,o.randomCalls);assert.equal(world.particles.length,o.particles);
  for(const [j,t]of trails.entries())for(const key of ['x','y','vx','vy','rotation','width'])close(world.particles[j][key],t[key],index+' trail'+j+' '+key);
 }
});
