'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),fs=require('node:fs'),crypto=require('node:crypto');
function load(file){const name=path.resolve(__dirname,file),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);return m.exports;}
const {adapter:a}=load('../src/expanded/brawler.ts'),{validInput}=load('../src/expanded/types.ts'),data=require('../src/expanded/brawler-data.json');
const input=(patch={})=>({seq:1,left:false,right:false,up:false,down:false,attack:0,alt:0,...patch});
test('native player markers are distinct from item regions; sparse seats use player ordinal and stock matches have no invented time cap',()=>{
 const s=a.create(1,true,[2,4],42);assert.equal(a.hz,40);assert.deepEqual(s.players.map(p=>[p.x,p.y]),[[528.65,152.5],[585.3,152.5]]);assert.notDeepEqual(s.players.map(p=>[p.x,p.y]),data.stages[0].itemSpawns.slice(0,2).map(p=>[p.x,p.y]));s.tick=40*300;a.step(s,[]);assert.equal(s.phase,'playing');
});
test('short original up/special and up-release actions survive sampled network input and cancel/expiry prevents replay',()=>{
 const s=a.create(1,true,[1,4],42);for(let n=0;n<3;n++)a.step(s,[]);const p=s.players[0];a.step(s,[input({alt:1,upperAlt:1,jump:1})]);assert.equal(p.attack,'specialUp');assert.equal(p.lastJump,1);assert.equal(p.jumps,0);assert(a.valid(s));
 const q=a.create(1,true,[1,4],42);a.step(q,[input({attack:1,alt:1,jump:1,cancelledAttack:1,cancelledAlt:1,cancelledJump:1})]);assert.equal(q.players[0].attack,'');assert.equal(q.players[0].jumps,0);a.consumeInput(q,1,input({attack:3,alt:4,jump:5}));a.step(q,[input({attack:3,alt:4,jump:5})]);assert.equal(q.players[0].attack,'');assert.equal(q.players[0].jumps,0);
});
test('input and state validation reject forged animation, item, shot and event structures without throwing',()=>{
 for(const patch of [{shield:1},{upperAlt:NaN},{jump:-1},{cancelledJump:1e9},{upperAttack:'1'}])assert.equal(validInput(input(patch)),false);
 const base=a.create(1,true,[1,4],42);for(const edit of [s=>s.players[0].animation.pose='toString',s=>s.players[0].animation.frame=900,s=>s.players[0].hitAnimation=null,s=>s.players[0].hasControl=1,s=>s.items=[{name:'toString'}],s=>s.shots=[{name:'fake'}],s=>s.explosions=[{x:1,y:1,size:3,age:0,parts:[null],influenced:[]}],s=>s.sounds=[{id:1,tick:0,action:'play',name:'toString',variant:0}]]){const s=structuredClone(base);edit(s);assert.equal(a.valid(s),false);}
});
test('server input expiry releases guard and consumes Up without manufacturing a jump',()=>{
 const {AuthorityEngine}=load('../src/authority/engine.ts'),engine=new AuthorityEngine(()=>{}),member={id:'a',seat:1,ready:true,ws:null},room={gameId:a.id,seats:{1:'a',2:null,3:null,4:'b'},members:new Map([['a',member],['b',{id:'b',seat:4,ready:true,ws:null}]])};engine.onRoom(room);const s=room.auth.state,now=room.auth.clock;
 engine.input(room,member,{round:s.round,serverTime:now,input:input({shield:true,up:true,jump:0})},now);engine.pump(room,now+26);assert.equal(s.players[0].shielded,true);
 engine.pump(room,now+400);assert.equal(s.players[0].shielded,false);assert.equal(s.players[0].jumps,0);assert.equal(s.inputs[0].shield,false);
 const fresh=a.create(1,true,[1,4],42);a.step(fresh,[input({up:true,jump:0})]);a.step(fresh,[input({jump:0,cancelledJump:0})]);assert.equal(fresh.players[0].jumps,0,'blur neutral packet must not emulate a physical Up release');
});
test('changing a native fighter or arena invalidates the corresponding ready confirmations',()=>{
 const {AuthorityEngine}=load('../src/authority/engine.ts'),engine=new AuthorityEngine(()=>{}),p={id:'a',seat:1,ready:false,ws:null},q={id:'b',seat:4,ready:false,ws:null},room={gameId:a.id,seats:{1:'a',2:null,3:null,4:'b'},members:new Map([['a',p],['b',q]])};engine.onRoom(room);p.ready=true;assert(engine.character(room,p,3));assert.equal(p.ready,false);p.ready=true;assert(engine.options(room,p,{map:'Space'}));assert.equal(p.ready,false);assert.equal(q.ready,false);
});
test('checked original body/object/audio media match their native capture manifests and SWF identity',()=>{
 const root=path.resolve(__dirname,'..'),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),source=sha(path.join(root,'games/6232/game.swf')),folder=path.join(root,'public/expanded/assets/brawler/native');
 for(const file of ['provenance.json','objects-provenance.json']){const p=JSON.parse(fs.readFileSync(path.join(folder,file)));assert.equal(p.sourceSwfSha256,source);for(const [name,record]of Object.entries(p.files))assert.equal(sha(path.join(folder,name)),record.sha256,name);}
 const audio=JSON.parse(fs.readFileSync(path.join(folder,'audio/provenance.json')));assert.equal(audio.sourceSwfSha256,source);assert.equal(Object.keys(audio.sounds).length,26);for(const sound of Object.values(audio.sounds))assert.equal(sha(path.join(folder,'audio',sound.file)),sound.sha256,sound.file);
 assert.equal(fs.readFileSync(path.join(folder,'data.json'),'utf8'),fs.readFileSync(path.join(root,'src/expanded/brawler-native-art.json'),'utf8'));assert.equal(fs.readFileSync(path.join(folder,'objects.json'),'utf8'),fs.readFileSync(path.join(root,'src/expanded/brawler-native-objects.json'),'utf8'));
});
