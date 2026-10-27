'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);return m.exports;}
const {adapter:a}=load('../src/expanded/brawler.ts'),{AuthorityEngine}=load('../src/authority/engine.ts'),protocol=load('../src/authority/protocol.ts'),source=require('./fixtures/brawler-characters-source.json'),data=require('../src/expanded/brawler-data.json');
const input={seq:1,left:false,right:true,up:false,down:false,attack:0,alt:0};
function room(){const engine=new AuthorityEngine(()=>{}),p={id:'a',seat:1,ready:false,ws:null},q={id:'b',seat:4,ready:false,ws:null},v={id:'v',seat:null,ready:false,ws:null},r={gameId:a.id,seats:{1:'a',2:null,3:null,4:'b'},members:new Map([['a',p],['b',q],['v',v]])};engine.onRoom(r);return {engine,r,p,q,v};}
test('six selectable source fighters, including fifth/sixth and equal characters, retain original constructor speed on every arena',()=>{
 assert.equal(a.characters.length,6);assert.deepEqual(a.characterIds,[0,1,2,3,4,5]);assert(a.duplicateCharacters);assert.deepEqual(data.fighters.map(c=>c.id),source.fighters.map(c=>c.id));
 for(const map of a.maps)for(let choice=1;choice<=6;choice++){
  const s=a.create(1,true,[1,4],42,map.id,undefined,{characters:Array(4).fill(choice)});assert(a.valid(s));assert.deepEqual(s.players.map(p=>p.character),[choice-1,choice-1]);a.step(s,[input]);assert.equal(s.players[0].vx,8*source.fighters[choice-1].speed);assert(a.valid(s));
 }
});
test('authority admits choices5/6 and numeric zero identity, preserves them across map/roster/reconnect, and rejects invalid or unseated changes',()=>{
 const {engine,r,p,q,v}=room();assert.equal(engine.character(r,v,6),false);assert(engine.character(r,p,6));assert(engine.character(r,q,6));assert.deepEqual(r.auth.state.players.map(p=>p.character),[5,5]);assert(engine.character(r,p,1));assert.equal(r.auth.state.players[0].character,0);
 assert(engine.options(r,p,{map:'Space'}));engine.reconnect(r,p);assert.deepEqual(r.auth.state.players.map(p=>p.character),[0,5]);const n={id:'c',seat:2,ready:false,ws:null};r.members.set('c',n);r.seats[2]='c';engine.onRoom(r);assert.deepEqual(r.auth.state.players.map(p=>p.character),[0,1,5]);
 const before=JSON.stringify(r.auth.state);for(const x of [0,7,1.5,'6',null,NaN])assert.equal(engine.character(r,p,x),false);assert.equal(JSON.stringify(r.auth.state),before);for(const m of [p,q,n])m.ready=true;engine.onRoom(r);assert.equal(r.auth.state.phase,'playing');assert.equal(engine.character(r,p,5),false);
});
test('selected zero/fifth/sixth fighter identity and settings round-trip through full/delta; forged character or malformed settings fail closed',()=>{
 const s=a.create(1,true,[1,4],42,undefined,undefined,{characters:[1,2,3,6]}),before=structuredClone(s);let client=protocol.applyUpdate(null,protocol.createUpdate(null,s,1000,true));assert.deepEqual(client,s);a.step(s,[input]);client=protocol.applyUpdate(client,protocol.createUpdate(before,s,1034));assert.deepEqual(client,s);
 for(const edit of [s=>delete s.options,s=>s.options.characters=[1,2,3],s=>s.options.characters[3]=7,s=>s.options.characters[0]='1',s=>s.players[0].character=6,s=>s.players[0].character=1]){const bad=structuredClone(s);edit(bad);assert.equal(a.valid(bad),false);assert.equal(protocol.applyUpdate(client,protocol.createUpdate(null,bad,1100,true)),null);}
});
