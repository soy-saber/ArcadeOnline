import data from './boxhead-data.json';
import type { State } from './types';
import { WIDTH, HEIGHT, HUD, WEAPONS, camera, room } from './boxhead-world';
import { explosionFrame } from './boxhead-explosions';
import { drawBrightness } from './boxhead-feedback';
import { smokeFrame } from './boxhead-walls';
import { nativeDirection, rawPoseFrame, PROJECTION } from './boxhead-player-pose';
import { enemyRawFrame } from './boxhead-ai';

const base='/expanded/assets/boxhead/';
const images=new Map<string,HTMLImageElement>();
const combatFiles=Object.entries(data.objects).filter(([key])=>/^(Object|Effect|Shot|Pistol|Railgun|Shotgun|UZI)\./.test(key)).map(([,meta])=>meta.file);
const creatureCombatFiles=Object.entries(data.animations).filter(([key])=>/-(hitfront|hitrear|dying|dead)$/.test(key)).map(([,meta])=>meta.file);
let backdrop:{id:string;floor?:HTMLCanvasElement;cover?:HTMLCanvasElement}|null=null;
function image(file:string):HTMLImageElement {
  let im=images.get(file);if(!im){im=new Image();im.src=base+file;images.set(file,im);}return im;
}
function ready(im:HTMLImageElement):boolean{return im.complete&&im.naturalWidth>0;}
function mapBitmap(id:string,layer:'floor'|'cover',im:HTMLImageElement,w:number,h:number):HTMLCanvasElement|null {
  if(!backdrop||backdrop.id!==id)backdrop={id};
  if(!ready(im))return null;
  if(!backdrop[layer]){
    // Flash also draws static scenery once into bmFloor/bmCover. Rasterizing
    // SVG on every frame is expensive, especially with several game windows.
    const bitmap=document.createElement('canvas');bitmap.width=w;bitmap.height=h;bitmap.getContext('2d')!.drawImage(im,0,0,w,h);backdrop[layer]=bitmap;
  }
  return backdrop[layer]!;
}
function sprite(c:CanvasRenderingContext2D,key:string,x:number,y:number,frame=0,scale=1,rotation=0):void {
  const meta=(data.objects as Record<string,{file:string;frames:number;w:number;h:number;x:number;y:number}>)[key];if(!meta)return;
  const im=image(meta.file);if(!ready(im))return;
  c.save();c.translate(x,y);c.rotate(rotation);c.scale(scale,scale);
  c.drawImage(im,Math.min(meta.frames-1,Math.max(0,Math.floor(frame)))*meta.w,0,meta.w,meta.h,meta.x,meta.y,meta.w,meta.h);c.restore();
}
function person(c:CanvasRenderingContext2D,character:string,action:string,p:any,tick:number,age?:number,poseFrame?:number,enemyFrame?:number):void {
  const meta=(data.animations as Record<string,{file:string;frames:number;directions:number;w:number;h:number;x:number;y:number;scale:number}>)[character+'-'+action];if(!meta)return;
  const im=image(meta.file);if(!ready(im))return;
  const direction=nativeDirection(p.dir,meta.directions);
  const frame=enemyFrame!==undefined?enemyFrame:poseFrame!==undefined?rawPoseFrame(action,poseFrame):age===undefined?Math.floor(tick/(action.includes('walk')?3:2))%meta.frames:Math.min(meta.frames-1,Math.floor(age/3));
  const scale=character==='devil'?.42/.44:1;
  c.drawImage(im,frame*meta.w,direction*meta.h,meta.w,meta.h,p.x+meta.x*scale,p.y+meta.y*scale,meta.w*meta.scale*scale,meta.h*meta.scale*scale);
}
function health(c:CanvasRenderingContext2D,p:any,seat:number|null):void {
  c.fillStyle='#171a17';c.fillRect(p.x-19,p.y-55,38,5);c.fillStyle=p.seat===seat?'#74dd71':'#53a94c';c.fillRect(p.x-18,p.y-54,36*Math.max(0,p.hp)/200,3);
  const text=WEAPONS[p.weapon].name+(p.ammo>=0?`:${p.ammo}`:'');
  c.save();c.font='bold 10px sans-serif';c.textAlign='center';c.lineWidth=2;c.strokeStyle='#18211b';c.strokeText(text,p.x,p.y-63);c.fillStyle='#ffefb8';c.fillText(text,p.x,p.y-63);c.restore();
}
export function render(canvas:HTMLCanvasElement,s:State|null,seat:number|null):void {
  if(canvas.width!==WIDTH)canvas.width=WIDTH;if(canvas.height!==HEIGHT)canvas.height=HEIGHT;
  const c=canvas.getContext('2d');if(!c)return;
  c.fillStyle='#2b302a';c.fillRect(0,0,WIDTH,HEIGHT);if(!s)return;
  for(const file of combatFiles)image(file);
  // These states can begin between two snapshots. Load original sheets during
  // the waiting/protection period so their first native frame is drawable.
  for(const file of creatureCombatFiles)image(file);
  const map=room(s), cam=camera(s);c.save();c.beginPath();c.rect(0,HUD,WIDTH,HEIGHT-HUD);c.clip();c.translate(cam.x,cam.y);c.scale(cam.scale,cam.scale);
  const floor=image(map.id+'-floor.svg'),cover=image(map.id+'-cover.svg');
  const floorBitmap=mapBitmap(map.id,'floor',floor,map.width,map.height),coverBitmap=mapBitmap(map.id,'cover',cover,map.width,map.height);
  if(floorBitmap)c.drawImage(floorBitmap,0,0,map.width,map.height);
  else{c.fillStyle='#c6c5bd';c.fillRect(0,0,map.width,map.height);}
  for(const e of s.effects)if(e.floor||['Effect.BloodPool','Effect.ScorchMark'].includes(e.kind)){c.globalAlpha=Math.min(1,e.life/60);if(e.floor){c.save();c.translate(e.x,e.y);c.scale(1,.6);sprite(c,e.kind,0,0);c.restore();}else sprite(c,e.kind,e.x,e.y);c.globalAlpha=1;}
  for(const b of s.barrels)if(b.kind==='mine'||b.kind==='chargepack')sprite(c,b.kind==='mine'?'Object.Mine':'Object.ChargePack',b.x,b.y+b.z*PROJECTION,b.animation);
  for(const corpse of s.corpses){const age=s.tick-corpse.deadAt;person(c,corpse.character,age<15?'dying':'dead',corpse,s.tick,age);}
  for(const p of [...s.players,...s.zombies].filter(p=>p.body.floor&&p.body.phase!=='respawn')){c.globalAlpha=p.body.alpha;person(c,p.seat?p.character:p.devil?'devil':'zombie',p.body.action,p,s.tick,undefined,undefined,Math.floor(p.body.frame));c.globalAlpha=1;}
  for(const p of s.pickups)if(p.life>50||s.tick%6<3)sprite(c,'Object.Pickup',p.x,p.y,s.tick/3);
  const entities=[...s.barrels.filter((b:any)=>b.kind!=='mine'&&b.kind!=='chargepack').map((b:any)=>({...b,entity:'object'})),...s.zombies.filter((z:any)=>z.ai.registered&&!z.body.floor).map((z:any)=>({...z,entity:'enemy'})),...s.players.filter(p=>!p.body.floor&&p.body.phase!=='respawn').map(p=>({...p,entity:'human'}))].sort((a,b)=>a.y-b.y||a.x-b.x);
  for(const p of entities){
    if(p.entity==='object'){c.globalAlpha=p.kind==='wall'?p.wallAlpha/100:1;sprite(c,p.kind==='barrel'?'Object.Barrel':'Object.Wall',p.x,p.y+p.z*PROJECTION,p.kind==='wall'?p.wallFrame:0);c.globalAlpha=1;continue;}
    if(p.entity==='human'){
      if(p.invul>0&&p.invul%2)continue;
      const normal=p.body.phase==='control',action=normal?p.drawAction:p.body.action;
      c.globalAlpha=p.body.alpha;person(c,p.character,action,p,s.tick,undefined,normal?p.drawFrame:undefined,normal?undefined:Math.floor(p.body.frame));c.globalAlpha=1;
    }else{const normal=p.body.phase==='normal',action=normal?p.ai.action:p.body.action;c.globalAlpha=p.body.alpha;person(c,p.devil?'devil':'zombie',action,p,s.tick,undefined,undefined,normal?enemyRawFrame(p):Math.floor(p.body.frame));c.globalAlpha=1;}
  }
  for(const b of s.bullets){
    if(b.tx!==undefined){c.strokeStyle=b.weapon===9?'#9f80ef':'#f3f0cf';c.lineWidth=b.weapon===9?2:1;c.beginPath();c.moveTo(b.x,b.y+b.z*PROJECTION);c.lineTo(b.tx,b.ty+b.z*PROJECTION);c.stroke();}
    else if(b.fireball)sprite(c,'Effect.FireBall',b.x,b.y+b.z*PROJECTION,b.animation);
    else sprite(c,b.clusterShell?'Shot.ClusterShell':b.weapon===4?'Shot.Grenade':'Shot.Rocket',b.x,b.y+(b.z||0)*PROJECTION,s.tick/2,1,b.weapon===7?Math.atan2(b.vy,b.vx):0);
  }
  for(const e of s.effects)if(!e.floor&&!['Effect.BloodPool','Effect.ScorchMark'].includes(e.kind)){
    if(e.kind==='Effect.MuzzleFlash'){sprite(c,e.spriteKey,e.x,e.y+e.z*PROJECTION,0,1,e.angle);continue;}
    if(e.kind==='Effect.SmokeCloud'&&s.tick<e.born)continue;
    const meta=(data.objects as any)[e.kind],frame=e.kind==='Effect.Explosion'?explosionFrame(s.tick,e.born):e.kind==='Effect.SmokeCloud'?smokeFrame(s.tick,e.born,meta.frames):(1-e.life/e.total)*(meta?.frames||1);
    sprite(c,e.kind,e.x,e.y+(e.z||0)*PROJECTION,frame,e.scale||1);
  }
  if(coverBitmap)c.drawImage(coverBitmap,0,0,map.width,map.height);
  for(const p of s.players.filter(p=>p.alive))health(c,p,seat);
  c.restore();
  drawBrightness(c,s.brightness,WIDTH,HEIGHT,HUD);
  c.fillStyle='#242823';c.fillRect(0,0,WIDTH,HUD);c.fillStyle='#ecebdf';c.font='bold 20px monospace';c.textAlign='left';
  c.fillText(`BOXHEAD 2PLAY  ·  第 ${s.wave||1} 波`,20,28);
  c.fillStyle='#dddac3';c.font='17px monospace';c.fillText(`SCORE ${s.score.toLocaleString()}   ×${s.combo}`,430,28);
  c.fillStyle='#b6baa9';c.font='14px sans-serif';c.textAlign='right';c.fillText(map.label+'  ·  共享视野',WIDTH-20,28);c.textAlign='left';
  for(const p of s.players){const x=20+(p.seat-1)*WIDTH/4, gun=WEAPONS[p.weapon];c.fillStyle=['#9ac8ff','#f1d585','#9edc9c','#e7a5ad'][p.seat-1];c.font='bold 15px sans-serif';
    c.fillText(`P${p.seat}  ${p.alive?Math.max(0,Math.ceil(p.hp))+' HP':'倒地 · '+Math.ceil(p.respawn/25)+'s'}`,x,52);
    c.fillStyle='#ddd';c.font='14px sans-serif';c.fillText(`${gun.name}  ${p.ammo<0?'∞':p.ammo}  ·  ${p.kills} 击杀`,x,73);
  }
  if(s.messageUntil>s.tick&&s.phase==='playing'){c.font='bold 19px sans-serif';c.textAlign='center';const w=c.measureText(s.message).width+40;c.fillStyle='#20251fcc';c.fillRect((WIDTH-w)/2,HUD+18,w,36);c.fillStyle='#f3e5ac';c.fillText(s.message,WIDTH/2,HUD+43);c.textAlign='left';}
  if(s.phase!=='playing'){c.fillStyle='#101610bb';c.fillRect(0,HUD,WIDTH,HEIGHT-HUD);c.fillStyle='#fff';c.font='bold 32px sans-serif';c.textAlign='center';
    c.fillText(s.phase==='waiting'?'BOXHEAD · 2–4 人合作生存':'队伍全灭',WIDTH/2,365);
    c.font='18px sans-serif';c.fillStyle='#d9ddcf';c.fillText(s.phase==='waiting'?'选择原版地图，入座并准备':'坚持到第 '+s.wave+' 波 · 得分 '+s.score.toLocaleString(),WIDTH/2,405);
    c.fillText('WASD / 方向键移动与瞄准 · 空格 / J 射击 · Q / E 换武器 · 1–0 选武器',WIDTH/2,444);c.textAlign='left';}
}

