'use strict';
// Collect a naturally generated item using ordinary movement/punch keys.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/brawler-items-e2e'),port=33000+Math.floor(Math.random()*400),base=process.env.BRAWLER_BASE_URL||`http://127.0.0.1:${port}`,wait=ms=>new Promise(r=>setTimeout(r,ms)),errors=[],pages=[];let browser;
fs.mkdirSync(out,{recursive:true});const server=process.env.BRAWLER_BASE_URL?null:spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','ignore','pipe']});server?.stderr.on('data',d=>errors.push(d.toString()));
const snap=p=>p.evaluate(()=>window.__authorityTest.snapshot());
async function focus(p){await p.bringToFront();await p.waitForFunction(()=>document.hasFocus()&&!document.hidden);await p.$eval('#game-canvas',e=>e.focus());}
(async()=>{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 browser=await puppeteer.launch({executablePath:process.env.CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const room='items-'+Date.now().toString(36).slice(-7);for(let i=0;i<3;i++){const ctx=await browser.createBrowserContext(),p=await ctx.newPage();pages.push(p);p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.stack||e.message));await p.setViewport({width:1500,height:1050});await p.evaluateOnNewDocument(i=>{localStorage.setItem('arcade_name','Items '+i);localStorage.setItem('arcade_native_sound','off');},i);await p.goto(`${base}/authority-room.html?game=6232-server&room=${room}&debug=1`,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__authorityTest?.authority);if(i<2){await p.click(`[data-seat="${i===0?1:4}"]`);await p.waitForFunction(i=>window.__authorityTest.seat===(i===0?1:4),{},i);await p.select('#game-character','1');}}
 const [a,b,v]=pages;await a.waitForFunction(()=>!document.querySelector('#start-game').disabled,{timeout:60000});await b.waitForFunction(()=>!document.querySelector('#start-game').disabled,{timeout:60000});await a.click('#start-game');await b.click('#start-game');await v.waitForFunction(()=>window.__authorityTest.authority.phase==='playing');
 await focus(b);await b.keyboard.down('ArrowRight');await v.waitForFunction(()=>window.__authorityTest.authority.players[1].x>825);await b.keyboard.up('ArrowRight');await focus(a);
 await a.keyboard.down('ArrowDown');await wait(650);await a.keyboard.up('ArrowDown');await v.waitForFunction(()=>window.__authorityTest.authority.players[0].grounded&&window.__authorityTest.authority.players[0].y>240);
 await v.evaluate(()=>{window.__items=[];window.__timer=setInterval(()=>{const s=window.__authorityTest.snapshot();if(s?.tick!==window.__items.at(-1)?.tick)window.__items.push(s);if(window.__items.length>2500)window.__items.shift();},40);});
 let collected;const start=Date.now();
 while(Date.now()-start<300000&&!collected){
  const s=await snap(v),p=s.players[0],item=s.items.filter(q=>q.state===1&&q.y>240&&q.age<7000&&(!process.env.BRAWLER_ITEM_TYPE||q.name===process.env.BRAWLER_ITEM_TYPE)).sort((x,y)=>Math.abs(x.x-p.x)-Math.abs(y.x-p.x))[0];
  if(!item){await wait(250);continue;}
  const code=item.x<p.x?'ArrowLeft':'ArrowRight';if(Math.abs(item.x-p.x)>8){await a.keyboard.down(code);const until=Date.now()+5500;let lastX=p.x,stalled=Date.now();while(Date.now()<until){const z=await snap(v),q=z.items.find(q=>q.id===item.id);if(!q||Math.abs(q.x-z.players[0].x)<12)break;if(Math.abs(z.players[0].x-lastX)>2){lastX=z.players[0].x;stalled=Date.now();}else if(Date.now()-stalled>250&&z.players[0].grounded){await a.keyboard.press('ArrowUp',{delay:100});stalled=Date.now();}await wait(35);}await a.keyboard.up(code);}
  await a.keyboard.press('KeyJ');await wait(500);const z=await snap(v),held=z.items.find(q=>q.id===item.id&&q.state===3&&q.owner===1);if(held)collected={item:held,state:z};
 }
 assert(collected,'No natural item was collected before the observation deadline');await a.screenshot({path:path.join(out,'naturally-held.png')});
 await v.waitForFunction(()=>window.__authorityTest.authority.players[0].attack==='');await a.keyboard.press('KeyJ');const id=collected.item.id;
 await v.waitForFunction(id=>window.__items.some(s=>s.items.some(q=>q.id===id&&q.state===2))||window.__items.some(s=>s.explosions.length),{},id);
 if(collected.item.name==='Mine'){
  await v.waitForFunction(id=>window.__authorityTest.authority.items.some(q=>q.id===id&&q.state===0),{},id);const s=await snap(v),q=s.items.find(q=>q.id===id);await wait(1100);const code=q.x<s.players[0].x?'ArrowLeft':'ArrowRight';await a.keyboard.down(code);await v.waitForFunction(id=>!window.__authorityTest.authority.items.some(q=>q.id===id),{timeout:8000},id);await a.keyboard.up(code);
 }
 await v.waitForFunction(()=>window.__items.some(s=>s.explosions.length));await a.screenshot({path:path.join(out,'original-item-outcome.png')});
 const observations=await v.evaluate(()=>{clearInterval(window.__timer);return window.__items;});assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({base,at:new Date().toISOString(),normalInputOnly:true,collected,observations,errors},null,2)+'\n');console.log('Natural '+collected.item.name+' spawn, ordinary movement, punch pickup, held item, second-punch throw and explosion passed.');
})().catch(async e=>{console.error(e);for(let i=0;i<pages.length;i++)try{fs.writeFileSync(path.join(out,'diagnostic-'+i+'.json'),JSON.stringify(await snap(pages[i]),null,2));}catch{}process.exitCode=1;}).finally(async()=>{await browser?.close();server?.kill();});
