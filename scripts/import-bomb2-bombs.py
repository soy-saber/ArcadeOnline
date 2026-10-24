"""Import the three original 27-frame bomb timelines with Flash registration."""
from pathlib import Path
from PIL import Image
import hashlib, json, os, re, subprocess, xml.etree.ElementTree as ET

root=Path(__file__).resolve().parents[1]
cache=root/'artifacts/bomb2-mechanisms'
payload=root/'artifacts/swf-analysis/9109-restore/1_Ad_newgames_AdSWF.bin'
candidates=[Path(os.environ['FFDEC_JAR'])] if os.environ.get('FFDEC_JAR') else []
candidates += [root/'artifacts/tools/ffdec/ffdec.jar',Path(os.environ.get('LOCALAPPDATA',''))/'Temp/opencode/4399/ffdec/ffdec.jar']
jar=next((p for p in candidates if p.is_file()),None)
if jar is None:raise SystemExit('Set FFDEC_JAR to JPEXS ffdec.jar')
symbols={'normal':2936,'remote':2995,'mine':2977}
for folder,format_arg in [('bomb-preview',[]),('bomb-svg',['-format','sprite:svg'])]:
    if not all(list((cache/folder).glob(f'DefineSprite_{sid}*')) for sid in symbols.values()):
        subprocess.run(['java','-jar',str(jar),'-selectid',','.join(map(str,symbols.values())),*format_arg,'-export','sprite',str(cache/folder),str(payload)],check=True,stdout=subprocess.DEVNULL)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
data={'source':'games/9109/game.swf','sha256':digest(root/'games/9109/game.swf'),'payloadSha256':digest(payload),'timelines':{}}
out=root/'public/expanded/assets/bomb2'
for name,sid in symbols.items():
    folder=next((cache/'bomb-preview').glob(f'DefineSprite_{sid}*'))
    frames=[Image.open(p).convert('RGBA') for p in sorted(folder.glob('*.png'),key=lambda p:int(p.stem))]
    w,h=frames[0].size
    if not all(im.size==(w,h) for im in frames):raise ValueError('Inconsistent FFDec canvas')
    svg=ET.parse(next((cache/'bomb-svg').glob(f'DefineSprite_{sid}*'))/'1.svg').getroot()
    transform=svg.find('{http://www.w3.org/2000/svg}g').attrib['transform']
    matrix=[float(v) for v in re.search(r'matrix\(([^)]+)\)',transform)[1].split(',')]
    if matrix[:4]!=[1,0,0,1]:raise ValueError('Unexpected FFDec registration transform')
    strip=Image.new('RGBA',(w*len(frames),h))
    for i,im in enumerate(frames):strip.alpha_composite(im,(w*i,0))
    target=out/f'native-bomb-{name}.png';strip.save(target)
    data['timelines'][name]={'symbol':sid,'frames':len(frames),'w':w,'h':h,'x':-matrix[4],'y':-matrix[5],'path':target.relative_to(root).as_posix(),'sha256':digest(target)}
(root/'src/expanded/bomb2-bomb-art.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
manifest_file=out/'manifest.json';manifest=json.loads(manifest_file.read_text(encoding='utf-8'))
manifest['bombTimelines']=data
manifest['assets']=[{'path':p.relative_to(out).as_posix(),'sha256':digest(p)} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='manifest.json']
manifest_file.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Imported original normal, remote and mine bomb timelines, 27 frames each.')
