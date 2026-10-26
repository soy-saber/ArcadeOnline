'use strict';
const fs=require('fs'),crypto=require('crypto'),path=require('path'),root=path.resolve(__dirname,'..'),cache=path.join(root,'artifacts/boxhead-pickup-reference');
const input=JSON.parse(fs.readFileSync(path.join(cache,'inputs.json'))),trace=JSON.parse(fs.readFileSync(path.join(cache,'trace.json'))),rows=trace.traces.filter(s=>s.startsWith('PICKUP|')).map(s=>s.split('|'));
if(rows.length!==40)throw Error('Missing native pickup cases');
const data={...input,observation:'Weapon choice comes from AddWeapon observer; health choice is identified by the native HP delta. No replacement branch is executed for health.',referenceEngine:trace.ruffle,traceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(cache,'trace.json'))).digest('hex'),cases:rows.map(r=>({input:input.cases[+r[1]],output:{choice:r[2]==='none'&&+r[3]!==input.cases[+r[1]].hp?'life':r[2],hp:+r[3],result:r[4]==='true',draws:+r[5]}}))};
fs.writeFileSync(path.join(root,'tests/fixtures/boxhead-pickup-as2.json'),JSON.stringify(data,null,2)+'\n');console.log('Collected40 original weighted pickup cases.');
