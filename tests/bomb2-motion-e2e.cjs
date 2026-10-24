'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{fork}=require('child_process'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/bomb2-motion-e2e'),port=38000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;fs.mkdirSync(out,{recursive:true});
const errors=[],pending=new Map(),wait=ms=>new Promise(r=>setTimeout(r,ms));let browser,id=0;
const server=fork(path.join(__dirname,'fixtures/fidelity-server.cjs'),[],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});server.stderr.on('data',d=>errors.push(d.toString()));server.on('message',m=>{const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve();}});
function fixture(room,ice){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});server.send({id:key,room,action:'motion',ice});setTimeout(()=>{if(pending.delete(key))reject(Error('Motion fixture timeout'));},5000).unref();});}
(async()=>{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']});const pages=[];
 for(let i=0;i<2;i++){const c=await browser.createBrowserContext(),p=await c.newPage();pages.push(p);await p.setViewport({width:1500,height:1000});p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push(r.url());});await p.evaluateOnNewDocument(i=>localStorage.setItem('arcade_name','Motion P'+(i+1)),i);}
 const [a,b]=pages,results=[];
 for(const map of ['beach-one','snow-one']){
  const room='motion-'+map.slice(0,4)+'-'+Date.now().toString(36).slice(-5);
  for(const [i,p]of pages.entries()){await p.goto(`${base}/authority-room.html?game=9109-server&room=${room}&debug=1`);await p.waitForFunction(()=>window.__authorityTest?.authority);await p.click(`[data-seat="${i+1}"]`);await p.waitForFunction(i=>window.__authorityTest.seat===i,{},i+1);}
  await a.select('#game-map',map);await b.waitForFunction(map=>window.__authorityTest.authority.mapId===map,{},map);
  for(const p of pages){await p.click('#start-game');await p.waitForFunction(()=>window.__authorityTest.network.room.members.find(m=>m.id===window.__authorityTest.network.id).ready);}
  await a.waitForFunction(()=>window.__authorityTest.authority.phase==='playing');await fixture(room,map==='snow-one');await a.waitForFunction(()=>window.__authorityTest.authority.board.every(v=>v===0));
  await a.bringToFront();await a.evaluate(()=>document.querySelector('#game-canvas').focus());
  const start=await a.evaluate(()=>({...window.__authorityTest.authority.players[0].walking}));
  await a.keyboard.down('ArrowRight');await wait(220);await a.waitForFunction(()=>window.__authorityTest.authority.players[0].walking.vx>2);
  const moving=await a.evaluate(()=>({...window.__authorityTest.authority.players[0].walking}));assert(moving.x>start.x);assert(Math.abs(moving.x/30-Math.round(moving.x/30))>.001,'the authority must expose real sub-cell movement');
  await a.keyboard.up('ArrowRight');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].moveDir<0);
  const stopped=await a.evaluate(()=>({...window.__authorityTest.authority.players[0].walking}));assert(stopped.x>moving.x,'native inertia continues after release');
  if(map==='beach-one'){
   await a.keyboard.down('ArrowRight');await wait(100);await a.keyboard.down('ArrowUp');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].dir===1&&window.__authorityTest.authority.players[0].walking.vy<0&&window.__authorityTest.authority.players[0].walking.vx===0);
   await a.keyboard.up('ArrowUp');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].dir===2&&window.__authorityTest.authority.players[0].walking.vx>0);await a.keyboard.up('ArrowRight');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].moveDir<0);
  }
  const full=await b.evaluate(()=>window.__authorityTest.network.fullUpdates);await b.evaluate(()=>window.__authorityTest.resync());await b.waitForFunction(n=>window.__authorityTest.network.fullUpdates>n,{},full);
  assert(await b.evaluate(()=>window.__authorityTest.authority.players[0].walking.w===30));await a.screenshot({path:path.join(out,map+'.png'),fullPage:true});results.push({map,startX:start.x,movingX:moving.x,movingSpeed:moving.vx,stoppedX:stopped.x,coast:stopped.x-moving.x,continuous:true,snapshotRecovery:true});console.log('Original motion browser passed: '+map);
 }
 assert(results[1].movingSpeed>results[0].movingSpeed);assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,keyOrder:true,errors},null,2));
})().catch(e=>{console.error(e,errors);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
