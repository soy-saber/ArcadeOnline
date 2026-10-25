'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),fs=require('node:fs'),crypto=require('node:crypto'),{PNG}=require('pngjs');
function load(file){const name=path.resolve(__dirname,file),source=require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(name,module);m.paths=module.paths;m._compile(source,name);return m.exports;}
const core=load('../src/badminton/core.ts'),geometry=load('../src/badminton/geometry.ts'),protocol=load('../src/authority/protocol.ts'),data=require('../src/badminton/geometry.json');
const input=(seq,patch={})=>({...core.EMPTY_INPUT,seq,...patch}),close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function flight(){const s=core.createGame(42,true);s.rally='flight';s.serve=0;s.birdie.lastHitter=2;return s;}

test('native source hash, all44racket frames,26service markers and70filtered original images remain reproducible',()=>{
 const root=path.resolve(__dirname,'..');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,data.source))).digest('hex'),data.sourceSha256);
 assert.equal(data.timelines['p1-swing'].length,15);assert.equal(data.timelines['p2-swing'].length,15);assert.equal(data.timelines['p1-underhand'].length,14);assert.equal(Object.keys(data.art).length,70);
 for(const m of Object.values(data.art)){const file=fs.readFileSync(path.join(root,'public/authority/assets/badminton',m.file));assert.equal(crypto.createHash('sha256').update(file).digest('hex'),m.sha256);const png=PNG.sync.read(file);assert.equal(png.width,m.w);assert.equal(png.height,m.h);}
});

test('all native transparent hitbox corners compose into their recorded stage-axis bounding rectangles',()=>{
 for(const key of ['p1-swing','p2-swing','p1-underhand'])for(const pose of data.timelines[key]){
  const m=pose.matrix,points=[[-10.5,-10.5],[-10.5,10.5],[10.5,-10.5],[10.5,10.5]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
  const expected=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];expected.forEach((v,i)=>close(v,pose.bounds[i]));
 }
 assert.deepEqual(data.gunMatrices['p1-swing'],[1,0,0,1,3.7,-55.5]);assert.deepEqual(data.gunMatrices['p2-swing'],[-1,0,0,1,-2.3,-53.5]);
});

test('native rectangular corner hits replace the old30px circle, and the old circle cannot hit outside the native bounds',()=>{
 const s=flight(),p=s.players[0],bounds=data.timelines['p1-swing'][1].bounds;s.birdie={x:p.x+bounds[0]+.01,y:p.y+bounds[1]+.01,vx:0,vy:0,lastHitter:2};
 assert(Math.hypot(s.birdie.x-(p.x-24),s.birdie.y-(p.y-84))>30);core.step(s,[input(1,{hit:1}),core.EMPTY_INPUT]);assert.equal(s.birdie.lastHitter,1);assert(p.swingHit);assert.equal(p.swing,14);
 const t=flight(),q=t.players[0];t.birdie={x:q.x+5,y:q.y-84,vx:0,vy:0,lastHitter:2};core.step(t,[input(1,{hit:1}),core.EMPTY_INPUT]);assert.equal(t.birdie.lastHitter,2);assert(!q.swingHit);
});

test('P2 mirror and airborne character translation use original transformed rectangles, with frame9 closing the hit window',()=>{
 const s=flight(),p=s.players[1];p.y-=80;p.vy=-1;p.swing=15;const b=data.timelines['p2-swing'][1].bounds;s.birdie={x:p.x+(b[0]+b[2])/2,y:p.y+(b[1]+b[3])/2,vx:0,vy:0,lastHitter:1};core.step(s,[core.EMPTY_INPUT,core.EMPTY_INPUT]);assert.equal(s.birdie.lastHitter,2);
 const q={x:0,y:0,swing:7,underhand:0};assert.equal(geometry.racketPose(1,q.swing,0).frame,9);assert.equal(geometry.racketContains(q,1,0,-50),false);
});

