"""Apply World.as runtime visibility to stage exports, retaining source geometry."""
from pathlib import Path
import hashlib,json,re,struct,zlib,xml.etree.ElementTree as ET

root=Path(__file__).resolve().parents[1]
cache=root/'artifacts/brawler-visible';cache.mkdir(parents=True,exist_ok=True)
source=root/'artifacts/brawler-original/scripts/__Packages/World.as'
text=source.read_text('utf8').split('   function AddPlayer(',1)[0]
prefixes=sorted(set(re.findall(r'\.substr\(0,\d+\) [!=]= "([A-Za-z]+)"',text)))
assert prefixes==['AI','Boom','Fixed','Killer','Moving','SpawnH'],prefixes
tree=ET.parse(root/'artifacts/brawler-original/game.xml');removed=[];plans={}
for tag in tree.getroot().find('tags'):
 if tag.get('type')!='DefineSpriteTag' or int(tag.get('spriteId','0')) not in [726,832,873,886]:continue
 hidden=set();sub=tag.find('subTags');cid=int(tag.get('spriteId'));indices=set();plans[cid]={'removed':indices,'tags':len(sub)}
 for index,item in enumerate(sub):
  kind=item.get('type','');depth=item.get('depth')
  if kind.startswith('PlaceObject'):
   name=item.get('name','')
   if name.startswith(tuple(prefixes)):
    hidden.add(depth);removed.append({'spriteId':int(tag.get('spriteId')),'name':name,'depth':int(depth)})
   elif item.get('characterId') or name:hidden.discard(depth)
   if depth in hidden:indices.add(index)
  elif kind.startswith('RemoveObject') and depth in hidden:
   indices.add(index);hidden.remove(depth)
assert all(any(r['spriteId']==cid for r in removed) for cid in [726,832,873,886])
raw=(root/'games/6232/game.swf').read_bytes();assert raw[:3] in [b'CWS',b'FWS']
body=zlib.decompress(raw[8:]) if raw[:3]==b'CWS' else raw[8:]
def tags(data):
 offset=0
 while offset<len(data):
  start=offset;header=struct.unpack_from('<H',data,offset)[0];offset+=2;code=header>>6;length=header&63
  if length==63:length=struct.unpack_from('<I',data,offset)[0];offset+=4
  payload=data[offset:offset+length];offset+=length;assert offset<=len(data)
  yield code,payload,data[start:offset]
  if code==0:assert offset==len(data)
def encode(code,payload):return struct.pack('<HI',(code<<6)|63,len(payload))+payload
rect_bytes=(5+4*(body[0]>>3)+7)//8;offset=rect_bytes+4
filtered=[];preserved=[];count=0
for code,payload,original in tags(body[offset:]):
 cid=struct.unpack_from('<H',payload)[0] if code==39 else None
 if cid not in plans:filtered.append(original);preserved.append(original);continue
 keep=[];children=list(tags(payload[4:]));plan=plans[cid]
 assert len(children)==plan['tags']+1 and children[-1][0]==0,(cid,len(children),plan['tags'])
 for index,(child,content,tag_bytes) in enumerate(children):
  if index in plan['removed']:
   if child in [4,26,70,94]:count+=1
   continue
  keep.append(tag_bytes)
  if child==1:break
 # This pipeline exports static frame1. Later stage motion must not enlarge
 # its raster bounds and shift the frame1 art away from collision geometry.
 filtered.append(encode(code,payload[:2]+struct.pack('<H',1)+b''.join(keep)+b'\0\0'))
assert count>=len(removed),(count,len(removed))
result=body[:offset]+b''.join(filtered)
(cache/'game.swf').write_bytes(b'CWS'+raw[3:4]+struct.pack('<I',len(result)+8)+zlib.compress(result,9))
actual_preserved=[original for code,payload,original in tags(result[offset:]) if code!=39 or struct.unpack_from('<H',payload)[0] not in plans]
assert actual_preserved==preserved
record={'sourceSwfSha256':hashlib.sha256(raw).hexdigest(),'visibilitySource':'__Packages/World.as constructor','visibilitySourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'hiddenPrefixes':prefixes,'removedStagePlacements':removed,'removedPlacementCallbacks':count,'preservedNonStageTagsSha256':hashlib.sha256(b''.join(preserved)).hexdigest(),'method':'Read original helper names/frame-aware display-list lifetimes from XML, remove hidden stage placement tags directly from the original SWF binary, and retain only stage frame1 for static export bounds. All non-stage tags and visible first-frame tags preserve their original bytes. Original XML remains the collision/spawn source; no XML recompilation, raster masking or painted-over shapes. This does not restore animated stage timelines.'}
(cache/'visibility.json').write_text(json.dumps(record,indent=2)+'\n','utf8')
print('Applied original visibility to',len(removed),'helper placements across four stages.')
