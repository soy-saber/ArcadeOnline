'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),{PNG}=require('pngjs');
function load(file){const name=path.resolve(__dirname,file),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);return m.exports;}
const c=load('../src/badminton/core.ts'),motion=load('../src/badminton/motion.ts'),protocol=load('../src/authority/protocol.ts'),{Presentation}=load('../src/authority/presentation.ts'),art=require('../src/badminton/character-art.json');
const input=(seq,fields={})=>({...c.EMPTY_INPUT,seq,...fields}),hash=data=>crypto.createHash('sha256').update(data).digest('hex');

test('all114 native character frames match their recorded source/sheet/pixel hashes and native registration',()=>{
 assert.equal(hash(fs.readFileSync(path.resolve(__dirname,'..',art.source))),art.sourceSha256);let count=0;
 for(const group of Object.values(art.poses))for(const meta of Object.values(group)){
  const file=fs.readFileSync(path.resolve(__dirname,'../public/authority/assets/badminton',meta.file));assert.equal(hash(file),meta.sha256);const sheet=PNG.sync.read(file);assert.equal(sheet.width,meta.w*meta.frames);assert.equal(sheet.height,meta.h);
  for(let frame=0;frame<meta.frames;frame++){const pixels=Buffer.alloc(meta.w*meta.h*4);for(let y=0;y<meta.h;y++)sheet.data.copy(pixels,y*meta.w*4,(y*sheet.width+frame*meta.w)*4,(y*sheet.width+(frame+1)*meta.w)*4);assert.equal(hash(pixels),meta.frameSha256[frame]);count++;}
 }
 assert.equal(count,114);assert.equal(art.rootFrameRate,30);
});

test('native parent labels, child timelines, stopped jump, alpha/filters and depth layers remain intact',()=>{
 assert.deepEqual(Object.fromEntries(Object.entries(art.poses.p1).map(([k,m])=>[k,[m.rootFrame,m.bodySymbol,m.frames,m.playing]])),{normal:[1,279,11,true],walkbackward:[12,294,8,true],walkforward:[23,302,8,true],walkup:[32,305,32,false],walkdown:[43,279,11,true]});
 assert.deepEqual(Object.fromEntries(Object.entries(art.poses.p2).map(([k,m])=>[k,[m.rootFrame,m.bodySymbol,m.frames,m.playing]])),{normal:[1,200,11,true],walkforward:[13,220,8,true],walkbackward:[23,229,8,true],walkdown:[33,238,16,true],walkup:[45,null,1,false]});
 for(const side of ['p1','p2'])for(const kind of ['walkforward','walkbackward'])assert.equal(new Set(art.poses[side][kind].frameSha256).size,8);
 for(const group of Object.values(art.poses))for(const meta of Object.values(group))for(const layer of meta.layers){assert(!/name="gun(?:Serve)?"/.test(layer));assert(Number(/depth="(\d+)"/.exec(layer)[1])>8);}
 assert(art.poses.p1.normal.layers.some(s=>s.includes('alphaMultTerm="230"')&&s.includes('DROPSHADOWFILTER')));assert(art.poses.p2.normal.layers.some(s=>s.includes('BLURFILTER')));assert(art.poses.p2.normal.layers.some(s=>s.includes('characterId="260"')&&s.includes('scaleX="-1.0036163"')));
 assert.equal(art.poses.p1.normal.svgX,-16.7);assert.equal(art.poses.p1.normal.svgY,-77.25);assert.equal(art.poses.p2.walkup.svgX,-10.35);
 for(const group of Object.values(art.poses))for(const m of Object.values(group)){assert.equal(m.x,m.svgX-m.filterPadding[0]);assert.equal(m.y,m.svgY-m.filterPadding[1]);}
 assert.deepEqual(art.poses.p1.normal.filterPadding,[9,9]);assert.equal(art.poses.p1.normal.x,-25.7);assert.equal(art.poses.p1.normal.y,-86.25);
});

test('held walking loops all8frames, repeated parent label leaves the child running; blockage retains its animation',()=>{
 const s=c.createGame(1,true),p=s.players[0],frames=[];
 for(let n=1;n<=10;n++){c.step(s,[input(n,{left:true})]);assert.equal(p.motion,'walkbackward');assert.equal(p.motionAt,1);frames.push(motion.bodyPose(1,p,s.tick).frame);}
 assert.deepEqual(frames,[1,2,3,4,5,6,7,8,1,2]);for(let n=11;n<=25;n++)c.step(s,[input(n,{left:true})]);assert.equal(p.motionAt,1);assert.equal(p.motion,'walkbackward');
 c.step(s,[input(26)]);assert.equal(p.motion,'normal');assert.equal(p.motionAt,26);assert.equal(motion.bodyPose(1,p,s.tick).frame,1);
 c.step(s,[input(27,{right:true})]);assert.equal(p.motion,'walkforward');assert.equal(p.motionAt,27);assert.equal(motion.bodyPose(1,p,s.tick).frame,1);
});

