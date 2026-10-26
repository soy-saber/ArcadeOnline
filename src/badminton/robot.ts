import type {Player} from './core';
import {startRacket} from './control';
import {setMotion} from './motion';
import {NET_LIMIT_X,pixel} from './stage';
export interface RobotState {phase:number}
export interface RobotFrame {tick:number;started:boolean;paused:boolean;over:boolean;serve:number;player:Player;robot:RobotState;pointer:{x:number;y:number};hit:boolean;jump:boolean}
/** Original setupHero1p mouse follow/bob and native hard net-side clamp.
 * Its Space jump changes pose/dy but this callback never applies gravity. */
export function runRobot(s:RobotFrame,trail:(x:number,y:number)=>void):void {
  const p=s.player,r=s.robot;
  if(s.started)trail(p.x,p.y);
  r.phase+=.1;
  if(!s.over&&!s.paused){p.x=pixel(p.x-(p.x-s.pointer.x)/2);p.y=pixel(p.y-((p.y-s.pointer.y)/2+Math.cos(r.phase)*1.5));}
  else p.y=pixel(p.y-Math.cos(r.phase)*.5);
  if(s.over||s.paused)return;
  if(s.hit&&!p.racket.active&&p.racket.ready)startRacket(p,s.serve===1,s.tick);
  if(s.jump&&!p.jumping&&s.serve!==1){setMotion(p,'walkup',s.tick);p.jumping=true;p.jumps++;p.vy=-12;}
  const limit=NET_LIMIT_X-30-(s.serve===1?65:0);if(p.x>limit)p.x=pixel(limit);
}
