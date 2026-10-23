'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{fork}=require('node:child_process'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/fidelity-e2e'),port=36000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;
fs.mkdirSync(out,{recursive:true});const errors=[],results=[],pending=new Map(),wait=ms=>new Promise(r=>setTimeout(r,ms)),sharedPages=[];let id=0,browser;
const server=fork(path.join(__dirname,'fixtures/fidelity-server.cjs'),[],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});server.stderr.on('data',b=>errors.push(b.toString()));
server.on('message',m=>{const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve();}});
function fixture(room,action,extra={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});server.send({id:key,room,action,...extra});setTimeout(()=>{if(pending.delete(key))reject(new Error('Fixture timeout'));},5000).unref();});}
async function started(game,room){const pages=[];for(let n=1;n<=2;n++){
 let page=sharedPages[n-1];if(!page){const context=await browser.createBrowserContext();page=await context.newPage();sharedPages[n-1]=page;await page.setViewport({width:1450,height:1050});
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)errors.push(r.url());});
 await page.evaluateOnNewDocument(name=>{localStorage.setItem('arcade_name',name);window.__draws=[];window.__sounds=[];
 const fill=CanvasRenderingContext2D.prototype.fillText,draw=CanvasRenderingContext2D.prototype.drawImage,play=HTMLMediaElement.prototype.play;
 CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){window.__draws.push({text:String(text),x,y});if(window.__draws.length>1800)window.__draws.splice(0,900);return fill.call(this,text,x,y,...rest);};
 CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image?.src)window.__draws.push({src:image.src,args});return draw.call(this,image,...args);};
 HTMLMediaElement.prototype.play=function(){window.__sounds.push(this.src);return play.call(this);};
 },n===1?'一号玩家很长的中文昵称':'二号玩家很长的中文昵称');}
 pages.push(page);
 await page.goto(`${base}/authority-room.html?game=${game}&room=${room}&debug=1`);await page.waitForFunction(()=>window.__authorityTest?.authority);await page.click(`[data-seat="${n}"]`);await page.waitForFunction(n=>window.__authorityTest.seat===n,{},n);
 }
 for(const p of pages)await p.click('#start-game');await pages[0].waitForFunction(()=>window.__authorityTest.authority.phase==='playing'&&window.__authorityTest.authority.tick>0);return pages;
}
async function focus(page){await page.bringToFront();await page.evaluate(()=>document.getElementById('game-canvas').focus());}
async function renders(page){await page.evaluate(()=>window.__draws=[]);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return page.evaluate(()=>window.__draws);}
async function screenshot(page,name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
(async()=>{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 browser=await puppeteer.launch({executablePath:process.env.CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox','--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 for(const game of ['3881-server','9109-server']){
  const room='f-'+game.slice(0,4)+'-'+Date.now().toString(36),[a,b]=await started(game,room),kinds=game==='3881-server'?['rocket','mine','grenade','gas','ice','fire']:[15,16,17,18,19,20,21];
  for(const kind of kinds){
   console.log('Checking pickup '+game+' / '+kind);
   await a.waitForFunction(()=>{const p=window.__authorityTest.authority.players[0];return !p.actionLock&&!p.attack&&p.moveDir<0;});await fixture(room,'pickup',{kind});await focus(a);await a.keyboard.down('ArrowRight');await a.waitForFunction(kind=>window.__authorityTest.authority.players[0].weapon===kind,{},kind);await a.keyboard.up('ArrowRight');
   await a.waitForFunction(()=>window.__authorityTest.authority.players[0].moveDir<0);const count=await a.evaluate(()=>window.__authorityTest.authority.players[0].ammo);assert(count>=1);
   const icon=`hud-weapon-${kind}.png`;await a.waitForFunction(icon=>window.__draws.filter(d=>d.src?.endsWith(icon)).length>=2,{},icon);
   const drawn=await renders(a);assert(drawn.some(d=>d.text==='×'+count),'head count '+kind);assert(drawn.some(d=>d.text?.endsWith(' ×'+count)),'panel count '+kind);assert(drawn.filter(d=>d.src?.endsWith(icon)).length>=2,'same original HUD icon in head and panel '+kind);
   if(kind===kinds[0]){
    await screenshot(a,game+'-normal');const before=await a.$eval('.player-nameplate:not([hidden])',e=>({font:parseFloat(getComputedStyle(e).fontSize),h:e.getBoundingClientRect().height,w:e.getBoundingClientRect().width}));assert(before.font<=11);assert(before.h<=16);assert(before.w<=90);
    await a.click('#fullscreen-stage');await a.waitForFunction(()=>document.fullscreenElement);await screenshot(a,game+'-fullscreen');const after=await a.$eval('.player-nameplate:not([hidden])',e=>({font:parseFloat(getComputedStyle(e).fontSize),h:e.getBoundingClientRect().height}));assert(after.font>before.font);assert(after.h<=21);
    await a.click('#exit-fullscreen');await a.waitForFunction(()=>!document.fullscreenElement);
   }
   await focus(a);await a.keyboard.press('Space');await a.waitForFunction(count=>window.__authorityTest.authority.players[0].ammo<count,{},count);assert(await a.evaluate(()=>window.__authorityTest.authority.bombs.every(b=>b.kind&&b.kind!=='normal')),'special attack must not place an ordinary bomb');
   const now=await renders(a),remaining=await a.evaluate(()=>window.__authorityTest.authority.players[0].ammo);if(remaining>0)assert(now.some(d=>d.text==='×'+remaining));
  }
  results.push({game,pickupsAndHeadPanelIcons:kinds,normalAndFullscreen:true,realPrimaryAttacks:true});console.log('Fidelity HUD and real weapon inputs passed: '+game);
 }
 const room='f-box-'+Date.now().toString(36),[a,b]=await started('50737-server',room);await fixture(room,'zombies');await focus(a);
 for(let n=1;n<=16;n++){await a.waitForFunction(()=>window.__authorityTest.authority.players[0].cooldown===0);const fireAt=await a.evaluate(()=>window.__authorityTest.authority.players[0].fireAt);await a.keyboard.press('Space');await a.waitForFunction(n=>window.__authorityTest.authority.players[0].lastAttack>=n,{},n);const result=await a.evaluate(()=>{const s=window.__authorityTest.authority,p=s.players[0];return {shot:p.lastAttack,fireAt:p.fireAt,kills:p.kills,hp:p.hp,alive:p.alive,round:s.round};});console.log('Zombie shot '+n+' '+JSON.stringify(result));assert(result.fireAt>fireAt,'a fresh pistol press must produce a real shot');}
 await a.waitForFunction(()=>window.__authorityTest.authority.players[0].kills===4);assert.equal(await a.evaluate(()=>window.__authorityTest.authority.players[0].weapon),1);
 const attacks=await a.evaluate(()=>window.__authorityTest.authority.players[0].lastAttack);await a.keyboard.press('KeyQ');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].weapon===0);await a.keyboard.press('KeyE');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].weapon===1);assert.equal(await a.evaluate(()=>window.__authorityTest.authority.players[0].lastAttack),attacks);
 await a.waitForFunction(()=>window.__authorityTest.authority.players.every(p=>!p.invul),{timeout:10000});await fixture(room,'friendly');
 await a.waitForFunction(()=>window.__authorityTest.authority.players[0].cooldown===0);
 const ammoBefore=await a.evaluate(()=>window.__authorityTest.authority.players[0].inventory[1]);
 await a.keyboard.down('Space');await a.waitForFunction(()=>!window.__authorityTest.authority.players[1].alive,{timeout:5000});await a.keyboard.up('Space');
 const friendlyShots=ammoBefore-await a.evaluate(()=>window.__authorityTest.authority.players[0].inventory[1]);assert(friendlyShots>=6&&friendlyShots<=9);
 await b.waitForFunction(()=>!window.__authorityTest.authority.players[1].alive);assert(await b.evaluate(()=>window.__authorityTest.authority.players[1].inventory.slice(1).every(n=>n===0)));
 assert.equal(await a.evaluate(()=>window.__authorityTest.authority.players[0].kills),4);await screenshot(a,'boxhead-friendly-fire-death');
 await fixture(room,'next-wave');await a.waitForFunction(()=>window.__authorityTest.authority.wave===2,{timeout:6000});await a.waitForFunction(()=>window.__sounds.some(s=>s.endsWith('world-end.mp3')));await b.waitForFunction(()=>window.__authorityTest.authority.players[1].alive,{timeout:8000});assert(await b.evaluate(()=>window.__authorityTest.authority.players[1].inventory.slice(1).every(n=>n===0)));
 await focus(b);await b.keyboard.press('KeyE');await wait(150);assert.equal(await b.evaluate(()=>window.__authorityTest.authority.players[1].weapon),0);
 await a.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 assert(await a.evaluate(()=>{const r=[...document.querySelectorAll('.player-nameplate:not([hidden])')].map(e=>e.getBoundingClientRect());return r.length===2&&(r[0].right<=r[1].left||r[1].right<=r[0].left||r[0].bottom<=r[1].top||r[1].bottom<=r[0].top);}), 'nearby names must not overlap');
 await screenshot(a,'boxhead-ammo-and-revive');results.push({game:'50737-server',nativeZombieKills:4,qeChangesWithoutShots:true,friendlyShots,deadAndRevivedStockEmpty:true,nextWaveSound:true,adjacentNamesDoNotOverlap:true});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));console.log('Fidelity browser checks passed.');
})().catch(async e=>{console.error(e);for(const p of await browser?.pages()||[])if(p.url().includes('authority-room')){try{console.error(JSON.stringify(await p.evaluate(()=>({url:location.href,state:window.__authorityTest?.snapshot(),enabled:window.__authorityTest?.inputEnabled}))));await p.screenshot({path:path.join(out,'failure.png')});}catch{}}process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
