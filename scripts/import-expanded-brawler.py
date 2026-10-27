"""Recover static stage placements and sprite bounds from FFDec XML; never execute SWF."""
import json, pathlib, xml.etree.ElementTree as ET, shutil, hashlib,sys,math
from PIL import Image
root = pathlib.Path(__file__).resolve().parents[1]
stages_only='--stages-only' in sys.argv
swf = root / 'games/6232/game.swf'
xml = ET.parse(root / 'artifacts/brawler-original/game.xml').getroot()
tags = xml.find('tags')
defs = {}
for item in tags:
    cid = item.get('spriteId') or item.get('shapeId') or item.get('characterId') or item.get('bitmapId')
    if cid and item.get('type', '').startswith('Define'):
        defs[int(cid)] = item
def matrix(item):
    m = item.find('matrix')
    if m is None: return [1,0,0,1,0,0]
    return [float(m.get('scaleX', '1')),float(m.get('rotateSkew0', '0')),float(m.get('rotateSkew1', '0')),float(m.get('scaleY', '1')),float(m.get('translateX', '0'))/20,float(m.get('translateY', '0'))/20]
def apply(m, x, y): return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]
def bounds(cid, seen=None, visible=False):
    seen=set() if seen is None else set(seen)
    if cid in seen or cid not in defs: return None
    seen.add(cid)
    tag=defs[cid]
    r=tag.find('shapeBounds')
    if r is not None: return [float(r.get(k))/20 for k in ['Xmin','Ymin','Xmax','Ymax']]
    if tag.get('type')=='DefineSpriteTag':
        points=[]
        for p in first_frame(cid):
            if visible and cid in [726,832,873,886] and p.get('name','').startswith(('Fixed','Moving','AI','Boom','SpawnH','Killer')):continue
            if not p.get('characterId'):continue
            b=bounds(int(p.get('characterId')),seen,visible)
            if not b:continue
            m=matrix(p)
            points.extend(apply(m,x,y) for x,y in [(b[0],b[1]),(b[2],b[1]),(b[0],b[3]),(b[2],b[3])])
        if points:return [min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]
    return None
def first_frame(cid):
    out=[]
    tag=defs[cid]
    sub = tag.find('subTags')
    for p in list(sub) if sub is not None else []:
        if p.get('type')=='ShowFrameTag':break
        if p.get('type','').startswith('PlaceObject'):out.append(p)
    return out
