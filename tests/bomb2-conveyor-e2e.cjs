'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{fork}=require('child_process'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/bomb2-conveyor-e2e'),port=39000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;fs.mkdirSync(out,{recursive:true});
const errors=[],pending=new Map(),wait=ms=>new Promise(r=>setTimeout(r,ms));let browser,id=0;
const server=fork(path.join(__dirname,'fixtures/fidelity-server.cjs'),[],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});server.stderr.on('data',d=>errors.push(d.toString()));server.on('message',m=>{const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve();}});
function fixture(room,action,kind){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});server.send({id:key,room,action,kind});setTimeout(()=>{if(pending.delete(key))reject(Error('Fixture timeout'));},5000).unref();});}
async function focus(p){await p.bringToFront();await p.evaluate(()=>document.querySelector('#game-canvas').focus());}
async function leaveConveyor(p){
 await p.keyboard.down('ArrowDown');await p.waitForFunction(()=>window.__authorityTest.authority.players[0].y>=6);await p.keyboard.up('ArrowDown');
 await p.keyboard.down('ArrowRight');await p.waitForFunction(()=>window.__authorityTest.authority.players[0].x>=5);await p.keyboard.up('ArrowRight');
 await p.waitForFunction(()=>window.__authorityTest.authority.players[0].moveDir<0);
}
(async()=>{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']});const pages=[];
 for(let i=0;i<2;i++){
  const c=await browser.createBrowserContext(),p=await c.newPage();pages.push(p);await p.setViewport({width:1500,height:1050});p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push(r.url());});
  await p.evaluateOnNewDocument(i=>{
   localStorage.setItem('arcade_name','Conveyor P'+(i+1));window.__mechanismRender={bombs:{},conveyor:[]};
   const draw=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(...args){
    const src=args[0]?.src||'',m=window.__mechanismRender;
    if(src.includes('/native-bomb-'))m.bombs[src.split('/').pop()]={sourceW:args[3],sourceH:args[4],destW:args[7],destH:args[8],x:args[5],y:args[6]};
    if(src.includes('/conveyor-')&&args[1]===135&&args[2]===186){const frame=Number(src.match(/conveyor-(\d+)/)[1]);if(m.conveyor.at(-1)!==frame)m.conveyor.push(frame);}
    return draw.apply(this,args);
   };
  },i);
 }
 const [a,b]=pages,room='conveyor-'+Date.now().toString(36).slice(-6);
 for(const [i,p]of pages.entries()){await p.goto(`${base}/authority-room.html?game=9109-server&room=${room}&debug=1`);await p.waitForFunction(()=>window.__authorityTest?.authority);await p.click(`[data-seat="${i+1}"]`);await p.waitForFunction(i=>window.__authorityTest.seat===i,{},i+1);}
 await a.select('#game-map','factory-two');await b.waitForFunction(()=>window.__authorityTest.authority.mapId==='factory-two');
 for(const p of pages){await p.click('#start-game');await p.waitForFunction(()=>window.__authorityTest.network.room.members.find(m=>m.id===window.__authorityTest.network.id).ready);}
 await a.waitForFunction(()=>window.__authorityTest.authority.phase==='playing');await fixture(room,'conveyor');await focus(a);await a.keyboard.press('Space');
 await b.waitForFunction(()=>window.__authorityTest.authority.bombs.some(b=>b.kind==='normal'&&b.walking.x>90));
 const carried=await b.evaluate(()=>({...window.__authorityTest.authority.bombs.find(b=>b.kind==='normal')}));assert(carried.walking.x<120);assert(carried.walking.x%30!==0);
 await leaveConveyor(a);
 await a.waitForFunction(()=>window.__mechanismRender.bombs['native-bomb-normal.png']);assert.equal(await a.evaluate(()=>window.__mechanismRender.bombs['native-bomb-normal.png'].destH),46);
 await a.waitForFunction(()=>window.__authorityTest.authority.tick>=323);await a.waitForFunction(()=>window.__mechanismRender.conveyor.includes(4));
 assert.deepEqual(await a.evaluate(()=>window.__mechanismRender.conveyor.slice(0,2)),[2,4]);
 await fixture(room,'pickup',6);await focus(a);await a.keyboard.down('ArrowRight');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].kick);await a.keyboard.up('ArrowRight');await leaveConveyor(a);
 await fixture(room,'kick');await focus(b);await b.keyboard.press('Space');await a.waitForFunction(()=>window.__authorityTest.authority.bombs.some(b=>b.owner===2));
 const fuse=await a.evaluate(()=>window.__authorityTest.authority.bombs.find(b=>b.owner===2).explodeAt);
 await focus(a);await a.keyboard.down('ArrowRight');await a.waitForFunction(()=>window.__authorityTest.authority.bombs.some(b=>b.owner===2&&b.slide===2&&b.walking.x>180));
 const kicked=await a.evaluate(()=>({...window.__authorityTest.authority.bombs.find(b=>b.owner===2)}));assert(kicked.walking.x>180&&kicked.walking.x<240);assert(kicked.walking.x%30!==0);assert(kicked.explodeAt>fuse);
 await a.keyboard.up('ArrowRight');await a.keyboard.down('ArrowDown');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].y>=8);await a.keyboard.up('ArrowDown');
 await b.waitForFunction(()=>window.__authorityTest.authority.bombs.some(b=>b.owner===2&&b.slide===-1&&b.walking.x===240));
 await a.screenshot({path:path.join(out,'native-kicked-bomb.png'),fullPage:true});
 await a.waitForFunction(()=>window.__authorityTest.authority.bombs.length===0);await a.waitForFunction(()=>window.__authorityTest.authority.players.every(p=>!p.respawnAt&&p.moveDir<0&&!p.actionLock&&!p.attack));
 for(const [kind,name,height]of [[17,'remote',45],[18,'mine',21]]){
  await fixture(room,'pickup',kind);await focus(a);await a.keyboard.down('ArrowRight');await a.waitForFunction(k=>window.__authorityTest.authority.players[0].weapon===k,{},kind);await a.keyboard.up('ArrowRight');await leaveConveyor(a);
  await a.keyboard.press('Space');await b.waitForFunction(name=>window.__authorityTest.authority.bombs.some(b=>b.kind===name),{},name);
  await a.waitForFunction(name=>window.__mechanismRender.bombs['native-bomb-'+name+'.png'],{},name);assert.equal(await a.evaluate(name=>window.__mechanismRender.bombs['native-bomb-'+name+'.png'].destH,name),height);
  await a.screenshot({path:path.join(out,'native-'+name+'.png'),fullPage:true});
  await a.waitForFunction(()=>window.__authorityTest.authority.players[0].actionLock===0);
  if(name==='remote'){
   await a.keyboard.down('ArrowDown');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].y>=8);await a.keyboard.up('ArrowDown');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].moveDir<0);
   await a.keyboard.press('Space');await a.waitForFunction(()=>window.__authorityTest.authority.bombs.length===0);
  }
 }
 const full=await b.evaluate(()=>window.__authorityTest.network.fullUpdates);await b.evaluate(()=>window.__authorityTest.resync());await b.waitForFunction(n=>window.__authorityTest.network.fullUpdates>n,{},full);assert(await b.evaluate(()=>window.__authorityTest.authority.bombs.every(b=>b.walking.w===30)));
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),carried:{x:carried.walking.x,originX:90},kicked:{x:kicked.walking.x,initialFuse:fuse,extendedFuse:kicked.explodeAt},rotationFrames:await a.evaluate(()=>window.__mechanismRender.conveyor),actualBootPickup:true,nativeBombs:['normal','remote','mine'],snapshotRecovery:true,errors},null,2));console.log('Original conveyor, kick and bomb art browser checks passed.');
})().catch(async e=>{console.error(e,errors);for(const p of await browser?.pages()||[])if(p.url().includes('authority-room'))try{console.error(JSON.stringify(await p.evaluate(()=>window.__authorityTest?.authority?.players)));await p.screenshot({path:path.join(out,'failure.png')});}catch{}process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
