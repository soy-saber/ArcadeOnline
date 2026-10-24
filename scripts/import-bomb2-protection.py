"""Import the original robot registration, one-use shield and power-up intro."""
from pathlib import Path
from PIL import Image
import hashlib,json,os,re,subprocess,xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1];cache=root/'artifacts/bomb2-protection';cache.mkdir(parents=True,exist_ok=True)
payload=root/'artifacts/swf-analysis/9109-restore/1_Ad_newgames_AdSWF.bin';source=root/'artifacts/swf-analysis/9109-restore/embedded/scripts'
candidates=[Path(os.environ['FFDEC_JAR'])] if os.environ.get('FFDEC_JAR') else []
candidates += [root/'artifacts/tools/ffdec/ffdec.jar',Path(os.environ.get('LOCALAPPDATA',''))/'Temp/opencode/4399/ffdec/ffdec.jar']
jar=next((p for p in candidates if p.is_file()),None)
if jar is None:raise SystemExit('Set FFDEC_JAR to JPEXS ffdec.jar')
tree=ET.parse(root/'artifacts/fidelity-ui/bomb2.xml');symbols={}
for e in tree.getroot().iter():
    if e.attrib.get('type')=='SymbolClassTag':symbols.update({n.text:int(t.text) for t,n in zip(e.find('tags'),e.find('names'))})
selected={f'hero-{c}-{d.lower()}':symbols[f'_r{c}_{d}'] for c in range(4) for d in ['Left','Up','Right','Down']}
selected.update({'shield':symbols['nombril_Right'],'invincibility-intro':symbols['invincibityPlay']})
for kind,fmt in [('png',[]),('svg',['-format','sprite:svg'])]:
    target=cache/kind
    if not all(list(target.glob(f'DefineSprite_{sid}*')) for sid in selected.values()):subprocess.run(['java','-jar',str(jar),'-selectid',','.join(str(sid) for sid in selected.values()),*fmt,'-export','sprite',str(target),str(payload)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
data={'source':'games/9109/game.swf','sha256':digest(root/'games/9109/game.swf'),'payloadSha256':digest(payload),'timelines':{},'sourceClasses':{},'rules':{}}
out=root/'public/expanded/assets/bomb2'
for name,sid in selected.items():
    directory=next((cache/'png').glob(f'DefineSprite_{sid}*'));frames=[Image.open(p).convert('RGBA') for p in sorted(directory.glob('*.png'),key=lambda p:int(p.stem))];w,h=frames[0].size
    if not all(im.size==(w,h) for im in frames):raise ValueError('Inconsistent canvas')
    svg=ET.parse(next((cache/'svg').glob(f'DefineSprite_{sid}*'))/'1.svg').getroot();m=[float(v) for v in re.search(r'matrix\(([^)]+)\)',svg.find('{http://www.w3.org/2000/svg}g').attrib['transform'])[1].split(',')]
    if m[:4]!=[1,0,0,1]:raise ValueError('Unexpected registration')
    strip=Image.new('RGBA',(w*len(frames),h));bounds=[]
    for i,im in enumerate(frames):strip.alpha_composite(im,(w*i,0));b=im.getbbox();bounds.append(list(b) if b else None)
    target=out/('native-'+name+'.png');strip.save(target)
    data['timelines'][name]={'symbol':sid,'frames':len(frames),'w':w,'h':h,'x':-m[4],'y':-m[5],'bounds':bounds,'path':target.relative_to(root).as_posix(),'sha256':digest(target)}
robot=(source/'actionSprite/AbstractRobot.as').read_text(encoding='utf-8-sig');power=(source/'actionSprite/InvincibilityProp.as').read_text(encoding='utf-8-sig');game=(source/'actionSprite/Game.as').read_text(encoding='utf-8-sig')
number=lambda code,pattern:float(re.search(pattern,code)[1])
array=lambda name:[int(x.strip()) for x in re.search(name+r' = new Array\(([^)]*)\)',power)[1].split(',')]
filter_args=re.search(r'new GradientGlowFilter\(([^)]*)\)',power)[1].split(',')
data['rules']={'shortCounterLimit':int(number(robot,r'_nvincibilityTimeCount > (\d+)')),'flashEvery':int(number(robot,r'_nvincibilityTimeCount % (\d+)')),'flashAlphaStep':number(robot,r'_mc.alpha -= ([\d.]+)'),'flashAlphaThreshold':number(robot,r'_mc.alpha > ([\d.]+)'),'powerSeconds':int(number(power,r'_invincibilityTime = (\d+)')),'frameRate':int(number(game,r'_frameRate = (\d+)')),'filterAlpha':number(power,r'_filerAlpha = ([\d.]+)'),'colors':array('_filerColor'),'ratios':array('_filerStr'),'colorStep':int(number(power,r'_step = (-?\d+)')),'filter':{'distance':float(filter_args[0]),'angle':float(filter_args[1]),'blurX':float(filter_args[5]),'blurY':float(filter_args[6]),'strength':float(filter_args[7]),'quality':'HIGH','type':'INNER','knockout':False}}
for cls in ['actionSprite/AbstractRobot','actionSprite/NombrilProp','actionSprite/InvincibilityProp','actionSprite/Game','actionSprite/Map','nombril_Right','invincibityPlay']:
    code=(source/(cls+'.as')).read_text(encoding='utf-8-sig');data['sourceClasses'][cls]=hashlib.sha256(code.replace('\r\n','\n').encode()).hexdigest()
(root/'src/expanded/bomb2-protection-art.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
manifest_file=out/'manifest.json';manifest=json.loads(manifest_file.read_text(encoding='utf-8'));manifest['protectionTimelines']=data
manifest['assets']=[{'path':p.relative_to(out).as_posix(),'sha256':digest(p)} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='manifest.json'];manifest_file.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Imported 16 native robot timelines, the original shield and 30-frame power intro, with static source rules.')
