import data from './boxhead-data.json';
import type { State } from './types';
import { CELL, room, solid } from './boxhead-world';
import { objectBlocks } from './boxhead-registration';
import { wallBlocks } from './boxhead-walls';

interface Hooks {hurt(player:any,amount:number):void;damage(target:any,amount:number):void}
export function stepFireball(s:State,b:any,hooks:Hooks):void {
  b.vx*=1.02;b.vy*=1.02;
  const x=b.x+b.vx,y=b.y+b.vy,r=b.radius,map=room(s);
  let collided=false;
  for(let cy=Math.floor((y-r)/CELL);cy<=Math.floor((y+r)/CELL);cy++)for(let cx=Math.floor((x-r)/CELL);cx<=Math.floor((x+r)/CELL);cx++)if(solid(map,cx*CELL,cy*CELL))collided=true;
  const near=(p:any,radius:number)=>Math.hypot(p.x-x,p.y-y)<r+radius;
  collided ||= s.players.some(p=>p.alive&&near(p,.45*CELL))||
    s.zombies.some((z:any)=>z.hp>0&&z.ai.registered&&z.ai.collidable&&near(z,z.ai.radius))||
    s.barrels.some((p:any)=>objectBlocks(p)&&(p.hp>0||wallBlocks(p,s.tick))&&near(p,p.radius));
  if(collided) {
    // GenericCollide does not move on impact. AffectArea covers expanded grid
    // bounds around the OLD position; it does not apply a radial falloff.
    const left=Math.max(0,Math.round((b.x-r)/CELL)-1),right=Math.min(map.columns-1,Math.round((b.x+r)/CELL));
    const top=Math.max(0,Math.round((b.y-r)/CELL)-1),bottom=Math.min(map.rows-1,Math.round((b.y+r)/CELL));
    const inside=(p:any)=>{const x=Math.floor(p.x/CELL),y=Math.floor(p.y/CELL);return x>=left&&x<=right&&y>=top&&y<=bottom;};
    if(!b.multiply) {
      for(const p of s.players)if(p.alive&&inside(p))hooks.hurt(p,b.damage);
      for(const z of s.zombies)if(z.id!==b.parent&&z.hp>0&&z.ai.registered&&inside(z))hooks.damage(z,b.damage);
    }
    // Players/creatures have FireBall affects but no DevilAttack affect flag.
    for(const p of s.barrels)if(p.registered&&p.hp>0&&['barrel','wall'].includes(p.kind)&&inside(p))hooks.damage(p,b.multiply?10000:b.damage);
    b.life=0;return;
  }
  b.x=x;b.y=y;b.animation=(b.animation+1)%data.objects['Effect.FireBall'].frames;
}
export function validFireball(b:any):boolean {
  return b.weapon!==-1||b.fireball===true&&b.owner===-1&&Number.isSafeInteger(b.parent)&&b.parent>=0&&typeof b.multiply==='boolean'&&
    b.radius===(b.multiply?CELL:.25*CELL)&&Number.isFinite(b.animation)&&b.animation>=0&&b.animation<data.objects['Effect.FireBall'].frames&&
    Number.isFinite(b.z)&&b.z>=0&&b.life===1;
}
