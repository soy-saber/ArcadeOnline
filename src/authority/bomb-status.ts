import { position, ITEM_LABELS, type GameState, type Player } from './bomb-core';
import type { PlayerStatus, StatusIcon } from './player-status';
export const BOMB_FIELD_WIDTH=716, BOMB_PANEL_WIDTH=176, BOMB_CANVAS_WIDTH=BOMB_FIELD_WIDTH+BOMB_PANEL_WIDTH;
const asset=(id:string)=>`/authority/assets/item-${id}.png`;
export function bombWeapon(p:Player):StatusIcon|null {return p.weapon&&p.ammo>0?{src:`/authority/assets/hud-weapon-${p.weapon}.png`,label:ITEM_LABELS[p.weapon],value:`×${p.ammo}`}:null;}
export function bombStatus(s:GameState):PlayerStatus[] {
  return s.players.filter(p=>s.options.mode!=='online'||s.options.activeSeats?.includes(p.seat)).map(p=>({seat:p.seat,alive:p.alive,portrait:`/authority/assets/hud-portrait-${p.seat}.png`,color:['#ffb2d2','#ffe27e','#8aceff','#b2e78f'][p.seat-1],
    title:p.alive?`生命 ${p.life}`:'已出局',note:p.frozen?'冻结中':p.slow?'减速中':p.invulnerable?'保护中':'',
    icons:[{src:asset('bomb'),label:'可用炸弹',value:String(Math.max(0,p.capacity-s.bombs.filter(b=>b.owner===p.seat).length))},{src:asset('range'),label:'爆炸威力',value:String(p.range)},{src:asset('speed'),label:'速度',value:String(7-p.speed)},
      {src:asset('life'),label:'生命',value:String(p.life)},{src:asset('push'),label:'手套',value:p.push?'✓':'—',active:p.push},{src:asset('shield'),label:'护盾',value:p.shield?'✓':'—',active:p.shield}],weapon:bombWeapon(p)}));
}
export function bombBadgeAnchor(p:Player){const pos=position(p);return {x:28+(pos.x+.5)*44,y:66+(pos.y+1)*44-53};}
