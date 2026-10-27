"""Describe original projectile, item, shield and effect timelines for capture."""
from pathlib import Path
import csv,hashlib,json,re,runpy
root=Path(__file__).resolve().parents[1];base=runpy.run_path(str(root/'scripts/prepare-brawler-art-cases.py'));defs=base['defs'];envelope=base['envelope'];folders=base['folders'];cache=root/'artifacts/brawler-native-reference'
symbols={name:int(cid) for cid,name in csv.reader((root/'artifacts/brawler-original/symbolClass/symbols.csv').read_text('utf8').splitlines(),delimiter=';')}
wanted=['EnergyBall','Poop','Pencil','Garbage','Bullet','Rocket','Mine','Grenade','Shield','Spawn1','Spawn2','Puff','PunchDamage','BoomStar','BoomWave','BoomMatter','PlayerDeath']
fixed=['Garbage','Mine','Grenade','Shield'];jobs=[];objects={}
for name in wanted:
 cid=symbols[name];tag=defs[cid];frames=int(tag.get('frameCount'));labels={};frame=1
 for t in tag.find('subTags'):
  if t.get('type')=='FrameLabelTag':labels[t.get('name')]=frame
  elif t.get('type')=='ShowFrameTag':frame+=1
 script=folders.get(cid);first=(script/'frame_1/DoAction.as') if script else None;s=first.read_text('utf8') if first and first.exists() else '';stop=bool(re.search(r'(?m)^stop\(\);',s));count=max(90,frames+2)
 objects[name]={'symbol':cid,'frames':frames,'labels':labels,'fixed':name in fixed,'firstFrameStops':stop,'envelope':envelope(cid),'firstFrameScriptSha256':hashlib.sha256(s.encode()).hexdigest()}
 for variant in range(1,frames+1) if name in fixed else [1]:jobs.append({'name':name,'variant':variant,'frames':count,'play':name not in fixed and not stop,'envelope':envelope(cid),'spawnType':2 if name=='Spawn2' else 1})
data={'sourceSwfSha256':base['data']['sourceSwfSha256'],'fps':30,'objects':objects,'jobs':jobs};(cache/'object-cases.json').write_text(json.dumps(data,indent=2)+'\n','utf8');print('Prepared',len(jobs),'original object/effect native playback jobs.')
visited=set();timed=[];script_hashes={}
def inspect(cid):
 if cid in visited:return
 visited.add(cid);tag=defs.get(cid)
 if tag is None or tag.get('type')!='DefineSpriteTag':return
 if cid in folders:
  for p in folders[cid].glob('frame_*/DoAction.as'):
   s=p.read_text('utf8');script_hashes[str(p.relative_to(root)).replace('\\','/')]=hashlib.sha256(p.read_bytes()).hexdigest()
   if re.search(r'\b(getTimer|setInterval|setTimeout)\s*\(',s):timed.append(str(p.relative_to(root)))
 for t in tag.find('subTags'):
  if t.get('characterId'):inspect(int(t.get('characterId')))
for name in wanted:inspect(symbols[name])
assert not timed,('wall-clock graphic scripts require real-time capture',timed)
(cache/'object-timing-audit.json').write_text(json.dumps({'originalFps':30,'exportFps':10,'method':'Graphic subtrees have no getTimer/setInterval/setTimeout frame scripts; linked object constructors only call super and init methods are not invoked by the art capture. Slow export cadence preserves per-frame artwork; it is replayed at the original30FPS.','scriptHashes':script_hashes},indent=2)+'\n','utf8');print('Audited',len(script_hashes),'graphic frame scripts for export-cadence independence.')
