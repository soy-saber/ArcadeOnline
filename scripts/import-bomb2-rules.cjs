'use strict';
// Parse literal property pools from the retained original AS3 export; never execute it.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'artifacts/swf-analysis/9109-restore/embedded/scripts/actionSprite/Game.as');
const source=fs.readFileSync(file,'utf8'),start=source.indexOf('private function mapPropInit()'),end=source.indexOf('private function countTime()',start);
const ids={NumProp:1,PowProp:2,SpeedProp:3,LifeProp:4,BombShoes:6,InvincibilityProp:7,NombrilProp:22,SinkerProp:15,LauncherProp:16,TelecontrolProp:17,MineProp:18,ShotgunProp:19,LaserGunProp:20,ThrowerProp:21};
const pools={};
for(const m of source.slice(start,end).matchAll(/case "(\w+)":\s*_mapPropArr\.push\(([^)]+)\)/g))pools[m[1]]=m[2].split(',').map(n=>{if(!ids[n.trim()])throw Error('Unknown original prop '+n);return ids[n.trim()];});
if(Object.keys(pools).length!==4)throw Error('Expected four original property pools');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(path.join(root,'src/expanded/bomb2-rules.json'),JSON.stringify({source:'games/9109/game.swf',rawSha256:hash(fs.readFileSync(path.join(root,'games/9109/game.swf'))),function:'actionSprite.Game.mapPropInit',pools},null,2)+'\n');
console.log('Imported four original Bomb It 2 property pools.');