test('right then left can replace the child twice in one callback, even when the final label matches the previous one',()=>{
 const s=c.createGame(2,true),p=s.players[0];c.step(s,[input(1,{left:true})]);c.step(s,[input(2,{left:true})]);assert.equal(motion.bodyPose(1,p,s.tick).frame,2);
 c.step(s,[input(3,{left:true,right:true})]);assert.equal(p.motion,'walkbackward');assert.equal(p.motionAt,3);assert.equal(motion.bodyPose(1,p,s.tick).frame,1);
});

test('jump switches parent pose once, source child305 stays stopped; landing follows original held controls',()=>{
 const s=c.createGame(3,true),p=s.players[1];c.step(s,[c.EMPTY_INPUT,input(1,{jump:1})]);assert.equal(p.motion,'walkup');assert.equal(p.motionAt,1);
 for(let n=2;n<=23;n++){c.step(s,[c.EMPTY_INPUT,input(n,{jump:1,left:true})]);assert.equal(p.motion,'walkup');assert.equal(p.motionAt,1);assert.equal(motion.bodyPose(2,p,s.tick).frame,1);}
 c.step(s,[c.EMPTY_INPUT,input(24,{jump:1,left:true})]);assert(!p.jumping);assert.equal(p.motion,'walkup');assert.equal(p.motionAt,1); // toward-net movement is blocked, so the old parent pose remains
 c.step(s,[c.EMPTY_INPUT,input(25,{jump:1,right:true})]);assert.equal(p.motion,'walkbackward');assert.equal(p.motionAt,25);assert.equal(motion.bodyPose(2,p,s.tick).frame,1);
 const q=s.players[0];motion.setMotion(q,'walkup',s.tick);for(let tick=s.tick;tick<s.tick+70;tick++)assert.equal(motion.bodyPose(1,q,tick).frame,1);
});

test('source gameOver switches grounded characters to normal while keeping airborne jump pose',()=>{
 const s=c.createGame(4,true);s.serve=0;s.rally='flight';s.score[1]=6;s.tick=20;const [p,q]=s.players;motion.setMotion(p,'walkforward',20);q.jumping=true;q.y-=60;q.vy=-1;motion.setMotion(q,'walkup',20);Object.assign(s.birdie,{x:100,y:c.GROUND-1,vx:0,vy:2,lastHitter:2});c.step(s,[input(1),input(1)]);
 assert.equal(s.phase,'finished');assert.equal(p.motion,'normal');assert.equal(q.motion,'walkup');assert(c.validState(s));
});

test('full/delta recovery preserves independent character phase and rejects missing/future motion origins',()=>{
 const s=c.createGame(5,true);let client=protocol.applyUpdate(null,protocol.createUpdate(null,s,1,true));
 for(let n=1;n<=50;n++){const before=JSON.parse(JSON.stringify(s)),recovered=JSON.parse(JSON.stringify(client)),inputs=[input(n,{left:n<=20}),input(n,{right:n<=15,jump:n>25?1:0})];c.step(s,inputs);c.step(recovered,inputs);assert.deepEqual(recovered,s);client=protocol.applyUpdate(client,JSON.parse(JSON.stringify(protocol.createUpdate(before,s,n+1,n%13===0))));for(let i=0;i<2;i++)assert.deepEqual(motion.bodyPose(i+1,client.players[i],client.tick),motion.bodyPose(i+1,s.players[i],s.tick));assert(c.validState(client));}
 for(const edit of [p=>delete p.motionAt,p=>p.motionAt=s.tick+1,p=>p.motionAt=-1,p=>p.motion='walking']){const bad=JSON.parse(JSON.stringify(s));edit(bad.players[0]);assert(!c.validState(bad));}
});

test('local preview applies gravity before native movement tests and preserves authoritative character tracks/counters',()=>{
 const s=c.createGame(6,true);s.serve=0;const p=s.players[0];p.x=220;p.y=7032/20-10.5*3.4748993-.5;p.vy=1;p.jumping=true;const presentation=new Presentation(()=>{});presentation.receive(s,1000,1);const i=input(1,{right:true,jump:1,hit:1});presentation.input(i,20);const shown=presentation.render(20,1020,1,i,30);
 assert.equal(shown.players[0].x,220);assert(shown.players[0].y>p.y);for(const key of ['motion','motionAt','lastJump','lastHit','racket','jumps'])assert.deepEqual(shown.players[0][key],p[key],key);assert.deepEqual(shown.birdie,s.birdie);assert.deepEqual(shown.score,s.score);
 const replay=c.reconcile(s,1,[i]).state;for(const key of ['motion','motionAt','lastJump','lastHit','racket','jumps'])assert.deepEqual(replay.players[0][key],p[key],key);
});
