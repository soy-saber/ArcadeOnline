"""Export native badminton net frames, shuttle filter layers and trail sprite."""
from pathlib import Path
from PIL import Image
import argparse, copy, hashlib, json, math, os, re, subprocess
import xml.etree.ElementTree as ET
from badminton_export import filter_padding

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ffdec');parser.add_argument('--cached',action='store_true');args=parser.parse_args()
source=ROOT/'games/46923/game.swf';xml=ROOT/'artifacts/swf-analysis/46923/game.xml'
cache=ROOT/'artifacts/badminton-ball-art';cache.mkdir(parents=True,exist_ok=True)
tree=ET.parse(xml);root=tree.getroot();tags=root.find('tags')
symbols={int(e.get('spriteId')):e for e in root.iter() if e.get('type')=='DefineSpriteTag'}
net=next(e for e in tags if e.get('name')=='netSprite')
net_xml=ET.tostring(net,encoding='unicode').strip()
tags.remove(net) # The static court must not retain a second, frozen net.
wrapper=ET.Element('item',{'type':'DefineSpriteTag','spriteId':'5100','frameCount':'12','forceWriteAsLong':'true'})
sub=ET.SubElement(wrapper,'subTags');sub.append(copy.deepcopy(net))
for _ in range(12):ET.SubElement(sub,'item',{'type':'ShowFrameTag'})
tags.insert(len(tags)-1,wrapper)

filters=next(e for e in symbols[132].find('subTags') if e.get('name')=='bird').find('surfaceFilterList')
native_filters=[ET.tostring(f,encoding='unicode').strip() for f in filters]
shadow=next(f for f in filters if f.get('type')=='DROPSHADOWFILTER')
offset=[math.cos(float(shadow.get('angle')))*float(shadow.get('distance')),math.sin(float(shadow.get('angle')))*float(shadow.get('distance'))]
for sid,shadow_only in [(5101,False),(5102,True)]:
    sprite=copy.deepcopy(symbols[132]);sprite.set('spriteId',str(sid))
    fs=next(e for e in sprite.find('subTags') if e.get('name')=='bird').find('surfaceFilterList')
    drop=next(f for f in fs if f.get('type')=='DROPSHADOWFILTER')
    if shadow_only:
        drop.set('distance','0.0');drop.set('compositeSource','false')
    else:fs.remove(drop)
    tags.insert(len(tags)-1,sprite)

expanded=cache/'ball.xml';tree.write(expanded,encoding='utf-8',xml_declaration=True)
if not args.cached:
    candidates=[Path(p) for p in [args.ffdec,os.environ.get('FFDEC_JAR')] if p]+[ROOT/'artifacts/tools/ffdec/ffdec.jar',Path(os.environ.get('LOCALAPPDATA',''))/'Temp/opencode/4399/ffdec/ffdec.jar']
    jar=next((p for p in candidates if p.is_file()),None)
    if jar is None:raise SystemExit('Set --ffdec or FFDEC_JAR')
    def ff(arguments,name):
        with (cache/(name+'.log')).open('w',encoding='utf-8') as log:
            subprocess.run(['java','-jar',str(jar),*map(str,arguments)],cwd=ROOT,check=True,stdout=log,stderr=subprocess.STDOUT)
    swf=cache/'ball.swf';ff(['-xml2swf',expanded,swf],'ball-swf')
    for kind,options in [('png',[]),('svg',['-format','sprite:svg'])]:
        ff([*options,'-selectid','16,5100,5101,5102','-export','sprite',cache/kind,swf],kind+'-export')
    ff(['-select','38','-export','frame',cache/'court',swf],'court-export')

out=ROOT/'public/authority/assets/badminton';out.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
art={}
for name,sid,count in [('net',5100,12),('bird-glow',5101,1),('bird-shadow',5102,1),('trail',16,1)]:
    pngdir=next((cache/'png').glob(f'DefineSprite_{sid}*'));svgdir=next((cache/'svg').glob(f'DefineSprite_{sid}*'))
    images=[Image.open(pngdir/f'{f}.png').convert('RGBA') for f in range(1,count+1)]
    offsets=[]
    for f in range(1,count+1):
        g=ET.parse(svgdir/f'{f}.svg').getroot().find('{http://www.w3.org/2000/svg}g')
        m=[float(v) for v in re.search(r'matrix\(([^)]+)\)',g.get('transform'))[1].replace(',',' ').split()]
        assert m[:4]==[1,0,0,1];offsets.append([-m[4],-m[5]])
    w,h=images[0].size;assert all(im.size==(w,h) for im in images);assert all(p==offsets[0] for p in offsets)
    sheet=Image.new('RGBA',(w*count,h))
    for i,im in enumerate(images):sheet.alpha_composite(im,(i*w,0))
    target=out/(name+'.png');sheet.save(target)
    export_symbols={int(e.get('spriteId')):e for e in root.iter() if e.get('type')=='DefineSpriteTag'}
    padding=filter_padding(sid,export_symbols)
    art[name]={'symbol':425 if name=='net' else 132 if name.startswith('bird') else 16,'wrapper':sid,'file':target.name,'frames':count,'w':w,'h':h,'x':offsets[0][0]-padding[0],'y':offsets[0][1]-padding[1],'svgX':offsets[0][0],'svgY':offsets[0][1],'filterPadding':padding,'sha256':sha(target),
        'frameSha256':[hashlib.sha256(im.tobytes()).hexdigest() for im in images]}
court_source=next((cache/'court').rglob('38.png'));court=out/'court.png'
court.write_bytes(court_source.read_bytes())
assert Image.open(court).size==(550,400)
record={'source':'games/46923/game.swf','sourceSha256':sha(source),'xmlSha256':sha(xml),'art':art,
    'court':{'file':'court.png','sha256':sha(court),'removedPlacement':net_xml},'netPlacement':net_xml,'birdFilters':native_filters,'shadowOffset':offset,
    'method':'JPEXS native PNG/SVG export. Court frame38 excludes only netSprite. Net retains root matrix/bevel and all12 authored frames. Shuttle glow and centered shadow are exported separately so the drop-shadow offset remains fixed in parent space while the bird rotates. Trail retains original child matrix/blur. PNG rasterization approximates the original vector/filter renderer.'}
(ROOT/'src/badminton/ball-art.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
print(json.dumps({name:{k:m[k] for k in ['frames','w','h','x','y']} for name,m in art.items()}))
