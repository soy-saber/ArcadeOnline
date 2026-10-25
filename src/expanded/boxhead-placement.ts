import type { State } from './types';
import { sameCell } from './boxhead-registration';

/** Count represented Mapwho children, including noncollidable things. Decals
 * are painted into the floor and never register; newly constructed things wait.
 * Actor/death and global callback timing follow the current authority model. */
export function cellChildCount(s:State,position:{x:number;y:number}):number {
  const things=[
    ...s.players,...s.zombies,...s.corpses,
    ...s.barrels.filter((b:any)=>['barrel','wall'].includes(b.kind)?b.registered:b.armed<s.tick),
    ...s.pickups.filter((p:any)=>p.life>0&&(p.born??-1)<s.tick),
    ...s.bullets.filter((b:any)=>b.life>0&&(b.born??-1)<s.tick),
    ...s.effects.filter((e:any)=>e.life>0&&['Effect.MuzzleFlash','Effect.BulletHit','Effect.RocketSmoke','Effect.SmokeCloud','Effect.Explosion'].includes(e.kind)&&
      (e.kind==='Effect.Explosion'?e.born<=s.tick:e.kind==='Effect.SmokeCloud'?e.born<=s.tick:(e.born??-1)<s.tick))
  ];
  return things.filter(thing=>sameCell(thing,position)).length;
}

export function placementCell(s:State,position:{x:number;y:number;z:number},columns:number,rows:number):{x:number;y:number;z:number}|null {
  const x=Math.floor(position.x/32),y=Math.floor(position.y/32);
  if(x<0||y<0||x>=columns||y>=rows||cellChildCount(s,position)>1)return null;
  // No static-wall or radial player/object rejection exists in native Fire.
  return {x:x*32+16,y:y*32+16,z:position.z};
}
