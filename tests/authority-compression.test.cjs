'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path'),Module=require('node:module'),WS=require('ws');
const root=path.resolve(__dirname,'..'),file=path.join(root,'src/authority/protocol.ts'),m=new Module(file,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[file],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,file);const {applyUpdate}=m.exports;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('four largest-map clients negotiate bounded compression and recover exact AI states; local fallback remains compatible',async()=>{
 const port=30000+Math.floor(Math.random()*1000),clients=[],errors=[],origin=process.env.COMPRESSION_BASE_URL||`http://127.0.0.1:${port}`,external=!!process.env.COMPRESSION_BASE_URL,room='compress-'+Date.now().toString(36);let logs='';
 const server=external?null:spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});server?.stderr.on('data',data=>logs+=data);
 async function until(check){const deadline=Date.now()+20000;while(Date.now()<deadline){if(errors.length)throw errors[0];if(await check())return;await wait(25);}throw Error('Timeout: '+logs);}
 function send(c,msg){c.ws.send(JSON.stringify(msg));}
 async function join(index,compressed=true){
  const ws=new WS(origin.replace(/^http/,'ws'),{perMessageDeflate:compressed}),c={ws,state:null,id:null,rawBytes:0,full:0,delta:0,errors:[]};clients.push(c);
  ws.on('error',error=>errors.push(error));
  ws.on('message',raw=>{try{c.rawBytes+=raw.length;const msg=JSON.parse(raw);if(msg.t==='welcome')c.id=msg.id;if(msg.t==='auth'){const next=applyUpdate(c.state,msg);assert(next,'valid complete state after transparent decompression');c.state=next;c[msg.kind]++;send(c,{t:'authAck',round:msg.round,tick:msg.tick,hash:msg.hash});}}catch(error){errors.push(error);}});
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  c.startWire=ws._socket.bytesRead;assert.equal(ws.extensions.includes('permessage-deflate'),compressed);
  send(c,{t:'join',gameId:'50737-server',room,name:'Compression P'+index});await until(()=>c.state&&c.id);return c;
 }
 try{
  await until(async()=>{try{return(await fetch(origin+'/healthz')).ok;}catch{return false;}});
  for(let i=1;i<=4;i++)await join(i);
  const plain=external?null:await join(5,false);send(clients[0],{t:'authOptions',map:'original-18'});await until(()=>clients.every(c=>c.state.mapId==='original-18'));
  for(let i=0;i<4;i++)send(clients[i],{t:'sit',seat:i+1});await until(()=>clients.every(c=>c.state.players.length===4));
  for(const c of clients.slice(0,4))send(c,{t:'ready',ready:true});
  await until(()=>clients.every(c=>c.state.phase==='playing'&&c.state.tick>=30&&c.state.zombies.some(z=>z.ai.registered&&z.ai.collidable)));
  for(const c of clients){const full=c.full;send(c,{t:'authResync'});await until(()=>c.full>full);assert(c.state.navigation.tags.length>7000);assert(c.state.zombies.every(z=>z.ai));assert(c.delta>0);}
  const stats=clients.map((c,i)=>({compressed:i<4,wireBytes:c.ws._socket.bytesRead-c.startWire,decodedBytes:c.rawBytes,full:c.full,delta:c.delta}));
  for(const s of stats.slice(0,4))assert(s.wireBytes<s.decodedBytes*.25,JSON.stringify(s));
  if(plain){assert(stats[4].wireBytes>=stats[4].decodedBytes*.95);assert.equal(plain.ws.extensions,'');}assert.equal(logs,'');assert.deepEqual(errors,[]);console.log('Largest-map WebSocket wire measurements: '+JSON.stringify(stats));
 }finally{for(const c of clients)c.ws.terminate();server?.kill();}
});
