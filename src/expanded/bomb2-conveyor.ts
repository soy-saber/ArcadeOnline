// Original Transmittal: one pixel per frame, static 8000ms direction timer.
import RULES from './bomb2-mechanisms.json';
export const CONVEYOR_TICKS=RULES.conveyorTimerMs*40/1000;
export const CONVEYOR_SPEED=RULES.conveyorSpeed;
export const KICK_SPEED=RULES.kickSpeed;
export const REMOTE_FUSE=RULES.remoteBlastTime+2;
const DIRECTIONS=[-1,0,2,1,3];
export function conveyorDirection(h:{dir:number;turns?:readonly number[]},tick:number):number {
  const cycle=h.turns?.length?h.turns:[h.dir];
  return DIRECTIONS[cycle[Math.floor(tick/CONVEYOR_TICKS)%cycle.length]]??-1;
}
export function conveyorFrame(h:{dir:number;turns?:readonly number[]},tick:number):number {
  return [1,3,2,4][conveyorDirection(h,tick)]||h.dir;
}
