import type { State } from './types';
import { CELL, room } from './boxhead-world';
import { objectBlocks } from './boxhead-registration';
import { wallBlocks } from './boxhead-walls';

const RADIUS=.1*CELL,GRAVITY=.06*CELL;

/** CMap.Collide_Mapwho_Height gathers once around the proposed point. Its
 * temporary Z is displaced with each circle, but only XY returns to the delta.
 * Mapwho insertion history is still represented by reverse allocated ID. */
function heightCollide(s:State,b:any) {
  const map=room(s),r=RADIUS;
  let x=b.x+b.vx,y=b.y+b.vy,z=b.z+b.vz,collided=false;
  const left=Math.max(0,Math.round((x-r)/CELL)-1),right=Math.min(map.columns-1,Math.round((x+r)/CELL));
  const top=Math.max(0,Math.round((y-r)/CELL)-1),bottom=Math.min(map.rows-1,Math.round((y+r)/CELL));
  const at=(p:any)=>Math.floor(p.y/CELL)*map.columns+Math.floor(p.x/CELL);
  const things=[...s.players,...s.zombies.filter((p:any)=>p.ai.registered),...s.barrels.filter((p:any)=>objectBlocks(p)&&(p.kind==='barrel'&&p.hp>0||wallBlocks(p,s.tick)))]
    .filter(p=>p.id!==b.parent&&(p.body?p.body.collidable:true)&&Math.floor(p.x/CELL)>=left&&Math.floor(p.x/CELL)<=right&&Math.floor(p.y/CELL)>=top&&Math.floor(p.y/CELL)<=bottom)
    .sort((a,b)=>at(b)-at(a)||b.id-a.id);
  for(const p of things){
    const dx=x-p.x,dy=y-p.y,distance=Math.hypot(dx,dy),limit=r+(p.body?p.body.radius:p.radius);
    const pz=p.z??0,height=(p.body?p.devil?1.8:1.5:1)*CELL;
    if(distance<limit&&z<pz+height){
      if(distance){const k=(limit-distance)/distance;x+=dx*k;y+=dy*k;z+=(z-pz)*k;}
      else{
        // The original divides by zero here. Keep the same deterministic
        // finite fallback used by authority creature circle collisions.
        const length=Math.hypot(b.vx,b.vy);x=p.x+(length?-b.vx/length:1)*limit;y=p.y+(length?-b.vy/length:0)*limit;
      }
      collided=true;
    }
  }
  return {x,y,collided};
}

function mapCollides(s:State,x:number,y:number):boolean {
  const map=room(s),left=Math.max(0,Math.floor((x-RADIUS)/CELL)),right=Math.min(map.columns-1,Math.floor((x+RADIUS)/CELL));
  const top=Math.max(0,Math.floor((y-RADIUS)/CELL)),bottom=Math.min(map.rows-1,Math.floor((y+RADIUS)/CELL));
  for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++)if(map.collision[row][col]!=='0')return true;
  return false;
}

/** BounceCollide resolves circles, then map diagonal/X/Y, and reflects against
 * the correction normal. It does not Move to the resolved point: the caller
 * moves the reflected, quarter-damped delta from the original position. */
export function bounceGrenade(s:State,b:any):boolean {
  const map=room(s),circle=heightCollide(s,b);let x=circle.x,y=circle.y,collided=circle.collided;
  const col=Math.floor(b.x/CELL),row=Math.floor(b.y/CELL);
  if(col<=0||row<=0||col>=map.columns-1||row>=map.rows-1){x=b.x;y=b.y;}
  else if(mapCollides(s,x,y)){
    collided=true;
    if(!mapCollides(s,x,b.y))y=b.y;
    else if(!mapCollides(s,b.x,y))x=b.x;
    else {x=b.x;y=b.y;}
  }
  if(!collided)return false;
  const dx=x-(b.x+b.vx),dy=y-(b.y+b.vy),length=Math.hypot(dx,dy),nx=length?dx/length:0,ny=length?dy/length:0;
  const dot=2*(b.vx*nx+b.vy*ny);b.vx-=nx*dot;b.vy-=ny*dot;return true;
}

export function grenadeShot(s:State,p:any,origin:{x:number;y:number;z:number},power:number,damage:number,bang:number,cluster:boolean):void {
  s.bullets.push({id:++s.nextId,...origin,vx:0,vy:0,vz:0,angle:p.dir,parent:p.id,owner:p.seat,weapon:4,damage,
    life:60,bang,cluster,born:s.tick,grenadePhase:'init',grenadePower:power,radius:RADIUS});
}

/** Both original projectile classes share Process_Normal, including the last
 * move before their explosion is enqueued and next-tick collection disposal. */
export function stepGrenade(s:State,b:any,sound:(name:string)=>void):boolean {
  if(b.grenadePhase==='init'){
    b.z=40;b.vx=Math.cos(b.angle)*b.grenadePower*CELL;b.vy=Math.sin(b.angle)*b.grenadePower*CELL;b.vz=.5*b.grenadePower*CELL;
    b.grenadePhase='normal';
  }
  let bounced=false;b.vz-=GRAVITY;
  if(b.z+b.vz<0){b.vz=Math.abs(b.vz);if(b.vz<=GRAVITY)b.vz=0;b.vx*=.5;b.vy*=.5;b.vz*=.5;b.z=0;bounced=true;}
  if(bounceGrenade(s,b)){b.vx*=.25;b.vy*=.25;bounced=true;}
  if(bounced&&Math.hypot(b.vx,b.vy,b.vz)>GRAVITY)sound('Shot.Grenade.Bounce.wav');
  b.x+=b.vx;b.y+=b.vy;b.z+=b.vz;
  if(--b.life===0){b.grenadePhase='delete';return true;}
  return false;
}

export function validGrenade(b:any):boolean {
  if(b.weapon!==4)return b.grenadePhase===undefined&&b.grenadePower===undefined;
  if(!['angle','parent','radius'].every(k=>Number.isFinite(b[k]))||!Number.isSafeInteger(b.parent)||b.parent<0||b.radius!==RADIUS||
    !['init','normal','delete'].includes(b.grenadePhase)||!Number.isSafeInteger(b.life))return false;
  if(b.clusterShell===true)return b.grenadePower===null&&b.grenadePhase!=='init'&&(b.grenadePhase==='delete'?b.life===0:b.life>=1&&b.life<=23);
  if(!Number.isFinite(b.grenadePower)||b.grenadePower<.25||b.grenadePower>.75)return false;
  return b.grenadePhase==='init'?b.life===60&&b.vx===0&&b.vy===0&&b.vz===0:b.grenadePhase==='delete'?b.life===0:b.life>=1&&b.life<=59;
}
