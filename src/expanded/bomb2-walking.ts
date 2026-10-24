import {CELL,moveRight,moveLeft,moveUp,moveDown,type MotionBody,type MotionMap} from './bomb2-motion';
export interface Walking extends MotionBody {vx:number;vy:number;gridX:number;gridY:number}
export function walkingAt(x:number,y:number):Walking {return{x:x*CELL,y:y*CELL,w:CELL,h:CELL,vx:0,vy:0,blocked:false,gridX:x,gridY:y};}
export function stopWalking(body:Walking):void {body.vx=0;body.vy=0;body.blocked=false;}
export function moveWalking(body:Walking,map:MotionMap,direction:number,velocity:number,resistance:number):void {
  body.blocked=false;
  // AbstractRobot.move{Left,Up,Right,Down}: accelerate before damping and
  // remove perpendicular velocity. Idle movement retains native friction.
  if(direction===0||direction===2){body.vx+=(direction===0?-1:1)*velocity/resistance;body.vx*=resistance;body.vy*=resistance;body.vy=0;}
  else if(direction===1||direction===3){body.vy+=(direction===1?-1:1)*velocity/resistance;body.vx*=resistance;body.vy*=resistance;body.vx=0;}
  else{body.vx*=resistance;body.vy*=resistance;}
  if(body.vx>.1)moveRight(body,map,body.vx);
  else if(body.vx<-.1)moveLeft(body,map,body.vx);
  else if(body.vy>.1)moveDown(body,map,body.vy);
  else if(body.vy<-.1)moveUp(body,map,body.vy);
  body.gridX=Math.floor((body.x+body.w/2)/CELL);body.gridY=Math.floor((body.y+body.h/2)/CELL);
}
export function walkingPosition(p:{x:number;y:number;walking?:Walking;moveDir?:number;progress?:number;moveTicks?:number}):{x:number;y:number} {
  if(p.walking)return{x:p.walking.x/CELL,y:p.walking.y/CELL};
  const vector=[[ -1,0],[0,-1],[1,0],[0,1]][p.moveDir??-1]||[0,0],fraction=(p.progress||0)/Math.max(1,p.moveTicks||1);
  return{x:p.x+vector[0]*fraction,y:p.y+vector[1]*fraction};
}
