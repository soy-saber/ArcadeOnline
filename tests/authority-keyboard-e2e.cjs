'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/authority-keyboard-e2e'),port=45000+Math.floor(Math.random()*1000),base=process.env.KEYBOARD_BASE_URL||`http://127.0.0.1:${port}`;fs.mkdirSync(out,{recursive:true});
const errors=[],results=[],wait=ms=>new Promise(r=>setTimeout(r,ms));let browser;
const server=process.env.KEYBOARD_BASE_URL?null:spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});server?.stderr.on('data',d=>errors.push(d.toString()));
const pairs=[['KeyW','ArrowUp','up',1],['KeyA','ArrowLeft','left',0],['KeyS','ArrowDown','down',3],['KeyD','ArrowRight','right',2]];
const motion=(packet,game,name,dir)=>game==='3881-server'?packet.input.dir===dir:game==='46923-server'&&(name==='up'||name==='down')?true:packet.input[name]===true;
const neutral=(packet,game)=>game==='3881-server'?packet.input.dir===-1:!packet.input.left&&!packet.input.right&&!packet.input.up&&!packet.input.down;
async function key(page,code,down){await page.keyboard[down?'down':'up'](code);const event=await page.evaluate(()=>window.__keyEvent);await page.waitForFunction(event=>window.__keyPackets.some(p=>p.event>=event),{},event);return page.evaluate(event=>window.__keyPackets.find(p=>p.event>=event),event);}
(async()=>{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const games=(await (await fetch(base+'/games.json')).json()).filter(g=>g.runtime==='server');assert.equal(games.length,8);
 for(const game of games){
  const room='keys-'+game.id.slice(0,4)+'-'+Date.now().toString(36).slice(-5),pages=[],contexts=[];
  for(let i=0;i<2;i++){
   const context=await browser.createBrowserContext(),p=await context.newPage();contexts.push(context);pages.push(p);p.setDefaultTimeout(15000);await p.setViewport({width:1440,height:1050});p.on('pageerror',e=>errors.push(game.id+': '+(e.stack||e.message)));
   await p.evaluateOnNewDocument(i=>{localStorage.setItem('arcade_name','Keyboard P'+(i+1));localStorage.setItem('arcade_native_sound','off');},i);
   await p.goto(`${base}/authority-room.html?game=${game.id}&room=${room}&debug=1`,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__authorityTest?.authority);await p.click(`[data-seat="${i+1}"]`);await p.waitForFunction(i=>window.__authorityTest.seat===i,{},i+1);
  }
  const [a,b]=pages;const first=game.id==='46923-server'?null:await a.$eval('#game-map',s=>s.options[0]?.value);if(first){await a.select('#game-map',first);await b.waitForFunction(map=>window.__authorityTest.network.room.auth.options.map===map,{},first);}
  for(const p of pages){await p.waitForFunction(()=>!document.querySelector('#start-game').disabled,{timeout:60000});await p.click('#start-game');await p.waitForFunction(()=>window.__authorityTest.network.room.members.find(m=>m.id===window.__authorityTest.network.id)?.ready);}await a.waitForFunction(()=>window.__authorityTest.authority.phase==='playing');await a.bringToFront();await a.evaluate(()=>document.querySelector('#game-canvas').focus());
  await a.evaluate(()=>{
   window.__keyEvent=0;window.__keyPackets=[];for(const name of ['keydown','keyup'])window.addEventListener(name,()=>window.__keyEvent++,true);
   const net=window.__authorityTest.network,control=net.control.bind(net);net.control=function(message){const result=control(message);if(result&&message.t==='authInput'){window.__keyPackets.push({event:window.__keyEvent,input:JSON.parse(JSON.stringify(message.input)),round:message.round});if(window.__keyPackets.length>500)window.__keyPackets.shift();}return result;};
  });
  const checks=[];
  for(const [letter,arrow,name,dir]of pairs){
   const wasd=await key(a,letter,true);assert(motion(wasd,game.id,name,dir),game.id+' '+letter);await key(a,letter,false);
   const arrows=await key(a,arrow,true);assert(motion(arrows,game.id,name,dir),game.id+' '+arrow);const released=await key(a,arrow,false);assert(neutral(released,game.id),game.id+' release '+arrow);
   const first=await key(a,letter,true),both=await key(a,arrow,true),one=await key(a,letter,false),last=await key(a,arrow,false);
   assert(motion(both,game.id,name,dir));assert(motion(one,game.id,name,dir));assert(neutral(last,game.id));
   if(game.id==='46923-server'&&(name==='up'||name==='down')){const counter=name==='up'?'jump':'hit';assert.equal(arrows.input[counter],wasd.input[counter]+1);assert.equal(both.input[counter],first.input[counter],'second alias must not repeat '+counter);assert.equal(one.input[counter],first.input[counter]);}
   checks.push({wasd:letter,arrow,direction:name,independentAlternatives:true,mixedHoldAndRelease:true,...(game.id==='46923-server'&&(name==='up'||name==='down')?{singleLogicalAction:true}:{})});
  }
  if(['3881-server','9109-server'].includes(game.id)){
   await key(a,'KeyW',true);await key(a,'KeyD',true);const alias=await key(a,'ArrowUp',true);assert.equal(alias.input.dir??alias.input.direction,2);const rightUp=await key(a,'KeyD',false);assert.equal(rightUp.input.dir??rightUp.input.direction,1);await key(a,'KeyW',false);await key(a,'ArrowUp',false);
  }
  await key(a,'ArrowRight',true);await a.evaluate(()=>{const field=document.createElement('input');field.id='keyboard-edit-test';document.body.append(field);field.focus();});const formRelease=await key(a,'ArrowRight',false);assert(neutral(formRelease,game.id),'releasing after form focus must clear movement');const typed=await key(a,'KeyW',true);assert(neutral(typed,game.id));if(game.id==='46923-server')assert.equal(typed.input.jump,formRelease.input.jump);await key(a,'KeyW',false);assert.equal(await a.$eval('#keyboard-edit-test',e=>e.value),'w');await a.evaluate(()=>{document.querySelector('#keyboard-edit-test').remove();document.querySelector('#game-canvas').focus();});
  const last=await a.evaluate(()=>window.__keyPackets.at(-1));await b.waitForFunction(seq=>window.__authorityTest.authority.ack[0]>=seq,{},last.input.seq);
  const details={game:game.id,checks,serverAcknowledgedSequence:last.input.seq,formFocusRelease:true,typingDoesNotMoveGame:true};results.push(details);await a.screenshot({path:path.join(out,game.id+'.png'),fullPage:true});console.log('WASD/arrow alternatives verified: '+game.id);for(const context of contexts)await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),base,games:results,errors},null,2));
})().catch(async e=>{console.error(e,errors);for(const p of await browser?.pages()||[])if(p.url().includes('authority-room'))try{console.error(JSON.stringify(await p.evaluate(()=>({url:location.href,phase:window.__authorityTest?.authority?.phase,tick:window.__authorityTest?.authority?.tick,packets:window.__keyPackets?.slice(-10)}))));await p.screenshot({path:path.join(out,'failure.png')});}catch{}process.exitCode=1;}).finally(async()=>{await browser?.close();server?.kill();});
