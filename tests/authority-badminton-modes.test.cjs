'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);return m.exports;}
const c=load('../src/badminton/core.ts'),{AuthorityEngine}=load('../src/authority/engine.ts'),protocol=load('../src/authority/protocol.ts'),{Presentation}=load('../src/authority/presentation.ts');
const copy=s=>JSON.parse(JSON.stringify(s));
function setup(){const engine=new AuthorityEngine(()=>{}),member=(id,seat)=>({id,seat,ready:false,ws:{readyState:1,bufferedAmount:0,messages:[],send(t){this.messages.push(JSON.parse(t));},close(){}}}),a=member('a',1),v=member('v',null),room={gameId:'46923-server',seats:{1:'a',2:null},members:new Map([['a',a],['v',v]])};engine.onRoom(room);return {engine,room,a,v};}
function solo(mode='human'){const o=setup();assert(o.engine.options(o.room,o.a,{gameMode:mode}));o.a.ready=true;o.engine.onRoom(o.room);assert.equal(o.room.auth.state.phase,'playing');return o;}

test('solo mode admission, controller options and CPU ownership are enforced by the server',()=>{
 const {engine,room,a,v}=setup(),initial=copy(room.auth.state);
 assert.equal(engine.options(room,v,{gameMode:'robot'}),false);assert.equal(engine.options(room,a,{gameMode:'cpu-6'}),false);assert.deepEqual(room.auth.state,initial);
 room.seats[2]='b';room.members.set('b',{id:'b',seat:2,ready:false,ws:null});engine.onRoom(room);assert.equal(engine.options(room,a,{gameMode:'human'}),false);
 room.seats[2]=null;room.members.delete('b');engine.onRoom(room);assert(engine.options(room,a,{gameMode:'robot',level:6,score:[7,0]}));assert.equal(room.auth.state.level,1);assert.deepEqual(room.auth.state.score,[0,0]);assert.equal(engine.canSit(room,2),false);assert.equal(engine.canSit(room,1),true);
 a.ready=true;engine.onRoom(room);const round=room.auth.state.round;assert.equal(room.auth.state.phase,'playing');assert.equal(engine.options(room,a,{gameMode:'human'}),false);assert.equal(room.auth.state.round,round);
 const now=room.auth.clock;engine.input(room,{...a,id:'cpu-impostor',seat:2},{round,serverTime:now,input:{...c.EMPTY_INPUT,seq:1,left:true,hit:1}},now);assert.equal(room.auth.inputs.has('cpu-impostor'),false);
});

test('pause commands reject spectators, stale rounds, string sequences and replay; publish same-tick full recovery',()=>{
 const {engine,room,a,v}=solo(),s=room.auth.state,round=s.round;engine.publish(room);const first=a.ws.messages.at(-1);engine.ack(room,a,first);
 for(const [who,msg] of [[v,{round,seq:1,action:'pause'}],[a,{round:round-1,seq:1,action:'pause'}],[a,{round,seq:'1',action:'pause'}],[a,{round,seq:1,action:'next'}]])assert.equal(engine.badmintonAction(room,who,msg),false);
 assert.equal(s.paused,false);assert(engine.badmintonAction(room,a,{round,seq:1,action:'pause'}));assert(s.paused);assert.equal(s.tick,first.tick);const paused=a.ws.messages.at(-1);assert.equal(paused.kind,'full');assert.deepEqual(protocol.applyUpdate(first.state,paused),s);
 assert.equal(engine.badmintonAction(room,a,{round,seq:1,action:'pause'}),false);assert(s.paused);engine.ack(room,a,paused);assert(engine.badmintonAction(room,a,{round,seq:2,action:'pause'}));assert.equal(s.paused,false);
 for(const seat of [0,3,1.5,NaN])assert.equal(c.action(s,seat,10,'pause'),false);
});

test('six-level Next and Retry preserve native actors, global variables, particles and monotonic events',()=>{
 const s=c.createGame(42,true,'robot');for(let i=1;i<=20;i++)c.step(s,[{...c.EMPTY_INPUT,seq:i,pointerX:150,pointerY:230},c.EMPTY_INPUT]);
 const p1=s.players[0],particles=s.particles,phase=s.robot.phase;Object.assign(s.cpu,{swingVar:40,swingVar2:20});s.chance1=17;s.scoreEvents=9;s.phase='finished';s.winner=1;s.score=[7,2];
 assert(c.action(s,1,1,'next'));assert.equal(s.level,2);assert.equal(s.players[0],p1);assert.equal(s.particles,particles);assert.equal(s.robot.phase,phase);assert.equal(s.cpu.swingVar,40);assert.equal(s.cpu.swingVar2,20);assert.equal(s.chance1,17);assert.equal(s.cpu.numVar2,5);assert.equal(s.scoreEvents,9);assert.deepEqual(s.score,[0,0]);assert.equal(s.serve,1);assert(c.validState(s));
 const cpu=s.players[1],cpuState=s.cpu;s.phase='finished';s.winner=2;s.score=[3,7];assert.equal(c.action(s,1,2,'next'),false);assert(c.action(s,1,2,'retry'));assert.equal(s.players[1],cpu);assert.equal(s.cpu,cpuState);assert.equal(s.level,2);assert.equal(s.players[0],p1);assert.equal(s.scoreEvents,9);assert(c.validState(s));
 for(let level=2;level<6;level++){s.phase='finished';s.winner=1;assert(c.action(s,1,level+1,'next'));assert.equal(s.level,level+1);}
 s.phase='finished';s.winner=1;assert.equal(c.action(s,1,99,'next'),false);assert.equal(c.action(s,2,99,'retry'),false);assert.equal(s.level,6);
});

