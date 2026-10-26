import type {Player} from './core';
import {startRacket} from './control';
import {setMotion} from './motion';
import {boundsContains,shapeContains} from './collision';
import {GROUND,pixel} from './stage';

export interface CPUState {serveSinceMs:number;serveReady:boolean;numVar2:number;swingVar:number|null;swingVar2:number|null;chance3:number}
export const cpuState=(now=0):CPUState=>({serveSinceMs:now,serveReady:false,numVar2:5,swingVar:null,swingVar2:null,chance3:100});
export interface CPUFrame {
  tick:number;nowMs:number;level:number;paused:boolean;pointOver:boolean;serve:number;servingSpot:number;chance1:number|null;
  player:Player;bird:{x:number;y:number;vx:number;direction:number}|null;cpu:CPUState;
}
const spots:Record<number,number>={2:434.95,3:474.95}; // Original servingSpot0/1 do not exist.
const value=(n:number|null):number=>n===null?NaN:n;

/** Original setupCPU callback. Keep source action order, undefined globals,
 * strict tests and random calls even when an attempted stroke is not ready. */
export function runCPU(s:CPUFrame,random:()=>number,observe?:(action:string)=>void):void {
  const p=s.player,c=s.cpu,b=s.bird,chance=[0,10,20,35,50,70][s.level-1];
  if(c.serveSinceMs+500<s.nowMs)c.serveReady=true;
  const move=(left:boolean)=>{
    observe?.(left?'moveLeft':'moveRight');
    if(left?shapeContains('netLimit',p.x,p.y):boundsContains('rightWall',p.x,p.y))return;
    if(!p.jumping)setMotion(p,left?'walkforward':'walkbackward',s.tick);
    p.x=pixel(p.x+(left?-5.9:5.9));p.facing=left?-1:1;
  };
  const normal=()=>{observe?.('noMove');if(!p.jumping)setMotion(p,'normal',s.tick);};
  const swing=()=>{
    observe?.('beforeSwing:'+c.chance3);observe?.('swing');
    if(s.pointOver)return;
    c.chance3=random()*100;
    if(!p.racket.active&&p.racket.ready)startRacket(p,s.serve===2,s.tick);
  };
  if(!s.paused){
    if(s.serve===2){
      const spot=spots[s.servingSpot];
      if(p.x>spot+10)move(true);
      else if(p.x<spot-10)move(false);
      else{if(c.serveReady)swing();normal();}
    }else if(b&&b.x>275){
      const diff=p.y-b.y,dx=Math.abs(p.x-b.x),right=p.x>412.5+c.numVar2-15;
      if(s.chance1!==null&&s.chance1>chance){
        c.numVar2=right?-10:10;
        if(right){c.swingVar=c.chance3<99?40:0;c.swingVar2=c.chance3<99?20:0;}
        if(s.level===3?diff<100-value(c.swingVar2)&&diff>30&&dx<85:diff<125-value(c.swingVar2)&&diff>50&&dx<85)swing();
        const offset=(right?25:45)+value(c.swingVar);
        if(p.x>b.x+5+offset)move(true);
        else if(p.x<b.x-5+offset)move(false);
        else normal();
      }else{
        c.numVar2=right?-10:10;
        if(right){
          if(s.level===3?diff<105&&diff>30&&dx<85:diff<125&&diff>50&&dx<85)swing();
          if(b.vx>15&&b.vx<25&&diff<200&&b.direction>81&&b.direction<110)move(false);
          else if(p.x>b.x+20)move(true);
          else if(p.x<b.x+10)move(false);
          else normal();
        }else{
          if(s.level===3?diff<105&&diff>30&&dx<85:diff<150&&diff>50&&dx<85)swing();
          if(p.x>b.x+60)move(true);
          else if(p.x<b.x+50)move(false);
          else normal();
        }
      }
    }else if(p.x>427.5)move(true);
    else if(p.x<417.5)move(false);
    else normal();
  }
  // Original CPU applies gravity after AI/movement, including while paused.
  p.vy++;p.y=pixel(p.y+p.vy);if(p.y>=GROUND){p.y=GROUND;p.jumping=false;}
}
