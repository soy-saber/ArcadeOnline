import art from './character-art.json';
import type { Player } from './core';

export type Motion = keyof typeof art.poses.p1;
export function setMotion(p:Player,motion:Motion,tick:number):void {
  // Repeated gotoAndStop on the same parent frame leaves its child playing.
  // Changing labels replaces the child and starts its native frame1.
  if(p.motion!==motion){p.motion=motion;p.motionAt=tick;}
}
export function bodyPose(seat:number,p:Pick<Player,'motion'|'motionAt'>,tick:number) {
  const meta=art.poses[seat===1?'p1':'p2'][p.motion];
  return {meta,frame:meta.playing?Math.max(0,tick-p.motionAt)%meta.frames+1:1};
}
