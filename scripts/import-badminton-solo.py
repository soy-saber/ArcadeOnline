"""Export original solo CPU/robot bodies and complete root-filtered racket tracks."""
from pathlib import Path
from PIL import Image
import argparse,copy,hashlib,json,math,os,re,struct,subprocess
import xml.etree.ElementTree as ET
from badminton_export import filter_padding

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--ffdec');parser.add_argument('--cached',action='store_true');args=parser.parse_args()
source=ROOT/'games/46923/game.swf';xml=ROOT/'artifacts/swf-analysis/46923/game.xml'
tree=ET.parse(xml);root=tree.getroot();tags=root.find('tags');cache=ROOT/'artifacts/badminton-solo-art';cache.mkdir(parents=True,exist_ok=True)
symbols={int(e.get('spriteId')):e for e in root.iter() if e.get('type')=='DefineSpriteTag'}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
identity=[1,0,0,1,0,0]
def matrix(e):
    m=e.find('matrix')
    return identity[:] if m is None else [float(m.get('scaleX','1')),float(m.get('rotateSkew0','0')),float(m.get('rotateSkew1','0')),float(m.get('scaleY','1')),float(m.get('translateX','0'))/20,float(m.get('translateY','0'))/20]
def states(sid):
    display={};result=[];labels={}
    for e in symbols[sid].find('subTags'):
        k=e.get('type','');d=int(e.get('depth','0'))
        if k=='FrameLabelTag':labels[e.get('name')]=len(result)+1
        elif k.startswith('PlaceObject'):
            old=copy.deepcopy(display[d]) if e.get('placeFlagMove')=='true' else ET.Element('item')
            old.attrib.update(e.attrib)
            for c in e:
                prior=old.find(c.tag)
                if prior is not None:old.remove(prior)
                old.append(copy.deepcopy(c))
            old.set('placeFlagMove','false');display[d]=old
        elif k.startswith('RemoveObject'):display.pop(d,None)
        elif k=='ShowFrameTag':result.append(copy.deepcopy(display))
    assert len(result)==int(symbols[sid].get('frameCount'));return result,labels
timelines={sid:states(sid)[0] for sid in symbols}
named=lambda display,name:next(e for e in display.values() if e.get('name')==name)
f32=lambda x:struct.unpack('<f',struct.pack('<f',x))[0]
def native(m):return [*map(f32,m[:4]),round(m[4]*20),round(m[5]*20)]
def concat(a,b):
    add=lambda x,y:f32(f32(x)+f32(y))
    return [add(a[0]*b[0],a[2]*b[1]),add(a[1]*b[0],a[3]*b[1]),add(a[0]*b[2],a[2]*b[3]),add(a[1]*b[2],a[3]*b[3]),round(add(a[0]*b[4],a[2]*b[5]))+a[4],round(add(a[1]*b[4],a[3]*b[5]))+a[5]]
def point(m,x,y):return [round(f32(f32(m[0]*x)+f32(m[2]*y)))+m[4],round(f32(f32(m[1]*x)+f32(m[3]*y)))+m[5]]
def geometry(gun):
    result=[]
    for frame,display in enumerate(timelines[int(gun.get('characterId'))],1):
        outer=named(display,'racket');inner=named(timelines[int(outer.get('characterId'))][0],'racket');leaf=named(timelines[int(inner.get('characterId'))][0],'hitbox')
        assert leaf.get('characterId')=='119'
        m=native(matrix(leaf))
        for e in [inner,outer,gun]:m=concat(native(matrix(e)),m)
        points=[point(m,x,y) for x in [-210,210] for y in [-210,210]];local=native(matrix(outer))
        result.append({'frame':frame,'rotation':math.degrees(math.atan2(local[1],local[0])),'twips':[min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)],'matrix':m,'active':2<=frame<=8 or 16<=frame<=22})
    return result

# Freeze the human and CPU2 faces at their normal script-selected frame1.
# Every other CPU face/headgear retains its native static layers.
for face_id in [276,265]:
    face=symbols[face_id];first=[]
    for e in face.find('subTags'):
        if e.get('type') not in ['DoActionTag','UnknownTag']:first.append(copy.deepcopy(e))
        if e.get('type')=='ShowFrameTag':break
    face.find('subTags').clear();face.find('subTags').extend(first);face.set('frameCount','1')

