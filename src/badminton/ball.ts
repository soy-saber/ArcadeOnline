import {GROUND,LEFT_WALL,RIGHT_WALL,NET_X,NET_TOP,NET_HALF_WIDTH,pixel,rotation,wrapRotation} from './stage';

export interface Birdie {
  x:number;y:number;vx:number;vy:number;lastHitter:number;contactBy:number;born:number;
  leftSide:boolean;rightSide:boolean;topSide:boolean;bottomSide:boolean;
  rotation:number;speed:number;
}
export function birdie(x:number,y:number,vx=0,vy=0,lastHitter=0,born=0):Birdie {
  return {x:pixel(x),y:pixel(y),vx,vy,lastHitter,contactBy:0,born,leftSide:false,rightSide:false,topSide:false,bottomSide:false,rotation:wrapRotation(rotation(vx,vy)),speed:0};
}
interface Effects { random():number;trail(x:number,y:number):void;net():void;ground():void }

/** Original setupBirdie callback, with dx/dy sign reversed for the platform.
 * Flag equality retains prior regions; rotation and trails precede collisions.
 * Every native position assignment passes through the AVM1 twip setter. */
export function fly(b:Birdie,effects:Effects):void {
  if(b.x>NET_X){b.rightSide=true;b.leftSide=false;}
  if(b.x<NET_X){b.rightSide=false;b.leftSide=true;}
  if(b.y>NET_TOP){b.topSide=false;b.bottomSide=true;}
  if(b.y<NET_TOP){b.topSide=true;b.bottomSide=false;}
  if(Math.abs(b.vy)>0)b.vy+=1;
  b.vy*=.925;b.vx*=.92;
  b.rotation=wrapRotation(rotation(b.vx,b.vy));
  b.speed=Math.pow(b.vx*b.vx+b.vy*b.vy,.5);
  const count=b.speed>20?2:b.speed>12?1:0;
  for(let i=0;i<count;i++)effects.trail(b.x,b.y);
  b.y=pixel(b.y+b.vy);b.x=pixel(b.x+b.vx);
  if(b.x>=RIGHT_WALL){b.vx*= -.8;b.x=RIGHT_WALL;}
  if(b.x<=LEFT_WALL){b.vx*= -.8;b.x=LEFT_WALL;}
  if(b.bottomSide&&b.x>NET_X-NET_HALF_WIDTH&&b.leftSide){
    b.x=pixel(NET_X-NET_HALF_WIDTH);b.y=pixel(b.y-b.vy);b.vx*= -.2;b.vy*=.1;effects.net();
    if(b.vx> -2)b.vx= -2;
  }
  if(b.bottomSide&&b.x<NET_X+NET_HALF_WIDTH&&b.rightSide){
    b.x=pixel(NET_X+NET_HALF_WIDTH);b.y=pixel(b.y-b.vy);b.vx*= -.2;b.vy*=.1;effects.net();
    if(b.vx<2)b.vx=2;
  }
  if(b.topSide&&b.x<NET_X+NET_HALF_WIDTH&&b.x>NET_X-NET_HALF_WIDTH&&b.y>NET_TOP){
    b.y=pixel(NET_TOP);b.vx*=.5;b.vy*= -1;effects.net();
    if(Math.abs(b.vx)<3)b.vx=effects.random()>.5?3:-3;
  }
  if(b.y>=GROUND){
    b.y=GROUND;b.vy*= -.4;
    if(Math.abs(b.vx)>1)b.vx*=.9;
    if(Math.abs(b.vy)<.5)b.vy=0;
    else if(Math.abs(b.vx)<2)b.vx=b.vx<0?-.7:.7;
    if(Math.abs(b.vx)<.5)b.vx*=.1;
    effects.ground();
  }
}
