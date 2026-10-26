import data from './actor-geometry.json';
import {twips} from './stage';
const f=Math.fround;
const even=(n:number):number=>{const floor=Math.floor(n),fraction=n-floor;return fraction<.5?floor:fraction>.5?floor+1:floor%2===0?floor:floor+1;};
type Name=keyof typeof data.collisions;
function point(x:number,y:number,name:Name):{inside:boolean;x:number;y:number}{
  const c=data.collisions[name],m=c.inverse,b=c.bounds,px=twips(x),py=twips(y);
  return {inside:px>=b[0]&&px<=b[2]&&py>=b[1]&&py<=b[3],x:even(f(f(m[0]*px)+f(m[2]*py)))+m[4],y:even(f(f(m[1]*px)+f(m[3]*py)))+m[5]};
}
/** Original transparent shape117 winds clockwise. Native bounds cull first;
 * its shape test excludes the left/bottom local edges, including under the
 * rotated wall matrices. Inverse/point rounding uses f32 and ties-even twips. */
export function shapeContains(name:Name,x:number,y:number):boolean {
  const p=point(x,y,name);return p.inside&&p.x> -210&&p.x<=210&&p.y>= -210&&p.y<210;
}
export function boundsContains(name:Name,x:number,y:number):boolean {return point(x,y,name).inside;}
