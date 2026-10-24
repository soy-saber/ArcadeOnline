'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),Module=require('node:module'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
function load(name){const file=path.resolve(__dirname,'../src/'+name+'.ts'),m=new Module(file,module);m.paths=module.paths;m._compile(esbuild.buildSync({entryPoints:[file],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,file);return m.exports;}
const core=load('expanded/bomb2'),ride=load('expanded/bomb2-vehicles'),{relocate}=load('expanded/bomb2-movement'),ART=require('../src/expanded/bomb2-vehicle-art.json');
const {bomb2Weapon,bomb2Status}=load('expanded/bomb2-status'),{nameAnchors}=load('authority/nameplates');
const neutral=(seq=0,extra={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...extra});
function world(map='mine-one'){const s=core.create(1,true,[1,2],31,map,'arcade');s.board.fill(0);s.tiles.fill(0);s.items.fill(0);s.players.forEach(p=>p.invulnerable=0);relocate(s.players[0],7,7);relocate(s.players[1],14,12);return s;}
function tick(s,input=neutral()){core.step(s,[input,neutral()]);}
function pickup(s,kind){const p=s.players[0];s.items[core.index(p.x,p.y)]=kind;tick(s);}
function wreck(s){const p=s.players[0];s.flames[core.index(p.x,p.y)]=s.tick+3;s.owners[core.index(p.x,p.y)]=2;tick(s);assert.equal(p.rideMotion.kind,'wreck');}
test('48 complete source vehicle clips retain original pixels, direction registration, walking/jump loops and death labels',()=>{
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');assert.equal(hash(fs.readFileSync(path.resolve(__dirname,'../games/9109/game.swf'))),ART.sha256);assert.equal(Object.keys(ART.timelines).length,48);
 for(const [name,m]of Object.entries(ART.timelines)){const b=fs.readFileSync(path.resolve(__dirname,'..',m.path));assert.equal(hash(b),m.sha256);assert.equal(b.readUInt32BE(16),m.w*m.frames);assert.equal(b.readUInt32BE(20),m.h);assert.equal(m.bounds.length,m.frames);assert(m.labels.dead>0);assert(m.frames>=m.labels.dead+19);const exceptional=name==='vehicle-3-frog-right';assert.deepEqual(m.loopEnds,name.includes('-frog-')?[18,exceptional?39:37]:[30]);assert.equal(m.labels.dead,name.includes('-frog-')?exceptional?40:38:31);}
 assert.deepEqual(ART.rules,{frogJumpStart:19,frogVelocity:1.5,carVelocity:2.2,bulldozerPauseLimit:10,bulldozerVelocity:1});
});
test('frog jumps are continuous in all four directions, use source terminal speed and stop without a fabricated cooldown',()=>{
 for(const [dir,dx,dy,key]of [[0,-1,0,'left'],[1,0,-1,'up'],[2,1,0,'right'],[3,0,1,'down']]){
  const s=world(),p=s.players[0];pickup(s,14);s.board[core.index(7+dx,7+dy)]=1;tick(s,neutral(1,{[key]:true}));assert.equal(p.rideMotion.kind,'frog');assert.equal(p.rideAnim.frame,18);const begin={...p.walking};assert.equal(p.x,7);assert.equal(p.y,7);
  tick(s);assert.equal(p.walking.x,begin.x+dx*3.75);assert.equal(p.walking.y,begin.y+dy*3.75);
  for(let n=0;n<35&&p.rideMotion;n++){tick(s);assert(core.valid(s));}assert.equal(p.x,7+dx*2);assert.equal(p.y,7+dy*2);assert.equal(p.walking.vx,0);assert.equal(p.walking.vy,0);assert.equal(p.rideAnim.frame,0);assert.equal(p.teleportUntil,0);
 }
});
test('frog aligns sideways pixels and uses ice terminal speed while rejecting blocked landing cells, including mines',()=>{
 const s=world('snow-one'),p=s.players[0],ice=s.hazards.find(h=>h.kind==='IceFace');relocate(p,ice.x,ice.y);pickup(s,14);p.walking.y+=8;p.walking.vx=1;p.walking.vy=0;
 assert(ride.startFrogJump(s,p,ice.x+1,ice.y));assert(Math.abs(p.rideMotion.stepX-7.5)<1e-9);assert.equal(p.rideMotion.stepY,-1);
 for(let n=0;n<20&&p.rideMotion;n++)tick(s);assert.equal(p.walking.x,(ice.x+2)*30);assert(Math.abs(p.walking.y-ice.y*30)<=1);assert(core.valid(s));
 for(const block of ['fixed','crate','mine','remote','normal']){const t=world(),q=t.players[0];pickup(t,14);q.walking.vx=1;
  if(block==='fixed'||block==='crate')t.board[core.index(9,7)]=block==='fixed'?1:2;else t.bombs.push({id:t.nextId++,owner:2,x:9,y:7,range:1,kind:block,explodeAt:500,armedAt:500,slide:-1});
  assert.equal(ride.startFrogJump(t,q,8,7),false);assert.equal(q.rideMotion,null);
 }
});
test('frog keeps original airborne pickup behavior, consumes actions and remains vulnerable',()=>{
 const s=world(),p=s.players[0];pickup(s,14);s.board[core.index(8,7)]=1;s.items[core.index(9,7)]=2;tick(s,neutral(1,{right:true}));
 let sawAirPickup=false;for(let n=1;n<30&&p.rideMotion?.kind==='frog';n++){tick(s,neutral(n+1,{attack:n,alt:n,left:true}));if(p.range===2&&p.rideMotion?.kind==='frog')sawAirPickup=true;assert.equal(p.dir,2);assert.equal(s.bombs.length,0);}
 assert(sawAirPickup);assert(p.lastAttack>0);assert.equal(p.vehicle,14);
 const t=world(),q=t.players[0];pickup(t,14);t.board[core.index(8,7)]=1;t.flames[core.index(8,7)]=100;t.owners[core.index(8,7)]=2;tick(t,neutral(1,{right:true}));for(let n=0;n<20&&q.rideMotion?.kind==='frog';n++)tick(t);assert.equal(q.rideMotion.kind,'wreck');assert.equal(q.deaths,0);assert(core.valid(t));
});
test('every character and direction completes the original vehicle destruction before returning to the robot',()=>{
 for(let character=1;character<=4;character++)for(const vehicle of [12,13,14])for(let dir=0;dir<4;dir++){
  const s=world(),p=s.players[0];s.players[1].character=character%4+1;p.character=character;p.dir=dir;pickup(s,vehicle);wreck(s);const meta=ride.rideMeta(p),born=s.tick,length=meta.frames-meta.labels.dead+1;assert.equal(p.rideAnim.frame,meta.labels.dead-1);
  for(let age=1;age<length;age++){tick(s,neutral(age,{right:true,attack:age}));assert.equal(p.vehicle,vehicle);assert.equal(p.dir,dir);assert.equal(p.rideAnim.frame,meta.labels.dead-1+age);assert.equal(s.bombs.length,0);assert(core.valid(s));}
  tick(s,neutral(length,{right:true,attack:length}));assert.equal(s.tick-born,length);assert.equal(p.vehicle,0);assert.equal(p.rideMotion,null);assert.equal(p.deaths,0);assert.equal(p.lastAttack,length);assert.equal(s.sounds.filter(e=>e.name==='shield').length,0);assert(core.valid(s));
 }
});
test('mounting suspends the held weapon and its remaining ammo; the latest vehicle pickup is restored after destruction',()=>{
 const s=world(),p=s.players[0];pickup(s,19);tick(s,neutral(1,{attack:1}));for(let n=0;n<9;n++)tick(s,neutral(n+2,{attack:1}));assert.equal(p.ammo,1);pickup(s,13);assert.equal(p.weapon,0);assert.deepEqual(p.pendingWeapon,{kind:19,ammo:1,record:false});assert.deepEqual(p.weaponStock,[19]);
 tick(s,neutral(20,{attack:2}));assert.equal(s.bombs.length,1);assert.equal(s.bombs[0].kind,'normal');assert.equal(p.pendingWeapon.ammo,1);
 pickup(s,20);assert.equal(p.weapon,0);assert.equal(p.ammo,0);assert.deepEqual(p.pendingWeapon,{kind:20,ammo:2,record:true});pickup(s,12);assert.equal(p.pendingWeapon.kind,20);wreck(s);
 for(let n=0;n<30&&p.rideMotion;n++)tick(s);assert.equal(p.weapon,20);assert.equal(p.ammo,2);assert.equal(p.pendingWeapon,null);assert.deepEqual(p.weaponStock,[19,20]);assert(core.valid(s));
 const t=world(),q=t.players[0];pickup(t,19);pickup(t,14);wreck(t);for(let n=0;n<30&&q.rideMotion;n++)tick(t);assert.equal(q.weapon,19);assert.equal(q.ammo,2);assert.deepEqual(q.weaponStock,[19]);
});
test('destruction keeps shield stock and velocity, conveys the frozen vehicle, and returns with residual inertia',()=>{
 const s=world('factory-two'),p=s.players[0],h=s.hazards.find(h=>h.kind==='Transmittal'&&h.dir===2);relocate(p,h.x,h.y);pickup(s,13);p.shield=true;p.walking.vx=2;wreck(s);const x=p.walking.x,vx=p.walking.vx;assert(p.shield);
 tick(s,neutral(20,{attack:20,right:true}));assert.equal(p.walking.vx,vx);assert.equal(p.walking.x,x+1);assert(p.shield);assert.equal(p.deaths,0);
 const t=world(),q=t.players[0];pickup(t,13);q.walking.vx=2;wreck(t);const bodyX=q.walking.x,speed=q.walking.vx;for(let n=0;n<19;n++)tick(t);assert.equal(q.walking.x,bodyX);tick(t);assert.equal(q.walking.x,bodyX+speed*.6);assert(core.valid(t));
});
test('car/bulldozer loops stop in their current pose, frog finishes its hop cycle, and sand freezes the vehicle at frame one',()=>{
 for(const vehicle of [12,13,14]){const s=world(),p=s.players[0];pickup(s,vehicle);for(let n=0;n<6;n++)tick(s,neutral(n+1,{right:true}));const frame=p.rideAnim.frame;assert(frame>0);tick(s);
  if(vehicle!==14){assert.equal(p.rideAnim.frame,frame);for(let n=0;n<4;n++)tick(s);assert.equal(p.rideAnim.frame,frame);}else{for(let n=0;n<20;n++)tick(s);assert.equal(p.rideAnim.frame,0);assert.equal(p.rideAnim.playing,false);}assert(core.valid(s));
 }
 const s=world('beach-one'),p=s.players[0];pickup(s,13);const sand=s.hazards.find(h=>h.kind==='QuickSand');relocate(p,sand.x,sand.y);tick(s);assert.equal(p.travel.kind,'sand');assert.equal(p.rideAnim.frame,0);assert.equal(p.rideAnim.playing,false);assert(core.valid(s));
});
test('bulldozer crush waits for the original twelve-count release, preserves momentum and consumes commands',()=>{
 const s=world(),p=s.players[0];pickup(s,12);s.board[core.index(8,7)]=2;tick(s,neutral(1,{right:true}));assert.equal(s.board[core.index(8,7)],0);assert.equal(p.rideMotion.kind,'crush');assert.equal(s.crateBursts.length,1);const born=s.tick,x=p.walking.x,vx=p.walking.vx;assert.equal(vx,.6);
 for(let n=1;n<12;n++){tick(s,neutral(n+1,{right:true,attack:n,alt:n}));assert.equal(p.rideMotion.kind,'crush');assert.equal(p.walking.x,x);assert.equal(p.walking.vx,vx);assert.equal(s.bombs.length,0);assert(core.valid(s));}
 tick(s,neutral(13,{right:true,attack:12,alt:12}));assert.equal(s.tick-born,12);assert.equal(p.rideMotion,null);assert.equal(p.walking.x,x+vx*.6);assert.equal(p.lastAttack,12);assert.equal(p.lastAlt,12);assert(core.valid(s));
});
test('frog and bulldozer also respond to a collision during native residual coasting',()=>{
 for(const vehicle of [12,14]){const s=world(),p=s.players[0];pickup(s,vehicle);p.walking.vx=2;s.board[core.index(8,7)]=vehicle===12?2:1;tick(s);assert.equal(p.rideMotion.kind,vehicle===12?'crush':'frog');assert(core.valid(s));}
});
test('mid-flight and destruction snapshots recover deterministically and reject malformed vehicle state',()=>{
 const s=world(),p=s.players[0];pickup(s,14);s.board[core.index(8,7)]=1;tick(s,neutral(1,{right:true}));const copy=structuredClone(s);for(let n=0;n<25;n++){tick(s);tick(copy);}assert.deepEqual(copy,s);
 wreck(s);const damaged=structuredClone(s);for(let n=0;n<24;n++){tick(s);tick(damaged);}assert.deepEqual(damaged,s);
 for(const mutate of [x=>x.players[0].rideMotion={},x=>x.players[0].rideAnim={vehicle:13,dir:9,frame:Infinity},x=>x.players[0].pendingWeapon={kind:22,ammo:1,record:false},x=>x.players[0].rideMotion={kind:'frog',born:0,dir:2,targetX:18,targetY:7,stepX:Infinity,stepY:0}]){const broken=structuredClone(s);mutate(broken);assert.equal(core.valid(broken),false);}
});
test('head and panel counts suspend mounted weapons together and names avoid the original airborne rider head',()=>{
 const s=world(),p=s.players[0];pickup(s,19);pickup(s,14);assert.equal(bomb2Weapon(s,p),null);assert.equal(bomb2Status(s)[0].weapon,null);s.board[core.index(8,7)]=1;tick(s,neutral(1,{right:true}));for(let n=0;n<6;n++)tick(s);
 const sprite=ride.rideSprite(p),head=66+p.walking.y+sprite.meta.y+sprite.meta.bounds[sprite.frame][1];assert.equal(nameAnchors(s,754,550)[0].y,head-16);
 wreck(s);for(let n=0;n<25&&p.rideMotion;n++)tick(s);assert.equal(bomb2Weapon(s,p).value,'×2');assert.deepEqual(bomb2Status(s)[0].weapon,bomb2Weapon(s,p));
});
