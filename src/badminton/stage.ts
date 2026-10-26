import native from './runtime-geometry.json';

export const HZ=30,STEP_MS=1000/HZ,WIDTH=550,HEIGHT=400,TARGET=7;
export const GROUND=native.ground,LEFT_WALL=36.5,RIGHT_WALL=513.5;
export const NET_X=native.net.x,NET_TOP=native.net.y-native.net.height/2,NET_HALF_WIDTH=native.net.width/2;
export const NET_LIMIT_X=native.netLimit.x,NET_LIMIT_HALF_WIDTH=native.netLimit.width/2;
export const NET_LIMIT_TOP=native.netLimit.y-native.netLimit.height/2,NET_LIMIT_BOTTOM=native.netLimit.y+native.netLimit.height/2;
// AVM1 _x/_y setters truncate to integer twips; velocity fields remain doubles.
export const twips=(value:number):number=>Math.trunc(value*20)||0;
export const pixel=(value:number):number=>twips(value)/20;
export const rotation=(vx:number,vy:number):number=>Math.atan2(vy,vx)/3.141593*180+90;
export const wrapRotation=(degrees:number):number=>((degrees+180)%360+360)%360-180;
