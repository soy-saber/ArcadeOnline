'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),Module=require('node:module'),path=require('node:path');
function load(name){const file=path.resolve(__dirname,'../src/expanded/'+name+'.ts'),code=esbuild.buildSync({entryPoints:[file],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(file,module);m.paths=module.paths;m._compile(code,file);return m.exports;}
const core=load('bomb2'),{relocate}=load('bomb2-movement'),{conveyorDirection,conveyorFrame}=load('bomb2-conveyor'),{MAPS}=load('bomb2-maps');
const neutral=(seq=0,extra={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...extra});
function world(map='mine-one'){const s=core.create(1,true,[1,2],123,map);s.board.fill(0);s.tiles.fill(0);s.items.fill(0);return s;}
function bomb(s,x,y,kind='normal',slide=-1){const b={id:s.nextId++,owner:2,x,y,range:1,kind,explodeAt:core.FUSE,armedAt:core.ROUND_TICKS+20,slide};s.bombs.push(b);return b;}

test('all 104 authored factory conveyor turn sequences survive map import and cycle every 8 seconds',()=>{
  assert.deepEqual(MAPS.filter(m=>m.hazards.some(h=>h.turns)).map(m=>[m.id,m.hazards.filter(h=>h.turns).length]),[['factory-two',32],['factory-one',32],['factory-three',40]]);
  for(const map of MAPS)for(const h of map.hazards.filter(h=>h.kind==='Transmittal')){
    const turns=h.turns||[h.dir];assert.equal(turns[0],h.dir);
    for(let n=0;n<turns.length*2;n++){
      assert.equal(conveyorFrame(h,n*320),turns[n%turns.length]);
      assert.equal(conveyorFrame(h,n*320+319),turns[n%turns.length]);
    }
  }
});

test('authority applies the rotated conveyor direction to a stationary player on the 320th tick',()=>{
  const s=world('factory-two'),h=s.hazards.find(h=>h.kind==='Transmittal'&&h.x===3&&h.y===4),p=s.players[0];
  assert.deepEqual(h.turns,[2,4]);s.tick=318;relocate(p,h.x,h.y);
  core.step(s,[neutral(),neutral()]);assert.equal(p.walking.x,91);assert.equal(p.walking.y,120);
  assert.equal(p.walking.transX,1);assert.equal(p.walking.transY,0);
  core.step(s,[neutral(),neutral()]);assert.equal(p.walking.x,91);assert.equal(p.walking.y,121);assert(core.valid(s));
  assert.equal(p.walking.transX,0);assert.equal(p.walking.transY,1);
  assert.equal(conveyorDirection(h,s.tick),3);
});

test('original landform engine still conveys a player while weapon input is locked',()=>{
  const s=world('factory-two'),p=s.players[0];relocate(p,4,4);p.weapon=17;p.ammo=1;
  core.step(s,[neutral(1,{attack:1,right:true}),neutral()]);assert(p.actionLock>0);assert.equal(p.walking.x,121);
  core.step(s,[neutral(2,{right:true}),neutral()]);assert.equal(p.walking.x,122);assert.equal(p.walking.vx,0);assert(core.valid(s));
});

test('normal, remote and mine bombs ride the same native conveyor one pixel per tick',()=>{
  for(const kind of ['normal','remote','mine']){
    const s=world('factory-two'),b=bomb(s,4,4,kind);if(kind!=='normal')b.explodeAt=core.ROUND_TICKS+core.FUSE;
    for(let n=0;n<16;n++)core.step(s,[neutral(),neutral()]);
    assert.equal(b.walking.x,136);assert.equal(b.walking.y,120);assert.equal(b.x,5);assert.equal(b.y,4);assert(core.valid(s));
    assert.equal(b.walking.transX,0);assert.equal(b.walking.transY,0,'bombTrans does not set the robot-only conveyor compensation');
    if(kind==='normal')assert.equal(b.explodeAt,core.FUSE,'conveyors do not pause the ordinary fuse');
    const copy=structuredClone(s);for(let n=0;n<5;n++){core.step(s,[]);core.step(copy,[]);}assert.deepEqual(copy,s);
  }
});

test('an actual kick uses seven pixel motion, removes its grid barrier and pauses the fuse until collision',()=>{
  const s=world(),p=s.players[0];p.kick=true;s.board[core.index(5,1)]=1;const b=bomb(s,2,1);
  core.step(s,[neutral(1,{right:true}),neutral()]);
  assert.equal(b.walking.x,60,'kick happens in movement after this frame of bomb callbacks');assert.equal(b.slide,2);assert.equal(b.x,2);assert.equal(b.explodeAt,core.FUSE);
  const q=s.players[1];q.kick=true;relocate(q,2,2);
  core.step(s,[neutral(2,{right:true}),neutral(2,{up:true})]);assert(p.walking.x>30,'kicked bomb no longer forms a stationary grid barrier');
  assert.equal(b.walking.x,67,'flight starts on the next bomb callback');
  assert.equal(b.slide,2,'a second player cannot kick an already moving bomb in another direction');assert.equal(b.walking.y,30);
  const remaining=b.explodeAt-s.tick;
  for(let n=0;n<20&&b.slide>=0;n++){core.step(s,[neutral(),neutral()]);assert.equal(b.explodeAt-s.tick,remaining);assert(core.valid(s));}
  assert.equal(b.slide,-1);assert.equal(b.walking.x,120);assert.equal(b.x,4);
  core.step(s,[]);assert.equal(b.explodeAt-s.tick,remaining-1);
  while(s.tick<b.explodeAt&&s.phase==='playing')core.step(s,[]);
  assert.equal(s.bombs.length,0);assert(s.flames[core.index(4,1)]>s.tick);assert(core.valid(s));
});

test('kicked bombs stop against another registered bomb and do not expire or chain from crossed fire while in flight',()=>{
  const s=world(),a=bomb(s,2,4,'normal',2),b=bomb(s,5,4,'remote');b.explodeAt=core.ROUND_TICKS+core.FUSE;
  a.explodeAt=1;s.flames[core.index(3,4)]=100;s.owners[core.index(3,4)]=1;
  for(let n=0;n<12;n++){core.step(s,[]);if(a.slide<0)break;assert(s.bombs.includes(a));}
  assert.equal(a.slide,-1);assert.equal(a.walking.x,120);assert.equal(a.x,4);assert(s.bombs.includes(b));
});

test('snapshot validator rejects nonfinite or mismatched continuous bomb positions',()=>{
  const s=world('factory-one'),b=bomb(s,4,3);core.step(s,[]);assert(core.valid(s));
  const copy=structuredClone(s);copy.bombs[0].walking.x=NaN;assert.equal(core.valid(copy),false);
  b.walking.gridX++;assert.equal(core.valid(s),false);
});

test('original remote bombs retain their 800-count timeout and may be manually detonated during a kick',()=>{
  const s=world(),p=s.players[0];p.weapon=17;p.ammo=1;
  core.step(s,[neutral(1,{attack:1}),neutral()]);const b=s.bombs[0];assert.equal(b.kind,'remote');assert.equal(b.explodeAt,s.tick+802);
  relocate(p,10,10);while(s.tick<b.explodeAt-1)core.step(s,[]);assert(s.bombs.includes(b));assert(core.valid(s));
  core.step(s,[]);assert.equal(s.bombs.length,0);assert(s.flames[core.index(1,1)]>s.tick);
  const t=world(),remote=bomb(t,3,4,'remote',2);remote.owner=1;remote.explodeAt=802;
  core.step(t,[]);assert.equal(remote.walking.x,97);assert.equal(remote.explodeAt,803);
  core.step(t,[neutral(1,{attack:1}),neutral()]);assert.equal(t.bombs.length,0);assert(t.flames[core.index(3,4)]>t.tick);assert(core.valid(t));
});

test('all three original bomb timelines retain 27 frames, native dimensions, registration and verified bytes',()=>{
  const fs=require('node:fs'),crypto=require('node:crypto'),art=require('../src/expanded/bomb2-bomb-art.json');
  assert.equal(art.sha256,'788c15ad1661e576cd004688785175ef62c2e0ef211db0fe83b5475625262ae1');
  assert.deepEqual(Object.values(art.timelines).map(m=>[m.symbol,m.frames,m.w,m.h,m.x,m.y]),[[2936,27,34,46,-3,-12.25],[2995,27,34,45,-3,-11.8],[2977,27,28,21,.95,5.75]]);
  for(const m of Object.values(art.timelines)){const bytes=fs.readFileSync(path.resolve(__dirname,'..',m.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),m.sha256);assert.equal(bytes.readUInt32BE(16),m.w*27);assert.equal(bytes.readUInt32BE(20),m.h);}
});
