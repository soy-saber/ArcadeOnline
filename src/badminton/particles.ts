import {pixel,wrapRotation} from './stage';

export interface Particle {id:number;kind:'ball'|'robot';born:number;x:number;y:number;vx:number;vy:number;rotation:number;spin:number;scale:number;shrink:number;width:number}
interface World {tick:number;particles:Particle[];nextParticle:number}
const f=Math.fround;
const even=(n:number):number=>{const floor=Math.floor(n),frac=n-floor;return frac<.5?floor:frac>.5?floor+1:floor%2===0?floor:floor+1;};

/** Native Script bounds ignore the blur filter. Matrix multiplication and
 * point transforms use f32 and ties-even twips, unlike _x/_y truncation. */
export function particleWidth(rotation:number,scale:number,kind:'ball'|'robot'='ball'):number {
  const child=kind==='robot'?1.7103119:.32624817;
  const angle=rotation*Math.PI/180,a=f(f(Math.cos(angle)*scale)*f(child)),c=f(f(-Math.sin(angle)*scale)*f(child));
  const x=[];for(const px of [-118,118])for(const py of [-79,80])x.push(even(f(f(a*px)+f(c*py))));
  return (Math.max(...x)-Math.min(...x))/20;
}

export function spawnTrail(s:World,x:number,y:number,random:()=>number):void {
  const px=pixel(x+random()*10-5),py=pixel(y+random()*10-5),direction=random()*360,spin=random()*20+20,speed=random()*2+1,shrink=.9+random()*.1-.05;
  const rotation=wrapRotation(random()*360),angle=(direction-90)/180*Math.PI,id=s.nextParticle;
  s.nextParticle=(id+1)%1000;
  s.particles=s.particles.filter(p=>p.kind!=='ball'||p.id!==id);
  s.particles.push({id,kind:'ball',born:s.tick,x:px,y:py,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,rotation,spin,scale:1,shrink,width:particleWidth(rotation,1)});
}
export function spawnRobotTrail(s:World,x:number,y:number,random:()=>number):void {
  const px=pixel(x+random()*6-3),py=pixel(y+random()*6-3);
  for(let i=0;i<2;i++){
    const direction=random()*90+135,spin=random()*20+20,speed=random()*2+2,shrink=.9+random()*.1-.05,rotation=wrapRotation(random()*360),angle=(direction-90)/180*Math.PI,id=s.nextParticle;
    s.nextParticle=(id+1)%1000;s.particles=s.particles.filter(p=>p.kind!=='robot'||p.id!==id);
    s.particles.push({id,kind:'robot',born:s.tick,x:px,y:py,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,rotation,spin,scale:1,shrink,width:particleWidth(rotation,1,'robot')});
  }
}
export function advanceTrails(s:World):void {
  s.particles=s.particles.filter(p=>{
    if(p.born>=s.tick)return true;
    p.x=pixel(p.x+p.vx);p.y=pixel(p.y+p.vy);p.rotation=wrapRotation(p.rotation+p.spin);p.scale*=p.shrink;p.width=particleWidth(p.rotation,p.scale,p.kind);
    // Native alphaRate is undefined; assigning NaN to _alpha leaves100%.
    // The original removes only when rotated width reaches10% of3.8px.
    return p.width>(p.kind==='robot'?2.02:.38);
  });
}
