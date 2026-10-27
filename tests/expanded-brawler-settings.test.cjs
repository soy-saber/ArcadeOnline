'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const p=path.resolve(__dirname,file),m=new Module(p,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[p],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,p);return m.exports;}
const {adapter:a}=load('../src/expanded/brawler.ts'),options=load('../src/expanded/brawler-options.ts'),fx=load('../src/expanded/brawler-effects.ts'),{AuthorityEngine}=load('../src/authority/engine.ts'),protocol=load('../src/authority/protocol.ts');
const objects=require('./fixtures/brawler-initialized-objects.json'),native=require('./fixtures/brawler-match-native.json');
const empty=(patch={})=>({seq:1,left:false,right:false,up:false,down:false,attack:0,alt:0,...patch});
function room(){const engine=new AuthorityEngine(()=>{}),p={id:'a',seat:1,ready:false,ws:null},q={id:'b',seat:4,ready:false,ws:null},v={id:'v',seat:null,ready:false,ws:null},r={gameId:a.id,seats:{1:'a',2:null,3:null,4:'b'},members:new Map([['a',p],['b',q],['v',v]])};engine.onRoom(r);return {engine,r,p,q,v};}
test('initialized native item roots and bounds match production spawn/airborne/active art, rather than the entry redirect',()=>{
 for(const row of objects.rows)for(let i=0;i<row.variants.length;i++){const variant=row.variants[i];if(row.name==='Garbage'&&variant===1)continue;const rendered=fx.frame({name:row.name,x:0,y:0,age:0,variant,sx:1,sy:1,rotation:0});assert.equal(rendered.native.frame,variant);assert.deepEqual(rendered.native.bounds,row.stable[i].bounds);}
});
test('Garbage explicit types and constructor-dependent type0/type1 reproduce original initialization observations',()=>{
 for(const row of [...objects.types,...objects.constructors]){const before=row.entry?.frame??row.immediate.before,after=row.native.frame;let draws=0;const result=options.garbageFrame(row.type,before,()=>{draws++;return after/7;});assert.equal(result,after);assert.equal(draws,row.type===1&&before!==1?1:0);}
 for(let n=0;n<7;n++)assert.equal(options.newGarbageFrame(0,()=>n/7),Math.max(1,n));
});
test('original Fighter.Die score/life behavior is retained while platform records count only opponent kills',()=>{
 for(const row of native.deaths){const s=a.create(1,true,[1,4],17,undefined,row.mode,{brawlerStocks:row.livesBefore>0?row.livesBefore:5,brawlerItems:0}),p=s.players[0],q=s.players[1];p.lastSender=row.sender==='self'?1:row.sender==='other'?4:null;p.x=p.hitX=2000;a.step(s,[]);assert.equal(p.stocks,row.lives);assert.equal(p.deaths,row.deaths);assert.equal(p.suicides,row.suicides);assert.equal(p.nativeKos,row.victimKOs);assert.equal(q.nativeKos,row.otherKOs);assert.equal(!p.alive,row.dead);assert.equal(p.kos,0);assert.equal(q.kos,row.sender==='other'?1:0);assert(a.valid(s));}
});
test('rank order and ties match the isolated original frame101 AVM1 sortOn function',()=>{
 for(const row of native.ranks){const ps=row.input.map((p,i)=>({seat:i+1,nativeKos:p.KOs,deaths:p.Deaths,deathOrder:p.DeathOrd??null}));const actual=options.standings(row.mode,ps,row.numDead);assert.deepEqual(actual.map(p=>({Score:p.score,Index:p.seat-1})),row.result.order);}
 assert.equal(native.weakOrders.length,92);for(const row of native.weakOrders){const ps=row.input.map((p,i)=>({seat:i+1,nativeKos:p.KOs,deaths:p.Deaths,deathOrder:null}));assert.deepEqual(options.standings('time',ps,0).map(p=>({Score:p.score,Index:p.seat-1})),row.result.order);}
});
test('native five-stock default, custom lives, timed respawn, unlimited time and timer settlement are distinct',()=>{
 assert.equal(a.create(1,true,[1,4],1).players[0].stocks,5);assert.equal(a.create(1,true,[1,4],1,undefined,'stock',{brawlerStocks:12}).players[0].stocks,12);
 const unlimited=a.create(1,true,[1,4],1,undefined,'time',{brawlerSeconds:0,brawlerItems:0});unlimited.tick=40*900;a.step(unlimited,[]);assert.equal(unlimited.phase,'playing');assert.equal(unlimited.players[0].stocks,-1);
 const timed=a.create(1,true,[1,4],1,undefined,'time',{brawlerSeconds:2,brawlerItems:0});timed.players[1].nativeKos=3;for(let n=0;n<79;n++)a.step(timed,[]);assert.equal(timed.phase,'playing');a.step(timed,[]);assert.equal(timed.phase,'finished');assert.equal(timed.winner,4);assert.deepEqual(timed.ranks,[4,1]);assert(a.valid(timed));
});
test('all six native item frequencies validate; off disables generation and high uses the original interval/probability',()=>{
 for(let f=0;f<=5;f++){const s=a.create(1,true,[1,4],31,undefined,'time',{brawlerSeconds:0,brawlerItems:f});for(let i=0;i<8000;i++)a.step(s,[]);assert(a.valid(s));if(f===0){assert.equal(s.items.length,0);assert.equal(s.nextItem,0);assert.equal(s.seed,31);}else {assert(s.nextSpawn>8000*25);assert.notEqual(s.seed,31);if(f===5)assert(s.nextItem>0);}}
});
test('controller-only rule edits reject malformed input atomically, clear ready and survive reconnect/reseat/full-delta',()=>{
 const {engine,r,p,q,v}=room();assert.equal(engine.options(r,q,{brawlerStocks:2}),false);assert.equal(engine.options(r,v,{brawlerItems:5}),false);
 for(const patch of [{brawlerStocks:0},{brawlerStocks:1.5},{brawlerSeconds:-1},{brawlerSeconds:NaN},{brawlerItems:6},{brawlerItems:null},{brawlerItems:'3'}]){const before=JSON.stringify(r.auth.state);assert.equal(engine.options(r,p,patch),false);assert.equal(JSON.stringify(r.auth.state),before);}
 p.ready=true;assert(engine.options(r,p,{brawlerStocks:9,brawlerItems:5}));assert.equal(p.ready,false);assert.equal(r.auth.state.options.stocks,9);assert(engine.options(r,p,{gameMode:'time',brawlerSeconds:30}));engine.reconnect(r,p);assert.equal(r.auth.state.options.seconds,30);
 const before=structuredClone(r.auth.state);assert(engine.options(r,p,{brawlerItems:0}));assert.deepEqual(protocol.applyUpdate(before,protocol.createUpdate(before,r.auth.state,1000)),r.auth.state);
 assert(engine.options(r,p,{gameMode:'stock'}));assert.equal(r.auth.state.options.stocks,5);assert(engine.options(r,p,{gameMode:'time'}));assert.equal(r.auth.state.options.seconds,300);
});
test('pause/continue/menu actions are server-authoritative, replay-protected and freeze time/physics/animations',()=>{
 const {engine,r,p,q,v}=room();assert(engine.options(r,p,{gameMode:'time',brawlerSeconds:30}));p.ready=q.ready=true;engine.onRoom(r);const s=r.auth.state,round=s.round;
 a.step(s,[empty({right:true})]);a.step(s,[empty({right:true})]);assert(s.players[0].grounded);assert(s.players[0].vx>0);
 assert.equal(engine.gameAction(r,v,{round,seq:1,action:'pause'}),false);assert(engine.gameAction(r,p,{round,seq:1,action:'pause'}));const frozen=structuredClone(s);for(let n=0;n<80;n++)a.step(s,[empty({up:true,alt:1})]);assert.deepEqual(s,frozen);
 assert.equal(engine.gameAction(r,p,{round,seq:1,action:'pause'}),false);assert(engine.gameAction(r,q,{round,seq:1,action:'pause'}));a.step(s,[]);assert.equal(s.tick,3);assert.equal(s.players[0].vx,0);assert.equal(s.players[0].state,'stop');assert(engine.gameAction(r,p,{round,seq:2,action:'menu'}));assert.equal(r.auth.state.phase,'waiting');assert.equal(p.ready,false);assert.equal(q.ready,false);assert.equal(r.auth.state.options.seconds,30);assert.equal(engine.gameAction(r,p,{round,seq:3,action:'pause'}),false);
 const thrown=r.auth.state.players[0];thrown.state='thrown';thrown.controlLoss=999;thrown.vx=5;thrown.vy=-8;a.consumeInput(r.auth.state,1,empty());assert.equal(thrown.vx,5);assert.equal(thrown.state,'thrown');
});
test('malformed match clocks, rankings, rule ranges and paused phases fail closed in full/delta recovery',()=>{
 const base=a.create(1,true,[1,4],1,undefined,'time',{brawlerSeconds:30});
 for(const edit of [s=>s.remaining=29,s=>s.options.itemFrequency=6,s=>s.options.stocks=0,s=>s.ranks=[7],s=>{s.phase='finished';s.ranks=[1,4];s.winner=7;},s=>{s.phase='waiting';s.paused=true;},s=>s.numDead=1,s=>s.actionAck=[0]]){const bad=structuredClone(base);edit(bad);assert.equal(a.valid(bad),false);assert.equal(protocol.applyUpdate(base,protocol.createUpdate(null,bad,1000,true)),null);}
});
