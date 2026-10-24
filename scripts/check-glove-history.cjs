'use strict';
const fs=require('node:fs'),path=require('node:path'),posix=path.posix,cp=require('node:child_process'),Module=require('node:module'),esbuild=require('esbuild'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function historicalCore(rev,entry){
 const files=new Set(cp.execFileSync('git',['ls-tree','-r','--name-only',rev],{cwd:root,encoding:'utf8'}).trim().split('\n'));
 const result=await esbuild.build({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'historical-sources',setup(build){
  build.onResolve({filter:/.*/},args=>{const base=posix.normalize(args.kind==='entry-point'?args.path:posix.join(posix.dirname(args.importer),args.path));const file=[base,base+'.ts',base+'.json'].find(p=>files.has(p));if(!file)throw Error('Missing historical dependency '+base);return{path:file,namespace:'history'};});
  build.onLoad({filter:/.*/,namespace:'history'},args=>({contents:cp.execFileSync('git',['show',rev+':'+args.path],{cwd:root,encoding:'utf8'}),loader:args.path.endsWith('.json')?'json':'ts'}));
 }}]});
 const filename=path.join(root,'artifacts/history-'+rev.replace(/[^a-z0-9]/gi,'_')+'.cjs'),m=new Module(filename,module);m.paths=module.paths;m._compile(result.outputFiles[0].text,filename);return m.exports;
}
(async()=>{
 const results=[];
 for(const [rev,file]of [['ae671a4','src/native/core.ts'],['5acf9fd','src/native/core.ts'],['0fc6390','src/authority/bomb-core.ts'],['99dc8a8^','src/authority/bomb-core.ts'],['99dc8a8','src/authority/bomb-core.ts'],['HEAD','src/authority/bomb-core.ts']]){
  const core=await historicalCore(rev,file),s=core.createGame(123,100,true,{mode:file==='src/native/core.ts'?'duel':'online',activeSeats:[1,2]});s.board.fill(0);s.players.forEach((p,i)=>{p.invulnerable=0;if(i>1)p.alive=false;});
  const [p,q]=s.players;Object.assign(p,{x:3,y:3,push:true});Object.assign(q,{x:5,y:4,push:true});s.bombs=[{id:s.nextBomb++,x:4,y:3,owner:1,range:1,explodeAt:600}];
  const input=dir=>({seq:1,dir,bomb:0,special:0});core.step(s,[input(2),input(1),core.EMPTY_INPUT,core.EMPTY_INPUT]);
  const b=s.bombs[0],row={rev,commit:cp.execFileSync('git',['rev-parse',rev],{cwd:root,encoding:'utf8'}).trim(),entry:file,tick:s.tick,bomb:{x:b.x,y:b.y,slide:b.slide,slideTick:b.slideTick},secondPlayerCooldown:q.pushCooldown??null,pushSounds:s.sounds?.filter(e=>e.name==='push').length??null};
  const fixed=rev==='99dc8a8'||rev==='HEAD';assert.deepEqual([b.x,b.y,b.slide],fixed?[5,3,2]:[5,2,1]);results.push(row);
 }
 const output={at:new Date().toISOString(),scenario:'One authoritative tick: P1 at (3,3) pushes the bomb at (4,3) right; P2 at (5,4) simultaneously attempts to push that bomb up. All code dependencies loaded from the corresponding Git revision.',results};
 fs.writeFileSync(path.join(root,'artifacts/glove-history-audit.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
