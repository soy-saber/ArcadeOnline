"use strict";
// Test-owned process only. Production server exposes no state-mutation API.
const path=require('node:path'),repo=path.resolve(__dirname,'../..');
const {AuthorityEngine}=require(path.join(repo,'runtime/authority.cjs'));
const rooms=new Map(),original=AuthorityEngine.prototype.onRoom;
AuthorityEngine.prototype.onRoom=function(room){rooms.set(room.name,room);return original.call(this,room);};
process.on('message',message=>{
  try {
    const room=rooms.get(message.room);if(!room||room.gameId!=='9109-server')throw new Error('Kill test room missing');
    const s=room.auth.state;if(s.mode!=='kill'||s.phase!=='playing')throw new Error('Kill test not playing');
    // Deterministic arena placement; score, damage, attack input, timers,
    // protection and death transitions always use real server simulation.
    s.board.fill(0);s.tiles.fill(0);
    for(const [i,x,y] of [[0,3,3],[1,4,3],[2,10,10],[3,12,10]]){
      const p=s.players[i];if(p.respawnAt||p.invulnerable||p.actionLock||p.attack)throw new Error('Players not recovered');
      p.x=x;p.y=y;p.moveDir=-1;p.progress=0;
    }
    s.players[0].dir=2;
    process.send({id:message.id,ok:true});
  }catch(error){process.send({id:message.id,error:error.message});}
});
require(path.join(repo,'server.js'));
