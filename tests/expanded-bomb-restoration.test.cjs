'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),esbuild=require('esbuild');
function load(name){const file=path.resolve(__dirname,'../src/'+name+'.ts');const code=esbuild.buildSync({entryPoints:[file],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;const m=new Module(file,module);m.paths=module.paths;m._compile(code,file);return m.exports;}
const one=load('authority/bomb-core'),two=load('expanded/bomb2'),{AuthorityEngine}=load('authority/engine');
const input=(seq=0,extra={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...extra});
const step2=(s,n=1,i=input())=>{for(let k=0;k<n;k++)two.step(s,[i,input(),input(),input()]);};
function arena2(mode='collect'){const s=two.create(1,true,[1,2],12,'mine-one',mode);s.board.fill(0);s.tiles.fill(0);s.items.fill(0);s.players.forEach(p=>p.invulnerable=0);return s;}
test('Bomb It blast advances exactly one cell per original frame and expires the complete cross together',()=>{
  const s=one.createGame(42);s.board.fill(0);s.players.forEach(p=>{p.invulnerable=0;p.x=0;p.y=0;});s.bombs=[{id:1,x:5,y:5,range:3,owner:1,explodeAt:1}];
  one.step(s,[]);assert(s.flames[one.index(5,5)]>1);assert.equal(s.flames[one.index(6,5)],0);
  for(let distance=1;distance<=3;distance++){one.step(s,[]);assert.equal(s.blasts[0].distance,distance);assert.equal(s.flames[one.index(5+distance,5)],14);if(distance<3)assert.equal(s.flames[one.index(6+distance,5)],0);}
  while(s.tick<14)one.step(s,[]);assert.equal(s.blasts.length,0);assert(s.flames[one.index(5,5)]<=s.tick);
});
test('Bomb It rays stop after the first crate, trigger a downstream chain on arrival, and retain owner attribution',()=>{
  const s=one.createGame(12);s.board.fill(0);s.players.forEach(p=>{p.x=0;p.y=0;p.invulnerable=0;});
  s.board[one.index(5,4)]=2;s.board[one.index(5,3)]=2;s.bombs=[{id:1,x:5,y:5,range:3,owner:1,explodeAt:1},{id:2,x:7,y:5,range:1,owner:2,explodeAt:100}];
  one.step(s,[]);one.step(s,[]);assert.equal(s.board[one.index(5,4)],0);assert.equal(s.board[one.index(5,3)],2);assert.equal(s.bombs.length,1);
  one.step(s,[]);assert.equal(s.bombs.length,0);one.step(s,[]);assert.equal(s.flameOwners[one.index(8,5)],2);assert.equal(s.board[one.index(5,3)],2);
});
test('Bomb It normal drop weights retain a shuffled two-weapon pool per round',()=>{
  let drops=0;for(let seed=1;seed<=400;seed++){
    const s=one.createGame(seed);s.board.fill(0);s.players.forEach(p=>{p.x=0;p.y=0;});assert.equal(new Set(s.dropWeapons).size,2);
    s.board[one.index(6,5)]=2;s.bombs=[{id:1,x:5,y:5,range:1,owner:1,explodeAt:1}];one.step(s,[]);one.step(s,[]);
    const item=s.items[one.index(6,5)];if(one.WEAPONS.includes(item)){assert(s.dropWeapons.includes(item));drops++;}
  }assert(drops>20);
});
test('native spawn protection and easy shields remain independent of life stock',()=>{
  const s=one.createGame(2,1,true,{difficulty:'easy'});assert(s.players.filter(p=>p.alive).every(p=>p.shield&&p.invulnerable>=60&&p.invulnerable<=63));
  const t=two.create(1,true,[1,2],2,'mine-one','arcade',{difficulty:'easy'});assert(t.players.every(p=>p.shield&&p.invulnerable===two.RESPAWN_PROTECTION_TICKS));assert(two.valid(t));
  s.board.fill(0);Object.assign(s.players[0],{x:3,y:3,capacity:8,life:5});s.items[one.index(4,3)]='bomb';s.items[one.index(5,3)]='life';
  for(let n=0;n<12;n++)one.step(s,[{...one.EMPTY_INPUT,seq:n+1,dir:2}]);assert.equal(s.players[0].capacity,9);assert.equal(s.players[0].life,6);assert(one.validState(s));
});
test('Bomb It 2 coin death drops half the acquired coins, preserves remaining score and revives naturally',()=>{
  const s=arena2(),p=s.players[0];p.x=5;p.y=4;p.points=9;s.scores[0]=9;s.flames[two.index(p.x,p.y)]=2;s.owners[two.index(p.x,p.y)]=2;
  step2(s);assert.equal(p.points,5);assert.equal(s.scores[0],5);assert.equal(s.items.filter(v=>v===9).length,4);assert.equal(p.respawnAt,s.tick+64);assert.equal(p.deaths,1);
  step2(s,64);assert.equal(p.respawnAt,0);assert.equal(p.points,5);assert(two.valid(s));
});
test('Bomb It 2 death clears only the defeated player territory; springs and quicksand cannot be painted',()=>{
  const s=arena2('color'),p=s.players[0];s.colors[50]=1;s.colors[51]=2;s.flames[two.index(p.x,p.y)]=2;s.owners[two.index(p.x,p.y)]=2;
  step2(s);assert(!s.colors.includes(1));assert.equal(s.colors[51],2);assert.equal(p.points,0);
  const t=two.create(1,true,[1,2],3,'disce-one','color');t.board.fill(0);const spring=t.hazards.find(h=>h.kind==='SpringBoard');Object.assign(t.players[0],{x:spring.x,y:spring.y});step2(t);assert.equal(t.colors[two.index(spring.x,spring.y)],0);
});
test('Bomb It 2 vehicles last until hit, preserve separate shields, and frogs can cross one obstacle',()=>{
  const s=arena2('arcade'),p=s.players[0];p.vehicle=13;p.shield=true;step2(s,601);assert.equal(p.vehicle,13);
  s.flames[two.index(p.x,p.y)]=s.tick+3;s.owners[two.index(p.x,p.y)]=2;step2(s);assert.equal(p.vehicle,0);assert(p.shield);assert.equal(p.deaths,0);assert(p.invulnerable>0);
  const t=arena2('arcade'),q=t.players[0];q.vehicle=14;q.x=3;q.y=3;t.board[two.index(4,3)]=1;step2(t,1,input(1,{right:true}));assert.equal(q.x,5);assert.equal(q.y,3);assert(two.valid(t));
});
test('Bomb It 2 original property weights, vehicle choices and full five-frame crate palette are restored',()=>{
  const weights=a=>a.reduce((r,n)=>(r[n]=(r[n]||0)+1,r),{});assert.equal(weights(two.PROP_POOLS.arcade)[2],24);assert.equal(weights(two.PROP_POOLS.arcade)[1],24);assert.equal(weights(two.PROP_POOLS.arcade)[3],12);assert(!two.PROP_POOLS.collect.includes(4));
  const frames=new Set();for(let seed=1;seed<100;seed++){const s=two.create(1,true,[1,2],seed,'mine-one','arcade');s.board.forEach((v,i)=>{if(v===2)frames.add(s.tiles[i]);});assert.equal(new Set(s.vehiclePool).size,2);assert(!s.vehiclePool.includes(11));}
  for(let frame=1;frame<=5;frame++)assert(frames.has(frame));
  assert.deepEqual(two.create(1,true,[1,2],12,'disce-one','collect').vehiclePool.slice().sort(),[12,13]);
});
test('normal Bomb It 2 pickups appear after the original eleven-frame destruction, not at impact',()=>{
  let seen=0;for(let seed=1;seed<=50;seed++){
    const s=two.create(1,true,[1,2],seed,'mine-one','arcade');s.board.fill(0);s.tiles.fill(0);s.board[two.index(5,5)]=2;s.bombs=[{id:s.nextId++,x:5,y:4,owner:1,range:1,kind:'normal',explodeAt:1,armedAt:0,slide:-1}];
    step2(s);assert.equal(s.board[two.index(5,5)],0);assert.equal(s.items[two.index(5,5)],0);assert.equal(s.crateBursts[0].at,12);step2(s,10);assert.equal(s.items[two.index(5,5)],0);step2(s);if(s.items[two.index(5,5)])seen++;assert.equal(s.crateBursts.length,0);
  }assert(seen>10);
});
test('character changes are seat-owned, unique, source-bound and cannot alter a live round',()=>{
  for(const gameId of ['3881-server','9109-server']){
    const e=new AuthorityEngine(()=>{}),room={gameId,seats:{1:'a',2:'b',3:null,4:null},controllerId:'a',members:new Map([['a',{id:'a',seat:1,ready:false,ws:null}],['b',{id:'b',seat:2,ready:false,ws:null}]])};
    e.onRoom(room);assert(e.character(room,room.members.get('b'),3));assert.equal(room.auth.state.players.find(p=>p.seat===2).character,3);assert(!e.character(room,room.members.get('a'),3));assert(!e.character(room,{id:'x',seat:null},4));assert(!e.character(room,{id:'x',seat:1},4));
    const options=room.auth.options;assert(!e.options(room,room.members.get('a'),{difficulty:['normal']}));assert.equal(room.auth.options,options);
    if(gameId==='9109-server')assert.equal(two.territoryColor(room.auth.state,2),'#ff9900');
    room.members.forEach(m=>m.ready=true);e.onRoom(room);assert.equal(room.auth.state.phase,'playing');assert.equal(room.auth.state.players.find(p=>p.seat===2).character,3);assert(!e.character(room,room.members.get('a'),4));
  }
});
test('original audio files and directional flame assets match their retained source manifest',()=>{
  const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'public/authority/assets/bomb1-restoration.json')));assert.equal(manifest.assets.length,23);
  for(const a of manifest.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,a.path))).digest('hex'),a.sha256);
  assert(two.adapter.setSound&&two.adapter.confirm&&two.adapter.setVolume);
});