test('contact consumes this swing without interrupting its remaining native animation or allowing an immediate new stroke',()=>{
 const s=flight(),p=s.players[0],b=data.timelines['p1-swing'][1].bounds;s.birdie={x:p.x+(b[0]+b[2])/2,y:p.y+(b[1]+b[3])/2,vx:0,vy:0,lastHitter:2};core.step(s,[input(1,{hit:1}),core.EMPTY_INPUT]);assert.equal(p.swing,14);assert(p.swingHit);
 core.step(s,[input(2,{hit:2}),core.EMPTY_INPUT]);assert.equal(p.swing,13);assert(p.swingHit);assert.equal(p.lastHit,2);for(let i=0;i<13;i++)core.step(s,[input(3+i,{hit:2}),core.EMPTY_INPUT]);assert.equal(p.swing,0);
 core.step(s,[input(20,{hit:3}),core.EMPTY_INPUT]);assert.equal(p.swing,14);assert(!p.swingHit);
});

test('two-human low-ball strokes follow original setupHero1 overhead; source single-player underhand geometry is retained separately',()=>{
 const s=flight(),p=s.players[0];s.birdie.y=p.y-10;core.step(s,[input(1,{hit:1}),core.EMPTY_INPUT]);assert.equal(p.underhand,0);assert.equal(p.swing,14);
 assert.deepEqual(data.timelines['p1-underhand'].filter(p=>p.active).map(p=>p.frame),[16,17,18,19,20,21,22]);
});

test('both native release markers are transformed through the original serve gun, then immediately take the first ballistic step',()=>{
 for(const seat of [1,2]){const s=core.createGame(1,true);s.serve=seat;for(let n=1;n<=3;n++){const controls=[input(n),input(n)];controls[seat-1].hit=1;core.step(s,controls);}
  const p=s.players[seat-1],point=geometry.servePoint(seat,4);close(s.birdie.x,p.x+point.x+(seat===1?27.6:-27.6));close(s.birdie.y,p.y+point.y-26.825);assert.equal(s.rally,'flight');assert.equal(s.birdie.lastHitter,seat);
 }
 close(geometry.servePoint(1,4).x,23.8);close(geometry.servePoint(1,4).y,-29.5);close(geometry.servePoint(2,4).x,-21.65);close(geometry.servePoint(2,4).y,-28.5);
});

test('point-over ball can still be struck through native hit flags without incrementing the settled score',()=>{
 const s=flight(),p=s.players[0];s.rally='point';s.score=[1,0];s.pointTicks=40;const b=data.timelines['p1-swing'][1].bounds;s.birdie={x:p.x+(b[0]+b[2])/2,y:p.y+(b[1]+b[3])/2,vx:0,vy:0,lastHitter:2};core.step(s,[input(1,{hit:1}),core.EMPTY_INPUT]);assert.equal(s.birdie.lastHitter,1);assert.deepEqual(s.score,[1,0]);
});

test('full/delta recovery preserves a consumed stroke throughout its remaining animation and cannot replay contact',()=>{
 const s=flight(),p=s.players[0],b=data.timelines['p1-swing'][1].bounds;s.birdie={x:p.x+(b[0]+b[2])/2,y:p.y+(b[1]+b[3])/2,vx:0,vy:0,lastHitter:2};core.step(s,[input(1,{hit:1}),core.EMPTY_INPUT]);let client=protocol.applyUpdate(null,protocol.createUpdate(null,s,1,true));assert(client.players[0].swingHit);
 for(let n=0;n<20;n++){const before=JSON.parse(JSON.stringify(s)),recovered=JSON.parse(JSON.stringify(client));core.step(s,[]);core.step(recovered,[]);assert.deepEqual(recovered,s);client=protocol.applyUpdate(client,JSON.parse(JSON.stringify(protocol.createUpdate(before,s,2+n,false))));assert.deepEqual(client,s);assert(core.validState(client));}
 for(const edit of [p=>delete p.swingHit,p=>p.swingHit=1,p=>p.swing=15,p=>p.underhand=2]){const bad=JSON.parse(JSON.stringify(s));edit(bad.players[0]);assert(!core.validState(bad));}
});
