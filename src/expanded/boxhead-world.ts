import data from './boxhead-data.json';
import type { State } from './types';
import { wallBlocks } from './boxhead-walls';
import { objectBlocks } from './boxhead-registration';

export const WIDTH = 1280, HEIGHT = 800, HUD = 84, CELL = 32;
export const MAPS = data.maps;
export const CHARACTERS = ['swat', 'bond', 'gijoe', 'bambo'];
export const WEAPONS = [
  {id:'pistol', name:'手枪', classId:'Pistol', rate:8, damage:26, ammo:-1, range:8, pose:'handgun', sound:'Pistol'},
  {id:'uzi', name:'UZI', classId:'UZI', rate:4, damage:35, ammo:100, range:8, pose:'uzi', sound:'UZI'},
  {id:'shotgun', name:'霰弹枪', classId:'Shotgun', rate:12, damage:51, ammo:20, range:7, pose:'shotgun', sound:'ShotGun'},
  {id:'barrel', name:'油桶', classId:'Barrel', rate:1, damage:150, ammo:10, range:1, pose:'', sound:''},
  {id:'grenade', name:'手雷', classId:'Grenade', rate:12, damage:150, ammo:20, range:6, pose:'', sound:''},
  {id:'fakewall', name:'假墙', classId:'FakeWall', rate:1, damage:100, ammo:5, range:1, pose:'', sound:''},
  {id:'mine', name:'地雷', classId:'Mine', rate:1, damage:100, ammo:10, range:1, pose:'', sound:''},
  {id:'rocket', name:'火箭炮', classId:'Rocket', rate:12, damage:250, ammo:20, range:100, pose:'rocketlauncher', sound:'Rocket'},
  {id:'chargepack', name:'遥控炸药', classId:'ChargePack', rate:1, damage:150, ammo:10, range:1, pose:'', sound:''},
  {id:'railgun', name:'轨道炮', classId:'Railgun', rate:5, damage:100, ammo:15, range:10, pose:'railgun', sound:'Railgun'},
];
export function room(s: State) { return MAPS.find(m => m.id === s.mapId) || MAPS[0]; }
export function solid(map: typeof MAPS[number], x: number, y: number): boolean {
  return map.collision[Math.floor(y / CELL)]?.[Math.floor(x / CELL)] !== '0';
}
function mapBlocked(s:State,x:number,y:number,radius:number):boolean {
  const map=room(s);
  for(const dx of [-radius,radius])for(const dy of [-radius,radius])if(solid(map,x+dx,y+dy))return true;
  return false;
}
function blockingObjects(s:State,ignore?:any):any[] {
  return s.barrels.filter((b:any)=>b!==ignore&&objectBlocks(b)&&(b.kind==='barrel'&&b.hp>0||wallBlocks(b,s.tick)));
}
export function blocked(s: State, x: number, y: number, radius = 11, ignore?: any): boolean {
  return mapBlocked(s,x,y,radius)||blockingObjects(s,ignore).some(b=>Math.hypot(b.x-x,b.y-y)<radius+b.radius);
}
function physicalRadius(p:any):number { return p.body ? p.body.radius : p.radius; }
function resolveCircles(s:State,p:any,x:number,y:number,r:number,dx:number,dy:number) {
  const map=room(s),left=Math.max(0,Math.round((x-r)/CELL)-1),right=Math.min(map.columns-1,Math.round((x+r)/CELL));
  const top=Math.max(0,Math.round((y-r)/CELL)-1),bottom=Math.min(map.rows-1,Math.round((y+r)/CELL));
  const index=(v:any)=>Math.floor(v.y/CELL)*map.columns+Math.floor(v.x/CELL);
  const things=[...blockingObjects(s,p),...s.players,...s.zombies.filter((z:any)=>z.ai.registered)]
    .filter((v:any)=>v!==p&&(v.body?v.body.collidable:true)&&Math.floor(v.x/CELL)>=left&&Math.floor(v.x/CELL)<=right&&Math.floor(v.y/CELL)>=top&&Math.floor(v.y/CELL)<=bottom)
    .sort((a,b)=>index(b)-index(a)||(b.id??0)-(a.id??0));
  let collided=false;
  for(const b of things){const distance=Math.hypot(x-b.x,y-b.y),limit=r+physicalRadius(b);
    if(distance<limit){
      // A coincident pair produces NaN in the SWF. Preserve finite authority
      // using the existing deterministic opposite-motion fallback online.
      const length=Math.hypot(dx,dy),ux=distance?(x-b.x)/distance:length?-dx/length:1,uy=distance?(y-b.y)/distance:length?-dy/length:0;
      x=b.x+ux*limit;y=b.y+uy*limit;collided=true;
    }
  }
  return {x,y,collided};
}
function resolveMap(s:State,p:any,dx:number,dy:number,r:number) {
  if(!mapBlocked(s,p.x+dx,p.y+dy,r))return {x:p.x+dx,y:p.y+dy,collided:false};
  if(!mapBlocked(s,p.x+dx,p.y,r))return {x:p.x+dx,y:p.y,collided:true};
  if(!mapBlocked(s,p.x,p.y+dy,r))return {x:p.x,y:p.y+dy,collided:true};
  return {x:p.x,y:p.y,collided:true};
}
export function move(s:State,p:any,dx:number,dy:number,radius=.45*CELL):void {
  if(solid(room(s),p.x,p.y))return;
  for(let pass=0;pass<3;pass++){
    const circles=s.options?.collisions===false?{x:p.x+dx,y:p.y+dy,collided:false}:resolveCircles(s,p,p.x+dx,p.y+dy,radius,dx,dy);dx=circles.x-p.x;dy=circles.y-p.y;
    const map=resolveMap(s,p,dx,dy,radius*.85);
    if(!circles.collided&&!map.collided||pass===2){p.x=map.x;p.y=map.y;return;}
  }
}
/** CreatureCollide feeds its resolved displacement back into the hit delta. */
export function knockback(s:State,p:any):void {
  const map=room(s),cx=Math.floor(p.x/CELL),cy=Math.floor(p.y/CELL),b=p.body;
  if(cx<=0||cy<=0||cx>=map.columns-1||cy>=map.rows-1){b.vx=0;b.vy=0;return;}
  const circles=resolveCircles(s,p,p.x+b.vx,p.y+b.vy,b.radius,b.vx,b.vy);
  const next=resolveMap(s,p,circles.x-p.x,circles.y-p.y,b.radius);
  b.vx=next.x-p.x;b.vy=next.y-p.y;p.x=next.x;p.y=next.y;
}
export function openPosition(s: State, x: number, y: number, used: {x:number;y:number}[] = []) {
  const map = room(s), candidates = [];
  for (let row = 1; row < map.rows - 1; row++) for (let col = 1; col < map.columns - 1; col++) {
    const px = col * CELL + 16, py = row * CELL + 16;
    if (!blocked(s, px, py) && !used.some(p => Math.hypot(p.x-px,p.y-py)<30)) candidates.push({x:px,y:py,d:Math.hypot(px-x,py-y)});
  }
  candidates.sort((a,b) => a.d-b.d);
  return candidates[0] || {x:48,y:48};
}
export function lineClear(s: State, x: number, y: number, tx: number, ty: number): boolean {
  const length = Math.hypot(tx-x,ty-y), steps = Math.ceil(length/8), map = room(s);
  for (let n=1;n<=steps;n++) if (solid(map, x+(tx-x)*n/steps, y+(ty-y)*n/steps)) return false;
  return true;
}

