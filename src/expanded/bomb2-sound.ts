import { NativeAudio, emitSound } from '../authority/native-audio';
import type { State } from './types';
const root='/expanded/assets/bomb2/original/sounds/';
export const SOUND_FILES:Record<string,string>={
  place:'4110_addBomb.mp3',remote:'4108_addTeleBomb.mp3',mine:'4109_addMineBomb.mp3',explode:'4107_bomb.mp3',pickup:'4104_eatProp.mp3',dead:'4105_dead.mp3',
  hammer:'4088_useSinker.mp3',launcher:'4091_useLauncher.mp3',shotgun:'4089_useShotgun.mp3',laserReady:'4093_useLaserReady.mp3',laser:'4092_useLaserShoot.mp3',fire:'4087_useThrower.mp3',shield:'4090_useNombril.mp3',invincible:'4100_InvincibilitySound.mp3',
  frog:'4101_getFrog.mp3',car:'4102_getCar.mp3',bulldozer:'4103_getBulldozer.mp3',crush:'4106_bulldozerProp.mp3',
  complete:'4099_levelComplete.mp3',failed:'4098_levelFailed.mp3',menu:'4115_uiMusic.mp3',music1:'4114_gameMusic_1.mp3',music2:'4113_gameMusic_2.mp3',music3:'4112_gameMusic_3.mp3',music4:'4111_gameMusic_4.mp3'
};
export const audio=new NativeAudio(Object.fromEntries(Object.entries(SOUND_FILES).map(([name,file])=>[name,root+file])));
export function sound(s:State,name:string):void {emitSound(s as State&{soundId:number;sounds:{id:number;name:string}[]},name);}
