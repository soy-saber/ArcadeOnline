'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),fs=require('node:fs'),crypto=require('node:crypto');
function load(file){const name=path.resolve(__dirname,file),source=require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(name,module);m.paths=module.paths;m._compile(source,name);return m.exports;}
const a=load('../src/expanded/boxhead.ts').adapter,world=load('../src/expanded/boxhead-world.ts'),pose=load('../src/expanded/boxhead-player-pose.ts'),placement=load('../src/expanded/boxhead-placement.ts'),protocol=load('../src/authority/protocol.ts');
const positions=require('../src/expanded/boxhead-gun-positions.json');
const input=(seq,patch={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...patch});
const close=(actual,expected)=>assert(Math.abs(actual-expected)<1e-10,`${actual} vs ${expected}`);
function arena(){const s=a.create(1,true,[1,2,3,4],17,'original-01');s.waveReady=0;s.spawnLeft=1;s.nextSpawn=1e9;s.barrels=[];s.pickups=[];s.players.forEach((p,i)=>{p.x=144+i*120;p.y=272;p.dir=0;p.invul=100000;});return s;}
function ticks(s,n=1,controls=[]){for(let i=0;i<n;i++)a.step(s,controls);}
function equip(s,index,stable=true){const p=s.players[0];p.weapon=index;p.unlocked[index]=true;p.inventory[index]=world.weaponStats(s,index).ammo;p.ammo=p.inventory[index];if(stable)ticks(s,2);return p;}

