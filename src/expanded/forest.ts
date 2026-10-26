import type { Adapter, Input, State } from './types';
import { EMPTY_INPUT, validInput } from './types';
import source from './forest-data.json';
import {drawDeviceArt,drawForegroundDeviceArt} from './forest-device-art';

type Obj = { id: number; type: string; x: number; y: number; width: number; height: number; rotation?: number; properties: Record<string, any>; polyline?: { x:number; y:number }[]; polygon?: { x:number; y:number }[] };
type Level = { id:string; width:number; height:number; tile:number; ground:number[]; objects:Obj[]; properties:Record<string, any> };
type Body = { id:number; x:number; y:number; vx:number; vy:number; w:number; h:number; grounded:boolean; support:number; alive:boolean };
type Player = Body & { seat:number; element:'fb'|'wg'; facing:number; gems:number; lastAttack:number; lastAlt:number; upHeld:boolean; teleport:number; inExit:boolean };
type Device = Body & { type:string; group:number; active:boolean; timer:number; baseX:number; baseY:number; dx:number; dy:number; amount:number; rotation:number; props:Record<string, any>; pair:number; anchorX:number; anchorY:number; swing:number; angularVelocity:number };
interface ForestState extends State { gameId:string; levelId:string; seed:number; players:Player[]; devices:Device[]; gems:{id:number;x:number;y:number;element:string;taken:boolean}[]; exits:{x:number;y:number;element:string}[]; liquids:{x:number;y:number;w:number;h:number;type:number;frozen:boolean}[]; beams:{x:number;y:number;tx:number;ty:number;color:string}[]; success:boolean; elapsed:number; collected:number; }
const levels = source.levels as Level[];
export const forestLevels = levels;
const T = 32, HZ = 60;
const clamp = (n:number,a:number,b:number) => Math.max(a,Math.min(b,n));
function overlap(a:Body,b:Body):boolean {
  const r=(b as Device).rotation||0;
  if(!r)return a.x-a.w/2 < b.x+b.w/2 && a.x+a.w/2 > b.x-b.w/2 && a.y-a.h < b.y && a.y > b.y-b.h;
  const ax=a.x,ay=a.y-a.h/2,bx=b.x,by=b.y-b.h/2,c=Math.cos(r),n=Math.sin(r),dx=ax-bx,dy=ay-by;
  return Math.abs(dx)<a.w/2+Math.abs(c)*b.w/2+Math.abs(n)*b.h/2 && Math.abs(dy)<a.h/2+Math.abs(n)*b.w/2+Math.abs(c)*b.h/2 && Math.abs(dx*c+dy*n)<b.w/2+Math.abs(c)*a.w/2+Math.abs(n)*a.h/2 && Math.abs(-dx*n+dy*c)<b.h/2+Math.abs(n)*a.w/2+Math.abs(c)*a.h/2;
}
const levelOf = (s:ForestState) => levels.find(l=>l.id===s.levelId)!;
const body = (id:number,x:number,y:number,w:number,h:number):Body => ({id,x,y,w,h,vx:0,vy:0,grounded:false,support:-1,alive:true});
function device(o:Obj):Device {
  const p=o.properties, r=(o.rotation||0)*Math.PI/180+(o.type==='wind'?Math.PI/2:0);
  let x=o.x,y=o.y,w=o.width||64,h=o.height||64;
  if(o.type==='platform') { x+=w/2;y+=h; }
  else if(o.type==='wind'){x+=-48*Math.cos(r)+32*Math.sin(r);y+=-48*Math.sin(r)-32*Math.cos(r);w=80;h=20;y+=h/2;}
  else if(o.type==='hanging'||o.type==='pulley'){ const pt=o.polyline?.[0]||{x:0,y:0}; const end=o.type==='hanging'?o.polyline?.[1]:pt; x+=end?.x||0;y+=end?.y||0;w=(p.barWidth||3.2)*T;h=8; }
  else if(o.type==='roman'){const pts=o.polygon||[];const xs=pts.map(pt=>pt.x),ys=pts.map(pt=>pt.y);w=Math.max(...xs)-Math.min(...xs);h=10;x+=w/2;y+=Math.min(...ys)/2;}
  else { x+=32*Math.cos(r)+32*Math.sin(r);y+=32*Math.sin(r)-32*Math.cos(r);h=o.type.includes('pusher')?12: o.type==='lever'?44:56;w=o.type.includes('pusher')?56:56; y+=h/2; }
  return {...body(o.id,x,y,w,h),type:o.type,group:Number(p.group||0),active:o.type==='lever'?Number(p.startPos||1)*Number(p.onis||1)<0:!!p.initialState,timer:0,baseX:x,baseY:y,dx:Number(p.dx??4)*T,dy:Number(p.dy??0)*T,amount:0,rotation:r,props:p,pair:-1,anchorX:o.x,anchorY:o.y,swing:0,angularVelocity:0};
}
function create(round:number,playing:boolean,seats:number[],seed:number,mapId?:string):ForestState {
  const l=levels.find(x=>x.id===mapId)||levels[0];
  const players:Player[]=seats.filter(x=>x>=1&&x<=2).map(seat=>{const element=seat===1?'fb':'wg';const o=l.objects.find(x=>x.type==='char'&&x.properties.char===element)||{x:64+(seat-1)*80,y:896};return {...body(-seat,o.x+32,o.y-16,28,45),seat,element,facing:1,gems:0,lastAttack:0,lastAlt:0,upHeld:false,teleport:0,inExit:false};});
  const devices=l.objects.filter(o=>!['char','diamond','door'].includes(o.type)).map(device);
  // Pulley endpoints retain their original total rope length.
  for(const o of l.objects.filter(o=>o.type==='pulley')){const a=devices.find(d=>d.id===o.id)!;const pt=o.polyline![3];const b={...a,id:10000+o.id,x:o.x+pt.x,y:o.y+pt.y,baseX:o.x+pt.x,baseY:o.y+pt.y};a.pair=b.id;b.pair=a.id;devices.push(b);}
  for(const d of devices.filter(d=>d.type==='portal')){const other=devices.find(x=>x.type==='portal'&&x.id!==d.id&&(x.props.portalId||0)===(d.props.portalId||0));if(other)d.pair=other.id;}
  const liquids:ForestState['liquids']=[];
  for(let y=0;y<l.height;y++)for(let x=0;x<l.width;x++){const type=l.ground[y*l.width+x];if(![5,6,7,55].includes(type))continue;let w=1;while(x+w<l.width&&l.ground[y*l.width+x+w]===type)w++;liquids.push({x:x*T,y:y*T,w:w*T,h:T/2,type:type===55?5:type,frozen:type===55});x+=w-1;}
  return {gameId:'fbw_forest-server',round,tick:0,phase:playing&&players.length===2?'playing':'waiting',winner:null,ack:[0,0],inputs:[{...EMPTY_INPUT},{...EMPTY_INPUT}],levelId:l.id,seed:seed>>>0,players,devices,gems:l.objects.filter(o=>o.type==='diamond').map(o=>({id:o.id,x:o.x+32,y:o.y-32,element:o.properties.char,taken:false})),exits:l.objects.filter(o=>o.type==='door').map(o=>({x:o.x+32,y:o.y,element:o.properties.char})),liquids,beams:[],success:false,elapsed:0,collected:0};
}
function tileSolid(l:Level,x:number,y:number):boolean {
  const tx=Math.floor(x/T),ty=Math.floor(y/T);if(tx<0||ty<0||tx>=l.width||ty>=l.height)return false;
  const type=l.ground[ty*l.width+tx],px=x-tx*T,py=y-ty*T;
  if(type<0||[5,6,7,55].includes(type))return false;
  if(type===1||type===11)return py<=T-px;
  if(type===2||type===12)return py<=px;
  if(type===3)return py>=px;
  if(type===4)return py>=T-px;
  return true;
}
function solidAt(s:ForestState,x:number,y:number):boolean {
  if(tileSolid(levelOf(s),x,y))return true;
  return s.liquids.some(q=>x>=q.x&&x<q.x+q.w&&y>=q.y+(q.frozen?0:q.h)&&y<q.y+T);
}
const solidDevice = (d:Device) => ['platform','hanging','pulley','roman','box','boxheavy','boxmirror','ball'].includes(d.type);
function collides(s:ForestState,b:Body,others:Body[]):boolean {
  const points=[[b.x-b.w/2+1,b.y-b.h+1],[b.x+b.w/2-1,b.y-b.h+1],[b.x-b.w/2+1,b.y-1],[b.x+b.w/2-1,b.y-1],[b.x,b.y-1],[b.x,b.y-b.h/2]];
  return points.some(([x,y])=>solidAt(s,x,y))||others.some(o=>o.id!==b.id&&overlap(b,o));
}
function move(s:ForestState,b:Body,others:Body[]) {
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(b.vx),Math.abs(b.vy))/4));
  const vx=b.vx/steps,vy=b.vy/steps;b.grounded=false;b.support=-1;
  for(let i=0;i<steps;i++){
    b.x+=vx;
    if(collides(s,b,others)){let climbed=false;if(vy>=0&&b.h<=45){for(let n=1;n<=5;n++){b.y-=1;if(!collides(s,b,others)){climbed=true;break;}}if(!climbed)b.y+=5;}if(!climbed){b.x-=vx;b.vx=0;}}
    b.y+=vy;
    if(collides(s,b,others)){b.y-=vy;if(vy>=0){b.grounded=true;const below={...b,y:b.y+2};b.support=others.find(o=>o.id!==b.id&&overlap(below,o))?.id??-1;}b.vy=0;}
  }
  if(!b.grounded){b.y+=1.5;if(collides(s,b,others)){b.grounded=true;b.vy=Math.max(0,b.vy);b.support=others.find(o=>o.id!==b.id&&overlap(b,o))?.id??-1;}b.y-=1.5;}
}
function castBeams(s:ForestState) {
  s.beams=[];
  for(const emitter of s.devices.filter(d=>d.type==='beamer'&&d.active)){
    let x=emitter.x,y=emitter.y-emitter.h/2,dx=-Math.cos(emitter.rotation),dy=-Math.sin(emitter.rotation);let startX=x,startY=y;const color=String(emitter.props.color||'yellow');let reflected=-1;
    for(let n=0;n<900;n++){
      x+=dx*4;y+=dy*4;
      const mirror=s.devices.find(d=>['rotmirror','infinitemirror','boxmirror'].includes(d.type)&&d.id!==reflected&&Math.abs(d.x-x)<20&&Math.abs(d.y-d.h/2-y)<20);
      if(mirror){s.beams.push({x:startX,y:startY,tx:x,ty:y,color});const a=mirror.rotation+Math.PI/4;const nx=-Math.sin(a),ny=Math.cos(a),dot=dx*nx+dy*ny;dx-=2*dot*nx;dy-=2*dot*ny;startX=x;startY=y;reflected=mirror.id;if(s.beams.length>24)break;continue;}
      const sensor=s.devices.find(d=>d.type==='lightpusher'&&Math.abs(d.x-x)<24&&Math.abs(d.y-y)<24&&String(d.props.color||'yellow')===color);if(sensor){sensor.active=true;sensor.timer=3;}
      const liquid=s.liquids.find(q=>x>=q.x&&x<q.x+q.w&&y>=q.y-2&&y<q.y+T/2);if(liquid&&liquid.type===5){if(color==='blue')liquid.frozen=true;if(color==='red')liquid.frozen=false;}
      if(solidAt(s,x,y)||x<0||y<0||x>1248||y>928){s.beams.push({x:startX,y:startY,tx:x,ty:y,color});break;}
    }
  }
}
function step(state:State,inputs:Input[]) {
  const s=state as ForestState;if(s.phase!=='playing')return;s.tick++;s.elapsed++;
  const groups=new Set<number>();
  for(const d of s.devices){
    if(d.timer>0)d.timer--;
    if(d.type==='pusher'||d.type==='timedpusher'){
      const touch=[...s.players,...s.devices.filter(solidDevice)].some(b=>b.id!==d.id&&Math.abs(b.x-d.x)<(b.w+d.w)/2&&Math.abs(b.y-(d.baseY-3))<14);
      if(touch)d.timer=d.type==='timedpusher'?Math.ceil(Number(d.props.time||2000)*HZ/1000):2;d.active=d.timer>0;
    }
    if(d.type==='lightpusher')d.active=d.timer>0;
    if(d.active&&['lever','pusher','timedpusher','lightpusher'].includes(d.type))groups.add(d.group);
  }
  for(const d of s.devices){
    if(['platform','portal','wind','beamer','rotmirror','infinitemirror'].includes(d.type)){const control=s.devices.some(x=>x.group===d.group&&['lever','pusher','timedpusher','lightpusher'].includes(x.type));d.active=control?groups.has(d.group):!!d.props.initialState;if(d.props.invertInput)d.active=!d.active;}
    if(d.type==='platform'){
      const oldX=d.x,oldY=d.y;const distance=Math.hypot(d.dx,d.dy);d.amount=clamp(d.amount+(d.active?1:-1)*(d.props.dtheta!=null?.015:distance?64/HZ/distance:0),0,1);
      if(d.props.dtheta!=null){d.rotation=Number(d.props.dtheta)*Math.PI/180*d.amount;const ox=Number(d.props.offsetX||0)*T,oy=Number(d.props.offsetY||0)*T;d.x=d.baseX-ox+ox*Math.cos(d.rotation)-oy*Math.sin(d.rotation);d.y=d.baseY-oy+ox*Math.sin(d.rotation)+oy*Math.cos(d.rotation);}else{d.x=d.baseX+d.dx*d.amount;d.y=d.baseY+d.dy*d.amount;}
      for(const b of [...s.players,...s.devices.filter(x=>['box','boxheavy','boxmirror','ball'].includes(x.type))])if(b.support===d.id){b.x+=d.x-oldX;b.y+=d.y-oldY;}
    }
    if(d.type==='hanging'){
      const oldX=d.x;const weight=s.players.filter(p=>p.support===d.id).reduce((n,p)=>n+(p.x-d.x)*.0004,0);d.angularVelocity+=(weight-d.swing*.02);d.angularVelocity*=.96;d.swing=clamp(d.swing+d.angularVelocity,-.7,.7);d.x=d.baseX+Math.sin(d.swing)*(d.baseY-d.anchorY);d.rotation=d.swing;for(const p of s.players)if(p.support===d.id)p.x+=d.x-oldX;
    }
    if(d.type==='pulley'&&d.id<10000){const other=s.devices.find(x=>x.id===d.pair)!;const a=s.players.filter(p=>p.support===d.id).length,b=s.players.filter(p=>p.support===other.id).length;const change=clamp((a-b)*.5,-.5,.5);const offset=clamp(d.y-d.baseY+change,-480,480);const delta=d.baseY+offset-d.y;d.y+=delta;other.y-=delta;for(const p of s.players){if(p.support===d.id)p.y+=delta;if(p.support===other.id)p.y-=delta;}}
  }
  const solids=s.devices.filter(solidDevice);
  for(const box of solids.filter(d=>['box','boxheavy','boxmirror','ball'].includes(d.type))){box.vy=clamp(box.vy+1000/HZ/HZ,-20,20);box.vx*=.9;move(s,box,solids);}
  for(const p of s.players){
    const i=inputs[p.seat-1]||EMPTY_INPUT;s.inputs[p.seat-1]={...i};s.ack[p.seat-1]=Math.max(s.ack[p.seat-1],i.seq);if(!p.alive)continue;
    const jump=i.alt>p.lastAlt||i.up&&!p.upHeld,attack=i.attack>p.lastAttack;p.lastAlt=Math.max(p.lastAlt,i.alt);p.lastAttack=Math.max(p.lastAttack,i.attack);p.upHeld=i.up;
    if(p.teleport>0)p.teleport--;
    const ice=s.liquids.some(q=>q.frozen&&p.x>=q.x&&p.x<=q.x+q.w&&Math.abs(p.y-q.y)<4)||[10,11,12].some(type=>{const l=levelOf(s);return l.ground[Math.floor((p.y+3)/T)*l.width+Math.floor(p.x/T)]===type;});
    const dir=Number(i.right)-Number(i.left),max=ice&&p.element==='wg'?2*T/HZ:8.5*T/HZ;
    if(dir){p.facing=dir;p.vx=clamp(p.vx+dir*(p.grounded?.45:.27),-max,max);}else p.vx*=ice&&p.element==='fb'?.99:.76;
    if(jump&&p.grounded){p.vy=-(ice?(p.element==='fb'?3:10):15.5)*T/HZ;p.grounded=false;}
    p.vy=clamp(p.vy+1000/HZ/HZ,-20,20);
    for(const wind of s.devices.filter(d=>d.type==='wind'&&d.active)){const r=wind.rotation,len=Number(wind.props.length||10)*T,dx=Math.sin(r),dy=-Math.cos(r);const tx=p.x-wind.x,ty=p.y-p.h/2-(wind.y-wind.h/2);const along=tx*dx+ty*dy,across=tx*dy-ty*dx;if(Math.abs(across)<Number(wind.props.windWidth||2.6)*T/2&&along>0&&along<len){const force=(1.8+.2*Math.sin(s.tick/HZ))*(1-along/len);p.vx=(p.vx+dx*force)*.975;p.vy=(p.vy+dy*force)*.975;}}
    for(const box of solids.filter(d=>['box','boxheavy','boxmirror','ball'].includes(d.type))){if(overlap({...p,x:p.x+p.vx},box)){box.vx=p.vx*(box.type==='boxheavy'?.4:.9);move(s,box,solids);}}
    move(s,p,solids);
    // Levers latch when a character crosses the stick, and can also be operated with attack.
    for(const lever of s.devices.filter(d=>d.type==='lever'))if(Math.abs(p.x-lever.x)<34&&Math.abs(p.y-lever.y)<60){if(attack)lever.active=!lever.active;else if(Math.abs(p.vx)>.1)lever.active=p.vx*Number(lever.props.onis||1)<0;}
    for(const portal of s.devices.filter(d=>d.type==='portal'&&d.active))if(!p.teleport&&portal.pair!==-1&&Math.abs(p.x-portal.x)<24&&Math.abs(p.y-portal.y)<70){const other=s.devices.find(d=>d.id===portal.pair)!;p.x=other.x+Math.cos(other.rotation)*(other.props.inverted?-40:40);p.y=other.y;p.teleport=45;break;}
    for(const gem of s.gems)if(!gem.taken&&(gem.element===p.element||['silver','fbwg'].includes(gem.element))&&Math.abs(p.x-gem.x)<26&&Math.abs(p.y-p.h/2-gem.y)<32){gem.taken=true;p.gems++;s.collected++;}
    for(const q of s.liquids)if(!q.frozen&&p.x+p.w/2>q.x+4&&p.x-p.w/2<q.x+q.w-4&&p.y>q.y+4&&p.y-p.h<q.y+q.h&&(q.type===7||q.type===5&&p.element==='fb'||q.type===6&&p.element==='wg')){p.alive=false;s.phase='finished';s.success=false;s.winner=null;}
    if(p.y>levelOf(s).height*T+100||p.x< -100||p.x>levelOf(s).width*T+100){p.alive=false;s.phase='finished';s.success=false;}
    p.inExit=s.exits.some(e=>e.element===p.element&&Math.abs(p.x-e.x)<25&&Math.abs(p.y-e.y)<28&&p.grounded);
  }
  castBeams(s);
  if(s.phase==='playing'&&s.players.length===2&&s.players.every(p=>p.alive&&p.inExit)){s.phase='finished';s.success=true;s.winner=1;}
}
function valid(value:unknown):value is ForestState {
  if(!value||typeof value!=='object')return false;const s=value as ForestState;
  if(s.gameId!=='fbw_forest-server'||!levels.some(l=>l.id===s.levelId)||!['waiting','playing','finished'].includes(s.phase)||!Number.isSafeInteger(s.tick)||s.tick<0||!Number.isSafeInteger(s.round)||!Array.isArray(s.players)||s.players.length>2||!Array.isArray(s.devices)||s.devices.length>180||!Array.isArray(s.gems)||s.gems.length>100||!Array.isArray(s.ack)||s.ack.length!==2)return false;
  if(s.players.some(p=>!p||typeof p!=='object')||new Set(s.players.map(p=>p.seat)).size!==s.players.length||!s.players.every(p=>[1,2].includes(p.seat)&&p.element===(p.seat===1?'fb':'wg')&&typeof p.alive==='boolean'&&[p.x,p.y,p.vx,p.vy,p.lastAttack,p.lastAlt].every(Number.isFinite))||!Array.isArray(s.inputs)||s.inputs.length!==2||!s.inputs.every(validInput))return false;
  return s.devices.every(d=>d&&typeof d.type==='string'&&[d.x,d.y,d.vx,d.vy,d.amount,d.rotation].every(Number.isFinite))&&s.gems.every(g=>g&&Number.isFinite(g.x)&&Number.isFinite(g.y)&&typeof g.taken==='boolean')&&Array.isArray(s.exits)&&s.exits.every(e=>e&&[e.x,e.y].every(Number.isFinite)&&['fb','wg'].includes(e.element))&&Array.isArray(s.liquids)&&s.liquids.every(q=>q&&[q.x,q.y,q.w,q.h].every(Number.isFinite)&&[5,6,7].includes(q.type)&&typeof q.frozen==='boolean')&&Array.isArray(s.beams)&&s.beams.every(b=>b&&[b.x,b.y,b.tx,b.ty].every(Number.isFinite))&&typeof s.success==='boolean'&&s.ack.every(n=>Number.isSafeInteger(n)&&n>=0);
}
const images:Record<string,HTMLImageElement>={};
let stone:CanvasPattern|null=null;
function stonePattern(ctx:CanvasRenderingContext2D):CanvasPattern|null {
  const f=(source.atlases as any).TempleAssets.ForeGround0000.frame;
  if(!images.TempleAssets){images.TempleAssets=new Image();images.TempleAssets.src='/expanded/assets/forest/TempleAssets.png';}
  if(!stone&&images.TempleAssets.complete&&images.TempleAssets.naturalWidth){const tile=document.createElement('canvas');tile.width=128;tile.height=128;tile.getContext('2d')!.drawImage(images.TempleAssets,f.x,f.y,f.w,f.h,0,0,128,128);stone=ctx.createPattern(tile,'repeat');}return stone;
}
function atlas(ctx:CanvasRenderingContext2D,key:string,name:string,x:number,y:number,w?:number,h?:number) {
  const frame=(source.atlases as any)[key]?.[name]?.frame;if(!frame)return false;
  if(!images[key]){images[key]=new Image();images[key].src='/expanded/assets/forest/'+key+'.png';}
  if(!images[key].complete||!images[key].naturalWidth)return false;ctx.drawImage(images[key],frame.x,frame.y,frame.w,frame.h,x,y,w??frame.w,h??frame.h);return true;
}
function render(canvas:HTMLCanvasElement,state:State|null,seat:number|null) {
  const ctx=canvas.getContext('2d');if(!ctx)return;const s=(state||create(0,false,[1,2],1)) as ForestState,l=levelOf(s);const sx=canvas.width/1248,sy=canvas.height/928;ctx.save();ctx.scale(sx,sy);ctx.fillStyle='#2b271a';ctx.fillRect(0,0,1248,928);
  if(!images.background){images.background=new Image();images.background.src='/expanded/assets/forest/TempleHallForest.jpg';}if(images.background.complete&&images.background.naturalWidth){ctx.globalAlpha=.2;ctx.drawImage(images.background,0,0,1248,928);ctx.globalAlpha=1;}
  for(let y=0;y<l.height;y++)for(let x=0;x<l.width;x++){const type=l.ground[y*l.width+x];if(type<0||[5,6,7,55].includes(type))continue;ctx.fillStyle=stonePattern(ctx)||'#8b7448';ctx.beginPath();const xx=x*T,yy=y*T;if([1,11].includes(type)){ctx.moveTo(xx,yy);ctx.lineTo(xx+T,yy);ctx.lineTo(xx,yy+T);}else if([2,12].includes(type)){ctx.moveTo(xx,yy);ctx.lineTo(xx+T,yy);ctx.lineTo(xx+T,yy+T);}else if(type===3){ctx.moveTo(xx,yy);ctx.lineTo(xx,yy+T);ctx.lineTo(xx+T,yy+T);}else if(type===4){ctx.moveTo(xx+T,yy);ctx.lineTo(xx,yy+T);ctx.lineTo(xx+T,yy+T);}else ctx.rect(xx,yy,T,T);ctx.fill();ctx.strokeStyle='#4d432d';ctx.stroke();if((x+y*3)%13===0&&type===0)atlas(ctx,'TempleAssets','decor_X0000',xx+8,yy+8,16,16);}
  for(const q of s.liquids){ctx.fillStyle=q.frozen?'#badcde':q.type===5?'#338bd5':q.type===6?'#ef542d':'#77c842';ctx.fillRect(q.x,q.y+3,q.w,T-3);for(let x=q.x;x<q.x+q.w;x+=32)atlas(ctx,'GroundAssets',(q.frozen?'IceBox':q.type===5?'WaterBox':q.type===6?'FireBox':'GreenBox')+'0000',x,q.y,32,32);}
  for(const e of s.exits){const at=s.players.some(p=>p.element===e.element&&p.inExit);if(!atlas(ctx,'TempleAssets',(e.element==='fb'?'FinishBoy':'FinishGirl')+String(at?21:0).padStart(4,'0'),e.x-28,e.y-65,56,69)){ctx.fillStyle=e.element==='fb'?'#e5673e':'#50bddc';ctx.fillRect(e.x-22,e.y-60,44,60);}}
  for(const g of s.gems)if(!g.taken)atlas(ctx,'CharAssets','diamond_'+g.element+'0000',g.x-16,g.y-16,32,32);
  for(const d of s.devices){if(drawDeviceArt(ctx,atlas,d,s.tick,l.objects.find(o=>o.id===d.id)))continue;ctx.save();ctx.translate(d.x,d.y-d.h/2);ctx.rotate(d.rotation);if(solidDevice(d)){ctx.fillStyle=d.active?'#c6aa4b':'#8e8061';ctx.fillRect(-d.w/2,-d.h/2,d.w,d.h);}const name= d.type==='box'?'movingbox0000':d.type==='boxheavy'?'movingbox20000':d.type==='boxmirror'?'BoxMirror0000':d.type==='platform'?'BarCenter0000':d.type==='hanging'?'hanging_platform0000':d.type==='pulley'?'pulley_platform0000':d.type==='pusher'?'pusher_block0000':d.type==='timedpusher'?'timed_pusher_base0000':d.type==='lightpusher'?'lightpusher_base0000':d.type==='lever'?'lever_base0000':d.type+'0000';atlas(ctx,'MechAssets',name,-d.w/2,-d.h/2,d.w,d.h);if(d.type==='lever'){ctx.rotate(d.active?-.6:.6);atlas(ctx,'MechAssets','lever_stick0000',-8,-35,16,45);}ctx.restore();}
  for(const beam of s.beams){ctx.strokeStyle=beam.color==='blue'?'#58c8ff':beam.color==='red'?'#ff6259':'#ffee8a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(beam.x,beam.y);ctx.lineTo(beam.tx,beam.ty);ctx.stroke();}
  for(const p of s.players){ctx.save();ctx.globalAlpha=p.alive?1:.25;const prefix=p.element==='fb'?'fire':'water';const anim=p.grounded?'idle':p.vy<0?'rising':'falling';const n=p.grounded?s.tick%30:Math.floor(s.tick/4)%5;ctx.translate(p.x,p.y-19);ctx.scale(p.facing,1);atlas(ctx,'CharAssets',prefix+'_legs_'+(Math.abs(p.vx)>.2?'running'+String(Math.floor(s.tick/2)%8).padStart(4,'0'):'idle0000'),-23,-42,46,60);atlas(ctx,'CharAssets',prefix+'_head_'+anim+String(n).padStart(4,'0'),-23,-47,46,57);ctx.restore();if(p.seat===seat){ctx.fillStyle='#fff';ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.fillText('你',p.x,p.y-70);}}
  for(const d of s.devices)drawForegroundDeviceArt(ctx,atlas,d,s.tick);
  ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(0,0,1248,35);ctx.fillStyle='#eee0b6';ctx.font='18px sans-serif';ctx.textAlign='left';ctx.fillText(`森林神殿 ${Number(s.levelId.slice(-2))}/32   ◆ ${s.collected}/${s.gems.length}   ${Math.floor(s.elapsed/HZ)} 秒   两人到达各自出口即可通关`,20,24);
  if(s.phase==='finished'){ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(250,360,748,130);ctx.fillStyle='#ffe7a4';ctx.font='bold 38px sans-serif';ctx.textAlign='center';ctx.fillText(s.success?'合作通关！':'伙伴倒下了 · 重新准备再试',624,437);}ctx.restore();
}
export const adapter:Adapter = {id:'fbw_forest-server',title:'森林冰火人',seats:2,hz:HZ,width:1248,height:928,controls:'A/D 或 ←/→ 移动，W/↑ 跳跃，J/空格 操作拉杆；红人避蓝水，蓝人避熔岩，两人避绿水。',maps:levels.map((l,i)=>({id:l.id,label:`森林神殿 ${i+1}`})),create,step,valid,render,consumeInput(state,seat,input){const p=(state as ForestState).players.find(x=>x.seat===seat);if(p){p.lastAttack=Math.max(p.lastAttack,input.attack);p.lastAlt=Math.max(p.lastAlt,input.alt);p.upHeld=input.up;}}};
