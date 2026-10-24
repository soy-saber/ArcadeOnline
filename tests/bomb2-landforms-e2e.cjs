'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{fork}=require('child_process'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/bomb2-landforms-e2e'),port=41000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;fs.mkdirSync(out,{recursive:true});
const errors=[],pending=new Map(),wait=ms=>new Promise(r=>setTimeout(r,ms));let browser,id=0;
const server=fork(path.join(__dirname,'fixtures/fidelity-server.cjs'),[],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});server.stderr.on('data',d=>errors.push(d.toString()));server.on('message',m=>{const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve();}});
function fixture(room,action){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});server.send({id:key,room,action});setTimeout(()=>{if(pending.delete(key))reject(Error('Fixture timeout'));},5000).unref();});}
async function focus(p){await p.bringToFront();await p.evaluate(()=>document.querySelector('#game-canvas').focus());}
async function stopped(p){await p.waitForFunction(()=>{const q=window.__authorityTest.authority.players[0];return !q.travel&&q.moveDir<0&&!q.actionLock&&!q.attack&&!q.respawnAt;});}
async function ready(pages){for(const p of pages){await p.click('#start-game');await p.waitForFunction(()=>window.__authorityTest.network.room.members.find(m=>m.id===window.__authorityTest.network.id).ready);}await pages[0].waitForFunction(()=>window.__authorityTest.authority.phase==='playing'&&window.__authorityTest.authority.players.every(p=>!p.invulnerable));}
async function resources(p,names){await p.waitForFunction(names=>names.every(n=>performance.getEntriesByType('resource').some(r=>r.name.endsWith('/native-'+n+'.png'))),{},names);}
async function move(p,key,condition){await focus(p);await p.keyboard.down(key);await p.waitForFunction(condition);await p.keyboard.up(key);}
(async()=>{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']});const pages=[];
 for(let i=0;i<2;i++){
  const c=await browser.createBrowserContext(),p=await c.newPage();pages.push(p);p.setDefaultTimeout(15000);await p.setViewport({width:1500,height:1050});p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push(r.url());});
  await p.evaluateOnNewDocument(i=>{
   localStorage.setItem('arcade_name','Landform P'+(i+1));window.__landDraws=[];
   const draw=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(...args){const src=args[0]?.src||'';
    if(/\/native-(jump|sand)-/.test(src)){const m=this.getTransform();window.__landDraws.push({name:src.split('/').pop(),frame:args[1]/args[3],w:args[3],h:args[4],destW:args[7],destH:args[8],alpha:this.globalAlpha,matrix:[m.a,m.b,m.c,m.d,m.e,m.f]});if(window.__landDraws.length>6000)window.__landDraws.splice(0,1000);}
    return draw.apply(this,args);
   };
  },i);
 }
 const [a,b]=pages,room='land-'+Date.now().toString(36).slice(-6),results=[];
 for(const [i,p]of pages.entries()){await p.goto(`${base}/authority-room.html?game=9109-server&room=${room}&debug=1`);await p.waitForFunction(()=>window.__authorityTest?.authority);await p.click(`[data-seat="${i+1}"]`);await p.waitForFunction(i=>window.__authorityTest.seat===i,{},i+1);}
 await a.select('#game-character','3');await b.select('#game-character','4');await a.select('#game-map','disce-one');await b.waitForFunction(()=>window.__authorityTest.authority.mapId==='disce-one');
 const jumps=Array.from({length:4},(_,c)=>['left','up','right','down'].map(d=>`jump-${c}-${d}`)).flat();for(const p of pages)await resources(p,jumps);
 await ready(pages);await fixture(room,'landform-spring');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].x===3&&window.__authorityTest.authority.items[72]===19);
 await move(a,'ArrowRight',()=>window.__authorityTest.authority.players[0].travel?.kind==='spring');
 const spring=await a.evaluate(()=>{const s=window.__authorityTest.authority;return{tick:s.tick,p:s.players[0],landingItem:s.items[74],obstacle:s.board[73]};});assert.equal(spring.p.weapon,19);assert.equal(spring.p.ammo,2);assert.equal(spring.p.range,1);assert.equal(spring.landingItem,2);assert.equal(spring.obstacle,1);
 await a.keyboard.press('Space');
 const full=await b.evaluate(()=>window.__authorityTest.network.fullUpdates);await b.evaluate(()=>window.__authorityTest.resync());await b.waitForFunction(n=>window.__authorityTest.network.fullUpdates>n,{},full);
 assert(await b.evaluate(()=>window.__authorityTest.authority.players[0].travel?.kind==='spring'));
 await a.waitForFunction(()=>window.__landDraws.some(d=>d.name==='native-jump-2-right.png'&&d.frame>=7));await a.screenshot({path:path.join(out,'native-spring.png'),fullPage:true});
 await a.waitForFunction(()=>{const p=window.__authorityTest.authority.players[0];return !p.travel&&p.range===2;});await stopped(a);
 const landed=await a.evaluate(()=>{const s=window.__authorityTest.authority;return{p:s.players[0],shots:s.shots.length};});assert.equal(landed.p.x,6);assert.equal(landed.p.ammo,2);assert.equal(landed.shots,0);assert.equal(landed.p.lastAttack,1);assert.equal(landed.p.teleportUntil,0);
 const jumpDraws=await a.evaluate(()=>window.__landDraws.filter(d=>d.name.startsWith('native-jump-')));assert(jumpDraws.some(d=>d.frame>=7));assert(jumpDraws.every(d=>d.w===d.destW&&d.h===d.destH));
 results.push({case:'spring',characters:[3,4],sixteenNativePosesBeforeReady:true,realShotgunPickupBeforeJump:true,airAttackConsumedWithoutAmmo:true,obstacleCrossed:true,landingPickupAfterGrounding:true,fullSnapshotWhileAirborne:true,nativeDimensions:true,landing:landed.p.walking});
 // Return to waiting through the regular room controls, then start the original beach map.
 await a.click('#start-game');await b.click('[data-seat="2"]');await a.waitForFunction(()=>window.__authorityTest.authority.phase==='waiting');await a.select('#game-map','beach-one');await b.click('[data-seat="2"]');await b.waitForFunction(()=>window.__authorityTest.seat===2&&window.__authorityTest.authority.mapId==='beach-one');
 for(const p of pages)await resources(p,['sand-base-1','sand-base-2','sand-light-1','sand-light-2']);await ready(pages);await a.click('#fullscreen-stage');await a.waitForFunction(()=>document.fullscreenElement||document.querySelector('.fullscreen-fallback'));
 await fixture(room,'landform-sand');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].x===3&&window.__authorityTest.authority.players[0].y===3);
 await move(a,'ArrowRight',()=>window.__authorityTest.authority.players[0].travel?.kind==='sand');
 const fading=await a.evaluate(()=>{const s=window.__authorityTest.authority;return{tick:s.tick,p:s.players[0],lights:s.sandLights,opacity:Number(document.querySelector('[data-player-seat="1"]').style.opacity),png:document.querySelector('#game-canvas').toDataURL()};});fs.writeFileSync(path.join(out,'native-sand-fade.png'),Buffer.from(fading.png.split(',')[1],'base64'));delete fading.png;assert(fading.p.travel.alpha<1);assert(fading.opacity<1);assert(fading.lights[1]>0);assert.equal(fading.lights[0],0);
 await a.keyboard.press('Space');const sandFull=await b.evaluate(()=>window.__authorityTest.network.fullUpdates);await b.evaluate(()=>window.__authorityTest.resync());await b.waitForFunction(n=>window.__authorityTest.network.fullUpdates>n,{},sandFull);
 const recovered=await b.evaluate(()=>{const s=window.__authorityTest.authority;return{tick:s.tick,p:s.players[0],lights:s.sandLights};});assert.equal(recovered.p.travel?.kind,'sand');assert.equal(recovered.p.travel.born,fading.p.travel.born);
 await a.waitForFunction(()=>{const p=window.__authorityTest.authority.players[0];return !p.travel&&p.x===12&&p.y===11;});const arrived=await a.evaluate(()=>{const s=window.__authorityTest.authority;return{tick:s.tick,p:s.players[0],bombs:s.bombs.length};});assert.equal(arrived.p.dir,3);assert.equal(arrived.bombs,0);assert.equal(arrived.p.teleportUntil,0);assert.equal(arrived.p.sandCell,199);
 await a.waitForFunction(t=>window.__authorityTest.authority.tick>=t+60,{},arrived.tick);assert(await a.evaluate(()=>{const s=window.__authorityTest.authority,p=s.players[0];return p.x===12&&p.y===11&&!p.travel&&s.sandLights.every(x=>x===0);}));
 await move(a,'ArrowRight',()=>window.__authorityTest.authority.players[0].range===2);await stopped(a);
 await move(a,'ArrowLeft',()=>window.__authorityTest.authority.players[0].travel?.kind==='sand');await a.waitForFunction(()=>{const p=window.__authorityTest.authority.players[0];return !p.travel&&p.x===4&&p.y===3;});const returnTick=await a.evaluate(()=>window.__authorityTest.authority.tick);
 await move(a,'ArrowLeft',()=>window.__authorityTest.authority.players[0].x===3);await stopped(a);await move(a,'ArrowRight',()=>window.__authorityTest.authority.players[0].travel?.kind==='sand');const reentryTick=await a.evaluate(()=>window.__authorityTest.authority.tick);assert(reentryTick-returnTick<40,'quick exit and re-entry must not be blocked by the former 40-tick cooldown');
 await a.waitForFunction(()=>{const p=window.__authorityTest.authority.players[0];return !p.travel&&p.x===12&&p.y===11;});await a.screenshot({path:path.join(out,'native-sand-fullscreen.png')});
 const sandDraws=await a.evaluate(()=>window.__landDraws.filter(d=>d.name.startsWith('native-sand-')));assert(sandDraws.some(d=>d.name==='native-sand-light-1.png'&&d.frame>0));assert(sandDraws.some(d=>d.name==='native-sand-base-1.png'&&d.frame>1));assert(sandDraws.every(d=>d.w===d.destW&&d.h===d.destH));
 results.push({case:'sand',fourNativeTexturesBeforeReady:true,fade:fading,recovered,arrived,exitLatchedFor60Ticks:true,realExitPickup:true,reentryAfterLeavingCell:true,reentryTicks:reentryTick-returnTick,nativeIndependentExitLight:true,fullscreen:true});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),results,errors},null,2));console.log('Original spring travel, sand fade/exit/re-entry, native animation and two-browser recovery passed.');
})().catch(async e=>{console.error(e,errors);for(const p of await browser?.pages()||[])if(p.url().includes('authority-room'))try{console.error(JSON.stringify(await p.evaluate(()=>{const s=window.__authorityTest?.authority;return{tick:s?.tick,phase:s?.phase,players:s?.players};})));await p.screenshot({path:path.join(out,'failure.png')});}catch{}process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
