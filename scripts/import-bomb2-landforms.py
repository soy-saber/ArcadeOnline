"""Preserve original spring poses, animated sand and independently played exit light."""
from pathlib import Path
from PIL import Image
import hashlib,json,os,re,subprocess,xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1];cache=root/'artifacts/bomb2-landforms';cache.mkdir(parents=True,exist_ok=True)
payload=root/'artifacts/swf-analysis/9109-restore/1_Ad_newgames_AdSWF.bin';xml=root/'artifacts/fidelity-ui/bomb2.xml'
candidates=[Path(os.environ['FFDEC_JAR'])] if os.environ.get('FFDEC_JAR') else []
candidates += [root/'artifacts/tools/ffdec/ffdec.jar',Path(os.environ.get('LOCALAPPDATA',''))/'Temp/opencode/4399/ffdec/ffdec.jar']
jar=next((p for p in candidates if p.is_file()),None)
if jar is None:raise SystemExit('Set FFDEC_JAR to JPEXS ffdec.jar')
def ff(args):subprocess.run(['java','-jar',str(jar),*map(str,args)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
tree=ET.parse(xml);symbols={}
for e in tree.getroot().iter():
    if e.attrib.get('type')=='SymbolClassTag':symbols.update({n.text:int(t.text) for t,n in zip(e.find('tags'),e.find('names'))})
selected={f'jump-{hero}-{d.lower()}':symbols[f'_r{hero}_{d}_Jump'] for hero in range(4) for d in ['Left','Up','Right','Down']}
selected.update({'sand-light-1':338,'sand-light-2':350})
base={'sand-base-1':symbols['quickSand_1'],'sand-base-2':symbols['quickSand_2']};lights={}
def matrix(e):
    a=e.attrib;return [float(a.get('scaleX',1)),float(a.get('rotateSkew0',0)),float(a.get('rotateSkew1',0)),float(a.get('scaleY',1)),int(a.get('translateX',0))/20,int(a.get('translateY',0))/20]
for e in tree.getroot().iter():
    if e.attrib.get('type')=='DefineSpriteTag' and int(e.attrib['spriteId']) in base.values():
        kind=next(k[-1] for k,v in base.items() if v==int(e.attrib['spriteId']));tags=e.find('subTags')
        light=next(t for t in tags if t.attrib.get('name')=='light');depth=light.attrib['depth'];lights[kind]={'symbol':int(light.attrib['characterId']),'matrix':matrix(light.find('matrix'))}
        for tag in list(tags):
            if tag.attrib.get('depth')==depth:tags.remove(tag)
clean_xml=cache/'sand-without-light.xml';clean_swf=cache/'sand-without-light.swf'
tree.write(clean_xml,encoding='utf-8',xml_declaration=True);ff(['-xml2swf',clean_xml,clean_swf])
for prefix,swf,entries in [('original',payload,selected),('base',clean_swf,base)]:
    for kind,fmt in [('png',[]),('svg',['-format','sprite:svg'])]:
        target=cache/(prefix+'-'+kind)
        if not all(list(target.glob(f'DefineSprite_{sid}*')) for sid in entries.values()):ff(['-selectid',','.join(map(str,entries.values())),*fmt,'-export','sprite',target,swf])
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
data={'source':'games/9109/game.swf','sha256':digest(root/'games/9109/game.swf'),'payloadSha256':digest(payload),'analysisCopySha256':digest(clean_swf),'analysisEdit':'Only remove the named light display instance from both QuickSand parent clips; draw the original light separately under server control. Raw sources unchanged.','timelines':{},'lights':lights,'sourceClasses':{},'rules':{'springSpeed':5,'springWaitFrames':4,'springCells':2,'sandAlphaStep':.05,'sandTransferAlpha':.5}}
out=root/'public/expanded/assets/bomb2'
for prefix,entries in [('original',selected),('base',base)]:
    for name,sid in entries.items():
        directory=next((cache/(prefix+'-png')).glob(f'DefineSprite_{sid}*'));frames=[Image.open(p).convert('RGBA') for p in sorted(directory.glob('*.png'),key=lambda p:int(p.stem))];w,h=frames[0].size
        if not all(im.size==(w,h) for im in frames):raise ValueError('Inconsistent FFDec canvas')
        svg=ET.parse(next((cache/(prefix+'-svg')).glob(f'DefineSprite_{sid}*'))/'1.svg').getroot();m=[float(v) for v in re.search(r'matrix\(([^)]+)\)',svg.find('{http://www.w3.org/2000/svg}g').attrib['transform'])[1].split(',')]
        if m[:4]!=[1,0,0,1]:raise ValueError('Unexpected raster registration')
        strip=Image.new('RGBA',(w*len(frames),h));bounds=[]
        for i,im in enumerate(frames):strip.alpha_composite(im,(w*i,0));b=im.getbbox();bounds.append(list(b) if b else None)
        target=out/('native-'+name+'.png');strip.save(target)
        data['timelines'][name]={'symbol':sid,'frames':len(frames),'w':w,'h':h,'x':-m[4],'y':-m[5],'bounds':bounds,'path':target.relative_to(root).as_posix(),'sha256':digest(target)}
source=root/'artifacts/swf-analysis/9109-restore/embedded/scripts'
spring=(source/'actionSprite/SpringBoard.as').read_text(encoding='utf-8-sig');robot=(source/'actionSprite/AbstractRobot.as').read_text(encoding='utf-8-sig');sand=(source/'quickSand_1.as').read_text(encoding='utf-8-sig')
data['rules']={'springSpeed':int(re.search(r'_speed = (\d+)',spring)[1]),'springWaitFrames':int(re.search(r'mc.currentFrame > (\d+)',robot)[1]),'springCells':int(re.search(r'param2.yGrid - (\d+)',spring)[1]),'sandAlphaStep':float(re.search(r'_container.alpha -= ([\d.]+)',robot)[1]),'sandTransferAlpha':float(re.search(r'_container.alpha < ([\d.]+)',robot)[1]),'lightFrames':data['timelines']['sand-light-1']['frames'],'sandLoopStart':int(re.search(r'gotoAndPlay\((\d+)\)',sand)[1]),'sandLoopEnd':data['timelines']['sand-base-1']['frames']-1}
for name in ['actionSprite/AbstractRobot','actionSprite/SpringBoard','actionSprite/QuickSand','actionSprite/Person','quickSand_1','quickSand_2','bomb_it_Edition_04_fla/blue_737','bomb_it_Edition_04_fla/red_740']:
    data['sourceClasses'][name]=hashlib.sha256((source/(name+'.as')).read_text(encoding='utf-8-sig').replace('\r\n','\n').encode()).hexdigest()
(root/'src/expanded/bomb2-landform-art.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
manifest_file=out/'manifest.json';manifest=json.loads(manifest_file.read_text(encoding='utf-8'));manifest['landformTimelines']=data
manifest['assets']=[{'path':p.relative_to(out).as_posix(),'sha256':digest(p)} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='manifest.json'];manifest_file.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Imported 16 original spring poses, two animated sand bases and two independently controlled lights.')
