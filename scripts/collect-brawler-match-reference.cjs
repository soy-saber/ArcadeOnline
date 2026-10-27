'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{open}=require('./lib/brawler-native-player.cjs');
const root=path.resolve(__dirname,'..'),cache=path.join(root,'artifacts/brawler-native-reference');let player;
(async()=>{
 player=await open({fps:10});const deaths=[],ranks=[];
 for(const mode of ['stock','time'])for(const sender of ['none','self','other'])for(const lives of mode==='stock'?[1,5]:[-1])deaths.push(await player.call('referenceDeathStats',mode,sender,lives));
 for(const mode of ['stock','time'])for(const values of [[0,0],[0,0,0,0],[3,7,7,2],[7,3,7,7],[0,-1,2,-3]]){
  const players=values.map((value,i)=>mode==='time'?{KOs:Math.max(0,value),Deaths:Math.max(0,-value)}:{DeathOrd:i===values.length-1?undefined:i,KOs:0,Deaths:0});
  ranks.push({mode,input:players,numDead:players.length-1,result:await player.call('referenceStandings',mode,players,players.length-1)});
 }
 const weakOrders=[];
 for(let n=1;n<=4;n++){
  const seen=new Set();for(let number=0;number<n**n;number++){let rest=number;const raw=[];for(let i=0;i<n;i++){raw.push(rest%n);rest=Math.floor(rest/n);}const levels=[...new Set(raw)].sort((a,b)=>a-b),pattern=raw.map(v=>levels.indexOf(v)),key=pattern.join(',');if(seen.has(key))continue;seen.add(key);
   const players=pattern.map(value=>({KOs:value*31,Deaths:100}));weakOrders.push({pattern,input:players,numDead:0,result:await player.call('referenceStandings','time',players,0)});
  }
 }
 const source=fs.readFileSync(path.join(root,'artifacts/brawler-original/scripts/frame_101/DoAction.as'));
 fs.writeFileSync(path.join(root,'tests/fixtures/brawler-match-native.json'),JSON.stringify({input:JSON.parse(fs.readFileSync(path.join(cache,'inputs.json'))),rankingMethod:'Recovered frame101 source compiled unchanged inside an isolated function with Game/WinMC dependencies supplied; original AVM1 sortOn executes. Fighter.Die retains original SWF class bytes with external OSD/spawn/game-end dependencies observed.',rankingSourceSha256:crypto.createHash('sha256').update(source).digest('hex'),deaths,ranks,weakOrders,consoleLines:player.consoleLines},null,2)+'\n');console.log('Observed '+deaths.length+' original Fighter.Die cases, '+ranks.length+' original standings cases and '+weakOrders.length+' exhaustive weak-order patterns for up to four players.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>player?.close());
