'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),fs=require('node:fs'),crypto=require('node:crypto'),{PNG}=require('pngjs');
function load(file){const name=path.resolve(__dirname,file),source=require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(name,module);m.paths=module.paths;m._compile(source,name);return m.exports;}
const a=load('../src/expanded/boxhead.ts').adapter,world=load('../src/expanded/boxhead-world.ts'),walls=load('../src/expanded/boxhead-walls.ts'),explosions=load('../src/expanded/boxhead-explosions.ts'),protocol=load('../src/authority/protocol.ts');
const art=require('../src/expanded/boxhead-wall-art.json'),data=require('../src/expanded/boxhead-data.json');
const input=(seq,patch={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...patch});
function arena(){const s=a.create(1,true,[1,2],17,'original-01');s.waveReady=0;s.spawnLeft=1;s.nextSpawn=1e9;s.barrels=[];s.pickups=[];s.players.forEach((p,i)=>{p.x=144+i*400;p.y=272;p.dir=0;p.invul=100000;});return s;}
function ticks(s,n=1,controls=[]){for(let i=0;i<n;i++)a.step(s,controls);}
function equip(s,index){const p=s.players[0];p.weapon=index;p.unlocked[index]=true;p.inventory[index]=world.weaponStats(s,index).ammo;p.ammo=p.inventory[index];return p;}
function placedWall(){const s=arena(),p=equip(s,5);ticks(s,2);a.step(s,[input(1,{attack:1})]);assert.equal(p.ammo,4);const b=s.barrels[0];assert.equal(b.x,p.x);assert.equal(b.y,p.y);p.x=b.x-40;p.weapon=0;p.ammo=-1;ticks(s,12);assert.equal(b.objectPhase,'normal');return {s,p,b};}
function shoot(s,p,count){let seq=s.inputs[0].seq,attack=p.lastAttack;for(let i=0;i<count;i++){while(p.cooldown>0)a.step(s,[input(++seq,{attack})]);a.step(s,[input(++seq,{attack:++attack})]);}}
function hit(s,b,amount,owner=1){walls.affectWall(b,amount,owner);a.step(s,[]);}

test('all original map walls and player fake walls use native1000HP with frame0 and full opacity',()=>{
 let count=0;for(const map of data.maps){const s=a.create(1,true,[1,2],17,map.id);const objects=s.barrels.filter(b=>b.kind==='wall');count+=objects.length;assert.equal(objects.length,map.walls.length);assert(objects.every(b=>b.hp===1000&&b.maxHp===1000&&b.wallFrame===0&&b.wallAlpha===100&&!b.exploded&&b.fadeAt===null));assert(a.valid(s));}assert.equal(count,159);
 const {s,b}=placedWall();assert.equal(b.hp,1000);assert.equal(b.wallFrame,0);assert.equal(b.wallAlpha,100);assert.equal(b.owner,1);assert(a.valid(s));
});

test('real pistol fire traverses all ten damage images and takes39 native26-damage shots to collapse a wall',()=>{
 const {s,p,b}=placedWall(),frames=[b.wallFrame];for(let n=1;n<=38;n++){shoot(s,p,1);assert.equal(b.hp,1000-26*n);frames.push(b.wallFrame);assert(a.valid(s));}
 assert.deepEqual([...new Set(frames)],[0,1,2,3,4,5,6,7,8,9]);assert.equal(frames[3],0);assert.equal(frames[4],1);assert.equal(frames[20],5);assert.equal(b.hp,12);assert.equal(b.fadeAt,null);
 shoot(s,p,1);assert.equal(b.hp,-14);assert.equal(b.wallFrame,9);assert.equal(b.wallAlpha,80);assert.equal(b.fadeAt,s.tick);assert.equal(s.effects.filter(e=>e.kind==='Effect.SmokeCloud').length,1);assert(!s.effects.some(e=>e.kind==='Effect.Explosion'));assert(a.valid(s));
});