let enabled=true,volume=.24,heardRound=-1,heardId=0,ambientTick=-1,ambientIndex=0;
const playing=new Set<HTMLAudioElement>();
const ambient=new Set<HTMLAudioElement>();
const gain=new WeakMap<HTMLAudioElement,number>();
function stopAmbience():void{for(const audio of ambient){audio.pause();playing.delete(audio);}ambient.clear();}
export function setSound(value:boolean):void{enabled=value;if(!value){for(const audio of playing)audio.pause();playing.clear();ambient.clear();}}
export function setVolume(value:number):void{volume=Math.max(0,Math.min(1,value));for(const audio of playing)audio.volume=volume*(gain.get(audio)??1);}
export function confirm(s:State):void {
  if(s.round!==heardRound){stopAmbience();heardRound=s.round;heardId=s.soundId;ambientTick=s.tick;return;}
  for(const event of s.sounds){
    if(event.id<=heardId)continue;
    if(event.name==='World.End.wav'&&playing.size>=12){const oldest=[...playing].find(audio=>!ambient.has(audio));if(oldest){oldest.pause();playing.delete(oldest);}}
    if(enabled&&volume>0&&s.tick-event.tick<=5&&playing.size<12){
      const file=(data.audio as Record<string,string>)[event.name];if(!file)continue;
      const nativeGain=/^Creature\.Zombie\.Ambience\./.test(event.name)?.4:/^Creature\.Player\.Scream\./.test(event.name)?.7:event.name==='Creature.Zombie.Hit.wav'?.3:1;
      const audio=new Audio(base+file);gain.set(audio,nativeGain);audio.volume=volume*nativeGain;playing.add(audio);
      const done=()=>playing.delete(audio);audio.onended=done;audio.onerror=done;void audio.play().catch(done);
    }
  }
  heardId=s.soundId;
  const count=s.phase==='playing'?s.zombies.length:0;
  if(!count){stopAmbience();ambientTick=s.tick;return;}
  const frequency=count<=4?150:count<=8?60:1,channels=count<=2?1:count<=4?2:3;
  if(enabled&&volume>0&&s.tick-ambientTick>=frequency&&ambient.size<channels){
    ambientTick=s.tick;const name=`Creature.Zombie.Ambience.${ambientIndex%4+1}.wav`;ambientIndex++;
    const audio=new Audio(base+(data.audio as Record<string,string>)[name]);
    const mix=.4*(count===1?.3:count===2?.4:count<=4?.6:count<=8?.8:1);gain.set(audio,mix);audio.volume=volume*mix;playing.add(audio);ambient.add(audio);
    const done=()=>{playing.delete(audio);ambient.delete(audio);};audio.onended=done;audio.onerror=done;void audio.play().catch(done);
  }
}
