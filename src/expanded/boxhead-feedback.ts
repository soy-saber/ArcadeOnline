import type { State } from './types';

/** CWorld.Shake checks the existing amplitude before adding the next impulse. */
export function explosionFeedback(s:State):void {
  if(Math.abs(s.shakeY)<32)s.shakeY+=30;
  s.brightness=1;
}

/** The original runs these once in Draw after each 25Hz simulation callback. */
export function stepFeedback(s:State):void {
  s.shakeY*=-.5;if(Math.abs(s.shakeY)<.1)s.shakeY=0;
  if(s.brightness!==0){s.brightness-=.2*Math.sign(s.brightness);if(Math.abs(s.brightness)<.2)s.brightness=0;}
}

export function drawBrightness(c:CanvasRenderingContext2D,brightness:number,width:number,height:number,hud:number):void {
  if(brightness<=0)return;
  // The viewport is opaque. Additive white is the native color matrix's
  // R/G/B + 255*brightness, clamped at 255; ordinary source-over would differ.
  c.save();c.globalCompositeOperation='lighter';c.globalAlpha=brightness;c.fillStyle='#fff';c.fillRect(0,hud,width,height-hud);c.restore();
}
