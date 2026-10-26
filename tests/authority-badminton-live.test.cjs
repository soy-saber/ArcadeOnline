'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);return m.exports;}
const c=load('../src/badminton/core.ts'),motion=load('../src/badminton/motion.ts'),fixture=require('./fixtures/badminton-solo-live.json');
for(let run=0;run<8;run++)test('original live solo run'+run+' matches player/CPU/ball/particles, cached angles and the shared random stream',()=>{
 const samples=new Map(fixture.samples.filter(s=>s.run===run).map(s=>[s.heroCalls,s])),first=[...samples.values()][0],state=c.createGame(42,true,first.type);state.level=first.level;let hit=0,previous=false;assert(samples.size>=15);
 const eq=(a,b,label,tick)=>{if(typeof a==='number'&&typeof b==='number')assert(Math.abs(a-b)<1e-8,run+':'+tick+' '+label+' '+a+' != '+b);else assert.deepEqual(a,b,run+':'+tick+' '+label);};
 for(let tick=1;tick<=60;tick++){
  const input=fixture.inputs.find(r=>r.run===run&&r.tick===tick);assert(input);const held=first.type==='robot'?input.mouse:input.held;if(held&&!previous)hit++;previous=held;
  c.step(state,[{...c.EMPTY_INPUT,seq:tick,hit,hitHeld:held,pointerX:input.x,pointerY:input.y},c.EMPTY_INPUT]);const n=samples.get(tick);if(!n)continue;
  eq(state.rng,n.rng,'rng',tick);eq(state.serve,n.serve,'serve',tick);eq(state.score,n.score,'score',tick);eq(state.nextParticle,n.nextParticle,'nextParticle',tick);
  for(let i=0;i<2;i++){const p=state.players[i],a=n[i?'p2':'p1'];for(const key of ['x','y','vy','jumping'])eq(p[key],a[key],'p'+i+'.'+key,tick);for(const [key,nkey]of [['frame','gun'],['serveFrame','service'],['ready','ready'],['active','active'],['angle','angle']])eq(p.racket[key],a[nkey],'p'+i+'.'+key,tick);eq(motion.bodyPose(i+1,p,tick,c.actorKey(state,i+1)).frame,a.body,'body'+i,tick);}
  for(const key of ['serveReady','numVar2','swingVar','swingVar2','chance3'])eq(state.cpu[key],n[key]??null,'cpu.'+key,tick);eq(state.chance1,n.chance1??null,'chance1',tick);
  if(n.ball)for(const key of ['x','y','vx','vy','rotation','speed','contactBy','born'])eq(state.birdie[key],n.ball[key],'ball.'+key,tick);
  eq(state.particles.length,n.particles.length,'particles.length',tick);for(const p of state.particles){const a=n.particles.find(a=>a.id===p.id&&a.kind===p.kind);assert(a,'missing '+p.kind+':'+p.id);for(const key of ['x','y','vx','vy','rotation','scale','width'])eq(p[key],a[key],'particle'+p.id+'.'+key,tick);}
  eq(state.net.frame,n.netFrame,'netFrame',tick);eq(state.net.hits,n.netHits,'netHits',tick);eq(state.hits,n.hits,'hits',tick);assert(c.validState(state));
 }
});
