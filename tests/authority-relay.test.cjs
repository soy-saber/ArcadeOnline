"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {spawn}=require("node:child_process");
const path=require("node:path");
const WS=require("ws");
const protocolOutput=path.join(__dirname,"../artifacts/authority-relay/protocol.cjs");
require("esbuild").buildSync({entryPoints:[path.join(__dirname,"../src/authority/protocol.ts")],outfile:protocolOutput,bundle:true,platform:"node",format:"cjs"});
const {applyUpdate}=require(protocolOutput);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test("authority WS enforces seats/admin, retained ready and creator-independent rounds",async()=>{
  const port=27000+Math.floor(Math.random()*1000),clients=[];
  let logs="";
  const server=spawn(process.execPath,["server.js"],{cwd:path.join(__dirname,".."),env:{...process.env,PORT:String(port)},windowsHide:true,stdio:["ignore","pipe","pipe"]});
  server.stderr.on("data",data=>logs+=data);
  async function until(check){for(let i=0;i<150;i++){if(await check())return;await wait(30);}throw Error("timeout "+logs);}
  async function join(name){
    const ws=new WS(`ws://127.0.0.1:${port}`),client={ws,id:null,state:null,room:null,messages:[],ack:true};clients.push(client);
    ws.on("message",raw=>{const msg=JSON.parse(raw);client.messages.push(msg);if(msg.t==="welcome")client.id=msg.id;if(msg.t==="state")client.room=msg;if(msg.t==="auth"){
      const next=applyUpdate(client.state,msg);assert(next,"valid snapshot/delta");client.state=next;
      if(client.ack)ws.send(JSON.stringify({t:"authAck",round:msg.round,tick:msg.tick,hash:msg.hash}));
    }});
    await new Promise((resolve,reject)=>{ws.on("open",resolve);ws.on("error",reject);});
    ws.send(JSON.stringify({t:"join",gameId:"3881-server",room:"auth-test",name}));await until(()=>client.id&&client.state);return client;
  }
  const send=(client,message)=>client.ws.send(JSON.stringify(message));
  try{
    await until(async()=>{try{return(await fetch(`http://127.0.0.1:${port}/healthz`)).ok;}catch{return false;}});
    const a=await join("a"),b=await join("b"),c=await join("c");
    assert.equal(a.room.hostId,null);assert.equal(a.room.controllerId,a.id);
    send(a,{t:"authOptions",map:"candy",loadout:"none"});await until(()=>b.state.options.map==="candy");
    send(b,{t:"authOptions",map:"desert"});await wait(80);assert.equal(a.state.options.map,"candy");
    send(a,{t:"sit",seat:1});send(b,{t:"sit",seat:2});await until(()=>a.room.seats[2]===b.id);
    send(a,{t:"ready",ready:true});send(b,{t:"ready",ready:true});await until(()=>b.state.phase==="playing");
    const start=b.state.tick; a.ack=false;await until(()=>b.state.tick>start+10);
    assert.equal(a.room.members.find(m=>m.id===a.id).ready,true);
    send(c,{t:"sit",seat:3});await until(()=>b.state.phase==="waiting");
    assert(b.room.members.find(m=>m.id===a.id).ready);assert(b.room.members.find(m=>m.id===b.id).ready);assert(!b.room.members.find(m=>m.id===c.id).ready);
    send(c,{t:"ready",ready:true});await until(()=>b.state.phase==="playing"&&b.state.options.activeSeats.length===3);
    send(c,{t:"leaveSeat"});await until(()=>b.state.phase==="playing"&&b.state.options.activeSeats.length===2);
    const tick=b.state.tick;send(c,{t:"authInput",round:b.state.round,serverTime:Date.now(),input:{seq:999,dir:0,bomb:999}});
    await until(()=>b.state.tick>tick+3);assert.equal(b.state.bombs.length,0);
    // A client cannot submit authoritative state even if it created the room.
    send(b,{t:"auth",kind:"full",state:{...b.state,winner:2,phase:"finished"}});await wait(80);assert.equal(b.state.phase,"playing");
    send(b,{t:"authInput",round:b.state.round,serverTime:Date.now(),input:{seq:1,dir:-1,bomb:1}});
    await until(()=>b.state.bombs.some(bomb=>bomb.owner===2));
    const beforeFull=b.messages.filter(m=>m.t==="auth"&&m.kind==="full").length;send(b,{t:"authResync"});
    await until(()=>b.messages.filter(m=>m.t==="auth"&&m.kind==="full").length>beforeFull);
    assert.equal(logs,"");
  }finally{for(const c of clients)c.ws.close();server.kill();}
});
