'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),{open}=require('./lib/brawler-native-player.cjs');
const root=path.resolve(__dirname,'..'),cache=path.join(root,'artifacts/brawler-native-reference'),out=path.join(cache,'captures'),spec=require('../artifacts/brawler-native-reference/art-cases.json'),input=require('../artifacts/brawler-native-reference/inputs.json'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');fs.mkdirSync(out,{recursive:true});let player;
const jobs=spec.playback.slice().sort((a,b)=>a.frames-b.frames||a.fighter.localeCompare(b.fighter)||a.pose.localeCompare(b.pose)||a.color.localeCompare(b.color)||a.variant.localeCompare(b.variant));
(async()=>{
 player=await open();const batchCount=Math.ceil(jobs.length/32),specSha256=sha(fs.readFileSync(path.join(cache,'art-cases.json'))),batches=[];
 for(let b=0;b<batchCount;b++){
  const file=path.join(out,`batch-${String(b).padStart(3,'0')}.json`),batch=jobs.slice(b*32,b*32+32);
  if(fs.existsSync(file)){const prior=JSON.parse(fs.readFileSync(file));if(prior.complete&&prior.specSha256===specSha256&&prior.harnessSha256===input.harnessSha256&&prior.shots.every(s=>fs.existsSync(path.join(out,s.file))&&sha(fs.readFileSync(path.join(out,s.file)))===s.sha256)){batches.push(prior);console.log('Reused verified native batch '+(b+1)+'/'+batchCount);continue;}}
  const cols=Math.min(8,batch.length),rows=Math.ceil(batch.length/cols),pad=32,cellW=Math.max(...batch.map(j=>Math.ceil(j.envelope[2])-Math.floor(j.envelope[0])))+pad*2,cellH=Math.max(...batch.map(j=>Math.ceil(j.envelope[3])-Math.floor(j.envelope[1])))+pad*2,width=cols*cellW,height=rows*cellH;
  const placements=batch.map((j,i)=>({cell:[i%cols*cellW,Math.floor(i/cols)*cellH,cellW,cellH],origin:[i%cols*cellW+pad-Math.floor(j.envelope[0]),Math.floor(i/cols)*cellH+pad-Math.floor(j.envelope[1])]}));
  await player.p.setViewport({width,height,deviceScaleFactor:1});await player.p.evaluate(({width,height})=>{const stage=document.querySelector('#stage');stage.style.width=width+'px';stage.style.height=height+'px';window.__player.style.width=width+'px';window.__player.style.height=height+'px';},{width,height});
  await player.call('referencePlaybackBatch',batch.map((j,i)=>[j.fighter,j.pose,1,j.color,...placements[i].origin,j.hidden]));
  const record={complete:false,specSha256,harnessSha256:input.harnessSha256,batch:b,cols,cellW,cellH,width,height,jobs:batch,placements,shots:[],samples:[]},seen=batch.map(()=>new Set()),maximum=Math.max(1,...batch.map(j=>j.frames));
  for(let step=1;step<=maximum+1;step++){
   const nativeFrame=await player.step(),poses=await player.call('referenceRead');assert.equal(poses.length,batch.length);const captures=[];
   for(let i=0;i<poses.length;i++){
    const p=poses[i],job=batch[i],frame=job.frames?p[4]:0;
    if(job.frames){assert(Number.isSafeInteger(frame)&&frame>=1&&frame<=job.frames,job.fighter+'/'+job.pose+' invalid native frame '+frame);assert.equal(p[2],spec.fighters[job.fighter].poses[job.pose].rootFrame,'native root pose changed unexpectedly');}
    if(!seen[i].has(frame)){seen[i].add(frame);captures.push({index:i,frame,pose:p});}
   }
   record.samples.push({nativeFrame,frames:poses.map(p=>p[4]??0)});
   if(captures.length){const name=`batch-${String(b).padStart(3,'0')}-${String(step).padStart(3,'0')}.png`,image=await player.p.screenshot({path:path.join(out,name),omitBackground:true});record.shots.push({file:name,sha256:sha(image),step,captures});}
   if(step===1)await player.call('referencePlayChildren');
  }
  record.complete=true;fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');batches.push(record);console.log('Captured native batch '+(b+1)+'/'+batchCount+': '+batch.length+' clips, '+record.shots.length+' rendered frames.');
 }
 const result={input,ruffle:require('../libs/ruffle/package.json').version,chrome:await player.browser.version(),specSha256,batches:batches.map((b,i)=>({file:`batch-${String(i).padStart(3,'0')}.json`,sha256:sha(fs.readFileSync(path.join(out,`batch-${String(i).padStart(3,'0')}.json`))),jobs:b.jobs.length,shots:b.shots.length,captured:b.shots.reduce((n,s)=>n+s.captures.length,0)})),consoleLines:player.consoleLines};fs.writeFileSync(path.join(cache,'capture.json'),JSON.stringify(result,null,2)+'\n');console.log('Captured '+jobs.length+' original native clip/color/visibility playback cases.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>player?.close());
