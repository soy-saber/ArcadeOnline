'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process'),puppeteer=require('puppeteer-core'),art=require('../src/badminton/ball-art.json');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/badminton-physics-e2e'),port=58000+Math.floor(Math.random()*1000),base=process.env.BADMINTON_BASE_URL||`http://127.0.0.1:${port}`;fs.mkdirSync(out,{recursive:true});
const errors=[],wait=ms=>new Promise(r=>setTimeout(r,ms));let browser;
const server=process.env.BADMINTON_BASE_URL?null:spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});server?.stderr.on('data',d=>errors.push(d.toString()));
async function focus(p){await p.bringToFront();await p.waitForFunction(()=>!document.hidden&&document.hasFocus());await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{document.querySelector('#game-canvas').focus();resolve();}))));}
async function shot(p,name){const data=await p.evaluate(()=>document.querySelector('#game-canvas').toDataURL());fs.writeFileSync(path.join(out,name),Buffer.from(data.split(',')[1],'base64'));}
(async()=>{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 browser=await puppeteer.launch({executablePath:process.env.CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']});const pages=[],room='physics-'+Date.now().toString(36).slice(-6);
 for(let i=0;i<3;i++){
  const context=await browser.createBrowserContext(),p=await context.newPage();pages.push(p);p.setDefaultTimeout(15000);await p.setViewport({width:1500,height:1050});p.on('pageerror',e=>errors.push(e.stack||e.message));
  await p.evaluateOnNewDocument((i,art)=>{
   localStorage.setItem('arcade_name','Physics '+i);localStorage.setItem('arcade_native_sound','on');localStorage.setItem('arcade_native_volume','24');
   const w=window.__physics={errors:[],errorCount:0,draws:[],audio:[],snapshots:[],recoveries:[],requests:[],attempts:[]},seen=new Set();let group=[],trailIndex=0;
   HTMLMediaElement.prototype.play=function(){if(this.src.includes('badminton'))w.audio.push({file:this.src.split('/').pop(),tick:window.__authorityTest?.authority?.tick});return Promise.resolve();};
   const draw=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(...args){const result=draw.apply(this,args);if(this.canvas.id!=='game-canvas')return result;
    const file=(args[0]?.src||'').split('/').pop(),s=window.__authorityTest?.state;if(file==='court.png'){group=[];trailIndex=0;return result;}if(!s)return result;
    if(/^(p[12])-(body|swing|serve|racket)/.test(file))group?.push(file.startsWith('p1')?'p1':'p2');
    const name=file?.replace('.png',''),m=art.art[name];if(!m)return result;if(name==='net'){group=[];trailIndex=0;}group.push(name);
    const matrix=this.getTransform(),actual=[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f];let x=0,y=0,r=0,scale=1,frame=1,p;
    if(name==='net')frame=s.net.frame;
    else if(name==='trail'){p=[...s.particles].sort((a,b)=>a.id-b.id)[trailIndex++];if(!p){w.errorCount++;if(w.errors.length<10)w.errors.push('Unexpected trail');return result;}({x,y,rotation:r,scale}=p);}
    else{({x,y,rotation:r}=s.birdie);if(name==='bird-shadow'){x+=art.shadowOffset[0];y+=art.shadowOffset[1];}}
    // Blink stores translate arguments in float32; compare that exact numeric
    // conversion rather than allowing an arbitrary pixel error.
    const a=r*Math.PI/180,expected=[Math.cos(a)*scale*2,Math.sin(a)*scale*2,-Math.sin(a)*scale*2,Math.cos(a)*scale*2,Math.fround(x*2),Math.fround(y*2)],crop=[(frame-1)*m.w,0,m.w,m.h,m.x,m.y,m.w,m.h];
    if(actual.some((v,j)=>Math.abs(v-expected[j])>1e-7)||args.slice(1).some((v,j)=>Math.abs(v-crop[j])>1e-7)||args.length!==9||this.globalAlpha!==1){w.errorCount++;if(w.errors.length<10)w.errors.push({file,tick:s.tick,actual,expected,crop:args.slice(1),wanted:crop,alpha:this.globalAlpha});}
    const id=s.round+':'+s.tick+':'+name+':'+(p?.id??'');if(!seen.has(id)){seen.add(id);w.draws.push({id,tick:s.tick,name,frame,particle:p?.id,rotation:r,x,y,scale,group:[...group]});}
    if(name==='trail'&&s.net.playing&&s.net.frame>1&&s.net.frame<12&&!w.effectCapture){w.effectCapture={tick:s.tick,frame:s.net.frame,net:s.net,particles:s.particles,birdie:s.birdie};if(i===2)requestAnimationFrame(()=>w.effectPng=this.canvas.toDataURL());}
   };
  },i,art);
  await p.goto(`${base}/authority-room.html?game=46923-server&room=${room}&debug=1`,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__authorityTest?.authority);if(i<2){await p.click(`[data-seat="${i+1}"]`);await p.waitForFunction(seat=>window.__authorityTest.seat===seat,{},i+1);}
 }
 const [a,b,v]=pages;
 async function prepare(attempt){
 if(attempt)for(let i=0;i<3;i++){const p=pages[i];await p.goto(`${base}/authority-room.html?game=46923-server&room=${room}-${attempt}&debug=1`,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__authorityTest?.authority);if(i<2){await p.click(`[data-seat="${i+1}"]`);await p.waitForFunction(seat=>window.__authorityTest.seat===seat,{},i+1);}}
 for(const p of [a,b])await p.click('#start-game');await v.waitForFunction(()=>window.__authorityTest.authority.phase==='playing');
 await v.evaluate(()=>{const net=window.__authorityTest.network,original=net.onSnapshot,w=window.__physics;net.onSnapshot=function(s,...args){original.call(this,s,...args);w.snapshots.push(JSON.parse(JSON.stringify(s)));const kind=s.net.playing?'net':s.particles.length?'trail':null;
  if(kind&&!w.requests.some(r=>r.kind===kind)){const count=this.resyncs,candidate={kind,tick:s.tick,full:this.fullUpdates,net:s.net,particles:s.particles};this.requestFull();if(this.resyncs>count)w.requests.push(candidate);}
  for(const r of w.requests)if(this.fullUpdates>r.full&&!w.recoveries.some(x=>x.kind===r.kind))w.recoveries.push({kind:r.kind,tick:s.tick,net:s.net,particles:s.particles});
 };});
 await focus(b);await b.keyboard.down('ArrowRight');await b.waitForFunction(()=>window.__authorityTest.authority.players[1].x===505.35);await b.keyboard.up('ArrowRight');
 // A late, low return naturally hits the floor and then the net. Only DOM
 // keyboard events are generated; no state, velocity or timers are written.
 await b.evaluate(()=>{const w=window.__physics,canvas=document.querySelector('#game-canvas');canvas.focus();let fired=-1;w.offset=35;
  let minimumRtt=Infinity;
  w.controller=setInterval(()=>{const net=window.__authorityTest.network,s=net.authority;if(net.rtt>0)minimumRtt=Math.min(minimumRtt,net.rtt);if(!s||s.rally!=='flight'||s.birdie.born===fired)return;
   const estimate=s.tick+(performance.now()-net.lastSnapshotAt+(Number.isFinite(minimumRtt)?minimumRtt:0))/(1000/30)+.5;
   if(estimate>=s.birdie.born+w.offset){fired=s.birdie.born;w.attempts.push({born:fired,tick:s.tick,estimate,rtt:net.rtt,offset:w.offset});canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowDown',bubbles:true}));setTimeout(()=>canvas.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowDown',bubbles:true})),50);}
  },4);
 });
 }
 const attempts=[];let netHit=false;
 for(const offset of (process.env.PHYSICS_OFFSETS||'34,34,35,33,34,35,34,33').split(',').map(Number)){
  await prepare(attempts.length);
  console.log('Physics attempt '+(attempts.length+1)+', offset '+offset);
  await a.waitForFunction(()=>{const s=window.__authorityTest.authority;return s.rally==='serve'&&s.serve===1;});await b.evaluate(offset=>window.__physics.offset=offset,offset);await focus(a);await a.keyboard.press('KeyS');
  await v.waitForFunction(()=>window.__authorityTest.authority.rally==='point');await wait(650);const s=await v.evaluate(()=>JSON.parse(JSON.stringify(window.__authorityTest.authority))),frames=await Promise.all(pages.map(p=>p.evaluate(()=>[...new Set(window.__physics.draws.filter(d=>d.name==='net').map(d=>d.frame))])));attempts.push({offset,tick:s.tick,net:s.net,score:s.score,birdie:s.birdie,frames,strokeAt:s.players[1].racket.strokeAt,born:s.birdie.born});console.log(JSON.stringify(attempts.at(-1)));if(errors.length)throw Error(errors[0]);if(s.net.hits&&frames.every(f=>f.length>=4)){netHit=true;break;}
 }
 assert(netHit,'A legal low return must produce a native net impact');await v.waitForFunction(()=>window.__physics.recoveries.some(r=>r.kind==='net'));await shot(v,'native-net-and-dead-ball.png');
 await v.waitForFunction(()=>{const s=window.__authorityTest.authority;return s.net.hits&&!s.net.playing&&s.net.frame===1;});await v.click('#fullscreen-stage');await v.waitForFunction(()=>document.fullscreenElement||document.querySelector('.fullscreen-fallback'));await shot(v,'native-effects-fullscreen.png');await v.click('#exit-fullscreen');await b.evaluate(()=>clearInterval(window.__physics.controller));
 const records=await Promise.all(pages.map(p=>p.evaluate(()=>window.__physics)));
 for(let i=0;i<records.length;i++){const r=records[i];assert(r.effectCapture);if(i===2){assert(r.effectPng);fs.writeFileSync(path.join(out,'native-net-impact.png'),Buffer.from(r.effectPng.split(',')[1],'base64'));delete r.effectPng;}}
 for(const r of records){assert.equal(r.errorCount,0,JSON.stringify(r.errors[0]));assert(r.draws.some(d=>d.name==='trail'));assert(r.draws.some(d=>d.name==='bird-shadow'));assert(r.draws.some(d=>d.name==='bird-glow'));const frames=new Set(r.draws.filter(d=>d.name==='net').map(d=>d.frame));assert(frames.size>=4);for(const d of r.draws.filter(d=>d.name==='bird-glow'))assert.deepEqual(d.group.slice(-2),['bird-shadow','bird-glow']);}
 const watch=records[2];assert(watch.snapshots.some(s=>s.particles.length>=12));assert(watch.snapshots.some(s=>s.rally==='point'&&s.particles.length));assert(watch.requests.some(r=>r.kind==='trail'));assert(watch.recoveries.some(r=>r.kind==='trail'));assert(watch.snapshots.some(s=>s.birdie.contactBy===2));assert(watch.audio.some(e=>e.file==='badminton-hit.mp3'));assert(watch.audio.some(e=>e.file==='badminton-score.mp3'));assert.deepEqual(errors,[]);
 const hits=Math.max(...watch.snapshots.map(s=>s.hits));for(const r of records)assert.equal(r.audio.filter(e=>e.file==='badminton-hit.mp3').length,hits,'Full recovery must not replay confirmed hit sounds');
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),base,normalInputOnly:true,netHit,attempts,records,fullscreen:true,errors},null,2));console.log('Normal late return, floor/net impact, native net frames/trails/filter registration/depths/rotation, audio and full effect recovery passed in three Chrome clients.');
})().catch(async e=>{console.error(e);if(errors.length)console.error(errors.slice(0,3).join('\n'));for(const p of await browser?.pages()||[])if(p.url().includes('authority-room'))try{fs.writeFileSync(path.join(out,'diagnostic.json'),JSON.stringify({errors,...await p.evaluate(()=>({state:window.__authorityTest?.snapshot(),physics:window.__physics}))},null,2));await shot(p,'failure.png');}catch{}process.exitCode=1;}).finally(async()=>{await browser?.close();server?.kill();});
