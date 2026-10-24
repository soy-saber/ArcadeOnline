'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),Module=require('module'),path=require('path');
function load(name,dir='expanded'){const file=path.resolve(__dirname,'../src/'+dir+'/'+name+'.ts'),m=new Module(file,module);m.paths=module.paths;m._compile(esbuild.buildSync({entryPoints:[file],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,file);return m.exports;}
const core=load('bomb2'),blasts=load('bomb2-blasts'),{relocate}=load('bomb2-movement'),{clearProtection}=load('bomb2-protection'),protocol=load('protocol','authority');
const input=(extra={})=>({seq:0,left:false,right:false,up:false,down:false,attack:0,alt:0,...extra});
function world(mode='kill'){const s=core.create(1,true,[1,2,3,4],123,'beach-one',mode);s.board.fill(0);s.tiles.fill(0);s.items.fill(0);for(const p of s.players){clearProtection(p);relocate(p,p.seat*2,12);}return s;}
function tick(s,extra={}){core.step(s,[input(extra),input(),input(),input()]);}
function until(s,at){while(s.tick<at)tick(s);}
function bomb(s,x,y,owner=1,due=s.tick+1,kind='normal',range=1){const b={id:s.nextId++,owner,x,y,kind,range,explodeAt:due,armedAt:core.ROUND_TICKS+20,slide:-1,born:s.tick};s.bombs.push(b);return b;}
function overlap(){const s=world();bomb(s,5,6,1);tick(s);bomb(s,6,5,2,7);until(s,7);assert.equal(s.blasts.length,2);return s;}

test('an older explosion clears the shared boolean fire while the newer native flame continues to render',()=>{
 const s=overlap(),cell=core.index(6,6),[old,recent]=s.blasts;assert.equal(s.flames[cell],23);assert.equal(s.owners[cell],1);assert(old.fires.includes(cell));assert(recent.fires.includes(cell));
 until(s,16);assert(s.flames[cell]>s.tick);tick(s);assert.equal(s.tick,17);assert.equal(s.flames[cell],0);assert.equal(s.owners[cell],0);assert.deepEqual(s.blasts.map(b=>b.id),[recent.id]);assert.equal(recent.until,24);assert.equal(recent.delay,1);
 assert.equal(s.flames[core.index(6,4)],24,'the older group clears only its own cells; the shifted newer callback misses one tick');
 const p=s.players[0];relocate(p,6,6);tick(s);assert.equal(p.deaths,0,'a later visible segment is not an implicit new fire registration');assert(core.valid(s));
 until(s,24);assert.equal(s.blasts.length,0);assert.equal(s.flames[core.index(6,4)],0);
});

test('a third ignition restores a cleared overlap, and the second expiry can clear it again',()=>{
 const s=overlap(),cell=core.index(6,6);until(s,17);bomb(s,7,6,3,19);until(s,19);assert.equal(s.flames[cell],35);assert.equal(s.owners[cell],3);until(s,24);assert.equal(s.flames[cell],0);assert(s.blasts.some(b=>b.owner===3));assert(core.valid(s));
});

test('bomb callbacks run before expiry callbacks on the same tick; ending centres still stop a new ray',()=>{
 const s=world();bomb(s,5,6,1);tick(s);bomb(s,6,5,2,17);until(s,17);assert.equal(s.flames[core.index(6,6)],0,'the old deleFire happens after the new setFire on this tick');assert(s.blasts.some(b=>b.owner===2));
 const t=world();bomb(t,5,5,1);tick(t);bomb(t,6,5,2,17,'normal',3);until(t,17);const newer=t.blasts.find(b=>b.owner===2);assert(!newer.tiles.some(p=>p.x===5&&p.y===5));assert(!newer.tiles.some(p=>p.x===4&&p.y===5));assert(core.valid(t));
});

test('ending bomb centres block pre-cleanup placement and kicked-flight callbacks but release before actor movement',()=>{
 const s=world('arcade'),p=s.players[0];bomb(s,5,5,2);tick(s);until(s,16);relocate(p,5,5);tick(s,{attack:1});assert.equal(s.bombs.length,0,'input cannot place through the old registered centre before its ended callback');assert.equal(p.deaths,0);tick(s,{attack:2});assert.equal(s.bombs.length,1,'a new input after cleanup can place it normally');
 const t=world();bomb(t,5,5,1);tick(t);until(t,16);const moving=bomb(t,6,5,2,100);moving.slide=0;tick(t);assert.equal(moving.walking.x,180);assert.equal(moving.slide,-1,'the original centre is still a collision obstacle in the bomb phase');assert.equal(t.blasts.length,0);assert(core.valid(t));
});

test('mine diagonals record their own fire cells, including fixed corners, and participate in unconditional cleanup',()=>{
 const s=world();s.board[core.index(6,6)]=1;bomb(s,5,5,1,1,'mine',2);tick(s);const old=s.blasts[0];assert(old.fires.includes(core.index(6,6)));assert(!old.tiles.some(t=>t.x===6&&t.y===6));assert.equal(s.board[core.index(6,6)],1);
 bomb(s,7,6,2,7);until(s,7);assert(s.flames[core.index(6,5)]>s.tick);until(s,17);assert.equal(s.flames[core.index(6,5)],0);assert.equal(s.flames[core.index(6,6)],0);assert(core.valid(s));
});

test('snapshot deltas preserve the original cleanup footprint after an overlap has already been cleared',()=>{
 const s=overlap(),baseline=structuredClone(s);until(s,17);const wire=JSON.parse(JSON.stringify(protocol.createUpdate(baseline,s,500))),recovered=protocol.applyUpdate(baseline,wire);assert.deepEqual(recovered,s);assert.equal(recovered.flames[core.index(6,6)],0);assert(recovered.blasts[0].fires.includes(core.index(6,6)));
 until(s,25);until(recovered,25);assert.deepEqual(recovered,s);
 for(const mutate of [b=>delete b.fires,b=>b.fires.push(b.fires[0]),b=>b.fires.pop(),b=>b.fires[0]=255,b=>b.fires[0]=NaN,b=>b.fires=[1,2,3,4,5],b=>b.delay=-1,b=>b.delay=64,b=>b.delay=1.5]){const bad=structuredClone(baseline);mutate(bad.blasts[0]);assert(!core.valid(bad));}
});

test('sixteen simultaneous expiry callbacks retain live-array enumeration order instead of deleting every group together',()=>{
 const s=world();for(const y of [1,4,7,10])for(const x of [1,4,7,10])bomb(s,x,y,1);tick(s);assert.equal(s.blasts.length,16);const groups=s.blasts.map(b=>b.id),ended=new Map();
 for(let time=2;time<=21;time++){const before=s.blasts.map(b=>b.id);tick(s);for(const id of before)if(!s.blasts.some(b=>b.id===id))ended.set(id,s.tick);assert(core.valid(s));}
 assert.deepEqual(groups.map(id=>ended.get(id)),[17,18,17,19,17,18,17,20,17,18,17,19,17,18,17,21]);assert.equal(s.blasts.length,0);
});

test('a bomb standing in or coasting into residual fire retains its own fuse; only a new blast event chains it',()=>{
 const s=world();bomb(s,5,5,1);tick(s);const late=bomb(s,6,5,2,100);tick(s);assert(s.bombs.includes(late));assert.equal(late.explodeAt,100);assert.equal(s.blasts.length,1);
 until(s,5);bomb(s,7,5,3,6);tick(s);assert(!s.bombs.includes(late));assert.equal(s.blasts.filter(b=>b.owner===2).length,1);
 const t=world();bomb(t,5,5,1);tick(t);const moving=bomb(t,7,5,2,100),remaining=moving.explodeAt-t.tick;moving.slide=0;until(t,5);assert(t.bombs.includes(moving));assert.equal(moving.explodeAt-t.tick,remaining,'native flight pauses rather than consumes its fuse');assert(core.valid(t));
});

test('bomb creation scores a vulnerable shield or vehicle without fabricating a room death; immunity is still excluded',()=>{
 for(const defense of ['shield','vehicle','immune']){
  const s=world(),p=s.players[0],q=s.players[1];relocate(q,6,6);if(defense==='shield')q.shield=true;if(defense==='vehicle'){s.items[core.index(q.x,q.y)]=13;tick(s);}if(defense==='immune')q.invulnerable=20;
  bomb(s,5,6,1);tick(s);assert.equal(p.points,defense==='immune'?0:1);assert.equal(p.kills,0);assert.equal(q.deaths,0);
  if(defense==='shield')assert.equal(q.shield,false);if(defense==='vehicle')assert.equal(q.rideMotion.kind,'wreck');assert.equal(s.scores[0],p.points);
 }
});

test('props take priority over bomb score checks and entering residual fire does not retroactively award native points',()=>{
 const s=world(),p=s.players[0],q=s.players[1];bomb(s,5,6,1);tick(s);relocate(q,6,6);tick(s);assert.equal(q.deaths,1);assert.equal(p.points,0);assert.equal(p.kills,1,'the multiplayer record still records the actual attributed death');
 const t=world(),a=t.players[0],b=t.players[1];relocate(b,6,6);t.items[core.index(6,6)]=9;bomb(t,5,6,1);tick(t);assert.equal(b.deaths,1);assert.equal(a.points,0);assert.equal(t.items[core.index(6,6)],0);assert.equal(b.points,0,'bomb phase destroys the prop before the robot pickup engine');
});

test('fresh fire precedes walking and pickup engines, while a surviving shield robot can still move after the hit',()=>{
 const s=world('arcade'),p=s.players[0];relocate(p,6,6);p.walking.x=194;p.walking.vx=3.5;s.items[core.index(6,6)]=22;bomb(s,5,6,2);tick(s,{right:true});assert.equal(p.deaths,1);assert(!p.shield,'a ground shield cannot be picked before the blast destroys it');
 const t=world('arcade'),q=t.players[0];relocate(q,6,6);q.walking.x=194;q.walking.vx=3.5;q.shield=true;bomb(t,5,6,2);tick(t,{right:true});assert.equal(q.deaths,0);assert(!q.shield);assert(q.walking.x>194,'separate physical movement still runs after shield damage');assert(core.valid(t));
});

test('two new overlapping blasts score their creation-time targets independently before one actual fire death',()=>{
 const s=world(),a=s.players[0],b=s.players[1],q=s.players[2];relocate(q,6,6);bomb(s,5,6,1);bomb(s,6,5,2);tick(s);assert.equal(a.points,1);assert.equal(b.points,1);assert.equal(q.deaths,1);assert.equal(a.kills+b.kills,1);
});

test('short-range native weapons score shield contact; the invincibility prop alone requires a real death for its mode point',()=>{
 const s=world(),p=s.players[0],q=s.players[1];relocate(p,5,6);relocate(q,6,6);p.dir=2;q.shield=true;tick(s,{attack:1});until(s,26);assert.equal(p.points,1);assert.equal(p.kills,0);assert.equal(q.deaths,0);assert(!q.shield);
 const t=world(),a=t.players[0],b=t.players[1];t.items[core.index(a.x,a.y)]=7;tick(t);until(t,31);relocate(b,a.x,a.y);b.shield=true;tick(t);assert.equal(a.points,0);assert.equal(a.kills,0);assert.equal(b.deaths,0);assert(!b.shield);
});
