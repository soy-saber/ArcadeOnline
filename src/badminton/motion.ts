import art from './character-art.json';
import type { Player } from './core';
import solo from './solo-art.json';
import type {ActorKey} from './geometry';

export type Motion = keyof typeof art.poses.p1;
export function setMotion(p:Player,motion:Motion,tick:number):void {
  // Repeated gotoAndStop on the same parent frame leaves its child playing.
  // Changing labels replaces the child and starts its native frame1.
  if(p.motion!==motion){p.motion=motion;p.motionAt=tick;}
}
export function bodyPose(seat:number,p:Pick<Player,'motion'|'motionAt'>,tick:number,profile?:ActorKey) {
  if(profile&&profile!=='p1'&&profile!=='p2'){
    const pose=solo.actors[profile].poses[p.motion],meta={...pose,...(solo.exports as Record<string,{file:string;w:number;h:number;x:number;y:number;frames:number}>)[String(pose.export)]};
    return {meta,frame:meta.playing?Math.max(0,tick-p.motionAt)%meta.frames+1:1};
  }
  const meta=art.poses[seat===1?'p1':'p2'][p.motion];
  return {meta,frame:meta.playing?Math.max(0,tick-p.motionAt)%meta.frames+1:1};
}
