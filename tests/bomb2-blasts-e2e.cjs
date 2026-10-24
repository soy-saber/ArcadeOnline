'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{fork}=require('child_process'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/bomb2-blasts-e2e'),port=40000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;fs.mkdirSync(out,{recursive:true});
const errors=[],pending=new Map(),wait=ms=>new Promise(r=>setTimeout(r,ms));let browser,id=0;
const server=fork(path.join(__dirname,'fixtures/fidelity-server.cjs'),[],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});server.stderr.on('data',d=>errors.push(d.toString()));server.on('message',m=>{const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve();}});
function fixture(room,action,kind){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});server.send({id:key,room,action,kind});setTimeout(()=>{if(pending.delete(key))reject(Error('Fixture timeout'));},5000).unref();});}
async function focus(p){await p.bringToFront();await p.evaluate(()=>document.querySelector('#game-canvas').focus());}
async function stopped(p,seat=0){await p.waitForFunction(seat=>{const q=window.__authorityTest.authority.players[seat];return q.moveDir<0&&!q.actionLock&&!q.attack&&!q.respawnAt;},{},seat);}
async function scene(room,action,pages){
 await fixture(room,action);const y=action==='flame-chain'?5:action==='mine-blast'?6:10;
 for(const p of pages)await p.waitForFunction(y=>{const [a,b]=window.__authorityTest.authority.players;return a.walking.x===150&&a.walking.y===150&&b.y===y;},{},y);
}
async function escape(p){await p.keyboard.down('ArrowLeft');await p.waitForFunction(()=>window.__authorityTest.authority.players[0].x<=4);await p.keyboard.up('ArrowLeft');await p.keyboard.down('ArrowUp');await p.waitForFunction(()=>window.__authorityTest.authority.players[0].y<=4);await p.keyboard.up('ArrowUp');await stopped(p);}
(async()=>{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']});const pages=[];
 for(let i=0;i<2;i++){
  const c=await browser.createBrowserContext(),p=await c.newPage();pages.push(p);p.setDefaultTimeout(15000);await p.setViewport({width:1500,height:1050});p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push(r.url());});
  await p.evaluateOnNewDocument(i=>{
   localStorage.setItem('arcade_name','Flame P'+(i+1));window.__nativeFlames=[];
   const draw=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(...args){const src=args[0]?.src||'';
    if(src.includes('/native-flame-')){const m=this.getTransform();window.__nativeFlames.push({name:src.split('/').pop(),frame:args[1]/args[3],w:args[3],h:args[4],destW:args[7],destH:args[8],matrix:[m.a,m.b,m.c,m.d,m.e,m.f]});if(window.__nativeFlames.length>3000)window.__nativeFlames.splice(0,1000);}
    return draw.apply(this,args);
   };
  },i);
 }
 const [a,b]=pages,room='flames-'+Date.now().toString(36).slice(-6),results=[];
 for(const [i,p]of pages.entries()){await p.goto(`${base}/authority-room.html?game=9109-server&room=${room}&debug=1`);await p.waitForFunction(()=>window.__authorityTest?.authority);await p.click(`[data-seat="${i+1}"]`);await p.waitForFunction(i=>window.__authorityTest.seat===i,{},i+1);}
 await a.select('#game-map','beach-one');await b.waitForFunction(()=>window.__authorityTest.authority.mapId==='beach-one');
 for(const p of pages){await p.click('#start-game');await p.waitForFunction(()=>window.__authorityTest.network.room.members.find(m=>m.id===window.__authorityTest.network.id).ready);}
 await a.waitForFunction(()=>window.__authorityTest.authority.phase==='playing'&&window.__authorityTest.authority.players.every(p=>!p.invulnerable));
 for(const range of [2,3]){
  await fixture(room,'pickup',2);await a.waitForFunction(()=>window.__authorityTest.authority.players[0].x===3&&window.__authorityTest.authority.items[72]===2);await focus(a);await a.keyboard.down('ArrowRight');await a.waitForFunction(n=>window.__authorityTest.authority.players[0].range===n,{},range);await a.keyboard.up('ArrowRight');await stopped(a);
 }
 await scene(room,'flame-cross',pages);await focus(a);await a.keyboard.press('Space');await escape(a);
 await a.waitForFunction(()=>window.__authorityTest.authority.blasts.length===1);const normal=await a.evaluate(()=>JSON.parse(JSON.stringify(window.__authorityTest.authority.blasts[0])));
 assert.equal(normal.tiles.length,13);assert.deepEqual([...new Set(normal.tiles.map(t=>t.frame))].sort((a,b)=>a-b),[1,2,3,4,5,6,7,8,9]);
 const full=await b.evaluate(()=>window.__authorityTest.network.fullUpdates);await b.evaluate(()=>window.__authorityTest.resync());await b.waitForFunction(n=>window.__authorityTest.network.fullUpdates>n,{},full);assert(await b.evaluate(id=>window.__authorityTest.authority.blasts.some(b=>b.id===id),normal.id));
 await a.waitForFunction(()=>window.__nativeFlames.length>20);await a.screenshot({path:path.join(out,'native-normal-cross.png'),fullPage:true});
 const draws=await a.evaluate(()=>window.__nativeFlames),art=require('../src/expanded/bomb2-blast-art.json');
 for(const t of normal.tiles){const selector=art.selectors.normal[t.frame-1],m=selector.matrix,expected=[m[0],m[1],m[2],m[3],45+normal.px+(t.x-normal.x)*30+m[4],66+normal.py+(t.y-normal.y)*30+m[5]];assert(draws.some(d=>d.name==='native-flame-'+selector.timeline+'.png'&&d.matrix.every((v,i)=>Math.abs(v-expected[i])<.001)),'source selector transform '+t.frame);}
 assert(draws.every(d=>d.w===d.destW&&d.h===d.destH));await a.waitForFunction(()=>window.__authorityTest.authority.blasts.length===0);assert(await a.evaluate(()=>window.__authorityTest.authority.players.every(p=>p.deaths===0)));
 results.push({case:'normal',realRangePickups:2,sourceSelectors:[1,2,3,4,5,6,7,8,9],nativeTransforms:true,nativeDimensions:true,snapshotRecovery:true});
 await a.click('#fullscreen-stage');await a.waitForFunction(()=>document.fullscreenElement||document.querySelector('.fullscreen-fallback'));
 await scene(room,'flame-chain',pages);await focus(b);await b.keyboard.press('Space');await b.waitForFunction(()=>window.__authorityTest.authority.bombs.some(b=>b.owner===2));await b.keyboard.down('ArrowDown');await b.waitForFunction(()=>window.__authorityTest.authority.players[1].y>=8);await b.keyboard.up('ArrowDown');await stopped(b,1);
 await focus(a);await a.keyboard.press('Space');await escape(a);await a.waitForFunction(()=>window.__authorityTest.authority.blasts.length===2);
 const chain=await a.evaluate(()=>{const s=window.__authorityTest.authority;return{blasts:s.blasts,crate:s.board[3*17+5],behindCrate:s.board[2*17+5],beyondShortBomb:s.flames[5*17+8]};});
 assert.equal(chain.crate,0);assert.equal(chain.behindCrate,2);assert.equal(chain.beyondShortBomb,0);assert(chain.blasts.find(b=>b.owner===1).tiles.some(t=>t.x===5&&t.y===3&&t.frame===2));assert(!chain.blasts.find(b=>b.owner===1).tiles.some(t=>t.x===6&&t.y===5));
 assert(await a.evaluate(()=>!!document.fullscreenElement||!!document.querySelector('.fullscreen-fallback')));await a.screenshot({path:path.join(out,'native-chain-fullscreen.png')});await a.waitForFunction(()=>window.__authorityTest.authority.blasts.length===0);assert(await a.evaluate(()=>window.__authorityTest.authority.players.every(p=>p.deaths===0)));
 await a.click('#exit-fullscreen');
 results.push({case:'chain',twoRealNormalBombs:true,crateStopsRay:true,blockedCrateRetainsMiddleFrame:true,parentStopsAtOtherBomb:true,shortBombSuppliesOwnCentre:true,fullscreen:true});
 await fixture(room,'pickup',18);await focus(a);await a.keyboard.down('ArrowRight');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].weapon===18);await a.keyboard.up('ArrowRight');await stopped(a);
 await scene(room,'mine-blast',pages);await focus(a);await a.keyboard.press('Space');await a.waitForFunction(()=>window.__authorityTest.authority.bombs.some(b=>b.kind==='mine'));await a.keyboard.down('ArrowLeft');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].x<=3);await a.keyboard.up('ArrowLeft');await stopped(a);
 await a.keyboard.down('ArrowRight');await a.waitForFunction(()=>window.__authorityTest.authority.blasts.some(b=>b.kind==='mine'));await a.keyboard.up('ArrowRight');await b.waitForFunction(()=>window.__authorityTest.authority.players[1].deaths===1);
 const mine=await a.evaluate(()=>{const s=window.__authorityTest.authority;return{blast:s.blasts.find(b=>b.kind==='mine'),diagonals:[[4,4],[4,6],[6,4],[6,6]].map(([x,y])=>s.flames[y*17+x]>s.tick),crate:s.board[4*17+4],fixed:s.board[4*17+6],deaths:s.players.map(p=>p.deaths)};});assert.deepEqual(mine.diagonals,[true,true,true,true]);assert.equal(mine.crate,0);assert.equal(mine.fixed,1);assert.deepEqual(mine.deaths,[1,1]);
 await a.waitForFunction(()=>window.__nativeFlames.some(d=>d.name==='native-flame-mine-center.png'&&d.destW===144&&d.destH===144));await a.screenshot({path:path.join(out,'native-mine-diagonal.png'),fullPage:true});
 results.push({case:'mine',actualPickupAndPlacement:true,ownerLeavesThenRetriggers:true,diagonalVictim:true,allFourDiagonalCells:true,diagonalCrateDestroyed:true,fixedWallPreserved:true,nativeWideCentre:true});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),results,errors},null,2));console.log('Original Bomb It 2 flame animation, obstruction, chain and diagonal browser checks passed.');
})().catch(async e=>{console.error(e,errors);for(const p of await browser?.pages()||[])if(p.url().includes('authority-room'))try{console.error(JSON.stringify(await p.evaluate(()=>{const s=window.__authorityTest?.authority;return{tick:s?.tick,players:s?.players,bombs:s?.bombs,blasts:s?.blasts};})));await p.screenshot({path:path.join(out,'failure.png')});}catch{}process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
