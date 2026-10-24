const test=require('node:test');
const assert=require('node:assert/strict');
const esbuild=require('esbuild');
const path=require('node:path');
const fs=require('node:fs');
const file=path.join(__dirname,'../artifacts/expanded-tests/bomb2.cjs');
esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/expanded/bomb2.ts')],bundle:true,platform:'node',format:'cjs',outfile:file});
const core=require(file),a=core.adapter;
const input=(seq=0,attack=0,extra={})=>({seq,left:false,right:false,up:false,down:false,attack,alt:0,...extra});
function arena(mode='arcade'){const s=a.create(1,true,[1,2],5,mode+':mine-one');s.board.fill(0);s.tiles.fill(0);s.players.forEach(p=>p.invulnerable=0);return s;}
test('Bomb2 has distinct original 17x15 40 Hz, all eighteen layouts and original artwork',()=>{
 assert.equal(a.seats,4);assert.equal(a.hz,40);assert.equal(core.WIDTH,17);assert.equal(core.HEIGHT,15);assert.equal(a.maps.filter(m=>!m.id.includes(':')).length,18);
 for(const map of a.maps){const s=a.create(1,true,[1,2,3,4],42,map.id);assert.equal(a.valid(s),true,map.id);assert.equal(s.board.length,255);}
 const m=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/expanded/assets/bomb2/manifest.json')));assert.equal(m.rawSha256,'788c15ad1661e576cd004688785175ef62c2e0ef211db0fe83b5475625262ae1');assert.equal(m.maps,18);assert.ok(m.assets.length>3000);
});
test('same seed and complete input stream are deterministic with no unoccupied bots',()=>{
 const s=a.create(1,true,[1,4],21),t=structuredClone(s);assert.deepEqual(s.players.map(p=>p.seat),[1,4]);
 for(let i=1;i<1400;i++){const inputs=[input(i,Math.floor(i/12),{right:i%50<25,down:i%50>=25}),input(),input(),input(i,Math.floor(i/14),{left:i%50<25,up:i%50>=25})];a.step(s,inputs);a.step(t,inputs);assert.equal(a.valid(s),true);}
 assert.deepEqual(s,t);
});
test('attack and special counters are idempotent and expired input is consumed',()=>{
 const s=arena();s.players[0].capacity=8;a.step(s,[input(1,1),input()]);for(let i=2;i<12;i++)a.step(s,[input(i,1,{right:true}),input()]);assert.equal(s.bombs.length,1);
 a.consumeInput(s,1,input(20,9,{alt:7}));a.step(s,[input(21,9,{alt:7}),input()]);assert.equal(s.bombs.length,1);assert.equal(s.players[0].lastAlt,7);
});
test('cross flames stop at crates, chain bombs and give killer attribution',()=>{
 const s=arena();s.players[0].x=3;s.players[0].y=3;s.players[0].invulnerable=500;s.players[1].x=5;s.players[1].y=3;s.players[1].life=1;
 s.board[core.index(3,2)]=2;s.board[core.index(3,1)]=0;s.bombs=[{id:1,owner:1,x:3,y:3,range:3,kind:'normal',explodeAt:1,armedAt:0,slide:-1},{id:2,owner:1,x:4,y:3,range:2,kind:'normal',explodeAt:60,armedAt:0,slide:-1}];s.nextId=3;
 a.step(s,[input(),input()]);assert.equal(s.bombs.length,0);assert.equal(s.board[core.index(3,2)],0);assert.equal(s.flames[core.index(3,1)],0);assert.equal(s.players[1].alive,false);assert.equal(s.players[1].killedBy,1);assert.equal(s.winner,1);assert.equal(s.scores[0],1);
});
test('three lives, safe respawn and survival complete round',()=>{
 const s=arena();s.players[0].x=3;s.players[0].y=3;s.flames[core.index(3,3)]=20;s.owners[core.index(3,3)]=2;
 a.step(s,[input(),input()]);assert.equal(s.players[0].life,2);assert.equal(s.players[0].alive,true);assert.ok(s.players[0].respawnAt>s.tick);
 for(let i=0;i<core.RESPAWN_TICKS;i++)a.step(s,[input(),input()]);assert.equal(s.players[0].x,1);assert.equal(s.players[0].y,1);assert.ok(s.players[0].invulnerable>0);
 s.players[0].life=1;s.players[0].invulnerable=0;s.flames[core.index(1,1)]=s.tick+10;s.owners[core.index(1,1)]=2;a.step(s,[input(),input()]);assert.equal(s.phase,'finished');assert.equal(s.winner,2);assert.equal(a.valid(s),true);
});
test('powerups change authoritative capacity, range and remote bomb detonation',()=>{
 const s=arena();const p=s.players[0];s.items[core.index(2,1)]=2;for(let i=0;i<9;i++)a.step(s,[input(i,0,{right:true}),input()]);assert.equal(p.range,2);
 p.moveDir=-1;p.progress=0;p.weapon=17;p.ammo=1;a.step(s,[input(20,0,{alt:1}),input()]);assert.equal(s.bombs[0].kind,'remote');assert.equal(p.ammo,0);a.step(s,[input(21,0,{alt:1}),input()]);assert.equal(s.bombs.length,1);for(let n=0;n<8;n++)a.step(s,[input(22+n,0,{alt:1}),input()]);a.step(s,[input(31,0,{alt:2}),input()]);assert.equal(s.bombs.length,0);
});
test('kill, collect and color modes have full score targets',()=>{
 for(const mode of ['kill','collect','color']){const s=arena(mode),p=s.players[0];if(mode==='color'){for(let i=0;i<49;i++)s.colors[i+51]=1;}else p.points=9;
 if(mode==='collect'){s.items[core.index(2,1)]=9;for(let i=0;i<9;i++)a.step(s,[input(i,0,{right:true}),input()]);}
 else if(mode==='kill'){p.invulnerable=50;s.players[1].life=1;s.players[1].x=2;s.players[1].y=1;s.flames[core.index(2,1)]=20;s.owners[core.index(2,1)]=1;a.step(s,[input(),input()]);}
 else {p.x=10;p.y=10;a.step(s,[input(),input()]);}
 assert.equal(s.phase,'finished',mode);assert.equal(s.winner,1,mode);assert.equal(p.points,mode==='color'?50:10,mode);}
});
test('full timeout and hostile state validation',()=>{
 const s=arena();s.tick=core.ROUND_TICKS-1;a.step(s,[input(),input()]);assert.equal(s.phase,'finished');assert.equal(s.winner,null);assert.equal(a.valid(s),true);
 for(const change of [s=>s.players[0].x=NaN,s=>s.players[1].seat=1,s=>s.items=[],s=>s.hazards.push({kind:'bad'}),s=>s.ack[0]=-1]){const t=arena();change(t);assert.equal(a.valid(t),false);}
 const fresh=a.create(2,true,[1,2],55);assert.equal(fresh.tick,0);assert.equal(fresh.bombs.length,0);assert.ok(fresh.players.every(p=>p.life===3));
});
test('non-survival modes respawn indefinitely; kill mode penalizes suicide',()=>{
 const s=arena('kill'),p=s.players[0];p.points=2;p.life=1;s.flames[core.index(p.x,p.y)]=10;s.owners[core.index(p.x,p.y)]=p.seat;
 a.step(s,[input(),input()]);assert.equal(p.alive,true);assert.equal(p.life,1);assert.equal(p.points,1);assert.ok(p.respawnAt>s.tick);assert.equal(s.phase,'playing');
});
test('original beach quicksand pair, disco two-cell spring, and mine tram are active',()=>{
 const beach=a.create(1,true,[1,2],32,'beach-one');beach.board.fill(0);const h=beach.hazards.find(h=>h.kind==='QuickSand'),target=beach.hazards[h.target],p=beach.players[0];
 p.x=h.x-1;p.y=h.y;for(let i=0;i<9;i++)a.step(beach,[input(i,0,{right:true}),input()]);assert.equal(p.x,target.x);assert.equal(p.y,target.y);assert.ok(p.teleportUntil>beach.tick);
 const disco=a.create(1,true,[1,2],32,'disce-one');disco.board.fill(0);const spring=disco.hazards.find(h=>h.kind==='SpringBoard'),q=disco.players[0];q.x=spring.x-1;q.y=spring.y;
 for(let i=0;i<9;i++)a.step(disco,[input(i,0,{right:true}),input()]);assert.equal(q.x,spring.x+2);
 const mine=a.create(1,true,[1,2],32,'mine-one');assert.ok(mine.hazards.some(h=>h.kind==='Rail'));for(let i=0;i<30;i++)a.step(mine,[input(),input()]);assert.ok(mine.tram>.9);assert.equal(a.valid(mine),true);
});
