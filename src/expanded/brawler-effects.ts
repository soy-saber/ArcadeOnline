import source from './brawler-native-objects.json';
interface Frame {art:number[];native:{alive:boolean;bounds:number[];frame:number;position:number[];rotation:number;scale:number[];alpha:number;visible:boolean}}
interface ObjectArt {sheet:string;frames:number;labels:Record<string,number>;variants:Record<string,Frame[]>}
const objects=source.objects as unknown as Record<string,ObjectArt>;
export interface Sprite {name:string;x:number;y:number;age:number;variant:number;sx:number;sy:number;rotation:number}
export function valid(value:unknown):value is Sprite {
 if(!value||typeof value!=='object')return false;const p=value as Sprite;
 return typeof p.name==='string'&&Object.prototype.hasOwnProperty.call(objects,p.name)&&[p.x,p.y,p.age,p.sx,p.sy,p.rotation].every(Number.isFinite)&&p.age>=0&&Number.isInteger(p.variant)&&p.variant>=1&&p.variant<=objects[p.name].frames;
}
export function frame(p:Sprite):Frame {const d=objects[p.name],list=d.variants[String(p.variant)]||d.variants['1'];return list[Math.max(0,Math.min(list.length-1,Math.floor(p.age*30/1000)))];}
export function frames(name:string):number {return objects[name].frames;}
export function initialSize(name:string):number[]{const b=objects[name].variants['1'][0].native.bounds;return [b[2]-b[0],b[3]-b[1]];}
export function bounds(p:Sprite):number[]|null {
 const f=frame(p);if(!f.native.alive)return null;const b=f.native.bounds,r=p.rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
 const points=[[b[0],b[1]],[b[0],b[3]],[b[2],b[1]],[b[2],b[3]]].map(([x,y])=>[p.x+x*p.sx*c-y*p.sy*s,p.y+x*p.sx*s+y*p.sy*c]);
 return [Math.min(...points.map(v=>v[0])),Math.min(...points.map(v=>v[1])),Math.max(...points.map(v=>v[0])),Math.max(...points.map(v=>v[1]))];
}
const images:Record<string,HTMLImageElement>={};
export function preload():void {for(const d of Object.values(objects)){const path='/expanded/assets/brawler/native/'+d.sheet;if(!images[path]){images[path]=new Image();images[path].src=path;}}}
export function draw(ctx:CanvasRenderingContext2D,p:Sprite):void {
 const f=frame(p),a=f.art;if(!f.native.alive||!a[2]||!a[3])return;const path='/expanded/assets/brawler/native/'+objects[p.name].sheet;
 if(!images[path]){images[path]=new Image();images[path].src=path;}const image=images[path];if(!image.complete||!image.naturalWidth)return;
 ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rotation*Math.PI/180);ctx.scale(p.sx,p.sy);ctx.drawImage(image,a[0],a[1],a[2],a[3],a[4],a[5],a[2],a[3]);ctx.restore();
}
