"""Import complete native vehicle timelines and statically read their motion rules."""
from pathlib import Path
from PIL import Image
import hashlib,json,os,re,subprocess,xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1];cache=root/'artifacts/bomb2-vehicles';cache.mkdir(parents=True,exist_ok=True)
payload=root/'artifacts/swf-analysis/9109-restore/1_Ad_newgames_AdSWF.bin';source=root/'artifacts/swf-analysis/9109-restore/embedded/scripts'
candidates=[Path(os.environ['FFDEC_JAR'])] if os.environ.get('FFDEC_JAR') else []
candidates += [root/'artifacts/tools/ffdec/ffdec.jar',Path(os.environ.get('LOCALAPPDATA',''))/'Temp/opencode/4399/ffdec/ffdec.jar']
jar=next((p for p in candidates if p.is_file()),None)
if jar is None:raise SystemExit('Set FFDEC_JAR to JPEXS ffdec.jar')
tree=ET.parse(root/'artifacts/fidelity-ui/bomb2.xml');symbols={};clips={}
for e in tree.getroot().iter():
    if e.attrib.get('type')=='SymbolClassTag':symbols.update({n.text:int(t.text) for t,n in zip(e.find('tags'),e.find('names'))})
    if e.attrib.get('type')=='DefineSpriteTag':clips[int(e.attrib['spriteId'])]=e
selected={f'vehicle-{hero}-{kind.lower()}-{d.lower()}':(symbols[f'_r{hero}_{kind}_{d}'],f'_r{hero}_{kind}_{d}') for hero in range(4) for kind in ['Car','Bulldozer','Frog'] for d in ['Left','Up','Right','Down']}
for kind,fmt in [('png',[]),('svg',['-format','sprite:svg'])]:
    target=cache/kind
    if not all(list(target.glob(f'DefineSprite_{sid}*')) for sid,_ in selected.values()):subprocess.run(['java','-jar',str(jar),'-selectid',','.join(str(sid) for sid,_ in selected.values()),*fmt,'-export','sprite',str(target),str(payload)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
data={'source':'games/9109/game.swf','sha256':digest(root/'games/9109/game.swf'),'payloadSha256':digest(payload),'timelines':{},'sourceClasses':{},'rules':{}}
out=root/'public/expanded/assets/bomb2'
for name,(sid,cls) in selected.items():
    directory=next((cache/'png').glob(f'DefineSprite_{sid}*'));frames=[Image.open(p).convert('RGBA') for p in sorted(directory.glob('*.png'),key=lambda p:int(p.stem))];w,h=frames[0].size
    if not all(im.size==(w,h) for im in frames):raise ValueError('Inconsistent FFDec canvas')
    svg=ET.parse(next((cache/'svg').glob(f'DefineSprite_{sid}*'))/'1.svg').getroot();m=[float(v) for v in re.search(r'matrix\(([^)]+)\)',svg.find('{http://www.w3.org/2000/svg}g').attrib['transform'])[1].split(',')]
    if m[:4]!=[1,0,0,1]:raise ValueError('Unexpected raster registration')
    strip=Image.new('RGBA',(w*len(frames),h));bounds=[]
    for i,im in enumerate(frames):strip.alpha_composite(im,(w*i,0));b=im.getbbox();bounds.append(list(b) if b else None)
    target=out/('native-'+name+'.png');strip.save(target)
    frame=1;labels={}
    for tag in clips[sid].find('subTags'):
        if tag.attrib.get('type')=='FrameLabelTag':labels[tag.attrib['name']]=frame
        if tag.attrib.get('type')=='ShowFrameTag':frame+=1
    code=(source/(cls+'.as')).read_text(encoding='utf-8-sig');loops=[int(n) for n in re.findall(r'internal function frame(\d+)\(\)',code)]
    data['timelines'][name]={'symbol':sid,'frames':len(frames),'w':w,'h':h,'x':-m[4],'y':-m[5],'bounds':bounds,'labels':labels,'loopEnds':loops,'path':target.relative_to(root).as_posix(),'sha256':digest(target)}
    data['sourceClasses'][cls]=hashlib.sha256(code.replace('\r\n','\n').encode()).hexdigest()
for cls in ['AbstractRobot','FrogProp','CarProp','BulldozerProp','PlaneProp','AbstractWeapon']:
    code=(source/'actionSprite'/(cls+'.as')).read_text(encoding='utf-8-sig');data['sourceClasses']['actionSprite/'+cls]=hashlib.sha256(code.replace('\r\n','\n').encode()).hexdigest()
    if cls=='FrogProp':data['rules']['frogJumpStart']=int(re.search(r'robot.mc.gotoAndPlay\((\d+)\)',code)[1])
    if cls=='BulldozerProp':data['rules']['bulldozerPauseLimit']=int(re.search(r'_countNum > (\d+)',code)[1])
    if cls in ['FrogProp','CarProp','BulldozerProp']:data['rules'][cls.replace('Prop','').lower()+'Velocity']=float(re.search(r'param1.velocity = ([\d.]+)',code)[1])
(root/'src/expanded/bomb2-vehicle-art.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
manifest_file=out/'manifest.json';manifest=json.loads(manifest_file.read_text(encoding='utf-8'));manifest['vehicleTimelines']=data
manifest['assets']=[{'path':p.relative_to(out).as_posix(),'sha256':digest(p)} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='manifest.json'];manifest_file.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Imported 48 native vehicle timelines, original loops, death labels and motion rules.')
