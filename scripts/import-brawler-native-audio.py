"""Copy the original SWF MP3 bitstreams and original Snd.AddSound names."""
from pathlib import Path
import csv,hashlib,json,re,struct,zlib,wave,shutil
root=Path(__file__).resolve().parents[1];raw=(root/'games/6232/game.swf').read_bytes();body=zlib.decompress(raw[8:]) if raw[:3]==b'CWS' else raw[8:];at=(5+4*(body[0]>>3)+7)//8+4
symbols={int(cid):name for cid,name in csv.reader((root/'artifacts/brawler-original/symbolClass/symbols.csv').read_text('utf8').splitlines(),delimiter=';')};sounds={}
out=root/'public/expanded/assets/brawler/native/audio';out.mkdir(exist_ok=True)
while at<len(body):
 head=struct.unpack_from('<H',body,at)[0];at+=2;code=head>>6;length=head&63
 if length==63:length=struct.unpack_from('<I',body,at)[0];at+=4
 payload=body[at:at+length];at+=length
 if code==14:
  cid=struct.unpack_from('<H',payload)[0];name=symbols[cid];codec=payload[2]>>4;assert codec in [0,1,2,3],(cid,name,codec)
  if codec==2:
   data=payload[9:];file=Path(name).stem+'.mp3';(out/file).write_bytes(data)
  elif codec in [0,3]:
   data=payload[7:];file=Path(name).stem+'.wav'
   with wave.open(str(out/file),'wb') as w:w.setnchannels((payload[2]&1)+1);w.setsampwidth(2 if payload[2]&2 else 1);w.setframerate([5512,11025,22050,44100][(payload[2]>>2)&3]);w.writeframes(data)
  else:
   data=payload[7:];file=Path(name).stem+'.wav';matches=list((root/'artifacts/brawler-native-reference/audio').glob(str(cid)+'_*.wav'));assert len(matches)==1,(cid,matches);shutil.copyfile(matches[0],out/file)
  sounds[name]={'file':file,'codec':codec,'symbol':cid,'bytes':(out/file).stat().st_size,'sha256':hashlib.sha256((out/file).read_bytes()).hexdigest(),'payloadSha256':hashlib.sha256(data).hexdigest(),'sampleCount':struct.unpack_from('<I',payload,3)[0],'seekSamples':struct.unpack_from('<h',payload,7)[0] if codec==2 else 0}
script=(root/'artifacts/brawler-original/scripts/frame_42/DoAction.as').read_text('utf8');mapping={}
for link,name in re.findall(r'Snd.AddSound\("([^"]+)","([^"]+)"\)',script):mapping.setdefault(name,[]).append(sounds[link]['file'])
data={'sourceSwfSha256':hashlib.sha256(raw).hexdigest(),'sounds':sounds,'mapping':mapping,'method':'Original DefineSound MP3 bitstreams copied without recoding; PCM samples wrapped in a WAV header; SWF ADPCM decoded to PCM WAV by FFDec sound export. Snd.AddSound aliases retain original lists.'}
encoded=json.dumps(data,indent=2)+'\n';(out/'provenance.json').write_text(encoded,'utf8');(root/'src/expanded/brawler-native-audio.json').write_text(json.dumps(mapping,separators=(',',':'))+'\n','utf8');print('Copied',len(sounds),'original sound streams (MP3 and PCM WAV).')
