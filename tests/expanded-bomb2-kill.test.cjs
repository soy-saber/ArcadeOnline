"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const code=require('esbuild').buildSync({entryPoints:[path.resolve(__dirname,file)],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;const m=new Module(file,module);m.paths=module.paths;m._compile(code,file);return m.exports;}
const core=load('../src/expanded/bomb2.ts'),a=core.adapter,{AuthorityEngine}=load('../src/authority/engine.ts'),protocol=load('../src/authority/protocol.ts');
const input=(seq=0,attack=0,extra={})=>({seq,left:false,right:false,up:false,down:false,attack,alt:0,...extra});
function arena(){const s=a.create(1,true,[1,2,3,4],123,'mine-one','kill');s.board.fill(0);s.tiles.fill(0);s.hazards=[];s.players.forEach(p=>p.invulnerable=0);s.players[0].x=3;s.players[0].y=3;s.players[1].x=10;s.players[1].y=3;return s;}
function tick(s,control=input()){a.step(s,[control,input(),input(),input()]);}
function wait(s,n,control=input()){for(let i=0;i<n;i++)tick(s,control);}
function pickup(s,kind){const p=s.players[0];p.x=3;p.y=3;p.moveDir=-1;p.progress=0;s.items[core.index(4,3)]=kind;wait(s,9,input(1,0,{right:true}));assert.equal(p.x,4);assert.equal(p.weapon,kind);}
test('all four modes combine with all eighteen original maps, with deterministic valid deltas',()=>{
  assert.equal(a.modes.length,4);assert.equal(a.maps.length,18);
  for(const mode of a.modes)for(const map of a.maps){
    const s=a.create(1,true,[1,2,3,4],123,map.id,mode.id),base=structuredClone(s);assert.equal(s.mode,mode.id);assert.equal(s.mapId,map.id);assert(a.valid(s));
    for(let n=0;n<90;n++)a.step(s,[input(n,Math.floor(n/30),{right:n%20<10}),input(),input(),input()]);
    assert(a.valid(s),`${mode.id}/${map.id}`);assert.deepEqual(protocol.applyUpdate(base,protocol.createUpdate(base,s,1000)),s);
  }
});
test('mode and map changes are controller-only, validated atomically, and retained across rematches',()=>{
  const engine=new AuthorityEngine(()=>{}),room={gameId:a.id,seats:{1:'a',2:'b',3:null,4:null},members:new Map([['a',{id:'a',seat:1,ready:false,ws:null}],['b',{id:'b',seat:2,ready:false,ws:null}]])};engine.onRoom(room);
  const [owner,guest]=[room.members.get('a'),room.members.get('b')];
  assert(!engine.options(room,guest,{map:'snow-three',gameMode:'kill'}));
  assert(engine.options(room,owner,{map:'snow-three',gameMode:'kill'}));assert.equal(room.auth.state.mode,'kill');assert.equal(room.auth.state.mapId,'snow-three');
  const round=room.auth.state.round;
  for(const patch of [{map:'missing',gameMode:'kill'},{map:'snow-one',gameMode:'missing'},{map:'snow-one',gameMode:{}},{map:'kill:mine-one',gameMode:'kill'}]){assert(!engine.options(room,owner,patch));assert.equal(room.auth.state.round,round);}
  assert(engine.options(room,owner,{gameMode:'collect'}));assert.equal(room.auth.state.mapId,'snow-three');assert(engine.options(room,owner,{gameMode:'kill'}));
  owner.ready=guest.ready=true;engine.onRoom(room);assert.equal(room.auth.state.phase,'playing');assert(!engine.options(room,owner,{map:'beach-two',gameMode:'kill'}));
  room.auth.state.tick=core.ROUND_TICKS-1;engine.pump(room,room.auth.clock+26);assert.equal(room.auth.state.phase,'finished');engine.pump(room,room.auth.nextRoundAt+1);assert.equal(room.auth.state.mode,'kill');assert.equal(room.auth.state.mapId,'snow-three');
});
test('base hammer repeats without ammunition, hits at animation end, breaks crates and earns kills',()=>{
  const s=arena(),p=s.players[0],q=s.players[1];assert.equal(p.weapon,0);q.x=4;q.y=3;
  tick(s,input(1,1,{right:true}));assert.equal(s.bombs.length,0);assert.equal(p.actionLock,25);assert.equal(p.x,3);wait(s,24,input(2,1));assert.equal(q.deaths,0);
  tick(s,input(3,2));assert.equal(q.deaths,1);assert.equal(q.life,3);assert.equal(p.points,1);assert.equal(p.kills,1);assert.equal(p.weapon,0);assert.equal(p.ammo,0);assert.equal(p.lastAttack,2);
  s.board[core.index(4,3)]=2;tick(s,input(4,3));wait(s,25,input(5,3));assert.equal(s.board[core.index(4,3)],0);assert.equal(s.bombs.length,0);
});
test('kill pickup pool preserves original weights and excludes vehicles and bomb upgrades',()=>{
  assert.deepEqual(core.KILL_PROPS,[16,16,21,21,21,20,20,20,19,19,19,17,17,18,18,7]);
  const seen=new Set();for(let seed=1;seed<=100;seed++){const s=a.create(1,true,[1,2],seed,'mine-one','kill');s.board.fill(0);s.hazards=[];s.players[0].x=3;s.players[0].y=3;
    for(let n=0;n<3;n++){s.board[core.index(4,3)]=2;tick(s,input(n*30+1,n+1,{right:true}));wait(s,36,input(n*30+2,n+1));if(s.items[core.index(4,3)]){seen.add(s.items[core.index(4,3)]);assert(core.KILL_PROPS.includes(s.items[core.index(4,3)]));}s.items.fill(0);}
  }assert(seen.size>=5);
});
test('pickup ammunition matches original, finished weapons recover the infinite base hammer',()=>{
  for(const [kind,uses] of Object.entries(core.WEAPON_USES)){const s=arena();pickup(s,Number(kind));const p=s.players[0];assert.equal(p.ammo,uses);p.moveDir=-1;p.progress=0;p.invulnerable=400;
    if(Number(kind)===17)continue;
    for(let n=0;n<uses;n++) {p.x=4;p.y=4+n;p.dir=2;tick(s,input(10+n,n+1));wait(s,30,input(20+n,n+1));}
    assert.equal(p.weapon,0,kind);assert.equal(p.ammo,0,kind);assert.equal(core.weaponLabel(s,p),'基础锤子 · 无限使用');
  }
});
test('remote placement is consumed only on success; attack detonates it after ammunition reaches zero',()=>{
  const s=arena();pickup(s,17);const p=s.players[0];p.moveDir=-1;p.progress=0;s.bombs.push({id:s.nextId++,x:p.x,y:p.y,owner:2,range:1,kind:'normal',explodeAt:600,armedAt:0,slide:-1});tick(s,input(3,1));assert.equal(p.ammo,1);assert.equal(p.actionLock,0);
  s.bombs=[];tick(s,input(4,2));assert.equal(p.ammo,0);assert.equal(p.weapon,0);assert.equal(s.bombs[0].kind,'remote');assert.match(core.weaponLabel(s,p),/引爆/);wait(s,8,input(5,2));tick(s,input(6,3));assert.equal(s.bombs.length,0);assert(s.flames.some(until=>until>s.tick));
});
test('flamethrower grows up to three cells, stops at fixed walls, and does not create a thrown bomb',()=>{
  const s=arena();pickup(s,21);const p=s.players[0],q=s.players[1];p.moveDir=-1;p.progress=0;p.dir=2;q.x=6;q.y=3;s.board[core.index(7,3)]=1;s.board[core.index(5,3)]=2;
  tick(s,input(2,1));assert.equal(s.bombs.length,0);assert.equal(p.actionLock,24);wait(s,10,input(3,1));assert.equal(q.deaths,1);assert.equal(p.points,1);assert.equal(s.board[core.index(5,3)],0);assert(s.effects[0].cells.every(cell=>cell%17<7));assert.equal(p.frozen,undefined);
});
test('laser warmup, fixed-wall shielding, direct scoring and immunity prevent repeated kills',()=>{
  const s=arena();pickup(s,20);const p=s.players[0],q=s.players[1];p.moveDir=-1;p.progress=0;p.dir=2;q.x=8;q.y=3;
  tick(s,input(3,1));wait(s,11,input(4,1));assert.equal(q.deaths,0);tick(s,input(5,1));assert.equal(q.deaths,1);assert.equal(p.points,1);wait(s,12,input(6,1));assert.equal(q.deaths,1);
  const blocked=arena();pickup(blocked,20);blocked.players[0].moveDir=-1;blocked.players[0].progress=0;blocked.players[0].dir=2;blocked.board[core.index(6,3)]=1;blocked.players[1].x=8;tick(blocked,input(3,1));wait(blocked,25,input(4,1));assert.equal(blocked.players[1].deaths,0);
});
test('death drops at most two restored pickups, resets inventory, keeps score and discards dead-period attacks',()=>{
  const s=arena(),p=s.players[0],q=s.players[1];p.weapon=19;p.ammo=1;p.weaponStock=[16,19,20];p.points=3;p.speed=4;p.range=5;p.capacity=5;s.flames[core.index(p.x,p.y)]=s.tick+2;s.owners[core.index(p.x,p.y)]=q.seat;
  tick(s);const until=p.respawnAt;assert.equal(until,s.tick+64);assert.equal(p.points,3);assert.equal(p.weapon,0);assert.equal(p.speed,8);assert.equal(p.range,1);assert.equal(p.capacity,1);assert.equal(s.items.filter(Boolean).length,2);assert.deepEqual(p.weaponStock,[]);
  while(s.tick<until)tick(s,input(20,8,{alt:9}));assert.equal(p.x,1);assert.equal(p.y,1);assert.equal(p.invulnerable,82);assert.equal(p.lastAttack,8);assert.equal(p.lastAlt,9);assert.equal(p.attack,null);assert.equal(q.points,0);assert.equal(q.kills,1,'room death attribution is separate from original creation-time mode points');
  s.flames[core.index(p.x,p.y)]=s.tick+10;tick(s,input(21,8));assert.equal(p.deaths,1);
});
test('ten real hammer kills settle the round once; suicide penalty cannot go below zero; timeout ranks ties',()=>{
  const s=arena(),p=s.players[0],q=s.players[1];p.dir=2;
  for(let n=1;n<=10;n++){q.x=4;q.y=3;q.invulnerable=0;q.respawnAt=0;tick(s,input(n*30,n));wait(s,25,input(n*30+1,n));assert.equal(p.points,n);}
  assert.equal(s.phase,'finished');assert.equal(s.winner,1);const final=structuredClone(s);wait(s,200);assert.deepEqual(s,final);
  for(const points of [0,1]){const t=arena(),r=t.players[0];r.points=points;t.bombs.push({id:t.nextId++,owner:1,x:r.x,y:r.y,range:1,kind:'normal',explodeAt:1,armedAt:0,slide:-1});tick(t);assert.equal(r.points,0);assert.equal(r.kills,0);assert.equal(r.deaths,1);}
  for(const tie of [false,true]){const t=arena();t.tick=core.ROUND_TICKS-1;t.players[0].points=5;t.players[1].points=tie?5:4;tick(t);assert.equal(t.winner,tie?null:1);}
});
test('mine waits until its owner leaves, then senses all players and includes diagonal blast cells',()=>{
  const s=arena(),p=s.players[0],q=s.players[1];p.weapon=18;p.ammo=1;
  tick(s,input(1,1));wait(s,40,input(2,1));assert.equal(p.deaths,0);assert.equal(s.bombs.length,1);
  wait(s,9,input(3,1,{left:true}));assert.equal(p.x,2);assert(s.bombs[0].armedAt<=s.tick);
  p.x=1;q.x=3;q.y=3;s.players[2].x=4;s.players[2].y=4;s.board[core.index(2,2)]=2;
  tick(s,input(4,1));assert.equal(s.bombs.length,0);assert.equal(q.deaths,1);assert.equal(s.players[2].deaths,1);assert.equal(p.points,1,'source scores centre, then the owner penalty on its left arm, then the diagonal target');assert.equal(s.board[core.index(2,2)],0);assert(s.flames[core.index(4,4)]>s.tick);
});
test('laser stops at first destructible obstruction for its whole lifetime',()=>{
  for(const bomb of [false,true]){const s=arena();pickup(s,20);const p=s.players[0],q=s.players[1];p.moveDir=-1;p.progress=0;p.dir=2;q.x=9;
    if(bomb)s.bombs.push({id:s.nextId++,owner:2,x:6,y:3,range:1,kind:'normal',explodeAt:1000,armedAt:0,slide:-1});else s.board[core.index(6,3)]=2;
    tick(s,input(3,1));wait(s,12,input(4,1));assert.equal(s.effects[0].cells.at(-1),core.index(6,3));wait(s,10,input(5,1));assert.equal(q.deaths,0);assert.equal(s.board[core.index(6,3)],0);
  }
});
test('engine runs ten real attacks with natural respawns, counts totals once and automatically continues same mode and map',()=>{
  const engine=new AuthorityEngine(()=>{}),room={gameId:a.id,seats:{1:'a',2:'b',3:'c',4:'d'},members:new Map(['a','b','c','d'].map((id,i)=>[id,{id,name:id,seat:i+1,ready:false,ws:null}]))};
  engine.onRoom(room);assert(engine.options(room,room.members.get('a'),{map:'beach-two',gameMode:'kill'}));room.members.forEach(p=>p.ready=true);engine.onRoom(room);
  const s=room.auth.state,round=s.round;s.board.fill(0);s.tiles.fill(0);
  let now=room.auth.clock;const pump=(n)=>{for(let t=0;t<n;t++)engine.pump(room,now+=25);};pump(82);
  for(let n=1;n<=10;n++){
    const p=s.players[0],q=s.players[1];assert.equal(q.respawnAt,0);assert.equal(q.invulnerable,0);p.x=3;p.y=3;p.dir=2;q.x=4;q.y=3;
    engine.input(room,room.members.get('a'),{round,serverTime:now,input:input(n,n)},now);pump(26);assert.equal(p.points,n);assert.equal(q.deaths,n);
    if(n<10){pump(146);assert.equal(q.respawnAt,0);assert.equal(q.invulnerable,0);}
  }
  assert.equal(s.phase,'finished');assert.equal(s.winner,1);let records=engine.info(room).records;
  assert.deepEqual(records.find(r=>r.id==='a'),{id:'a',name:'a',kills:10,deaths:0,wins:1,rounds:1});assert.equal(records.find(r=>r.id==='b').deaths,10);
  pump(10);assert.equal(engine.info(room).records.find(r=>r.id==='a').rounds,1);
  engine.pump(room,room.auth.nextRoundAt+1);assert.equal(room.auth.state.phase,'playing');assert(room.auth.state.round>round);assert.equal(room.auth.state.mode,'kill');assert.equal(room.auth.state.mapId,'beach-two');assert(room.members.get('b').ready);
  assert.equal(engine.info(room).records.find(r=>r.id==='a').kills,10);assert.equal(room.auth.state.players[0].points,0);assert(a.valid(room.auth.state));
});