test('confirmed native audio starts after interaction, deduplicates replay and restores volume without replaying muted events',()=>{
  const {NativeAudio,emitSound}=load('authority/native-audio'),old={Audio:global.Audio,window:global.window,document:global.document};
  const hooks={},plays=[],instances=[];
  global.window={addEventListener:(name,fn)=>hooks[name]=fn};global.document={hidden:false,addEventListener:(name,fn)=>hooks[name]=fn};
  global.Audio=class{constructor(src){this.src=src;this.paused=true;this.volume=1;instances.push(this);}play(){this.paused=false;plays.push(this.src);return Promise.resolve();}pause(){this.paused=true;}};
  try{
    const a=new NativeAudio({menu:'menu.mp3',music1:'music.mp3',place:'place.mp3',explode:'explode.mp3'}),s={round:1,phase:'waiting',soundId:0,sounds:[],musicTrack:1};
    a.confirm(s);assert.equal(plays.length,0);hooks.pointerdown();assert.deepEqual(plays,['menu.mp3']);s.phase='playing';a.confirm(s);assert(plays.includes('music.mp3'));
    emitSound(s,'place');a.confirm(s);a.confirm(structuredClone(s));assert.equal(plays.filter(n=>n==='place.mp3').length,1);
    a.setSound(false);assert(instances.every(i=>i.paused));emitSound(s,'explode');a.confirm(s);a.setSound(true);assert(!plays.includes('explode.mp3'));
    a.setVolume(.4);assert(instances.filter(i=>!i.paused).every(i=>Math.abs(i.volume-.18)<1e-9));a.setVolume(0);assert(instances.every(i=>i.paused));
    a.setVolume(.4);global.document.hidden=true;hooks.visibilitychange();assert(instances.every(i=>i.paused));
    const late=new NativeAudio({menu:'menu.mp3',place:'place.mp3'});const before=plays.filter(n=>n==='place.mp3').length;late.confirm({...s,round:2});hooks.keydown();late.confirm({...s,round:2});assert.equal(plays.filter(n=>n==='place.mp3').length,before);
  }finally{for(const [key,value]of Object.entries(old)){if(value===undefined)delete global[key];else global[key]=value;}}
});
