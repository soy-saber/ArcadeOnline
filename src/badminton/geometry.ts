import data from './geometry.json';

export interface RacketPose {frame:number;active:boolean;rotation:number;bounds:number[];matrix:number[]}
export function racketFramePose(seat:number,frame:number):RacketPose {
  const poses=seat===1&&frame>=16?data.timelines['p1-underhand']:seat===1?data.timelines['p1-swing']:data.timelines['p2-swing'];
  return poses[Math.max(0,Math.min(poses.length-1,frame>=16?frame-16:frame-1))];
}
export function racketFrameContains(p:{x:number;y:number},seat:number,frame:number,x:number,y:number):boolean {
  const pose=racketFramePose(seat,frame),[left,top,right,bottom]=pose.bounds;
  return pose.active&&x>=p.x+left&&x<=p.x+right&&y>=p.y+top&&y<=p.y+bottom;
}
export function racketPose(seat:number,swing:number,underhand:number):RacketPose {
  const frame=swing>0?16-swing:1;
  const key=seat===1&&underhand?'p1-underhand':seat===1?'p1-swing':'p2-swing';
  const poses=data.timelines[key];return poses[Math.max(0,Math.min(poses.length-1,key==='p1-underhand'?frame-2:frame-1))];
}
export function racketContains(p:{x:number;y:number;swing:number;underhand:number},seat:number,x:number,y:number):boolean {
  const pose=racketPose(seat,p.swing,p.underhand),[left,top,right,bottom]=pose.bounds;
  return pose.active&&x>=p.x+left&&x<=p.x+right&&y>=p.y+top&&y<=p.y+bottom;
}
export function servePoint(seat:number,frame:number):{x:number;y:number} {
  const pose=(seat===1?data.timelines['p1-serve']:data.timelines['p2-serve'])[Math.max(0,Math.min(12,frame-1))];
  return {x:pose.point[0],y:pose.point[1]};
}