/** One shared camera, independent of seat. It always contains every living human. */
export function camera(s: State, width = WIDTH, height = HEIGHT) {
  const map = room(s), alive = s.players.filter(p => !p.body.deadFlag), areaH = height-HUD;
  const xs = alive.map(p => p.x), ys = alive.map(p => p.y);
  const minX = xs.length ? Math.min(...xs) : map.width/2, maxX = xs.length ? Math.max(...xs) : minX;
  const minY = ys.length ? Math.min(...ys) : map.height/2, maxY = ys.length ? Math.max(...ys) : minY;
  // Original viewport was 640 x 480. The normal shared view spans at least 1152 world pixels.
  const scale = Math.min(width/Math.min(map.width,1152), areaH/Math.min(map.height,720), width/(maxX-minX+240), areaH/(maxY-minY+240));
  const viewW=width/scale, viewH=areaH/scale;
  const cx=viewW>=map.width ? map.width/2 : Math.max(viewW/2,Math.min(map.width-viewW/2,(minX+maxX)/2));
  const cy=viewH>=map.height ? map.height/2 : Math.max(viewH/2,Math.min(map.height-viewH/2,(minY+maxY)/2));
  return {scale,x:width/2-cx*scale,y:HUD+areaH/2-(cy+(s.shakeY??0))*scale,visibleWidth:viewW,visibleHeight:viewH};
}

export function weaponStats(s: State, index: number) {
  const base = WEAPONS[index], props: Record<string,boolean> = {};
  for (const u of data.upgrades) if (u.threshold <= s.peakCombo && (u.mClassID === 'CThing_Weapon_'+base.classId || u.mClassID === 'CThing_Object_'+base.classId)) props[u.mProp] = true;
  return {...base, damage:base.damage*(props.FatalDamage?10:props.QuadDamage?4:props.DoubleDamage?2:1),
    auto:base.id==='uzi'||!!props.FastFire||!!props.RapidFire,
    onRelease:base.id==='grenade',
    rate:props.RapidFire?Math.max(2,Math.round(base.rate/4)):base.rate,
    ammo:props.InfinateAmmo?-1:base.ammo*(props.QuadAmmo?4:props.DoubleAmmo?2:1),
    range:props.InfinateRange?100:base.range*(props.LongShot?1.5:1),
    spread:props.WiderShot?2:props.WideShot?1:0, bang:props.BiggerBang?2:props.BigBang?1:0, cluster:!!props.ClusterExplode};
}