exports={};dedup={};next_id=5200
def wrapper(layers,count,name):
    global next_id
    key=(count,tuple(ET.tostring(e,encoding='unicode') for e in layers))
    if key in dedup:return dedup[key]
    sid=next_id;next_id+=1;dedup[key]=sid
    sprite=ET.Element('item',{'type':'DefineSpriteTag','spriteId':str(sid),'frameCount':str(count),'forceWriteAsLong':'true'});sub=ET.SubElement(sprite,'subTags');sub.extend(copy.deepcopy(layers))
    for _ in range(count):ET.SubElement(sub,'item',{'type':'ShowFrameTag'})
    tags.insert(len(tags)-1,sprite);exports[sid]={'file':name+'.png','frames':count};return sid

actors={}
for name,sid in [('p1',306),('p2',268),('cpu-1',268),('cpu-2',267),('cpu-3',261),('cpu-4',255),('cpu-5',248),('cpu-6',242),('robot',271)]:
    displays,labels=states(sid);poses={};gun=named(displays[0],'gun');serve=named(displays[0],'gunServe')
    for motion,frame in labels.items():
        d=displays[frame-1]
        for key,original in [('gun',gun),('gunServe',serve)]:assert ET.tostring(named(d,key))==ET.tostring(original),(name,motion,key)
        if name not in ['p1','p2']:
            layers=[e for depth,e in sorted(d.items()) if e.get('name') not in ['gun','gunServe']]
            assert all(int(e.get('depth'))>int(gun.get('depth')) for e in layers)
            body=next((e for e in layers if e.get('name')=='hero'),None);child=int(body.get('characterId')) if body is not None else None
            count=int(symbols[child].get('frameCount')) if child in symbols else 1
            wid=wrapper(layers,count,name+'-body-'+motion)
            poses[motion]={'rootFrame':frame,'bodySymbol':child,'playing':child!=305 and count>1,'export':wid,'layers':[ET.tostring(e,encoding='unicode').strip() for e in layers]}
    ordinary=wrapper([gun],len(timelines[int(gun.get('characterId'))]),name+'-racket-swing');serving=wrapper([serve],len(timelines[int(serve.get('characterId'))]),name+'-racket-serve')
    release=[]
    for frame,d in enumerate(timelines[int(serve.get('characterId'))],1):
        m=concat(native(matrix(serve)),native(matrix(named(d,'mc'))));release.append({'frame':frame,'x':m[4]/20,'y':m[5]/20})
    actors[name]={'symbol':sid,'depth':139969 if name=='robot' else 59999 if name=='p1' else 59998,'poses':poses,'racket':{'swing':ordinary,'serve':serving},'hitboxes':geometry(gun),'service':release}

# Native robot trail13 retains its own child matrix and blur.
exports[13]={'file':'robot-trail.png','frames':1}
expanded=cache/'solo.xml';tree.write(expanded,encoding='utf-8',xml_declaration=True)
if not args.cached:
    candidates=[Path(p) for p in [args.ffdec,os.environ.get('FFDEC_JAR')] if p]+[Path(os.environ.get('LOCALAPPDATA',''))/'Temp/opencode/4399/ffdec/ffdec.jar']
    jar=next((p for p in candidates if p.is_file()),None)
    if jar is None:raise SystemExit('Set --ffdec or FFDEC_JAR')
    def ff(a,name):
        with (cache/(name+'.log')).open('w',encoding='utf-8') as log:subprocess.run(['java','-jar',str(jar),*map(str,a)],cwd=ROOT,check=True,stdout=log,stderr=subprocess.STDOUT)
    swf=cache/'solo.swf';ff(['-xml2swf',expanded,swf],'solo-swf');selection=','.join(map(str,exports))
    for kind,options in [('png',[]),('svg',['-format','sprite:svg'])]:ff([*options,'-selectid',selection,'-export','sprite',cache/kind,swf],kind+'-export')

