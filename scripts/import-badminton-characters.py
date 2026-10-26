"""Export original badminton body timelines with their root placement/filter layers."""
from pathlib import Path
from PIL import Image
import argparse, copy, hashlib, json, os, re, subprocess
import xml.etree.ElementTree as ET
from badminton_export import filter_padding

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ffdec')
parser.add_argument('--cached',action='store_true',help='Reuse native PNG/SVG exports to rebuild sheets and metadata')
args=parser.parse_args()
source=ROOT/'games/46923/game.swf';xml=ROOT/'artifacts/swf-analysis/46923/game.xml'
cache=ROOT/'artifacts/badminton-character-art';cache.mkdir(parents=True,exist_ok=True)
tree=ET.parse(xml);root=tree.getroot();symbols={int(e.get('spriteId')):e for e in root.iter() if e.get('type')=='DefineSpriteTag'}

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def states(sid):
    display={};result=[];labels={}
    for e in symbols[sid].find('subTags'):
        kind=e.get('type','')
        if kind=='FrameLabelTag':labels[e.get('name')]=len(result)+1
        elif kind.startswith('PlaceObject'):
            assert e.get('placeFlagMove')!='true','Unexpected root placement move: preserve its inherited fields explicitly'
            display[int(e.get('depth'))]=copy.deepcopy(e)
        elif kind.startswith('RemoveObject'):display.pop(int(e.get('depth')),None)
        elif kind=='ShowFrameTag':result.append(copy.deepcopy(display))
    assert len(result)==int(symbols[sid].get('frameCount'))
    return result,labels

# This script never executes AS2. Symbol276 selects normal frame1 at runtime
# unless the original berserk cheat is enabled; static export must not alternate
# its two authored face states. Keep the normal frame's original placements.
face=symbols[276];face_tags=face.find('subTags');first=[]
for e in face_tags:
    if e.get('type') not in ['DoActionTag','UnknownTag']:first.append(copy.deepcopy(e))
    if e.get('type')=='ShowFrameTag':break
face_tags.clear();face_tags.extend(first);face.set('frameCount','1')

poses={};next_id=5000;tags=root.find('tags')
for side,sid in [('p1',306),('p2',268)]:
    displays,labels=states(sid);poses[side]={}
    for motion,frame in labels.items():
        display=displays[frame-1]
        layers=[copy.deepcopy(e) for depth,e in sorted(display.items()) if e.get('name') not in ['gun','gunServe']]
        # All authored non-racket layers sit above depth8. This is why the
        # ordinary/serving gun must be drawn before this complete body sheet.
        assert all(int(e.get('depth'))>8 for e in layers)
        body=next((e for e in layers if e.get('name')=='hero'),None)
        child_id=int(body.get('characterId')) if body is not None else None
        count=int(symbols[child_id].get('frameCount')) if child_id in symbols else 1
        wrapper=ET.Element('item',{'type':'DefineSpriteTag','spriteId':str(next_id),'frameCount':str(count),'forceWriteAsLong':'true'})
        sub=ET.SubElement(wrapper,'subTags');sub.extend(layers)
        for _ in range(count):ET.SubElement(sub,'item',{'type':'ShowFrameTag'})
        tags.insert(len(tags)-1,wrapper)
        poses[side][motion]={'wrapper':next_id,'rootSymbol':sid,'rootFrame':frame,'bodySymbol':child_id,'frames':count,
            'playing':child_id!=305 and count>1,'layers':[ET.tostring(e,encoding='unicode').strip() for e in layers]}
        next_id+=1

