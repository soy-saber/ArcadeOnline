import data from './boxhead-gun-positions.json';

type Pose={directions:number;sequence:number[];anchors:(number[]|null)[][]};
const poses=data.poses as Record<string,Pose>;
export const PROJECTION=data.projection;

/** CThing_Angle.mAngle256 truncates before the direction lookup rounds. */
export function nativeDirection(angle:number,directions:number):number {
  const normalized=(angle%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
  return Math.round((Math.trunc(normalized*256/(Math.PI*2))&255)/(256/directions))%directions;
}

export function poseAction(logical:string):string {
  const walking=logical.endsWith('walk'),weapon=logical.slice(0,walking?-4:-5);
  const prefix=({pistol:'handgun',uzi:'uzi',shotgun:'shotgun',rocket:'rocketlauncher',railgun:'railgun'} as Record<string,string>)[weapon];
  return (prefix?prefix+'-':'')+(walking?'walk':'stand');
}
export function rawPoseFrame(action:string,frame:number):number {
  const sequence=poses[action].sequence;
  return sequence[Math.floor(frame)%sequence.length];
}
export function playerPose() {
  return {poseName:'',poseAction:'handgun-stand',poseFrame:0,drawAction:'handgun-stand',drawFrame:0,
    fireKeyDown:false,firePressed:false,fireReleased:false,fireTap:false};
}

/** CInput.UpdateKey latches edges; IsPressed/IsReleased consume them only when
 * Weapon.Update actually reads them. Network press counters preserve short taps. */
export function updateFireKey(p:any,held:boolean,pressed:boolean,cancelled:boolean,tick:number):void {
  if(cancelled){renewFireKey(p);return;}
  if(pressed&&!held)p.fireTap=true;
  if(held&&!p.fireKeyDown||pressed) {
    if(!p.firePressed){p.firePressed=true;p.triggerAt=tick;}
    if(!held)p.fireReleased=true;
  }
  if(!held&&p.fireKeyDown)p.fireReleased=true;
  p.fireKeyDown=held;
}
export function renewFireKey(p:any):void {
  p.fireKeyDown=false;p.firePressed=false;p.fireReleased=false;p.fireTap=false;
}
export function consumeFireKey(p:any,auto:boolean,onRelease:boolean):boolean {
  if(auto) {
    // A complete tap can fall between network samples. Preserve that existing
    // online input extension, consuming it once rather than replaying it.
    const firing=p.triggerDown||p.fireTap;
    if(firing)p.fireTap=false;
    return firing;
  }
  if(onRelease) {
    if(!p.fireReleased)return false;
    p.fireReleased=false;p.firePressed=false;p.fireTap=false;return true;
  }
  if(!p.firePressed)return false;
  p.firePressed=false;p.fireTap=false;return true;
}

/** Fire runs before SetAnimation/Animate in State_PlayerControl. */
export function weaponPosition(p:any):{x:number;y:number;z:number} {
  const pose=poses[p.poseAction],direction=nativeDirection(p.dir,pose.directions);
  const offset=pose.anchors[direction][rawPoseFrame(p.poseAction,p.poseFrame)];
  // Update_CurrentFrame sets mPreUpdate: this callback draws the firing pose.
  p.drawAction=p.poseAction;p.drawFrame=p.poseFrame;
  return offset?{x:p.x+offset[0],y:p.y+offset[1],z:offset[2]}:{x:p.x,y:p.y,z:0};
}

export function advancePlayerPose(p:any,logical:string,fired:boolean):void {
  if(logical!==p.poseName) {
    p.poseName=logical;const action=poseAction(logical);
    // MimicItem shares the animation object. Changing an alias does not reset it.
    if(p.poseAction!==action){p.poseAction=action;p.poseFrame=0;}
  } else p.poseFrame=(p.poseFrame+.16*2)%poses[p.poseAction].sequence.length;
  if(!fired){p.drawAction=p.poseAction;p.drawFrame=p.poseFrame;}
}

export function validPlayerPose(p:any):boolean {
  return [p.fireKeyDown,p.firePressed,p.fireReleased,p.fireTap].every(v=>typeof v==='boolean')&&typeof p.poseName==='string'&&(p.poseName===''||/^(pistol|uzi|shotgun|barrel|grenade|fakewall|mine|rocket|chargepack|railgun)(stand|walk)$/.test(p.poseName)&&poseAction(p.poseName)===p.poseAction)&&
    [p.poseAction,p.drawAction].every(action=>Object.prototype.hasOwnProperty.call(poses,action))&&
    Number.isFinite(p.poseFrame)&&p.poseFrame>=0&&p.poseFrame<poses[p.poseAction].sequence.length&&
    Number.isFinite(p.drawFrame)&&p.drawFrame>=0&&p.drawFrame<poses[p.drawAction].sequence.length;
}
