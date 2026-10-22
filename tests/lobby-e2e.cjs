"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),puppeteer=require('puppeteer-core');
const repo=path.resolve(__dirname,'..'),output=path.join(repo,process.env.LOBBY_BASE_URL?'artifacts/lobby-public-e2e':'artifacts/lobby-e2e'),port=33000+Math.floor(Math.random()*1000),base=process.env.LOBBY_BASE_URL||`http://127.0.0.1:${port}`;
fs.mkdirSync(output,{recursive:true});const errors=[],wait=ms=>new Promise(r=>setTimeout(r,ms));let browser;
const server=process.env.LOBBY_BASE_URL?null:spawn(process.execPath,['server.js'],{cwd:repo,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:'ignore'});
(async()=>{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 const catalog=await(await fetch(base+'/games.json')).json();assert.equal(catalog.length,8);assert(catalog.every(g=>g.runtime==='server'&&!/服务器|联机版|原生版/.test(g.title)));
 for(const id of ['3881','46923','137953','50737','6232','9109','97734','fbw_forest']){
  const response=await fetch(`${base}/room.html?game=${id}&room=my-room`,{redirect:'manual'});assert.equal(response.status,302);const url=new URL(response.headers.get('location'),base);assert.equal(url.pathname,'/authority-room.html');assert.equal(url.searchParams.get('game'),id+'-server');assert.equal(url.searchParams.get('room'),'my-room');
 }
 for(const route of ['/native/bomb.js','/native/badminton.js','/public/native/bomb.js','/games/3881/game.swf','/room.js','/libs/ruffle/ruffle.js'])assert.equal((await fetch(base+route)).status,404,route);
 browser=await puppeteer.launch({executablePath:process.env.CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox']});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().includes('/assets/'))errors.push(r.url());});
 await page.setViewport({width:1600,height:1100});await page.goto(base);await page.waitForSelector('#name-input');await page.screenshot({path:path.join(output,'login-desktop.png'),fullPage:true});
 await page.type('#name-input','大厅验证');await page.click('#name-btn');await page.waitForFunction(()=>document.querySelectorAll('.game-card').length===8);await page.evaluate(async()=>{window.scrollTo(0,document.body.scrollHeight);await new Promise(r=>setTimeout(r,300));await Promise.all([...document.querySelectorAll('.game-cover img')].map(img=>img.decode()));window.scrollTo(0,0);});
 assert.equal(await page.$eval('#game-total',el=>el.textContent),'8');assert(await page.$$eval('.game-card a',links=>links.every(a=>new URL(a.href).pathname==='/authority-room.html')));assert(await page.$$eval('.game-cover img',images=>images.length===8&&images.every(img=>img.complete&&img.naturalWidth>=600)));
 assert(await page.evaluate(()=>getComputedStyle(document.body,'::before').backgroundImage.includes('yuuka-kurisu-background.webp')));
 await page.screenshot({path:path.join(output,'lobby-desktop.png'),fullPage:true});
 const geometry=()=>page.evaluate(()=>{const r=document.querySelector('.library-tools').getBoundingClientRect();const c=document.querySelector('.game-card:not([hidden])').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,cardHeight:c.height,scrollY:window.scrollY};});
 for(const [width,height]of [[1600,1100],[1060,1100],[700,1100],[390,844]]){
  await page.setViewport({width,height});await page.evaluate(()=>{window.scrollTo(0,100);document.querySelector('[data-filter="all"]').click();window.lobbyCardReferences=[...document.querySelectorAll('.game-card')];});
  const original=await geometry();
  for(const [filter,count]of [['sports',1],['party',3],['action',3],['adventure',1],['all',8]]){
   await page.click(`[data-filter="${filter}"]`);assert.equal(await page.$$('.game-card:not([hidden])').then(a=>a.length),count);
   const current=await geometry();for(const key of ['x','y','width','height','cardHeight','scrollY'])assert(Math.abs(current[key]-original[key])<1,`${width}px ${filter}: ${key} shifted ${current[key]-original[key]}px`);
   assert(await page.evaluate(()=>window.lobbyCardReferences.every(card=>card.isConnected)),'Filtering replaced game cards');
  }
 }
 await page.type('#game-search','泡泡堂');assert.equal(await page.$$('.game-card:not([hidden])').then(a=>a.length),2);
 await page.$eval('#game-search',el=>{el.value='不存在的游戏';el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.$$('.game-card:not([hidden])').then(a=>a.length),0);assert(await page.$eval('#empty-library',el=>!el.hidden&&el.getBoundingClientRect().top<window.innerHeight),'Empty search message is out of view');
 await page.$eval('#game-search',el=>{el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(output,'lobby-mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile horizontal overflow');
 await page.goto(`${base}/authority-room.html?game=9109-server&room=lobby-test&debug=1`);await page.waitForFunction(()=>window.__authorityTest?.authority);assert.equal(await page.$eval('#game-title',el=>el.textContent),'Q版泡泡堂2');
 await page.goto(`${base}/native-room.html?game=46923-native&room=redirect-test&debug=1`);await page.waitForFunction(()=>document.getElementById('game-title')?.textContent==='火柴人打羽毛球');assert(page.url().includes('46923-server'));await wait(300);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({games:catalog.map(g=>({id:g.id,title:g.title,cover:g.cover})),desktop:true,mobile:true,filters:true,stableFilterLayout:true,oldLinksRedirect:true,retiredAssets:true,errors},null,2));console.log('LOBBY E2E PASS: eight original names, all covers, background, stable filters/scroll at four viewport sizes, mobile, retired versions');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server?.exitCode==null)server?.kill();});
