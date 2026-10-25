'use strict';
const assert=require('node:assert/strict');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async({a,b,room,fixture,kills})=>{
 async function focus(){await a.bringToFront();await a.evaluate(()=>document.querySelector('#game-canvas').focus());}
 async function select(index){await focus();const before=await a.evaluate(()=>window.__authorityTest.authority.players[0].lastAlt);await a.keyboard.press(index===0?'Digit1':'Digit2');await a.waitForFunction((index,before)=>{const p=window.__authorityTest.authority.players[0];return p.weapon===index&&p.lastAlt>before;},{},index,before);}
 for(let n=1;n<=kills;n++){
  // A native entrance reserves a cell. Several overlapping newborns cannot be
  // treated as four stationary targets: let each real entrant initialize.
  await fixture(room,'boxhead-target');await a.waitForFunction(()=>{const s=window.__authorityTest.authority;return s.zombies.length===1&&s.zombies[0].ai.collidable;});
  if(n<=4){
   await select(0);
   for(let shot=0;shot<4;shot++){await a.waitForFunction(()=>window.__authorityTest.authority.players[0].cooldown===0);const before=await a.evaluate(()=>window.__authorityTest.authority.players[0].lastAttack);await focus();await a.keyboard.press('Space');await a.waitForFunction(before=>window.__authorityTest.authority.players[0].lastAttack>before,{},before);}
   await a.waitForFunction(n=>window.__authorityTest.authority.players[0].kills===n,{},n);
  }else{
   await select(1);await a.keyboard.down('Space');const deadline=Date.now()+10000;
   while(Date.now()<deadline){const p=await a.evaluate(()=>{const p=window.__authorityTest.authority.players[0];return {kills:p.kills,weapon:p.weapon,alive:p.alive};});assert(p.alive);if(p.kills>=n)break;if(p.weapon!==1)await select(1);await wait(60);}
   await a.keyboard.up('Space');await a.waitForFunction(n=>window.__authorityTest.authority.players[0].kills===n,{},n);
  }
  await b.waitForFunction(n=>{const s=window.__authorityTest.authority;return s.players[0].kills===n&&s.zombies.length===0;},{},n);
  assert(await b.evaluate(()=>window.__authorityTest.authority.players.every(p=>p.alive)));
  if(n%4===0)console.log('Natural kills: '+n);
 }
};
