'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
function load(file){const name=path.resolve(__dirname,file),source=require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(name,module);m.paths=module.paths;m._compile(source,name);return m.exports;}
const core=load('../src/authority/bomb-core.ts'),{AuthorityEngine}=load('../src/authority/engine.ts'),{bombStatus}=load('../src/authority/bomb-status.ts');
const input=(seq,dir=-1)=>({seq,dir,bomb:0});
function arena(){const s=core.createGame(42,1,true,{mode:'online',activeSeats:[1,2],difficulty:'normal'});s.board.fill(0);s.items.fill(null);s.players[0].x=3;s.players[0].y=4;s.players[1].x=11;s.players[1].y=8;s.players.forEach(p=>p.invulnerable=0);return s;}
function ticks(s,n=1,controls=[]){for(let i=0;i<n;i++)core.step(s,controls);}
function setup(gameId='3881-server'){
 const engine=new AuthorityEngine(()=>{}),room={gameId,seats:{1:'a',2:'b',3:null,4:null},members:new Map()};
 for(const [id,seat]of [['a',1],['b',2]])room.members.set(id,{id,seat,ready:true,ws:null});engine.onRoom(room);return {engine,room};
}
function finish(engine,room){const at=room.auth.clock;room.auth.state.tick=core.ROUND_TICKS-1;room.auth.accumulator=0;engine.pump(room,at+core.STEP_MS+1);assert.equal(room.auth.state.phase,'finished');return room.auth.nextRoundAt;}
function next(engine,room){engine.pump(room,room.auth.nextRoundAt+1);}

test('real online life pickups increase stock and HUD, survive the next hit and only run out on the final hit',()=>{
 const s=arena(),p=s.players[0];s.items[core.index(4,4)]='life';ticks(s,6,[input(1,2)]);assert.equal(p.life,2);assert.equal(s.items[core.index(4,4)],null);assert.equal(bombStatus(s)[0].icons.find(v=>v.label==='生命').value,'2');ticks(s,1,[input(2)]);
 s.flames[core.index(p.x,p.y)]=s.tick+12;s.flameOwners[core.index(p.x,p.y)]=2;ticks(s);assert.equal(p.life,1);assert.equal(p.alive,true);assert.equal(p.invulnerable,60);assert.equal(p.killedBy,0);assert.equal(p.diedAt,0);assert.equal(s.phase,'playing');ticks(s,60);assert.equal(p.life,1);assert.equal(p.invulnerable,0);
 s.flames[core.index(p.x,p.y)]=s.tick+12;s.flameOwners[core.index(p.x,p.y)]=2;ticks(s);assert.equal(p.life,0);assert.equal(p.alive,false);assert.equal(p.killedBy,2);assert.equal(p.diedAt,s.tick);assert.equal(s.phase,'finished');assert.equal(s.winner,2);assert(core.validState(s));
});

test('shield is consumed before extra lives and protection prevents one lingering flame from draining all lives',()=>{
 const s=arena(),p=s.players[0];p.shield=true;p.life=3;const cell=core.index(p.x,p.y);s.flames[cell]=s.tick+15;s.flameOwners[cell]=2;ticks(s);assert.equal(p.shield,false);assert.equal(p.life,3);ticks(s,15);assert.equal(p.life,3);assert(p.alive);ticks(s,45);assert.equal(p.invulnerable,0);
 s.flames[cell]=s.tick+12;ticks(s);assert.equal(p.life,2);assert.equal(p.invulnerable,60);ticks(s,15);assert.equal(p.life,2);assert(p.alive);assert(core.validState(s));
});

test('surviving an extra-life hit does not add a death or an opponent kill; the actual final KO does',()=>{
 const {engine,room}=setup(),s=room.auth.state,p=s.players[0],cell=core.index(p.x,p.y);p.life=2;p.invulnerable=0;s.flames[cell]=100;s.flameOwners[cell]=2;
 engine.pump(room,room.auth.clock+core.STEP_MS+1);assert(p.alive);assert.equal(p.life,1);assert.equal(room.auth.records.get('a').deaths,0);assert.equal(room.auth.records.get('b').kills,0);p.invulnerable=0;
 engine.pump(room,room.auth.clock+core.STEP_MS+1);assert(!p.alive);assert.equal(room.auth.records.get('a').deaths,1);assert.equal(room.auth.records.get('b').kills,1);assert.equal(room.auth.completedOnMap,1);
});