test('native AS2 callback applies newest affects first, keeps the prior frame at death and clears the rest',()=>{
 const {s,b}=placedWall();hit(s,b,260);assert.equal(b.wallFrame,2);assert.equal(b.hp,740);walls.affectWall(b,800,2);walls.affectWall(b,500,1);ticks(s);
 assert.equal(b.hp,-560);assert.equal(b.wallFrame,7);assert.equal(b.owner,2);assert.equal(b.affects.length,0);assert.equal(b.wallAlpha,80);assert.equal(s.effects.filter(e=>e.kind==='Effect.SmokeCloud').length,1);
 walls.affectWall(b,10000,1);ticks(s);assert.equal(b.hp,-560);assert.equal(b.owner,2);assert.equal(s.effects.filter(e=>e.kind==='Effect.SmokeCloud').length,1);assert(a.valid(s));
});

test('a shotgun burst queues all wall affects before applying them and does not leak its last ray into a teammate',()=>{
 const {s,p,b}=placedWall();hit(s,b,900);assert.equal(b.hp,100);equip(s,2);const q=s.players[1];q.x=b.x+90;q.y=b.y;q.invul=0;
 a.step(s,[input(2,{attack:2})]);assert.equal(s.bullets.filter(b=>b.weapon===2).length,3);assert.equal(b.hp,-2);assert.equal(b.wallFrame,9);assert.equal(q.hp,200);assert.equal(b.affects.length,0);assert(a.valid(s));
});

test('fade lasts five callbacks including immediate80 percent, with collision released only at following disposal',()=>{
 const {s,p,b}=placedWall();hit(s,b,1000);const born=s.tick;p.x=b.x-(.45*32+b.radius);const x=p.x,alpha=[];
 for(let i=0;i<5;i++){
  assert(s.barrels.includes(b));assert(world.blocked(s,b.x,b.y,11));assert.equal(b.wallAlpha,80-i*20);alpha.push(b.wallAlpha);assert(a.valid(s));
  a.step(s,[input(10+i,{right:true,attack:1})]);if(i<4)assert.equal(p.x,x);
 }
 assert.deepEqual(alpha,[80,60,40,20,0]);assert.equal(b.deleteAt,born+4);assert.equal(s.tick,born+5);assert(!s.barrels.includes(b));assert(p.x>x);assert(!world.blocked(s,b.x,b.y,11));assert(a.valid(s));
});

test('fading wall has no damage flags, so later hitscan passes through while its movement collider remains',()=>{
 const {s,p,b}=placedWall();hit(s,b,1000);const q=s.players[1];q.x=b.x+80;q.y=b.y;q.invul=0;
 a.step(s,[input(2,{attack:2})]);assert.equal(q.hp,174+200/750);assert(world.blocked(s,b.x,b.y,11));assert.equal(b.wallAlpha,60);assert.equal(s.effects.filter(e=>e.kind==='Effect.SmokeCloud').length,1);
});

test('native rocket bullet-affect ray passes a fading wall while the movement collider remains',()=>{
 const {s,p,b}=placedWall();hit(s,b,1000);equip(s,7);a.step(s,[input(2,{attack:2})]);ticks(s);assert.equal(s.bullets.filter(b=>b.weapon===7).length,1);assert.equal(s.explosions.length,0);assert(s.barrels.includes(b));assert(world.blocked(s,b.x,b.y));assert(s.bullets[0].x>b.x);assert.equal(s.effects.filter(e=>e.kind==='Effect.SmokeCloud').length,1);assert(a.valid(s));
});

test('explosion damage uses the original wall health and frame without causing an extra wall explosion',()=>{
 const {s,b}=placedWall();explosions.queueExplosion(s,b.x,b.y,250,2);ticks(s);assert.equal(b.hp,750);assert.equal(b.wallFrame,2);assert.equal(b.owner,2);assert.equal(b.fadeAt,null);assert.equal(s.effects.filter(e=>e.kind==='Effect.Explosion').length,1);
});