test('solo finish keeps native callbacks, never auto-rematches, and menu returns to unready level one',()=>{
 const {engine,room,a}=solo('robot'),s=room.auth.state,round=s.round;s.phase='finished';s.winner=2;s.score=[0,7];const at=room.auth.clock,phase=s.robot.phase;
 for(let i=1;i<=120;i++)engine.pump(room,at+i*34);assert.equal(room.auth.state,s);assert.equal(s.round,round);assert(s.tick>=120);assert(s.robot.phase>phase);assert.equal(room.auth.nextRoundAt,0);
 assert(engine.badmintonAction(room,a,{round,seq:1,action:'retry'}));assert.equal(s.phase,'playing');assert.equal(s.level,1);assert.deepEqual(s.score,[0,0]);assert.equal(s.round,round);
 assert(engine.badmintonAction(room,a,{round,seq:2,action:'menu'}));assert.equal(room.auth.state.phase,'waiting');assert(room.auth.state.round>round);assert.equal(room.auth.state.options.mode,'robot');assert.equal(a.ready,false);
});

test('robot reconnect cancels held attacks and preserves pointer, CPU, stage, random stream and command nonce',()=>{
 const {engine,room,a}=solo('robot'),s=room.auth.state,now=room.auth.clock,round=s.round;
 for(let i=1;i<=20;i++){const at=now+i*34;engine.input(room,a,{round,serverTime:at,input:{...c.EMPTY_INPUT,seq:i,hit:1,hitHeld:true,pointerX:170,pointerY:200}},at);engine.pump(room,at);}assert.equal(s.players[0].racket.strokes,1);
 assert(engine.badmintonAction(room,a,{round,seq:5,action:'pause'}));const saved=copy(s);engine.reconnect(room,a);assert.equal(s.actionAck[0],5);assert.equal(s.rng,saved.rng);assert.deepEqual(s.cpu,saved.cpu);assert.deepEqual(s.robot,saved.robot);
 assert(engine.badmintonAction(room,a,{round,seq:6,action:'pause'}));for(let i=21;i<65;i++)engine.pump(room,now+i*34);assert.equal(s.players[0].racket.strokes,1);assert.equal(s.inputs[0].hitHeld,false);assert.equal(s.robot.pointerX,170);
});

test('solo full and delta snapshots round-trip every mode, AI phase and particle kind; reject corrupt authoritative state',()=>{
 for(const mode of ['human','robot']){let s=c.createGame(42,true,mode),client=protocol.applyUpdate(null,protocol.createUpdate(null,s,1000)),before=copy(s);
  for(let tick=1;tick<=65;tick++){c.step(s,[{...c.EMPTY_INPUT,seq:tick,hit:1,hitHeld:true,pointerX:179,pointerY:200},c.EMPTY_INPUT]);const delta=protocol.createUpdate(before,s,1000+tick*34);assert.equal(delta.kind,'delta');client=protocol.applyUpdate(client,delta);assert.deepEqual(client,s);before=copy(s);}
  for(const patch of [x=>x.level=7,x=>x.cpu.serveSinceMs=1e9,x=>x.cpu.swingVar=19,x=>x.cpu.chance3=101,x=>x.actionAck=[-1,0],x=>x.scoreEvents=-1,x=>x.options.mode='cpu',x=>x.particles.push({...x.particles[0],kind:'unknown'}),...(mode==='robot'?[x=>x.robot.pointerX=Infinity,x=>x.robot.phase=-1,x=>x.particles.push({...x.particles[0]})]:[x=>x.robot={phase:0,pointerX:0,pointerY:0}])]){const bad=copy(s);patch(bad);assert.equal(c.validState(bad),false);assert.equal(protocol.applyUpdate(client,protocol.createUpdate(null,bad,4000,true)),null);}
 }
 for(const input of [{pointerX:NaN},{pointerY:10001},{pointerX:'20'}])assert.equal(c.validInput({...c.EMPTY_INPUT,...input}),false);
});

test('robot preview changes local pose only and paused snapshots freeze ball rendering and movement',()=>{
 const s=c.createGame(42,true,'robot');c.step(s,[c.EMPTY_INPUT,c.EMPTY_INPUT]);const saved=copy(s),p=new Presentation(()=>{}),input={...c.EMPTY_INPUT,seq:1,hit:99,jump:99,hitHeld:true,pointerX:170,pointerY:120};p.receive(s,1000,1);p.input(input,20);const view=p.render(50,1049,1,input,30);assert(view.players[0].y<s.players[0].y);
 for(const key of Object.keys(s).filter(k=>k!=='players'))assert.deepEqual(view[key],s[key],key);assert.deepEqual(view.players[1],s.players[1]);for(const k of Object.keys(s.players[0]).filter(k=>k!=='x'&&k!=='y'))assert.deepEqual(view.players[0][k],s.players[0][k],k);assert.deepEqual(s,saved);
 const paused=copy(s);paused.tick++;paused.paused=true;paused.rally='flight';paused.birdie.x=200;paused.birdie.born=0;p.receive(paused,1050,51);const frozen=p.render(80,1080,1,input,30);assert.deepEqual(frozen.birdie,paused.birdie);assert.deepEqual(frozen.players[0],paused.players[0]);assert.equal(p.predictionSteps,0);
});
