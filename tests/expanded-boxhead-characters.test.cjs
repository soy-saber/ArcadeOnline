'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);return m.exports;}
const {adapter:a}=load('../src/expanded/boxhead.ts'),{AuthorityEngine}=load('../src/authority/engine.ts'),protocol=load('../src/authority/protocol.ts');
function room(gameId='50737-server'){const engine=new AuthorityEngine(()=>{}),a={id:'a',seat:1,ready:false,ws:null},b={id:'b',seat:4,ready:false,ws:null},v={id:'v',seat:null,ready:false,ws:null},room={gameId,seats:{1:'a',2:null,3:null,4:'b'},members:new Map([['a',a],['b',b],['v',v]])};engine.onRoom(room);return {engine,room,a,b,v};}
test('all18 maps support original four character choices, duplicates and sparse seats without changing controls or player identity',()=>{
 assert.deepEqual(a.characterIds,['swat','bond','gijoe','bambo']);assert(a.duplicateCharacters);
 for(const map of a.maps)for(const seats of [[1],[2,4],[1,2,3,4]])for(const characters of [[4,3,2,1],...[1,2,3,4].map(c=>Array(4).fill(c))]){
  const s=a.create(10,true,seats,42,map.id,undefined,{characters});assert(a.valid(s));assert.deepEqual(s.options.characters,characters);assert.deepEqual(s.players.map(p=>p.character),seats.map(seat=>a.characterIds[characters[seat-1]-1]));
  for(let i=1;i<=4;i++)a.step(s,seats.map(()=>undefined));assert(a.valid(s));assert.deepEqual(s.players.map(p=>p.seat),seats);
 }
});
test('each seated player controls their character independently, including matching characters; map/roster changes and reconnect preserve the selection',()=>{
 const {engine,room:r,a,b,v}=room();assert.equal(engine.character(r,v,4),false);assert(engine.character(r,a,4));assert(engine.character(r,b,4));assert.deepEqual(r.auth.state.players.map(p=>p.character),['bambo','bambo']);
 assert(engine.options(r,a,{map:'original-18'}));assert.deepEqual(r.auth.state.players.map(p=>p.character),['bambo','bambo']);assert.equal(r.auth.state.mapId,'original-18');
 const newcomer={id:'c',seat:2,ready:false,ws:null};r.members.set('c',newcomer);r.seats[2]='c';engine.onRoom(r);assert.deepEqual(r.auth.state.players.map(p=>[p.seat,p.character]),[[1,'bambo'],[2,'bond'],[4,'bambo']]);
 engine.reconnect(r,a);assert.equal(r.auth.state.players[0].character,'bambo');const before=JSON.stringify(r.auth.state);for(const value of [0,5,1.5,'1',null,NaN])assert.equal(engine.character(r,a,value),false);assert.equal(JSON.stringify(r.auth.state),before);
 for(const m of [a,b,newcomer])m.ready=true;engine.onRoom(r);assert.equal(r.auth.state.phase,'playing');const round=r.auth.state.round;assert.equal(engine.character(r,a,1),false);assert.equal(r.auth.state.round,round);assert.equal(r.auth.state.players[0].character,'bambo');
});
test('selected character options and sprite identity survive full/delta recovery; malformed or mismatched selections are rejected',()=>{
 const s=a.create(10,true,[1,4],42,'original-01',undefined,{characters:[3,2,1,3]}),full=protocol.createUpdate(null,s,1000,true),before=JSON.parse(JSON.stringify(s));let client=protocol.applyUpdate(null,full);assert.deepEqual(client,s);a.step(s,[]);client=protocol.applyUpdate(client,protocol.createUpdate(before,s,1040));assert.deepEqual(client,s);
 for(const edit of [x=>delete x.options,x=>x.options.characters=[1,2,3],x=>x.options.characters=[1,2,3,5],x=>x.options.characters=[1,2,3,'4'],x=>x.players[0].character='bond']){const bad=JSON.parse(JSON.stringify(s));edit(bad);assert.equal(a.valid(bad),false);assert.equal(protocol.applyUpdate(client,protocol.createUpdate(null,bad,1100,true)),null);}
});
test('numeric bomb character selection retains its existing uniqueness rule',()=>{
 for(const gameId of ['3881-server','9109-server']){const {engine,room:r,a,b}=room(gameId);assert.equal(engine.character(r,a,4),false);assert(engine.character(r,a,3));assert.equal(engine.character(r,b,3),false);assert.equal(r.auth.state.players.find(p=>p.seat===1).character,3);}
});
