'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{open}=require('./lib/brawler-native-player.cjs');
const root=path.resolve(__dirname,'..'),spec=require('../artifacts/brawler-native-reference/art-cases.json'),names=Object.keys(spec.fighters),cases=[];let player;
const add=(kind,input)=>cases.push({kind,input});
for(const character of names){
 for(const config of [
  {type:'punch',extra:'none'}, {type:'punch',extra:'none',actor:{xInc:4}}, {type:'punch',extra:'none',actor:{onGround:false,yInc:2}}, {type:'punch',extra:'none',actor:{onGround:false,yInc:-6}},
  {type:'punch',extra:'up'}, {type:'punch',extra:'up',actor:{xInc:4}}, {type:'punch',extra:'up',actor:{onGround:false}},
  {type:'special',extra:'none'}, {type:'special',extra:'none',actor:{onGround:false}}, {type:'special',extra:'up'}, {type:'special',extra:'up',actor:{SpecUpOk:false}},
  {type:'punch',extra:'none',actor:{CurrentAttack:'punchAir'}},{type:'punch',extra:'none',actor:{Shielded:true}},{type:'punch',extra:'none',actor:{HasControl:false}},
  {type:'punch',extra:'none',actor:{CtrlLoss:1}},{type:'punch',extra:'none',actor:{State:'thrown'}},{type:'punch',extra:'none',actor:{State:'ko',TimeKo:1001,DamageAmnt:100}},
 ])add('attack',{character,...config});
 for(const attack of ['punchGround','punchRun','punchAir','punchUp','specialGround','specialAir','specialUp','specialBackThrow','koAttack']){
  const total=spec.fighters[character].poses[attack].frames;
  for(const frame of [...new Set([1,5,6,7,9,10,11,14,15,total].filter(f=>f<=total))]){
   for(const facing of [1,-1])add('secondary',{character,attack,frame,actor:{_xscale:facing*100},withTarget:false});
   if(attack==='specialUp'||attack==='specialBackThrow')add('secondary',{character,attack,frame,withTarget:true});
  }
  for(const target of [{},{_x:90},{_x:79},{_x:200},{_x:150},{_x:330},{_y:40},{Invincible:true},{State:'ko'},{State:'thrown'}])for(const frame of [...new Set([1,9,total].filter(f=>f<=total))])add('contact',{character,attack,frame,target});
 }
}
for(const targetCharacter of names)for(const character of names)for(const [amount,power,angle]of [[5,3,45],[10,6,-80],[20,4,85]])for(const target of [{},{DamageAmnt:33,Combo:5},{DamageAmnt:998,Combo:9},{Shielded:true,ShieldSize:100},{Shielded:true,ShieldSize:0},{State:'ko'},{State:'spawn'},{Dying:true},{Invincible:true}])add('damageThrow',{character,targetCharacter,amount,power,angle,target});
for(const force of [false,true])for(const noSender of [false,true])for(const target of [{State:'ko'},{State:'spawn'},{Shielded:true,ShieldSize:50},{Shielded:true,ShieldSize:50,dodge:{}},{Invincible:true}])add('damageThrow',{character:names[0],amount:10,power:6,angle:-45,target,force,noSender,priorSender:noSender});
for(const x of [1.01,1.025,1.04,1.049,1.05,-1.01,-1.025,-1.04,-1.049,-1.05])add('quantize',{character:names[0],x,y:-x});
(async()=>{player=await open();for(let i=0;i<cases.length;i++){cases[i].result=await player.call('referenceRule',cases[i].kind,cases[i].input);if((i+1)%500===0)console.log('Observed '+(i+1)+'/'+cases.length+' native rule cases.');}const input=JSON.parse(fs.readFileSync(path.join(root,'artifacts/brawler-native-reference/inputs.json'))),record={input,ruffle:require('../libs/ruffle/package.json').version,kind:'Original unmodified AVM1 classes instantiated as native MovieClips; controlled function fixtures, external world/HUD/audio/launch observers. No full original world, AI or normal gameplay claim.',cases};fs.writeFileSync(path.join(root,'tests/fixtures/brawler-native-rules.json'),JSON.stringify(record,null,2)+'\n');console.log('Captured '+cases.length+' original attack/contact/secondary/damage/throw/quantization cases.');})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>player?.close());
