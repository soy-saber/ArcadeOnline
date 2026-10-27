'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/brawler-native-reference');let browser,server;
(async()=>{
 server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<style>html,body{margin:0;background:transparent}#stage{width:550px;height:400px}</style><script>window.RufflePlayer={config:{autoplay:"on",unmuteOverlay:"hidden",logLevel:"error",maxExecutionDuration:60,wmode:"transparent"}};</script><script src="/ruffle/ruffle.js"></script><div id="stage"></div><script>window.nativeFrameReady=()=>{};window.__traces=[];const p=window.__player=RufflePlayer.newest().createPlayer();p.style.width="550px";p.style.height="400px";document.querySelector("#stage").append(p);p.ruffle().load({url:"/reference.swf",allowScriptAccess:true,autoplay:"on",wmode:"transparent"}).then(()=>p.ruffle().traceObserver=s=>window.__traces.push(s));</script>');return;}
  const file=url.pathname.startsWith('/ruffle/')?path.join(root,'libs',url.pathname):path.join(out,url.pathname);if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'text/javascript':'application/octet-stream');fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--disable-gpu','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});const p=await browser.newPage(),consoleLines=[];p.on('console',m=>consoleLines.push(m.text()));p.on('pageerror',e=>consoleLines.push(e.stack||e.message));await p.setViewport({width:550,height:400});await p.goto('http://127.0.0.1:'+server.address().port);let failure,poses=[];
 try{
  await p.waitForFunction(()=>window.__traces?.some(s=>s.startsWith('DONE|')),{timeout:60000});
  for(const name of ['DefaultPlayer','CoffeePlayer','AuberginePlayer','SBLPlayer','TrashPlayer','PeachPlayer'])for(const action of ['still','punchGround','specialGround','specialUp']){
   const pose=await p.evaluate((name,action)=>window.__player.ruffle().callExternalInterface('referencePose',name,action,1,'red'),name,action);poses.push(pose);
  }
  await p.screenshot({path:path.join(out,'native-preview.png'),omitBackground:true});
  const stages={};for(const name of ['Rooftop','Mogadishu','B52','Space'])stages[name]=await p.evaluate(name=>window.__player.ruffle().callExternalInterface('referenceStage',name),name);fs.writeFileSync(path.join(out,'native-stages.json'),JSON.stringify(stages,null,2)+'\n');
 }catch(e){failure=e.stack||e.message;}
 const traces=await p.evaluate(()=>window.__traces||[]);fs.writeFileSync(path.join(out,'trace.json'),JSON.stringify({at:new Date().toISOString(),ruffle:require('../libs/ruffle/package.json').version,traces,poses,consoleLines,failure},null,2)+'\n');console.log('Captured',traces.length,'native trace rows and',poses.length,'poses;',traces.find(s=>s.startsWith('READY|')));if(failure)throw Error(failure);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
