'use strict';
const train=require('./helpers/boxhead-training.cjs');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{fork}=require('child_process'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/boxhead-explosions-e2e'),port=46000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;fs.mkdirSync(out,{recursive:true});
const errors=[],pending=new Map(),wait=ms=>new Promise(r=>setTimeout(r,ms));let browser,id=0;
const server=fork(path.join(__dirname,'fixtures/fidelity-server.cjs'),[],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});server.stderr.on('data',d=>errors.push(d.toString()));server.on('message',m=>{const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve();}});
function fixture(room,action){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});server.send({id:key,room,action});setTimeout(()=>{if(pending.delete(key))reject(Error('Fixture timeout'));},5000).unref();});}
async function focus(p){await p.bringToFront();await p.evaluate(()=>document.querySelector('#game-canvas').focus());}
async function screenshot(p,name){const png=await p.evaluate(()=>document.querySelector('#game-canvas').toDataURL());fs.writeFileSync(path.join(out,name),Buffer.from(png.split(',')[1],'base64'));}
(async()=>{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 browser=await puppeteer.launch({executablePath:process.env.CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']});const pages=[],room='explosions-'+Date.now().toString(36).slice(-6);
 for(let i=0;i<2;i++){
  const context=await browser.createBrowserContext(),p=await context.newPage();pages.push(p);p.setDefaultTimeout(15000);await p.setViewport({width:1500,height:1050});p.on('pageerror',e=>errors.push(e.stack||e.message));
  await p.evaluateOnNewDocument(i=>{localStorage.setItem('arcade_name','Blast P'+(i+1));localStorage.setItem('arcade_native_sound','on');window.__draws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.id==='game-canvas'&&args[0]?.src?.match(/\/(effect-explosion|shot-clustershell)\.png$/)){window.__draws.push({name:args[0].src.split('/').pop(),args:args.slice(1),tick:window.__authorityTest?.authority.tick});if(window.__draws.length>2000)window.__draws.splice(0,500);}return draw.apply(this,args);};},i);
  await p.goto(`${base}/authority-room.html?game=50737-server&room=${room}&debug=1`,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__authorityTest?.authority);await p.click(`[data-seat="${i+1}"]`);await p.waitForFunction(seat=>window.__authorityTest.seat===seat,{},i+1);
 }
 const [a,b]=pages;await a.select('#game-map','original-01');for(const p of pages){await p.click('#start-game');await p.waitForFunction(()=>window.__authorityTest.network.room.members.find(m=>m.id===window.__authorityTest.network.id)?.ready);}
 await a.waitForFunction(()=>window.__authorityTest.authority.phase==='playing');await train({a,b,room,fixture,kills:48});
 await a.waitForFunction(()=>window.__authorityTest.authority.peakCombo>=45);await b.waitForFunction(()=>window.__authorityTest.authority.players[0].kills>=48);
 const earned=await a.evaluate(()=>{const s=window.__authorityTest.authority,p=s.players[0];return {kills:p.kills,peakCombo:s.peakCombo,unlocked:p.unlocked,grenades:p.inventory[4]};});await screenshot(a,'earned-upgrades.png');
 await fixture(room,'boxhead-grenade-scene');await a.waitForFunction(()=>window.__authorityTest.authority.zombies.length===0&&window.__authorityTest.authority.bullets.length===0);
 await b.evaluate(()=>{
  const net=window.__authorityTest.network,original=net.onSnapshot;window.__watch={shells:{},impacts:{},pending:{},sounds:{}};
  net.onSnapshot=function(s,...args){original.call(this,s,...args);const w=window.__watch;
   for(const p of s.bullets)if(p.clusterShell&&!w.shells[p.id])w.shells[p.id]=JSON.parse(JSON.stringify(p));
   for(const e of s.effects)if(e.kind==='Effect.Explosion'&&!w.impacts[e.id])w.impacts[e.id]=JSON.parse(JSON.stringify(e));
   for(const e of s.explosions)if(!w.pending[e.id])w.pending[e.id]=JSON.parse(JSON.stringify(e));
   for(const e of s.sounds)if(e.name==='Effect.Explosion.wav')w.sounds[e.id]=e;
   if(!w.request&&s.explosions.some(e=>e.delay>0)&&s.bullets.some(b=>b.clusterShell)){
    const before=this.resyncs,candidate={tick:s.tick,full:this.fullUpdates,children:s.explosions.filter(e=>e.delay>0).map(e=>({...e,due:s.tick+e.delay+1}))};this.requestFull();if(this.resyncs>before)w.request=candidate;
   }else if(w.request&&!w.recovery&&this.fullUpdates>w.request.full){
    w.recovery={tick:s.tick,children:w.request.children.map(e=>{const pending=s.explosions.find(p=>p.id===e.id);const impact=s.effects.find(p=>p.kind==='Effect.Explosion'&&p.x===e.x&&p.y===e.y&&p.born===e.due);return {id:e.id,due:e.due,preserved:pending?pending.x===e.x&&pending.y===e.y&&pending.owner===e.owner&&pending.damage===e.damage&&s.tick+pending.delay+1===e.due:!!impact};})};
   }
  };
 });
 await focus(a);await a.keyboard.press('Digit5');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].weapon===4);const stock=await a.evaluate(()=>window.__authorityTest.authority.players[0].ammo);
 await a.keyboard.press('Space');await a.waitForFunction(()=>window.__authorityTest.authority.bullets.some(b=>b.weapon===4&&!b.clusterShell));await a.waitForFunction(stock=>window.__authorityTest.authority.players[0].ammo===stock-1,{},stock);
 await b.waitForFunction(()=>Object.keys(window.__watch.shells).length===4);await b.waitForFunction(()=>window.__draws.some(d=>d.name==='shot-clustershell.png'));await screenshot(b,'native-cluster.png');
 await b.waitForFunction(()=>Object.keys(window.__watch.impacts).length===7&&window.__authorityTest.authority.explosions.length===0&&window.__authorityTest.authority.bullets.length===0);const watch=await b.evaluate(()=>window.__watch);
 assert(watch.request);assert(watch.recovery);assert(watch.recovery.children.every(e=>e.preserved));assert.equal(watch.request.children.length,2);
 assert.equal(Object.keys(watch.shells).length,4);assert.equal(Object.keys(watch.impacts).length,7);assert(Object.values(watch.impacts).every(e=>e.scale===1&&e.total===8));
 assert(Object.values(watch.shells).every(b=>b.weapon===4&&b.clusterShell&&b.damage===150&&b.owner===1&&!b.cluster&&!b.bang));
 const draws=await b.evaluate(()=>window.__draws);assert(draws.some(d=>d.name==='shot-clustershell.png'&&d.args[2]===8&&d.args[3]===5&&d.args[6]===8&&d.args[7]===5));assert(draws.some(d=>d.name==='effect-explosion.png'&&d.args[2]===217&&d.args[3]===163&&d.args[6]===217&&d.args[7]===163));
 const net=await b.evaluate(()=>({full:window.__authorityTest.network.fullUpdates,delta:window.__authorityTest.network.deltaUpdates}));assert(net.full>1&&net.delta>0);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),earned,grenadeConsumed:1,nativeCluster8x5:true,nativeExplosion217x163:true,plainImpacts:7,watch,net,errors},null,2));console.log('Natural upgrades, delayed explosion graph, native cluster art and live full recovery passed.');
})().catch(async e=>{console.error(e);for(const p of await browser?.pages()||[])if(p.url().includes('authority-room'))try{fs.writeFileSync(path.join(out,'diagnostic.json'),JSON.stringify(await p.evaluate(()=>({state:window.__authorityTest?.snapshot(),watch:window.__watch})),null,2));await screenshot(p,'failure.png');}catch{}process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
