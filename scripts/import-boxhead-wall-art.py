"""Export native wall damage frames and the nested 15-frame smoke timeline."""
from pathlib import Path
from PIL import Image
import argparse, copy, hashlib, json, math, os, re, subprocess
import xml.etree.ElementTree as ET

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ffdec')
args=parser.parse_args()
candidates=[Path(p) for p in [args.ffdec,os.environ.get('FFDEC_JAR')] if p]
candidates += [root/'artifacts/tools/ffdec/ffdec.jar',Path(os.environ.get('LOCALAPPDATA',''))/'Temp/opencode/4399/ffdec/ffdec.jar']
jar=next((p for p in candidates if p.is_file()),None)
if jar is None:raise SystemExit('Set FFDEC_JAR or --ffdec to JPEXS ffdec.jar')
cache=root/'artifacts/boxhead-wall-art';cache.mkdir(parents=True,exist_ok=True)
source=root/'games/50737/game.swf'
xml=root/'artifacts/swf-analysis/50737/source.xml'
def ff(arguments,name):
    with (cache/(name+'.log')).open('w',encoding='utf-8') as log:
        subprocess.run(['java','-jar',str(jar),*map(str,arguments)],check=True,stdout=log,stderr=subprocess.STDOUT,cwd=root)
if not xml.is_file():ff(['-swf2xml',source,xml],'source-xml')
tree=ET.parse(xml);exports={}
for el in tree.getroot().iter():
    if el.get('type')=='ExportAssetsTag':exports.update({name.text:int(sid.text) for sid,name in zip(el.find('tags'),el.find('names'))})
symbols={int(el.get('spriteId')):el for el in tree.getroot().iter() if el.get('type')=='DefineSpriteTag'}
smoke=symbols[exports['Effect.SmokeCloud']]
placement=next(el for el in smoke.find('subTags') if el.get('name')=='_Contents')
child=symbols[int(placement.get('characterId'))];count=int(child.get('frameCount'))
assert int(smoke.get('frameCount'))==1 and count==15
# Buffer() explicitly seeks _Contents on every frame. Extending the wrapper's
# timeline lets the static renderer step this child while retaining its blur.
smoke.set('frameCount',str(count));tags=smoke.find('subTags')
frame=next(el for el in tags if el.get('type')=='ShowFrameTag')
end=next((el for el in tags if el.get('type')=='EndTag'),None)
if end is not None:tags.remove(end)
for _ in range(count-1):tags.append(copy.deepcopy(frame))
if end is not None:tags.append(end)
expanded=cache/'timelines.xml';tree.write(expanded,encoding='utf-8',xml_declaration=True)
swf=cache/'timelines.swf';ff(['-xml2swf',expanded,swf],'timelines-swf')
selection=','.join(str(exports[name]) for name in ['Object.Wall','Effect.SmokeCloud'])
for kind,options in [('png',[]),('svg',['-format','sprite:svg'])]:
    ff([*options,'-selectid',selection,'-export','sprite',cache/kind,swf],kind+'-export')
out=root/'public/expanded/assets/boxhead';metadata={}
for name,filename,expected in [('Object.Wall','object-wall.png',10),('Effect.SmokeCloud','effect-smokecloud.png',15)]:
    sid=exports[name];pngdir=next((cache/'png').glob(f'DefineSprite_{sid}*'));svgdir=next((cache/'svg').glob(f'DefineSprite_{sid}*'))
    frames=sorted(pngdir.glob('*.png'),key=lambda p:int(p.stem));assert len(frames)==expected,(name,len(frames))
    images=[Image.open(p).convert('RGBA') for p in frames];w,h=images[0].size
    assert all(im.size==(w,h) for im in images),'Inconsistent native sheet canvas'
    offsets=[]
    for index in range(1,expected+1):
        svg=ET.parse(svgdir/f'{index}.svg').getroot();group=svg.find('{http://www.w3.org/2000/svg}g')
        matrix=[float(v) for v in re.search(r'matrix\(([^)]+)\)',group.get('transform'))[1].replace(',',' ').split()]
        assert matrix[:4]==[1,0,0,1],matrix
        offsets.append([-matrix[4],-matrix[5]])
    assert all(pair==offsets[0] for pair in offsets),'Native timeline registration changes'
    sheet=Image.new('RGBA',(w*expected,h))
    for index,im in enumerate(images):sheet.alpha_composite(im,(index*w,0))
    target=out/filename;sheet.save(target)
    metadata[name]={'file':filename,'frames':expected,'w':w,'h':h,'x':offsets[0][0],'y':offsets[0][1],
      'symbol':sid,'bounds':[list(im.getbbox()) if im.getbbox() else None for im in images],
      'frameSha256':[hashlib.sha256(im.tobytes()).hexdigest() for im in images],'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
datafile=root/'src/expanded/boxhead-data.json';data=json.loads(datafile.read_text(encoding='utf-8'))
for name,meta in metadata.items():data['objects'][name]={key:meta[key] for key in ['file','frames','w','h','x','y']}
datafile.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
record={'source':'games/50737/game.swf','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
 'timelines':metadata,'smokeContentsSymbol':int(placement.get('characterId')),
 'method':'Static JPEXS PNG/SVG export; smoke wrapper extended to step all native _Contents frames including original filters; source SWF unchanged.'}
(root/'src/expanded/boxhead-wall-art.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
provenance=out/'provenance.json'
if provenance.is_file():
    info=json.loads(provenance.read_text(encoding='utf-8'))
    info['wallTimelines']={'Object.Wall':metadata['Object.Wall']['frames'],'Effect.SmokeCloud':metadata['Effect.SmokeCloud']['frames'],
      'metadata':'src/expanded/boxhead-wall-art.json','method':record['method']}
    provenance.write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Imported 10 native wall damage frames and 15 native smoke frames with SVG registration.')
