import type {Combatant,Hooks} from './brawler-combat';
import {parameters} from './brawler-combat';
import {animation,bounds,advanceAnimation,definition,selectAnimation,twip,type Animation} from './brawler-native';
import {collision,type Platform} from './brawler-world';
export interface Fighter extends Combatant {
 alive:boolean;stocks:number;deaths:number;kos:number;nativeKos:number;suicides:number;deathOrder:number|null;killedBy:number|null;respawn:number;
 hitX:number;hitY:number;hitAnimation:Animation;moveQueue:string;goThrough:boolean;
 lastAttack:number;lastAlt:number;lastJump:number;leftHeld:boolean;rightHeld:boolean;downHeld:boolean;upHeld:boolean;shieldHeld:boolean;upTicks:number;upCombo:boolean;
 spawnType:number;spawnFrame:number;spawnAge:number;spawnX:number;spawnY:number;blinker:number;
}
export function move(p:Fighter,direction:string):void {
 if(!p.hasControl||p.controlLoss>0||p.state==='ko'&&p.koTime<10*p.damage)return;
 if(p.attack!==''&&(p.grounded&&direction!=='stop'||direction==='stop')){p.moveQueue=direction;return;}
 if(direction==='right'||direction==='left'){p.vx=8*parameters[p.character].speed*(direction==='left'?-1:1);p.state=direction==='left'?'goleft':'goright';}
 else if(direction==='stop'){if(p.dodgePresent&&p.shielded)return;if(p.grounded)p.vx=0;p.state='stop';}
 else if(direction==='down'){if(p.grounded){p.vx=0;p.state='crouch';}else p.vy=8;}
}
export function jump(p:Fighter):void {
 if(!p.hasControl||p.controlLoss>0||p.state==='ko'||p.shielded||p.attack!=='')return;
 p.goThrough=false;if(p.state==='thrown')p.state='stop';
 if(p.jumps===0){p.jumps=1;p.hitY=twip(p.hitY-1);p.vy=-9;}
 else if(p.jumps===1&&p.vy>=-3){p.jumps=2;p.vy=-9;}
}
export function animate(p:Fighter):void {
 if(p.vx!==0)p.facing=(p.vx>0?1:-1)*(p.state==='thrown'?-1:1);
 if(p.paralyzed>0&&p.attack==='')selectAnimation(p,p.electrocuted?'electrocuted':'takingHit');
 if(p.state==='thrown'){if(p.paralyzed<=0)selectAnimation(p,'thrown');return;}
 if(p.state==='ko')selectAnimation(p,'ko');
 if(p.attack!==''){
  if(p.animation.frame!==definition(p.character,p.attack).frames)return;
  p.attack='';p.hasControl=true;
  if(p.moveQueue){move(p,p.moveQueue);p.moveQueue='';}
  if(p.jumps>0)p.jumps=3;p.attackDone=true;
 }
 if(p.grounded){
  if(p.state==='goright'||p.state==='goleft'){
   if(p.shielded){selectAnimation(p,'dodge');if(p.animation.frame===definition(p.character,'dodge').frames){p.vx=0;p.state='stop';}}
   else selectAnimation(p,'run');
  }else if(p.state==='crouch')selectAnimation(p,'crouch');
  else if(p.jumps>0)selectAnimation(p,'run');else if(p.state==='stop')selectAnimation(p,'still');
 }else if(p.jumps===1)selectAnimation(p,'jump1');else if(p.jumps===2)selectAnimation(p,'jump2');else selectAnimation(p,'falling');
 p.dodgePresent=p.animation.pose==='dodge';
}
export function advance(p:Fighter):void {advanceAnimation(p.character,p.animation);advanceAnimation(p.character,p.hitAnimation);if(p.state==='spawn')p.spawnFrame++;}
function gravity(p:Fighter):void {p.y=twip(p.y+p.vy);if(p.vy<6)p.vy+=.5;else if(p.vy!==8)p.vy=6;}
/** Source DoFighter collision branches, retaining their ordering. */
export function movement(p:Fighter,platforms:Platform[],h:Hooks):boolean {
 if(p.shield>100)p.shield=100;else if(p.shield<0){p.shield=0;p.shielded=false;}
 if(p.shielded)p.shield-=.2;else {p.shield+=.1;if(p.dodgePresent){p.vx=0;p.state='stop';}}
 if(p.state==='ko'||p.spawning)p.blinker++;
 if(p.paralyzed>0){p.paralyzed-=25;animate(p);return false;}
 if(p.controlLoss>0)p.controlLoss-=25;
 p.hitX=twip(p.hitX+p.vx);p.hitY=twip(p.hitY+p.vy);
 const hitPose=p.state==='thrown'?'thrown':'still';if(p.hitAnimation.pose!==hitPose)p.hitAnimation=animation(hitPose);
 if(p.state==='stop'&&!p.grounded)p.vx*=.7;else if(p.state==='stop'&&p.grounded)p.vx=0;
 if(p.vx===0&&p.jumps>0&&p.grounded)p.state='stop';if(Math.abs(p.vx)<.5)p.vx=0;
 if(p.state==='ko'){if(p.koTime>p.damage){p.state='stop';p.hasControl=true;}p.koTime+=25;}
 const b=bounds({...p,x:p.hitX,y:p.hitY,color:'red',facing:1,animation:p.hitAnimation,emitted:false});
 const c=b?collision(b,platforms,!(p.state==='thrown'&&p.vy<0)):null;
 const xMove=()=>{p.x=twip(p.x+p.vx);};const bounce=()=>{if(p.state==='thrown'){p.facing*=-1;p.vx*=-1;}};
 if(!c?.hit||p.goThrough){xMove();gravity(p);if(p.goThrough){p.vy=5;p.vx=0;}p.grounded=false;if(!c?.hit)p.goThrough=false;}
 else {
  if(c.leftBC!==c.rightBC&&p.grounded&&c.bottom&&!c.left&&!c.right&&p.shielded&&p.dodgePresent){p.x=twip(p.x-p.vx);p.vx=0;}
  if((c.bottom||c.leftBC||c.rightBC)&&!p.goThrough&&p.vy>=0&&!c.left&&!c.right||c.bottom&&(c.left&&c.rightBC||c.right&&c.leftBC)){
   if(p.state==='thrown'){h.sound('play','HitGround');p.state='ko';p.koTime=0;p.vx=0;p.hasControl=false;}
   if(!c.left&&!c.right)xMove();p.y=twip(c.floor);p.hitY=p.y;p.jumps=0;p.vy=0;p.grounded=true;p.specialUp=true;p.lastSender=null;p.killedBy=null;p.combo=2;
   if(c.moving&&p.state==='crouch')p.goThrough=true;
  }
  if(c.bottom&&p.vy<0&&c.moving){xMove();gravity(p);}
  if(c.top&&c.moving){xMove();gravity(p);}
  if(c.bottom&&!c.moving&&!c.left&&!c.right&&!p.grounded){xMove();p.y=twip(p.y+p.vy);}
  if(!c.leftBC&&!c.rightBC&&(c.left||c.right)&&!p.grounded){bounce();gravity(p);}
  if((c.leftBC||c.rightBC)&&p.grounded&&!c.bottom&&!c.left&&!c.right&&!(p.shielded&&p.dodgePresent))xMove();
  if((c.leftBC||c.rightBC)&&!p.grounded&&!c.left&&!c.right&&p.vy!==0){bounce();gravity(p);}
  else if((c.leftBC&&c.left||c.rightBC&&c.right)&&!c.bottom){bounce();if(c.moving)xMove();gravity(p);}
  if((c.leftBC||c.rightBC)&&!p.grounded&&!c.left&&!c.right&&!c.bottom){bounce();gravity(p);}
  if(c.left&&c.right&&c.moving)xMove();
  if(c.top&&!c.moving){xMove();p.vy=0;const actual=bounds(p);p.y=twip(c.floor+c.height+(actual?actual[3]-actual[1]:0)+5);p.hitY=p.y;}
  if(c.top&&c.moving)gravity(p);
  if(!c.bottom&&!(c.leftBC&&c.rightBC)&&p.vy!==0)p.grounded=false;
 }
 return true;
}
