'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),Module=require('node:module'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
function load(name){const file=path.resolve(__dirname,'../src/'+name+'.ts'),m=new Module(file,module);m.paths=module.paths;m._compile(esbuild.buildSync({entryPoints:[file],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,file);return m.exports;}
const core=load('expanded/bomb2'),land=load('expanded/bomb2-landforms'),{relocate}=load('expanded/bomb2-movement'),{nameAnchors}=load('authority/nameplates'),{Presentation}=load('authority/presentation'),ART=require('../src/expanded/bomb2-landform-art.json');
const neutral=(seq=0,extra={})=>({seq,left:false,right:false,up:false,down:false,attack:0,alt:0,...extra});
function world(map='disce-one',mode='arcade'){const s=core.create(1,true,[1,2],31,map,mode);s.board.fill(0);s.tiles.fill(0);s.items.fill(0);return s;}
function springWorld(dir=2){const s=world(),p=s.players[0],h=s.hazards.find(h=>h.kind==='SpringBoard');relocate(p,h.x,h.y);p.dir=dir;return {s,p,h};}
function sandWorld(seat=0){const s=world('beach-one'),p=s.players[seat],source=s.hazards.findIndex(h=>h.kind==='QuickSand'),h=s.hazards[source],target=s.hazards[h.target];relocate(p,h.x,h.y);return {s,p,h,source,target};}
function tick(s,first=neutral(),second=neutral()){core.step(s,[first,second]);}

test('all sixteen original jump poses, independent sand bases and lights retain frames, registration and verified pixels',()=>{
 const digest=b=>crypto.createHash('sha256').update(b).digest('hex');assert.equal(digest(fs.readFileSync(path.resolve(__dirname,'../games/9109/game.swf'))),ART.sha256);
 assert.equal(ART.sha256,'788c15ad1661e576cd004688785175ef62c2e0ef211db0fe83b5475625262ae1');assert.equal(Object.keys(ART.timelines).length,20);
 for(let c=0;c<4;c++)for(const d of ['left','up','right','down'])assert.equal(ART.timelines[`jump-${c}-${d}`].frames,26);
 for(const type of [1,2]){assert.equal(ART.timelines['sand-base-'+type].frames,90);assert.equal(ART.timelines['sand-light-'+type].frames,18);assert.equal(ART.timelines['sand-base-'+type].h,39);assert.equal(ART.timelines['sand-light-'+type].h,75);}
 for(const meta of Object.values(ART.timelines)){const bytes=fs.readFileSync(path.resolve(__dirname,'..',meta.path));assert.equal(digest(bytes),meta.sha256);assert.equal(bytes.readUInt32BE(16),meta.w*meta.frames);assert.equal(bytes.readUInt32BE(20),meta.h);assert.equal(meta.bounds.length,meta.frames);}
 assert.deepEqual(ART.rules,{springSpeed:5,springWaitFrames:4,springCells:2,sandAlphaStep:.05,sandTransferAlpha:.5,lightFrames:18,sandLoopStart:2,sandLoopEnd:89});
 assert.deepEqual([0,1,88,89,90].map(land.sandFrame),[0,1,88,1,2]);assert.notEqual(ART.analysisCopySha256,ART.payloadSha256);
});

test('spring starts with four source frames of preparation, then moves five pixels per tick to the two-cell target',()=>{
 const {s,p,h}=springWorld();tick(s);assert.equal(p.travel.kind,'spring');const born=s.tick,x=p.walking.x;
 for(let age=1;age<4;age++){tick(s);assert.equal(p.walking.x,x);assert.equal(s.tick-born,age);assert(core.valid(s));}
 tick(s);assert.equal(p.walking.x,x+5);assert.equal(p.x,h.x);
 for(let n=0;n<30&&p.travel;n++)tick(s);assert.equal(p.travel,null);assert.equal(p.walking.x,(h.x+2)*30);assert.equal(p.x,h.x+2);assert.equal(p.teleportUntil,0);assert(core.valid(s));
});

test('all four spring directions cross obstructions, align the perpendicular offset and retain the full original target',()=>{
 const dirs=[[-1,0],[0,-1],[1,0],[0,1]];
 for(let dir=0;dir<4;dir++){
  const {s,p,h}=springWorld(dir),[dx,dy]=dirs[dir];if(dx)p.walking.y+=10;else p.walking.x-=10;
  s.board[core.index(h.x+dx,h.y+dy)]=1;s.board[core.index(h.x+dx*2,h.y+dy*2)]=2;tick(s);
  for(let n=0;n<30&&p.travel;n++)tick(s);
  assert.equal(p.x,h.x+dx*2);assert.equal(p.y,h.y+dy*2);assert(Math.abs(p.walking.x-p.x*30)<=1);assert(Math.abs(p.walking.y-p.y*30)<=1);assert.equal(s.board[core.index(p.x,p.y)],2,'the original target is not shortened to avoid a blocked landing');assert(core.valid(s));
 }
});

test('airborne actors neither pick up intermediate items nor replay attack counters issued during the jump',()=>{
 const {s,p,h}=springWorld();p.weapon=19;p.ammo=2;s.items[core.index(h.x+1,h.y)]=2;s.items[core.index(h.x+2,h.y)]=1;tick(s);
 let attack=0;for(let n=0;n<30&&p.travel;n++){tick(s,neutral(n+1,{attack:++attack,alt:attack,up:true}));assert.equal(p.ammo,2);assert.equal(p.dir,2);assert.equal(s.shots.length,0);}
 assert.equal(s.items[core.index(h.x+1,h.y)],2);assert.equal(p.range,1);assert.equal(p.capacity,1);assert.equal(p.lastAttack,attack);assert.equal(p.lastAlt,attack);
 tick(s,neutral(100,{attack,alt:attack}));assert.equal(p.capacity,2);assert.equal(s.shots.length,0);assert.equal(p.ammo,2);
 tick(s,neutral(101,{attack:attack+1,alt:attack}));assert.equal(p.ammo,1);assert(p.attack);assert(core.valid(s));
});

test('spring travel preserves vulnerability and is cancelled by a real flame hit, rather than granting jump immunity',()=>{
 const {s,p,h}=springWorld();p.invulnerable=0;s.flames[core.index(h.x+1,h.y)]=100;s.owners[core.index(h.x+1,h.y)]=2;tick(s);
 for(let n=0;n<30&&!p.deaths;n++)tick(s);assert.equal(p.deaths,1);assert.equal(p.travel,null);assert.equal(p.sandCell,-1);assert(p.respawnAt>s.tick);assert(core.valid(s));
});

test('quicksand fades by 0.05, opens the paired exit, transfers after the strict half-alpha boundary and latches the exit',()=>{
 const {s,p,h,source,target}=sandWorld();tick(s);const born=s.tick;assert.equal(p.travel.kind,'sand');assert.equal(p.travel.alpha,.95);assert.equal(s.sandLights[h.target],born);
 for(let n=1;n<10;n++){tick(s,neutral(n,{attack:n,alt:n,right:true}));assert.equal(p.x,h.x);assert.equal(p.y,h.y);assert.equal(p.travel.kind,'sand');assert(core.valid(s));}
 assert(p.travel.alpha<.5);tick(s,neutral(10,{attack:10,alt:10,right:true}));assert.equal(p.travel,null);assert.equal(s.tick-born,10);assert.equal(p.x,target.x);assert.equal(p.y,target.y);assert.equal(p.dir,3);assert.equal(p.sandCell,target.y*17+target.x);assert.equal(p.lastAttack,10);assert.equal(s.bombs.length,0);
 for(let n=0;n<100;n++)tick(s);assert.equal(p.travel,null);assert.equal(p.x,target.x);assert.equal(p.y,target.y);assert.equal(s.sandLights[h.target],0);assert.equal(source,s.hazards.findIndex(q=>q===h));assert(core.valid(s));
});

test('quicksand re-enters only after leaving its cell, carries vehicles, and does not invent a blocked-exit rejection',()=>{
 for(const vehicle of [0,12,13,14]){
  const {s,p,target}=sandWorld();p.vehicle=vehicle;s.board[core.index(target.x,target.y)]=1;tick(s);
  for(let n=0;n<12&&p.travel;n++)tick(s);assert.equal(p.vehicle,vehicle);assert.equal(p.x,target.x);assert.equal(p.y,target.y);assert.equal(p.travel,null);
  relocate(p,target.x-1,target.y);tick(s);assert.equal(p.sandCell,-1);relocate(p,target.x,target.y);tick(s);assert.equal(p.travel.kind,'sand');assert(core.valid(s));
 }
 const {s,p}=sandWorld();p.vehicle=11;tick(s);assert.equal(p.travel,null);assert.equal(s.sandLights.filter(Boolean).length,0);assert(core.valid(s));
});

test('a fading robot is absent from mine grid sensing, while a stationary robot still activates landforms',()=>{
 const {s,p,h}=sandWorld();tick(s);p.invulnerable=0;s.bombs.push({id:s.nextId++,x:h.x,y:h.y,owner:2,range:2,kind:'mine',explodeAt:core.ROUND_TICKS+core.FUSE,armedAt:0,slide:-1});
 for(let n=0;n<9;n++){tick(s);assert.equal(s.bombs.length,1);assert.equal(p.deaths,0);}tick(s);assert.equal(p.travel,null);assert.equal(s.bombs.length,1);assert(core.valid(s));
});

test('jumping paints traversed ground under obstacles in territory mode, but spring and sand cells stay unpaintable',()=>{
 const {s,p,h}=(()=>{const s=world('disce-one','color'),p=s.players[0],h=s.hazards.find(h=>h.kind==='SpringBoard');relocate(p,h.x,h.y);p.dir=2;return {s,p,h};})();s.board[core.index(h.x+1,h.y)]=1;tick(s);
 for(let n=0;n<30&&p.travel;n++)tick(s);assert.equal(s.colors[core.index(h.x,h.y)],0);assert.equal(s.colors[core.index(h.x+1,h.y)],1);assert.equal(s.colors[core.index(h.x+2,h.y)],1);assert(core.valid(s));
});

test('remote fade interpolation and names follow alpha; airborne name placement stays above the original animated head',()=>{
 const {s,p}=sandWorld(1);for(let n=0;n<4;n++)tick(s);const presentation=new Presentation(()=>{}),a=structuredClone(s),alphaA=p.travel.alpha;presentation.receive(a,1000,1);
 for(let n=0;n<4;n++)tick(s);const alphaB=p.travel.alpha;presentation.receive(structuredClone(s),1100,100);const frame=presentation.render(140,1140,1,null,40);
 assert(Math.abs(frame.players[1].travel.alpha-(alphaA+alphaB)/2)<1e-9);assert.equal(nameAnchors(frame,760,550)[1].alpha,frame.players[1].travel.alpha);
 const j=springWorld();j.p.weapon=19;j.p.ammo=2;for(let n=0;n<10;n++)tick(j.s);const sprite=land.jumpSprite(j.p,j.s.tick),anchor=nameAnchors(j.s,760,550)[0],head=66+j.p.walking.y+sprite.meta.y+sprite.meta.bounds[sprite.frame][1];assert.equal(anchor.y,head-35);
});

test('travel state and exit-light timestamps reject malformed, nonfinite or impossible snapshots and recover deterministically',()=>{
 const {s,p}=springWorld();tick(s);const copy=structuredClone(s);for(let n=0;n<25;n++){tick(s);tick(copy);}assert.deepEqual(copy,s);
 for(const mutate of [x=>x.sandLights=null,x=>x.sandLights[0]=x.tick+1,x=>x.players[0].sandCell=255,x=>x.players[0].travel={kind:'spring',born:0,dir:2,targetX:9,targetY:9,stepX:0,stepY:5},x=>x.hazards=null]){const broken=structuredClone(s);mutate(broken);assert.equal(core.valid(broken),false);}
 const sand=sandWorld();tick(sand.s);const bad=structuredClone(sand.s);bad.players[0].travel.alpha=NaN;assert.equal(core.valid(bad),false);assert(p.travel===null);
});
