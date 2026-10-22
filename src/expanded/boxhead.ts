import type { Adapter } from './types';
import { ID, create, step, valid } from './boxhead-core';
import { WIDTH, HEIGHT, MAPS, move } from './boxhead-world';
import { render, confirm, setSound, setVolume } from './boxhead-view';

export const adapter: Adapter = {
  id:ID,title:'僵尸危机3',seats:4,hz:25,width:WIDTH,height:HEIGHT,
  controls:'WASD / 方向键移动与瞄准；空格 / J 射击；K / X 换武器；1–0 选择已解锁武器。连击解锁十种原版武器，与队友持续生存；队友存活时倒地者会复活。',
  maps:MAPS.map(({id,label})=>({id,label})),create,step,valid,render,confirm,setSound,setVolume,
  consumeInput(s,seat,input){const p=s.players.find(p=>p.seat===seat);if(p){p.lastAttack=Math.max(p.lastAttack,input.attack);p.lastAlt=Math.max(p.lastAlt,input.alt);}},
  predict(s,seat,input,fraction){const p=s.players.find(p=>p.seat===seat);if(!p?.alive)return;
    const dx=Number(input.right)-Number(input.left),dy=Number(input.down)-Number(input.up);if(dx||dy){p.dir=Math.atan2(dy,dx);move(s,p,dx*5.12*fraction,dy*5.12*fraction);}}
};
