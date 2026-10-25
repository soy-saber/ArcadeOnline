'use strict';
const assert=require('node:assert/strict');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async({a,b,room,fixture,kills,peakRequired})=>{
 const minimumPeak=peakRequired??(kills>=55?55:kills>=45?45:30);let total=0,peak=0;
 async function focus(){await a.bringToFront();await a.evaluate(()=>document.querySelector('#game-canvas').focus());}
 async function select(index){await focus();const before=await a.evaluate(()=>window.__authorityTest.authority.players[0].lastAlt);await a.keyboard.press(`Digit${index+1}`);await a.waitForFunction((index,before)=>{const p=window.__authorityTest.authority.players[0];return p.weapon===index&&p.lastAlt>before;},{},index,before);}
 while(total<kills||peak<minimumPeak){
  assert(total<200,'Earn required native combo through real kills before the bounded training limit');
  const pistol=await a.evaluate(()=>!window.__authorityTest.authority.players[0].unlocked[1]),autoPistol=pistol&&peak>=3,dense=minimumPeak>=70&&peak>=61;
  await fixture(room,pistol?'boxhead-target':dense?'boxhead-training-dense':'boxhead-training-horde');await a.waitForFunction(()=>window.__authorityTest.authority.zombies.some(z=>z.ai.collidable&&!z.body.deadFlag));
  const goal=total+(pistol?1:dense?5:3);
  if(pistol&&!autoPistol){
   await select(0);await a.waitForFunction(()=>window.__authorityTest.authority.players[0].poseAction==='handgun-stand');
   while((await a.evaluate(()=>window.__authorityTest.authority.players[0].kills))<goal){
    const target=await a.evaluate(()=>window.__authorityTest.authority.zombies.filter(z=>z.ai.collidable&&z.body.affectEnabled).sort((x,y)=>x.x-y.x)[0]?.id);
    if(target===undefined){await wait(50);continue;}
    const hp=await a.evaluate(id=>window.__authorityTest.authority.zombies.find(z=>z.id===id).hp,target);
    await a.waitForFunction(()=>window.__authorityTest.authority.players[0].cooldown===0);const before=await a.evaluate(()=>window.__authorityTest.authority.players[0].lastAttack);await focus();await a.keyboard.press('Space');await a.waitForFunction(before=>window.__authorityTest.authority.players[0].lastAttack>before,{},before);
    await a.waitForFunction((id,hp)=>window.__authorityTest.authority.zombies.find(z=>z.id===id)?.hp<hp,{},target,hp);
   }
  }else{
   const index=pistol?0:dense?2:1;await select(index);await a.waitForFunction(index=>window.__authorityTest.authority.players[0].poseAction===(index===2?'shotgun-stand':index?'uzi-stand':'handgun-stand'),{},index);await a.keyboard.down('Space');const deadline=Date.now()+12000;
   while(Date.now()<deadline){const p=await a.evaluate(()=>{const p=window.__authorityTest.authority.players[0];return {kills:p.kills,weapon:p.weapon,alive:p.alive};});assert(p.alive);if(p.kills>=goal)break;if(p.weapon!==index)await select(index);await wait(40);}
   await a.keyboard.up('Space');
  }
  await b.waitForFunction(goal=>{const s=window.__authorityTest.authority;return s.players[0].kills===goal&&s.zombies.every(z=>z.body.loggedKill);},{},goal);
  total=goal;peak=await b.evaluate(()=>window.__authorityTest.authority.peakCombo);assert(await b.evaluate(()=>window.__authorityTest.authority.players.every(p=>p.alive)));console.log(`Natural kills: ${total}; peak combo: ${peak}; tick: ${await b.evaluate(()=>window.__authorityTest.authority.tick)}`);
 }
};
