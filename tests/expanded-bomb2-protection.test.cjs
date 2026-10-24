'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto'),Module=require('module'),{PNG}=require('pngjs');
function load(file){const code=require('esbuild').buildSync({entryPoints:[path.resolve(__dirname,file)],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;const m=new Module(file,module);m.paths=module.paths;m._compile(code,file);return m.exports;}
const core=load('../src/expanded/bomb2.ts'),protection=load('../src/expanded/bomb2-protection.ts'),gradient=load('../src/expanded/bomb2-gradient.ts'),movement=load('../src/expanded/bomb2-movement.ts'),land=load('../src/expanded/bomb2-landforms.ts'),names=load('../src/authority/nameplates.ts'),protocol=load('../src/authority/protocol.ts');
const art=require('../src/expanded/bomb2-protection-art.json'),root=path.resolve(__dirname,'..');
const input=(extra={})=>({seq:0,left:false,right:false,up:false,down:false,attack:0,alt:0,...extra});
function world(map='mine-one',mode='kill'){
 const s=core.create(1,true,[1,2],123,map,mode);s.board.fill(0);s.tiles.fill(0);s.items.fill(0);
 for(const p of s.players){protection.clearProtection(p);movement.relocate(p,p.seat===1?7:11,7);}
 return s;
}
function tick(s,extra={}){core.step(s,[input(extra),input()]);}
function wait(s,n,extra={}){for(let i=0;i<n;i++)tick(s,extra);}
function pickup(s,kind){const p=s.players[0];s.items[core.index(p.x,p.y)]=kind;tick(s);return p;}
function fire(s,p,owner=2,duration=2){const cell=core.index(p.x,p.y);s.flames[cell]=s.tick+duration;s.owners[cell]=owner;}
function activated(){const s=world(),p=pickup(s,7);wait(s,29);assert.equal(p.aura.phase,'active');return {s,p};}

test('18 native robot, belly-armour and power-intro sheets retain authored pixels, registration and source filter parameters',()=>{
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,art.source))).digest('hex'),art.sha256);
 assert.equal(Object.keys(art.timelines).length,18);
 for(const [name,m]of Object.entries(art.timelines)){
  const data=fs.readFileSync(path.join(root,m.path)),png=PNG.sync.read(data);
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'),m.sha256,name);assert.equal(png.width,m.w*m.frames);assert.equal(png.height,m.h);assert.equal(m.bounds.length,m.frames);
  for(let frame=0;frame<m.frames;frame++){
   let left=m.w,top=m.h,right=0,bottom=0;
   for(let y=0;y<m.h;y++)for(let x=0;x<m.w;x++)if(png.data[(y*png.width+frame*m.w+x)*4+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
   assert.deepEqual(m.bounds[frame],right?[left,top,right,bottom]:null);
  }
 }
 assert.deepEqual([art.timelines.shield.w,art.timelines.shield.h,art.timelines.shield.frames,art.timelines.shield.x,art.timelines.shield.y],[12,17,1,9.3,6.35]);
 assert.equal(art.timelines['invincibility-intro'].frames,30);
 assert.deepEqual(art.rules.filter,{distance:-20,angle:60,blurX:18,blurY:18,strength:1,quality:'HIGH',type:'INNER',knockout:false});
 assert.equal(art.rules.colors.length,13);assert.deepEqual(art.rules.ratios,Array.from({length:13},(_,i)=>i*20));
 const manifest=require('../public/expanded/assets/bomb2/manifest.json');assert.deepEqual(manifest.protectionTimelines,art);
});