test('gun metadata retains the original source hash, sixteen poses, raw direction/frame dimensions and null unarmed anchors',()=>{
 assert.equal(positions.sourceSha256,crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../games/50737/game.swf'))).digest('hex'));assert.equal(Object.keys(positions.poses).length,16);
 for(const m of Object.values(positions.poses)){assert.equal(m.anchors.length,m.directions);assert(m.anchors.every(row=>row.length===m.anchors[0].length));assert(m.sequence.every(n=>n>=0&&n<m.anchors[0].length));}
 for(const name of ['stand','walk'])assert(positions.poses[name].anchors.flat().every(p=>p===null));
 const p=positions.poses['handgun-stand'].anchors[0][0];close(p[0],78.9873*.35);close(p[1],-Math.sin(Math.PI/4)*-30.5832*.35);close(p[2],90.2071*.35);
});

test('native walking reuses five raw images in the eight-frame forward and backward sequence',()=>{
 for(const action of ['walk','handgun-walk','uzi-walk','shotgun-walk','rocketlauncher-walk','railgun-walk'])assert.deepEqual(Array.from({length:8},(_,i)=>pose.rawPoseFrame(action,i)),[0,1,2,3,4,3,2,1]);
});

test('angle256 truncation happens before direction rounding, including negative angles',()=>{
 const tau=2*Math.PI;assert.equal(pose.nativeDirection(tau*15.99/256,8),0);assert.equal(pose.nativeDirection(tau*16.01/256,8),1);assert.equal(pose.nativeDirection(-tau*15.99/256,8),0);assert.equal(pose.nativeDirection(Math.PI,16),8);
});

test('all four stable placeable weapons use the player cell in every aim direction and allow the player to walk off',()=>{
 for(const index of [3,5,6,8])for(let dir=0;dir<8;dir++){
  const s=arena(),p=equip(s,index);p.dir=dir*Math.PI/4;const stock=p.ammo;ticks(s,1,[input(1,{attack:1})]);const b=s.barrels[0];assert(b);assert.equal(b.x,144);assert.equal(b.y,272);assert.equal(b.z,0);assert.equal(p.ammo,stock-1);assert(a.valid(s));
  if(index===3||index===5){ticks(s,2);assert.equal(b.objectPhase,'waiting');assert(!b.collidable);ticks(s,10,[input(2,{left:true,attack:1})]);assert(p.x<128);ticks(s,12,[input(3,{attack:1})]);assert.equal(b.objectPhase,'normal');assert(b.collidable);close(b.radius,index===3?13.44:16);assert(a.valid(s));}
 }
});

test('firing on the callback after selection uses the prior handgun anchor before changing the animation',()=>{
 const s=arena(),p=s.players[0];p.unlocked[3]=true;p.inventory[3]=10;ticks(s,1,[input(1,{alt:1,weapon:3})]);assert.equal(p.poseAction,'handgun-stand');ticks(s,1,[input(2,{attack:1})]);const b=s.barrels[0];assert.equal(b.x,176);assert.equal(b.y,272);close(b.z,90.2071*.35);assert.equal(p.poseAction,'stand');assert.equal(p.drawAction,'handgun-stand');ticks(s);assert.equal(p.drawAction,'stand');assert(a.valid(s));
});

test('manual selection Renew consumes same-callback edges, while held automatic fire still reads IsDown',()=>{
 const s=arena(),p=s.players[0];p.unlocked[3]=true;p.inventory[3]=10;ticks(s,1,[input(1,{alt:1,weapon:3,attack:1})]);assert.equal(s.barrels.length,0);assert.equal(p.ammo,10);ticks(s,1,[input(2,{attack:1})]);assert.equal(s.barrels.length,0);ticks(s,1,[input(3,{attack:2})]);assert.equal(s.barrels[0].x,p.x);assert.equal(p.ammo,9);
 const t=arena(),q=t.players[0];q.unlocked[1]=true;q.inventory[1]=100;ticks(t,1,[input(1,{alt:1,weapon:1,attack:1,trigger:true})]);assert.equal(q.ammo,99);assert.equal(t.bullets.length,1);assert(a.valid(t));
});

test('a press during pistol cooldown remains latched and fires once when Weapon.Update can read it',()=>{
 const s=arena(),p=s.players[0];ticks(s,1,[input(1,{attack:1})]);const first=p.fireAt;ticks(s,1,[input(2,{attack:2})]);assert(p.firePressed);assert.equal(p.lastAttack,2);ticks(s,6);assert.equal(p.fireAt,first);assert(p.firePressed);ticks(s);assert.equal(p.fireAt,first+8);assert.equal(p.firePressed,false);const second=p.fireAt;ticks(s,20);assert.equal(p.fireAt,second);assert(a.valid(s));
});

test('a buffered grenade release survives full recovery, waits for cooldown and never repeats',()=>{
 const s=arena(),p=equip(s,4);ticks(s,1,[input(1,{attack:1,trigger:true})]);ticks(s,1,[input(2,{attack:1,trigger:false})]);const first=p.fireAt;assert.equal(p.ammo,19);ticks(s,1,[input(3,{attack:2,trigger:true})]);ticks(s,1,[input(4,{attack:2,trigger:false})]);assert(p.fireReleased);assert(p.firePressed);const copy=JSON.parse(JSON.stringify(s));assert(a.valid(copy));
 ticks(s,9);ticks(copy,9);assert.deepEqual(s,copy);assert.equal(p.fireAt,first);assert.equal(p.ammo,19);ticks(s);assert.equal(p.fireAt,first+12);assert.equal(p.ammo,18);assert(!p.fireReleased&&!p.firePressed);ticks(s,15);assert.equal(p.ammo,18);assert(a.valid(s));
});

test('manual selection clears buffered edges, and a held semiautomatic key becomes pressed next callback after Renew',()=>{
 const s=arena(),p=s.players[0];p.unlocked[3]=true;p.inventory[3]=10;ticks(s,1,[input(1,{attack:1})]);ticks(s,1,[input(2,{attack:2})]);assert(p.firePressed);ticks(s,1,[input(3,{alt:1,weapon:3,attack:2})]);assert(!p.firePressed&&!p.fireReleased);ticks(s,15);assert.equal(s.barrels.length,0);assert.equal(p.ammo,10);
 const t=arena(),q=t.players[0];q.unlocked[3]=true;q.inventory[3]=10;ticks(t,1,[input(1,{alt:1,weapon:3,attack:1,trigger:true})]);assert.equal(t.barrels.length,0);assert.equal(q.fireKeyDown,false);ticks(t,1,[input(2,{attack:1,trigger:true})]);assert.equal(t.barrels.length,1);assert.equal(q.ammo,9);assert.equal(q.firePressed,false);ticks(t,8,[input(2,{attack:1,trigger:true})]);assert.equal(t.barrels.length,1);assert.equal(q.ammo,9);
});

test('focus cancellation and expiry/reconnect consume pending edges without replaying them after cooldown',()=>{
 for(const consume of [false,true]){const s=arena(),p=s.players[0];ticks(s,1,[input(1,{attack:1})]);const first=p.fireAt;ticks(s,1,[input(2,{attack:2})]);assert(p.firePressed);if(consume)a.consumeInput(s,1,input(3,{attack:2}));else ticks(s,1,[input(3,{attack:2,cancelledAttack:2})]);assert(!p.firePressed&&!p.fireReleased);ticks(s,12);assert.equal(p.fireAt,first);ticks(s,1,[input(4,{attack:3})]);assert.equal(p.fireAt,s.tick);assert(a.valid(s));}
});

test('automatic IsDown does not turn a released native held press into an extra shot; a complete network tap queues once',()=>{
 const s=arena(),p=s.players[0];p.unlocked[1]=true;p.inventory[1]=100;ticks(s,1,[input(1,{alt:1,weapon:1,attack:1,trigger:true})]);ticks(s,1,[input(2,{attack:1,trigger:true})]);assert(p.firePressed);assert.equal(p.fireTap,false);ticks(s,1,[input(3,{attack:1,trigger:false})]);ticks(s,10);assert.equal(p.ammo,99);
 const t=arena(),q=equip(t,1);ticks(t,1,[input(1,{attack:1,trigger:false})]);ticks(t,1,[input(2,{attack:2,trigger:false})]);assert(q.fireTap);ticks(t,2);assert.equal(q.ammo,99);ticks(t);assert.equal(q.ammo,98);assert(!q.fireTap);ticks(t,15);assert.equal(q.ammo,98);assert(a.valid(t));
});

test('mimicked unarmed weapon names preserve the shared animation phase without animating on alias changes',()=>{
 const s=arena(),p=equip(s,3);p.poseFrame=.64;p.unlocked[6]=true;p.inventory[6]=10;ticks(s,1,[input(1,{alt:1,weapon:6})]);assert.equal(p.poseName,'barrelstand');close(p.poseFrame,.96);ticks(s);assert.equal(p.poseName,'minestand');close(p.poseFrame,.96);ticks(s);close(p.poseFrame,.28);assert(a.valid(s));
});

test('the actual firing callback freezes the old drawing frame while advancing the next animation frame',()=>{
 const s=arena(),p=s.players[0];ticks(s,3,[input(1,{right:true})]);const before=p.poseFrame,origin=pose.weaponPosition({...p});ticks(s,1,[input(2,{right:true,attack:1})]);assert.equal(p.drawAction,'handgun-walk');close(p.drawFrame,before);close(p.poseFrame,(before+.32)%8);const muzzle=s.effects.find(e=>e.kind==='Effect.MuzzleFlash');assert(muzzle);close(muzzle.x,origin.x+5.12);close(muzzle.y,origin.y);close(muzzle.z,origin.z);assert(a.valid(s));
});

test('hitscan and rocket shots start at the same original gun anchor used by the firing model',()=>{
 for(const index of [0,1,2,7,9]){const s=arena(),p=equip(s,index),origin=pose.weaponPosition({...p});ticks(s,1,[input(1,{attack:1})]);const b=s.bullets[0];assert(b);close(b.x,origin.x);close(b.y,origin.y);close(b.z,origin.z);assert(a.valid(s));}
});

test('a blocked movement key chooses stand while its direction still changes aim',()=>{
 const s=arena(),p=equip(s,3);p.x=48;ticks(s,1,[input(1,{left:true})]);assert.equal(p.moving,false);assert.equal(p.poseName,'barrelstand');assert.equal(p.dir,Math.PI);assert.equal(p.x,48);assert(a.valid(s));
});

test('cell occupancy rejects two children but permits one enemy or an adjacent-cell human without extra radial rejection',()=>{
 const s=arena(),p=s.players[0],q=s.players[1];s.tick=10;p.x=159;q.x=161;assert.equal(placement.cellChildCount(s,p),1);assert.deepEqual(placement.placementCell(s,{x:p.x,y:p.y,z:0},22,17),{x:144,y:272,z:0});
 q.x=158;assert.equal(placement.cellChildCount(s,p),2);assert.equal(placement.placementCell(s,{...p,z:0},22,17),null);q.x=264;
 s.zombies=[{x:200,y:272,hp:100}];assert.equal(placement.cellChildCount(s,{x:200,y:272}),1);assert(placement.placementCell(s,{x:200,y:272,z:12},22,17));
});

test('occupancy includes noncollidable registered objects, pickups, corpses, bullets and live effects, but excludes decals and newborns',()=>{
 const s=arena();s.tick=10;const pos={x:144,y:272};
 s.barrels=[{...pos,kind:'wall',registered:true,hp:-1},{...pos,kind:'mine',armed:9},{...pos,kind:'barrel',registered:false,hp:1},{...pos,kind:'chargepack',armed:10}];
 s.pickups=[{...pos,life:20,born:9},{...pos,life:20,born:10}];s.corpses=[{...pos}];s.bullets=[{...pos,life:1,born:9},{...pos,life:2,born:10}];
 s.effects=['Effect.BulletHit','Effect.RocketSmoke','Effect.MuzzleFlash','Effect.SmokeCloud','Effect.Explosion','Effect.BloodSplat','Effect.BloodPool','Effect.ScorchMark'].map(kind=>({...pos,kind,life:4,born:9}));s.effects.push({...pos,kind:'Effect.RocketSmoke',life:2,born:10},{...pos,kind:'Effect.SmokeCloud',life:16,born:11});
 assert.equal(placement.cellChildCount(s,pos),11);
});

test('native placement does not add a static-wall rejection and preserves source height',()=>{
 const s=arena();assert.deepEqual(placement.placementCell(s,{x:16,y:16,z:20},22,17),{x:16,y:16,z:20});assert.equal(placement.placementCell(s,{x:-1,y:16,z:0},22,17),null);
});

test('visual history trimming never removes still-registered effects or corpses from placement occupancy',()=>{
 const s=arena(),p=s.players[0],flash={id:++s.nextId,kind:'Effect.MuzzleFlash',x:p.x,y:p.y,z:0,angle:0,spriteKey:'Pistol.MuzzleFlash',born:0,life:2,total:2};s.effects=[flash,...Array.from({length:190},()=>({id:++s.nextId,kind:'Effect.ScorchMark',x:p.x,y:p.y,life:500,total:500,born:0}))];
 s.corpses=Array.from({length:70},(_,i)=>({x:300+i,y:400,dir:0,character:'zombie',deadAt:0}));ticks(s);assert(s.effects.includes(flash));assert.equal(s.effects.length,181);assert.equal(s.corpses.length,70);assert.equal(placement.cellChildCount(s,p),2);assert(a.valid(s));
});

test('a registered underfoot charge pack prevents another placement without consuming stock, and still plays its native cue',()=>{
 const s=arena(),p=equip(s,8);ticks(s,1,[input(1,{attack:1})]);assert.equal(p.ammo,9);ticks(s,1,[input(2,{alt:1,weapon:8,attack:1})]);ticks(s,1,[input(3,{attack:2})]);assert.equal(p.ammo,9);assert.equal(s.barrels.length,1);assert.equal(s.sounds.filter(e=>e.name==='Weapon.Mine.Place.wav').length,2);assert(a.valid(s));
});

test('full and delta recovery retain pose phase, firing-frame freeze, object height and waiting-to-growth movement',()=>{
 const s=arena();equip(s,5);ticks(s,1,[input(1,{attack:1})]);const recovered=JSON.parse(JSON.stringify(s));assert(a.valid(recovered));let client=protocol.applyUpdate(null,protocol.createUpdate(null,s,1000)),before=JSON.parse(JSON.stringify(s));
 for(let i=0;i<30;i++){const controls=[input(i+2,{left:i<10,attack:1})];ticks(s,1,controls);ticks(recovered,1,controls);assert.deepEqual(s,recovered);client=protocol.applyUpdate(client,protocol.createUpdate(before,s,1000+s.tick*40));assert.deepEqual(client,s);assert(a.valid(s));before=JSON.parse(JSON.stringify(s));}
});

test('snapshot validation rejects missing/corrupt pose phases, model names, object heights and muzzle data',()=>{
 const s=arena();equip(s,5);ticks(s,1,[input(1,{attack:1})]);for(const edit of [s=>delete s.players[0].poseFrame,s=>s.players[0].poseFrame=NaN,s=>s.players[0].poseFrame=1,s=>s.players[0].poseName='badstand',s=>s.players[0].poseAction='missing',s=>s.players[0].drawAction='missing',s=>s.players[0].drawFrame=-1,s=>delete s.players[0].firePressed,s=>s.players[0].fireReleased=1,s=>s.players[0].fireKeyDown=null,s=>delete s.barrels[0].z,s=>s.barrels[0].z=Infinity,s=>s.barrels[0].z=-1]){const bad=JSON.parse(JSON.stringify(s));edit(bad);assert(!a.valid(bad));}
 const shot=arena();ticks(shot,1,[input(1,{attack:1})]);for(const edit of [e=>e.z=NaN,e=>e.spriteKey='unknown',e=>e.angle=Infinity,e=>e.life=0,e=>delete e.born]){const bad=JSON.parse(JSON.stringify(shot));edit(bad.effects.find(e=>e.kind==='Effect.MuzzleFlash'));assert(!a.valid(bad));}const bad=JSON.parse(JSON.stringify(shot));delete bad.bullets[0].born;assert(!a.valid(bad));
});
