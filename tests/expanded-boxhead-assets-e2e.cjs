'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/boxhead-original'),port=33000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;
fs.mkdirSync(out,{recursive:true});
const entry=path.join(out,'preview.ts'),bundle=path.join(out,'preview.js');
fs.writeFileSync(entry,`import {adapter as a} from '../../src/expanded/boxhead';
import {camera,room,openPosition,weaponStats} from '../../src/expanded/boxhead-world';
import {nameAnchors} from '../../src/authority/nameplates';
import data from '../../src/expanded/boxhead-data.json';
let state:any;const canvas=document.querySelector('canvas')!;
(window as any).preview=(id:string,spread=false)=>{state=a.create(1,true,[1,2,3,4],42,id);state.tick=240;state.waveReady=0;state.nextSpawn=999999;
 if(spread){const map=room(state);const corners=[[80,120],[map.width-80,120],[80,map.height-80],[map.width-80,map.height-80]];
 state.players.forEach((p:any,i:number)=>Object.assign(p,openPosition(state,...corners[i] as [number,number]),{invul:0}));}
 else {state.players.forEach((p:any,i:number)=>{p.weapon=[0,1,2,7][i];p.invul=0;});
 const p=state.players[0];state.zombies.push({id:999,x:p.x+100,y:p.y+100,hp:100,devil:false,attack:0,dir:-2,owner:0,hitAt:-99,attackAt:-99});}
 a.render(canvas,state,1);return {camera:camera(state),map:room(state),players:state.players,anchors:nameAnchors(state,1280,800)};};
(window as any).redraw=()=>a.render(canvas,state,1);
(window as any).preload=async()=>{const files=[...data.maps.flatMap(m=>[m.id+'-floor.svg',m.id+'-cover.svg']),...Object.values(data.animations).map(a=>a.file),...Object.values(data.objects).map(a=>a.file)];await Promise.all(files.map(file=>new Promise<void>((resolve,reject)=>{const im=new Image();im.onload=()=>resolve();im.onerror=()=>reject(file);im.src='/expanded/assets/boxhead/'+file;})));const context=new AudioContext();await Promise.all(Object.values(data.audio).map(async file=>{const response=await fetch('/expanded/assets/boxhead/'+file);if(!response.ok)throw new Error(file);const audio=await context.decodeAudioData(await response.arrayBuffer());if(!audio.length)throw new Error(file);}));await context.close();return {images:files.length,sounds:Object.keys(data.audio).length};};
`);
require('esbuild').buildSync({entryPoints:[entry],outfile:bundle,bundle:true,platform:'browser'});
const server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));let browser;
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 browser=await puppeteer.launch({executablePath:process.env.CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:1280,height:800});await page.goto(base);
 await page.evaluate(()=>{document.head.innerHTML='';document.body.innerHTML='<canvas width="1280" height="800"></canvas>';document.body.style.cssText='margin:0;background:#222';});await page.addScriptTag({path:bundle});
 const assets=await page.evaluate(()=>window.preload());assert(assets.images>=160);assert.equal(assets.sounds,26);
 const maps=require('../src/expanded/boxhead-data.json').maps;
 for(const map of maps){
   const scene=await page.evaluate(id=>window.preview(id,true),map.id);
   for(const p of scene.players){const x=scene.camera.x+p.x*scene.camera.scale,y=scene.camera.y+p.y*scene.camera.scale;assert(x>10&&x<1270,map.id);assert(y>100&&y<790,map.id);}
   assert.equal(scene.anchors.length,4);
   await page.evaluate(()=>window.redraw());await page.screenshot({path:path.join(out,map.id+'-shared.png')});
 }
 await page.evaluate(()=>window.preview('original-01'));await wait(250);await page.evaluate(()=>window.redraw());await page.screenshot({path:path.join(out,'boxy-native.png')});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({maps:maps.length,assets,errors},null,2));console.log(`Boxhead native assets: ${assets.images} images and ${assets.sounds} sounds decoded; all ${maps.length} maps retain four separated players in the shared camera.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
