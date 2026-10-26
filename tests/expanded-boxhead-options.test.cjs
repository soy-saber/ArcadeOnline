'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);return m.exports;}
const {adapter:a}=load('../src/expanded/boxhead.ts'),{AuthorityEngine}=load('../src/authority/engine.ts'),protocol=load('../src/authority/protocol.ts'),fixture=require('./fixtures/boxhead-options-source.json');
function setup(){const engine=new AuthorityEngine(()=>{}),p={id:'a',seat:1,ready:false,ws:null},v={id:'v',seat:null,ready:false,ws:null},room={gameId:a.id,seats:{1:'a',2:null,3:null,4:null},members:new Map([['a',p],['v',v]])};engine.onRoom(room);return {engine,room,p,v};}
test('all four source difficulty presets start the actual native wave/multiplier and corresponding earned weapon tier',()=>{
 const unlocked=[[0],[0,1,2],[0,1,2,3,4,5],[0,1,2,3,4,5,6,7]];assert.deepEqual(a.characters,fixture.characters.map(c=>c.name));
 for(const [i,preset]of a.difficulties.entries())for(const mode of ['single','coop']){
  const tier=fixture.tiers[i],seats=mode==='single'?[1]:[1,3,4],s=a.create(1,true,seats,42,'original-18',mode,{difficulty:preset.id,characters:[4,3,2,1]});assert(a.valid(s));assert.equal(s.wave,0);assert.equal(s.combo,tier.multiplier);assert.equal(s.peakCombo,tier.multiplier);assert.equal(s.message,'');assert.deepEqual(s.players[0].unlocked.map((v,j)=>v?j:-1).filter(j=>j>=0),unlocked[i]);assert.equal(s.players[0].weapon,0);assert.equal(s.players[0].character,'bambo');
  a.step(s,[]);assert.equal(s.wave,tier.firstWave);assert.equal(s.spawnLeft,10+5*(tier.firstWave-1));assert.equal(s.peakCombo,tier.multiplier);assert(a.valid(s));
 }
});
test('single admission is P1 only; selecting mode clears old readiness and one ready human starts authority',()=>{
 const {engine,room,p}=setup();p.ready=true;engine.onRoom(room);assert.equal(room.auth.state.phase,'waiting');assert(engine.options(room,p,{map:'original-01',gameMode:'single',difficulty:'beginner'}));assert.equal(p.ready,false);assert.equal(engine.canSit(room,1),true);for(const seat of [2,3,4])assert.equal(engine.canSit(room,seat),false);
 p.ready=true;engine.onRoom(room);assert.equal(room.auth.state.phase,'playing');assert.equal(room.auth.state.mode,'single');assert.equal(room.auth.state.players.length,1);assert.equal(room.auth.state.players[0].seat,1);const round=room.auth.state.round;engine.pump(room,room.auth.clock+80);assert(room.auth.state.tick>0);assert.equal(engine.options(room,p,{map:'original-02',gameMode:'coop',difficulty:'expert'}),false);assert.equal(room.auth.state.round,round);
});
test('mode/capacity/difficulty validation rejects spectators, unknown values, occupied higher seats and forged single rosters',()=>{
 const {engine,room,p,v}=setup(),before=JSON.stringify(room.auth.state);for(const message of [{map:'original-01',gameMode:'single',difficulty:'beginner'},{map:'original-01',gameMode:'coop',difficulty:'nightmare'}])assert.equal(engine.options(room,v,message),false);
 for(const patch of [{difficulty:'easy'},{difficulty:3},{gameMode:'bogus'},{map:'outside'}])assert.equal(engine.options(room,p,{map:'original-01',gameMode:'coop',difficulty:'beginner',...patch}),false);assert.equal(JSON.stringify(room.auth.state),before);
 room.seats[4]='b';room.members.set('b',{id:'b',seat:4,ready:false,ws:null});engine.onRoom(room);assert.equal(engine.options(room,p,{map:'original-01',gameMode:'single',difficulty:'beginner'}),false);assert(engine.options(room,p,{map:'original-01',gameMode:'coop',difficulty:'expert'}));assert.equal(room.auth.state.options.difficulty,'expert');assert.equal(a.valid(a.create(1,true,[1,4],42,'original-01','single')),false);
});
test('selected difficulty and solo/coop mode survive snapshot recovery with native weapon upgrades intact',()=>{
 const s=a.create(1,true,[1],42,'original-17','single',{difficulty:'nightmare'}),before=JSON.parse(JSON.stringify(s));let client=protocol.applyUpdate(null,protocol.createUpdate(null,s,1000,true));assert.deepEqual(client,s);for(let i=1;i<=5;i++)a.step(s,[]);client=protocol.applyUpdate(client,protocol.createUpdate(before,s,1200));assert.deepEqual(client,s);assert.equal(client.mode,'single');assert.equal(client.options.difficulty,'nightmare');assert.equal(client.wave,35);assert.equal(client.peakCombo,50);
 for(const edit of [x=>x.mode='unknown',x=>x.options.difficulty='unknown',x=>x.players.push({...x.players[0],seat:2}),x=>x.players[0]=null]){const bad=JSON.parse(JSON.stringify(s));edit(bad);assert.equal(a.valid(bad),false);assert.equal(protocol.applyUpdate(client,protocol.createUpdate(null,bad,1300,true)),null);}
});
