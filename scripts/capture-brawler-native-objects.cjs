'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),{open}=require('./lib/brawler-native-player.cjs');
const root=path.resolve(__dirname,'..'),cache=path.join(root,'artifacts/brawler-native-reference'),out=path.join(cache,'object-captures-10fps'),spec=require('../artifacts/brawler-native-reference/object-cases.json'),input=require('../artifacts/brawler-native-reference/inputs.json'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');fs.mkdirSync(out,{recursive:true});let player;
(async()=>{
 player=await open({fps:10});const jobs=spec.jobs.slice().sort((a,b)=>(a.envelope[3]-a.envelope[1])-(b.envelope[3]-b.envelope[1])||a.name.localeCompare(b.name)||a.variant-b.variant),batches=[],specSha256=sha(fs.readFileSync(path.join(cache,'object-cases.json')));
 for(let b=0;b<Math.ceil(jobs.length/8);b++){
  const batch=jobs.slice(b*8,b*8+8),cols=Math.min(4,batch.length),rows=Math.ceil(batch.length/cols),pad=48,cellW=Math.ceil(Math.max(...batch.map(j=>j.envelope[2]-j.envelope[0])))+pad*2,cellH=Math.ceil(Math.max(...batch.map(j=>j.envelope[3]-j.envelope[1])))+pad*2,width=cols*cellW,height=rows*cellH,placements=batch.map((j,i)=>({cell:[i%cols*cellW,Math.floor(i/cols)*cellH,cellW,cellH],origin:[i%cols*cellW+pad-Math.floor(j.envelope[0]),Math.floor(i/cols)*cellH+pad-Math.floor(j.envelope[1])]}));
  assert(width<=8192&&height<=8192,'native effect sheet capture exceeds renderer dimensions');await player.p.setViewport({width,height,deviceScaleFactor:1});await player.p.evaluate(({width,height})=>{document.querySelector('#stage').style.width=width+'px';document.querySelector('#stage').style.height=height+'px';window.__player.style.width=width+'px';window.__player.style.height=height+'px';},{width,height});
  await player.call('referenceObjectBatch',batch.map((j,i)=>[j.name,j.variant,j.play,...placements[i].origin,j.spawnType]));const record={jobs:batch,placements,width,height,specSha256,harnessSha256:input.harnessSha256,shots:[]};
  for(let age=0;age<Math.max(...batch.map(j=>j.frames));age++){
   await player.step();const poses=await player.call('referenceObjectRead');assert.equal(poses.length,batch.length);const file=`objects-${String(b).padStart(2,'0')}-${String(age).padStart(3,'0')}.png`,image=await player.p.screenshot({path:path.join(out,file),omitBackground:true});record.shots.push({file,sha256:sha(image),age,poses});if(age===0)await player.call('referenceObjectPlay');
  }
  const file=`objects-${String(b).padStart(2,'0')}.json`;fs.writeFileSync(path.join(out,file),JSON.stringify(record,null,2)+'\n');batches.push({file,sha256:sha(fs.readFileSync(path.join(out,file)))});console.log('Captured native object batch '+(b+1)+'/'+Math.ceil(jobs.length/8)+'.');
 }
 fs.writeFileSync(path.join(cache,'object-capture-10fps.json'),JSON.stringify({input,ruffle:require('../libs/ruffle/package.json').version,chrome:await player.browser.version(),specSha256,batches,consoleLines:player.consoleLines},null,2)+'\n');console.log('Captured '+jobs.length+' original projectile/item/shield/effect films.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>player?.close());