test('only completed rounds count; fifth result remains on its map and round6 randomly chooses a different theme',t=>{
 t.mock.method(Math,'random',()=>0.999999);
 const {engine,room}=setup();for(let n=1;n<=5;n++){assert.equal(room.auth.state.options.map,'forest');finish(engine,room);assert.equal(room.auth.completedOnMap,n);assert.equal(room.auth.options.map,'forest');assert.deepEqual(engine.info(room).mapRotation,{every:5,completed:n});next(engine,room);assert.equal(room.auth.state.phase,'playing');}
 assert.equal(room.auth.state.options.map,'candy');assert.equal(room.auth.options.map,'candy');assert.equal(room.auth.completedOnMap,0);assert.equal(room.auth.records.get('a').rounds,5);assert(room.members.get('a').ready&&room.members.get('b').ready);
});

test('random map changes can choose every other original theme and count each finished round once',t=>{
 const themes=['forest','desert','city','treasure','candy'];let roll=0;t.mock.method(Math,'random',()=>roll);
 for(const current of themes)for(let pick=0;pick<4;pick++){
  const {engine,room}=setup();room.auth.options.map=current;
  for(let n=0;n<5;n++){const due=finish(engine,room);for(let i=0;i<4;i++)engine.pump(room,due-2000+i*10);assert.equal(room.auth.completedOnMap,n+1);roll=(pick+0.5)/4;next(engine,room);if(n<4)assert.equal(room.auth.options.map,current);}
  assert.equal(room.auth.state.options.map,themes.filter(map=>map!==current)[pick]);assert.notEqual(room.auth.options.map,current);assert.equal(room.auth.completedOnMap,0);assert.equal(room.auth.records.get('a').rounds,5);
 }
});

test('unready, waiting and roster rebuilds do not add rounds or lose the pending fifth-round map switch',()=>{
 const {engine,room}=setup();for(let n=0;n<4;n++){finish(engine,room);next(engine,room);}room.members.get('b').ready=false;engine.onRoom(room);finish(engine,room);assert.equal(room.auth.completedOnMap,5);next(engine,room);assert.equal(room.auth.state.phase,'waiting');const map=room.auth.state.options.map;assert.notEqual(map,'forest');assert.equal(room.auth.completedOnMap,0);
 room.members.set('c',{id:'c',seat:3,ready:false,ws:null});room.seats[3]='c';engine.onRoom(room);assert.equal(room.auth.completedOnMap,0);assert.equal(room.auth.state.options.map,map);room.members.get('b').ready=true;room.members.get('c').ready=true;engine.onRoom(room);assert.equal(room.auth.state.phase,'playing');assert.equal(room.auth.state.options.map,map);assert.equal(room.auth.completedOnMap,0);
});

test('manual map selection restarts the five-round block; invalid map and difficulty-only updates do not',()=>{
 const {engine,room}=setup();for(let n=0;n<2;n++){finish(engine,room);next(engine,room);}room.members.get('b').ready=false;engine.onRoom(room);finish(engine,room);next(engine,room);assert.equal(room.auth.completedOnMap,3);
 const controller=room.members.get(room.controllerId);assert.equal(engine.options(room,controller,{map:'bad-map'}),false);assert.equal(room.auth.completedOnMap,3);assert.equal(engine.options(room,controller,{difficulty:'hard'}),true);assert.equal(room.auth.completedOnMap,3);
 assert.equal(engine.options(room,controller,{map:'city'}),true);assert.equal(room.auth.completedOnMap,0);room.members.get('b').ready=true;engine.onRoom(room);for(let n=0;n<5;n++){finish(engine,room);next(engine,room);}assert(['forest','desert','treasure','candy'].includes(room.auth.state.options.map));
});

test('rotation info and automatic map changes are specific to Bomb It1',()=>{
 for(const gameId of ['46923-server','50737-server','9109-server']){const {engine,room}=setup(gameId),map=room.auth.options.map;assert.equal(engine.info(room).mapRotation,undefined);room.auth.state.phase='finished';room.auth.nextRoundAt=1;engine.pump(room,2);assert.equal(room.auth.options.map,map);assert.equal(room.auth.completedOnMap,0);}
});
