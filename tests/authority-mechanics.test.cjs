"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),path=require("node:path"),Module=require("node:module");
function load(file){const source=require("esbuild").buildSync({entryPoints:[path.resolve(__dirname,file)],bundle:true,platform:"node",format:"cjs",write:false}).outputFiles[0].text;const mod=new Module(file,module);mod.paths=module.paths;mod._compile(source,file);return mod.exports;}
const core=load("../src/authority/bomb-core.ts"),{AuthorityEngine}=load("../src/authority/engine.ts"),protocol=load("../src/authority/protocol.ts"),{Presentation}=load("../src/authority/presentation.ts");
const input=(seq,dir=-1,bomb=0)=>({seq,dir,bomb,special:0});
function arena(){const s=core.createGame(123,100,true,{mode:"online",activeSeats:[1,2]});s.board.fill(0);s.players[0].x=3;s.players[0].y=3;s.players[1].x=12;s.players[1].y=10;return s;}
function tick(s,control=core.EMPTY_INPUT){core.step(s,[control,core.EMPTY_INPUT,core.EMPTY_INPUT,core.EMPTY_INPUT]);}
test("push glove cooldown blocks another push until expiry and is spent only on success",()=>{
  const s=arena(),p=s.players[0];p.push=true;s.bombs=[{id:1,x:4,y:3,owner:1,range:1,explodeAt:600}];
  tick(s,input(1,2));assert.equal(p.pushCooldown,core.PUSH_COOLDOWN_TICKS);assert.equal(s.bombs[0].x,5);
  // A second bomb adjacent while the first still slides must not be pushed.
  p.moveDir=-1;p.progress=0;s.bombs.push({id:2,x:3,y:4,owner:2,range:1,explodeAt:600});
  for(let n=1;n<core.PUSH_COOLDOWN_TICKS;n++)tick(s,input(n+1,3));
  assert.equal(s.bombs.find(b=>b.id===2).y,4);assert.equal(p.pushCooldown,1);
  tick(s,input(99,3));assert.equal(s.bombs.find(b=>b.id===2).y,5);assert.equal(p.pushCooldown,core.PUSH_COOLDOWN_TICKS);
  const blocked=arena(),q=blocked.players[0];q.push=true;blocked.bombs=[{id:1,x:4,y:3,owner:1,range:1,explodeAt:600}];blocked.board[core.index(5,3)]=1;tick(blocked,input(1,2));assert.equal(q.pushCooldown,0);
});
test("successful special weapons impose recovery, blocked attempts spend neither ammo nor recovery",()=>{
  assert.equal(core.SPECIAL_RECOVERY_TICKS,7);
  for(const weapon of core.WEAPONS){const s=arena(),p=s.players[0];p.weapon=weapon;p.ammo=2;tick(s,input(1,2,1));assert.equal(p.ammo,1,weapon);assert.equal(p.actionLock,core.SPECIAL_RECOVERY_TICKS,weapon);assert.equal(p.moveDir,-1);assert.equal(p.x,3);tick(s,input(2,2,2));assert.equal(p.ammo,1,weapon);assert.equal(p.lastBomb,2);assert.equal(p.moveDir,-1);}
  const s=arena(),p=s.players[0];p.weapon='ice';p.ammo=1;s.board[core.index(4,3)]=1;tick(s,input(1,2,1));assert.equal(p.actionLock,0);assert.equal(p.ammo,1);
});
test("short ice recovery prevents self-freezing in every direction and speed, including slow",()=>{
  for(const speed of [3,4,5,6,20])for(const dir of [0,1,2,3]){
    const s=arena(),p=s.players[0];p.weapon='ice';p.ammo=1;p.speed=speed===20?6:speed;p.slow=speed===20?600:0;tick(s,input(1,dir,1));const born=s.tick;
    for(let n=1;n<core.ICE_LIFETIME_TICKS;n++){
      tick(s,input(n+1,dir,1));assert.equal(p.x,3);assert.equal(p.y,3);assert.equal(p.progress,0);assert.equal(p.frozen,0);
      if(n===core.SPECIAL_RECOVERY_TICKS){assert.equal(p.actionLock,0);assert(s.ice.some(t=>t>s.tick));}
    }
    tick(s,input(99,dir,1));assert.equal(s.tick,born+core.ICE_LIFETIME_TICKS);assert.equal(p.actionLock,0);assert(p.progress>0);assert.equal(p.frozen,0);
    for(let n=0;n<20;n++){tick(s,input(100+n,dir,1));assert.equal(p.frozen,0);}assert(p.x!==3||p.y!==3);
    // A side step is allowed as soon as recovery ends, while ice still exists.
    const sideways=arena(),q=sideways.players[0];q.weapon='ice';q.ammo=1;q.speed=speed===20?6:speed;q.slow=speed===20?600:0;tick(sideways,input(1,dir,1));
    for(let n=1;n<core.SPECIAL_RECOVERY_TICKS;n++){tick(sideways,input(n+1,(dir+1)%4,1));assert.equal(q.moveDir,-1);}
    tick(sideways,input(99,(dir+1)%4,1));assert.equal(q.actionLock,0);assert(q.progress>0);assert(sideways.ice.some(t=>t>sideways.tick));assert.equal(q.frozen,0);
  }
});
test("ice still freezes an opponent; caster receives no blanket immunity",()=>{
  const s=arena(),p=s.players[0],q=s.players[1];p.weapon='ice';p.ammo=1;q.x=4;q.y=3;tick(s,input(1,2,1));for(let n=0;n<4;n++)tick(s,input(2,-1,1));assert(q.frozen>0);assert.equal(p.frozen,0);
  s.ice[core.index(p.x,p.y)]=s.tick+20;tick(s);assert(p.frozen>0);
});
test("pickup state carries special weapon type and remaining uses, validation bounds cooldowns",()=>{
  const s=arena(),p=s.players[0];s.items[core.index(4,3)]='rocket';for(let n=0;n<6;n++)tick(s,input(n+1,2));assert.equal(p.weapon,'rocket');assert.equal(p.ammo,2);assert(core.validState(s));
  const bad=structuredClone(s);bad.players[0].pushCooldown=-1;assert(!core.validState(bad));bad.players[0].pushCooldown=0;bad.players[0].actionLock=core.SPECIAL_RECOVERY_TICKS+1;assert(!core.validState(bad));
});
test("mine/gas placement briefly reveals to everyone then only the owner; traps remain lethal",()=>{
  for(const kind of ['mine','gas']){
    const s=arena(),p=s.players[0];p.weapon=kind;p.ammo=2;tick(s,input(1,-1,1));const trap=s.specials[0];
    for(const viewer of [1,2,null])assert.equal(core.visibleSpecials(s,viewer).length,1);
    s.tick=trap.born+core.TRAP_REVEAL_TICKS;assert.equal(core.visibleSpecials(s,1).length,1);assert.equal(core.visibleSpecials(s,2).length,0);assert.equal(core.visibleSpecials(s,null).length,0);
    const q=s.players[1];q.x=trap.x;q.y=trap.y;tick(s);
    if(kind==='mine'){assert(!q.alive);assert.equal(q.killedBy,1);}else assert(q.slow>0);
  }
});
test("per-viewer trap snapshots use independent ACK baselines and hide traps from resync as well",()=>{
  const engine=new AuthorityEngine(()=>{}),room={gameId:'3881-server',seats:{1:'a',2:'b',3:null,4:null},members:new Map()};
  for(const [id,seat]of [['a',1],['b',2],['observer',null]])room.members.set(id,{id,seat,ready:true,ws:{readyState:1,bufferedAmount:0,messages:[],send(text){this.messages.push(JSON.parse(text));},close(){}}});
  engine.onRoom(room);const s=room.auth.state; s.specials=[{id:1,kind:'mine',owner:1,x:3,y:3,dir:2,born:0,until:100,distance:0}];s.nextBomb=2;s.tick=1;
  engine.publish(room,1000);const clients=new Map();
  for(const member of room.members.values()){const message=member.ws.messages.at(-1),state=protocol.applyUpdate(null,message);assert(state);assert.equal(state.specials.length,1);clients.set(member.id,state);engine.ack(room,member,message);}
  s.tick=core.TRAP_REVEAL_TICKS;engine.publish(room,1100);
  for(const member of room.members.values()){const message=member.ws.messages.at(-1),state=protocol.applyUpdate(clients.get(member.id),message);assert(state);assert.equal(state.specials.length,member.seat===1?1:0);engine.ack(room,member,message);}
  assert.equal(s.specials.length,1);assert.equal(room.members.get('b').ws.messages.at(-1).kind,'delta');
  engine.resync(room,room.members.get('b'));assert.equal(room.members.get('b').ws.messages.at(-1).state.specials.length,0);
});
test("local prediction respects authoritative weapon recovery",()=>{
  const s=arena(),p=s.players[0];p.actionLock=core.SPECIAL_RECOVERY_TICKS;const view=new Presentation(()=>{});view.receive(s,1000,1);view.input(input(1,2),20);const rendered=view.render(30,1030,1,input(1,2),35);assert.deepEqual(rendered.players[0],p);
});
