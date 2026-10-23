/** Canvas HUD units scale with the game, including when entering fullscreen. */
export interface StatusIcon { src: string; label: string; value: string; active?: boolean }
export interface PlayerStatus { seat:number; alive:boolean; portrait:string; portraitFrames?:number; color?:string; title:string; note:string; icons:StatusIcon[]; weapon:StatusIcon|null }
const cache=new Map<string,HTMLImageElement>();
function icon(c:CanvasRenderingContext2D,src:string,x:number,y:number,size:number,frames=1):void {
  let image=cache.get(src);if(!image){image=new Image();image.src=src;cache.set(src,image);}
  if(!image.complete||!image.naturalWidth)return;
  const w=image.naturalWidth/frames,h=image.naturalHeight,scale=Math.min(size/w,size/h);c.drawImage(image,0,0,w,h,x+(size-w*scale)/2,y+(size-h*scale)/2,w*scale,h*scale);
}
export function weaponBadge(c:CanvasRenderingContext2D,weapon:StatusIcon,x:number,feet:number,size=16):void {
  c.save();c.font=`bold ${size*.8}px system-ui`;c.textAlign='left';
  const count=weapon.value,width=size+7+c.measureText(count).width,left=x-width/2,top=feet-size-3;
  c.fillStyle='#10201ab8';c.fillRect(left-3,top-1,width+6,size+2);icon(c,weapon.src,left,top,size);
  c.fillStyle='#fff5d7';c.strokeStyle='#172b24';c.lineWidth=2;c.strokeText(count,left+size+4,top+size*.8);c.fillText(count,left+size+4,top+size*.8);c.restore();
}
export function drawPlayerStatus(c:CanvasRenderingContext2D,players:PlayerStatus[],x:number,y:number,width:number,height:number,ownSeat:number|null):void {
  c.save();c.fillStyle='#182d29';c.fillRect(x,y,width,height);c.textAlign='left';
  const cardH=Math.min(132,(height-16)/4),pad=10,colors=['#8aceff','#ffb2d2','#ffe27e','#b2e78f'];
  for(let seat=1;seat<=4;seat++){
    const p=players.find(p=>p.seat===seat),top=y+8+(seat-1)*cardH,left=x+pad;
    c.fillStyle=seat===ownSeat?'#34534a':'#243d36';c.fillRect(left,top,width-pad*2,cardH-6);
    c.fillStyle=p?.color??colors[seat-1];c.fillRect(left,top,3,cardH-6);c.font='bold 12px system-ui';c.fillText(`P${seat}${seat===ownSeat?' · 你':''}`,left+9,top+17);
    if(!p){c.fillStyle='#8ca39a';c.font='11px system-ui';c.fillText('空位',left+9,top+40);continue;}
    const compact=cardH<120,iconSize=compact?14:17;
    c.globalAlpha=p.alive?1:.5;icon(c,p.portrait,left+7,top+(compact?20:24),compact?23:30,p.portraitFrames);c.globalAlpha=1;
    c.fillStyle=p.alive?'#e4f0df':'#bbbbb4';c.font='11px system-ui';c.fillText(p.title,left+43,top+(compact?30:36),width-pad*2-48);
    c.fillStyle='#bfcdc2';c.font='10px system-ui';c.fillText(p.note,left+43,top+(compact?42:51),width-pad*2-48);
    const colW=(width-pad*2-14)/3;
    for(const [i,s]of p.icons.entries()){
      const px=left+7+(i%3)*colW,py=top+(compact?47:59)+Math.floor(i/3)*(compact?17:23);
      c.globalAlpha=s.active===false?.25:1;icon(c,s.src,px,py,iconSize);c.fillStyle='#ecedda';c.font=`bold ${compact?10:11}px system-ui`;c.fillText(s.value,px+iconSize+2,py+iconSize*.8,colW-iconSize-2);c.globalAlpha=1;
    }
    if(p.weapon){const py=top+cardH-25;c.fillStyle='#102620';c.fillRect(left+6,py-4,width-pad*2-12,20);icon(c,p.weapon.src,left+9,py-3,18);c.fillStyle='#ffedb8';c.font='bold 11px system-ui';c.fillText(`${p.weapon.label} ${p.weapon.value}`,left+31,py+11,width-pad*2-35);}
  }
  c.restore();
}
