"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),path=require("node:path");
const esbuild=require("esbuild");
function load(file,name){const out=path.join(__dirname,`../artifacts/records-tests/${name}.cjs`);esbuild.buildSync({entryPoints:[path.join(__dirname,file)],outfile:out,bundle:true,platform:"node",format:"cjs"});return require(out);}
const core=load("../src/authority/bomb-core.ts","core"),{AuthorityEngine}=load("../src/authority/engine.ts","engine");
function arena(){const state=core.createGame(123,100,true,{mode:"online",activeSeats:[1,2,3,4]});state.board.fill(0);for(let i=0;i<4;i++){state.players[i].invulnerable=0;state.players[i].x=3+i*3;state.players[i].y=3;}return state;}
const empty=Array(4).fill(core.EMPTY_INPUT);
test("ordinary blasts grow one cell per tick; shields precede extra online lives and final death ownership",()=>{
  const state=arena();state.players[1].x=4;state.players[1].shield=true;state.players[1].life=2;
  state.bombs=[{id:1,x:3,y:3,owner:1,range:2,explodeAt:1}];core.step(state,empty);
  assert.equal(state.players[0].killedBy,1);assert(!state.players[0].alive);assert(state.players[1].alive);assert.equal(state.players[1].killedBy,0);
  core.step(state,empty);assert(state.players[1].alive);assert.equal(state.players[1].life,2);assert.equal(state.players[1].shield,false);
  state.players[1].invulnerable=0;core.step(state,empty);assert(state.players[1].alive);assert.equal(state.players[1].life,1);assert.equal(state.players[1].killedBy,0);
  state.players[1].invulnerable=0;core.step(state,empty);assert(!state.players[1].alive);assert.equal(state.players[1].life,0);assert.equal(state.players[1].killedBy,1);
});
test("a chained bomb owns its new rays and lingering fire retains attribution",()=>{
  const state=arena();state.players[0].x=0;state.players[0].y=0;state.players[1].x=0;state.players[1].y=12;state.players[2].x=8;state.players[2].y=3;
  state.bombs=[{id:1,x:3,y:3,owner:1,range:2,explodeAt:1},{id:2,x:5,y:3,owner:2,range:3,explodeAt:100}];
  for(let n=0;n<6;n++)core.step(state,empty);assert.equal(state.players[2].killedBy,2);
  state.players[3].x=8;state.players[3].y=3;core.step(state,empty);assert.equal(state.players[3].killedBy,2);
});
test("rocket, mine, grenade and fire report their owner's lethal damage",()=>{
  for(const kind of ["rocket","mine","grenade","fire"]){
    const state=arena();state.players[0].x=0;state.players[0].y=0;state.players[1].x=4;state.players[1].y=3;
    state.specials=[{id:1,kind,owner:1,x:kind==="grenade"?2:kind==="mine"?4:3,y:3,dir:2,born:kind==="grenade"?-17:kind==="fire"?-3:0,until:kind==="grenade"?1:49,distance:0}];
    for(let i=0;i<8&&state.players[1].alive;i++)core.step(state,empty);
    assert(!state.players[1].alive,kind);assert.equal(state.players[1].killedBy,1,kind);
  }
});
test("room totals count each death once, carry across rounds/seats and never award self kills",()=>{
  const engine=new AuthorityEngine(()=>{}),room={gameId:"3881-server",seats:{1:"a",2:"b",3:null,4:null},members:new Map([["a",{id:"a",name:"Alice",seat:1,ready:true,ws:null}],["b",{id:"b",name:"Bob",seat:2,ready:true,ws:null}]])};
  engine.onRoom(room);const state=room.auth.state;state.board.fill(0);state.players.forEach(p=>p.invulnerable=0);state.players[0].x=2;state.players[0].y=3;state.players[1].x=8;state.players[1].y=3;
  state.bombs=[{id:1,x:7,y:3,owner:1,range:2,explodeAt:1}];const now=room.auth.clock;engine.pump(room,now+60);
  let records=engine.info(room).records;assert.deepEqual(records.find(x=>x.id==="a"),{id:"a",name:"Alice",kills:1,deaths:0,wins:1,rounds:1});assert.equal(records.find(x=>x.id==="b").deaths,1);
  engine.pump(room,now+80);assert.equal(engine.info(room).records.find(x=>x.id==="a").kills,1);
  engine.pump(room,now+3100);assert.equal(engine.info(room).records.find(x=>x.id==="a").kills,1);
  const next=room.auth.state;next.board.fill(0);next.players.forEach(p=>p.invulnerable=0);next.bombs=[{id:1,x:next.players[0].x,y:next.players[0].y,owner:1,range:1,explodeAt:1}];engine.pump(room,room.auth.clock+40);
  records=engine.info(room).records;assert.equal(records.find(x=>x.id==="a").kills,1);assert.equal(records.find(x=>x.id==="a").deaths,1);assert.equal(records.find(x=>x.id==="b").wins,1);
  room.members.get("b").seat=null;room.members.get("b").ready=false;room.seats[2]=null;engine.onRoom(room);assert.equal(engine.info(room).records.find(x=>x.id==="b").wins,1);
});
