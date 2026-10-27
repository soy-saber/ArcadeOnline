'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{open}=require('./lib/brawler-native-player.cjs');
const root=path.resolve(__dirname,'..'),cache=path.join(root,'artifacts/brawler-native-reference');let player;
(async()=>{
 player=await open({fps:10});const rows=[];
 for(const [name,variants]of [['Mine',[2,8,9]],['Grenade',[2,10]],['Garbage',[1,2,3,4,5,6]]]){
  await player.call('referenceObjectBatch',variants.map((v,i)=>[name,v,false,60+i*55,100,1]));await player.step();const entry=await player.call('referenceObjectRead'),initialized=await player.call('referenceObjectInitialize');await player.step();const stable=await player.call('referenceObjectRead');rows.push({name,variants,entry,initialized,stable});
 }
 const types=[];
 for(let type=0;type<=6;type++)for(let repeat=0;repeat<12;repeat++){
  const immediate=await player.call('referenceGarbageInit',0,4,type);await player.step();const native=(await player.call('referenceObjectRead'))[0];types.push({type,repeat,immediate,native});
 }
 const constructors=[];
 for(let batch=0;batch<10;batch++){
  await player.call('referenceObjectBatch',Array.from({length:16},(_,i)=>['Garbage',1,false,20+i*20,200,1]));await player.step();const entry=await player.call('referenceObjectRead');
  const immediate=[];for(let i=0;i<16;i++)immediate.push(await player.call('referenceGarbageInit',i,0,i%2));await player.step();const stable=await player.call('referenceObjectRead');
  for(let i=0;i<16;i++)constructors.push({type:i%2,entry:entry[i],immediate:immediate[i],native:stable[i]});
 }
 const result={input:JSON.parse(fs.readFileSync(path.join(cache,'inputs.json'))),rows,types,constructors,consoleLines:player.consoleLines};fs.writeFileSync(path.join(cache,'initialized-object-trace.json'),JSON.stringify(result,null,2)+'\n');fs.writeFileSync(path.join(root,'tests/fixtures/brawler-initialized-objects.json'),JSON.stringify(result,null,2)+'\n');
 console.log(rows.map(r=>({name:r.name,variants:r.variants,frames:r.stable.map(v=>v.frame),bounds:r.stable.map(v=>v.bounds)})));
 for(let type=0;type<=6;type++)console.log('Garbage Type'+type+': '+[...new Set(types.filter(r=>r.type===type).map(r=>r.native.frame))]);
 console.log('Constructor-frame1 Type1 transitions: '+JSON.stringify(constructors.filter(r=>r.type===1&&r.entry.frame===1).map(r=>r.native.frame)));
 for(const row of rows)for(let i=0;i<row.variants.length;i++)if(row.name!=='Garbage'||row.variants[i]>1)assert.equal(row.stable[i].frame,row.variants[i]);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>player?.close());
