"""Pack measured original projectile/item/effect films; replay at source 30fps."""
from pathlib import Path
import json,hashlib,struct
from PIL import Image
root=Path(__file__).resolve().parents[1];cache=root/'artifacts/brawler-native-reference';out=root/'public/expanded/assets/brawler/native';out.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
manifest=cache/'object-capture-10fps.json';capture=json.loads(manifest.read_text('utf8'));audit=json.loads((cache/'object-timing-audit.json').read_text('utf8'));spec=json.loads((cache/'object-cases.json').read_text('utf8'))
groups={}
for info in capture['batches']:
 p=cache/'object-captures-10fps'/info['file'];assert sha(p.read_bytes())==info['sha256'];batch=json.loads(p.read_text('utf8'))
 for shot in batch['shots']:
  file=p.parent/shot['file'];assert sha(file.read_bytes())==shot['sha256'];image=Image.open(file).convert('RGBA');assert image.size==(batch['width'],batch['height'])
  for i,job in enumerate(batch['jobs']):
   placement=batch['placements'][i];x,y,w,h=placement['cell'];tile=image.crop((x,y,x+w,y+h));b=tile.getbbox();group=groups.setdefault(job['name'],{'images':{},'variants':{}})
   if b:
    assert b[0]>0 and b[1]>0 and b[2]<w and b[3]<h,(job,shot['age'],b)
    tile=tile.crop(b);offset=[x+b[0]-placement['origin'][0],y+b[1]-placement['origin'][1]];digest=sha(struct.pack('<II',*tile.size)+tile.tobytes());group['images'].setdefault(digest,tile)
   else:digest=None;offset=[0,0]
   group['variants'].setdefault(str(job['variant']),[]).append({'digest':digest,'offset':offset,'native':shot['poses'][i]})
data={'sourceSwfSha256':capture['input']['sourceSwfSha256'],'animationFps':30,'objects':{}};files={}
for name,group in sorted(groups.items()):
 rects={};cx=cy=rh=0;width=max(1024,max((im.width+4 for im in group['images'].values()),default=1))
 for digest,im in sorted(group['images'].items(),key=lambda kv:(-kv[1].height,-kv[1].width,kv[0])):
  w,h=im.size;assert w+4<=width
  if cx+w+4>width:cx=0;cy+=rh;rh=0
  rects[digest]=[cx+2,cy+2,w,h];cx+=w+4;rh=max(rh,h+4)
 height=max(1,cy+rh);assert height<=16384,(name,height)
 sheet=Image.new('RGBA',(width,height))
 for digest,im in group['images'].items():sheet.paste(im,tuple(rects[digest][:2]))
 filename=name+'-object.png';sheet.save(out/filename);files[filename]={'sha256':sha((out/filename).read_bytes()),'size':list(sheet.size)}
 data['objects'][name]={'sheet':filename,'frames':spec['objects'][name]['frames'],'labels':spec['objects'][name]['labels'],'variants':{key:[{'art':(rects[f['digest']] if f['digest'] else [0,0,0,0])+f['offset'],'native':f['native']} for f in frames] for key,frames in group['variants'].items()}}
encoded=json.dumps(data,separators=(',',':'))+'\n';(out/'objects.json').write_text(encoded,'utf8');(root/'src/expanded/brawler-native-objects.json').write_text(encoded,'utf8')
provenance={'sourceSwfSha256':data['sourceSwfSha256'],'captureManifestSha256':sha(manifest.read_bytes()),'input':capture['input'],'ruffle':capture['ruffle'],'chrome':capture['chrome'],'timingAudit':audit,'files':files,'dataSha256':sha(encoded.encode()),'method':'Original raw symbol timelines and frame scripts captured transparently one frame per step. Export cadence10fps avoids render catchup; all captured graphic descendants are audited free of getTimer/setInterval/setTimeout and replay at original30fps. Gameplay physics/init is implemented separately; raw-art fixtures do not constitute whole-game equivalence.'}
(out/'objects-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n','utf8');print('Packed',len(groups),'native object/effect sheets.')
