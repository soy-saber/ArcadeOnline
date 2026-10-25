'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);return m.exports;}
const c=load('../src/badminton/core.ts'),protocol=load('../src/authority/protocol.ts');
const input=(seq,patch={})=>({...c.EMPTY_INPUT,seq,...patch}),close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function idle(){const s=c.createGame(1,true);s.serve=1;return s;}
function land(s,seat){s.rally='flight';s.serve=0;s.birdie={x:seat===1?450:100,y:c.GROUND-1,vx:0,vy:2,lastHitter:seat};c.step(s,[]);}

test('a held key repeats overhead on native ready frame15, without client counter increments',()=>{
 const s=idle(),p=s.players[1],starts=[];
 for(let n=1;n<=40;n++){const before=p.racket.strokes;c.step(s,[c.EMPTY_INPUT,input(n,{hit:1,hitHeld:true})]);if(p.racket.strokes>before)starts.push(s.tick);}
 assert.deepEqual(starts,[1,14,27,40]);assert.equal(p.lastHit,1);assert.equal(p.racket.frame,2);
 c.step(s,[c.EMPTY_INPUT,input(41,{hit:1,hitHeld:false})]);for(let n=42;n<=65;n++)c.step(s,[c.EMPTY_INPUT,input(n,{hit:1,hitHeld:false})]);
 assert.equal(p.racket.strokes,4);assert.equal(p.racket.frame,15);assert(p.racket.ready);assert(!p.racket.playing);assert(c.validState(s));
});

test('normal frame9 closes contact; frame15 restores ready and stops without resetting to idle frame1',()=>{
 const s=idle(),p=s.players[1];c.step(s,[c.EMPTY_INPUT,input(1,{hit:1})]);
 assert(p.racket.active);assert(!p.racket.ready);
 for(let n=2;n<=8;n++)c.step(s,[c.EMPTY_INPUT,input(n,{hit:1})]);assert.equal(p.racket.frame,9);assert(!p.racket.active);assert(!p.racket.ready);
 for(let n=9;n<=14;n++)c.step(s,[c.EMPTY_INPUT,input(n,{hit:1})]);assert.equal(p.racket.frame,15);assert(p.racket.ready);assert(!p.racket.playing);
});

test('the non-server may swing before release; creating the shuttle cancels both active flags without stopping clips',()=>{
 const s=idle();c.step(s,[input(1,{hit:1}),input(1,{hit:1})]);assert.equal(s.players[1].racket.strokes,1);assert(s.players[1].racket.active);
 for(let n=2;n<=4;n++)c.step(s,[input(n,{hit:1}),input(n,{hit:1})]);assert.equal(s.rally,'flight');assert(!s.players[0].racket.active);assert(!s.players[1].racket.active);assert(s.players[1].racket.playing);assert.equal(s.players[1].racket.frame,5);assert(!s.players[1].racket.ready);
});

test('service play begins at1, releases at4, clears serve at13, wraps to1 before ordinary held stroke can restart',()=>{
 for(const seat of [1,2]){
  const s=idle();s.serve=seat;const p=s.players[seat-1];
  for(let n=1;n<=15;n++){
   const inputs=[input(n),input(n)];inputs[seat-1]=input(n,{hit:1,hitHeld:true,jump:1,jumpHeld:true});c.step(s,inputs);
   if(n===1){assert.equal(p.racket.serveFrame,1);assert(p.racket.servePlaying);}
   if(n===2){assert.equal(p.racket.serveFrame,2);assert(!p.racket.ready);}
   if(n===3)assert.equal(s.rally,'serve');
   if(n===4){assert.equal(s.rally,'flight');assert(!p.racket.active);}
   if(n===12){assert.equal(s.serve,seat);assert.equal(p.jumps,0);}
   if(n===13){assert.equal(s.serve,0);assert.equal(p.jumps,1);assert.equal(p.racket.strokes,0);assert(!p.racket.ready);}
   if(n===14){assert.equal(p.racket.serveFrame,1);assert(!p.racket.servePlaying);assert.equal(p.racket.strokes,1);assert.equal(p.racket.frame,2);}
   assert(c.validState(s));
  }
 }
});

test('held jumping repeats at landing; native ground gravity accumulates and a later jump resets its impulse',()=>{
 const s=idle(),p=s.players[1],starts=[];for(let n=1;n<=50;n++){const before=p.jumps;c.step(s,[c.EMPTY_INPUT,input(n,{jump:1,jumpHeld:true})]);if(p.jumps>before)starts.push(s.tick);}
 assert.deepEqual(starts,[1,24,47]);assert.equal(p.lastJump,1);
 for(let n=51;n<=90;n++)c.step(s,[c.EMPTY_INPUT,input(n,{jump:1,jumpHeld:false})]);assert.equal(p.jumps,3);assert.equal(p.y,c.GROUND);assert(p.vy>12);
 c.step(s,[c.EMPTY_INPUT,input(91,{jump:2,jumpHeld:true})]);assert.equal(p.vy,-12);assert.equal(p.jumps,4);
});

