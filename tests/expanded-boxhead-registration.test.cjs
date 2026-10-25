'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),source=require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(name,module);m.paths=module.paths;m._compile(source,name);return m.exports;}
const a=load('../src/expanded/boxhead.ts').adapter,world=load('../src/expanded/boxhead-world.ts'),reg=load('../src/expanded/boxhead-registration.ts'),walls=load('../src/expanded/boxhead-walls.ts'),blast=load('../src/expanded/boxhead-explosions.ts'),protocol=load('../src/authority/protocol.ts');
const input=(seq,patch={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...patch});
function arena(){const s=a.create(1,true,[1,2,3,4],17,'original-01');s.waveReady=0;s.spawnLeft=1;s.nextSpawn=1e9;s.barrels=[];s.pickups=[];s.players.forEach((p,i)=>{p.x=144+i*120;p.y=272;p.dir=0;p.invul=100000;});return s;}
function object(s,kind='barrel',x=176,y=272){const b={id:++s.nextId,x,y,kind,hp:1,damage:150,owner:1,armed:s.tick,exploded:false,...(kind==='wall'?walls.wallState():{}),...reg.objectRegistration()};s.barrels.push(b);return b;}
function ticks(s,n=1,controls=[]){for(let i=0;i<n;i++)a.step(s,controls);}
function close(actual,expected){assert(Math.abs(actual-expected)<1e-10,`${actual} vs ${expected}`);}

test('a placed physical object only registers and collides on its next callback',()=>{
 for(const weapon of [3,5]){const s=arena(),p=s.players[0];p.unlocked[weapon]=true;p.weapon=weapon;p.inventory[weapon]=world.weaponStats(s,weapon).ammo;p.ammo=p.inventory[weapon];ticks(s,1,[input(1,{attack:1})]);const b=s.barrels[0];assert(b);assert.equal(b.armed,s.tick);assert.equal(b.registered,false);assert.equal(b.radius,null);assert.equal(b.collidable,false);assert.equal(b.objectPhase,'init');assert(!world.blocked(s,b.x,b.y));assert(a.valid(s));ticks(s);assert.equal(b.registered,true);assert.equal(b.objectPhase,'normal');assert(b.collidable);close(b.radius,13.44);assert(world.blocked(s,b.x,b.y));assert(a.valid(s));}
});

test('all living human seats hold a barrel or wall open until every player leaves that cell',()=>{
 for(const kind of ['barrel','wall'])for(const seat of [1,2,3,4]){const s=arena(),b=object(s,kind),p=s.players[seat-1];p.x=b.x;p.y=b.y;ticks(s,4);assert.equal(b.registered,true);assert.equal(b.objectPhase,'waiting');assert.equal(b.radius,null);assert(!b.collidable);assert(!reg.objectBlocks(b));assert(a.valid(s));const q=s.players[seat%4];q.x=b.x+1;q.y=b.y;p.x=b.x+64;ticks(s,3);assert.equal(b.objectPhase,'waiting');q.x=b.x+96;ticks(s);assert.equal(b.objectPhase,'growing');assert(b.collidable);close(b.radius,1.6);assert(a.valid(s));}
});

test('barrel radius grows by .05 cell, overshoots .42 to .45 and resets on the following callback',()=>{
 const s=arena(),p=s.players[0],b=object(s);p.x=b.x;ticks(s);p.x=b.x+64;
 for(let i=1;i<=9;i++){ticks(s);assert.equal(b.objectPhase,'growing');close(b.radius,i*1.6);assert(a.valid(s));}
 close(b.radius,14.4);ticks(s);close(b.radius,13.44);assert.equal(b.objectPhase,'normal');
});

test('an under-player wall grows past .48 to .50 and keeps it; an ordinary wall starts at .42',()=>{
 const s=arena(),p=s.players[0],b=object(s,'wall'),ordinary=object(s,'wall',400,400);p.x=b.x;ticks(s);close(ordinary.radius,13.44);p.x=b.x+64;
 for(let i=1;i<=10;i++){ticks(s);close(b.radius,i*1.6);assert.equal(b.objectPhase,'growing');assert(a.valid(s));}
 ticks(s);close(b.radius,16);assert.equal(b.objectPhase,'normal');ticks(s,5);close(b.radius,16);
});