test('source spawn and one-use shield protection lasts through counter 81 and ends on callback 82; only body alpha flashes',()=>{
 const s=core.create(1,true,[1,2],8,'mine-one','kill'),p=s.players[0];s.board.fill(0);s.items.fill(0);
 assert.equal(p.invulnerable,82);assert.equal(protection.bodyAlpha(p),1);
 tick(s);assert.equal(protection.bodyAlpha(p),1);tick(s);assert(Math.abs(protection.bodyAlpha(p)-.6)<1e-9);
 tick(s);assert(Math.abs(protection.bodyAlpha(p)-.6)<1e-9);tick(s);assert.equal(protection.bodyAlpha(p),1);
 wait(s,77);assert.equal(p.invulnerable,1);assert(p.guard);tick(s);assert.equal(p.invulnerable,0);assert.equal(p.guard,null);assert.equal(protection.bodyAlpha(p),1);
 pickup(s,22);assert(protection.shieldVisible(p));fire(s,p);tick(s);assert.equal(p.deaths,0);assert.equal(p.shield,false);assert.equal(p.invulnerable,82);
 fire(s,p,2,100);wait(s,82);assert.equal(p.deaths,0);assert.equal(p.invulnerable,0);tick(s);assert.equal(p.deaths,1);
});

test('native normal animation holds the last pose on release, resets on direction changes and fades only its movie clip',()=>{
 const s=world(),p=s.players[0];wait(s,7,{right:true});const moving=protection.nativeHero(p,s.tick);assert(moving.frame>0);assert(moving.frame<24);
 wait(s,6);assert.equal(protection.nativeHero(p,s.tick).frame,moving.frame);
 protection.beginProtection(s,p);wait(s,2);assert(Math.abs(protection.bodyAlpha(p)-.6)<1e-9);
 tick(s,{up:true});assert.equal(protection.nativeHero(p,s.tick).frame,0);assert.equal(protection.bodyAlpha(p),1);
 pickup(s,22);assert.equal(protection.nativeHero(p,s.tick).frame,0);assert.equal(p.shield,true);
 p.vehicle=13;assert(!protection.shieldVisible(p));p.vehicle=0;p.travel={kind:'spring'};assert(!protection.shieldVisible(p));p.travel=null;assert(protection.shieldVisible(p));
});

test('the 30-frame native intro grants no early immunity; the finished power kills by same-cell registration',()=>{
 const s=world(),p=pickup(s,7),q=s.players[1],born=s.tick;assert.equal(p.invulnerable,0);assert.equal(p.aura.frame,0);
 wait(s,28);assert.equal(p.aura.phase,'intro');assert.equal(p.aura.frame,28);assert.equal(p.invulnerable,0);
 tick(s);assert.equal(s.tick-born,29);assert.equal(p.aura.phase,'active');assert.equal(p.invulnerable,402);assert.equal(p.aura.glow,null);
 fire(s,p);tick(s);assert.equal(p.deaths,0);assert.deepEqual(p.aura.glow,{color:0,offset:-20});s.flames.fill(0);
 movement.relocate(q,p.x,p.y);tick(s);assert.equal(q.deaths,1);assert.equal(p.points,1);assert.equal(p.kills,1);assert.deepEqual(p.aura.glow,{color:1,offset:0});tick(s);assert.equal(p.points,1);
 const vulnerable=world(),r=pickup(vulnerable,7);fire(vulnerable,r);tick(vulnerable);assert.equal(r.deaths,1);assert.equal(r.aura,null);assert.equal(r.guard,null);
});

test('power contact spends a shield or vehicle without a kill point and ignores protected/fading targets',()=>{
 for(const defense of ['shield','guard','sand']){
  const {s,p}=activated(),q=s.players[1];movement.relocate(q,p.x,p.y);
  if(defense==='shield')q.shield=true;
  if(defense==='guard')protection.beginProtection(s,q);
  if(defense==='sand')q.travel={kind:'sand',born:s.tick,source:0,target:1,alpha:.8};
  const hits=[];s.tick++;protection.advanceProtections(s,(victim,owner)=>hits.push([victim.seat,owner]));
  if(defense==='sand')assert.deepEqual(hits,[]);else assert.deepEqual(hits,[[2,1]]);
  if(defense==='shield'){tick(s);assert(!q.shield);assert.equal(q.deaths,0);assert.equal(p.points,0);}
  if(defense==='guard'){tick(s);assert.equal(q.deaths,0);assert.equal(p.points,0);}
 }
 const {s,p}=activated(),q=s.players[1];s.items[core.index(q.x,q.y)]=13;tick(s);assert.equal(q.vehicle,13);movement.relocate(q,p.x,p.y);tick(s);assert.equal(q.rideMotion.kind,'wreck');assert.equal(q.deaths,0);assert.equal(p.points,0);
});

