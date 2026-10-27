'use strict';
// Real server, separate browser identities, UI and keyboard only; no state fixtures.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/brawler-combat-e2e'),port=32500+Math.floor(Math.random()*400),base=process.env.BRAWLER_BASE_URL||`http://127.0.0.1:${port}`,wait=ms=>new Promise(r=>setTimeout(r,ms)),errors=[],pages=[];let browser;
fs.mkdirSync(out,{recursive:true});const server=process.env.BRAWLER_BASE_URL?null:spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','ignore','pipe']});server?.stderr.on('data',d=>errors.push(d.toString()));
async function open(p,room,seat){await p.goto(`${base}/authority-room.html?game=6232-server&room=${room}&debug=1`,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__authorityTest?.authority);if(seat){await p.click(`[data-seat="${seat}"]`);await p.waitForFunction(n=>window.__authorityTest.seat===n,{},seat);}}
async function focus(p){await p.bringToFront();await p.waitForFunction(()=>!document.hidden&&document.hasFocus());await p.$eval('#game-canvas',e=>e.focus());}
async function selectedDraw(p,c){const name=require('../src/expanded/brawler-data.json').fighters[c].id;await focus(p);await p.waitForFunction((c,name)=>window.__authorityTest.authority.players[0].character===c&&window.__authorityTest.authority.players[1].character===0&&[...window.__drawn].some(s=>s.endsWith('/'+name+'-red.png'))&&[...window.__drawn].some(s=>s.endsWith('/DefaultPlayer-orange.png')),{timeout:60000},c,name);}
(async()=>{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 browser=await puppeteer.launch({executablePath:process.env.CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 for(let i=0;i<3;i++){const ctx=await browser.createBrowserContext(),p=await ctx.newPage();pages.push(p);p.setDefaultTimeout(20000);await p.setViewport({width:1500,height:1050,hasTouch:i===0});p.on('pageerror',e=>errors.push(e.stack||e.message));p.on('response',r=>{if(r.url().includes('/expanded/assets/brawler/')&&r.status()>=400)errors.push(r.url()+' '+r.status());});await p.evaluateOnNewDocument(i=>{localStorage.setItem('arcade_name','Combat '+i);localStorage.setItem('arcade_native_sound','off');window.__drawn=new Set();const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(im,...args){if(this.canvas.id==='game-canvas')window.__drawn.add(im?.src||'');return draw.call(this,im,...args);};},i);}
 const [a,b,v]=pages,results={base,at:new Date().toISOString(),normalInputOnly:true,characters:[]},expected=['EnergyBall','Poop','Pencil',null,'Garbage','Bullet'];
 for(let c=0;c<6;c++){
  const room='combat-'+c+'-'+Date.now().toString(36).slice(-7);await open(a,room,1);await open(b,room,4);await open(v,room);await a.select('#game-character',String(c+1));await b.select('#game-character','1');await v.waitForFunction(c=>window.__authorityTest.authority.players[0].character===c,{},c);
  await v.evaluate(()=>{window.__observed=[];window.__watch=setInterval(()=>{const s=window.__authorityTest.snapshot();if(s?.phase==='playing'&&s.tick!==window.__observed.at(-1)?.tick)window.__observed.push({tick:s.tick,players:s.players.map(p=>({seat:p.seat,x:p.x,y:p.y,damage:p.damage,attack:p.attack,frame:p.animation.frame,state:p.state,grounded:p.grounded,shield:p.shield,shielded:p.shielded})),shots:s.shots.map(q=>q.name)});},8);});
  await selectedDraw(a,c);await selectedDraw(b,c);await a.waitForFunction(()=>!document.querySelector('#start-game').disabled,{timeout:60000});await b.waitForFunction(()=>!document.querySelector('#start-game').disabled,{timeout:60000});await a.click('#start-game');await a.waitForFunction(()=>window.__authorityTest.network.room.members.find(m=>m.id===window.__authorityTest.network.id)?.ready);await b.click('#start-game');await b.waitForFunction(()=>window.__authorityTest.network.room.members.find(m=>m.id===window.__authorityTest.network.id)?.ready);await v.waitForFunction(()=>window.__authorityTest.authority.phase==='playing'&&window.__authorityTest.authority.players.every(p=>p.grounded));await focus(a);
  await a.keyboard.down('ShiftLeft');await v.waitForFunction(()=>window.__authorityTest.authority.players[0].shielded);await a.keyboard.up('ShiftLeft');await v.waitForFunction(()=>!window.__authorityTest.authority.players[0].shielded);
  if(c===0){await a.$eval('#brawler-shield',e=>e.scrollIntoView({block:'center'}));const r=await (await a.$('#brawler-shield')).boundingBox();await a.mouse.move(r.x+r.width/2,r.y+r.height/2);await a.mouse.down();await v.waitForFunction(()=>window.__authorityTest.authority.players[0].shielded);await a.mouse.up();await v.waitForFunction(()=>!window.__authorityTest.authority.players[0].shielded);await a.click('#alt-button');await focus(a);}else await a.keyboard.press('KeyK');
  if(expected[c])await v.waitForFunction(name=>window.__observed.some(r=>r.shots.includes(name)),{},expected[c]);else await v.waitForFunction(()=>window.__observed.some(r=>r.players[1].damage>0));
  await v.waitForFunction(()=>window.__authorityTest.authority.players[0].attack==='');await wait(100);await focus(a);
  await a.keyboard.down('ArrowUp');await a.keyboard.press('KeyK');await a.keyboard.up('ArrowUp');
  await v.waitForFunction(()=>window.__observed.some(r=>r.players[0].attack==='specialUp'));
  if(c===4)await v.waitForFunction(()=>window.__observed.some(r=>r.shots.filter(n=>n==='Garbage').length>=15));
  if(c===5)await v.waitForFunction(()=>window.__observed.some(r=>r.shots.includes('Rocket')));
  await wait(700);await v.screenshot({path:path.join(out,'character-'+(c+1)+'.png')});
  const observations=await v.evaluate(()=>{clearInterval(window.__watch);return {ticks:window.__observed,drawn:[...window.__drawn],snapshot:window.__authorityTest.snapshot()};});
  observations.activeDrawn=await a.evaluate(()=>[...window.__drawn]);
  if(expected[c])assert(observations.activeDrawn.some(s=>s.endsWith(expected[c]+'-object.png')),'native projectile art actually drawn in active player canvas');
  assert(observations.ticks.some(r=>r.players[0].shielded&&r.players[0].shield<100));
  const full=await v.evaluate(()=>{const n=window.__authorityTest.network;n.requestFull();return n.fullUpdates;});await v.waitForFunction(n=>window.__authorityTest.network.fullUpdates>n,{},full);
  if(c===5){
   await a.evaluate(()=>{window.__media=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__media.push(this.src);return play.call(this);};});
   await a.click('#sound-toggle');await focus(a);await a.waitForFunction(()=>window.__media.some(s=>s.endsWith('/Rooftop.mp3'))&&window.__media.some(s=>s.endsWith('/Helicopter.mp3')));
   await v.waitForFunction(()=>window.__authorityTest.authority.players[0].grounded&&window.__authorityTest.authority.players[0].attack==='');await a.keyboard.press('KeyK');await a.waitForFunction(()=>window.__media.some(s=>s.endsWith('/PeachGun.mp3')));results.originalAudio=await a.evaluate(()=>window.__media);
   await a.click('#sound-toggle');
  }
  results.characters.push({character:c,...observations});console.log('Native character '+(c+1)+' special, up-special, guard, original art and full snapshot passed.');
 }
 assert.deepEqual(errors,[]);results.errors=errors;fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)+'\n');
})().catch(async e=>{console.error(e);fs.writeFileSync(path.join(out,'errors.json'),JSON.stringify(errors,null,2));for(let i=0;i<pages.length;i++)try{fs.writeFileSync(path.join(out,'diagnostic-'+i+'.json'),JSON.stringify(await pages[i].evaluate(()=>({state:window.__authorityTest?.snapshot(),rendered:window.__authorityTest?.state,observed:window.__observed,drawn:[...window.__drawn]})),null,2));}catch{}process.exitCode=1;}).finally(async()=>{await browser?.close();server?.kill();});
