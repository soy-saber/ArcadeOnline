'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),Module=require('node:module'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
function load(name){const file=path.resolve(__dirname,'../src/expanded/'+name+'.ts'),m=new Module(file,module);m.paths=module.paths;m._compile(esbuild.buildSync({entryPoints:[file],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,file);return m.exports;}
const core=load('bomb2'),blasts=load('bomb2-blasts'),{relocate,syncWalking}=load('bomb2-movement');
const input=(seq=0,extra={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...extra});
function world(){const s=core.create(1,true,[1,2],123,'beach-one');s.board.fill(0);s.tiles.fill(0);s.items.fill(0);return s;}
function bomb(s,x,y,range=3,owner=1,kind='normal',due=1){const b={id:s.nextId++,owner,x,y,range,kind,explodeAt:due,armedAt:core.ROUND_TICKS+20,slide:-1};s.bombs.push(b);return b;}
const tile=(b,x,y)=>b.tiles.find(t=>t.x===x&&t.y===y);

test('original nested flame clips retain animation length, registration and bytes; selectors retain source matrices',()=>{
 const art=require('../src/expanded/bomb2-blast-art.json');assert.equal(art.sha256,'788c15ad1661e576cd004688785175ef62c2e0ef211db0fe83b5475625262ae1');assert.equal(art.lifetimeTicks,16);
 assert.deepEqual(Object.values(art.timelines).map(m=>[m.symbol,m.frames,m.w,m.h]),[[2945,19,58,58],[2952,18,37,41],[2957,18,37,31],[2959,19,144,144]]);
 for(const m of Object.values(art.timelines)){const bytes=fs.readFileSync(path.resolve(__dirname,'..',m.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),m.sha256);assert.equal(bytes.readUInt32BE(16),m.w*m.frames);assert.equal(bytes.readUInt32BE(20),m.h);}
 assert.deepEqual(art.selectors.normal.map(s=>s.timeline),['center','middle','end','middle','end','middle','end','middle','end']);assert.equal(art.selectors.mine[0].timeline,'mine-center');
 assert.deepEqual(art.selectors.normal[3].matrix,[0,1,-1,0,30,0]);assert.deepEqual(art.selectors.normal[5].matrix,[0,1,1,0,0,0]);assert.deepEqual(art.selectors.normal[6].matrix,[0,-1,1,0,0,30]);assert.deepEqual(art.selectors.normal[7].matrix,[1,0,0,1,0,0]);assert.deepEqual(art.selectors.normal[8].matrix,[1,0,0,-1,0,30]);
 for(const kind of ['normal','mine'])for(let selector=1;selector<=9;selector++){const sprite=blasts.blastSprite(kind,selector,5);assert.equal(sprite.frame,5,'age selects the nested frame; direction selects its parent slot');}
 assert.equal(blasts.blastSprite('normal',4,100).frame,17,'nested clips stop at the last frame instead of looping directions');
});

test('one normal explosion records all nine source selectors with a common lifetime and native pixel origin',()=>{
 const s=world(),b=bomb(s,7,7);syncWalking(b);b.walking.x=216;b.walking.y=208;core.step(s,[]);
 const burst=s.blasts[0];assert.equal(s.bombs.length,0);assert.equal(burst.tiles.length,13);assert.deepEqual([burst.px,burst.py],[216,208]);assert.equal(burst.until,17);assert.equal(tile(burst,7,7).frame,1);
 for(const [dx,dy,mid,end]of [[0,-1,2,3],[1,0,4,5],[-1,0,6,7],[0,1,8,9]])for(let d=1;d<=3;d++){assert.equal(tile(burst,7+dx*d,7+dy*d).frame,d===3?end:mid);assert.equal(s.flames[core.index(7+dx*d,7+dy*d)],17);}
 assert(core.valid(s));const copy=structuredClone(s);for(let n=0;n<16;n++){core.step(s,[]);core.step(copy,[]);}assert.equal(s.blasts.length,0);assert.deepEqual(copy,s);
});

test('breakable boxes stop rays at their original middle segment; fixed walls receive no tile or flame',()=>{
 const s=world();s.board[core.index(7,5)]=2;s.board[core.index(7,4)]=2;s.board[core.index(9,7)]=1;bomb(s,7,7);core.step(s,[]);const b=s.blasts[0];
 assert.equal(s.board[core.index(7,5)],0);assert.equal(s.board[core.index(7,4)],2);assert.equal(tile(b,7,5).frame,2);assert.equal(tile(b,7,4),undefined);
 assert.equal(tile(b,8,7).frame,4);assert.equal(tile(b,9,7),undefined);assert.equal(s.flames[core.index(9,7)],0);assert.equal(s.flames[core.index(10,7)],0);assert(core.valid(s));
});

test('a registered bomb ends its parent ray and supplies its own independent chained centre and range',()=>{
 const s=world();bomb(s,5,5,5,1);bomb(s,6,5,1,2,'normal',600);core.step(s,[]);assert.equal(s.bombs.length,0);assert.equal(s.blasts.length,2);
 const parent=s.blasts.find(b=>b.owner===1),child=s.blasts.find(b=>b.owner===2);assert.equal(tile(parent,6,5),undefined);assert.equal(tile(parent,7,5),undefined);assert.equal(tile(child,6,5).frame,1);assert.equal(tile(child,7,5).frame,5);
 assert.equal(s.flames[core.index(8,5)],0,'the large parent ray must not continue beyond the chained bomb');assert.equal(s.owners[core.index(7,5)],2);assert(core.valid(s));
 const t=world();bomb(t,5,5,5,1);const moving=bomb(t,6,5,1,2,'normal',600);moving.slide=2;core.step(t,[]);assert.equal(t.blasts.length,1);assert(t.bombs.includes(moving));assert.equal(tile(t.blasts[0],8,5).frame,4,'unregistered flying bombs do not stop a ray');assert(core.valid(t));
});

test('burning normal centres stay solid until the source lifetime ends and do not accept new bombs',()=>{
 const s=world(),p=s.players[0];relocate(p,6,7);p.invulnerable=100;bomb(s,7,7,1,2);core.step(s,[]);assert(blasts.burningBombAt(s,7,7,true));
 for(let n=0;n<15;n++){core.step(s,[input(n+1,{right:true}),input()]);assert.equal(p.walking.x,180);}
 core.step(s,[input(17,{right:true}),input()]);assert(p.walking.x>180);assert.equal(blasts.burningBombAt(s,7,7),undefined);
 const t=world(),q=t.players[0];relocate(q,7,7);q.invulnerable=100;bomb(t,7,7,1,2);core.step(t,[]);core.step(t,[input(1,{attack:1}),input()]);assert.equal(t.bombs.length,0);assert(core.valid(t));
});

test('mine centre art supplies the diagonal flare, diagonals burn through crate corners and mines stay nonsolid',()=>{
 const s=world(),q=s.players[1];relocate(q,8,8);q.invulnerable=0;s.board[core.index(6,6)]=2;s.board[core.index(8,6)]=1;bomb(s,7,7,2,1,'mine');core.step(s,[]);const b=s.blasts[0];
 assert.equal(b.kind,'mine');assert.equal(b.tiles.length,9);assert.equal(tile(b,8,8),undefined,'diagonals belong to the wide centre animation');assert.equal(s.board[core.index(6,6)],0);assert.equal(s.board[core.index(8,6)],1);assert(s.flames[core.index(8,6)]>s.tick);assert.equal(q.deaths,1);
 assert(blasts.burningBombAt(s,7,7));assert.equal(blasts.burningBombAt(s,7,7,true),undefined);
 const p=s.players[0];relocate(p,6,7);p.invulnerable=100;core.step(s,[input(1,{right:true}),input()]);assert(p.walking.x>180);assert(core.valid(s));
});

test('mine diagonal chains and tram obstruction follow the original grid item rules',()=>{
 const s=world();bomb(s,7,7,2,1,'mine');bomb(s,8,8,1,2,'remote',600);core.step(s,[]);assert.equal(s.blasts.length,2);assert.equal(s.bombs.length,0);
 const t=core.create(1,true,[1,2],123,'mine-one');t.board.fill(0);t.tiles.fill(0);bomb(t,3,3,3);core.step(t,[]);assert.equal(tile(t.blasts[0],4,3),undefined);assert.equal(t.flames[core.index(5,3)],0);assert(core.valid(t));
});

test('burst validation rejects invalid direction frames, missing centre, expiry, owners and nonfinite registration',()=>{
 const s=world();bomb(s,7,7);core.step(s,[]);assert(core.valid(s));
 for(const mutate of [b=>b.px=NaN,b=>b.tiles[0].frame=0,b=>b.tiles.shift(),b=>b.until++,b=>b.owner=4,b=>b.tiles.push({...b.tiles[0]})]){const copy=structuredClone(s);mutate(copy.blasts[0]);assert.equal(core.valid(copy),false);}
});

test('a real launcher impact uses native capped flame segments without registering a stationary bomb centre',()=>{
 const s=world(),p=s.players[0];relocate(p,3,3);p.dir=2;p.weapon=16;p.ammo=1;s.board[core.index(6,3)]=2;
 for(let n=0;n<50&&!s.blasts.length;n++)core.step(s,[input(n+1,{attack:1}),input()]);
 assert.equal(s.blasts.length,1);const b=s.blasts[0];assert.equal(b.blocking,false);assert.equal(b.x,6);assert.equal(b.y,3);assert.equal(s.board[core.index(6,3)],0);
 assert.deepEqual(b.tiles.map(t=>t.frame).sort((a,b)=>a-b),[1,3,5,7,9]);assert.equal(blasts.burningBombAt(s,6,3),undefined);
 relocate(p,6,3);p.invulnerable=100;core.step(s,[input(100,{attack:2}),input()]);assert.equal(s.bombs.length,1);assert.equal(s.blasts.length,1,'residual fire does not dispatch a second blast event to a newly placed bomb');const due=s.bombs[0].explodeAt;
 while(s.tick<b.until)core.step(s,[]);assert.equal(s.bombs.length,1);assert.equal(s.bombs[0].explodeAt,due);assert.equal(s.blasts.length,0);assert(core.valid(s));
});