test('power lasts 401 contact updates before terminal callback 402 and never invents a kill after expiry',()=>{
 const {s,p}=activated();wait(s,400);assert.equal(p.aura.age,400);assert.equal(p.invulnerable,2);tick(s);assert.equal(p.aura.age,401);assert.equal(p.invulnerable,1);
 const q=s.players[1];movement.relocate(q,p.x,p.y);tick(s);assert.equal(p.aura,null);assert.equal(p.invulnerable,0);assert.equal(q.deaths,0);
 fire(s,p);tick(s);assert.equal(p.deaths,1);
});

test('picking another power during its intro rewinds it without repeating the invincibility cue; active colors persist until refreshed',()=>{
 const s=world(),p=pickup(s,7);wait(s,15);pickup(s,7);assert.equal(p.aura.frame,0);assert.equal(s.sounds.filter(e=>e.name==='invincible').length,1);
 wait(s,29);wait(s,7);const glow=structuredClone(p.aura.glow);pickup(s,7);assert.equal(p.aura.phase,'intro');assert.deepEqual(p.aura.glow,glow);assert(p.invulnerable>0);assert.equal(s.sounds.filter(e=>e.name==='invincible').length,2);
 wait(s,20);assert.deepEqual(p.aura.glow,glow);wait(s,9);assert.equal(p.aura.age,0);assert.equal(p.invulnerable,402);tick(s);assert.equal(p.aura.age,1);
 // A new source InvincibilityProp has a new palette and offset counter.
 assert.deepEqual(p.aura.glow,{color:0,offset:-20});
});

test('quicksand suspends active power time/color/contact, restores it at exit, and lets a first intro finish while fading',()=>{
 const {s,p}=activated();s.mapId='beach-one';s.theme='beach';s.hazards=core.create(1,true,[1,2],123,'beach-one','kill').hazards;s.sandLights=s.hazards.map(()=>0);
 wait(s,3);const before=structuredClone(p.aura);const sand=s.hazards.find(h=>h.kind==='QuickSand');movement.relocate(p,sand.x,sand.y);tick(s);assert.equal(p.travel.kind,'sand');assert(p.aura.paused);assert.equal(p.aura.age,before.age);assert.deepEqual(p.aura.glow,before.glow);
 const age=p.aura.age,remaining=p.invulnerable;while(p.travel){tick(s);if(p.travel){assert.equal(p.aura.age,age);assert.equal(p.invulnerable,remaining);}}
 assert.equal(p.aura.age,age+1);assert.equal(p.aura.paused,false);assert(core.valid(s));
 const t=world('beach-one'),r=pickup(t,7);wait(t,26);const hole=t.hazards.find(h=>h.kind==='QuickSand');movement.relocate(r,hole.x,hole.y);tick(t);assert.equal(r.travel.kind,'sand');wait(t,3);assert.equal(r.aura.phase,'active');assert.equal(r.aura.paused,false);assert(r.aura.age>0);
});

test('the source shared ifBurst flag lets a short guard expire before a colored power, instead of combining independent immunity',()=>{
 const s=world(),p=s.players[0];protection.beginProtection(s,p);wait(s,60);pickup(s,7);wait(s,29);assert.equal(p.guard,null);assert.equal(p.invulnerable,402);
 const t=world(),q=t.players[0];protection.beginProtection(t,q);wait(t,10);pickup(t,7);wait(t,29);assert(q.aura);wait(t,41);assert(q.guard);tick(t);assert.equal(q.guard,null);assert(q.aura);assert.equal(q.invulnerable,0);fire(t,q);tick(t);assert.equal(q.deaths,1);
 const u=world(),r=u.players[0];protection.beginProtection(u,r);wait(u,10);pickup(u,7);wait(u,29+380);assert(r.aura);assert.equal(r.invulnerable,0);pickup(u,22);fire(u,r);tick(u);assert(r.guard);assert.equal(r.deaths,0);while(r.aura)tick(u);assert(r.guard);assert.equal(r.invulnerable,0);fire(u,r);tick(u);assert.equal(r.deaths,1);
});

