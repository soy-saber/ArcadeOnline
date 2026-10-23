import type { State } from './types';
import type { PlayerStatus, StatusIcon } from '../authority/player-status';
export const BOMB2_FIELD_WIDTH=600, BOMB2_PANEL_WIDTH=154, BOMB2_CANVAS_WIDTH=BOMB2_FIELD_WIDTH+BOMB2_PANEL_WIDTH;
const asset=(id:number)=>`/expanded/assets/bomb2/prop-${id}.png`;
const labels:Record<number,string>={15:'锤子',16:'火箭',17:'遥控弹',18:'地雷',19:'霰弹枪',20:'激光',21:'喷火器'};
export function bomb2Weapon(s:State,p:any):StatusIcon|null {
  if(p.weapon&&p.ammo>0)return {src:`/expanded/assets/bomb2/hud-weapon-${p.weapon}.png`,label:labels[p.weapon],value:`×${p.ammo}`};
  if(p.attack)return {src:`/expanded/assets/bomb2/hud-weapon-${p.attack.kind}.png`,label:labels[p.attack.kind],value:p.attack.remaining===-1?'∞':'×0'};
  if(s.bombs.some((b:any)=>b.kind==='remote'&&b.owner===p.seat))return {src:'/expanded/assets/bomb2/hud-weapon-remote-trigger.png',label:'引爆遥控弹',value:'×0'};
  return s.mode==='kill'?{src:'/expanded/assets/bomb2/hud-weapon-15.png',label:'锤子',value:'∞'}:null;
}
export function bomb2Status(s:State):PlayerStatus[] {
  return s.players.map(p=>({seat:p.seat,alive:p.alive&&p.respawnAt<=s.tick,portrait:`/expanded/assets/bomb2/hero-${p.seat-1}-down.png`,portraitFrames:24,
    title:!p.alive?'已出局':p.respawnAt>s.tick?'复活中':`生命 ${p.life}`,
    note:s.mode==='kill'?`${p.points}/10 击杀`:s.mode==='collect'?`${p.points}/10 金币`:s.mode==='color'?`${p.points}/50 地块`:p.invulnerable?'保护中':'生存',
    icons:[{src:asset(1),label:'炸弹数量',value:String(p.capacity)},{src:asset(2),label:'威力',value:String(p.range)},{src:asset(3),label:'速度',value:String(9-p.speed)},
      {src:asset(4),label:'生命',value:String(p.life)},{src:asset(6),label:'踢弹',value:p.kick?'✓':'—',active:p.kick},{src:asset(22),label:'护盾',value:p.shield?'✓':'—',active:p.shield}],weapon:bomb2Weapon(s,p)}));
}
