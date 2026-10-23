// Bomb It 2: source-bound 17x15 simulation. Provenance: TANK_BOMB2_RECONSTRUCTION.md.
import type { Input, State, Adapter } from './types';
import { MAPS } from './bomb2-maps';
import { BRICKS } from './bomb2-art';
import { KILL_ART } from './bomb2-kill-art';
import { drawPlayerStatus, weaponBadge } from '../authority/player-status';
import { BOMB2_CANVAS_WIDTH, bomb2Weapon, bomb2Status } from './bomb2-status';
export const HZ = 40, WIDTH = 17, HEIGHT = 15, ROUND_TICKS = HZ * 180, FUSE = 62;
const DIRS = [[-1,0],[0,-1],[1,0],[0,1]];
const SPAWNS = [[1,1],[15,1],[1,13],[15,13]];
const PROPS = [1,1,1,1,2,2,2,2,3,3,6,6,7,22,4,15,16,21,20,19,17,18,11,12,13,14];
export const KILL_PROPS = [16,16,21,21,21,20,20,20,19,19,19,17,17,18,18,7];
export const MODES = ['arcade','kill','collect','color'];
export const RESPAWN_TICKS = 64, RESPAWN_PROTECTION_TICKS = 80;
export const WEAPON_USES:Record<number,number> = {15:2,16:2,17:1,18:1,19:2,20:2,21:2};
// Original sprite frame counts: hammer 25, launcher 14, shotgun 8,
// laser warmup 12 + 11 active ticks, flamethrower's nested fire_Play 24.
export const WEAPON_LOCK:Record<number,number> = {15:25,16:14,17:0,18:0,19:8,20:23,21:24};
const THEMES: Record<string,string> = {mine:'矿洞',beach:'海滩',snow:'冰雪',disce:'迪斯科',factory:'工厂',center:'城市'};
const LABELS: Record<number,string> = {1:'炸弹+1',2:'威力+1',3:'速度+1',4:'生命+1',6:'踢弹',7:'无敌',9:'金币',11:'飞机',12:'推土机',13:'汽车',14:'青蛙',15:'锤子',16:'火箭',17:'遥控弹',18:'地雷',19:'霰弹枪',20:'激光',21:'喷火器',22:'护盾'};
export function weaponLabel(s:State,p:any):string {
  if(p.respawnAt>s.tick)return `复活中 · ${((p.respawnAt-s.tick)/HZ).toFixed(1)} 秒`;
  if(p.attack)return `${LABELS[p.attack.kind]} · 释放中`;
  if(p.weapon)return `${LABELS[p.weapon]} ×${p.ammo}${p.actionLock?' · 释放中':''}`;
  if(s.bombs.some((b:any)=>b.owner===p.seat&&b.kind==='remote'))return '遥控弹 · 按攻击引爆';
  return s.mode==='kill'?'基础锤子 · 无限使用':'炸弹';
}
export const index = (x:number,y:number):number => y * WIDTH + x;
function random(s:State):number { let x=s.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296; }
const inside=(x:number,y:number)=>x>=0&&x<WIDTH&&y>=0&&y<HEIGHT;
function direction(i:Input):number { return i.left?0:i.up?1:i.right?2:i.down?3:-1; }
export function create(round:number,playing:boolean,seats:number[],seed:number,mapId?:string,gameMode?:string):State {
  const [legacyMode,selectedMap] = mapId?.includes(':')?mapId.split(':'):['arcade',mapId];
  const selectedMode=gameMode??legacyMode;
  const mode=MODES.includes(selectedMode)?selectedMode:'arcade';
  const map=MAPS.find(m=>m.id===selectedMap)||MAPS[(round-1)%MAPS.length];
  const s:State={gameId:'9109-server',version:1,round,tick:0,phase:playing?'playing':'waiting',winner:null,ack:[0,0,0,0],rng:(seed>>>0)||1,
    mode,mapId:map.id,theme:map.theme,board:Array(255).fill(0),tiles:Array(255).fill(0),items:Array(255).fill(0),flames:Array(255).fill(0),owners:Array(255).fill(0),colors:Array(255).fill(0),bombs:[],shots:[],effects:[],hazards:map.hazards.map(h=>({...h})),nextId:1,scores:[0,0,0,0],players:[],tram:0};
  const params=Array.from({length:255},()=>({empty:0,fixed:0,crate:0,mid:0,frame:-1}));
  for(const op of map.ops) {
    const [name,x,y,value,frame]=op as readonly any[];const p=params[index(x,y)];
    if(name==='setNull')p.empty=value;else if(name==='setFixedProb'){p.fixed=value;p.frame=frame??-1;}
    else if(name==='setUnfixedProb')p.crate=value;else if(name==='setMidBox'){p.empty=1;p.mid=value?3:2;}
  }
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
    const cell=index(x,y),p=params[cell],r=random(s);
    if(p.mid){s.board[cell]=1;s.tiles[cell]=p.mid===3?map.begin+8:0;}
    else if(r>p.empty&&r<p.empty+p.fixed){s.board[cell]=1;s.tiles[cell]=map.begin+5+(p.frame>=0?p.frame:Math.floor(random(s)*2));}
    else if(r>p.empty+p.fixed&&r<p.empty+p.fixed+p.crate){s.board[cell]=2;s.tiles[cell]=map.begin+Math.floor(random(s)*3);}
  }
  for(const seat of [...new Set(seats)].filter(n=>Number.isInteger(n)&&n>=1&&n<=4).sort((a,b)=>a-b)){
    const [x,y]=SPAWNS[seat-1];
    for(const [dx,dy] of [[0,0],...DIRS])if(x+dx>0&&x+dx<16&&y+dy>0&&y+dy<14){s.board[index(x+dx,y+dy)]=0;s.tiles[index(x+dx,y+dy)]=0;}
    s.players.push({seat,x,y,dir:3,moveDir:-1,progress:0,moveTicks:8,speed:8,alive:true,life:3,capacity:1,range:1,kick:false,shield:false,invulnerable:mode==='kill'?RESPAWN_PROTECTION_TICKS:0,lastAttack:0,lastAlt:0,weapon:0,ammo:0,vehicle:0,vehicleUntil:0,respawnAt:0,teleportUntil:0,killedBy:0,points:0,kills:0,deaths:0,diedAt:0,actionLock:0,attack:null,weaponStock:[]});
  }
  if(mode==='collect')for(let i=0;i<5;i++)spawnCoin(s);
  return s;
}
function spawnCoin(s:State):void {
  const cells=s.board.map((v:number,i:number)=>v===0&&!s.items[i]&&!s.players.some(p=>index(p.x,p.y)===i)?i:-1).filter((i:number)=>i>=0);
  if(cells.length)s.items[cells[Math.floor(random(s)*cells.length)]]=9;
}
function passable(s:State,x:number,y:number):boolean {
  const rail=s.hazards.filter((h:any)=>h.kind==='Rail'),tram=rail.length?rail[Math.floor(s.tram)%rail.length]:null;
  return inside(x,y)&&s.board[index(x,y)]===0&&!s.bombs.some((b:any)=>b.x===x&&b.y===y)&&!(tram&&tram.x===x&&tram.y===y);
}
function breakCrate(s:State,cell:number):void {
  if(s.board[cell]!==2)return;s.board[cell]=0;s.tiles[cell]=0;
  const pool=s.mode==='kill'?KILL_PROPS:PROPS;
  if(s.items.filter((item:number)=>item!==0).length<32&&random(s)<.6)s.items[cell]=pool[Math.floor(random(s)*pool.length)];
}
function ignite(s:State,x:number,y:number,owner:number):void {
  if(!inside(x,y)||s.board[index(x,y)]===1)return;
  const cell=index(x,y);if(s.flames[cell]<=s.tick)s.owners[cell]=owner;s.flames[cell]=s.tick+16;
  breakCrate(s,cell);
  for(const b of s.bombs)if(b.x===x&&b.y===y)b.explodeAt=Math.min(b.explodeAt,s.tick);
}
function place(s:State,p:any,kind='normal',x=p.x,y=p.y):boolean {
  if(!inside(x,y)||s.board[index(x,y)]||s.bombs.length>=32||s.bombs.some((b:any)=>b.x===x&&b.y===y)||s.bombs.filter((b:any)=>b.owner===p.seat).length>=p.capacity)return false;
  s.bombs.push({id:s.nextId++,owner:p.seat,x,y,range:kind==='mine'?2:p.range,kind,explodeAt:kind==='normal'?s.tick+FUSE:kind==='thrown'?s.tick+25:ROUND_TICKS+FUSE,armedAt:kind==='mine'?ROUND_TICKS+20:s.tick+20,slide:-1});
  return true;
}
function take(s:State,p:any):void {
  const cell=index(p.x,p.y),item=s.items[cell];if(!item)return;s.items[cell]=0;
  if(item===1)p.capacity=Math.min(8,p.capacity+1);else if(item===2)p.range=Math.min(10,p.range+1);else if(item===3)p.speed=Math.max(6,p.speed-1);
  else if(item===4)p.life=Math.min(5,p.life+1);else if(item===6)p.kick=true;else if(item===7)p.invulnerable=HZ*10;else if(item===22)p.shield=true;
  else if(item===9){p.points++;s.scores[p.seat-1]=p.points;}
  else if(item>=11&&item<=14){p.vehicle=item;p.vehicleUntil=s.tick+HZ*15;p.shield=true;}
  else {p.weapon=item;p.ammo=WEAPON_USES[item]||2;if(s.mode==='kill'){p.weaponStock.push(item);p.weaponStock=p.weaponStock.slice(-32);}}
}
function dropWeapons(s:State,p:any):void {
  for(let n=0;n<2&&p.weaponStock.length;n++){
    const item=p.weaponStock.splice(Math.floor(random(s)*p.weaponStock.length),1)[0];
    const cells=s.board.map((v:number,i:number)=>v===0&&!s.items[i]&&!s.bombs.some((b:any)=>index(b.x,b.y)===i)&&Math.abs(i%WIDTH-p.x)+Math.abs(Math.floor(i/WIDTH)-p.y)<=2?i:-1).filter((i:number)=>i>=0);
    if(cells.length)s.items[cells[Math.floor(random(s)*cells.length)]]=item;
  }
}
function hit(s:State,p:any,owner:number):void {
  if(!p.alive||p.respawnAt>s.tick||p.invulnerable>0)return;
  if(p.shield){p.shield=false;p.vehicle=0;p.invulnerable=HZ;return;}
  if(s.mode==='arcade')p.life--;p.deaths++;p.diedAt=s.tick;p.killedBy=owner;p.moveDir=-1;p.progress=0;
  if(p.life<=0){p.alive=false;p.respawnAt=0;}else p.respawnAt=s.tick+(s.mode==='kill'?RESPAWN_TICKS:HZ);
  p.attack=null;p.actionLock=0;
  if(s.mode==='kill')dropWeapons(s,p);
  p.weaponStock=[];p.weapon=0;p.ammo=0;p.speed=8;p.moveTicks=8;p.capacity=1;p.range=1;p.kick=false;p.shield=false;p.vehicle=0;p.vehicleUntil=0;p.invulnerable=0;
  const killer=s.players.find(q=>q.seat===owner);
  if(killer&&owner!==p.seat){killer.kills++;if(s.mode==='kill'){killer.points++;s.scores[owner-1]=killer.points;}}
  else if(s.mode==='kill'&&owner===p.seat&&p.points>0){p.points--;s.scores[p.seat-1]=p.points;}
}
function useWeapon(s:State,p:any):void {
  if(p.actionLock>0||p.attack||p.moveDir>=0)return;
  const remote=s.bombs.filter((b:any)=>b.owner===p.seat&&b.kind==='remote');
  if(remote.length){for(const b of remote)b.explodeAt=s.tick;return;}
  const kind=p.weapon|| (s.mode==='kill'?15:0);if(!kind||p.weapon&&p.ammo<=0)return;
  if(kind===17||kind===18){
    if(!place(s,p,kind===17?'remote':'mine'))return;
    p.actionLock=8; // Online debounce for instantaneous trap placement.
  }else{
    if(s.shots.length>=64||s.effects.length>=64)return;
    p.actionLock=WEAPON_LOCK[kind];
    p.attack={kind,dir:p.dir,x:p.x,y:p.y,born:s.tick,at:s.tick+(kind===20?12:kind===21?1:WEAPON_LOCK[kind]),remaining:p.weapon?Math.max(0,p.ammo-1):-1};
  }
  if(p.weapon&&--p.ammo<=0)p.weapon=0;
}
function updateAttacks(s:State):void {
  for(const p of s.players){const attack=p.attack;if(!attack||attack.at>s.tick)continue;p.attack=null;
    if(!p.alive||p.respawnAt>s.tick)continue;
    const {kind,dir,x,y}=attack,[dx,dy]=DIRS[dir];
    if(kind===15){
      const tx=x+dx,ty=y+dy;
      if(inside(tx,ty)){const cell=index(tx,ty);if(s.board[cell]===2)breakCrate(s,cell);else if(s.board[cell]===0)s.items[cell]=0;
        for(const b of s.bombs)if(b.x===tx&&b.y===ty)b.explodeAt=s.tick;
        for(const q of s.players)if(q.seat!==p.seat&&((q.x===tx&&q.y===ty)||(q.x===x&&q.y===y)))hit(s,q,p.seat);
      }
    }else if((kind===16||kind===19)&&s.shots.length<64){
      s.shots.push({id:s.nextId++,owner:p.seat,x:x+.5,y:y+.5,vx:dx*(kind===19?12/30:10/30),vy:dy*(kind===19?12/30:10/30),until:s.tick+HZ*4,kind});
    }else if((kind===20||kind===21)&&s.effects.length<64){
      const effect={id:s.nextId++,kind,owner:p.seat,x,y,dir,born:s.tick,until:s.tick+(kind===20?11:23),cells:[] as number[]};
      // Laser constructs its beam once. The first crate/bomb ends the beam,
      // even after destruction; later animation frames cannot extend it.
      if(kind===20)for(let d=1;d<Math.max(WIDTH,HEIGHT);d++){
        const tx=x+dx*d,ty=y+dy*d;if(!inside(tx,ty)||s.board[index(tx,ty)]===1)break;
        const cell=index(tx,ty),blocked=s.board[cell]===2||s.bombs.some((b:any)=>b.x===tx&&b.y===ty);
        effect.cells.push(cell);if(blocked)break;
      }
      s.effects.push(effect);
    }
  }
  for(const effect of s.effects){if(effect.until<=s.tick)continue;
    const [dx,dy]=DIRS[effect.dir];
    if(effect.kind===21){effect.cells=[];const range=Math.min(3,1+Math.floor((s.tick-effect.born)/8));
      for(let d=1;d<=range;d++){const x=effect.x+dx*d,y=effect.y+dy*d;if(!inside(x,y)||s.board[index(x,y)]===1)break;effect.cells.push(index(x,y));}
    }
    for(const cell of effect.cells){
      const x=cell%WIDTH,y=Math.floor(cell/WIDTH);
      if(effect.kind===21||effect.born===s.tick){
        if(s.board[cell]===2)breakCrate(s,cell);else s.items[cell]=0;
        for(const b of s.bombs)if(b.x===x&&b.y===y)b.explodeAt=s.tick;
      }
      for(const q of s.players)if(q.seat!==effect.owner&&q.x===x&&q.y===y)hit(s,q,effect.owner);
    }
  }
  s.effects=s.effects.filter((effect:any)=>effect.until>s.tick);
}
function hazards(s:State,p:any):void {
  if(p.teleportUntil>s.tick||p.vehicle===11)return;
  const h=s.hazards.find((h:any)=>h.x===p.x&&h.y===p.y);if(!h)return;
  if(h.kind==='QuickSand'&&h.target!==undefined){const t=s.hazards[h.target];if(t&&passable(s,t.x,t.y)){p.x=t.x;p.y=t.y;p.teleportUntil=s.tick+HZ;}}
  else if(h.kind==='SpringBoard'){const [dx,dy]=DIRS[p.dir];for(let d=2;d>0;d--)if(passable(s,p.x+dx*d,p.y+dy*d)){p.x+=dx*d;p.y+=dy*d;p.teleportUntil=s.tick+20;break;}}
  else if(h.kind==='Transmittal'){const dir=[0,0,2,1,3][h.dir]??p.dir;const [dx,dy]=DIRS[dir];if(passable(s,p.x+dx,p.y+dy)){p.moveDir=dir;p.moveTicks=p.speed+2;p.progress=0;}}
  else if(h.kind==='IceFace'){const [dx,dy]=DIRS[p.dir];if(passable(s,p.x+dx,p.y+dy)){p.moveDir=p.dir;p.moveTicks=Math.max(3,p.speed-2);p.progress=0;}}
}
export function step(s:State,inputs:Input[]):void {
  if(s.phase!=='playing')return;s.tick++;
  const rails=s.hazards.filter((h:any)=>h.kind==='Rail');if(rails.length)s.tram=(s.tram+1/30)%rails.length;
  for(const p of s.players){
    const input=inputs[p.seat-1];if(input)s.ack[p.seat-1]=Math.max(s.ack[p.seat-1],input.seq);
    if(!p.alive)continue;
    if(p.respawnAt){if(input){p.lastAttack=Math.max(p.lastAttack,input.attack);p.lastAlt=Math.max(p.lastAlt,input.alt);}if(p.respawnAt>s.tick)continue;const [x,y]=SPAWNS[p.seat-1];p.x=x;p.y=y;p.respawnAt=0;p.invulnerable=RESPAWN_PROTECTION_TICKS;}
    if(p.invulnerable>0)p.invulnerable--;if(p.vehicle&&p.vehicleUntil<=s.tick)p.vehicle=0;
    if(p.actionLock>0)p.actionLock--;
    if(p.moveDir>=0){if(++p.progress>=p.moveTicks){const [dx,dy]=DIRS[p.moveDir];p.x+=dx;p.y+=dy;p.progress=0;p.moveDir=-1;take(s,p);hazards(s,p);}}
    if(input){
      if(p.actionLock>0||p.attack){p.lastAttack=Math.max(p.lastAttack,input.attack);p.lastAlt=Math.max(p.lastAlt,input.alt);}
      else if(p.moveDir<0){
        const dir=direction(input);if(dir>=0)p.dir=dir;
        if(input.attack>p.lastAttack){p.lastAttack=input.attack;if(s.mode==='kill'||p.weapon||s.bombs.some((b:any)=>b.kind==='remote'&&b.owner===p.seat))useWeapon(s,p);else place(s,p);}
        if(input.alt>p.lastAlt){p.lastAlt=input.alt;useWeapon(s,p);}
      }else if(s.mode!=='kill'&&!p.weapon&&!s.bombs.some((b:any)=>b.kind==='remote'&&b.owner===p.seat)&&input.attack>p.lastAttack){p.lastAttack=input.attack;place(s,p);}
    }
    if(p.moveDir<0&&input&&p.actionLock===0&&!p.attack){const dir=direction(input);if(dir>=0){p.dir=dir;const [dx,dy]=DIRS[dir],x=p.x+dx,y=p.y+dy;
      const bomb=s.bombs.find((b:any)=>b.x===x&&b.y===y);if(bomb&&p.kick&&passable(s,x+dx,y+dy)){bomb.slide=dir;bomb.x+=dx;bomb.y+=dy;}
      if(p.vehicle===12&&inside(x,y)&&s.board[index(x,y)]===2)breakCrate(s,index(x,y));
      if(passable(s,x,y)){p.moveDir=dir;p.moveTicks=p.vehicle===13?4:p.vehicle===14?5:p.speed;p.progress=0;}}
    }
    if(s.mode==='color'&&s.board[index(p.x,p.y)]===0)s.colors[index(p.x,p.y)]=p.seat;
    if(s.flames[index(p.x,p.y)]>s.tick)hit(s,p,s.owners[index(p.x,p.y)]);
  }
  updateAttacks(s);
  for(const b of s.bombs){
    if(b.slide>=0&&s.tick%3===0){const [dx,dy]=DIRS[b.slide];if(passable(s,b.x+dx,b.y+dy)){b.x+=dx;b.y+=dy;}else b.slide=-1;}
    if(b.kind==='mine'){
      const owner=s.players.find(p=>p.seat===b.owner);
      if(b.armedAt>s.tick&&(!owner||!owner.alive||owner.respawnAt||owner.x!==b.x||owner.y!==b.y))b.armedAt=s.tick;
      if(b.armedAt<=s.tick&&s.players.some(p=>p.alive&&!p.respawnAt&&p.x===b.x&&p.y===b.y))b.explodeAt=s.tick;
    }
    if(s.flames[index(b.x,b.y)]>s.tick)b.explodeAt=s.tick;
  }
  s.shots=s.shots.filter((shot:any)=>{
    for(let k=0;k<4;k++){
      const oldX=Math.floor(shot.x),oldY=Math.floor(shot.y);
      shot.x+=shot.vx/4;shot.y+=shot.vy/4;const x=Math.floor(shot.x),y=Math.floor(shot.y);
      if(!inside(x,y))return false;if(s.board[index(x,y)]||s.bombs.some((b:any)=>b.x===x&&b.y===y)){
        if(shot.kind===16){const tx=s.board[index(x,y)]===1?oldX:x,ty=s.board[index(x,y)]===1?oldY:y;ignite(s,tx,ty,shot.owner);for(const [dx,dy]of DIRS)ignite(s,tx+dx,ty+dy,shot.owner);}
        else {breakCrate(s,index(x,y));for(const b of s.bombs)if(b.x===x&&b.y===y)b.explodeAt=s.tick;}
        return false;
      }
      const p=s.players.find(p=>p.alive&&!p.respawnAt&&p.seat!==shot.owner&&Math.hypot(p.x+.5-shot.x,p.y+.5-shot.y)<.4);
      if(p){if(shot.kind===16){ignite(s,x,y,shot.owner);for(const [dx,dy]of DIRS)ignite(s,x+dx,y+dy,shot.owner);}else hit(s,p,shot.owner);return false;}
    }return shot.until>s.tick;
  });
  const exploded=new Set<number>();
  for(let cycle=0;cycle<32;cycle++){
    const b=s.bombs.find((b:any)=>b.explodeAt<=s.tick&&!exploded.has(b.id));if(!b)break;exploded.add(b.id);ignite(s,b.x,b.y,b.owner);
    for(const [dx,dy] of DIRS)for(let distance=1;distance<=b.range;distance++){
      const x=b.x+dx*distance,y=b.y+dy*distance;if(!inside(x,y)||s.board[index(x,y)]===1)break;
      const crate=s.board[index(x,y)]===2;ignite(s,x,y,b.owner);if(crate)break;
    }
    if(b.kind==='mine')for(const dx of [-1,1])for(const dy of [-1,1])ignite(s,b.x+dx,b.y+dy,b.owner);
  }
  s.bombs=s.bombs.filter((b:any)=>!exploded.has(b.id));
  for(const p of s.players)if(p.alive&&!p.respawnAt&&s.flames[index(p.x,p.y)]>s.tick)hit(s,p,s.owners[index(p.x,p.y)]);
  for(const h of s.hazards)if(h.kind==='TurnTable'&&s.tick%(HZ*23)===0){
    const cells=s.board.map((v:number,i:number)=>v===0&&!s.items[i]&&Math.abs(i%WIDTH-h.x)+Math.abs(Math.floor(i/WIDTH)-h.y)<=4?i:-1).filter((i:number)=>i>=0);
    const pool=s.mode==='kill'?KILL_PROPS:PROPS;
    for(let i=0;i<2&&cells.length;i++){const cell=cells.splice(Math.floor(random(s)*cells.length),1)[0];s.items[cell]=pool[Math.floor(random(s)*pool.length)];}
  }
  if(s.mode==='collect'&&s.tick%(HZ*6)===0)spawnCoin(s);
  if(s.mode==='color')for(const p of s.players){p.points=s.colors.filter((v:number)=>v===p.seat).length;s.scores[p.seat-1]=p.points;}
  const alive=s.players.filter(p=>p.alive),target=s.mode==='color'?50:s.mode==='arcade'?Infinity:10;
  const reached=s.players.filter(p=>p.points>=target);
  if(alive.length<=1||reached.length||s.tick>=ROUND_TICKS){
    s.phase='finished';
    if(reached.length)s.winner=reached.length===1?reached[0].seat:null;else if(alive.length===1)s.winner=alive[0].seat;else if(s.tick>=ROUND_TICKS){
      const ranks=alive.map(p=>({seat:p.seat,score:s.mode==='arcade'?p.life:p.points})).sort((a,b)=>b.score-a.score);
      s.winner=ranks.length&&ranks[0].score!==(ranks[1]?.score)?ranks[0].seat:null;
    }else s.winner=null;
    if(s.winner!==null&&s.mode==='arcade')s.scores[s.winner-1]++;
  }
}
export function valid(value:unknown):value is State {
  if(!value||typeof value!=='object')return false;const s=value as State;
  const int=(n:any,lo:number,hi:number)=>Number.isSafeInteger(n)&&n>=lo&&n<=hi;
  if(s.gameId!=='9109-server'||s.version!==1||!int(s.round,1,Number.MAX_SAFE_INTEGER)||!int(s.tick,0,ROUND_TICKS)||!int(s.rng,0,0xffffffff)||!int(s.nextId,1,1e7)||!MODES.includes(s.mode)||!MAPS.some(m=>m.id===s.mapId&&m.theme===s.theme)||!['waiting','playing','finished'].includes(s.phase))return false;
  if(!Array.isArray(s.players)||s.players.length>4||new Set(s.players.map(p=>p?.seat)).size!==s.players.length||!s.players.every(p=>p&&int(p.seat,1,4)&&int(p.x,0,16)&&int(p.y,0,14)&&typeof p.alive==='boolean'&&int(p.life,0,5)&&int(p.dir,0,3)&&int(p.moveDir,-1,3)&&int(p.progress,0,19)&&int(p.moveTicks,3,20)&&p.progress<p.moveTicks&&int(p.speed,4,8)&&int(p.capacity,1,8)&&int(p.range,1,10)&&int(p.lastAttack,0,1e9)&&int(p.lastAlt,0,1e9)&&int(p.invulnerable,0,HZ*10)&&int(p.weapon,0,22)&&int(p.ammo,0,3)&&int(p.respawnAt,0,ROUND_TICKS+RESPAWN_TICKS)&&int(p.teleportUntil,0,ROUND_TICKS+HZ)&&int(p.points,0,255)&&int(p.kills,0,1000)&&int(p.deaths,0,1000)&&int(p.killedBy,0,4)&&int(p.vehicle,0,14)&&int(p.vehicleUntil,0,ROUND_TICKS+HZ*15)&&typeof p.kick==='boolean'&&typeof p.shield==='boolean'))return false;
  if(s.winner!==null&&!s.players.some(p=>p.seat===s.winner))return false;
  for(const [key,max] of [['board',2],['tiles',59],['items',22],['flames',ROUND_TICKS+16],['owners',4],['colors',4]] as const)if(!Array.isArray(s[key])||s[key].length!==255||!s[key].every((v:any)=>int(v,0,max)))return false;
  if(!Array.isArray(s.ack)||s.ack.length!==4||!s.ack.every((n:any)=>int(n,0,1e9))||!Array.isArray(s.scores)||s.scores.length!==4||!s.scores.every((n:any)=>int(n,0,1000)))return false;
  const owns=(owner:any)=>s.players.some(p=>p.seat===owner);
  if(!Array.isArray(s.bombs)||s.bombs.length>32||!s.bombs.every((b:any)=>b&&int(b.id,1,s.nextId-1)&&owns(b.owner)&&int(b.x,0,16)&&int(b.y,0,14)&&int(b.range,1,10)&&['normal','remote','mine','thrown'].includes(b.kind)&&int(b.slide,-1,3)&&int(b.explodeAt,0,ROUND_TICKS+FUSE)&&int(b.armedAt,0,ROUND_TICKS+20)))return false;
  if(!Array.isArray(s.shots)||s.shots.length>64||!s.shots.every((b:any)=>b&&int(b.id,1,s.nextId-1)&&owns(b.owner)&&Number.isFinite(b.x)&&b.x>=0&&b.x<=17&&Number.isFinite(b.y)&&b.y>=0&&b.y<=15&&Number.isFinite(b.vx)&&Math.abs(b.vx)<=1&&Number.isFinite(b.vy)&&Math.abs(b.vy)<=1&&[16,19].includes(b.kind)&&int(b.until,0,ROUND_TICKS+HZ*4)))return false;
  if(!s.players.every(p=>int(p.actionLock,0,25)&&Array.isArray(p.weaponStock)&&p.weaponStock.length<=32&&p.weaponStock.every((kind:any)=>Object.prototype.hasOwnProperty.call(WEAPON_USES,kind))&&
    (p.attack===null||p.attack&&[15,16,19,20,21].includes(p.attack.kind)&&int(p.attack.dir,0,3)&&int(p.attack.x,0,16)&&int(p.attack.y,0,14)&&int(p.attack.born,0,s.tick)&&int(p.attack.at,p.attack.born,ROUND_TICKS+25))))return false;
  if(!Array.isArray(s.effects)||s.effects.length>64||!s.effects.every((e:any)=>e&&int(e.id,1,s.nextId-1)&&owns(e.owner)&&[20,21].includes(e.kind)&&int(e.x,0,16)&&int(e.y,0,14)&&int(e.dir,0,3)&&int(e.born,0,s.tick)&&int(e.until,e.born,ROUND_TICKS+25)&&Array.isArray(e.cells)&&e.cells.length<=17&&e.cells.every((cell:any)=>int(cell,0,254))))return false;
  if(typeof s.tram!=='number'||!Number.isFinite(s.tram)||s.tram<0||s.tram>100)return false;
  const map=MAPS.find(m=>m.id===s.mapId)!;
  return Array.isArray(s.hazards)&&s.hazards.length===map.hazards.length&&s.hazards.every((h:any,i:number)=>JSON.stringify(h)===JSON.stringify(map.hazards[i]));
}
const images=new Map<string,HTMLImageElement>();
function asset(name:string):HTMLImageElement {let img=images.get(name);if(!img){img=new Image();img.src='/expanded/assets/bomb2/'+name+'.png';images.set(name,img);}return img;}
function draw(ctx:CanvasRenderingContext2D,name:string,x:number,y:number,w:number,h:number):boolean {const img=asset(name);if(img.complete&&img.naturalWidth){ctx.drawImage(img,x,y,w,h);return true;}return false;}
function timeline(ctx:CanvasRenderingContext2D,name:string,frame:number,x:number,y:number,feet=false):boolean {
  const meta=KILL_ART[name],img=asset('kill-'+name);if(!meta||!img.complete||!img.naturalWidth)return false;
  const n=Math.max(0,Math.min(meta.frames-1,Math.floor(frame)));
  ctx.drawImage(img,n*meta.w,0,meta.w,meta.h,x+(feet?-meta.w/2:meta.x),y+(feet?-meta.feet:meta.y),meta.w,meta.h);return true;
}
export function render(canvas:HTMLCanvasElement,s:State|null,seat:number|null):void {
  const ctx=canvas.getContext('2d')!;const cell=30,left=45,top=66;ctx.clearRect(0,0,BOMB2_CANVAS_WIDTH,550);ctx.fillStyle='#302f46';ctx.fillRect(0,0,BOMB2_CANVAS_WIDTH,550);
  ctx.fillStyle='#fff';ctx.font='bold 21px system-ui';ctx.fillText('泡泡堂 2',24,32);if(!s)return;
  ctx.font='15px system-ui';ctx.fillText(`${THEMES[s.theme]} · ${['生存','击杀 10','金币 10','占地 50'][MODES.indexOf(s.mode)]}`,180,31);ctx.fillText(`${Math.max(0,Math.ceil((ROUND_TICKS-s.tick)/HZ))} 秒`,500,31);
  draw(ctx,'background-'+s.theme,left,top,WIDTH*cell,HEIGHT*cell);
  for(const h of s.hazards){const px=left+h.x*cell,py=top+h.y*cell;
    if(h.kind==='QuickSand')draw(ctx,`quicksand-${h.dir}-1`,px,py,cell,cell);
    else if(h.kind==='Transmittal')draw(ctx,'conveyor-'+h.dir,px,py,cell,cell);
    else if(h.kind==='Rail')draw(ctx,'rail-'+h.dir,px,py,cell,cell);
    else if(h.kind==='SpringBoard')draw(ctx,'brick-40',px,py,cell,cell);
    else if(h.kind==='IceFace')draw(ctx,'brick-30',px,py,cell,cell);
    else if(h.kind==='TurnTable')draw(ctx,'turntable-1',px-13,py-17,90,90);
  }
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
    const i=index(x,y),px=left+x*cell,py=top+y*cell;
    if(s.colors[i]){ctx.fillStyle=['','#009aff66','#ff97cc66','#ffbd4566','#59af5466'][s.colors[i]];ctx.fillRect(px,py,cell,cell);}
    if(s.board[i]&&s.tiles[i]){const b=BRICKS[s.tiles[i]];if(b?.w)draw(ctx,'brick-'+s.tiles[i],px+b.x,py+b.y,b.w,b.h);}
    if(s.items[i])draw(ctx,'prop-'+s.items[i],px+3,py+3,cell-6,cell-6);
    if(s.flames[i]>s.tick){ctx.fillStyle='#ffba38bf';ctx.fillRect(px+2,py+2,cell-4,cell-4);draw(ctx,'blast-'+(s.tick%9+1),px,py,cell,cell);}
  }
  for(const b of s.bombs){draw(ctx,'bomb-'+(s.tick%4+1),left+b.x*cell+2,top+b.y*cell+2,cell-4,cell-4);if(b.kind!=='normal'){ctx.fillStyle=b.kind==='remote'?'#2ea5ff':'#ed5d55';ctx.fillRect(left+b.x*cell+10,top+b.y*cell+10,8,8);}}
  for(const effect of s.effects){
    ctx.fillStyle=effect.kind===20?'#ff4aaa':'#ff9c27cc';
    if(effect.kind===21){
      ctx.save();ctx.beginPath();for(const i of effect.cells)ctx.rect(left+(i%WIDTH)*cell,top+Math.floor(i/WIDTH)*cell,cell,cell);ctx.clip();
      ctx.translate(left+(effect.x+.5)*cell,top+(effect.y+.5)*cell);ctx.rotate([Math.PI,-Math.PI/2,0,Math.PI/2][effect.dir]);
      const meta=KILL_ART.fire,img=asset('kill-fire');if(img.complete&&img.naturalWidth)ctx.drawImage(img,Math.min(meta.frames-1,s.tick-effect.born)*meta.w,0,meta.w,meta.h,cell/2,-meta.h/2,meta.w,meta.h);
      ctx.restore();
    }
    for(const i of effect.cells){const x=left+(i%WIDTH)*cell,y=top+Math.floor(i/WIDTH)*cell;
      if(effect.kind===20){const [dx]=DIRS[effect.dir];ctx.fillRect(x+(dx?0:12),y+(dx?12:0),dx?cell:6,dx?6:cell);}
      else if(!asset('kill-fire').naturalWidth){ctx.fillRect(x+3,y+4,cell-6,cell-8);}
    }
  }
  for(const shot of s.shots){ctx.fillStyle=shot.kind===20?'#ff4aaa':'#ffe44e';ctx.beginPath();ctx.arc(left+shot.x*cell,top+shot.y*cell,shot.kind===20?3:5,0,Math.PI*2);ctx.fill();}
  const rails=s.hazards.filter((h:any)=>h.kind==='Rail');if(rails.length){const pos=Math.floor(s.tram),part=s.tram-pos,start=rails[pos%rails.length],end=rails[(pos+1)%rails.length];draw(ctx,'tramcar-1',left+(start.x+(end.x-start.x)*part)*cell,top+(start.y+(end.y-start.y)*part)*cell-10,cell,cell+10);}
  for(const p of [...s.players].sort((a,b)=>a.y-b.y)){
    if(!p.alive||p.respawnAt>s.tick){if(p.deaths>0&&s.tick-p.diedAt<RESPAWN_TICKS)timeline(ctx,'dead-'+(p.seat-1),s.tick-p.diedAt,left+(p.x+.5)*cell,top+(p.y+1)*cell,true);continue;}
    const delta=p.moveDir<0?[0,0]:DIRS[p.moveDir],x=left+(p.x+.5+delta[0]*p.progress/p.moveTicks)*cell,y=top+(p.y+1+delta[1]*p.progress/p.moveTicks)*cell;
    const img=asset(`hero-${p.seat-1}-${['left','up','right','down'][p.dir]}`),frames=24,width=img.naturalWidth/frames;
    ctx.globalAlpha=p.invulnerable>0&&s.tick%6<3?.5:1;
    if(p.vehicle===12||p.vehicle===13||p.vehicle===14){draw(ctx,`vehicle-${p.seat-1}-${p.vehicle===12?'bulldozer':p.vehicle===13?'car':'frog'}-${['left','up','right','down'][p.dir]}`,x-20,y-42,40,42);}
    else if(img.complete&&img.naturalWidth){const h=37,w=width/img.naturalHeight*h;ctx.drawImage(img,(p.moveDir<0?0:Math.floor(s.tick/2)%frames)*width,0,width,img.naturalHeight,x-w/2,y-h,w,h);}
    ctx.globalAlpha=1;ctx.strokeStyle=p.seat===seat?'#fff':'#353352';ctx.lineWidth=2;if(p.shield||p.seat===seat){ctx.beginPath();ctx.ellipse(x,y-13,17,23,0,0,Math.PI*2);ctx.stroke();}
    const equipped=bomb2Weapon(s,p);if(equipped)weaponBadge(ctx,equipped,x,y-43,15);
    if(p.attack){const names:Record<number,string>={15:'hammer',16:'launcher',19:'shotgun',20:'laser-ready'};
      const name=names[p.attack.kind];if(name){const [dx,dy]=DIRS[p.attack.dir];timeline(ctx,name+(p.attack.kind===20?'':'-'+['left','up','right','down'][p.attack.dir]),s.tick-p.attack.born,x+dx*10,y-17+dy*10);}
    }
  }
  drawPlayerStatus(ctx,bomb2Status(s),600,top,BOMB2_CANVAS_WIDTH-600,450,seat);
  if(s.phase!=='playing'){ctx.fillStyle='#17162fd9';ctx.fillRect(45,180,510,170);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 30px system-ui';ctx.fillText(s.phase==='waiting'?'准备开局':s.winner===null?'平局':`P${s.winner} 获胜`,300,255);ctx.font='16px system-ui';ctx.fillText(s.phase==='waiting'?'至少两人入座并准备':s.mode==='kill'?s.players.map(p=>`P${p.seat} ${p.points}分`).join('  '):'本局结束，准备下一局',300,292);ctx.textAlign='left';}
}
export const adapter:Adapter={id:'9109-server',title:'Q版泡泡堂2',seats:4,hz:HZ,width:BOMB2_CANVAS_WIDTH,height:550,create,step,valid,render,
  controls:'方向键 / WASD 移动；空格使用持有武器，无武器时放炸弹；J / Shift 也可使用武器或引爆遥控弹。',
  maps:MAPS.map(m=>({id:m.id,label:`${THEMES[m.theme]} ${['one','two','three'].indexOf(m.id.split('-')[1])+1}`})),
  modes:[{id:'arcade',label:'生存',description:'初始 3 条命，最后存活者获胜。'},
    {id:'kill',label:'击杀',description:'先得 10 分获胜，自杀扣 1 分；无限复活，基础锤子可反复使用。'},
    {id:'collect',label:'金币',description:'先收集 10 枚金币获胜，死亡后复活。'},
    {id:'color',label:'占地',description:'走过格子占地，可覆盖对手颜色，先占 50 格获胜。'}],
  consumeInput(s,seat,input){const p=s.players.find(p=>p.seat===seat);if(p){p.lastAttack=Math.max(p.lastAttack,input.attack);p.lastAlt=Math.max(p.lastAlt,input.alt);}}
};
