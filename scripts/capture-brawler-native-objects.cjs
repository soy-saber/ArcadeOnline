'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),{open}=require('./lib/brawler-native-player.cjs');
const root=path.resolve(__dirname,'..'),cache=path.join(root,'artifacts/brawler-native-reference'),out=path.join(cache,'object-captures-initialized'),spec=require('../artifacts/brawler-native-reference/object-cases.json'),input=require('../artifacts/brawler-native-reference/inputs.json'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');fs.mkdirSync(out,{recursive:true});let player;
(async()=>{
 player=await open({fps:10});const jobs=spec.jobs.slice().sort((a,b)=>(a.envelope[3]-a.envelope[1])-(b.envelope[3]-b.envelope[1])||a.name.localeCompare(b.name)||a.variant-b.variant),batches=[],specSha256=sha(fs.readFileSync(path.join(cache,'object-cases.json')));
 const fixed=new Set(['Mine','Grenade','Garbage','Shield']),jobBatches=[];for(const group of [jobs.filter(j=>fixed.has(j.name)),jobs.filter(j=>!fixed.has(j.name))])for(let i=0;i<group.length;i+=8)jobBatches.push(group.slice(i,i+8));
 for(let b=0;b<jobBatches.length;b++){
  const batch=jobBatches[b],cols=Math.min(4,batch.length),rows=Math.ceil(batch.length/cols),pad=48,cellW=Math.ceil(Math.max(...batch.map(j=>j.envelope[2]-j.envelope[0])))+pad*2,cellH=Math.ceil(Math.max(...batch.map(j=>j.envelope[3]-j.envelope[1])))+pad*2,width=cols*cellW,height=rows*cellH,placements=batch.map((j,i)=>({cell:[i%cols*cellW,Math.floor(i/cols)*cellH,cellW,cellH],origin:[i%cols*cellW+pad-Math.floor(j.envelope[0]),Math.floor(i/cols)*cellH+pad-Math.floor(j.envelope[1])]}));
  assert(width<=8192&&height<=8192,'native effect sheet capture exceeds renderer dimensions');await player.p.setViewport({width,height,deviceScaleFactor:1});await player.p.evaluate(({width,height})=>{document.querySelector('#stage').style.width=width+'px';document.querySelector('#stage').style.height=height+'px';window.__player.style.width=width+'px';window.__player.style.height=height+'px';},{width,height});
  await player.call('referenceObjectBatch',batch.map((j,i)=>[j.name,j.variant,j.play,...placements[i].origin,j.spawnType]));const record={jobs:batch,placements,width,height,specSha256,harnessSha256:input.harnessSha256,shots:[]};
  const initialized=fixed.has(batch[0].name);
  if(initialized){
   await player.step();record.entry=await player.call('referenceObjectRead');record.initialization=await player.call('referenceObjectInitialize');await player.step();
   // Frame1 of Garbage is an authored random branch. Select a genuinely
   // observed native frame1 for its artwork; game RNG is implemented separately.
   record.frame1Selection=[];
   for(let i=0;i<batch.length;i++)if(batch[i].name==='Garbage'&&batch[i].variant===1){
    let poses=await player.call('referenceObjectRead'),attempt=0;
    while(poses[i].frame!==1&&attempt++<128){record.frame1Selection.push(poses[i].frame);await player.call('referenceObjectSetFrame',i,1);await player.step();poses=await player.call('referenceObjectRead');}
    assert.equal(poses[i].frame,1,'original random entry must yield an observable frame1');
   }
  }
  for(let age=0;age<Math.max(...batch.map(j=>j.frames));age++){
   if(age>0||!initialized)await player.step();const poses=await player.call('referenceObjectRead');assert.equal(poses.length,batch.length);if(initialized)for(let i=0;i<batch.length;i++){const j=batch[i],expected=j.variant===1&&j.name==='Mine'?8:j.variant===1&&j.name==='Grenade'?10:j.variant;assert.equal(poses[i].frame,expected,j.name+' authored/native state frame');}const file=`objects-${String(b).padStart(2,'0')}-${String(age).padStart(3,'0')}.png`,image=await player.p.screenshot({path:path.join(out,file),omitBackground:true});record.shots.push({file,sha256:sha(image),age,poses});if(age===0)await player.call('referenceObjectPlay');
  }
  const file=`objects-${String(b).padStart(2,'0')}.json`;fs.writeFileSync(path.join(out,file),JSON.stringify(record,null,2)+'\n');batches.push({file,sha256:sha(fs.readFileSync(path.join(out,file)))});console.log('Captured native object batch '+(b+1)+'/'+jobBatches.length+'.');
 }
 fs.writeFileSync(path.join(cache,'object-capture-initialized.json'),JSON.stringify({input,ruffle:require('../libs/ruffle/package.json').version,chrome:await player.browser.version(),specSha256,batches,consoleLines:player.consoleLines},null,2)+'\n');console.log('Captured '+jobs.length+' original projectile/item/shield/effect films.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>player?.close());
