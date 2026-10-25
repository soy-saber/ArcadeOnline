'use strict';
// Unit arrangements after native Init; browser fixtures never grant projectiles.
module.exports=(s,owner=1)=>({grenadePhase:'normal',grenadePower:.25,radius:3.2,angle:0,parent:s.players.find(p=>p.seat===owner)?.id??0,born:s.tick});
