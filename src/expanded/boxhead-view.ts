import data from './boxhead-data.json';
import type { State } from './types';
import { WIDTH, HEIGHT, HUD, WEAPONS, camera, room } from './boxhead-world';

const base='/expanded/assets/boxhead/';
const images=new Map<string,HTMLImageElement>();
function image(file:string):HTMLImageElement {
  let im=images.get(file);if(!im){im=new Image();im.src=base+file;images.set(file,im);}return im;
}
function ready(im:HTMLImageElement):boolean{return im.complete&&im.naturalWidth>0;}
function sprite(c:CanvasRenderingContext2D,key:string,x:number,y:number,frame=0,scale=1,rotation=0):void {
  const meta=(data.objects as Record<string,{file:string;frames:number;w:number;h:number;x:number;y:number}>)[key];if(!meta)return;
  const im=image(meta.file);if(!ready(im))return;
  c.save();c.translate(x,y);c.rotate(rotation);c.scale(scale,scale);
  c.drawImage(im,Math.min(meta.frames-1,Math.max(0,Math.floor(frame)))*meta.w,0,meta.w,meta.h,meta.x,meta.y,meta.w,meta.h);c.restore();
}
function person(c:CanvasRenderingContext2D,character:string,action:string,p:any,tick:number,age?:number):void {
  const meta=(data.animations as Record<string,{file:string;frames:number;directions:number;w:number;h:number;x:number;y:number;scale:number}>)[character+'-'+action];if(!meta)return;
  const im=image(meta.file);if(!ready(im))return;
  const direction=((Math.round(p.dir/(Math.PI*2)*meta.directions)%meta.directions)+meta.directions)%meta.directions;
  const frame=age===undefined?Math.floor(tick/(action.includes('walk')?3:2))%meta.frames:Math.min(meta.frames-1,Math.floor(age/3));
  c.drawImage(im,frame*meta.w,direction*meta.h,meta.w,meta.h,p.x+meta.x,p.y+meta.y,meta.w*meta.scale,meta.h*meta.scale);
}
function health(c:CanvasRenderingContext2D,p:any,seat:number|null):void {
  c.fillStyle='#171a17';c.fillRect(p.x-19,p.y-55,38,5);c.fillStyle=p.seat===seat?'#74dd71':'#53a94c';c.fillRect(p.x-18,p.y-54,36*Math.max(0,p.hp)/200,3);
}
export function render(canvas:HTMLCanvasElement,s:State|null,seat:number|null):void {
  if(canvas.width!==WIDTH)canvas.width=WIDTH;if(canvas.height!==HEIGHT)canvas.height=HEIGHT;
  const c=canvas.getContext('2d');if(!c)return;
  c.fillStyle='#2b302a';c.fillRect(0,0,WIDTH,HEIGHT);if(!s)return;
  const map=room(s), cam=camera(s);c.save();c.beginPath();c.rect(0,HUD,WIDTH,HEIGHT-HUD);c.clip();c.translate(cam.x,cam.y);c.scale(cam.scale,cam.scale);
  const floor=image(map.id+'-floor.svg'),cover=image(map.id+'-cover.svg');
  if(ready(floor))c.drawImage(floor,0,0,map.width,map.height);
  else{c.fillStyle='#c6c5bd';c.fillRect(0,0,map.width,map.height);}
  for(const e of s.effects)if(['Effect.BloodPool','Effect.ScorchMark'].includes(e.kind)){c.globalAlpha=Math.min(1,e.life/60);sprite(c,e.kind,e.x,e.y);c.globalAlpha=1;}
  for(const corpse of s.corpses){const age=s.tick-corpse.deadAt;person(c,corpse.character,age<15?'dying':'dead',corpse,s.tick,age);}
  for(const p of s.players.filter(p=>!p.alive))person(c,p.character,s.tick-p.deadAt<15?'dying':'dead',p,s.tick,s.tick-p.deadAt);
  for(const p of s.pickups)if(p.life>50||s.tick%6<3)sprite(c,'Object.Pickup',p.x,p.y,s.tick/3);
  const entities=[...s.barrels.map((b:any)=>({...b,entity:'object'})),...s.zombies.map((z:any)=>({...z,entity:'enemy'})),...s.players.filter(p=>p.alive).map(p=>({...p,entity:'human'}))].sort((a,b)=>a.y-b.y||a.x-b.x);
  for(const p of entities){
    if(p.entity==='object'){sprite(c,p.kind==='barrel'?'Object.Barrel':p.kind==='wall'?'Object.Wall':p.kind==='mine'?'Object.Mine':'Object.ChargePack',p.x,p.y,s.tick%20<10?0:1);continue;}
    if(p.entity==='human'){
      const gun=WEAPONS[p.weapon],action=s.tick-p.hitAt<5?'hitfront':(gun.pose?gun.pose+'-':'')+(p.moving?'walk':'stand');
      c.globalAlpha=p.invul>0&&s.tick%4<2?.55:1;person(c,p.character,action,p,s.tick);c.globalAlpha=1;
      if(s.tick-p.fireAt<2&&gun.pose){const muzzle=gun.id==='uzi'?'UZI.MuzzleFlash':gun.id==='shotgun'?'Shotgun.MuzzleFlash':gun.id==='railgun'?'Railgun.MuzzleFlash':'Pistol.MuzzleFlash';sprite(c,muzzle,p.x+Math.cos(p.dir)*24,p.y-24+Math.sin(p.dir)*18,0,1,p.dir);}
    }else{const action=s.tick-p.hitAt<5?'hitfront':s.tick-p.attackAt<12?'attack':'walk';person(c,p.devil?'devil':'zombie',action,p,s.tick);}
  }
  for(const b of s.bullets){
    if(b.tx!==undefined){c.strokeStyle=b.weapon===9?'#9f80ef':'#f3f0cf';c.lineWidth=b.weapon===9?2:1;c.beginPath();c.moveTo(b.x,b.y-23);c.lineTo(b.tx,b.ty-23);c.stroke();}
    else if(b.owner<0)sprite(c,'Effect.FireBall',b.x,b.y-18,0,1,Math.atan2(b.vy,b.vx));
    else sprite(c,b.weapon===4?'Shot.Grenade':'Shot.Rocket',b.x,b.y-(b.z||0),s.tick/2,1,b.weapon===7?Math.atan2(b.vy,b.vx):0);
  }
  for(const e of s.effects)if(!['Effect.BloodPool','Effect.ScorchMark'].includes(e.kind)){
    const meta=(data.objects as any)[e.kind];sprite(c,e.kind,e.x,e.y,(1-e.life/e.total)*(meta?.frames||1),e.scale||1);
  }
  if(ready(cover))c.drawImage(cover,0,0,map.width,map.height);
  for(const p of s.players.filter(p=>p.alive))health(c,p,seat);
  c.restore();
  c.fillStyle='#242823';c.fillRect(0,0,WIDTH,HUD);c.fillStyle='#ecebdf';c.font='bold 20px monospace';c.textAlign='left';
  c.fillText(`BOXHEAD 2PLAY  ·  第 ${s.wave||1} 波`,20,28);
  c.fillStyle='#dddac3';c.font='17px monospace';c.fillText(`SCORE ${s.score.toLocaleString()}   ×${s.combo}`,430,28);
  c.fillStyle='#b6baa9';c.font='14px sans-serif';c.textAlign='right';c.fillText(map.label+'  ·  共享视野',WIDTH-20,28);c.textAlign='left';
  for(const p of s.players){const x=20+(p.seat-1)*WIDTH/4, gun=WEAPONS[p.weapon];c.fillStyle=['#9ac8ff','#f1d585','#9edc9c','#e7a5ad'][p.seat-1];c.font='bold 15px sans-serif';
    c.fillText(`P${p.seat}  ${p.alive?Math.ceil(p.hp)+' HP':'倒地 · '+Math.ceil(p.respawn/25)+'s'}`,x,52);
    c.fillStyle='#ddd';c.font='14px sans-serif';c.fillText(`${gun.name}  ${p.ammo<0?'∞':p.ammo}  ·  ${p.kills} 击杀`,x,73);
  }
  if(s.messageUntil>s.tick&&s.phase==='playing'){c.font='bold 19px sans-serif';c.textAlign='center';const w=c.measureText(s.message).width+40;c.fillStyle='#20251fcc';c.fillRect((WIDTH-w)/2,HUD+18,w,36);c.fillStyle='#f3e5ac';c.fillText(s.message,WIDTH/2,HUD+43);c.textAlign='left';}
  if(s.phase!=='playing'){c.fillStyle='#101610bb';c.fillRect(0,HUD,WIDTH,HEIGHT-HUD);c.fillStyle='#fff';c.font='bold 32px sans-serif';c.textAlign='center';
    c.fillText(s.phase==='waiting'?'BOXHEAD · 2–4 人合作生存':'队伍全灭',WIDTH/2,365);
    c.font='18px sans-serif';c.fillStyle='#d9ddcf';c.fillText(s.phase==='waiting'?'选择原版地图，入座并准备':'坚持到第 '+s.wave+' 波 · 得分 '+s.score.toLocaleString(),WIDTH/2,405);
    c.fillText('WASD / 方向键移动与瞄准 · 空格 / J 射击 · K / X 换武器 · 1–0 选武器',WIDTH/2,444);c.textAlign='left';}
}

let enabled=true,volume=.24,heardRound=-1,heardId=0;
const playing=new Set<HTMLAudioElement>();
export function setSound(value:boolean):void{enabled=value;if(!value){for(const audio of playing)audio.pause();playing.clear();}}
export function setVolume(value:number):void{volume=Math.max(0,Math.min(1,value));for(const audio of playing)audio.volume=volume;}
export function confirm(s:State):void {
  if(s.round!==heardRound){heardRound=s.round;heardId=s.soundId;return;}
  for(const event of s.sounds){
    if(event.id<=heardId)continue;
    if(enabled&&volume>0&&s.tick-event.tick<=5&&playing.size<12){
      const file=(data.audio as Record<string,string>)[event.name];if(!file)continue;
      const audio=new Audio(base+file);audio.volume=volume;playing.add(audio);
      const done=()=>playing.delete(audio);audio.onended=done;audio.onerror=done;void audio.play().catch(done);
    }
  }
  heardId=s.soundId;
}