expanded=cache/'timelines.xml';tree.write(expanded,encoding='utf-8',xml_declaration=True)
if not args.cached:
    candidates=[Path(p) for p in [args.ffdec,os.environ.get('FFDEC_JAR')] if p]
    candidates += [ROOT/'artifacts/tools/ffdec/ffdec.jar',Path(os.environ.get('LOCALAPPDATA',''))/'Temp/opencode/4399/ffdec/ffdec.jar']
    jar=next((p for p in candidates if p.is_file()),None)
    if jar is None:raise SystemExit('Set --ffdec or FFDEC_JAR to JPEXS ffdec.jar')
    def ff(arguments,name):
        with (cache/(name+'.log')).open('w',encoding='utf-8') as log:
            subprocess.run(['java','-jar',str(jar),*map(str,arguments)],cwd=ROOT,check=True,stdout=log,stderr=subprocess.STDOUT)
    swf=cache/'timelines.swf';ff(['-xml2swf',expanded,swf],'timelines-swf')
    selection=','.join(str(m['wrapper']) for group in poses.values() for m in group.values())
    for kind,options in [('png',[]),('svg',['-format','sprite:svg'])]:ff([*options,'-selectid',selection,'-export','sprite',cache/kind,swf],kind+'-export')

out=ROOT/'public/authority/assets/badminton';out.mkdir(parents=True,exist_ok=True)
for side,group in poses.items():
    for motion,meta in group.items():
        sid=meta['wrapper'];pngdir=next((cache/'png').glob(f'DefineSprite_{sid}*'));svgdir=next((cache/'svg').glob(f'DefineSprite_{sid}*'))
        images=[Image.open(pngdir/f'{frame}.png').convert('RGBA') for frame in range(1,meta['frames']+1)]
        w,h=images[0].size;assert all(im.size==(w,h) for im in images)
        offsets=[]
        for frame in range(1,meta['frames']+1):
            svg=ET.parse(svgdir/f'{frame}.svg').getroot();g=svg.find('{http://www.w3.org/2000/svg}g')
            m=[float(v) for v in re.search(r'matrix\(([^)]+)\)',g.get('transform'))[1].replace(',',' ').split()]
            assert m[:4]==[1,0,0,1];offsets.append([-m[4],-m[5]])
        assert all(p==offsets[0] for p in offsets),'Native frame registration differs'
        sheet=Image.new('RGBA',(w*len(images),h))
        for i,im in enumerate(images):sheet.alpha_composite(im,(i*w,0))
        name=f'{side}-body-{motion}.png';target=out/name;sheet.save(target)
        export_symbols={int(e.get('spriteId')):e for e in root.iter() if e.get('type')=='DefineSpriteTag'}
        padding=filter_padding(sid,export_symbols)
        meta.update({'file':name,'w':w,'h':h,'x':offsets[0][0]-padding[0],'y':offsets[0][1]-padding[1],'svgX':offsets[0][0],'svgY':offsets[0][1],'filterPadding':padding,'sha256':sha(target),
            'frameSha256':[hashlib.sha256(im.tobytes()).hexdigest() for im in images],
            'bounds':[list(im.getbbox()) if im.getbbox() else None for im in images]})
record={'source':'games/46923/game.swf','sourceSha256':sha(source),'xmlSha256':sha(xml),'rootFrameRate':float(root.get('frameRate')),
    'method':'Static display list at each native hero label; independent body timeline stepped inside its original root layers, matrices, alpha and filters; gun/gunServe excluded for separate native tracks. Normal face276 held at source script-selected frame1. No AS2 execution or Flash callback-order equivalence claim.',
    'sourceScripts':{},'poses':poses}
scriptroot=ROOT/'artifacts/swf-analysis/46923/deobfuscated/scripts'
for file in ['frame_38/DoAction.as','DefineSprite_306_hero/frame_1/DoAction.as','DefineSprite_268_hero2/frame_1/DoAction.as','DefineSprite_305/frame_1/DoAction.as','DefineSprite_276/frame_1/DoAction.as','DefineSprite_276/frame_1/DoAction_2.as']:
    record['sourceScripts'][file]=sha(scriptroot/file)
(ROOT/'src/badminton/character-art.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
print('Imported',sum(m['frames'] for group in poses.values() for m in group.values()),'native character frames across',sum(len(group) for group in poses.values()),'root motion labels.')
