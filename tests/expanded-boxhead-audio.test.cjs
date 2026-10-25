'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),path=require('node:path');
const file=path.resolve(__dirname,'../src/expanded/boxhead.ts');const source=require('esbuild').buildSync({entryPoints:[file],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;const mod=new Module(file,module);mod.paths=module.paths;mod._compile(source,file);const a=mod.exports.adapter;
test('original audio events play once, honor volume/mute and do not replay snapshot history',()=>{
 const heard=[];global.Audio=class {constructor(src){this.src=src;}play(){heard.push({src:this.src,volume:this.volume});this.onended?.();return Promise.resolve();}pause(){}};
 const s=a.create(1,true,[1,2],1);a.setSound(true);a.setVolume(.37);a.confirm(s);
 s.tick=1;s.soundId=1;s.sounds=[{id:1,tick:1,name:'Weapon.Pistol.Fire.wav'}];a.confirm(s);a.confirm(s);assert.equal(heard.length,1);assert.equal(heard[0].volume,.37);assert(heard[0].src.endsWith('weapon-pistol-fire.mp3'));
 s.tick=20;s.soundId=2;s.sounds.push({id:2,tick:2,name:'Effect.Explosion.wav'});a.confirm(s);assert.equal(heard.length,1);
 a.setSound(false);s.soundId=3;s.sounds=[{id:3,tick:20,name:'Effect.Explosion.wav'}];a.confirm(s);a.setSound(true);a.confirm(s);assert.equal(heard.length,1);
 a.setVolume(0);s.soundId=4;s.sounds=[{id:4,tick:20,name:'Effect.Explosion.wav'}];a.confirm(s);assert.equal(heard.length,1);
 a.setVolume(.5);s.round=2;s.soundId=5;s.sounds=[{id:5,tick:20,name:'Effect.Explosion.wav'}];a.confirm(s);assert.equal(heard.length,1);
 s.soundId=6;s.sounds=[{id:6,tick:20,name:'Effect.Explosion.wav'}];a.confirm(s);assert.equal(heard.length,2);
});
test('native zombie ambience returns with a new horde and stops between waves or when muted',()=>{
 const heard=[],stopped=[];global.Audio=class {constructor(src){this.src=src;}play(){heard.push(this);return Promise.resolve();}pause(){stopped.push(this.src);}};
 const s=a.create(20,true,[1,2],1);a.setSound(true);a.setVolume(.4);a.confirm(s);s.zombies=[{x:100,y:100}];s.tick=150;a.confirm(s);assert(heard.at(-1).src.includes('creature-zombie-ambience-'));assert(heard.at(-1).volume>0&&heard.at(-1).volume<.4);const count=heard.length;
 s.zombies=[];s.tick=151;a.confirm(s);assert(stopped.length>0);
 s.zombies=[{x:100,y:100}];s.tick=301;a.confirm(s);assert.equal(heard.length,count+1);a.setSound(false);assert(stopped.length>1);s.tick=451;a.confirm(s);assert.equal(heard.length,count+1);
});

test('native creature hit/death aliases retain original sample gains and volume updates',()=>{
 const heard=[];global.Audio=class {constructor(src){this.src=src;}play(){heard.push(this);return Promise.resolve();}pause(){}};
 const s=a.create(30,true,[1,2],1);a.setSound(true);a.setVolume(.5);a.confirm(s);s.tick=1;s.soundId=3;s.sounds=[{id:1,tick:1,name:'Creature.Zombie.Ambience.4.wav'},{id:2,tick:1,name:'Creature.Player.Scream.1.wav'},{id:3,tick:1,name:'Creature.HitFloor.wav'}];a.confirm(s);assert.deepEqual(heard.map(a=>a.volume),[.2,.35,.5]);a.setVolume(.2);assert.deepEqual(heard.map(a=>a.volume),[.08000000000000002,.13999999999999999,.2]);a.setSound(false);
});
