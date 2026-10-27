import mapping from './brawler-native-audio.json';
export interface SoundEvent {id:number;tick:number;action:'play'|'stop';name:string;variant:number}
export const sounds=mapping as Record<string,string[]>;
let enabled=true,volume=.24,round=-1,last=0,musicMap='';
const active=new Map<string,HTMLAudioElement>(),loops=new Map<string,HTMLAudioElement>();
const stop=(a:HTMLAudioElement)=>{a.pause();a.currentTime=0;};
function play(name:string,variant=0,loop=false):void {
 const files=sounds[name];if(!files||!enabled)return;const cache=loop?loops:active;
 if(cache.has(name))stop(cache.get(name)!);
 const audio=new Audio('/expanded/assets/brawler/native/audio/'+files[variant%files.length]);audio.volume=volume;audio.loop=loop;cache.set(name,audio);void audio.play().catch(()=>{});
}
function stopAll():void {for(const a of active.values())stop(a);for(const a of loops.values())stop(a);active.clear();loops.clear();musicMap='';}
export function setSound(value:boolean):void {enabled=value;if(!value)stopAll();}
export function setVolume(value:number):void {volume=Math.max(0,Math.min(1,value));for(const a of [...active.values(),...loops.values()])a.volume=volume;}
export function confirm(s:{round:number;tick:number;phase:string;mapId:string;soundSeq:number;sounds:SoundEvent[]}):void {
 if(s.round!==round){stopAll();round=s.round;last=s.soundSeq;}
 if(s.phase==='playing'&&enabled&&musicMap!==s.mapId){stopAll();musicMap=s.mapId;play(s.mapId,0,true);if(s.mapId==='Rooftop')play('Helicopter',0,true);if(s.mapId==='B52')play('JetEngine',0,true);}
 if(s.phase==='waiting')stopAll();
 for(const e of s.sounds)if(e.id>last){if(s.tick-e.tick<=8){if(e.action==='play')play(e.name,e.variant);else {const a=active.get(e.name);if(a)stop(a);}}last=e.id;}
}