test('native wall tests permit one-step overshoot and both-held executes right before left',()=>{
 const s=idle();for(let n=0;n<100;n++)c.movePlayer(s,1,-1);close(s.players[0].x,44.35);
 for(let n=0;n<100;n++)c.movePlayer(s,2,1);close(s.players[1].x,505.35);
 const p=s.players[0];p.x=215.45;s.serve=0;c.moveControls(s,1,true,true);close(p.x,209.55);assert.equal(p.motion,'walkbackward');
 p.y=290;p.x=272;c.movePlayer(s,1,1);close(p.x,277.9); // native broad netLimit ends below this height
});

test('cancelled taps are consumed; an ordinary released short tap still acts exactly once',()=>{
 const s=idle(),p=s.players[1];c.step(s,[c.EMPTY_INPUT,input(1,{jump:1,hit:1,jumpHeld:false,hitHeld:false,cancelledJump:1,cancelledHit:1})]);assert.equal(p.jumps,0);assert.equal(p.racket.strokes,0);
 c.step(s,[c.EMPTY_INPUT,input(2,{jump:2,hit:2,jumpHeld:false,hitHeld:false,cancelledJump:1,cancelledHit:1})]);assert.equal(p.jumps,1);assert.equal(p.racket.strokes,1);
 for(let n=3;n<=50;n++)c.step(s,[c.EMPTY_INPUT,input(n,{jump:2,hit:2,jumpHeld:false,hitHeld:false})]);assert.equal(p.jumps,1);assert.equal(p.racket.strokes,1);
});

test('normal points reset exactly45callbacks after award and retain live player/clip tracks',()=>{
 for(const seat of [1,2]){const s=idle();land(s,seat);const at=s.tick;assert.equal(s.resetAt,at+45);assert.equal(s.pointTicks,45);
  for(let n=1;n<=44;n++)c.step(s,[]);assert.equal(s.rally,'point');assert.equal(s.pointTicks,1);
  const p=s.players[seat-1];p.x=seat===1?210:340;p.y=290;p.vy=-1;p.jumping=true;Object.assign(p.racket,{frame:5,playing:true,ready:false,active:true});
  c.step(s,[]);assert.equal(s.rally,'serve');assert.equal(s.serve,seat);assert.equal(s.resetAt,null);assert.equal(s.pointTicks,0);assert.equal(p.racket.frame,6);assert(p.jumping);close(p.y,290);
  close(p.x,274.95+(seat===1?-1:1)*(10.5*6.177414+65));assert.deepEqual(s.score,seat===1?[1,0]:[0,1]);assert(c.validState(s));
 }
});

test('P1 seventh point waits1500ms, P2 seventh point finishes immediately, with no extra service or score',()=>{
 for(const seat of [1,2]){const s=idle();s.score[seat-1]=6;land(s,seat);const at=s.tick;assert.equal(s.score[seat-1],7);assert.equal(s.resetAt,null);
  if(seat===1){assert.equal(s.phase,'playing');assert.equal(s.winner,0);assert.equal(s.finishAt,at+45);for(let n=1;n<=44;n++)c.step(s,[]);assert.equal(s.phase,'playing');c.step(s,[]);assert.equal(s.tick,at+45);}
  assert.equal(s.phase,'finished');assert.equal(s.winner,seat);assert.equal(s.finishAt,null);assert.equal(s.rally,'point');assert(c.validState(s));
 }
});

test('full/delta recovery preserves both held tracks, service wrap and round timers deterministically',()=>{
 const s=idle();let client=protocol.applyUpdate(null,protocol.createUpdate(null,s,1,true));
 for(let n=1;n<=120;n++){const controls=[input(n,{hit:1,hitHeld:true}),input(n,{jump:1,jumpHeld:true,hit:1,hitHeld:true})],before=JSON.parse(JSON.stringify(s)),recovered=JSON.parse(JSON.stringify(client));c.step(s,controls);c.step(recovered,controls);assert.deepEqual(recovered,s);client=protocol.applyUpdate(client,JSON.parse(JSON.stringify(protocol.createUpdate(before,s,n+1,n%17===0))));assert.deepEqual(client,s);assert(c.validState(s));}
 for(const patch of [{jumpHeld:1},{hitHeld:0},{cancelledJump:2,jump:1},{cancelledHit:-1}])assert(!c.validInput(input(1,patch)));
 for(const edit of [s=>delete s.resetAt,s=>s.finishAt=NaN,s=>s.players[0].racket.ready=1,s=>s.players[0].racket.frame=30,s=>s.players[0].racket.serveFrame=14,s=>s.players[0].racket.strokeAt=s.tick+1,s=>s.players[0].jumps=-1,s=>s.players[0].servePose=3]){const bad=JSON.parse(JSON.stringify(s));edit(bad);assert(!c.validState(bad));}
});
