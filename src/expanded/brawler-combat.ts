import {animation,definition,geometry,restartAnimation,selectAnimation,twip,type Animation,type Color,type Geometry} from './brawler-native';

export const parameters=[{weight:.5,speed:.5,power:.5},{weight:.4,speed:.7,power:.4},{weight:.5,speed:.6,power:.4},{weight:.5,speed:.5,power:.5},{weight:.6,speed:.4,power:.5},{weight:.4,speed:.5,power:.6}];
export interface Combatant {
  seat:number;character:number;color:Color;x:number;y:number;vx:number;vy:number;facing:number;rotation:number;
  damage:number;combo:number;paralyzed:number;controlLoss:number;state:string;hasControl:boolean;attack:string;attackDone:boolean;specialUp:boolean;
  invincible:boolean;dying:boolean;shielded:boolean;shield:number;spawning:boolean;spawnProtection:number;koTime:number;jumps:number;bulletShot:boolean;electrocuted:boolean;
  grounded:boolean;lastSender:number|null;throwVictim:number|null;animation:Animation;emitted:boolean;dodgePresent:boolean;
}
export interface Launch {name:string;properties:Record<string,number>;extra?:number}
export interface Hooks {
  sound(action:'play'|'stop',name:string):void;
  launch(p:Combatant,shot:Launch):void;
  lookup(seat:number):Combatant|undefined;
  random():number;
  hit?(p:Combatant,sender:Combatant|undefined,amount:number):void;
  interrupted?(p:Combatant):void;
}
export function fighter(seat:number,character:number):Combatant {
  return {seat,character,color:['red','blue','green','orange'][seat-1]as Color,x:0,y:0,vx:0,vy:0,facing:1,rotation:0,damage:0,combo:2,paralyzed:0,controlLoss:0,state:'stop',hasControl:true,attack:'',attackDone:true,specialUp:false,invincible:false,dying:false,shielded:false,shield:100,spawning:false,spawnProtection:0,koTime:0,jumps:0,bulletShot:false,electrocuted:false,grounded:false,lastSender:null,throwVictim:null,animation:animation(),emitted:false,dodgePresent:false};
}
function pose(p:Combatant,name:string,restart=false):void {if(restart)restartAnimation(p,name);else selectAnimation(p,name);p.dodgePresent=name==='dodge';}
export function animateAttack(p:Combatant,which:string):void {
  if(which==='punchAir'&&p.vy>-5)p.vy-=5;
  p.attack=which;p.attackDone=false;p.emitted=false;pose(p,which,true);
}
export function attack(p:Combatant,type:'punch'|'special',extra:'none'|'up'):boolean {
  if(p.state==='ko'&&p.koTime>1000*p.damage/100){p.state='stop';animateAttack(p,'koAttack');return true;}
  if(p.attack!==''||!p.hasControl||p.controlLoss>0||p.state==='thrown'||p.dying||p.shielded)return false;
  if(type==='punch'){
    if(extra==='none')animateAttack(p,p.grounded?p.vx===0?'punchGround':'punchRun':'punchAir');
    else if(p.grounded&&p.vx===0)animateAttack(p,'punchUp');else return false;
  }else if(extra==='none'){
    if(p.grounded){p.state='stop';p.vx=0;}animateAttack(p,p.grounded?'specialGround':'specialAir');
  }else {if(!p.specialUp)return false;animateAttack(p,'specialUp');p.specialUp=false;}
  return true;
}
function protectedHit(p:Combatant,force:boolean):boolean {return p.state==='ko'&&!force||p.state==='spawn'||p.dying||p.shielded&&p.dodgePresent||p.invincible;}
export function throwFighter(p:Combatant,power:number,angle:number,sender:Combatant|undefined,h:Hooks,force=false):boolean {
  if(protectedHit(p,force)||p.shielded&&!force)return false;
  if(sender)p.lastSender=sender.seat;
  if(angle<0)angle=180+angle;angle*=Math.PI/180;
  power=Math.max(0,power+power*(sender?parameters[sender.character].weight:1)-power*parameters[p.character].weight+p.damage/100*Math.log(power)*power+p.combo/4);
  p.vx=Math.cos(angle)*power;p.vy=-Math.sin(angle)*power;p.controlLoss=power*power*5;
  if(power>10)h.sound('play','Thrown');p.state='thrown';pose(p,'thrown');return true;
}
export function damage(p:Combatant,amount:number,sender:Combatant|undefined,h:Hooks,force=false):boolean {
  if(protectedHit(p,force))return false;
  if(p.shielded){if(p.shield>0){p.shield-=amount/5;return false;}p.shielded=false;}
  if(sender)p.lastSender=sender.seat;
  h.interrupted?.(p);p.attack='';p.attackDone=true;p.specialUp=true;p.electrocuted=false;h.sound('stop','Electric');
  p.damage+=Math.floor(amount*p.combo/2);if(p.lastSender!==null)p.combo++;
  if(p.damage>999){p.damage=999;throwFighter(p,30,45,sender,h);}
  p.paralyzed=amount;if(sender)sender.paralyzed=amount*5;
  if(p.state!=='electrocuted'&&sender?.attack.slice(0,7)!=='special')h.hit?.(p,sender,amount);
  return true;
}
function punch(p:Combatant,q:Combatant,amount:number,power:number,angle:number,h:Hooks,afterDamage=false):void {
  if(!afterDamage)h.sound('play','Punch');damage(q,amount,p,h);if(afterDamage)h.sound('play','Punch');throwFighter(q,power,angle*p.facing,p,h);p.attackDone=true;
}
export function contact(p:Combatant,q:Combatant,h:Hooks):void {
  if(q.state==='spawn'||q.invincible||q.state==='ko')return;
  if(q.state==='thrown'&&p.attackDone)return;
  switch(p.attack){
    case 'punchGround':case 'punchRun':
      if(p.facing*(p.x-q.x)>0){if(Math.abs(p.x-q.x)>20)return;p.attack='specialBackThrow';pose(p,p.attack,true);p.hasControl=false;p.throwVictim=q.seat;p.attackDone=false;return;}
      punch(p,q,5,3,45,h);return;
    case 'koAttack':punch(p,q,5,3,45,h);return;
    case 'punchUp':case 'punchAir':punch(p,q,10,6,p.attack==='punchAir'?80:90,h,[1,2,3,5].includes(p.character));return;
    case 'specialGround':case 'specialAir':
      if(p.character===0){h.sound('play','Electric');q.state='electrocuted';damage(q,10,p,h);q.electrocuted=true;q.paralyzed=100;throwFighter(q,2.5,45*p.facing,p,h);p.attackDone=true;}
      else if(p.character===3){const distance=Math.abs(q.x-p.x),factor=1-1/(230/distance);if(distance<240&&distance>20&&p.animation.frame>=9&&p.animation.frame<15&&factor>=.2){h.sound('play','Boom');damage(q,Math.round(10*factor),p,h);throwFighter(q,5*factor,45*p.facing,p,h);p.attackDone=true;}}
      else if(p.character===5){damage(q,10,p,h);throwFighter(q,3,45*p.facing,p,h);p.attackDone=true;}
      return;
    case 'specialUp':
      if(p.character===0&&p.animation.frame>10&&q.y<=p.y+5){h.sound('play','Electric');q.state='electrocuted';damage(q,20,p,h);q.electrocuted=true;q.paralyzed=300;throwFighter(q,5,45*p.facing,p,h);p.attackDone=true;}
      else if(p.character===1||p.character===3)punch(p,q,20,4,45,h);
      else if(p.character===2&&p.y-q.y>=50)punch(p,q,20,4,85,h);
      return;
  }
}
function point(g:Geometry,name:string):number[] {return g.marks[name]?.slice(0,7).map(Number)??[NaN,NaN,NaN,NaN,NaN,NaN,NaN];}
function launch(p:Combatant,name:string,at:string,left:number,yOffset:number,scale:number,h:Hooks,g:Geometry,sound?:string,extra?:number,properties:Record<string,number>={}):void {
  const m=point(g,at),t=g.transform;
  const x=(p.facing===-1?left:m[0])+Number(t[0])+p.x+5,y=m[1]+Number(t[1])+p.y+yOffset;
  if(sound)h.sound('play',sound);
  h.launch(p,{name,properties:{_x:x,_y:y,_xscale:scale*p.facing,_yscale:scale,...properties},...(extra!==undefined?{extra}:{})});p.emitted=true;p.attackDone=true;
}
/** Original ParseSAttacks runs before the collision query, with no target. */
export function secondary(p:Combatant,h:Hooks,target?:Combatant,context?:Geometry):void {
  const frame=p.animation.frame,g=context??geometry(p);
  if(p.attack==='specialBackThrow'){
    const q=p.throwVictim===null?undefined:h.lookup(p.throwVictim);if(!q)return;
    const total=definition(p.character,p.attack).frames;
    if(frame===total){q.paralyzed=0;q.rotation=0;q.hasControl=true;p.hasControl=true;damage(q,15,p,h);throwFighter(q,5,30*p.facing,p,h);return;}
    q.hasControl=false;q.x=twip(p.facing*Math.cos(frame*Math.PI*.8/total-Math.PI)*25+p.x);q.y=twip(Math.sin(frame*Math.PI*.8/total-Math.PI)*25+p.y);return;
  }
  if(p.attack==='specialGround'||p.attack==='specialAir'){
    if(p.character===0){if(frame===definition(p.character,p.attack).frames)launch(p,'EnergyBall','hand',-10,-7,50,h,g);return;}
    if(p.character===3){if(frame>=5){if(p.bulletShot)return;p.bulletShot=true;h.sound('play','Kamehameha');}else p.bulletShot=false;return;}
    const minimum=p.character===4?6:p.character===5?5:9;
    if(frame>=minimum){
      if(p.bulletShot)return;p.bulletShot=true;
      if(p.character===1)launch(p,'Poop','poop',-7,-5,40,h,g,'Fart');
      else if(p.character===2)launch(p,'Pencil','pencil',-28,-5,80,h,g);
      else if(p.character===4)launch(p,'Garbage','garbage',-12,-7,100,h,g,undefined,point(g,'garbage')[5]);
      else if(p.character===5)launch(p,'Bullet','bullet',-54,-7,50,h,g,'Gun');
    }else p.bulletShot=false;
    return;
  }
  if(p.attack!=='specialUp')return;
  if(p.character===0){if(frame<10)p.vy*=.5;else{if(frame<12)h.sound('play','Thunder');p.vy=-6;}return;}
  if(p.character===1||p.character===3){if(frame<=2){h.sound('play','Woosh');p.vy*=.5;}else p.vy=-8;return;}
  if(p.character===2){if(frame<=7){if(frame<3)h.sound('play','Woosh');p.vy*=.2;}else p.vy=-9;return;}
  if(p.character===4){
    if(frame<10)p.vy*=.5;else p.vy=-6;
    // The original AVM1 <= branch also succeeds for the absent pre-query
    // target. Native fixtures verify this; JS's undefined comparison differs.
    if(frame>10&&(!target||target.y<=p.y+5)){
      if(p.bulletShot)return;p.bulletShot=true;h.sound('play','Boom');const b=g.bounds,height=Number(b[3])-Number(b[1]);
      for(let i=0;i<20;i++)h.launch(p,{name:'Garbage',properties:{_x:p.x,_y:p.y-height/2,_xscale:100*p.facing,_yscale:100,xInc:Math.cos(i*18*Math.PI/180)*15,yInc:Math.sin(i*18*Math.PI/180)*15},extra:Math.floor(h.random()*6)});
    }else p.bulletShot=false;return;
  }
  if(p.character===5){
    if(frame<7)p.vy*=.5;else if(frame<=10)p.vy=-6;
    if(frame>14){
      if(p.bulletShot)return;p.vy=-5;p.bulletShot=true;const m=point(g,'rocket');const rotation=p.facing===-1?-m[2]:m[2];
      launch(p,'Rocket','rocket',-12,-7,100,h,g,'Rocket',undefined,{_rotation:rotation,xInc:Math.cos((rotation-90)*Math.PI/180)*15,yInc:Math.sin((rotation-90)*Math.PI/180)*15});
    }else p.bulletShot=false;
  }
}
