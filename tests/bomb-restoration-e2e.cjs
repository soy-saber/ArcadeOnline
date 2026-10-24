'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{fork}=require('node:child_process'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/bomb-restoration-e2e'),port=37000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;
fs.mkdirSync(out,{recursive:true});const errors=[],results=[],pending=new Map(),wait=ms=>new Promise(r=>setTimeout(r,ms));let id=0,browser;
const server=fork(path.join(__dirname,'fixtures/fidelity-server.cjs'),[],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});server.stderr.on('data',b=>errors.push(b.toString()));
server.on('message',m=>{const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve();}});
function fixture(room,action,extra={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});server.send({id:key,room,action,...extra});setTimeout(()=>{if(pending.delete(key))reject(Error('IPC timeout'));},5000).unref();});}
async function focus(p){await p.bringToFront();await p.evaluate(()=>document.querySelector('#game-canvas').focus());}
async function recovered(p){await p.waitForFunction(()=>{const s=window.__authorityTest.authority;return s.players.every(p=>p.moveDir<0&&!p.actionLock&&!p.attack)&&(!s.inputs||s.inputs.every(i=>i.dir<0));});}
async function pickup(a,room,kind){await recovered(a);await fixture(room,'pickup',{kind});await a.waitForFunction(kind=>{const s=window.__authorityTest.authority;return s.players[0].x===3&&s.players[0].y===4&&s.items[4*(s.gameId?17:15)+4]===kind;},{},kind);await focus(a);await a.keyboard.down('ArrowRight');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].x===4);await a.keyboard.up('ArrowRight');await recovered(a);}
(async()=>{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 browser=await puppeteer.launch({executablePath:process.env.CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const pages=[];
 for(let i=0;i<2;i++){
  const ctx=await browser.createBrowserContext(),p=await ctx.newPage();pages.push(p);p.setDefaultTimeout(15000);await p.setViewport({width:1600,height:1100});
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(r.status()+' '+r.url());});
  await p.evaluateOnNewDocument(i=>{
   localStorage.setItem('arcade_name','Bomb audit P'+(i+1));localStorage.setItem('arcade_native_sound','on');window.__audio=[];window.__media=[];window.__art=[];
   const play=HTMLMediaElement.prototype.play,draw=CanvasRenderingContext2D.prototype.drawImage;
   HTMLMediaElement.prototype.play=function(){window.__audio.push({src:this.src,loop:this.loop,volume:this.volume});if(!window.__media.includes(this))window.__media.push(this);return play.call(this);};
   CanvasRenderingContext2D.prototype.drawImage=function(im,...args){if(im.src&&!window.__art.includes(im.src))window.__art.push(im.src);return draw.call(this,im,...args);};
  },i);
 }
 const [a,b]=pages;
 for(const game of ['3881-server','9109-server']){
  const room='bfix-'+game.slice(0,4)+'-'+Date.now().toString(36).slice(-5);
  for(const [i,p]of pages.entries()){await p.goto(`${base}/authority-room.html?game=${game}&room=${room}&debug=1`);await p.waitForFunction(()=>window.__authorityTest?.authority);await p.click(`[data-seat="${i+1}"]`);await p.waitForFunction(i=>window.__authorityTest.seat===i,{},i+1);}
  await a.select('#game-character','3');await b.waitForFunction(()=>window.__authorityTest.authority.players[0].character===3);
  await b.select('#game-character','4');await a.waitForFunction(()=>window.__authorityTest.authority.players[1].character===4);
  await a.select('#game-difficulty','easy');await b.waitForFunction(()=>window.__authorityTest.network.room.auth.options.difficulty==='easy');
  if(game==='9109-server'){await a.select('#game-mode','collect');await b.waitForFunction(()=>window.__authorityTest.authority.mode==='collect');}
  for(const p of pages){await p.click('#start-game');await p.waitForFunction(()=>window.__authorityTest.network.room.members.find(m=>m.id===window.__authorityTest.network.id).ready);}
  await a.waitForFunction(()=>window.__authorityTest.authority.phase==='playing');
  await a.waitForFunction(()=>window.__authorityTest.authority.players.every(p=>!p.invulnerable));
  await focus(a);
  if(game==='3881-server'){
   for(let n=0;n<2;n++)await pickup(a,room,'range');assert.equal(await a.evaluate(()=>window.__authorityTest.authority.players[0].range),3);
   await fixture(room,'blast');await focus(a);await a.keyboard.press('Space');await a.waitForFunction(()=>window.__authorityTest.authority.bombs.length===1);
   await a.keyboard.down('ArrowDown');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].y>=9);await a.keyboard.up('ArrowDown');
   await a.waitForFunction(()=>window.__authorityTest.authority.blasts.length>0);
   await a.waitForFunction(()=>window.__art.some(s=>s.endsWith('/bomb1-blast-3.png')));
   await a.screenshot({path:path.join(out,'bomb1-original-blast.png'),fullPage:true});
   await a.waitForFunction(()=>window.__authorityTest.authority.blasts.length===0);
   assert.equal(await a.evaluate(()=>window.__authorityTest.authority.board[3*15+5]),2);
   assert(await a.evaluate(()=>window.__audio.some(s=>s.src.endsWith('/explode.mp3'))));
   assert(await a.evaluate(()=>window.__audio.some(s=>/bomb1-music[1-4]\.mp3$/.test(s.src)&&s.loop)));
   results.push({game,sourceCharacterSelection:true,easyShield:true,realPickupRange:3,originalColouredBlast:true,crateBlocksArm:true,musicAndExplosion:true});
  }else{
   for(let n=1;n<=9;n++){await pickup(a,room,9);assert.equal(await a.evaluate(()=>window.__authorityTest.authority.players[0].points),n);}
   await a.waitForFunction(()=>window.__authorityTest.authority.players.every(p=>!p.invulnerable));await fixture(room,'coin-duel');await focus(b);await b.keyboard.press('Space');
   await b.waitForFunction(()=>window.__authorityTest.authority.bombs.length===1);await b.keyboard.down('ArrowDown');await b.waitForFunction(()=>window.__authorityTest.authority.players[1].y>=7);await b.keyboard.up('ArrowDown');
   await focus(a);await a.waitForFunction(()=>window.__authorityTest.authority.players[0].deaths===1);
   const death=await a.evaluate(()=>{const s=window.__authorityTest.authority;return{points:s.players[0].points,coins:s.items.filter(n=>n===9).length};});assert.equal(death.points,5);assert.equal(death.coins,4);
   await a.screenshot({path:path.join(out,'bomb2-coin-death.png'),fullPage:true});await a.waitForFunction(()=>window.__authorityTest.authority.players[0].respawnAt===0);
   assert(await a.evaluate(()=>window.__audio.some(s=>s.src.endsWith('/4107_bomb.mp3'))&&window.__audio.some(s=>s.src.endsWith('/4104_eatProp.mp3'))&&window.__audio.some(s=>s.src.endsWith('/4105_dead.mp3'))));
   await a.evaluate(()=>window.__authorityTest.resync());await wait(150);
   await a.click('#sound-toggle');assert(await a.evaluate(()=>window.__media.every(m=>m.paused)));
   const before=await a.evaluate(()=>window.__audio.filter(s=>s.src.endsWith('/4110_addBomb.mp3')).length);
   await focus(a);await a.keyboard.press('Space');await a.waitForFunction(()=>window.__authorityTest.authority.bombs.some(b=>b.owner===1));await wait(100);
   assert.equal(await a.evaluate(()=>window.__audio.filter(s=>s.src.endsWith('/4110_addBomb.mp3')).length),before);
   await a.click('#sound-toggle');assert.equal(await a.evaluate(()=>window.__audio.filter(s=>s.src.endsWith('/4110_addBomb.mp3')).length),before);
   await a.click('#fullscreen-stage');await a.waitForFunction(()=>document.fullscreenElement||document.querySelector('.fullscreen-fallback'));await a.screenshot({path:path.join(out,'bomb2-fullscreen.png')});
   results.push({game,sourceCharacterSelection:true,realCoinsCollected:9,deathDrops:4,retainedCoins:5,naturalRevive:true,musicAndCombatSounds:true,muteAndSnapshotReplay:true,fullscreen:true});
  }
  console.log('Bomb restoration browser passed: '+game);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));
})().catch(async e=>{console.error(e,errors);for(const p of await browser?.pages()||[])if(p.url().includes('authority-room')){try{console.error(JSON.stringify(await p.evaluate(()=>({url:location.href,state:window.__authorityTest?.snapshot()}))));await p.screenshot({path:path.join(out,'failure.png')});}catch{}}process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
