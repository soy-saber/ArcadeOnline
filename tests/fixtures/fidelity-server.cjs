'use strict';
// Isolated test process. This IPC fixture is never included in a release.
const path=require('node:path'),root=path.resolve(__dirname,'../..'),{AuthorityEngine}=require(path.join(root,'runtime/authority.cjs'));
const rooms=new Map(),onRoom=AuthorityEngine.prototype.onRoom;
function pose(p,x,y){p.x=x;p.y=y;if(p.walking)Object.assign(p.walking,{x:x*30,y:y*30,vx:0,vy:0,gridX:x,gridY:y,transX:0,transY:0,blocked:false});if('travel'in p){p.travel=null;p.sandCell=-1;}}
AuthorityEngine.prototype.onRoom=function(room){rooms.set(room.name,room);return onRoom.call(this,room);};
process.on('message',m=>{try{
 const room=rooms.get(m.room),s=room?.auth?.state;if(!s||s.phase!=='playing')throw new Error('Test round not playing');
 if(s.gameId==='9109-server'&&['pickup','coin-duel','motion','conveyor','kick','flame-cross','flame-chain','mine-blast'].includes(m.action)){
   if(s.players.some(p=>p.travel||p.rideMotion))throw Error('Landform and vehicle motion must finish naturally first');
   s.blasts=[];
 }
 if(m.action==='pickup'){
   s.board.fill(0);s.bombs=[];s.flames.fill(0);if(s.tiles)s.tiles.fill(0);
   const p=s.players.find(p=>p.seat===(m.seat??1)),q=s.players.find(q=>q!==p);if(!p||!q||p.actionLock||p.attack||p.travel||p.moveDir>=0)throw new Error('Player action not recovered');pose(p,3,4);pose(q,11,8);
   s.items.fill(s.gameId?0:null);s.items[4*('gameId'in s?17:15)+4]=m.kind;
 }else if(m.action==='coin-duel'){
   if(s.gameId!=='9109-server'||s.mode!=='collect')throw Error('Expected coin mode');
   if(s.players.some(p=>p.moveDir>=0||p.actionLock||p.invulnerable))throw Error('Players must recover naturally first');
   s.board.fill(0);s.tiles.fill(0);s.items.fill(0);s.bombs=[];s.flames.fill(0);
   const [p,q]=s.players;pose(p,5,4);pose(q,5,4);q.dir=3;
 }else if(m.action==='motion'){
   if(s.gameId!=='9109-server')throw Error('Expected Bomb It 2');
   if(s.players.some(p=>p.moveDir>=0||p.actionLock||p.attack))throw Error('Players must recover naturally first');
   s.board.fill(0);s.tiles.fill(0);s.items.fill(0);s.bombs=[];s.flames.fill(0);
   let start;
   if(m.ice)start=s.hazards.find(h=>h.kind==='IceFace'&&[1,2].every(dx=>s.hazards.some(q=>q.kind==='IceFace'&&q.x===h.x+dx&&q.y===h.y)));
   else for(let y=2;y<12&&!start;y++)for(let x=2;x<12&&!start;x++)if(!s.hazards.some(h=>h.x>=x-1&&h.x<=x+3&&h.y>=y-1&&h.y<=y+1))start={x,y};
   if(!start)throw Error('Original map has no suitable motion lane');
   const [p,q]=s.players;pose(p,start.x,start.y);pose(q,15,13);
 }else if(m.action==='conveyor'||m.action==='kick'){
   if(s.gameId!=='9109-server'||s.mapId!=='factory-two')throw Error('Expected original factory map 2');
   if(s.players.some(p=>p.actionLock||p.attack))throw Error('Players must recover naturally first');
   s.board.fill(0);s.tiles.fill(0);s.items.fill(0);s.bombs=[];s.flames.fill(0);
   const [p,q]=s.players;
   if(m.action==='conveyor'){pose(p,3,4);pose(q,15,13);}
   else {pose(p,4,6);pose(q,6,6);s.board[6*17+9]=1;s.tiles[6*17+9]=41;}
 }else if(['flame-cross','flame-chain','mine-blast'].includes(m.action)){
   if(s.gameId!=='9109-server'||s.mapId!=='beach-one')throw Error('Expected original beach map');
   if(s.players.some(p=>p.actionLock||p.attack||p.respawnAt))throw Error('Players must recover naturally first');
   s.board.fill(0);s.tiles.fill(0);s.items.fill(0);s.bombs=[];s.flames.fill(0);
   const [p,q]=s.players;pose(p,5,5);pose(q,m.action==='flame-chain'?6:m.action==='mine-blast'?6:12,m.action==='flame-chain'?5:m.action==='mine-blast'?6:10);
   if(m.action==='flame-chain'){s.board[3*17+5]=2;s.tiles[3*17+5]=11;s.board[2*17+5]=2;s.tiles[2*17+5]=11;}
   if(m.action==='mine-blast'){s.board[4*17+4]=2;s.tiles[4*17+4]=11;s.board[4*17+6]=1;s.tiles[4*17+6]=12;}
 }else if(['fire-overlap','fire-points','fire-late'].includes(m.action)){
   if(s.gameId!=='9109-server'||s.mapId!=='beach-one')throw Error('Expected original beach map');
   if(s.players.some(p=>p.travel||p.rideMotion||p.actionLock||p.attack||p.respawnAt||p.moveDir>=0||p.invulnerable))throw Error('Players and protection must recover naturally first');
   const [p,q]=s.players;if(m.action==='fire-points'&&(!p.shield||q.weapon!==17||q.ammo!==1)||m.action==='fire-late'&&(q.weapon!==17||q.ammo!==1))throw Error('Required items must be collected through real pickups');
   s.board.fill(0);s.tiles.fill(0);s.items.fill(0);s.bombs=[];s.blasts=[];s.flames.fill(0);s.owners.fill(0);
   if(m.action==='fire-overlap'){pose(p,5,6);pose(q,6,5);}
   else {pose(p,m.action==='fire-points'?5:11,m.action==='fire-points'?5:8);pose(q,6,5);}
 }else if(m.action==='fire-overlap-approach'){
   if(s.gameId!=='9109-server'||s.mapId!=='beach-one'||s.flames[7*17+6]>s.tick)throw Error('Expected safe approach beside the original overlap');
   if(s.players.some(p=>p.travel||p.rideMotion||p.actionLock||p.attack||p.respawnAt||p.moveDir>=0||p.invulnerable))throw Error('Players must recover naturally first');
   pose(s.players[0],6,7);
 }else if(m.action==='fire-late-entry'){
   if(s.gameId!=='9109-server'||s.mapId!=='beach-one')throw Error('Expected original beach map');
   if(s.players.some(p=>p.travel||p.rideMotion||p.actionLock||p.attack||p.respawnAt||p.moveDir>=0||p.invulnerable))throw Error('Players must recover naturally first');
   const cell=5*17+5;
   if(!s.blasts.some(b=>b.fires.includes(cell))||s.flames[cell]<=s.tick)throw Error('Expected the actual residual flame state');
   pose(s.players[0],5,6);
 }else if(['protection-hit','protection-contact'].includes(m.action)){
   if(s.gameId!=='9109-server'||s.mapId!=='mine-one')throw Error('Expected original mine map');
   if(s.players.some(p=>p.travel||p.rideMotion||p.actionLock||p.attack||p.respawnAt||p.moveDir>=0))throw Error('Players must recover naturally first');
   const [p,q]=s.players;
   if(m.action==='protection-hit'&&!p.shield)throw Error('Shield must be collected through actual pickup');
   if(m.action==='protection-contact'&&p.aura?.phase!=='active')throw Error('Power intro must finish naturally');
   s.board.fill(0);s.tiles.fill(0);s.items.fill(0);s.bombs=[];s.blasts=[];s.flames.fill(0);pose(p,5,5);pose(q,6,5);
 }else if(['vehicle-frog','vehicle-crush','vehicle-hit'].includes(m.action)){
   if(s.gameId!=='9109-server'||s.mapId!=='mine-one')throw Error('Expected original mine map');
   if(s.players.some(p=>p.travel||p.rideMotion||p.actionLock||p.attack||p.respawnAt||p.moveDir>=0))throw Error('Players must recover naturally first');
   const [p,q]=s.players;if(m.action==='vehicle-frog'&&p.vehicle!==14||m.action==='vehicle-crush'&&p.vehicle!==12||m.action==='vehicle-hit'&&!p.vehicle)throw Error('Vehicle must be acquired through real pickup');
   s.board.fill(0);s.tiles.fill(0);s.items.fill(0);s.bombs=[];s.blasts=[];s.flames.fill(0);
   if(m.action==='vehicle-hit'){pose(p,5,5);pose(q,6,5);}
   else{pose(p,3,4);pose(q,11,8);s.board[4*17+4]=m.action==='vehicle-frog'?1:2;s.tiles[4*17+4]=m.action==='vehicle-frog'?7:1;s.items[4*17+5]=2;}
 }else if(m.action==='landform-spring'||m.action==='landform-sand'){
   if(s.gameId!=='9109-server'||s.mapId!==(m.action==='landform-spring'?'disce-one':'beach-one'))throw Error('Expected original landform map');
   if(s.players.some(p=>p.travel||p.rideMotion||p.actionLock||p.attack||p.respawnAt||p.moveDir>=0))throw Error('Players must recover naturally first');
   s.board.fill(0);s.tiles.fill(0);s.items.fill(0);s.bombs=[];s.blasts=[];s.flames.fill(0);
   const h=s.hazards.find(h=>h.kind===(m.action==='landform-spring'?'SpringBoard':'QuickSand')),[p,q]=s.players;pose(p,h.x-1,h.y);pose(q,10,8);
   if(m.action==='landform-spring'){s.items[h.y*17+h.x]=19;s.board[h.y*17+h.x+1]=1;s.tiles[h.y*17+h.x+1]=37;s.items[h.y*17+h.x+2]=2;}
   else {const target=s.hazards[h.target];s.items[target.y*17+target.x+1]=2;}
 }else if(m.action==='blast'){
   if(s.gameId)throw Error('Expected first Bomb It');
   if(s.players.some(p=>p.moveDir>=0||p.actionLock))throw Error('Players must stop first');
   s.board.fill(0);s.items.fill(null);s.bombs=[];s.specials=[];s.blasts=[];s.flames.fill(0);
   const [p,q]=s.players;p.x=5;p.y=5;q.x=11;q.y=9;s.board[4*15+5]=2;s.board[3*15+5]=2;
 }else if(m.action==='boxhead-pack-pose'){
   if(s.gameId!=='50737-server'||s.mapId!=='original-01'||s.peakCombo<55||s.players.some(p=>!p.alive)||!Number.isInteger(m.index)||m.index<0||m.index>8)throw Error('Expected living players after actual charge-pack unlock');
   const p=s.players[0];p.x=m.index===8?144:80+m.index*64;p.y=m.index===8?400:144;p.dir=m.index===8?0:Math.PI/2;
 }else if(m.action==='boxhead-horde'||m.action==='boxhead-grenade-scene'||m.action==='boxhead-objects-scene'){
   if(s.gameId!=='50737-server'||s.mapId!=='original-01')throw Error('Expected native BOXY room');
   if(s.zombies.length&&m.action==='boxhead-horde'&&s.players[0].kills>0)throw Error('Defeat the prior horde through real shots first');
   if(s.players.some(p=>!p.alive))throw Error('Players must remain alive');
   if(m.action==='boxhead-grenade-scene'&&s.peakCombo<45)throw Error('Earn the native grenade upgrades through actual kills first');
   if(m.action==='boxhead-objects-scene'&&s.peakCombo<55)throw Error('Earn the native charge-pack unlock through actual kills first');
   s.waveReady=0;s.spawnLeft=1;s.nextSpawn=1e9;s.devilLeft=0;s.barrels=[];s.pickups=[];s.bullets=[];s.explosions=[];s.effects=[];
   const [p,q]=s.players;p.x=144;p.y=272;p.dir=0;q.x=m.action==='boxhead-objects-scene'?544:624;q.y=m.action==='boxhead-objects-scene'?400:464;
   s.zombies=m.action==='boxhead-horde'?Array.from({length:4},()=>({id:++s.nextId,x:355,y:272,hp:100,dir:Math.PI,owner:0,attack:0,devil:false,hitAt:-99,attackAt:-99})):[];
 }else if(m.action==='zombies'){
   s.waveReady=0;s.spawnLeft=1;s.nextSpawn=1e9;s.devilLeft=0;s.barrels=[];s.pickups=[];
   const [p,q]=s.players;p.x=144;p.y=272;p.dir=0;q.x=624;q.y=464;
   s.zombies=Array.from({length:4},()=>({id:++s.nextId,x:355,y:272,hp:100,dir:Math.PI,owner:0,attack:0,devil:false,hitAt:-99,attackAt:-99}));
 }else if(m.action==='friendly'){
   if(s.zombies.length)throw new Error('Enemies must be defeated through real attacks first');const [p,q]=s.players;if(p.invul||q.invul)throw new Error('Spawn protection still active');
   p.x=144;p.y=272;p.dir=0;q.x=204;q.y=272;
 }else if(m.action==='next-wave'){
   if(s.zombies.length)throw new Error('Wave is not cleared');s.spawnLeft=0;s.devilLeft=0;
 }else throw new Error('Unknown fixture action');
 process.send({id:m.id,ok:true});
}catch(e){process.send({id:m.id,error:e.message});}});
require(path.join(root,'server.js'));
