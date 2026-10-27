/** AS2 World.CollisionDetect uses bounding boxes, including point probes. */
export interface Platform {id:number;name:string;x:number;y:number;w:number;h:number;floor:number;moving:boolean}
export interface Collision {hit:boolean;left:boolean;right:boolean;leftBC:boolean;rightBC:boolean;bottom:boolean;top:boolean;floor:number;moving:boolean;height:number;platform:Platform|null}
export function overlap(a:number[]|null,b:number[]|null):boolean {return !!a&&!!b&&a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
export function platformBounds(q:Platform):number[]{return [q.x,q.y,q.x+q.w,q.y+q.h];}
export function collision(b:number[],platforms:Platform[],moving=true,lowRes=false):Collision {
 const hit:Collision={hit:false,left:false,right:false,leftBC:false,rightBC:false,bottom:false,top:false,floor:-Infinity,moving:false,height:0,platform:null};let fixed=false;
 for(const q of platforms){
  if(q.moving&&!moving||!overlap(b,platformBounds(q)))continue;
  hit.floor=Math.max(hit.floor,q.floor);if(q.moving)hit.moving=true;else fixed=true;
  const point=(x:number,y:number)=>x>=q.x&&x<=q.x+q.w&&y>=q.y&&y<=q.y+q.h;
  if(!q.moving||!lowRes){if(point(b[0],(b[1]+b[3])/2)){hit.left=true;hit.hit=true;}if(point(b[2],(b[1]+b[3])/2)){hit.right=true;hit.hit=true;}}
  if(point(b[2],b[3])){hit.rightBC=true;hit.hit=true;hit.platform=q;}
  if(point(b[0],b[3])){hit.leftBC=true;hit.hit=true;hit.platform=q;}
  if(point((b[0]+b[2])/2,b[3])){hit.bottom=true;hit.hit=true;hit.platform=q;}
  if(point((b[0]+b[2])/2,b[1])){hit.top=true;hit.hit=true;hit.platform=q;hit.height=q.h;}
 }
 if(fixed)hit.moving=false;return hit;
}
