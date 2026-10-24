// Confirmed, numbered events only. Snapshot replay must not replay old sounds.
export interface NativeSound { id:number; name:string }
export function emitSound(s:{soundId:number;sounds:NativeSound[]},name:string):void {
  s.sounds.push({id:++s.soundId,name});if(s.sounds.length>64)s.sounds.splice(0,s.sounds.length-64);
}
export class NativeAudio {
  private enabled=true;
  private volume=.24;
  private ready=false;
  private round=0;
  private heard=0;
  private playing=new Set<HTMLAudioElement>();
  private music:HTMLAudioElement|null=null;
  private track='';
  private wanted='';
  private installed=false;
  constructor(private files:Record<string,string>){}
  setSound(value:boolean):void {this.enabled=value;if(!value){for(const a of this.playing)a.pause();this.playing.clear();this.music?.pause();}else this.syncMusic();}
  setVolume(value:number):void {this.volume=Math.min(1,Math.max(0,value));for(const a of this.playing)a.volume=this.volume;if(this.music)this.music.volume=this.volume*.45;this.syncMusic();}
  private install():void {
    if(this.installed||typeof window==='undefined')return;this.installed=true;
    const unlock=()=>{this.ready=true;this.syncMusic();};
    window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);
    window.addEventListener('pagehide',()=>{this.music?.pause();for(const a of this.playing)a.pause();});
    document.addEventListener('visibilitychange',()=>this.syncMusic());
  }
  private syncMusic():void {
    if(!this.enabled||!this.ready||this.volume===0||typeof document==='undefined'||document.hidden||!this.wanted){this.music?.pause();return;}
    if(this.track!==this.wanted){this.music?.pause();this.track=this.wanted;this.music=new Audio(this.files[this.track]);this.music.loop=true;}
    if(this.music?.paused){this.music.volume=this.volume*.45;void this.music.play().catch(()=>{});}
  }
  private play(name:string):void {
    const file=this.files[name];if(!file||!this.enabled||!this.ready||this.volume===0)return;
    if(this.playing.size>=16){const oldest=this.playing.values().next().value;if(oldest){oldest.pause();this.playing.delete(oldest);}}
    const audio=new Audio(file);audio.volume=this.volume;this.playing.add(audio);
    const done=()=>this.playing.delete(audio);audio.onended=done;audio.onerror=done;void audio.play().catch(done);
  }
  confirm(s:{round:number;phase:string;soundId:number;sounds:NativeSound[];musicTrack:number},seat?:number|null,winner?:number|null):void {
    this.install();
    this.wanted=s.phase==='playing'?'music'+s.musicTrack:s.phase==='waiting'?'menu':'';
    this.syncMusic();
    if(this.round!==s.round){this.round=s.round;this.heard=s.soundId;return;}
    for(const event of s.sounds)if(event.id>this.heard)this.play(event.name==='result'?(seat&&winner!==seat?'failed':'complete'):event.name);
    this.heard=s.soundId;
  }
}