test('native15-frame smoke begins on the next callback, advances by one and keeps its terminal frame until disposal',()=>{
 const {s,b}=placedWall();hit(s,b,1000);const e=s.effects.find(e=>e.kind==='Effect.SmokeCloud');assert.equal(e.born,s.tick+1);assert.equal(e.total,16);assert.equal(e.life,16);assert.equal(s.effects.filter(e=>e.kind==='Effect.ScorchMark').length,1);
 const frames=[];for(let i=0;i<15;i++){ticks(s);assert(s.effects.includes(e));frames.push(walls.smokeFrame(s.tick,e.born,15));assert(a.valid(s));}
 assert.deepEqual(frames,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,14]);ticks(s);assert(!s.effects.includes(e));
});

test('full and delta recovery preserve damaged walls, pending affects, fade, collider disposal and smoke position',()=>{
 const {s,b}=placedWall();hit(s,b,260);walls.affectWall(b,800,1);assert(a.valid(s));const recovered=JSON.parse(JSON.stringify(s));let client=protocol.applyUpdate(null,protocol.createUpdate(null,s,1000)),before=JSON.parse(JSON.stringify(s));assert.deepEqual(client,s);
 for(let i=0;i<18;i++){ticks(s);ticks(recovered);assert.deepEqual(s,recovered);client=protocol.applyUpdate(client,protocol.createUpdate(before,s,1000+s.tick*40));assert.deepEqual(client,s);assert(a.valid(s));before=JSON.parse(JSON.stringify(s));}
});

test('wall and smoke sheets match the source timeline metadata, preserve duplicate native wall images and all15 smoke frames',()=>{
 for(const [name,m]of Object.entries(art.timelines)){
  const file=fs.readFileSync(path.join(__dirname,'../public/expanded/assets/boxhead',m.file)),png=PNG.sync.read(file);assert.equal(crypto.createHash('sha256').update(file).digest('hex'),m.sha256);assert.equal(png.width,m.w*m.frames);assert.equal(png.height,m.h);assert.deepEqual(data.objects[name],{file:m.file,frames:m.frames,w:m.w,h:m.h,x:m.x,y:m.y});
  const hashes=[];for(let f=0;f<m.frames;f++){const frame=Buffer.alloc(m.w*m.h*4);for(let y=0;y<m.h;y++)png.data.copy(frame,y*m.w*4,(y*png.width+f*m.w)*4,(y*png.width+(f+1)*m.w)*4);hashes.push(crypto.createHash('sha256').update(frame).digest('hex'));}assert.deepEqual(hashes,m.frameSha256);
 }
 assert.equal(art.timelines['Object.Wall'].frames,10);assert.equal(new Set(art.timelines['Object.Wall'].frameSha256).size,9);assert.equal(art.timelines['Effect.SmokeCloud'].frames,15);assert.equal(new Set(art.timelines['Effect.SmokeCloud'].frameSha256).size,15);assert.equal(art.smokeContentsSymbol,626);
});

test('validation rejects impossible wall health/images/fade and corrupt affect or smoke timelines',()=>{
 const {s}=placedWall();for(const edit of [s=>s.barrels[0].maxHp=100,s=>s.barrels[0].hp=1001,s=>s.barrels[0].wallFrame=10,s=>s.barrels[0].wallFrame=3,s=>s.barrels[0].wallAlpha=80,s=>s.barrels[0].fadeAt=0,s=>s.barrels[0].deleteAt=0,s=>s.barrels[0].affects=[{amount:NaN,owner:1}],s=>s.barrels[0].affects=[{amount:50,owner:9}]]){const bad=JSON.parse(JSON.stringify(s));edit(bad);assert.equal(a.valid(bad),false);}
 const dead=placedWall();hit(dead.s,dead.b,1000);for(const edit of [s=>s.barrels[0].wallAlpha=0,s=>s.barrels[0].wallFrame=-1,s=>s.barrels[0].deleteAt=s.tick,s=>s.barrels[0].affects=[{amount:1,owner:1}],s=>s.effects.find(e=>e.kind==='Effect.SmokeCloud').born=s.tick+2,s=>s.effects.find(e=>e.kind==='Effect.SmokeCloud').life=1]){const bad=JSON.parse(JSON.stringify(dead.s));edit(bad);assert.equal(a.valid(bad),false);}
});
