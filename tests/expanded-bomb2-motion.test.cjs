'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),Module=require('node:module'),path=require('node:path');
function load(name){const file=path.resolve(__dirname,'../src/expanded/'+name+'.ts'),code=esbuild.buildSync({entryPoints:[file],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(file,module);m.paths=module.paths;m._compile(code,file);return m.exports;}
const motion=load('bomb2-motion'),walk=load('bomb2-walking');
const core=load('bomb2'),{relocate}=load('bomb2-movement'),neutral=(seq=0,extra={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...extra});
function world(walls=[]){const set=new Set(walls.map(p=>p.join(',')));return{moving:[],transSpeed:{x:0,y:0},passable:(x,y)=>x>=0&&x<17&&y>=0&&y<15&&!set.has(x+','+y),item:(x,y)=>({x:x*30,y:y*30,w:30,h:30,blocked:false})};}
test('all four original HitMove directions retain continuous coordinates and stop at adjacent walls',()=>{
  for(const [method,dx,dy,speed]of [['moveRight',1,0,5],['moveLeft',-1,0,-5],['moveUp',0,-1,-5],['moveDown',0,1,5]]){
    const a=walk.walkingAt(2,2),b=walk.walkingAt(2,2);motion[method](a,world(),speed);assert.equal(a.x,60+dx*5);assert.equal(a.y,60+dy*5);
    motion[method](b,world([[2+dx,2+dy]]),speed);assert.equal(b.x,60);assert.equal(b.y,60);assert.equal(b.blocked,true);
  }
});
test('native corner assistance aligns the body with an open channel before moving forward',()=>{
  const b=walk.walkingAt(2,2);b.y=61;const map=world([[3,3]]);motion.moveRight(b,map,5);assert.equal(b.x,60);assert.equal(b.y,60);motion.moveRight(b,map,5);assert.equal(b.x,65);
});
test('native ground and ice use acceleration 1.5 and resistance 0.6/0.8, with inertia after release',()=>{
  const ground=walk.walkingAt(2,2),ice=walk.walkingAt(2,2),map=world();
  walk.moveWalking(ground,map,2,1.5,.6);assert.equal(ground.vx,1.5);assert.equal(ground.x,61.5);walk.moveWalking(ground,map,2,1.5,.6);assert.equal(ground.vx,2.4);assert.equal(ground.x,63.9);
  for(let n=0;n<20;n++)walk.moveWalking(ice,map,2,1.5,.8);assert(Math.abs(ice.vx-7.5)<.1);
  const before=ground.x;walk.moveWalking(ground,map,-1,1.5,.6);assert(ground.x>before);assert(Math.abs(ground.vx-1.44)<1e-9);
  const vx=ice.vx;walk.moveWalking(ice,map,-1,1.5,.8);assert(Math.abs(ice.vx-vx*.8)<1e-9);
});
test('changing axis removes sideways momentum exactly as the source movement commands do',()=>{
  const b=walk.walkingAt(2,2),map=world();for(let n=0;n<5;n++)walk.moveWalking(b,map,2,1.5,.6);walk.moveWalking(b,map,1,1.5,.6);assert.equal(b.vx,0);assert.equal(b.vy,-1.5);
});
test('authority uses native continuous acceleration, key order and friction instead of fixed cell transitions',()=>{
  const s=core.create(1,true,[1,2],12,'mine-one'),p=s.players[0];s.board.fill(0);
  core.step(s,[neutral(1,{right:true}),neutral()]);assert.equal(p.walking.x,31.5);assert.equal(p.x,1);
  core.step(s,[neutral(2,{right:true}),neutral()]);assert(Math.abs(p.walking.x-33.9)<1e-9);
  core.step(s,[neutral(3,{right:true,up:true,direction:1}),neutral()]);assert.equal(p.walking.vx,0);assert.equal(p.walking.vy,-1.5);assert.equal(p.walking.y,28.5);
  core.step(s,[neutral(4),neutral()]);assert(Math.abs(p.walking.vy+.9)<1e-9);assert(core.valid(s));
});
test('source ice resistance and conveyor displacement affect the actual authority position',()=>{
  const s=core.create(1,true,[1,2],22,'snow-one'),p=s.players[0];s.board.fill(0);const ice=s.hazards.find(h=>h.kind==='IceFace');relocate(p,ice.x,ice.y);
  core.step(s,[neutral(1,{right:true}),neutral()]);core.step(s,[neutral(2,{right:true}),neutral()]);assert(Math.abs(p.walking.vx-2.7)<1e-9);assert(core.valid(s));
  const t=core.create(1,true,[1,2],22,'factory-one'),q=t.players[0];t.board.fill(0);const conveyor=t.hazards.find(h=>h.kind==='Transmittal');relocate(q,conveyor.x,conveyor.y);const before={x:q.walking.x,y:q.walking.y};core.step(t,[neutral(),neutral()]);assert.equal(Math.hypot(q.walking.x-before.x,q.walking.y-before.y),1);assert(core.valid(t));
});
test('standing on a new pickup collects it; mines do not form solid movement barriers',()=>{
  const s=core.create(1,true,[1,2],12,'mine-one'),p=s.players[0];s.board.fill(0);s.items[core.index(p.x,p.y)]=2;
  core.step(s,[neutral(),neutral()]);assert.equal(p.range,2);
  s.bombs.push({id:s.nextId++,owner:2,x:2,y:1,range:2,kind:'mine',explodeAt:core.ROUND_TICKS+62,armedAt:core.ROUND_TICKS+20,slide:-1});
  for(let n=0;n<10;n++)core.step(s,[neutral(n+1,{right:true}),neutral()]);assert(p.walking.x>45);assert(core.valid(s));
});
