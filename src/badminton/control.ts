import type { Player } from './core';
import type { Motion } from './motion';

export function controlState() {
  return {jumping:false,jumps:0,motion:'normal' as Motion,motionAt:0,
    racket:{frame:1,playing:false,serveFrame:1,servePlaying:false,ready:true,active:false,consumed:false,strokes:0,strokeAt:-1}};
}

/** Native gun/gunServe are separate clips sharing RacketReady and Swing.
 * A play() on the stopped service frame1 starts advancing next callback;
 * gotoAndPlay(2) enters the ordinary stroke's frame2 immediately. */
export function advanceRacket(p:Player,release:()=>void,serviceEnded:()=>void):void {
  const r=p.racket;
  if(r.playing){
    r.frame++;
    if(r.frame===2||r.frame===16){r.active=true;r.ready=false;r.consumed=false;}
    if(r.frame===9||r.frame===23)r.active=false;
    if(r.frame===15||r.frame===29){r.active=false;r.ready=true;r.playing=false;}
  }
  if(r.servePlaying){
    r.serveFrame=r.serveFrame===13?1:r.serveFrame+1;
    if(r.serveFrame===2){r.active=true;r.ready=false;r.consumed=false;}
    if(r.serveFrame===4)release();
    if(r.serveFrame===13)serviceEnded();
    if(r.serveFrame===1){r.servePlaying=false;r.active=false;r.ready=true;}
  }
}

export function startRacket(p:Player,serving:boolean,tick:number):void {
  const r=p.racket;
  if(serving){r.servePlaying=true;return;}
  r.frame=2;r.playing=true;r.ready=false;r.active=true;r.consumed=false;r.strokes++;r.strokeAt=tick;
}

/** Compact pose fields remain derived summaries for existing room consumers.
 * The two native clip tracks, not these summaries, drive gameplay and drawing. */
export function syncControl(p:Player):void {
  p.swing=p.racket.playing?(p.racket.frame>=16?30-p.racket.frame:16-p.racket.frame):0;
  p.swingHit=p.racket.consumed;p.servePose=p.racket.servePlaying?1:0;p.underhand=p.racket.frame>=16?1:0;
}

export function validControl(p:Player,tick:number):boolean {
  const r=p.racket;
  return !!r&&['playing','servePlaying','ready','active','consumed'].every(k=>typeof r[k as keyof typeof r]==='boolean')&&
    Number.isInteger(r.frame)&&r.frame>=1&&r.frame<=29&&Number.isInteger(r.serveFrame)&&r.serveFrame>=1&&r.serveFrame<=13&&
    Number.isSafeInteger(r.strokes)&&r.strokes>=0&&Number.isSafeInteger(r.strokeAt)&&r.strokeAt>=-1&&r.strokeAt<=tick&&
    typeof p.jumping==='boolean'&&Number.isSafeInteger(p.jumps)&&p.jumps>=0&&['normal','walkforward','walkbackward','walkup','walkdown'].includes(p.motion)&&
    Number.isSafeInteger(p.motionAt)&&p.motionAt>=0&&p.motionAt<=tick&&
    p.swing===(r.playing?(r.frame>=16?30-r.frame:16-r.frame):0)&&p.swingHit===r.consumed&&p.servePose===(r.servePlaying?1:0)&&p.underhand===(r.frame>=16?1:0);
}
