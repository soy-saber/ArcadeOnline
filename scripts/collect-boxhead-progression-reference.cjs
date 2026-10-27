'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=path.resolve(__dirname,'..'),cache=path.join(root,'artifacts/boxhead-progression-reference');
const raw=fs.readFileSync(path.join(cache,'trace.json')),trace=JSON.parse(raw),input=require('../artifacts/boxhead-progression-reference/inputs.json'),groups={};
for(const row of trace.traces){const [type,id,...fields]=row.split('|');if(type==='DONE')continue;(groups[type]??=[]).push({id:Number(id),values:fields.map(s=>s==='true'?true:s==='false'?false:Number.isFinite(Number(s))?Number(s):s)});}
for(const [key,count]of Object.entries({LEVEL:618,INIT:30,STEP:1080,SPAWN:69,WAVE:6,DEAD:6,REGEN:3,NEW:1,OBJECT:6,TTL:3,WEAPON:8}))if(groups[key]?.length!==count)throw Error(key+' incomplete');
fs.writeFileSync(path.join(root,'tests/fixtures/boxhead-progression-as2.json'),JSON.stringify({...input,referenceEngine:trace.ruffle,traceSha256:crypto.createHash('sha256').update(raw).digest('hex'),groups},null,2)+'\n');console.log('Collected'+Object.values(groups).reduce((n,g)=>n+g.length,0)+' original progression/death/regen/object/weapon observations.');