out = root / 'public/expanded/assets/brawler'
out.mkdir(parents=True, exist_ok=True)
stages=[];rasters=[]
for cid,bgid,name,label,kill in [(726,732,'Rooftop','屋顶',[-50,-200,1150,500]),(832,838,'Mogadishu','城市',[-1000,-200,1700,500]),(873,875,'B52','轰炸机',[-50,-300,1150,400]),(886,901,'Space','太空',[-900,-500,800,700])]:
    platforms=[];spawns=[];item_spawns=[];helpers=[]
    for p in first_frame(cid):
        pname=p.get('name','')
        if not p.get('characterId'):continue
        b=bounds(int(p.get('characterId')))
        m=matrix(p)
        if pname.startswith('SpawnP'):spawns.append({'name':pname,'x':m[4],'y':m[5]})
        if pname.startswith('SpawnH') and b:
            item_spawns.append({'name':pname,'x':m[4],'y':m[5],'w':abs((b[2]-b[0])*m[0]),'h':abs((b[3]-b[1])*m[3])})
        if b and pname.startswith(('Boom','Killer')):
            points=[apply(m,x,y) for x,y in [(b[0],b[1]),(b[2],b[1]),(b[0],b[3]),(b[2],b[3])]]
            helpers.append({'name':pname,'x':min(x[0] for x in points),'y':min(x[1] for x in points),'w':max(x[0] for x in points)-min(x[0] for x in points),'h':max(x[1] for x in points)-min(x[1] for x in points),'floor':m[5],'type':'boom' if pname.startswith('Boom') else 'killer'})
        if not b or not (pname.startswith('Fixed') or pname.startswith('Moving')):continue
        points=[apply(m,x,y) for x,y in [(b[0],b[1]),(b[2],b[1]),(b[0],b[3]),(b[2],b[3])]]
        platforms.append({'id':len(platforms),'name':pname,'x':min(x[0] for x in points),'y':min(x[1] for x in points),'w':max(x[0] for x in points)-min(x[0] for x in points),'h':max(x[1] for x in points)-min(x[1] for x in points),'floor':m[5],'moving':pname.startswith('Moving')})
    for artid,artname in [(cid,name),(bgid,name+'_Background')]:
        if stages_only and artid==bgid:
            assert (out/(artname+'.png')).is_file(),'Use --all to import missing background/fighter assets.'
            continue
        shutil.copyfile(root / f'artifacts/brawler-visible-art/DefineSprite_{artid}_{artname}/1.png',out / (artname+'.png'))
        if artid==cid:
            image=Image.open(out/(artname+'.png'));crop=image.getbbox();assert crop is not None
            source_bounds=bounds(cid,visible=True);assert source_bounds
            size=[crop[2]-crop[0],crop[3]-crop[1]]
            assert abs(size[0]-(source_bounds[2]-source_bounds[0]))<4 and abs(size[1]-(source_bounds[3]-source_bounds[1]))<4,(name,size,source_bounds)
            origin=[math.floor(source_bounds[0]),math.floor(source_bounds[1])]
            raster_bounds=[*origin,origin[0]+size[0],origin[1]+size[1]]
            rasters.append({'id':name,'sourceFirstFrameBounds':source_bounds,'exportSize':list(image.size),'crop':list(crop),'rasterBounds':raster_bounds})
            image.crop(crop).save(out/(artname+'.png'))
    spawns.sort(key=lambda p:p['name'])
    assert len(spawns)==4 and len(item_spawns)==4
    stages.append({'id':name,'label':label,'platforms':platforms,'spawns':spawns,'itemSpawns':item_spawns,'helpers':helpers,'bounds':kill,'artBounds':raster_bounds,'backgroundBounds':bounds(bgid,visible=True)})
fighters=[]
for cid,name in [(685,'DefaultPlayer'),(302,'CoffeePlayer'),(115,'AuberginePlayer'),(208,'SBLPlayer'),(409,'TrashPlayer'),(544,'PeachPlayer')]:
    frames=[]
    for i in range(1,5):
        if not stages_only:
            shutil.copyfile(root / f'artifacts/brawler-visible-art/DefineSprite_{cid}_{name}/{i}.png',out / f'{name}-{i}.png')
            image = Image.open(out / f'{name}-{i}.png')
            image.crop(image.getbbox()).save(out / f'{name}-{i}.png')
        else:assert (out/f'{name}-{i}.png').is_file(),'Use --all to import missing background/fighter assets.'
        frames.append(f'{name}-{i}.png')
    fighters.append({'id':name,'frames':frames,'bounds':bounds(cid)})
data={'sha256':hashlib.sha256(swf.read_bytes()).hexdigest(),'stages':stages,'fighters':fighters}
(out / 'data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(root / 'src/expanded/brawler-data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
visibility=json.loads((root/'artifacts/brawler-visible/visibility.json').read_text('utf8'))
visibility['retainedExistingBackgroundsAndFighters']=stages_only
visibility['stageRasters']=rasters
visibility['rasterRegistration']='Crop first-frame transparent export padding (nested animation bounds may include other frames); draw at natural pixel size anchored to floor(original first-frame visible vector bounds). Raster/vector edge rounding is not a Flash pixel-equivalence claim.'
visibility['exports']={p.name:{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'size':list(Image.open(p).size)} for p in sorted(out.glob('*.png'))}
(out/'visibility.json').write_text(json.dumps(visibility,indent=2)+'\n','utf8')
print(json.dumps(data,ensure_ascii=False,indent=2))
