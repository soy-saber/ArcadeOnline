'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{fork}=require('child_process'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/bomb2-vehicles-e2e'),port=42000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;fs.mkdirSync(out,{recursive:true});
const errors=[],pending=new Map(),wait=ms=>new Promise(r=>setTimeout(r,ms));let browser,id=0;
const server=fork(path.join(__dirname,'fixtures/fidelity-server.cjs'),[],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});server.stderr.on('data',d=>errors.push(d.toString()));server.on('message',m=>{const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve();}});
function fixture(room,action,kind){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});server.send({id:key,room,action,kind});setTimeout(()=>{if(pending.delete(key))reject(Error('Fixture timeout'));},5000).unref();});}
async function focus(p){await p.bringToFront();await p.evaluate(()=>document.querySelector('#game-canvas').focus());}
async function stopped(p,seat=0){await p.waitForFunction(seat=>{const q=window.__authorityTest.authority.players[seat];return !q.rideMotion&&!q.travel&&q.moveDir<0&&!q.actionLock&&!q.attack&&!q.respawnAt;},{},seat);}
async function pickup(room,p,kind,condition){await stopped(p);await fixture(room,'pickup',kind);await p.waitForFunction(kind=>{const s=window.__authorityTest.authority;return s.players[0].x===3&&s.items[72]===kind;},{},kind);await focus(p);await p.keyboard.down('ArrowRight');await p.waitForFunction(condition);await p.keyboard.up('ArrowRight');await stopped(p);}
async function watch(p,kind){await p.evaluate(kind=>{window.__watchRide={kind,pending:null,result:null};},kind);}
async function recovered(p){await p.waitForFunction(()=>window.__watchRide?.result);const r=await p.evaluate(()=>window.__watchRide.result);assert(r.survived);return r;}
async function canvas(p,file){const png=await p.evaluate(()=>document.querySelector('#game-canvas').toDataURL());fs.writeFileSync(path.join(out,file),Buffer.from(png.split(',')[1],'base64'));}
(async()=>{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding']});const pages=[];
 for(let i=0;i<2;i++){
  const c=await browser.createBrowserContext(),p=await c.newPage();pages.push(p);p.setDefaultTimeout(15000);await p.setViewport({width:1500,height:1050});p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push(r.url());});
  await p.evaluateOnNewDocument(i=>{
   localStorage.setItem('arcade_name','Vehicle P'+(i+1));window.__rideDraws=[];
   const draw=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(...a){const src=a[0]?.src||'';
    if(src.includes('/native-vehicle-')){window.__rideDraws.push({name:src.split('/').pop(),frame:a[1]/a[3],w:a[3],h:a[4],dw:a[7],dh:a[8],x:a[5],y:a[6],alpha:this.globalAlpha});if(window.__rideDraws.length>3000)window.__rideDraws.splice(0,1000);}
    return draw.apply(this,a);
   };
  },i);
 }
 const [a,b]=pages,room='rides-'+Date.now().toString(36).slice(-6),results=[];
 for(const [i,p]of pages.entries()){await p.goto(`${base}/authority-room.html?game=9109-server&room=${room}&debug=1`);await p.waitForFunction(()=>window.__authorityTest?.authority);await p.click(`[data-seat="${i+1}"]`);await p.waitForFunction(i=>window.__authorityTest.seat===i,{},i+1);}
 await a.select('#game-character','4');await b.select('#game-character','3');await a.select('#game-map','mine-one');
 for(const p of pages)await p.waitForFunction(()=>Array.from({length:4},(_,c)=>['car','bulldozer','frog'].flatMap(k=>['left','up','right','down'].map(d=>`native-vehicle-${c}-${k}-${d}.png`))).flat().every(n=>performance.getEntriesByType('resource').some(r=>r.name.endsWith('/'+n))));
 await b.evaluate(()=>{const net=window.__authorityTest.network,original=net.onSnapshot;net.onSnapshot=function(s,...args){original.call(this,s,...args);const w=window.__watchRide,t=s.players[0]?.rideMotion;if(!w)return;
  if(!w.pending&&t?.kind===w.kind){const before=this.resyncs,candidate={kind:t.kind,born:t.born,requestedAt:s.tick,full:this.fullUpdates};this.requestFull();if(this.resyncs>before)w.pending=candidate;}
  else if(w.pending&&!w.result&&this.fullUpdates>w.pending.full)w.result={...w.pending,recoveredAt:s.tick,survived:t?.kind===w.pending.kind&&t?.born===w.pending.born};
 };});
 for(const p of pages){await p.click('#start-game');await p.waitForFunction(()=>window.__authorityTest.network.room.members.find(m=>m.id===window.__authorityTest.network.id).ready);}await a.waitForFunction(()=>window.__authorityTest.authority.phase==='playing'&&window.__authorityTest.authority.players.every(p=>!p.invulnerable));
 await pickup(room,a,19,()=>window.__authorityTest.authority.players[0].weapon===19);await focus(a);await a.keyboard.press('Space');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].ammo===1&&!window.__authorityTest.authority.players[0].attack);await stopped(a);
 await pickup(room,a,22,()=>window.__authorityTest.authority.players[0].shield);
 for(const [vehicle,kind]of [[14,'frog'],[13,'car'],[12,'bulldozer']]){
  await pickup(room,a,vehicle,new Function(`return window.__authorityTest.authority.players[0].vehicle===${vehicle}`));
  const mounted=await a.evaluate(()=>JSON.parse(JSON.stringify(window.__authorityTest.authority.players[0])));assert.equal(mounted.weapon,0);assert.equal(mounted.pendingWeapon.kind,19);assert.equal(mounted.pendingWeapon.ammo,1);
  let action=null;
  if(vehicle===14){
   await fixture(room,'vehicle-frog');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].x===3&&window.__authorityTest.authority.board[72]===1);await watch(b,'frog');await focus(a);await a.keyboard.down('ArrowRight');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].rideMotion?.kind==='frog');await a.keyboard.up('ArrowRight');
   const airborne=await a.evaluate(()=>({tick:window.__authorityTest.authority.tick,p:window.__authorityTest.authority.players[0]}));await a.keyboard.press('Space');await a.waitForFunction(()=>window.__rideDraws.some(d=>d.name==='native-vehicle-3-frog-right.png'&&d.frame>=20));await canvas(a,'native-frog-jump.png');const recovery=await recovered(b);
   await stopped(a);const landed=await a.evaluate(()=>({p:window.__authorityTest.authority.players[0],bombs:window.__authorityTest.authority.bombs.length}));assert.equal(landed.p.x,5);assert.equal(landed.p.range,2);assert.equal(landed.bombs,0);assert.equal(landed.p.pendingWeapon.ammo,1);assert.equal(landed.p.teleportUntil,0);action={airborne,landing:landed.p.walking,rangePickup:true,airAttackConsumed:true,recovery};
  }else if(vehicle===12){
   await fixture(room,'vehicle-crush');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].x===3&&window.__authorityTest.authority.board[72]===2);await focus(a);await a.keyboard.down('ArrowRight');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].rideMotion?.kind==='crush');const crush=await a.evaluate(()=>({tick:window.__authorityTest.authority.tick,p:window.__authorityTest.authority.players[0],crate:window.__authorityTest.authority.board[72]}));assert.equal(crush.crate,0);await a.keyboard.press('Space');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].x>=5);await a.keyboard.up('ArrowRight');await stopped(a);action={crush,actualCrateBreak:true,commandConsumedDuringPause:true};
  }else{
   await focus(a);await a.keyboard.down('ArrowRight');await a.waitForFunction(()=>window.__authorityTest.authority.players[0].x>=6);await a.keyboard.up('ArrowRight');await stopped(a);
  }
  const walk=await a.evaluate(kind=>window.__rideDraws.filter(d=>d.name===`native-vehicle-3-${kind}-right.png`&&d.frame>0),kind);assert(walk.length>0);assert(walk.every(d=>d.w===d.dw&&d.h===d.dh));
  await a.waitForFunction(()=>window.__authorityTest.authority.players.every(p=>!p.invulnerable));await stopped(a);await stopped(b,1);await fixture(room,'vehicle-hit');await b.waitForFunction(()=>window.__authorityTest.authority.players[1].x===6&&window.__authorityTest.authority.players[1].y===5);await watch(b,'wreck');
  await focus(b);await b.keyboard.press('Space');await b.waitForFunction(()=>window.__authorityTest.authority.bombs.some(b=>b.owner===2));await b.keyboard.down('ArrowDown');await b.waitForFunction(()=>window.__authorityTest.authority.players[1].y>=8);await b.keyboard.up('ArrowDown');await stopped(b,1);await focus(a);
  await a.waitForFunction(()=>window.__authorityTest.authority.players[0].rideMotion?.kind==='wreck');
  const damaged=await a.evaluate(()=>({tick:window.__authorityTest.authority.tick,p:window.__authorityTest.authority.players[0]}));assert.equal(damaged.p.vehicle,vehicle);assert.equal(damaged.p.weapon,0);assert(damaged.p.shield);assert.equal(damaged.p.deaths,0);await canvas(a,`native-${kind}-wreck.png`);
  const recovery=await recovered(b);await a.waitForFunction(()=>window.__authorityTest.authority.players[0].vehicle===0);await stopped(a);
  const restored=await a.evaluate(()=>JSON.parse(JSON.stringify(window.__authorityTest.authority.players[0])));assert.equal(restored.weapon,19);assert.equal(restored.ammo,1);assert(restored.shield);assert.equal(restored.deaths,0);assert.equal(restored.pendingWeapon,null);assert.deepEqual(restored.weaponStock,[19]);
  const art=require('../src/expanded/bomb2-vehicle-art.json').timelines[`vehicle-3-${kind}-right`],draws=await a.evaluate(kind=>window.__rideDraws.filter(d=>d.name===`native-vehicle-3-${kind}-right.png`),kind);assert(draws.some(d=>d.frame>=art.labels.dead-1));assert(draws.every(d=>d.w===art.w&&d.h===art.h&&d.dw===art.w&&d.dh===art.h));
  results.push({vehicle,kind,realPickup:true,sourceCharacter:4,nativeWalkAndWreck:true,nativeDimensions:true,action,actualOtherPlayerBomb:true,damaged,restored,shieldPreserved:true,noRobotDeath:true,ammoPreserved:1,wreckRecovery:recovery});
 }
 await a.click('#fullscreen-stage');await a.waitForFunction(()=>document.fullscreenElement||document.querySelector('.fullscreen-fallback'));await a.screenshot({path:path.join(out,'restored-weapon-fullscreen.png')});assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),nativeTexturesBeforeReady:48,results,errors},null,2));console.log('Native frog jump, car/bulldozer movement, real bomb wrecks, deferred weapon ammo and two-browser recovery passed.');
})().catch(async e=>{console.error(e,errors);for(const p of await browser?.pages()||[])if(p.url().includes('authority-room'))try{console.error(JSON.stringify(await p.evaluate(()=>{const s=window.__authorityTest?.authority;return{tick:s?.tick,players:s?.players,watch:window.__watchRide};})));await p.screenshot({path:path.join(out,'failure.png')});}catch{}process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
