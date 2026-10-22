"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{fork}=require('node:child_process'),puppeteer=require('puppeteer-core');
const repo=path.resolve(__dirname,'..'),output=path.join(repo,'artifacts/expanded-kill-e2e'),port=30000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`,room='kill-'+Date.now();
fs.mkdirSync(output,{recursive:true});const errors=[],wait=ms=>new Promise(r=>setTimeout(r,ms)),pending=new Map();let requestId=0,browser;
const server=fork(path.join(__dirname,'fixtures/bomb2-kill-server.cjs'),[],{cwd:repo,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
server.stderr.on('data',data=>errors.push(data.toString()));server.on('message',message=>{const handler=pending.get(message.id);if(handler){pending.delete(message.id);message.error?handler.reject(new Error(message.error)):handler.resolve();}});
function fixture(){return new Promise((resolve,reject)=>{const id=++requestId;pending.set(id,{resolve,reject});server.send({id,room});setTimeout(()=>{if(pending.delete(id))reject(new Error('Fixture timed out'));},5000).unref();});}
(async()=>{
  for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
  browser=await puppeteer.launch({executablePath:process.env.CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  const pages=[];
  for(let n=1;n<=4;n++){const context=await browser.createBrowserContext(),page=await context.newPage();pages.push(page);await page.setViewport({width:1450,height:1100});
    page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/expanded/assets/')&&r.status()>=400)errors.push(r.url());});
    await page.evaluateOnNewDocument(name=>localStorage.setItem('arcade_name',name),'Kill P'+n);await page.goto(`${base}/authority-room.html?game=9109-server&room=${room}&debug=1`);
    await page.waitForFunction(()=>window.__authorityTest?.authority);await page.click(`[data-seat="${n}"]`);await page.waitForFunction(seat=>window.__authorityTest.seat===seat,{},n);
  }
  const [a,b]=pages;await a.select('#game-mode','kill');await a.waitForFunction(()=>window.__authorityTest.network.room.auth.options.gameMode==='kill');await a.select('#game-map','beach-two');await b.waitForFunction(()=>window.__authorityTest.authority.mapId==='beach-two');
  for(const p of pages){await p.click('#start-game');await p.waitForFunction(()=>window.__authorityTest.network.room.members.find(m=>m.id===window.__authorityTest.network.id)?.ready);}
  await a.waitForFunction(()=>window.__authorityTest.authority.phase==='playing');const round=await a.evaluate(()=>window.__authorityTest.authority.round);
  await a.evaluate(()=>document.getElementById('game-canvas').focus());
  for(let n=1;n<=10;n++){
    await a.waitForFunction(()=>window.__authorityTest.authority.players.every(p=>!p.respawnAt&&!p.invulnerable&&!p.actionLock&&!p.attack),{timeout:8000});
    await fixture();await a.keyboard.press('Space');
    await Promise.all([a,b].map(p=>p.waitForFunction(n=>{const s=window.__authorityTest.authority;return s.players[0].points===n&&s.players[1].deaths===n;},{timeout:5000},n)));
    if(n===1){await b.screenshot({path:path.join(output,'death-and-first-kill.png'),fullPage:true});assert(await b.evaluate(()=>window.__authorityTest.authority.players[1].respawnAt>window.__authorityTest.authority.tick));}
    console.log('Real browser hammer kill '+n+'/10');
  }
  await b.waitForFunction(()=>{const t=window.__authorityTest;return t.authority.phase==='finished'&&t.authority.winner===1&&t.network.room.auth.records.find(r=>r.name==='Kill P1')?.wins===1;});
  const records=await b.evaluate(()=>window.__authorityTest.network.room.auth.records);assert.deepEqual(records.find(r=>r.name==='Kill P1'),{id:records.find(r=>r.name==='Kill P1').id,name:'Kill P1',kills:10,deaths:0,wins:1,rounds:1});assert.equal(records.find(r=>r.name==='Kill P2').deaths,10);
  await b.screenshot({path:path.join(output,'ten-kills-settlement.png'),fullPage:true});
  await Promise.all(pages.map(p=>p.waitForFunction(round=>{const t=window.__authorityTest;return t.authority.round>round&&t.authority.phase==='playing';},{timeout:10000},round)));
  assert(await a.evaluate(()=>{const t=window.__authorityTest;return t.authority.mode==='kill'&&t.authority.mapId==='beach-two'&&t.authority.players[0].points===0&&t.network.room.members.every(m=>m.ready)&&t.network.room.auth.records.find(r=>r.name==='Kill P1').kills===10;}));
  const full=await b.evaluate(()=>window.__authorityTest.network.fullUpdates);await b.evaluate(()=>window.__authorityTest.resync());await b.waitForFunction(full=>window.__authorityTest.network.fullUpdates>full,{},full);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({realBrowserKills:10,naturalRespawns:9,automaticRematch:true,mode:'kill',map:'beach-two',records,errors},null,2));console.log('Kill full-match browser E2E passed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server.exitCode==null)server.kill();});
