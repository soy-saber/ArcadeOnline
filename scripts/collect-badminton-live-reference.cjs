'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=path.resolve(__dirname,'..'),cache=path.join(root,'artifacts/badminton-live-reference');
const source=JSON.parse(fs.readFileSync(path.join(cache,'source.json'),'utf8')),trace=JSON.parse(fs.readFileSync(path.join(cache,'trace.json'),'utf8')),rows=trace.traces.map(s=>s.split('|')),hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const samples=trace.samples.filter(s=>s.run>=0&&s.heroCalls>0&&s.heroCalls<=60&&Number.isFinite(s.p1?.x)&&Number.isFinite(s.p2?.x)),inputs=rows.filter(r=>r[0]==='INPUT').map(r=>({run:Number(r[1]),tick:Number(r[2]),held:r[3]==='true',mouse:r[4]==='true',x:Number(r[5]),y:Number(r[6])}));
if(inputs.length!==480||new Set(samples.map(s=>s.run)).size!==8)throw Error('Incomplete live solo runs');
const fixture={source,referenceEngine:trace.ruffle,traceSha256:hash(path.join(cache,'trace.json')),referenceSwfSha256:hash(path.join(cache,'reference.swf')),inputs,orders:rows.filter(r=>r[0]==='ORDER').map(r=>({run:Number(r[1]),tick:Number(r[2]),callbacks:r[3].split(',')})),samples};
fs.writeFileSync(path.join(root,'tests/fixtures/badminton-solo-live.json'),JSON.stringify(fixture,null,2)+'\n');console.log('Collected',samples.length,'post-frame snapshots across480native solo callbacks.');
