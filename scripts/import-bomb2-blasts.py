"""Preserve static direction selectors and their original animated child clips."""
from pathlib import Path
from PIL import Image
import hashlib, json, os, re, subprocess, xml.etree.ElementTree as ET

root=Path(__file__).resolve().parents[1]
cache=root/'artifacts/bomb2-blasts'
payload=root/'artifacts/swf-analysis/9109-restore/1_Ad_newgames_AdSWF.bin'
xml=root/'artifacts/fidelity-ui/bomb2.xml'
candidates=[Path(os.environ['FFDEC_JAR'])] if os.environ.get('FFDEC_JAR') else []
candidates += [root/'artifacts/tools/ffdec/ffdec.jar',Path(os.environ.get('LOCALAPPDATA',''))/'Temp/opencode/4399/ffdec/ffdec.jar']
jar=next((p for p in candidates if p.is_file()),None)
if jar is None:raise SystemExit('Set FFDEC_JAR to JPEXS ffdec.jar')
if not xml.is_file():
    xml.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run(['java','-jar',str(jar),'-swf2xml',str(payload),str(xml)],check=True,stdout=subprocess.DEVNULL)
symbols={'center':2945,'middle':2952,'end':2957,'mine-center':2959}
for folder,args in [('preview',[]),('svg',['-format','sprite:svg'])]:
    if not all(list((cache/folder).glob(f'DefineSprite_{sid}*')) for sid in symbols.values()):
        subprocess.run(['java','-jar',str(jar),'-selectid',','.join(map(str,symbols.values())),*args,'-export','sprite',str(cache/folder),str(payload)],check=True,stdout=subprocess.DEVNULL)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
data={'source':'games/9109/game.swf','sha256':digest(root/'games/9109/game.swf'),'payloadSha256':digest(payload),'timelines':{},'selectors':{},'sourceClasses':{}}
out=root/'public/expanded/assets/bomb2'
for name,sid in symbols.items():
    directory=next((cache/'preview').glob(f'DefineSprite_{sid}*'))
    frames=[Image.open(p).convert('RGBA') for p in sorted(directory.glob('*.png'),key=lambda p:int(p.stem))]
    w,h=frames[0].size
    if not all(im.size==(w,h) for im in frames):raise ValueError('Inconsistent FFDec canvas')
    svg_directory=next((cache/'svg').glob(f'DefineSprite_{sid}*'))
    transform=ET.parse(svg_directory/'1.svg').getroot().find('{http://www.w3.org/2000/svg}g').attrib['transform']
    matrix=[float(v) for v in re.search(r'matrix\(([^)]+)\)',transform)[1].split(',')]
    if matrix[:4]!=[1,0,0,1]:raise ValueError('Unexpected registration transform')
    strip=Image.new('RGBA',(w*len(frames),h))
    for i,im in enumerate(frames):strip.alpha_composite(im,(w*i,0))
    target=out/f'native-flame-{name}.png';strip.save(target)
    data['timelines'][name]={'symbol':sid,'frames':len(frames),'w':w,'h':h,'x':-matrix[4],'y':-matrix[5],'path':target.relative_to(root).as_posix(),'sha256':digest(target)}
tree=ET.parse(xml).getroot()
for e in tree.iter():
    if e.attrib.get('type')=='DefineSpriteTag' and e.attrib.get('spriteId') in ['2958','2960']:
        kind='mine' if e.attrib['spriteId']=='2960' else 'normal'
        selectors=[]
        for tag in e.find('subTags'):
            if tag.attrib.get('type','').startswith('PlaceObject'):
                child=int(tag.attrib['characterId']);matrix=tag.find('matrix').attrib
                selectors.append({'timeline':next(n for n,sid in symbols.items() if sid==child),'matrix':[float(matrix.get('scaleX',1)),float(matrix.get('rotateSkew0',0)),float(matrix.get('rotateSkew1',0)),float(matrix.get('scaleY',1)),int(matrix.get('translateX',0))/20,int(matrix.get('translateY',0))/20]})
        if len(selectors)!=9:raise ValueError('Expected nine direction selectors')
        data['selectors'][kind]=selectors
source=root/'artifacts/swf-analysis/9109-restore/embedded/scripts'
data['lifetimeTicks']=int(re.search(r'_continueTime > (\d+)',(source/'actionSprite/Bomb.as').read_text(encoding='utf-8-sig'))[1])+1
for name in ['actionSprite/Bomb','actionSprite/MineBomb','actionSprite/LauncherBomb','actionSprite/Control','bomb_it_Edition_04_fla/exp2_300','bomb_it_Edition_04_fla/exp3_301','bomb_it_Edition_04_fla/exp1_302','bomb_it_Edition_04_fla/exp2_1_304']:
    data['sourceClasses'][name]=hashlib.sha256((source/(name+'.as')).read_text(encoding='utf-8-sig').replace('\r\n','\n').encode()).hexdigest()
(root/'src/expanded/bomb2-blast-art.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
manifest_file=out/'manifest.json';manifest=json.loads(manifest_file.read_text(encoding='utf-8'))
manifest['blastTimelines']=data
manifest['assets']=[{'path':p.relative_to(out).as_posix(),'sha256':digest(p)} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='manifest.json']
manifest_file.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Imported four original animated flame clips and both nine-frame direction selectors.')
