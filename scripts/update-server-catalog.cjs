"use strict";
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..'),file=path.join(root,'public/games.json');
const details={
  '3881-server':['Q版泡泡堂','休闲对战','放下炸弹、收集道具，在五种经典场景里和好友一决胜负。'],
  '46923-server':['火柴人打羽毛球','体育竞技','发球、起跳、挥拍，来一场先得 7 分的双人羽毛球对决。'],
  '137953-server':['坦克动荡2','坦克对战','穿梭迷宫、利用弹墙反弹，最多三人同场坦克对战。'],
  '50737-server':['僵尸危机3','合作射击','最多四人并肩迎战僵尸，解锁武器、收集补给、守住阵地。'],
  '6232-server':['疯狂小人战斗','动作格斗','跳跃、拾取武器、发动特技，把对手击出场外。'],
  '9109-server':['Q版泡泡堂2','休闲对战','十八张地图，生存、击杀、金币、占地四种模式，最多四人一起玩。'],
  '97734-server':['混乱大枪战2','平台射击','二段跳、射击、投掷手雷，在平台竞技场中决出最后的胜者。'],
  'fbw_forest-server':['森林冰火人','合作冒险','红人与蓝人互相配合，解开机关，探索森林神殿的三十二关。'],
};
const games=JSON.parse(fs.readFileSync(file,'utf8')).filter(g=>g.runtime==='server');
for(const game of games){[game.title,game.genre,game.description]=details[game.id];game.cover='/assets/game-'+game.id.replace(/-server$/,'')+'.webp';}
fs.writeFileSync(file,JSON.stringify(games,null,2)+'\n');
for(const [file,title]of [['brawler.ts','疯狂小人战斗'],['boxhead.ts','僵尸危机3'],['gunmayhem.ts','混乱大枪战2'],['forest.ts','森林冰火人']]){
  const p=path.join(root,'src/expanded',file);fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/title:'[^']*'/,`title:'${title}'`));
}
console.log('Catalog contains only eight multiplayer games, with original names and explicit covers');
