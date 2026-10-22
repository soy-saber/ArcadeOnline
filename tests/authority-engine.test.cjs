"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const out=path.join(__dirname,"../artifacts/authority-tests/engine.cjs");
require("esbuild").buildSync({entryPoints:[path.join(__dirname,"../src/authority/engine.ts")],outfile:out,bundle:true,platform:"node",format:"cjs"});
const {AuthorityEngine}=require(out);
function setup(gameId="3881-server") {
  const engine=new AuthorityEngine(()=>{});
  const room={gameId,seats:{1:"a",2:"b",...(gameId==="3881-server"?{3:null,4:null}:{})},members:new Map()};
  for(const [id,seat] of [["a",1],["b",2]]) room.members.set(id,{id,seat,ready:true,ws:{readyState:1,bufferedAmount:0,messages:[],send(text){this.messages.push(JSON.parse(text));},close(){this.closed=true;}}});
  engine.onRoom(room); return {engine,room};
}
test("server progresses independently of creator and readiness survives roster changes",()=>{
  const {engine,room}=setup(); assert.equal(room.auth.state.phase,"playing");
  const first=room.auth.state.round,at=room.auth.clock;
  room.members.get("a").ws=null; engine.pump(room,at+60);
  assert(room.auth.state.tick>=1); assert.equal(room.auth.state.round,first);
  room.members.set("c",{id:"c",seat:3,ready:false,ws:null}); room.seats[3]="c"; engine.onRoom(room);
  assert.equal(room.auth.state.phase,"waiting"); assert(room.members.get("a").ready && room.members.get("b").ready);
  room.members.get("c").ready=true; engine.onRoom(room); assert.equal(room.auth.state.phase,"playing");
  room.members.get("c").seat=null;room.members.get("c").ready=false;room.seats[3]=null;engine.onRoom(room);
  assert.equal(room.auth.state.phase,"playing"); assert.deepEqual(room.auth.state.options.activeSeats,[1,2]);
});
test("finished rounds automatically continue; personal unready only gates next round",()=>{
  const {engine,room}=setup("46923-server");
  const old=room.auth.state.round; room.auth.state.phase="finished"; room.auth.nextRoundAt=1000;
  engine.pump(room,1001);assert.equal(room.auth.state.phase,"playing");assert(room.auth.state.round>old);
  room.members.get("b").ready=false;engine.onRoom(room);assert.equal(room.auth.state.phase,"playing");
  room.auth.state.phase="finished";room.auth.nextRoundAt=2000;engine.pump(room,2001);
  assert.equal(room.auth.state.phase,"waiting");assert(room.members.get("a").ready);
  room.members.get("b").ready=true;engine.onRoom(room);assert.equal(room.auth.state.phase,"playing");
});
test("slow consumers receive bounded updates, ACK establishes delta baseline, periodic full repairs drift",()=>{
  const {engine,room}=setup(); const member=room.members.get("b"),now=room.auth.clock;
  engine.publish(room,now);assert.equal(member.ws.messages.length,1);
  for(let i=1;i<=20;i++)engine.pump(room,now+i*30);
  assert.equal(member.ws.messages.length,1);
  const full=member.ws.messages[0];engine.ack(room,member,full);engine.publish(room,now+610);
  assert.equal(member.ws.messages[1].kind,"delta"); assert.equal(member.ws.messages[1].base,full.tick);
  engine.ack(room,member,member.ws.messages[1]);engine.publish(room,now+6000);
  assert.equal(member.ws.messages[2].kind,"full");
  engine.publish(room,now+8100);assert(member.ws.closed);
});
test("expired inputs do not resurrect attacks and long machine stalls have bounded work",()=>{
  const {engine,room}=setup();const member=room.members.get("b"),now=room.auth.clock;
  engine.input(room,member,{round:room.auth.state.round,serverTime:now-2000,input:{seq:1,dir:0,bomb:1}},now);
  assert.equal(room.auth.inputs.get(member.id).input.seq,1);assert.equal(room.auth.state.players[1].lastBomb,1);
  engine.input(room,member,{round:room.auth.state.round,serverTime:now+10,input:{seq:2,dir:-1,bomb:1}},now+10);
  engine.pump(room,now+40);assert.equal(room.auth.state.bombs.length,0);
  const before=room.auth.state.tick;engine.pump(room,now+10000);assert(room.auth.state.tick-before<=2);
});
test("late or reordered attacks are tombstoned and cannot fire on recovery",()=>{
  const {engine,room}=setup(),member=room.members.get("b"),now=room.auth.clock,round=room.auth.state.round;
  engine.input(room,member,{round,serverTime:now-300,input:{seq:10,dir:-1,bomb:1}},now);
  engine.input(room,member,{round,serverTime:now+10,input:{seq:9,dir:-1,bomb:2}},now+10);
  engine.pump(room,now+40);assert.equal(room.auth.state.bombs.length,0);assert.equal(room.auth.state.ack[1],10);
  engine.input(room,member,{round,serverTime:now+50,input:{seq:11,dir:-1,bomb:2}},now+50);
  engine.pump(room,now+400);assert.equal(room.auth.state.bombs.length,0);assert.equal(room.auth.state.players[1].lastBomb,2);
});
test("a burst of expired packets consumes every stale action despite input throttling",()=>{
  const {engine,room}=setup(),member=room.members.get("b"),now=room.auth.clock,round=room.auth.state.round;
  engine.input(room,member,{round,serverTime:now-1000,input:{seq:1,dir:-1,bomb:1}},now);
  engine.input(room,member,{round,serverTime:now-1000,input:{seq:2,dir:-1,bomb:2}},now+1);
  engine.input(room,member,{round,serverTime:now+10,input:{seq:3,dir:-1,bomb:2}},now+10);
  engine.pump(room,now+40);assert.equal(room.auth.state.bombs.length,0);assert.equal(room.auth.state.players[1].lastBomb,2);
});
test("badminton reconnect neutralizes the previous held movement",()=>{
  const {engine,room}=setup("46923-server"),member=room.members.get("b"),now=room.auth.clock;
  engine.input(room,member,{round:room.auth.state.round,serverTime:now,input:{seq:10,left:true,right:false,jump:0,hit:0}},now);
  engine.pump(room,now+40);const x=room.auth.state.players[1].x;
  engine.reconnect(room,member);engine.pump(room,now+80);
  assert.equal(room.auth.state.players[1].x,x);
});
test("reconnect discards a buffered special attack instead of executing it later",()=>{
  const {engine,room}=setup(),member=room.members.get("b"),now=room.auth.clock;
  const player=room.auth.state.players[1];player.weapon="rocket";player.ammo=2;player.moveDir=0;player.moveTicks=20;player.progress=0;
  engine.input(room,member,{round:room.auth.state.round,serverTime:now,input:{seq:1,dir:-1,bomb:1}},now);
  engine.pump(room,now+35);assert.equal(player.lastBomb,0);
  engine.reconnect(room,member);
  for(let i=2;i<=26;i++)engine.pump(room,now+i*35);
  assert.equal(player.ammo,2);assert.equal(room.auth.state.specials.length,0);assert.equal(player.lastBomb,1);
});
