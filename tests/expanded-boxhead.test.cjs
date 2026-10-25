'use strict';
const attachEnemy=require('./helpers/boxhead-enemy.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const source=require('esbuild').buildSync({entryPoints:[path.resolve(__dirname,file)],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;const mod=new Module(file,module);mod.paths=module.paths;mod._compile(source,file);return mod.exports;}
const {adapter:a}=load('../src/expanded/boxhead.ts'),world=load('../src/expanded/boxhead-world.ts'),{nameAnchors}=load('../src/authority/nameplates.ts');
const {objectRegistration}=load('../src/expanded/boxhead-registration.ts');
const data=require('../src/expanded/boxhead-data.json'),input=(seq=1,patch={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...patch});
function arena(map){const s=a.create(1,true,[1,2,3,4],42,map);s.waveReady=0;s.spawnLeft=1;s.nextSpawn=1e9;s.barrels=[];s.pickups=[];s.players.forEach((p,i)=>{p.x=144+i*96;p.y=272;p.invul=100000;});return s;}
const zombie=(id,x,y,hp=100,devil=false)=>({id,x,y,hp,devil,attack:0,dir:0,owner:0,hitAt:-99,attackAt:-99});
function tick(s,n=1,controls=[]){for(let i=0;i<n;i++)a.step(s,controls);}
function equip(s,index){const p=s.players[0];p.unlocked[index]=true;p.weapon=index;p.inventory[index]=world.weaponStats(s,index).ammo;p.ammo=p.inventory[index];p.cooldown=0;return p;}

test('all 18 native rooms retain geometry, distinct occupied humans and deterministic authority',()=>{
 assert.equal(a.maps.length,18);assert.equal(data.animations['swat-handgun-walk'].frames,5);assert.equal(Object.keys(data.animations).length,78);assert.equal(Object.keys(data.audio).length,26);
 for(const map of data.maps){const x=a.create(1,true,[1,2,3,4],12,map.id),y=a.create(1,true,[1,2,3,4],12,map.id);assert.equal(new Set(x.players.map(p=>p.x+','+p.y)).size,4,map.id);assert.equal(new Set(x.players.map(p=>p.character)).size,4);for(const p of x.players)assert(!world.blocked(x,p.x,p.y),map.id);for(let i=0;i<150;i++){const controls=[input(i,{right:i%80<40,attack:i})];a.step(x,controls);a.step(y,controls);}assert.deepEqual(x,y,map.id);assert(a.valid(x),map.id);}
 const sparse=a.create(1,true,[2,4],1);assert.deepEqual(sparse.players.map(p=>p.seat),[2,4]);
});
test('duplicate, stale, malformed and reconnect input cannot repeat shots or weapon changes',()=>{
 const s=arena(),p=equip(s,1);p.weapon=0;a.step(s,[input(3,{attack:1,alt:1})]);assert.equal(p.weapon,1);const ammo=p.ammo;
 tick(s,25,[input(3,{attack:1,alt:1})]);assert.equal(p.ammo,ammo);assert.equal(p.weapon,1);
 a.step(s,[input(2,{attack:999,alt:999})]);assert.equal(p.ammo,ammo);const x=p.x;
 a.step(s,[input(4,{right:'yes',attack:NaN})]);assert.equal(p.x,x);assert.equal(s.ack[0],3);
 a.consumeInput(s,1,input(5,{attack:20,alt:20}));a.step(s,[input(6,{attack:20,alt:20})]);assert.equal(p.ammo,ammo);
});
test('native hitscan damage and team multiplier unlock weapons for all four humans',()=>{
 const s=arena(),p=s.players[0];p.dir=0;s.combo=4;s.peakCombo=4;s.zombies=[attachEnemy(s,zombie(901,p.x+70,p.y,20))];
 a.step(s,[input(1,{attack:1})]);assert.equal(p.kills,1);assert.equal(s.combo,5);assert.equal(s.score,400);assert.equal(s.zombies.length,0);
 for(const human of s.players){assert(human.unlocked[1]);assert.equal(human.weapon,1);assert.equal(human.inventory[1],100);}
 assert(s.sounds.some(e=>e.name==='Weapon.Pistol.Fire.wav'));
});
test('weapon cycling and number selection retain finite ammunition and reject locked weapons',()=>{
 const s=arena(),p=equip(s,1);a.step(s,[input(1,{attack:1})]);assert.equal(p.inventory[1],99);
 a.step(s,[input(2,{alt:1})]);assert.equal(p.weapon,0);
 a.step(s,[input(3,{alt:2,weapon:1})]);assert.equal(p.weapon,1);assert.equal(p.ammo,99);
 a.step(s,[input(4,{alt:3,weapon:9})]);assert.equal(p.weapon,1);assert.equal(p.ammo,99);
 a.step(s,[input(5,{alt:4,weapon:Infinity})]);assert.equal(s.ack[0],4);
});
test('each original unlock milestone and upgrade persists when the combo decays',()=>{
 for(const [threshold,index] of [[5,1],[10,2],[15,3],[20,4],[30,5],[40,6],[50,7],[55,8],[70,9]]){
  const s=arena(),p=s.players[0];s.combo=threshold-1;s.peakCombo=threshold-1;s.zombies=[attachEnemy(s,zombie(901,p.x+70,p.y,1))];p.dir=0;
  a.step(s,[input(1,{attack:1})]);assert(p.unlocked[index],String(threshold));assert.equal(p.weapon,index);
  s.comboUntil=0;tick(s,100);assert(p.unlocked[index]);assert.equal(s.peakCombo,threshold);
 }
 const s=arena();s.peakCombo=100;assert.equal(world.weaponStats(s,9).rate,2);assert.equal(world.weaponStats(s,1).damage,140);assert.equal(world.weaponStats(s,1).ammo,400);
});
test('shotgun uses native three rays and railgun pierces a line of enemies',()=>{
 const shotgun=arena(),p=equip(shotgun,2);p.dir=0;a.step(shotgun,[input(1,{attack:1})]);assert.equal(shotgun.bullets.length,3);assert.equal(p.ammo,19);
 const s=arena(),q=equip(s,9);q.dir=0;s.zombies=[attachEnemy(s,zombie(901,q.x+60,q.y,90)),attachEnemy(s,zombie(902,q.x+120,q.y,90))];a.step(s,[input(1,{attack:1})]);assert.equal(q.kills,2);assert.equal(s.zombies.length,0);assert.equal(q.ammo,14);
});
test('all ten weapons execute original shot or place behavior with valid authoritative snapshots',()=>{
 for(let index=0;index<10;index++){const s=arena(),p=equip(s,index);p.dir=0;a.step(s,[input(1,{attack:1})]);assert.equal(p.ammo,index?world.WEAPONS[index].ammo-1:-1,'ammo '+index);assert(a.valid(s),'snapshot '+index);if([3,5,6,8].includes(index))assert.equal(s.barrels.length,1);else assert(s.bullets.length>0);tick(s,70);assert(a.valid(s),'after projectile '+index);}
});
test('grenades bounce and retain their fuse; rockets explode on contact',()=>{
 const s=arena(),p=equip(s,4);p.x=55;p.dir=Math.PI;a.step(s,[input(1,{attack:1})]);const b=s.bullets[0];assert.equal(b.weapon,4);assert.equal(b.life,60);tick(s,5);assert(b.vx>0);assert(b.life>0);assert(s.sounds.some(e=>e.name==='Shot.Grenade.Bounce.wav'));tick(s,55);assert.equal(s.bullets.length,0);assert.equal(s.explosions.length,1);assert(!s.effects.some(e=>e.kind==='Effect.Explosion'));tick(s);assert(s.effects.some(e=>e.kind==='Effect.Explosion'));
 const r=arena(),q=equip(r,7);q.x=55;q.dir=Math.PI;tick(r,3,[input(1,{attack:1})]);assert(r.effects.some(e=>e.kind==='Effect.Explosion'));
});
test('barrel chains initialize once on later ticks; mines arm and charge packs require a second trigger',()=>{
 const s=arena(),p=s.players[0];p.dir=0;s.players[1].x=624;s.barrels=[{id:901,x:p.x+60,y:p.y,z:0,kind:'barrel',hp:1,owner:0,armed:0,exploded:false,...objectRegistration()},{id:902,x:p.x+100,y:p.y,z:0,kind:'barrel',hp:1,owner:0,armed:0,exploded:false,...objectRegistration()}];s.zombies=[attachEnemy(s,zombie(903,p.x+155,p.y,50))];a.step(s,[input(1,{attack:1})]);assert.equal(s.barrels.length,1);assert.equal(p.kills,0);assert.equal(s.explosions.length,1);tick(s);assert.equal(s.barrels.length,0);assert.equal(s.effects.filter(e=>e.kind==='Effect.Explosion').length,1);tick(s);assert.equal(p.kills,1);assert.equal(s.effects.filter(e=>e.kind==='Effect.Explosion').length,2);assert.equal(s.explosions.length,0);tick(s);assert.equal(s.effects.filter(e=>e.kind==='Effect.Explosion').length,2);
 const mine=arena(),m=equip(mine,6);m.dir=0;a.step(mine,[input(1,{attack:1})]);const item=mine.barrels[0];mine.zombies=[attachEnemy(mine,zombie(904,item.x,item.y))];tick(mine,1);assert.equal(mine.barrels.length,1);assert.equal(item.detonateAt,mine.tick+50);tick(mine,49);assert.equal(mine.barrels.length,1);tick(mine,1);assert.equal(mine.barrels.length,0);
 const pack=arena(),q=equip(pack,8);q.dir=0;a.step(pack,[input(1,{attack:1})]);assert.equal(pack.barrels[0].kind,'chargepack');const ammo=q.ammo;tick(pack,3,[input(1,{attack:1})]);assert.equal(pack.barrels.length,1);a.step(pack,[input(2,{attack:2})]);assert.equal(pack.barrels.length,1);assert.equal(pack.barrels[0].detonateCounter,1.5);tick(pack);assert.equal(pack.barrels.length,1);tick(pack);assert.equal(pack.barrels.length,0);assert.equal(q.ammo,ammo);
});
test('native wall collision, enemy fireballs and pickups affect the authoritative state',()=>{
 const s=arena(),p=s.players[0];p.x=48;p.y=272;tick(s,25,[input(1,{left:true})]);assert(p.x>=43);p.invul=0;s.bullets=[{id:901,x:p.x+20,y:p.y,z:18,vx:-7,vy:0,owner:-1,weapon:-1,damage:50,life:1,born:s.tick,parent:999,fireball:true,multiply:false,radius:8,animation:0}];tick(s);assert(p.hp<151);
 s.pickups=[{id:902,x:p.x,y:p.y,life:50,born:s.tick}];tick(s);assert.equal(p.hp,200);assert.equal(s.pickups.length,0);
});
test('native maze navigation routes enemies around static walls instead of walking into them',()=>{
 const s=a.create(1,true,[1],1,'original-03'),p=s.players[0],map=world.room(s);s.barrels=[];s.pickups=[];s.wave=1;s.waveReady=0;s.spawnLeft=1;s.nextSpawn=1e9;p.invul=100000;
 // Choose the most distant reachable cell using an independent breadth-first oracle.
 const grid=map.collision,queue=[[Math.floor(p.x/32),Math.floor(p.y/32),0]],seen=new Set([queue[0].slice(0,2).join(',')]);let last;
 for(let at=0;at<queue.length;at++){const [x,y,d]=queue[at];if(!world.lineClear(s,p.x,p.y,x*32+16,y*32+16))last={x:x*32+16,y:y*32+16,d};for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=nx+','+ny;if(grid[ny]?.[nx]==='0'&&!seen.has(k)){seen.add(k);queue.push([nx,ny,d+1]);}}}
 assert(last&&last.d>10);const z=zombie(901,last.x,last.y);s.zombies=[attachEnemy(s,z)];for(let n=0;n<10000&&z.attackAt<0;n++)tick(s);assert(z.attackAt>0,'enemy reached the player around the maze');assert(a.valid(s));
});
test('cooperative revive requires a living teammate; simultaneous defeat ends survival',()=>{
 const s=arena();s.players[0].hp=-1;tick(s);assert.equal(s.players[0].alive,false);assert.equal(s.players[0].deaths,1);assert.equal(s.phase,'playing');tick(s,125);assert(s.players[0].alive);assert.equal(s.players[0].hp,200);assert(s.players[0].invul>0);assert.equal(s.players[0].deaths,1);
 s.players.forEach(p=>p.hp=-1);tick(s);assert.equal(s.phase,'finished');assert.equal(s.winner,0);const t=s.tick;tick(s,20);assert.equal(s.tick,t);
});
test('survival continues beyond six waves and twelve minutes with native wave counts',()=>{
 const s=arena();s.wave=6;s.spawnLeft=0;s.waveReady=1;tick(s);assert.equal(s.phase,'playing');assert.equal(s.wave,7);assert.equal(s.spawnLeft,40);assert.equal(s.devilLeft,2);
 s.tick=25*60*12-1;tick(s);assert.equal(s.phase,'playing');
});
test('shared camera and nameplates contain all four separated humans on every native room',()=>{
 for(const map of data.maps){const s=a.create(1,true,[1,2,3,4],1,map.id);const corners=[[64,128],[map.width-64,128],[64,map.height-64],[map.width-64,map.height-64]];s.players.forEach((p,i)=>{p.x=corners[i][0];p.y=corners[i][1];});const c=world.camera(s),anchors=nameAnchors(s,1280,800);for(const [i,p]of s.players.entries()){const x=c.x+p.x*c.scale,y=c.y+p.y*c.scale;assert(x>=0&&x<=1280,map.id);assert(y>=84&&y<=800,map.id);assert(Math.abs(anchors[i].x-x)<1);assert(Math.abs(anchors[i].y-(c.y+(p.y-87)*c.scale))<1);}assert(c.visibleWidth>=Math.min(1152,map.width));}
});
test('P3/P4 have independent monotonic input, shot ownership and death statistics',()=>{
 const s=arena();a.step(s,[input(1),input(2),input(8,{attack:1}),input(9,{attack:1})]);assert(s.bullets.some(b=>b.owner===3));assert(s.bullets.some(b=>b.owner===4));assert.deepEqual(s.ack,[1,2,8,9]);const p=s.players[3];p.hp=-1;tick(s);assert.equal(p.deaths,1);assert.equal(p.killedBy,0);assert(a.valid(s));
});
test('snapshot validation rejects malformed entities, materials and non-finite state',()=>{
 for(const edit of [s=>s.players[0].x=NaN,s=>s.gameId='97734-server',s=>s.players[1].seat=1,s=>s.players[0].inventory[1]=Infinity,s=>s.players[0].weapon=10,s=>s.players[0].character='unknown',s=>s.sounds=[{id:1,tick:0,name:'bad'}],s=>s.zombies=[attachEnemy(s,zombie(1,NaN,0))],s=>s.effects=[{x:0,y:0,life:NaN}],s=>s.peakCombo=NaN,s=>s.inputs[0].weapon=20]){const s=arena();edit(s);assert.equal(a.valid(s),false);}
});
