import source from './forest-data.json';

type Atlas=(ctx:CanvasRenderingContext2D,key:string,name:string,x:number,y:number,w?:number,h?:number)=>boolean;
type Device={type:string;x:number;y:number;w:number;h:number;rotation:number;active:boolean;props:Record<string,any>};
type Original={rotation?:number;polygon?:{x:number;y:number}[]};
const frames=source.atlases.MechAssets as Record<string,{frame:{w:number;h:number}}>;
function sprite(ctx:CanvasRenderingContext2D,atlas:Atlas,name:string,x=0,y=0,ax=.5,ay=.5,w?:number,h?:number):void {
  const frame=frames[name].frame,width=w??frame.w,height=h??frame.h;
  atlas(ctx,'MechAssets',name,x-ax*width,y-ay*height,width,height);
}

/** Original Wind/Roman component names and layering from js/init.js.
 * Device poses remain supplied by the authority's current physics model. */
export function drawDeviceArt(ctx:CanvasRenderingContext2D,atlas:Atlas,d:Device,tick:number,original?:Original):boolean {
  if(d.type==='wind'){
    ctx.save();ctx.translate(d.x,d.y-d.h/2);ctx.rotate(d.rotation);
    sprite(ctx,atlas,'wind_base'+String(d.active?Math.floor(tick/2)%4:0).padStart(4,'0'));
    sprite(ctx,atlas,'wind_base_light_'+(d.active?'on':'off')+'0000');ctx.restore();return true;
  }
  if(d.type!=='roman')return false;
  const polygon=original?.polygon??[],height=polygon.length>1?Math.abs(polygon[1].y-polygon[0].y):64;
  ctx.save();ctx.translate(d.x,d.y-d.h/2);ctx.rotate((original?.rotation??0)*Math.PI/180);
  sprite(ctx,atlas,'roman_base0000',0,height,.5,.5,undefined,2*height);ctx.restore();
  ctx.save();ctx.translate(d.x,d.y-d.h/2);ctx.rotate(d.rotation);
  ctx.save();ctx.beginPath();ctx.rect(-d.w/2,-15,d.w,30);ctx.clip();
  for(let x=-d.w/2;x<d.w/2;x+=frames.roman_bar0000.frame.w)sprite(ctx,atlas,'roman_bar0000',x,0,0,.5);
  ctx.restore();sprite(ctx,atlas,'roman_end0000',d.w/2,0,.05,.5);
  ctx.scale(-1,1);sprite(ctx,atlas,'roman_end0000',d.w/2,0,.05,.5);ctx.restore();return true;
}

export function drawForegroundDeviceArt(ctx:CanvasRenderingContext2D,atlas:Atlas,d:Device,tick:number):void {
  if(d.type!=='wind'&&d.type!=='roman')return;
  ctx.save();ctx.translate(d.x,d.y-d.h/2);ctx.rotate(d.rotation);
  if(d.type==='roman')sprite(ctx,atlas,'roman_center0000');
  else if(d.active)sprite(ctx,atlas,'wind_effect'+String(Math.floor(tick/2)%30).padStart(4,'0'),0,0,.5,1,undefined,Number(d.props.length??10)*32);
  ctx.restore();
}
