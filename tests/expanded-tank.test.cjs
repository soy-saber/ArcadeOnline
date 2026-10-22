const test=require('node:test');
const assert=require('node:assert/strict');
const esbuild=require('esbuild');
const path=require('node:path');
const fs=require('node:fs');
const file=path.join(__dirname,'../artifacts/expanded-tests/tank.cjs');
esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/expanded/tank.ts')],bundle:true,platform:'node',format:'cjs',outfile:file});
const core=require(file),a=core.adapter;
const input=(seq=0,attack=0,extra={})=>({seq,left:false,right:false,up:false,down:false,attack,alt:0,...extra});
function arena(){const s=a.create(1,true,[1,2],11,'compact');s.walls=s.walls.slice(0,4);s.players[0].x=70;s.players[0].y=100;s.players[0].angle=0;s.players[1].x=130;s.players[1].y=100;s.players[1].angle=Math.PI;return s;}
test('Tank has original three human capacity and source manifests',()=>{
 const s=a.create(1,true,[1,3],41);assert.deepEqual(s.players.map(p=>p.seat),[1,3]);assert.equal(a.seats,3);assert.equal(a.hz,25);assert.equal(a.valid(s),true);
 const m=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/expanded/assets/tank/manifest.json')));assert.equal(m.recoveredSha256,'beb18e24794449acf1b94d2edec1afc9f9de21e360376440ad45704e75df1c50');assert.ok(m.assets.length>200);
});
test('seeded maze and input replay are deterministic',()=>{
 const s=a.create(4,true,[1,2,3],99),t=structuredClone(s);
 for(let i=1;i<=1000;i++){const inputs=[input(i,Math.floor(i/15),{up:true,right:i%60<15}),input(i,Math.floor(i/25),{up:true,left:i%70<20}),input(i,Math.floor(i/20),{up:true,right:true})];a.step(s,inputs);a.step(t,inputs);assert.equal(a.valid(s),true);}
 assert.deepEqual(s,t);
});
test('counter retransmission places one bullet and expires without re-firing',()=>{
 const s=arena();s.players[1].y=170;a.step(s,[input(1,1),input()]);assert.equal(s.bullets.length,1);
 for(let i=0;i<260;i++)a.step(s,[input(i+2,1),input()]);assert.equal(s.players[0].lastAttack,1);assert.ok(s.bullets.length<=1);
 const t=arena();a.consumeInput(t,1,input(20,9,{alt:7}));a.step(t,[input(21,9,{alt:7}),input()]);assert.equal(t.bullets.length,0);
});
test('bullet kills, delayed complete round scores once and round reset is clean',()=>{
 const s=arena();a.step(s,[input(1,1),input()]);for(let i=0;i<200&&s.phase==='playing';i++)a.step(s,[input(i+2,1),input()]);
 assert.equal(s.players[1].alive,false);assert.equal(s.players[1].killedBy,1);assert.equal(s.players[0].kills,1);assert.equal(s.phase,'finished');assert.equal(s.winner,1);assert.equal(s.scores[0],1);
 for(let i=0;i<100;i++)a.step(s,[input(500,2),input()]);assert.equal(s.scores[0],1);const t=a.create(2,true,[1,2],33);assert.equal(t.tick,0);assert.equal(t.bullets.length,0);assert.ok(t.players.every(p=>p.alive));
});
test('wall collision reflects projectile and own reflected shots can kill',()=>{
 const s=arena();s.players[1].y=200;s.players[0].x=270;s.players[0].angle=0;a.step(s,[input(1,1),input()]);let bounced=false;for(let i=0;i<40;i++){a.step(s,[input(i+2,1),input()]);bounced ||= s.bullets.some(b=>b.bounces>0);}
 assert.equal(bounced,true);assert.equal(s.players[0].alive,false);assert.equal(s.players[0].killedBy,1);
});
test('every special weapon is server simulated, fragment is remotely detonated',()=>{
 for(const weapon of core.WEAPONS){const s=arena();s.players[0].weapon=weapon;a.step(s,[input(1,1),input()]);for(let i=0;i<60;i++)a.step(s,[input(i+2,1),input()]);assert.equal(a.valid(s),true,weapon);}
 const s=arena();s.players[1].y=200;s.players[0].weapon='frag';a.step(s,[input(1,1),input()]);a.step(s,[input(2,1,{alt:1}),input()]);assert.ok(s.bullets.some(b=>b.kind==='fragment'));assert.equal(s.players[0].weapon,'bullet');
});
test('time limit draws; state validation rejects malformed combat and seats',()=>{
 const s=arena();s.tick=core.ROUND_TICKS-1;a.step(s,[input(),input()]);assert.equal(s.phase,'finished');assert.equal(s.winner,null);assert.equal(a.valid(s),true);
 for(const change of [s=>s.players[0].x=NaN,s=>s.players[0].lastAttack=-1,s=>s.players[1].seat=1,s=>s.ack=[],s=>s.walls='bad']){const t=arena();change(t);assert.equal(a.valid(t),false);}
});
