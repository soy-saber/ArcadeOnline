// CPU rendering of the source INNER GradientGlowFilter. Only the robot movie
// clip is filtered; shield, intro, weapon and player labels are sibling clips.
import ART from './bomb2-protection-art.json';
import type {Glow} from './bomb2-protection';
const {filter,colors,ratios,filterAlpha}=ART.rules;
export function blurAxis(input:Float32Array,w:number,h:number,horizontal:boolean,width:number):Float32Array<ArrayBuffer> {
  const radius=(width-1)/2,whole=Math.floor(radius),edge=radius-whole,out=new Float32Array(input.length);
  const lines=horizontal?h:w,length=horizontal?w:h,step=horizontal?1:w;
  for(let line=0;line<lines;line++){
    const start=horizontal?line*w:line;
    const get=(at:number)=>at<0||at>=length?0:input[start+at*step];
    let sum=0;for(let k=-whole;k<=whole;k++)sum+=get(k);
    for(let x=0;x<length;x++){
      out[start+x*step]=Math.max(0,Math.min(255,Math.floor((sum+edge*(get(x-whole-1)+get(x+whole+1)))/width+1e-7)));
      sum+=get(x+whole+1)-get(x-whole);
    }
  }
  return out;
}
// A transparent margin retains the shifted blur beyond the native clip bounds.
// The final INNER composition keeps the original alpha, including soft edges.
export function glowMask(rgba:Uint8ClampedArray,w:number,h:number):Uint8Array {
  const pad=Math.ceil(Math.abs(filter.distance)+3*Math.max(filter.blurX,filter.blurY)),pw=w+2*pad,ph=h+2*pad;
  let pixels=new Float32Array(pw*ph);
  const dx=filter.distance*Math.cos(filter.angle*Math.PI/180),dy=filter.distance*Math.sin(filter.angle*Math.PI/180);
  const alpha=(x:number,y:number)=>x<0||x>=w||y<0||y>=h?0:rgba[(y*w+x)*4+3];
  for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){
    const sx=x-pad-dx,sy=y-pad-dy,ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
    pixels[y*pw+x]=Math.floor((alpha(ix,iy)*(1-fx)+alpha(ix+1,iy)*fx)*(1-fy)+(alpha(ix,iy+1)*(1-fx)+alpha(ix+1,iy+1)*fx)*fy);
  }
  for(let pass=0;pass<3;pass++){pixels=blurAxis(pixels,pw,ph,true,filter.blurX);pixels=blurAxis(pixels,pw,ph,false,filter.blurY);}
  const mask=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)mask[y*w+x]=pixels[(y+pad)*pw+x+pad];
  return mask;
}
export function gradient(glow:Glow):Uint8ClampedArray {
  // Flash ratios are unsigned bytes: the negative first stop clamps to zero.
  // A duplicate zero stop is replaced by the later color at that position.
  const stops:{at:number;color:number}[]=[];
  for(let i=0;i<ratios.length;i++){
    const stop={at:Math.max(0,Math.min(255,ratios[i]+glow.offset)),color:colors[(i+glow.color)%colors.length]};
    if(stops[stops.length-1]?.at===stop.at)stops[stops.length-1]=stop;else stops.push(stop);
  }
  const out=new Uint8ClampedArray(256*3);let cursor=0;
  for(let x=0;x<256;x++){
    while(cursor+1<stops.length&&stops[cursor+1].at<=x)cursor++;
    const a=stops[cursor],b=stops[Math.min(cursor+1,stops.length-1)],t=a===b?0:Math.max(0,(x-a.at)/(b.at-a.at));
    for(let c=0;c<3;c++){const shift=(2-c)*8;out[x*3+c]=((a.color>>shift)&255)*(1-t)+((b.color>>shift)&255)*t;}
  }
  return out;
}
export function tint(rgba:Uint8ClampedArray,mask:Uint8Array,glow:Glow):Uint8ClampedArray<ArrayBuffer> {
  const out=new Uint8ClampedArray(rgba),lookup=gradient(glow);
  for(let i=0;i<mask.length;i++)if(rgba[i*4+3])for(let c=0;c<3;c++)out[i*4+c]=rgba[i*4+c]*(1-filterAlpha)+lookup[Math.min(255,Math.floor(mask[i]*filter.strength))*3+c]*filterAlpha;
  return out;
}

const sources=new Map<string,{data:ImageData;mask:Uint8Array}>(),frames=new Map<string,HTMLCanvasElement>();
function remember<T>(cache:Map<string,T>,key:string,value:T,limit:number):T {cache.set(key,value);if(cache.size>limit)cache.delete(cache.keys().next().value!);return value;}
export function filteredFrame(image:HTMLImageElement,name:string,frame:number,w:number,h:number,glow:Glow):HTMLCanvasElement {
  const key=`${name}:${frame}`,colored=`${key}:${glow.color}:${glow.offset}`;
  const cached=frames.get(colored);if(cached)return cached;
  let source=sources.get(key);
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const context=canvas.getContext('2d',{willReadFrequently:true})!;
  if(!source){context.drawImage(image,frame*w,0,w,h,0,0,w,h);const data=context.getImageData(0,0,w,h);source=remember(sources,key,{data,mask:glowMask(data.data,w,h)},192);}
  context.putImageData(new ImageData(tint(source.data.data,source.mask,glow),w,h),0,0);
  return remember(frames,colored,canvas,128);
}
