'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/swf-analysis/9109-restore/embedded/scripts/actionSprite');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const classes=['Transmittal','BombShoes','Bomb','mapData/FactoryMapData','TelecontrolBomb'],sources=classes.map(name=>{
  const source=fs.readFileSync(path.join(base,name+'.as'),'utf8').replace(/\r\n/g,'\n');return{name,source,normalizedSourceSha256:sha(source)};
});
function number(source,pattern){const match=source.match(pattern);if(!match)throw Error('Missing source constant '+pattern);return Number(match[1]);}
const conveyor=sources[0].source,shoes=sources[1].source;
const data={source:'games/9109/game.swf',sha256:sha(fs.readFileSync(path.join(root,'games/9109/game.swf'))),conveyorTimerMs:number(conveyor,/new Timer\((\d+)\)/),conveyorSpeed:number(conveyor,/_transSpe = (\d+);/),kickSpeed:number(shoes,/_kickSpeed = (\d+);/),remoteBlastTime:number(sources[4].source,/_blastTime = (\d+);/),classes:sources.map(({name,normalizedSourceSha256})=>({name,normalizedSourceSha256})),method:'Static constant extraction; factory turn arrays imported separately by import-expanded-bomb2.py --maps-only.'};
fs.writeFileSync(path.join(root,'src/expanded/bomb2-mechanisms.json'),JSON.stringify(data,null,2)+'\n');
console.log('Imported original conveyor timer, conveyor speed and kick speed.');
