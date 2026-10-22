// Tank Trouble v40 reconstructed from recovered frame_53 authority rules.
import type { Input, State, Adapter } from './types';
export const HZ=25, ROUND_TICKS=HZ*180, BULLET_LIFETIME=250;
const CELL=50,RADIUS=10;
export const WEAPONS=['laser','frag','gatling','homing','deathRay','mine','remote'] as const;
const LABELS:Record<string,string>={bullet:'炮弹',laser:'激光',frag:'碎片弹',gatling:'加特林',homing:'追踪导弹',deathRay:'死亡射线',mine:'地雷',remote:'遥控导弹'};
const COLORS=['','#49a96f','#e56866','#497bc2'];
function random(s:State):number {let x=s.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
function integer(s:State,max:number):number{return Math.floor(random(s)*max);}
export function generateMaze(s:State,width:number,height:number):{walls:any[],reachable:number[][]} {
  // Exact tempmaze random(4) edge construction from frame_53/createMaze.
  const temp=Array.from({length:width+1},()=>Array.from({length:height+1},()=>integer(s,4)));
  const horizontal=Array.from({length:width},(_,x)=>Array.from({length:height},(_,y)=>temp[x][y+1]===2||temp[x+1][y+1]===0));
  const vertical=Array.from({length:width},(_,x)=>Array.from({length:height},(_,y)=>temp[x][y]===1||temp[x][y+1]===3));
  const walls:any[]=[{x:0,y:0,w:width*CELL,h:3},{x:0,y:height*CELL-3,w:width*CELL,h:3},{x:0,y:0,w:3,h:height*CELL},{x:width*CELL-3,y:0,w:3,h:height*CELL}];
  for(let x=0;x<width;x++)for(let y=0;y<height;y++){
    if(horizontal[x][y]&&y<height-1)walls.push({x:x*CELL,y:(y+1)*CELL-1.5,w:CELL,h:3});
    if(vertical[x][y]&&x>0)walls.push({x:x*CELL-1.5,y:y*CELL,w:3,h:CELL});
  }
  const start=[integer(s,width),integer(s,height)],queue=[start],seen=new Set([start.join(',')]);
  for(let i=0;i<queue.length;i++){
    const [x,y]=queue[i];
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;
      if(dx===-1&&vertical[x][y]||dx===1&&vertical[nx][y]||dy===-1&&horizontal[x][ny]||dy===1&&horizontal[x][y])continue;
      const key=nx+','+ny;if(!seen.has(key)){seen.add(key);queue.push([nx,ny]);}
    }
  }
  return {walls,reachable:queue};
}
export function create(round:number,playing:boolean,seats:number[],seed:number,mapId?:string):State {
  const s:State={gameId:'137953-server',version:1,round,tick:0,phase:playing?'playing':'waiting',winner:null,ack:[0,0,0],players:[],rng:(seed>>>0)||1,
    width:8,height:6,walls:[],reachable:[],bullets:[],crates:[],rays:[],nextId:1,scores:[0,0,0],endAt:0,nextCrate:350,mapId:mapId==='compact'?'compact':mapId==='large'?'large':'random'};
  let maze:{walls:any[],reachable:number[][]};let attempts=0;
  do {s.width=s.mapId==='compact'?6:s.mapId==='large'?12:integer(s,9)+4;s.height=s.mapId==='compact'?5:s.mapId==='large'?10:integer(s,7)+4;maze=generateMaze(s,s.width,s.height);}while(maze.reachable.length<Math.max(6,seats.length*2)&&++attempts<100);
  s.walls=maze.walls;s.reachable=maze.reachable;
  const positions=[...s.reachable];
  for(const seat of [...new Set(seats)].filter(n=>Number.isInteger(n)&&n>=1&&n<=3).sort((a,b)=>a-b)){
    const [x,y]=positions.splice(integer(s,positions.length),1)[0];
    s.players.push({seat,x:(x+.5)*CELL,y:(y+.5)*CELL,angle:integer(s,360)/180*Math.PI,alive:true,lastAttack:0,lastAlt:0,cooldown:0,weapon:'bullet',ammo:0,charge:0,gatling:0,gatlingAt:0,killedBy:0,kills:0,deaths:0,diedAt:0});
  }
  s.nextCrate=350+integer(s,200)-Math.floor(s.width*s.height/2000);
  return s;
}
function collides(s:State,x:number,y:number,radius:number):boolean {
  return s.walls.some((w:any)=>x+radius>w.x&&x-radius<w.x+w.w&&y+radius>w.y&&y-radius<w.y+w.h);
}
function kill(s:State,p:any,owner:number):void {
  if(!p.alive)return;p.alive=false;p.killedBy=owner;p.deaths++;p.diedAt=s.tick;
  const killer=s.players.find(q=>q.seat===owner);if(killer&&killer!==p)killer.kills++;
}
function projectile(s:State,p:any,kind:string,angle=p.angle):any {
  const speed=kind==='gatling'||kind==='mine'?5.5:4.5;
  const b={id:s.nextId++,owner:p.seat,kind,x:p.x+Math.cos(angle)*14,y:p.y+Math.sin(angle)*14,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,angle,born:s.tick,until:s.tick+(kind==='gatling'?125:BULLET_LIFETIME),armedAt:s.tick+(kind==='mine'?20:kind==='gatling'?2:0),bounces:0};
  if(collides(s,b.x,b.y,1.5)){b.x=p.x;b.y=p.y;}
  s.bullets.push(b);return b;
}
function fragment(s:State,b:any):void {
  if(s.bullets.length>160)return;
  for(let k=0;k<40;k++){
    const angle=random(s)*Math.PI*2,speed=3+random(s)*3;
    s.bullets.push({id:s.nextId++,owner:b.owner,kind:'fragment',x:b.x,y:b.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,angle,born:s.tick,until:s.tick+35+integer(s,40),armedAt:s.tick+1,bounces:0});
  }
}
function fire(s:State,p:any):void {
  if(p.cooldown>0||p.charge>0)return;
  const frag=s.bullets.find((b:any)=>b.owner===p.seat&&b.kind==='frag');
  if(frag){fragment(s,frag);s.bullets=s.bullets.filter((b:any)=>b!==frag);p.weapon='bullet';p.cooldown=5;return;}
  if(p.weapon==='bullet'){if(s.bullets.filter((b:any)=>b.owner===p.seat&&b.kind==='bullet').length>=5)return;projectile(s,p,'bullet');p.cooldown=5;}
  else if(p.weapon==='laser'||p.weapon==='deathRay'){p.charge=p.weapon==='deathRay'?15:7;p.cooldown=p.charge+10;}
  else if(p.weapon==='gatling'){p.gatling=20;p.gatlingAt=s.tick+10;p.weapon='bullet';p.cooldown=10;}
  else {projectile(s,p,p.weapon);p.cooldown=5;if(p.weapon!=='frag')p.weapon='bullet';}
}
function ray(s:State,p:any,kind:string):void {
  let x=p.x+Math.cos(p.angle)*14,y=p.y+Math.sin(p.angle)*14,dx=Math.cos(p.angle),dy=Math.sin(p.angle);
  const points=[[x,y]],distance=kind==='deathRay'?Math.hypot(s.width*CELL,s.height*CELL):70*8;
  for(let i=0;i<distance;i++){
    const nx=x+dx,ny=y+dy;
    if(nx<0||ny<0||nx>s.width*CELL||ny>s.height*CELL)break;
    if(collides(s,nx,ny,0)){
      if(kind==='deathRay'){x=nx;y=ny;continue;}
      const cx=collides(s,nx,y,0),cy=collides(s,x,ny,0);if(cx)dx=-dx;if(cy)dy=-dy;if(!cx&&!cy){dx=-dx;dy=-dy;}points.push([x,y]);
    }else {x=nx;y=ny;}
    for(const q of s.players)if(q.alive&&Math.hypot(q.x-x,q.y-y)<RADIUS)kill(s,q,p.seat);
  }
  points.push([x,y]);s.rays.push({id:s.nextId++,owner:p.seat,kind,points,until:s.tick+(kind==='deathRay'?30:8)});p.weapon='bullet';
}
export function step(s:State,inputs:Input[]):void {
  if(s.phase!=='playing')return;s.tick++;
  for(const p of s.players){
    const input=inputs[p.seat-1];if(input)s.ack[p.seat-1]=Math.max(s.ack[p.seat-1],input.seq);if(!p.alive)continue;
    if(p.cooldown>0)p.cooldown--;
    if(p.charge>0){if(--p.charge===0)ray(s,p,p.weapon);}
    else if(input){
      const remote=s.bullets.some((b:any)=>b.owner===p.seat&&b.kind==='remote');
      if(!remote){p.angle+=(Number(input.right)-Number(input.left))*.085;p.angle=(p.angle+Math.PI*2)%(Math.PI*2);
        const speed=input.up?2:input.down?-1.4:0,dx=Math.cos(p.angle)*speed,dy=Math.sin(p.angle)*speed;
        for(let k=0;k<2;k++){if(!collides(s,p.x+dx/2,p.y,RADIUS))p.x+=dx/2;if(!collides(s,p.x,p.y+dy/2,RADIUS))p.y+=dy/2;}
      }
      if(input.attack>p.lastAttack){p.lastAttack=input.attack;fire(s,p);}
      if(input.alt>p.lastAlt){p.lastAlt=input.alt;
        const frag=s.bullets.find((b:any)=>b.owner===p.seat&&b.kind==='frag');if(frag){fragment(s,frag);s.bullets=s.bullets.filter((b:any)=>b!==frag);p.weapon='bullet';}
        else if(remote){for(const b of s.bullets)if(b.owner===p.seat&&b.kind==='remote')b.until=s.tick;}
        else fire(s,p);
      }
    }
    if(p.gatling>0&&s.tick>=p.gatlingAt){projectile(s,p,'gatling',p.angle+(random(s)-.5)*.16);p.gatling--;p.gatlingAt=s.tick+2;}
    const crate=s.crates.find((c:any)=>Math.hypot(c.x-p.x,c.y-p.y)<17);if(crate){p.weapon=crate.weapon;p.ammo=1;s.crates=s.crates.filter((c:any)=>c!==crate);}
  }
  const remaining:any[]=[],fragments:any[]=[];
  for(const b of s.bullets){
    if(b.until<=s.tick){if(b.kind==='frag')fragments.push(b);continue;}
    if(b.kind==='homing'&&s.tick-b.born>=50){
      const targets=s.players.filter(p=>p.alive&&p.seat!==b.owner).sort((a,bp)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(bp.x-b.x,bp.y-b.y));
      if(targets.length){const target=Math.atan2(targets[0].y-b.y,targets[0].x-b.x),delta=Math.atan2(Math.sin(target-b.angle),Math.cos(target-b.angle));b.angle+=Math.max(-.1,Math.min(.1,delta));b.vx=Math.cos(b.angle)*4.5;b.vy=Math.sin(b.angle)*4.5;}
    }
    if(b.kind==='remote'){
      const input=inputs[b.owner-1];if(input){b.angle+=(Number(input.right)-Number(input.left))*15/180*Math.PI;b.vx=Math.cos(b.angle)*4.5;b.vy=Math.sin(b.angle)*4.5;}
    }
    if(b.kind==='mine'&&s.tick-b.born>=12){b.vx=0;b.vy=0;}
    let dead=false;
    for(let k=0;k<7;k++){
      const nx=b.x+b.vx/7,ny=b.y+b.vy/7;
      if(collides(s,nx,ny,1.5)){
        const cx=collides(s,nx,b.y,1.5),cy=collides(s,b.x,ny,1.5);if(cx)b.vx=-b.vx;if(cy)b.vy=-b.vy;if(!cx&&!cy){b.vx=-b.vx;b.vy=-b.vy;}b.bounces++;b.angle=Math.atan2(b.vy,b.vx);
      }else {b.x=nx;b.y=ny;}
      if(b.armedAt<=s.tick){const victim=s.players.find(p=>p.alive&&Math.hypot(p.x-b.x,p.y-b.y)<RADIUS+1.5);
        if(victim){kill(s,victim,b.owner);if(b.kind==='frag'||b.kind==='mine')fragments.push(b);dead=true;break;}}
    }
    if(!dead)remaining.push(b);
  }
  s.bullets=remaining;for(const b of fragments)fragment(s,b);s.rays=s.rays.filter((r:any)=>r.until>s.tick);
  // Death rays stay lethal for their 30-frame display lifetime.
  for(const r of s.rays)if(r.kind==='deathRay')for(const p of s.players)if(p.alive)for(let i=1;i<r.points.length;i++){
    const [ax,ay]=r.points[i-1],[bx,by]=r.points[i],dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((p.x-ax)*dx+(p.y-ay)*dy)/(dx*dx+dy*dy||1)));
    if(Math.hypot(p.x-ax-dx*t,p.y-ay-dy*t)<RADIUS)kill(s,p,r.owner);
  }
  if(s.tick>=s.nextCrate&&s.crates.length<3){const used=s.reachable.filter((cell:number[])=>!s.crates.some((c:any)=>Math.floor(c.x/CELL)===cell[0]&&Math.floor(c.y/CELL)===cell[1]));
    if(used.length){const [x,y]=used[integer(s,used.length)];s.crates.push({id:s.nextId++,x:(x+.5)*CELL,y:(y+.5)*CELL,weapon:WEAPONS[integer(s,WEAPONS.length)]});}s.nextCrate=s.tick+350+integer(s,200);
  }
  const alive=s.players.filter(p=>p.alive);
  if(alive.length<=1&&s.endAt===0)s.endAt=s.tick+125;
  if(s.endAt&&s.tick>=s.endAt||s.tick>=ROUND_TICKS){s.phase='finished';s.winner=alive.length===1?alive[0].seat:null;if(s.winner!==null)s.scores[s.winner-1]++;}
}
export function valid(value:unknown):value is State {
  if(!value||typeof value!=='object')return false;const s=value as State;
  const int=(n:any,a:number,b:number)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
  const num=(n:any,a:number,b:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
  if(s.gameId!=='137953-server'||s.version!==1||!int(s.round,1,Number.MAX_SAFE_INTEGER)||!int(s.tick,0,ROUND_TICKS)||!int(s.rng,0,0xffffffff)||!int(s.nextId,1,1e7)||!int(s.width,4,12)||!int(s.height,4,10)||!['waiting','playing','finished'].includes(s.phase)||!['random','compact','large'].includes(s.mapId)||!int(s.endAt,0,ROUND_TICKS+125)||!int(s.nextCrate,0,ROUND_TICKS+550))return false;
  if(!Array.isArray(s.players)||s.players.length>3||new Set(s.players.map(p=>p?.seat)).size!==s.players.length||!s.players.every(p=>p&&int(p.seat,1,3)&&num(p.x,0,s.width*CELL)&&num(p.y,0,s.height*CELL)&&num(p.angle,0,Math.PI*2+.001)&&typeof p.alive==='boolean'&&int(p.lastAttack,0,1e9)&&int(p.lastAlt,0,1e9)&&int(p.cooldown,0,40)&&int(p.charge,0,15)&&int(p.gatling,0,20)&&int(p.gatlingAt,0,ROUND_TICKS+20)&&['bullet',...WEAPONS].includes(p.weapon)&&int(p.killedBy,0,3)&&int(p.kills,0,1000)&&int(p.deaths,0,1000)&&int(p.diedAt,0,ROUND_TICKS)))return false;
  if(s.winner!==null&&!s.players.some(p=>p.seat===s.winner))return false;
  if(!Array.isArray(s.ack)||s.ack.length!==3||!s.ack.every((n:any)=>int(n,0,1e9))||!Array.isArray(s.scores)||s.scores.length!==3||!s.scores.every((n:any)=>int(n,0,1000)))return false;
  if(!Array.isArray(s.walls)||s.walls.length<4||s.walls.length>244||!s.walls.every((w:any)=>w&&num(w.x,0,s.width*CELL)&&num(w.y,0,s.height*CELL)&&num(w.w,1,s.width*CELL)&&num(w.h,1,s.height*CELL)))return false;
  if(!Array.isArray(s.reachable)||s.reachable.length<1||s.reachable.length>120||!s.reachable.every((p:any)=>Array.isArray(p)&&p.length===2&&int(p[0],0,s.width-1)&&int(p[1],0,s.height-1)))return false;
  const owner=(id:number)=>s.players.some(p=>p.seat===id);
  if(!Array.isArray(s.bullets)||s.bullets.length>200||!s.bullets.every((b:any)=>b&&int(b.id,1,s.nextId-1)&&owner(b.owner)&&['bullet','fragment',...WEAPONS].includes(b.kind)&&num(b.x,-10,s.width*CELL+10)&&num(b.y,-10,s.height*CELL+10)&&num(b.vx,-6,6)&&num(b.vy,-6,6)&&num(b.angle,-Math.PI*1000,Math.PI*1000)&&int(b.born,0,s.tick)&&int(b.until,0,ROUND_TICKS+250)&&int(b.armedAt,0,ROUND_TICKS+20)&&int(b.bounces,0,10000)))return false;
  if(!Array.isArray(s.crates)||s.crates.length>3||!s.crates.every((c:any)=>c&&int(c.id,1,s.nextId-1)&&num(c.x,0,s.width*CELL)&&num(c.y,0,s.height*CELL)&&WEAPONS.includes(c.weapon)))return false;
  return Array.isArray(s.rays)&&s.rays.length<=3&&s.rays.every((r:any)=>r&&int(r.id,1,s.nextId-1)&&owner(r.owner)&&['laser','deathRay'].includes(r.kind)&&int(r.until,0,ROUND_TICKS+30)&&Array.isArray(r.points)&&r.points.length<=100&&r.points.every((p:any)=>Array.isArray(p)&&p.length===2&&num(p[0],-1,s.width*CELL+1)&&num(p[1],-1,s.height*CELL+1)));
}
const art=new Map<string,HTMLImageElement>();
function sprite(ctx:CanvasRenderingContext2D,name:string,x:number,y:number,size:number):boolean {
  let img=art.get(name);if(!img){img=new Image();img.src='/expanded/assets/tank/'+name+'.png';art.set(name,img);}
  if(!img.complete||!img.naturalWidth)return false;ctx.drawImage(img,x-size/2,y-size/2,size,size);return true;
}
export function render(canvas:HTMLCanvasElement,s:State|null,seat:number|null):void {
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#f0efec';ctx.fillRect(0,0,712,490);ctx.fillStyle='#30383d';ctx.font='bold 22px system-ui';ctx.fillText('坦克动荡 2',22,30);if(!s)return;
  ctx.font='14px system-ui';ctx.fillText(`${Math.max(0,Math.ceil((ROUND_TICKS-s.tick)/HZ))} 秒`,624,29);
  const scale=Math.min(680/(s.width*CELL),365/(s.height*CELL)),left=(712-s.width*CELL*scale)/2,top=48+(365-s.height*CELL*scale)/2;
  ctx.save();ctx.translate(left,top);ctx.scale(scale,scale);ctx.fillStyle='#e9e7d9';ctx.fillRect(0,0,s.width*CELL,s.height*CELL);
  ctx.strokeStyle='#cbc9bd';ctx.lineWidth=.5;for(let x=0;x<s.width;x++)for(let y=0;y<s.height;y++)ctx.strokeRect(x*CELL,y*CELL,CELL,CELL);
  for(const wall of s.walls){ctx.fillStyle='#1f2424';ctx.fillRect(wall.x,wall.y,wall.w,wall.h);}
  for(const c of s.crates){ctx.fillStyle='#c89753';ctx.fillRect(c.x-9,c.y-9,18,18);ctx.strokeStyle='#695031';ctx.strokeRect(c.x-9,c.y-9,18,18);ctx.fillStyle='#fff';ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.fillText(LABELS[c.weapon],c.x,c.y-15);}
  for(const p of s.players){
    if(!p.alive){if(s.tick-p.diedAt<30){ctx.fillStyle='#6d6b6866';ctx.beginPath();ctx.arc(p.x,p.y,12+(s.tick-p.diedAt)/2,0,Math.PI*2);ctx.fill();}continue;}
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle+Math.PI/2);
    ctx.fillStyle='#383c3b';ctx.fillRect(-11,-12,5,25);ctx.fillRect(6,-12,5,25);ctx.fillStyle=COLORS[p.seat];ctx.fillRect(-7,-10,14,20);
    ctx.strokeStyle='#252c2a';ctx.lineWidth=1.5;ctx.strokeRect(-7,-10,14,20);ctx.fillStyle=COLORS[p.seat];ctx.beginPath();ctx.arc(0,-1,7,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillRect(-2,-20,4,16);ctx.strokeRect(-2,-20,4,16);
    if(p.seat===seat){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(-13,-14,26,29);}ctx.restore();
    ctx.fillStyle=COLORS[p.seat];ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.fillText(`P${p.seat}`,p.x,p.y+24);
    if(p.charge){ctx.strokeStyle=p.weapon==='deathRay'?'#f062a4':'#fa4729';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,14+p.charge/2,0,Math.PI*2);ctx.stroke();}
  }
  for(const b of s.bullets){const name=b.kind==='fragment'?'bullet':b.kind==='remote'?'remote':b.kind;
    if(!sprite(ctx,name+'-1',b.x,b.y,b.kind==='bullet'||b.kind==='fragment'?4:10)){ctx.fillStyle=b.kind==='mine'?'#b2594d':'#292c2b';ctx.beginPath();ctx.arc(b.x,b.y,b.kind==='bullet'||b.kind==='fragment'?2:4,0,Math.PI*2);ctx.fill();}}
  for(const r of s.rays){ctx.strokeStyle=r.kind==='deathRay'?'#f267b7cc':'#ef454acc';ctx.lineWidth=r.kind==='deathRay'?6:3;ctx.beginPath();r.points.forEach((p:number[],i:number)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();}
  ctx.restore();ctx.textAlign='left';ctx.font='bold 14px system-ui';for(const p of s.players){ctx.fillStyle=COLORS[p.seat];ctx.fillText(`P${p.seat}  ${s.scores[p.seat-1]}分  ${LABELS[p.weapon]}${p.alive?'':' · 已击毁'}`,28+(p.seat-1)*233,455);}
  ctx.fillStyle='#68716f';ctx.font='12px system-ui';ctx.fillText('左右转向 · 上下前进后退 · 空格开火 · J 遥控 / 引爆碎片弹',28,478);
  if(s.phase!=='playing'){ctx.fillStyle='#f3f1e5ed';ctx.fillRect(120,168,472,150);ctx.fillStyle='#333a36';ctx.textAlign='center';ctx.font='bold 30px system-ui';ctx.fillText(s.phase==='waiting'?'准备开局':s.winner===null?'平局':`P${s.winner} 获胜`,356,234);ctx.font='16px system-ui';ctx.fillText(s.phase==='waiting'?'至少两人入座并准备':'本局结束，准备下一局',356,269);ctx.textAlign='left';}
}
export const adapter:Adapter={id:'137953-server',title:'坦克动荡2',seats:3,hz:HZ,width:712,height:490,create,step,valid,render,
  controls:'左右 / AD 转向；上下 / WS 前进后退；空格开火；J / Shift 引爆碎片弹、控制遥控导弹',
  maps:[{id:'random',label:'原版随机迷宫'},{id:'compact',label:'小型迷宫'},{id:'large',label:'大型迷宫'}],
  consumeInput(s,seat,input){const p=s.players.find(p=>p.seat===seat);if(p){p.lastAttack=Math.max(p.lastAttack,input.attack);p.lastAlt=Math.max(p.lastAlt,input.alt);}}
};
