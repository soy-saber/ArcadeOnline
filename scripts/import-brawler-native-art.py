"""Pack original AVM1-rendered frames, preserving their measured origins/bounds."""
from pathlib import Path
import hashlib,json,math,struct
from PIL import Image
root=Path(__file__).resolve().parents[1];cache=root/'artifacts/brawler-native-reference';spec=json.loads((cache/'art-cases.json').read_text('utf8'));capture=json.loads((cache/'capture.json').read_text('utf8'));out=root/'public/expanded/assets/brawler/native';out.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
assert capture['specSha256']==sha((cache/'art-cases.json').read_bytes())
groups={};observations=[];geometries=[];geometry_ids={};sequences={};aliases=[]
def geometry(row):
 obj={'bounds':row[6:10],'marks':row[10],'transform':row[11:15]};key=json.dumps(obj,separators=(',',':'),sort_keys=True)
 if key not in geometry_ids:geometry_ids[key]=len(geometries);geometries.append(obj)
 return geometry_ids[key]
for info in capture['batches']:
 p=cache/'captures'/info['file'];assert sha(p.read_bytes())==info['sha256'];batch=json.loads(p.read_text('utf8'));assert batch['complete']
 for i,job in enumerate(batch['jobs']):sequences['/'.join([job['fighter'],job['pose'],job['color'],job['variant']])]=[s['frames'][i] for s in batch['samples']]
 for shot in batch['shots']:
  file=cache/'captures'/shot['file'];assert sha(file.read_bytes())==shot['sha256'];image=Image.open(file).convert('RGBA');assert image.size==(batch['width'],batch['height'])
  for c in shot['captures']:
   i=c['index'];job=batch['jobs'][i];placement=batch['placements'][i];x,y,w,h=placement['cell'];tile=image.crop((x,y,x+w,y+h));b=tile.getbbox();frame=c['frame'];g=geometry(c['pose'])
   for hidden in job['hidden']:
    props=c['pose'][10].get(hidden)
    if props is not None:assert props[7] is False,(job,frame,hidden,props)
   if b:
    assert b[0]>0 and b[1]>0 and b[2]<w and b[3]<h,('capture touches cell edge',job,frame,b,placement)
    tile=tile.crop(b);dx=x+b[0]-placement['origin'][0];dy=y+b[1]-placement['origin'][1];digest=sha(struct.pack('<II',*tile.size)+tile.tobytes())
   else:tile=None;dx=dy=0;digest=None
   group=groups.setdefault((job['fighter'],job['color']),{'images':{},'poses':{}})
   if tile is not None:group['images'].setdefault(digest,tile)
   frames=group['poses'].setdefault((job['pose'],job['variant']),{});assert frame not in frames
   frames[frame]={'digest':digest,'offset':[dx,dy],'geometry':g}
   observations.append({'fighter':job['fighter'],'pose':job['pose'],'color':job['color'],'variant':job['variant'],'frame':frame,'geometry':g,'pixelSha256':digest,'offset':[dx,dy],'size':list(tile.size) if tile is not None else [0,0]})
data={'sourceSwfSha256':spec['sourceSwfSha256'],'animationFps':spec['animationFps'],'logicIntervalMs':spec['logicIntervalMs'],'colors':['red','blue','green','orange'],'geometry':geometries,'fighters':{}}
files={}
for (fighter,color),group in sorted(groups.items()):
 rects={};cursor_x=cursor_y=row_h=0;atlas_width=1024
 for digest,im in sorted(group['images'].items(),key=lambda kv:(-kv[1].height,-kv[1].width,kv[0])):
  w,h=im.size;assert w+4<=atlas_width
  if cursor_x+w+4>atlas_width:cursor_x=0;cursor_y+=row_h;row_h=0
  rects[digest]=[cursor_x+2,cursor_y+2,w,h];cursor_x+=w+4;row_h=max(row_h,h+4)
 atlas_height=max(1,cursor_y+row_h);assert atlas_height<=8192,(fighter,atlas_height)
 sheet=Image.new('RGBA',(atlas_width,atlas_height))
 for digest,im in group['images'].items():sheet.paste(im,tuple(rects[digest][:2]))
 name=fighter+'-'+color+'.png';sheet.save(out/name);files[name]={'sha256':sha((out/name).read_bytes()),'size':list(sheet.size),'bytes':(out/name).stat().st_size}
 model=data['fighters'].setdefault(fighter,{'sheets':{},'poses':{}});model['sheets'][color]=name
 for (pose,variant),frames in group['poses'].items():
  definition=spec['fighters'][fighter]['poses'][pose];count=definition['frames'];record=model['poses'].setdefault(pose,{k:definition[k] for k in ['rootFrame','frames','commands']});target=record.setdefault('art',{}).setdefault(color,{})
  def resolve(frame,seen=None):
   if frame in frames:return frame
   seen=set() if seen is None else set(seen);assert frame not in seen,('unresolved frame command cycle',fighter,pose,frame);seen.add(frame)
   commands=definition['commands'].get(str(frame),[]);goto=next((c['goto'] for c in reversed(commands) if 'goto' in c),None)
   assert goto is not None,('missing native frame without a source goto',fighter,pose,color,variant,frame,sorted(frames))
   result=resolve(max(1,min(count,goto)),seen);aliases.append([fighter,pose,color,variant,frame,result]);return result
  entries=[]
  for frame in range(1,max(1,count)+1):
   f=frames[resolve(frame) if count else 0];rect=rects[f['digest']] if f['digest'] else [0,0,0,0];entries.append(rect+f['offset']+[f['geometry']])
  target[variant]=entries
public=json.dumps(data,separators=(',',':'),ensure_ascii=False)+'\n';(out/'data.json').write_text(public,'utf8');(root/'src/expanded/brawler-native-art.json').write_text(public,'utf8')
reference={'sourceSwfSha256':spec['sourceSwfSha256'],'input':capture['input'],'ruffle':capture['ruffle'],'chrome':capture['chrome'],'captureManifestSha256':sha((cache/'capture.json').read_bytes()),'specSha256':capture['specSha256'],'observations':observations,'geometry':geometries,'playback':sequences,'sourceGotoAliases':aliases}
(cache/'art-reference.json').write_text(json.dumps(reference,indent=2)+'\n','utf8')
provenance={k:reference[k] for k in ['sourceSwfSha256','input','ruffle','chrome','captureManifestSha256','specSha256']};provenance.update(method='Unmodified original class/symbol/nested timeline bytes executed in isolated AVM1; natural child playback stepped one animation frame at a time, including original color scripts and measured bounds. Only external root capture/visibility controls replace entry flow. PNG tiles are extracted from transparent native renderer captures and packed with measured origins; no redrawn characters or invented animation frames. Root goto-only frames alias their source destination. This does not execute the complete game world or claim Adobe Flash pixel equivalence.',cases=len(spec['playback']),observations=len(observations),geometryEntries=len(geometries),sourceGotoAliases=len(aliases),files=files,dataSha256=sha(public.encode()))
(out/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n','utf8');print('Packed',len(observations),'native visible-frame observations and',len(aliases),'source-goto aliases into',len(files),'sheets;',sum(f['bytes'] for f in files.values()),'PNG bytes.')
