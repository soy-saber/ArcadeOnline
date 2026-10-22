"use strict";
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),port=32000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`,output=path.join(root,'artifacts/site-assets');
fs.mkdirSync(output,{recursive:true});
const entry=path.join(output,'cover-entry.ts'),bundle=path.join(output,'cover-render.js');
fs.writeFileSync(entry,`import {ADAPTERS} from '../../src/expanded/registry';
import * as bomb from '../../src/authority/bomb-core';
import {GameView} from '../../src/authority/bomb-view';
import * as badminton from '../../src/badminton/core';
import {BadmintonView} from '../../src/badminton/view';
let render:any;
(window as any).prepareCover=(id:string)=>{
 const canvas=document.getElementById('cover') as HTMLCanvasElement;
 const a=ADAPTERS.find(a=>a.id===id);
 if(a){const maps:Record<string,string>={'137953-server':'compact','9109-server':'beach-two'};
  const s=a.create(1,true,Array.from({length:a.seats},(_,i)=>i+1),367,maps[id]);
  for(let n=0;n<18;n++)a.step(s,Array.from({length:4},()=>({seq:n,left:false,right:false,up:false,down:false,attack:0,alt:0})));
  if(id==='9109-server'){for(const [n,x,y]of [[0,4,4],[1,12,4],[2,4,10],[3,12,10]]){s.players[n].x=x;s.players[n].y=y;}}
  canvas.width=a.width;canvas.height=a.height;render=()=>a.render(canvas,s,null);
 }else if(id==='3881-server'){const s=bomb.createGame(367,1,true,{mode:'online',activeSeats:[1,2,3,4],map:'beach'});const view=new GameView(canvas);view.sound=false;render=()=>view.render(s,null);}
 else {const s=badminton.createGame(1,true);const view=new BadmintonView(canvas);render=()=>view.render(s,null);}
 render();
};(window as any).drawCover=()=>render();`);
require('esbuild').buildSync({entryPoints:[entry],outfile:bundle,bundle:true,platform:'browser',format:'iife'});
const server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:'ignore'});let browser;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await wait(50);}
 browser=await puppeteer.launch({executablePath:process.env.CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox']});const page=await browser.newPage();await page.setViewport({width:1400,height:1100});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().includes('/assets/'))errors.push(r.url());});
 await page.goto(base);await page.evaluate(()=>{document.head.innerHTML='';document.body.innerHTML='<canvas id="cover"></canvas>';document.body.style.cssText='margin:0;background:#101222';});await page.addScriptTag({path:bundle});
 for(const game of JSON.parse(fs.readFileSync(path.join(root,'public/games.json'),'utf8'))){await page.evaluate(id=>window.prepareCover(id),game.id);await wait(850);await page.evaluate(()=>window.drawCover());await page.$eval('#cover',c=>{c.style.display='block';});await (await page.$('#cover')).screenshot({path:path.join(output,'cover-'+game.id+'.png')});console.log('Captured '+game.title);}
 if(errors.length)throw new Error(JSON.stringify(errors));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
