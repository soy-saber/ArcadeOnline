'use strict';
// Bounded HTTPS payload throughput from this machine to the deployed origin.
// Direct IPv4, normal certificate verification, no proxy and no compression.
const https=require('node:https'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..'),origin=new URL(process.argv[2]||'https://223.109.141.251'),output=path.resolve(root,process.argv[3]||'artifacts/public-bandwidth.json');
assert.equal(origin.protocol,'https:');
const asset='/authority/game.js',local=Buffer.from(fs.readFileSync(path.join(root,'public',asset),'utf8').replace(/\r\n/g,'\n')),expected=crypto.createHash('sha256').update(local).digest('hex'),round=n=>Math.round(n*100)/100;
let requestId=0;
function download(agent){return new Promise((resolve,reject)=>{
 const start=performance.now(),hash=crypto.createHash('sha256');let bytes=0,firstByte=null,connect=null,tls=null;
 const url=new URL(asset,origin);url.searchParams.set('bandwidth',Date.now()+'-'+(++requestId));
 const req=https.get(url,{agent,family:4,headers:{'Accept-Encoding':'identity','Cache-Control':'no-cache','User-Agent':'ArcadeOnline-bandwidth-check/1.0'}},res=>{
  try{assert.equal(res.statusCode,200);assert(!res.headers['content-encoding']||res.headers['content-encoding']==='identity','Server must return uncompressed payload');}catch(e){res.resume();reject(e);return;}
  res.on('data',chunk=>{if(firstByte===null)firstByte=performance.now()-start;bytes+=chunk.length;hash.update(chunk);});
  res.on('error',reject);res.on('aborted',()=>reject(Error('Response aborted')));
  res.on('end',()=>{try{assert.equal(bytes,local.length);assert.equal(hash.digest('hex'),expected);const elapsedMs=performance.now()-start;resolve({bytes,elapsedMs:round(elapsedMs),mbps:round(bytes*8/(elapsedMs/1000)/1e6),MBps:round(bytes/(elapsedMs/1000)/1e6),firstByteMs:round(firstByte??elapsedMs),connectMs:connect===null?null:round(connect),tlsMs:tls===null?null:round(tls),reusedSocket:req.reusedSocket,httpVersion:res.httpVersion});}catch(e){reject(e);}});
 });
 req.on('socket',socket=>{if(!socket.connecting)return;socket.once('connect',()=>connect=performance.now()-start);socket.once('secureConnect',()=>tls=performance.now()-start);});req.on('error',reject);
 req.setTimeout(30000,()=>req.destroy(Error('Bandwidth request timed out')));
 const deadline=setTimeout(()=>req.destroy(Error('Bandwidth request exceeded 45 seconds')),45000);deadline.unref();req.on('close',()=>clearTimeout(deadline));
});}
async function batch(agent,workers,requestsPerWorker){const start=performance.now(),samples=[];await Promise.all(Array.from({length:workers},async()=>{for(let i=0;i<requestsPerWorker;i++)samples.push(await download(agent));}));const elapsedMs=performance.now()-start,bytes=samples.reduce((n,s)=>n+s.bytes,0);return{workers,requestsPerWorker,bytes,elapsedMs:round(elapsedMs),mbps:round(bytes*8/(elapsedMs/1000)/1e6),MBps:round(bytes/(elapsedMs/1000)/1e6),samples};}
(async()=>{
 const single=new https.Agent({keepAlive:true,maxSockets:1,maxFreeSockets:1}),parallel=new https.Agent({keepAlive:true,maxSockets:4,maxFreeSockets:4});
 try{
  const warmup=await download(single),sequential=[];for(let i=0;i<3;i++){const result=await batch(single,1,4);sequential.push(result);console.log(`Single connection run ${i+1}: ${result.mbps} Mbps (${result.MBps} MB/s)`);}
  const concurrent=await batch(parallel,4,4);console.log(`Four-connection aggregate: ${concurrent.mbps} Mbps (${concurrent.MBps} MB/s)`);
  const sorted=sequential.map(s=>s.mbps).sort((a,b)=>a-b),summary={singleConnectionMedianMbps:sorted[1],singleConnectionMinMbps:sorted[0],singleConnectionMaxMbps:sorted[2],fourConnectionAggregateMbps:concurrent.mbps,totalDownloadedBytes:warmup.bytes+sequential.reduce((n,s)=>n+s.bytes,0)+concurrent.bytes};
  const result={at:new Date().toISOString(),origin:origin.origin,asset,sha256:expected,method:{direction:'server to this Windows machine',protocol:'HTTPS over IPv4 / HTTP 1.1',proxy:false,tlsVerification:true,compression:'identity',singleConnection:'three runs, four sequential downloads each, one kept-alive connection',parallel:'four connections, four sequential downloads per connection',units:'Mbps = 1000000 bits/second; MB/s = 1000000 bytes/second',scope:'Application payload throughput on this route at this time, including request delays. Not a contractual link rate, upload test or concurrent-player capacity test.'},warmup,sequential,concurrent,summary};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(summary));console.log('Saved '+path.relative(root,output));
 }finally{single.destroy();parallel.destroy();}
})().catch(e=>{console.error(e);process.exitCode=1;});
