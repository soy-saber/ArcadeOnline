"""Describe every authored fighter pose/frame and original child frame commands."""
from pathlib import Path
import functools,hashlib,json,re,xml.etree.ElementTree as ET
from PIL import Image
root=Path(__file__).resolve().parents[1];cache=root/'artifacts/brawler-native-reference';tree=ET.parse(root/'artifacts/brawler-original/game.xml').getroot()
defs={int(t.get('spriteId') or t.get('shapeId') or t.get('characterId') or t.get('bitmapId')):t for t in tree.find('tags') if (t.get('spriteId') or t.get('shapeId') or t.get('characterId') or t.get('bitmapId')) and t.get('type','').startswith('Define')}
def matrix(t):
 m=t.find('matrix')
 return [float(m.get('scaleX','1')),float(m.get('rotateSkew0','0')),float(m.get('rotateSkew1','0')),float(m.get('scaleY','1')),float(m.get('translateX','0'))/20,float(m.get('translateY','0'))/20] if m is not None else [1,0,0,1,0,0]
def transformed(b,m):
 points=[(m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]) for x,y in [(b[0],b[1]),(b[2],b[1]),(b[0],b[3]),(b[2],b[3])]]
 return [min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]
@functools.lru_cache(None)
def envelope(cid):
 t=defs[cid];bounds=[]
 for key in ['shapeBounds','startBounds','endBounds']:
  r=t.find(key)
  if r is not None:bounds.append([float(r.get(k))/20 for k in ['Xmin','Ymin','Xmax','Ymax']])
 if t.get('type')=='DefineSpriteTag':
  display={}
  for p in t.find('subTags'):
   kind=p.get('type','');depth=p.get('depth')
   if kind.startswith('PlaceObject'):
    old=display.get(depth,{}) if p.get('placeFlagMove')=='true' else {};old.update(p.attrib)
    if p.find('matrix') is not None:old['_matrix']=matrix(p)
    display[depth]=old
    if old.get('characterId') and int(old['characterId']) in defs:
     b=envelope(int(old['characterId']))
     if b:bounds.append(transformed(b,old.get('_matrix',[1,0,0,1,0,0])))
   elif kind.startswith('RemoveObject'):display.pop(depth,None)
 if not bounds:return None
 return [min(b[0] for b in bounds),min(b[1] for b in bounds),max(b[2] for b in bounds),max(b[3] for b in bounds)]
scripts=root/'artifacts/all-games-audit/6232/scripts';folders={}
for p in scripts.glob('DefineSprite_*'):
 m=re.match(r'DefineSprite_(\d+)(?:_|$)',p.name)
 if m:folders[int(m[1])]=p
fighters={};cases=[];playback=[]
hidden={'CoffeePlayer':{'specialGround':['bullet','poop'],'specialAir':['bullet','poop']},'AuberginePlayer':{'specialGround':['pencil'],'specialAir':['pencil']},'TrashPlayer':{'specialGround':['garbage'],'specialAir':['garbage']},'PeachPlayer':{'specialGround':['bullet'],'specialAir':['bullet'],'specialUp':['rocket']}}
for cid,name in [(685,'DefaultPlayer'),(302,'CoffeePlayer'),(115,'AuberginePlayer'),(208,'SBLPlayer'),(409,'TrashPlayer'),(544,'PeachPlayer')]:
 poses={};frame=1;display={};label=None
 for t in defs[cid].find('subTags'):
  kind=t.get('type')
  if kind=='FrameLabelTag':label=t.get('name')
  elif kind.startswith('PlaceObject'):
   depth=t.get('depth');value=display.setdefault(depth,{}) if t.get('placeFlagMove')=='true' else {};value.update(t.attrib)
   if t.find('matrix') is not None:value['_matrix']=matrix(t)
   display[depth]=value
  elif kind.startswith('RemoveObject'):display.pop(t.get('depth'),None)
  elif kind=='ShowFrameTag':
   child=next(iter(display.values()),{});symbol=int(child['characterId']) if child else None;count=int(defs[symbol].get('frameCount')) if symbol else 0;commands={};source_hashes={}
   if symbol in folders:
    for p in folders[symbol].glob('frame_*/DoAction.as'):
     n=int(p.parent.name[6:]);s=p.read_text('utf8');ops=[]
     for m in re.finditer(r'(?m)^\s*(gotoAndPlay\((\d+)\)|gotoAndStop\((\d+)\)|(stop|play)\(\));',s):
      if m[2]:ops.append({'goto':int(m[2]),'play':True})
      elif m[3]:ops.append({'goto':int(m[3]),'play':False})
      else:ops.append({'play':m[4]=='play'})
     if ops:commands[str(n)]=ops
     source_hashes[str(n)]=hashlib.sha256(p.read_bytes()).hexdigest()
   b=envelope(symbol) if symbol else None;transform=child.get('_matrix',[1,0,0,1,0,0]);bound=transformed(b,transform) if b else [0,0,0,0]
   poses[label]={'rootFrame':frame,'symbol':symbol,'instance':child.get('name'),'frames':count,'commands':commands,'sourceFrameScriptHashes':source_hashes,'envelope':bound,'transform':transform}
   for color in ['red','blue','green','orange']:
    for variant,mask in [('normal',[])]+([('emitted',hidden[name][label])] if label in hidden.get(name,{}) else []):
     playback.append({'fighter':name,'pose':label,'frames':count,'color':color,'variant':variant,'hidden':mask,'envelope':bound})
     for f in range(1,max(1,count)+1):cases.append({'fighter':name,'pose':label,'frame':f,'color':color,'variant':variant,'hidden':mask})
   frame+=1
 fighters[name]={'symbol':cid,'poses':poses}
data={'sourceSwfSha256':hashlib.sha256((root/'games/6232/game.swf').read_bytes()).hexdigest(),'animationFps':float(tree.get('frameRate')),'logicIntervalMs':25,'fighters':fighters,'cases':cases,'playback':playback}
(cache/'art-cases.json').write_text(json.dumps(data,indent=2)+'\n','utf8')
im=Image.open(cache/'native-preview.png');print('Preview',im.mode,im.size,'corner',im.getpixel((0,0)),'visible bbox',im.getbbox());print('Prepared',len(cases),'native pose/color/visibility frame captures.')
print('Natural playback jobs',len(playback),'largest envelope',max((p['envelope'][2]-p['envelope'][0],p['envelope'][3]-p['envelope'][1],p['fighter'],p['pose']) for p in playback))