test('protection, animation and intro-head snapshots recover deterministically and reject invalid state',()=>{
 const s=world(),p=pickup(s,7);wait(s,8,{right:true});const baseline=structuredClone(s),a=names.nameAnchors(s,core.adapter.width,550).find(n=>n.seat===1);
 assert(a.y<=66+p.walking.y+protection.protectionHead(p)-16);assert(core.valid(s));
 wait(s,5,{up:true});assert.notDeepEqual(s,baseline);
 const recovered=protocol.applyUpdate(baseline,protocol.createUpdate(baseline,s,500));assert.deepEqual(recovered,s);
 const again=structuredClone(s);for(let n=0;n<90;n++){tick(s);tick(again);}assert.deepEqual(again,s);
 for(const mutate of [p=>p.guard={born:-1,age:0,alpha:1,clip:'bad'},p=>p.aura.frame=29,p=>p.aura.glow={color:13,offset:0},p=>p.aura.born=NaN,p=>p.heroAnim.frame=24,p=>p.heroAnim.at=1e9]){const bad=structuredClone(baseline);mutate(bad.players[0]);assert(!core.valid(bad));}
 const {s:t,p:q}=activated();protection.clearProtection(q);fire(t,q);tick(t);assert.equal(q.aura,null);assert.equal(q.heroAnim,null);const respawn=q.respawnAt;while(t.tick<respawn)tick(t);assert(q.guard);assert.equal(q.aura,null);assert(core.valid(t));
});

test('the separable blur agrees with direct convolution including transparent edges; the inner gradient preserves native silhouette alpha',()=>{
 const input=Float32Array.from({length:13*11},(_,i)=>(i*41)%256);
 for(const horizontal of [false,true])for(const width of [1,2,5,18]){
  const actual=gradient.blurAxis(input,13,11,horizontal,width),r=(width-1)/2,whole=Math.floor(r),edge=r-whole;
  for(let y=0;y<11;y++)for(let x=0;x<13;x++){
   let sum=0;for(let k=-whole-1;k<=whole+1;k++){const sx=x+(horizontal?k:0),sy=y+(horizontal?0:k),weight=Math.abs(k)>whole?edge:1;if(sx>=0&&sx<13&&sy>=0&&sy<11)sum+=input[sy*13+sx]*weight;}
   assert.equal(actual[y*13+x],Math.floor(sum/width+1e-7));
  }
 }
 const lut=gradient.gradient({color:0,offset:0});assert.deepEqual([...lut.slice(0,3)],[255,0,0]);assert.deepEqual([...lut.slice(40*3,40*3+3)],[255,255,0]);assert.deepEqual([...lut.slice(255*3)],[255,0,0]);
 const shifted=gradient.gradient({color:0,offset:-20});assert.deepEqual([...shifted.slice(0,3)],[255,127,0]);
 for(const meta of [art.timelines['hero-3-right'],require('../src/expanded/bomb2-landform-art.json').timelines['jump-3-right'],require('../src/expanded/bomb2-vehicle-art.json').timelines['vehicle-3-car-right']]){
  const png=PNG.sync.read(fs.readFileSync(path.join(root,meta.path))),rgba=new Uint8ClampedArray(meta.w*meta.h*4);
  for(let y=0;y<meta.h;y++)rgba.set(png.data.subarray(y*png.width*4,(y*png.width+meta.w)*4),y*meta.w*4);
  const mask=gradient.glowMask(rgba,meta.w,meta.h),tint=gradient.tint(rgba,mask,{color:3,offset:-20});let changed=0;
  for(let i=0;i<meta.w*meta.h;i++){assert.equal(tint[i*4+3],rgba[i*4+3]);if(!rgba[i*4+3])assert.deepEqual([...tint.slice(i*4,i*4+4)],[...rgba.slice(i*4,i*4+4)]);else if(tint[i*4]!==rgba[i*4]||tint[i*4+1]!==rgba[i*4+1]||tint[i*4+2]!==rgba[i*4+2])changed++;}
  assert(changed>100);
 }
});