out=ROOT/'public/authority/assets/badminton';export_symbols={int(e.get('spriteId')):e for e in root.iter() if e.get('type')=='DefineSpriteTag'}
for wid,meta in exports.items():
    pngdir=next((cache/'png').glob(f'DefineSprite_{wid}*'));svgdir=next((cache/'svg').glob(f'DefineSprite_{wid}*'));images=[Image.open(pngdir/f'{f}.png').convert('RGBA') for f in range(1,meta['frames']+1)]
    w,h=images[0].size;assert all(im.size==(w,h) for im in images)
    offsets=[]
    for f in range(1,meta['frames']+1):
        svg=ET.parse(svgdir/f'{f}.svg').getroot();g=svg.find('{http://www.w3.org/2000/svg}g');m=[float(v) for v in re.search(r'matrix\(([^)]+)\)',g.get('transform'))[1].replace(',',' ').split()]
        assert m[:4]==[1,0,0,1];offsets.append([-m[4],-m[5]])
    assert all(p==offsets[0] for p in offsets)
    padding=filter_padding(wid,export_symbols);sheet=Image.new('RGBA',(w*len(images),h))
    for f,im in enumerate(images):sheet.alpha_composite(im,(f*w,0))
    target=out/meta['file'];sheet.save(target);meta.update({'w':w,'h':h,'x':offsets[0][0]-padding[0],'y':offsets[0][1]-padding[1],'svgX':offsets[0][0],'svgY':offsets[0][1],'filterPadding':padding,'sha256':sha(target),'frameSha256':[hashlib.sha256(im.tobytes()).hexdigest() for im in images]})
sounds={}
for key,filename in [('sigh','312_sigh.mp3.mp3'),('next','111_shotgun.mp3.mp3')]:
    original=ROOT/'artifacts/swf-analysis/46923/sounds'/filename;target=ROOT/'public/authority/assets'/('badminton-'+key+'.mp3');target.write_bytes(original.read_bytes())
    sounds[key]={'source':'artifacts/swf-analysis/46923/sounds/'+filename,'path':target.relative_to(ROOT).as_posix(),'sha256':sha(target),'method':'Unmodified original JPEXS MP3 export.'}
record={'source':'games/46923/game.swf','sourceSha256':sha(source),'xmlSha256':sha(xml),'method':'Original human/two-player, six CPU skins and mouse robot. Complete root-filtered racket placements and original body labels; original PNG/SVG export, f32/twip hitbox composition, native service markers and PNG filter-padding registration. Static raster export; runtime/reference equivalence checked separately.','actors':actors,'exports':exports,'sounds':sounds}
(ROOT/'src/badminton/solo-art.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
collisions={}
for e in tags:
    if e.get('name') not in ['leftWall','rightWall','netLimit']:continue
    a,b,c,d,tx,ty=native(matrix(e));det=f32(f32(a*d)-f32(b*c));inverse=[f32(d/det),f32(b/-det),f32(c/-det),f32(a/det),round(f32(f32(f32(d*tx)-f32(c*ty))/-det)),round(f32(f32(f32(b*tx)-f32(a*ty))/det))]
    points=[point([a,b,c,d,tx,ty],x,y) for x in [-210,210] for y in [-210,210]]
    collisions[e.get('name')]={'matrix':[a,b,c,d,tx,ty],'inverse':inverse,'bounds':[min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]}
markers={}
for e in tags:
    if e.get('name') in ['gunnerPoint','gunnerPoint2','servingSpot1','servingSpot2','servingSpot3']:
        m=native(matrix(e));markers[e.get('name')]={'x':m[4]/20,'y':m[5]/20}
physics={'sourceSha256':sha(source),'actors':{name:{k:m[k] for k in ['symbol','depth','hitboxes','service']} for name,m in actors.items()},'collisions':collisions,'markers':markers}
(ROOT/'src/badminton/actor-geometry.json').write_text(json.dumps(physics,indent=2)+'\n',encoding='utf-8')
print('Imported',len(actors),'actor profiles,',len(exports),'native sheets and',sum(m['frames'] for m in exports.values()),'frames.')
