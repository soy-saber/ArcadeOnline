import type { Adapter } from './types';
import { ID, create, step, valid } from './boxhead-core';
import { WIDTH, HEIGHT, MAPS, move } from './boxhead-world';
import { render, confirm, setSound, setVolume } from './boxhead-view';
import { renewFireKey } from './boxhead-player-pose';

export const adapter: Adapter = {
  id:ID,title:'僵尸危机3',seats:4,hz:25,width:WIDTH,height:HEIGHT,
  controls:'WASD / 方向键移动与瞄准；空格 / J 射击；Q / E 前后换枪（K / X 也可）；1–0 选武器。默认开启友伤，爆炸也会伤到自己；死亡清空非手枪弹药，队友存活时可复活。',
  maps:MAPS.map(({id,label})=>({id,label})),create,step,valid,render,confirm,setSound,setVolume,
  consumeInput(s,seat,input){const p=s.players.find(p=>p.seat===seat);if(p){p.lastAttack=Math.max(p.lastAttack,input.attack);p.lastAlt=Math.max(p.lastAlt,input.alt);p.triggerDown=false;renewFireKey(p);}},
  predict(s,seat,input,fraction){const p=s.players.find(p=>p.seat===seat);if(!p?.alive)return;
    const dx=Number(input.right)-Number(input.left),dy=Number(input.down)-Number(input.up);if(dx||dy){p.dir=Math.atan2(dy,dx);move(s,p,dx*5.12*fraction,dy*5.12*fraction);}}
};
