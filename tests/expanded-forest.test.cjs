const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const file = path.resolve(__dirname, '../src/expanded/forest.ts');
const compiled = esbuild.buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const mod = new Module(file, module); mod.paths = module.paths; mod._compile(compiled, file);
const { adapter, forestLevels } = mod.exports;
const empty = (seq=0) => ({seq,left:false,right:false,up:false,down:false,attack:0,alt:0});
const tick = (s,n=1,inputs=[empty(),empty()]) => { for(let i=0;i<n;i++) adapter.step(s,inputs); };
test('all 32 original level maps contain two players and two matching exits',()=>{
  assert.equal(adapter.maps.length,32);
  for(const map of adapter.maps){const s=adapter.create(1,true,[1,2],123,map.id);assert.equal(s.phase,'playing');assert.equal(s.players.length,2);assert.equal(s.exits.length,2,map.id);assert.ok(adapter.valid(s),map.id);assert.equal(forestLevels.find(l=>l.id===map.id).ground.length,39*29);tick(s,120);assert.ok(adapter.valid(s),map.id);}
});
test('one participant waits without simulating a phantom partner',()=>{const s=adapter.create(1,true,[2],1);assert.equal(s.phase,'waiting');tick(s,100);assert.equal(s.tick,0);assert.equal(s.players.length,1);});
test('water kills Fireboy, lava kills Watergirl, own element is safe, green kills both',()=>{
  for(const [type,seat,dead] of [[5,0,true],[5,1,false],[6,0,false],[6,1,true],[7,0,true],[7,1,true]]){
    const s=adapter.create(1,true,[1,2],1);s.devices=[];s.gems=[];s.exits=[];s.liquids=[{x:100,y:700,w:160,h:16,type,frozen:false}];const p=s.players[seat];p.x=175;p.y=710;p.vx=p.vy=0;tick(s);assert.equal(!p.alive,dead,`${type}/${seat}`);if(dead)assert.equal(s.phase,'finished');
  }
});
test('colored gems can only be collected by the corresponding character',()=>{const s=adapter.create(1,true,[1,2],1);s.devices=[];s.gems=[{id:1,x:600,y:700,element:'wg',taken:false}];s.players[0].x=600;s.players[0].y=720;tick(s);assert.equal(s.gems[0].taken,false);s.players[1].x=600;s.players[1].y=720;tick(s);assert.equal(s.gems[0].taken,true);assert.equal(s.collected,1);tick(s,5);assert.equal(s.collected,1);});
test('both elemental exits finish the round; gems remain an optional score',()=>{const s=adapter.create(1,true,[1,2],1);s.devices=[];s.liquids=[];s.exits=[{x:1056,y:192,element:'fb'},{x:1152,y:192,element:'wg'}];for(const p of s.players){p.x=s.exits[p.seat-1].x;p.y=192;p.vx=p.vy=0;p.grounded=true;}tick(s,4);assert.equal(s.phase,'finished');assert.equal(s.success,true);});
test('held and replayed jump packets produce one jump and leave a deterministic state',()=>{const a=adapter.create(4,true,[1,2],7),b=structuredClone(a);for(let n=0;n<300;n++){const i={...empty(n),right:n<60,up:n>=120&&n<240,alt:n>=120?1:0};tick(a,1,[i,empty()]);tick(b,1,[structuredClone(i),empty()]);}assert.deepEqual(a,b);assert.equal(a.players[0].lastAlt,1);});
test('pressure plate OR group moves a matching platform and release returns it',()=>{const s=adapter.create(1,true,[1,2],1,'forest_02');const plate=s.devices.find(d=>d.type==='pusher'&&d.group===2),platform=s.devices.find(d=>d.type==='platform'&&d.group===2);assert.ok(plate&&platform);const p=s.players[0];p.x=plate.x;p.y=plate.baseY-3;p.vx=p.vy=0;tick(s);assert.ok(platform.amount>0);p.x=64;p.y=880;tick(s,20);assert.equal(platform.amount,0);});
test('validation rejects foreign games and nonfinite player state',()=>{const s=adapter.create(1,true,[1,2],1);assert.ok(adapter.valid(JSON.parse(JSON.stringify(s))));assert.equal(adapter.valid({...s,gameId:'6232-server'}),false);s.players[0].x=NaN;assert.equal(adapter.valid(s),false);});
test('one-based seat inputs and consumed stale actions do not replay on reconnect',()=>{const s=adapter.create(1,true,[1,2],1);tick(s,120);const p=s.players[1];adapter.consumeInput(s,2,{...empty(8),alt:1,attack:1});tick(s,1,[empty(),{...empty(8),alt:1,attack:1}]);assert.equal(s.ack[1],8);assert.equal(s.inputs[1].seq,8);assert.equal(p.lastAlt,1);assert.equal(s.players[0].lastAlt,0);assert.equal(adapter.valid({...s,players:[null]}),false);assert.equal(adapter.valid({...s,devices:[null]}),false);});
test('rotating platforms use angular travel and wind pushes in its original direction',()=>{const s=adapter.create(1,true,[1,2],1,'forest_07');const d=s.devices.find(d=>d.type==='platform'&&d.props.dtheta!=null);assert.ok(d);s.devices=s.devices.filter(x=>x.id===d.id);d.props.initialState=1;tick(s,20);assert.ok(d.rotation>0);assert.equal(d.rotation,Number(d.props.dtheta)*Math.PI/180*d.amount);const a=adapter.create(1,true,[1,2],1,'forest_03');const wind=a.devices.find(x=>x.type==='wind');assert.ok(wind);a.devices=[wind];wind.props.initialState=1;wind.props.invertInput=false;const p=a.players[0];p.x=wind.x+Math.sin(wind.rotation)*60;p.y=wind.y+22-Math.cos(wind.rotation)*60;p.vx=p.vy=0;tick(a);assert.ok(p.vx*Math.sin(wind.rotation)+p.vy*-Math.cos(wind.rotation)>0);});
