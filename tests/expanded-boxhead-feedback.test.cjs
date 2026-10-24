'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),source=require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(name,module);m.paths=module.paths;m._compile(source,name);return m.exports;}
const a=load('../src/expanded/boxhead.ts').adapter,feedback=load('../src/expanded/boxhead-feedback.ts'),world=load('../src/expanded/boxhead-world.ts'),explosions=load('../src/expanded/boxhead-explosions.ts'),{nameAnchors}=load('../src/authority/nameplates.ts');
function arena(){const s=a.create(1,true,[1,2,3,4],17,'original-01');s.waveReady=0;s.spawnLeft=1;s.nextSpawn=1e9;s.barrels=[];s.pickups=[];s.players.forEach((p,i)=>{p.x=144+i*64;p.y=400;p.invul=100000;});return s;}

test('native explosion impulses use soft amplitude cap and alternating half-amplitude decay',()=>{
 const s=arena();s.brightness=0;feedback.explosionFeedback(s);feedback.explosionFeedback(s);feedback.explosionFeedback(s);assert.equal(s.shakeY,60);feedback.stepFeedback(s);assert.equal(s.shakeY,-30);
 const values=[];for(let i=0;i<10;i++){feedback.stepFeedback(s);values.push(s.shakeY);}assert.deepEqual(values,[15,-7.5,3.75,-1.875,.9375,-.46875,.234375,-.1171875,0,0]);
});

test('world initialization and explosions have native additive brightness sequence; new explosion refreshes it',()=>{
 assert.equal(a.create(1,false,[1,2],17).brightness,0,'lobby preview does not retain a frozen white initialization frame');
 const s=arena(),values=[];for(let i=0;i<5;i++){a.step(s,[]);values.push(s.brightness);}for(const [i,n]of [.8,.6,.4,.2,0].entries())assert(Math.abs(values[i]-n)<1e-12);
 explosions.queueExplosion(s,320,272,100,1);a.step(s,[]);assert.equal(s.brightness,.8);assert.equal(s.shakeY,-15);a.step(s,[]);assert(Math.abs(s.brightness-.6)<1e-12);assert.equal(s.shakeY,7.5);
 explosions.queueExplosion(s,320,272,100,1);a.step(s,[]);assert.equal(s.brightness,.8);assert.equal(s.shakeY,-18.75);assert(a.valid(s));
});

test('shared camera and all player nameplates follow the same original shake displacement',()=>{
 const s=arena(),before=world.camera(s),names=nameAnchors(s,1280,800);s.shakeY=-15;const after=world.camera(s),moved=nameAnchors(s,1280,800);assert.equal(after.x,before.x);assert.equal(after.scale,before.scale);assert(Math.abs(after.y-before.y-15*after.scale)<1e-10);
 for(let i=0;i<4;i++){assert.equal(moved[i].x,names[i].x);assert(Math.abs(moved[i].y-names[i].y-15*after.scale)<1e-10);}
});

test('render feedback uses additive RGB over the world viewport, saves state and does not fade the HUD',()=>{
 const events=[],c={save(){events.push('save');},restore(){events.push('restore');},fillRect(...args){events.push({args,mode:this.globalCompositeOperation,alpha:this.globalAlpha,fill:this.fillStyle});}};
 feedback.drawBrightness(c,.8,1280,800,84);assert.deepEqual(events,['save',{args:[0,84,1280,716],mode:'lighter',alpha:.8,fill:'#fff'},'restore']);events.length=0;feedback.drawBrightness(c,0,1280,800,84);assert.deepEqual(events,[]);
});

test('feedback survives a full recovery without restarting decay and invalid feedback is rejected',()=>{
 const s=arena();explosions.queueExplosion(s,320,272,100,1);a.step(s,[]);const copy=JSON.parse(JSON.stringify(s));for(let i=0;i<12;i++){a.step(s,[]);a.step(copy,[]);assert.deepEqual(s,copy);}
 for(const edit of [s=>s.shakeY=NaN,s=>s.shakeY=33,s=>s.brightness=Infinity,s=>s.brightness=-.2,s=>delete s.brightness]){const bad=arena();edit(bad);assert.equal(a.valid(bad),false);}
});
