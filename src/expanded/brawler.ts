import type { Adapter, Input, State } from './types';
import { EMPTY_INPUT, validInput } from './types';
import data from './brawler-data.json';
type Fighter = {seat:number;x:number;y:number;vx:number;vy:number;alive:boolean;damage:number;stocks:number;facing:number;grounded:boolean;jumps:number;stun:number;invincible:number;cooldown:number;attackFrame:number;shield:number;guarding:boolean;lastAttack:number;lastAlt:number;upHeld:boolean;killedBy:number|null;kos:number;deaths:number;respawn:number;combo:number;character:number;};
type Platform = {id:number;name:string;x:number;y:number;w:number;h:number;moving:boolean};
type Item = {id:number;type:'grenade'|'mine';x:number;y:number;vx:number;vy:number;timer:number;owner:number|null;armed:boolean};
interface BrawlerState extends State {gameId:string;mapId:string;players:Fighter[];platforms:Platform[];items:Item[];seed:number;nextItem:number;flashes:{x:number;y:number;life:number}[];}
const HZ=30;
const stages=data.stages;
const stats=[{weight:.5,speed:.5,power:.5},{weight:.4,speed:.7,power:.4},{weight:.5,speed:.6,power:.4},{weight:.5,speed:.5,power:.5},{weight:.6,speed:.4,power:.5},{weight:.4,speed:.5,power:.6}];
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const stageOf=(s:BrawlerState)=>stages.find(m=>m.id===s.mapId)!;
const random=(s:BrawlerState)=>{s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;};
function create(round:number,playing:boolean,seats:number[],seed:number,mapId?:string):BrawlerState {
  const stage=stages.find(m=>m.id===mapId)||stages[0];
  const players=seats.filter(s=>s>=1&&s<=4).map((seat,i)=>{const pt=stage.spawns[i%stage.spawns.length];return {seat,x:pt.x+14,y:pt.y-2,vx:0,vy:0,alive:true,damage:0,stocks:3,facing:i%2?-1:1,grounded:false,jumps:0,stun:0,invincible:60,cooldown:0,attackFrame:0,shield:100,guarding:false,lastAttack:0,lastAlt:0,upHeld:false,killedBy:null,kos:0,deaths:0,respawn:0,combo:2,character:(seat-1)%data.fighters.length};});
  return {gameId:'6232-server',round,tick:0,phase:playing&&players.length>=2?'playing':'waiting',winner:null,ack:[0,0,0,0],inputs:Array.from({length:4},()=>({...EMPTY_INPUT})),mapId:stage.id,players,platforms:stage.platforms.map(p=>({...p})),items:[],seed:seed>>>0,nextItem:0,flashes:[]};
}
function hit(s:BrawlerState,p:Fighter,owner:number|null,amount:number,power:number,angle:number) {
  if(!p.alive||p.invincible||p.respawn)return;
  if(p.guarding&&p.shield>0){p.shield=Math.max(0,p.shield-amount*2);p.stun=p.shield===0?45:3;return;}
  const sender=s.players.find(x=>x.seat===owner);p.damage+=Math.floor(amount*p.combo/2);p.combo=clamp(p.combo+1,2,6);p.killedBy=owner;
  const launch=power+power*(sender?stats[sender.character].weight:1)-power*stats[p.character].weight+p.damage/100*Math.log(power)*power+p.combo/4;
  p.vx=Math.cos(angle)*launch;p.vy=-Math.sin(angle)*launch;p.stun=clamp(Math.ceil(launch*launch/8),6,70);p.grounded=false;p.jumps=Math.max(1,p.jumps);p.attackFrame=0;p.invincible=6;
  if(sender)s.flashes.push({x:p.x,y:p.y-13,life:7});
}
function melee(s:BrawlerState,p:Fighter,i:Input) {
  const special=i.down,upper=i.up,air=!p.grounded;p.cooldown=special?25:upper?21:13;p.attackFrame=p.cooldown;
  const range=special?64:upper?36:42,damage=special?10:upper||air?10:5,power=special?5:upper||air?6:3;
  for(const other of s.players){if(other.seat===p.seat||!other.alive)continue;const dx=other.x-p.x,dy=other.y-p.y;const inFront=dx*p.facing>=-10;if(Math.abs(dx)<=range&&Math.abs(dy)<(upper?75:32)&&(inFront||special))hit(s,other,p.seat,damage,power,upper?Math.PI/2:Math.PI/4+(p.facing<0?Math.PI/2:0));}
}
function explode(s:BrawlerState,item:Item) {
  s.flashes.push({x:item.x,y:item.y-12,life:14});
  for(const p of s.players)if(Math.hypot(p.x-item.x,p.y-13-item.y)<90)hit(s,p,item.owner,20,8,(p.x<item.x?3:1)*Math.PI/4);
}
function loseStock(s:BrawlerState,p:Fighter) {
  p.stocks--;p.deaths++;p.alive=p.stocks>0;p.respawn=p.alive?55:0;const killer=s.players.find(x=>x.seat===p.killedBy);if(killer&&killer!==p)killer.kos++;
  p.damage=0;p.vx=0;p.vy=0;p.stun=0;p.jumps=0;p.attackFrame=0;p.guarding=false;
}
function move(p:Fighter,platforms:Platform[],down:boolean) {
  const oldY=p.y;p.x+=p.vx;p.y+=p.vy;p.grounded=false;
  for(const q of [...platforms].sort((a,b)=>a.y-b.y)){
    if(p.x+11<=q.x||p.x-11>=q.x+q.w)continue;
    if(p.vy>=0&&oldY<=q.y+3&&p.y>=q.y&&!(down&&q.moving)){p.y=q.y;p.vy=0;p.grounded=true;p.jumps=0;p.combo=2;break;}
    if(!q.moving&&q.h>30&&p.y>q.y+5&&p.y-26<q.y+q.h){if(p.vx>0&&p.x-11<q.x){p.x=q.x-11;p.vx=0;}else if(p.vx<0&&p.x+11>q.x+q.w){p.x=q.x+q.w+11;p.vx=0;}}
  }
}
function step(state:State,inputs:Input[]) {
  const s=state as BrawlerState;if(s.phase!=='playing')return;s.tick++;const stage=stageOf(s);
  s.flashes=s.flashes.filter(f=>--f.life>0);
  for(const p of s.players){
    const i=inputs[p.seat-1]||EMPTY_INPUT;s.inputs[p.seat-1]={...i};s.ack[p.seat-1]=Math.max(s.ack[p.seat-1],i.seq);const attack=i.attack>p.lastAttack,jump=i.alt>p.lastAlt||i.up&&!p.upHeld;p.lastAttack=Math.max(p.lastAttack,i.attack);p.lastAlt=Math.max(p.lastAlt,i.alt);p.upHeld=i.up;
    if(!p.alive)continue;
    if(p.respawn){if(--p.respawn===0){const pt=stage.spawns[(p.seat+s.tick)%stage.spawns.length];p.x=pt.x+14;p.y=pt.y-3;p.invincible=65;p.shield=100;p.killedBy=null;}continue;}
    if(p.invincible>0)p.invincible--;if(p.cooldown>0)p.cooldown--;if(p.attackFrame>0)p.attackFrame--;if(p.stun>0)p.stun--;
    p.guarding=i.down&&p.grounded&&!p.stun&&!attack;p.shield=clamp(p.shield+(p.guarding?-.28:.35),0,100);
    if(!p.stun&&!p.guarding){const dir=Number(i.right)-Number(i.left);if(dir){p.facing=dir;p.vx=8*stats[p.character].speed*dir;}else p.vx*=p.grounded?.4:.96;if(i.down&&!p.grounded)p.vy=8;
      if(jump&&!p.cooldown&&(p.jumps===0||p.jumps===1&&p.vy>=-3)){p.vy=-9;p.jumps++;p.grounded=false;}
      if(attack&&!p.cooldown){const pickup=s.items.find(it=>!it.armed&&Math.hypot(it.x-p.x,it.y-p.y)<30);if(pickup){pickup.owner=p.seat;pickup.armed=true;pickup.vx=7*p.facing;pickup.vy=-5;pickup.timer=pickup.type==='grenade'?60:15;p.cooldown=15;}else melee(s,p,i);}
    }
    p.vy=Math.min(p.stun?18:6,p.vy+.5);move(p,s.platforms,i.down);
    if(p.x<stage.bounds[0]||p.x>stage.bounds[2]||p.y<stage.bounds[1]||p.y>stage.bounds[3])loseStock(s,p);
  }
  if(s.tick%210===0&&s.items.length<6){const q=s.platforms[Math.floor(random(s)*s.platforms.length)];s.items.push({id:s.nextItem++,type:random(s)<.5?'grenade':'mine',x:q.x+q.w*(.15+.7*random(s)),y:q.y-80,vx:0,vy:0,timer:600,owner:null,armed:false});}
  const dead=new Set<number>();
  for(const it of s.items){const old=it.y;it.vy=Math.min(10,it.vy+.5);it.x+=it.vx;it.y+=it.vy;for(const q of s.platforms)if(it.x>=q.x&&it.x<q.x+q.w&&old<=q.y&&it.y>=q.y){it.y=q.y;it.vy=it.type==='grenade'&&it.armed?-Math.abs(it.vy)*.4:0;it.vx*=.7;break;}
    if(it.type==='mine'&&it.armed&&it.timer<1&&s.players.some(p=>p.alive&&p.seat!==it.owner&&!p.respawn&&Math.hypot(p.x-it.x,p.y-it.y)<32)){explode(s,it);dead.add(it.id);}else if(--it.timer<=0){if(it.armed&&it.type==='grenade')explode(s,it);if(it.type==='grenade'||!it.armed)dead.add(it.id);}if(it.y>stage.bounds[3]+100)dead.add(it.id);
  }
  s.items=s.items.filter(it=>!dead.has(it.id));
  const alive=s.players.filter(p=>p.alive);if(alive.length<=1){s.phase='finished';s.winner=alive[0]?.seat??null;}else if(s.tick>=HZ*300){const ranked=[...alive].sort((a,b)=>b.stocks-a.stocks||a.damage-b.damage);s.phase='finished';s.winner=ranked[0].stocks===ranked[1].stocks&&ranked[0].damage===ranked[1].damage?null:ranked[0].seat;}
}
function valid(value:unknown):value is BrawlerState {
  if(!value||typeof value!=='object')return false;const s=value as BrawlerState;if(s.gameId!=='6232-server'||!stages.some(m=>m.id===s.mapId)||!['waiting','playing','finished'].includes(s.phase)||!Number.isSafeInteger(s.round)||!Number.isSafeInteger(s.tick)||s.tick<0||!Array.isArray(s.players)||s.players.length>4||!Array.isArray(s.ack)||s.ack.length!==4||!Array.isArray(s.platforms)||s.platforms.length>30||!Array.isArray(s.items)||s.items.length>8||!Array.isArray(s.flashes)||s.flashes.length>50)return false;
  return Array.isArray(s.inputs)&&s.inputs.length===4&&s.inputs.every(validInput)&&s.players.every(p=>p&&Number.isInteger(p.seat)&&p.seat>=1&&p.seat<=4&&typeof p.alive==='boolean'&&[p.x,p.y,p.vx,p.vy,p.damage,p.lastAttack,p.lastAlt,p.shield].every(Number.isFinite)&&Number.isInteger(p.stocks)&&p.stocks>=0&&p.stocks<=3&&Number.isSafeInteger(p.deaths)&&p.deaths>=0)&&new Set(s.players.map(p=>p.seat)).size===s.players.length&&s.platforms.every(p=>p&&[p.x,p.y,p.w,p.h].every(Number.isFinite))&&s.items.every(i=>i&&[i.x,i.y,i.vx,i.vy,i.timer].every(Number.isFinite)&&['mine','grenade'].includes(i.type))&&s.flashes.every(f=>f&&[f.x,f.y,f.life].every(Number.isFinite))&&s.ack.every(n=>Number.isSafeInteger(n)&&n>=0);
}
const images:Record<string,HTMLImageElement>={};
function img(name:string):HTMLImageElement {if(!images[name]){images[name]=new Image();images[name].src='/expanded/assets/brawler/'+name+'.png';}return images[name];}
function render(canvas:HTMLCanvasElement,state:State|null,seat:number|null) {
  const ctx=canvas.getContext('2d');if(!ctx)return;const s=(state||create(0,false,[1,2,3,4],1)) as BrawlerState,stage=stageOf(s);const bounds=stage.bounds,worldW=bounds[2]-bounds[0],worldH=bounds[3]-bounds[1];const scale=Math.min(canvas.width/worldW,(canvas.height-75)/worldH);
  ctx.fillStyle=stage.id==='Space'?'#09051c':'#142030';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate((canvas.width-worldW*scale)/2-bounds[0]*scale,45-bounds[1]*scale);ctx.scale(scale,scale);
  const background=img(stage.id+'_Background'),bb=stage.backgroundBounds;if(background.complete&&background.naturalWidth&&bb)ctx.drawImage(background,bb[0],bb[1],bb[2]-bb[0],bb[3]-bb[1]);
  const art=img(stage.id),ab=stage.artBounds;if(art.complete&&art.naturalWidth&&ab)ctx.drawImage(art,ab[0],ab[1],ab[2]-ab[0],ab[3]-ab[1]);
  for(const p of s.platforms){ctx.fillStyle=p.moving?'#ab9974':'#646979';ctx.fillRect(p.x,p.y,p.w,Math.min(p.h,9));ctx.fillStyle='#e2c878';ctx.fillRect(p.x,p.y,p.w,2);}
  for(const it of s.items){ctx.fillStyle=it.type==='grenade'?'#77994c':'#986c53';ctx.beginPath();ctx.arc(it.x,it.y-5,6,0,Math.PI*2);ctx.fill();if(it.armed){ctx.fillStyle='#f47b45';ctx.fillRect(it.x-2,it.y-13,4,4);}}
  const colors=['#76e6ff','#ff7b8c','#a6f27b','#dac0ff'];
  for(const p of s.players){if(!p.alive||p.respawn)continue;ctx.save();ctx.translate(p.x,p.y);ctx.scale(p.facing,1);ctx.globalAlpha=p.invincible&&Math.floor(s.tick/3)%2?.4:1;const fi=p.grounded?(Math.abs(p.vx)>.2?2:1):p.jumps>1?4:3;const sprite=img(data.fighters[p.character].id+'-'+fi);if(sprite.complete&&sprite.naturalWidth)ctx.drawImage(sprite,-14,-29,28,30);else{ctx.fillStyle=colors[p.seat-1];ctx.fillRect(-10,-26,20,26);}if(p.guarding){ctx.strokeStyle=colors[p.seat-1];ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-14,20*p.shield/100+7,0,Math.PI*2);ctx.stroke();}if(p.attackFrame>0){ctx.strokeStyle='#ffe495';ctx.lineWidth=3;ctx.beginPath();ctx.arc(10,-16,25,-1,1);ctx.stroke();}ctx.restore();ctx.fillStyle=colors[p.seat-1];ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText(p.seat===seat?'你':`P${p.seat}`,p.x,p.y-36);}
  for(const f of s.flashes){ctx.fillStyle='rgba(255,198,78,.65)';ctx.beginPath();ctx.arc(f.x,f.y,(15-f.life)*4+8,0,Math.PI*2);ctx.fill();}ctx.restore();
  ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(0,0,canvas.width,44);ctx.font='bold 16px sans-serif';ctx.textAlign='left';ctx.fillStyle='#ecdfb9';ctx.fillText(`疯狂小斗士 · ${stage.label}   击飞出界 / 3 条生命`,18,28);
  const width=canvas.width/4;for(const p of s.players){ctx.fillStyle=colors[p.seat-1];ctx.font='bold 17px sans-serif';ctx.fillText(`P${p.seat}  ${p.damage}%  ${'●'.repeat(p.stocks)}  KO:${p.kos}`,(p.seat-1)*width+12,canvas.height-15);}
  if(s.phase==='finished'){ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillRect(150,canvas.height/2-50,canvas.width-300,100);ctx.fillStyle='#ffe2a1';ctx.font='bold 30px sans-serif';ctx.textAlign='center';ctx.fillText(s.winner===null?'平局':`P${s.winner} 获胜！`,canvas.width/2,canvas.height/2+10);}
}
export const adapter:Adapter={id:'6232-server',title:'疯狂小人战斗',seats:4,hz:HZ,width:1000,height:650,controls:'A/D 或 ←/→ 移动，W/↑ 二段跳，J/空格 攻击/拾取，W/↑+攻击 上击，S/↓+攻击 特技，S/↓ 防御/穿过薄平台。',maps:stages.map(m=>({id:m.id,label:m.label})),create,step,valid,render,consumeInput(state,seat,input){const p=(state as BrawlerState).players.find(x=>x.seat===seat);if(p){p.lastAttack=Math.max(p.lastAttack,input.attack);p.lastAlt=Math.max(p.lastAlt,input.alt);p.upHeld=input.up;}}};