test('growing circles push a stationary adjacent player clear; the same circle resolves prediction and authority movement',()=>{
 const s=arena(),p=s.players[0],b=object(s,'wall');p.x=b.x;ticks(s);p.x=b.x+17;ticks(s,11);close(p.x-b.x,14.4+16);assert.equal(p.y,b.y);assert(a.valid(s));
 const contact=p.x,copy=JSON.parse(JSON.stringify(s));a.predict(copy,1,input(1,{left:true}),1);ticks(s,1,[input(1,{left:true})]);close(s.players[0].x,contact);close(copy.players[0].x,s.players[0].x);
 // AABB corners previously blocked this point even though circles do not meet.
 assert(!world.blocked(s,b.x+24,b.y+24,11));assert(world.blocked(s,b.x+26,b.y,11));
});

test('barrel queues explosion affects while occupied and during growth, then detonates once after growth',()=>{
 const s=arena(),p=s.players[0],b=object(s);p.x=b.x;ticks(s);blast.queueExplosion(s,b.x,b.y,100,2);ticks(s);assert.equal(b.hp,1);assert.deepEqual(b.barrelAffects,[2]);assert.equal(b.objectPhase,'waiting');assert(s.barrels.includes(b));assert(a.valid(s));
 p.x=b.x+64;ticks(s,9);assert.equal(b.hp,1);assert.equal(b.objectPhase,'growing');ticks(s);assert(!s.barrels.includes(b));assert.equal(s.explosions.length,1);assert.equal(s.explosions[0].owner,2);assert.equal(s.explosions[0].damage,150);assert(a.valid(s));
});

test('wall affects wake a growing wall immediately and freeze its current radius instead of waiting for growth',()=>{
 const s=arena(),p=s.players[0],b=object(s,'wall');p.x=b.x;ticks(s);p.x=b.x+64;ticks(s,3);close(b.radius,4.8);walls.affectWall(b,100,2);assert.equal(b.objectPhase,'normal');ticks(s);assert.equal(b.hp,900);assert.equal(b.wallFrame,0);close(b.radius,4.8);ticks(s,10);close(b.radius,4.8);assert(a.valid(s));
});

test('normal zombie attack leaves a barrel intact but still damages walls; a devil can detonate a barrel',()=>{
 for(const [kind,devil] of [['barrel',false],['wall',false],['barrel',true]]){const s=arena(),b=object(s,kind);s.players[0].x=250;s.zombies=[{id:++s.nextId,x:b.x+28,y:b.y,hp:devil?1000:100,devil,attack:0,dir:0,owner:0,hitAt:-99,attackAt:-99}];ticks(s);if(kind==='barrel'&&devil){assert(!s.barrels.includes(b));assert.equal(s.explosions.length,1);}else assert.equal(b.hp,kind==='wall'?950:1);assert(a.valid(s));}
});

test('full and delta recovery preserve pending registration, waiting, growth and queued barrel damage',()=>{
 const s=arena(),p=s.players[0],b=object(s);p.x=b.x;ticks(s);blast.queueExplosion(s,b.x,b.y,100,2);ticks(s);const copy=JSON.parse(JSON.stringify(s));assert(a.valid(copy));let client=protocol.applyUpdate(null,protocol.createUpdate(null,s,1000)),before=JSON.parse(JSON.stringify(s));
 for(let i=0;i<15;i++){if(i===2){s.players[0].x=b.x+64;copy.players[0].x=b.x+64;}ticks(s);ticks(copy);assert.deepEqual(s,copy);client=protocol.applyUpdate(client,protocol.createUpdate(before,s,1000+s.tick*40));assert.deepEqual(client,s);assert(a.valid(s));before=JSON.parse(JSON.stringify(s));}
});

test('authority rejects missing or corrupt collision lifecycle and queued ownership fields',()=>{
 const s=arena();object(s);assert(a.valid(s));for(const edit of [b=>delete b.registered,b=>b.registered=true,b=>b.radius=1,b=>b.collidable=true,b=>b.objectPhase='other',b=>b.barrelAffects=[9],b=>b.barrelAffects=[NaN],b=>b.armed=s.tick+1]){const bad=JSON.parse(JSON.stringify(s));edit(bad.barrels[0]);assert(!a.valid(bad));}
 ticks(s);for(const edit of [b=>b.registered=false,b=>b.radius=Infinity,b=>b.radius=17,b=>b.objectPhase='waiting']){const bad=JSON.parse(JSON.stringify(s));edit(bad.barrels[0]);assert(!a.valid(bad));}
});
