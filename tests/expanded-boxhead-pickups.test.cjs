'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);return m.exports;}
const p=load('../src/expanded/boxhead-pickups.ts'),c=load('../src/expanded/boxhead-core.ts'),fixture=require('./fixtures/boxhead-pickup-as2.json');
const names=['pistol','uzi','shotgun','barrel','grenade','fakewall','mine','rocket','chargepack','railgun'];
test('all40 native RandomPickup outcomes match original enumeration, full/empty ammo weights, health branch, strict boundaries and one RNG draw',()=>{
 for(const [index,{input:i,output:o}]of fixture.cases.entries()){
  let draws=0;const active=names.map((_,n)=>n===0||i.active.includes(n)),choice=p.pickupChoice(active,i.ammo,i.total,i.hp,()=>{draws++;return i.random;});assert.equal(choice===null?'none':choice==='life'?'life':names[choice],o.choice,index+' choice');assert.equal(choice==='life'?200:i.hp,o.hp,index+' hp');assert.equal(choice!==null,o.result,index+' result');assert.equal(draws,o.draws,index+' draws');
 }
});
test('permanent map pickups hide then return after native decrement/Init callbacks at10/30seconds and selected speed',()=>{
 for(const mode of ['coop','deathmatch'])for(const speed of [.5,1,2]){
  const s=c.create(1,true,[1],42,'original-01',mode,{speed}),q=s.players[0];s.pickups=[{id:901,x:q.x,y:q.y,life:250,born:0,permanent:true,reappearAt:null}];s.tick=1;let sounds=0;p.stepPickups(s,()=>0,()=>sounds++);assert.equal(sounds,1);assert.equal(s.pickups.length,1);assert.equal(s.pickups[0].life,0);const when=1+25*speed*(mode==='deathmatch'?10:30)+2;assert.equal(s.pickups[0].reappearAt,when);assert(c.valid(s));
  q.x+=100;s.tick=when-1;p.stepPickups(s,()=>0,()=>sounds++);assert.equal(s.pickups[0].life,0);s.tick=when;p.stepPickups(s,()=>0,()=>sounds++);assert.equal(s.pickups[0].life,250);assert.equal(s.pickups[0].reappearAt,null);assert.equal(sounds,1);assert(c.valid(s));
 }
});
test('original pistol-only pickup is consumed without inventing healing; deathmatch pickups supply legitimately unlocked ammunition',()=>{
 const s=c.create(1,true,[1],42,'original-01'),q=s.players[0];q.hp=100;s.pickups=[{id:901,x:q.x,y:q.y,life:20,born:0}];s.tick=1;let calls=0;p.stepPickups(s,()=>{calls++;return .5;},()=>{});assert.equal(q.hp,100);assert.equal(s.pickups.length,0);assert.equal(calls,1);
 const d=c.create(2,true,[1],42,'original-01','deathmatch'),v=d.players[0];assert(v.unlocked.every(Boolean));assert.deepEqual(v.inventory,[-1,0,0,0,0,0,0,0,0,0]);assert(p.takePickup(d,v,()=>0));assert.equal(v.inventory[9],60);assert.equal(v.inventory.slice(1).filter(n=>n>0).length,1);assert.equal(v.weapon,0);assert(c.valid(d));
});
