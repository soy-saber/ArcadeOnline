"""Read native racket hitTest(false) bounds and service markers from SWF XML."""
from pathlib import Path
import argparse, copy, hashlib, json, math, os, re, shutil, struct, subprocess, xml.etree.ElementTree as ET
from badminton_export import filter_padding

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--export-art',action='store_true')
parser.add_argument('--ffdec')
args=parser.parse_args()

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'games/46923/game.swf'
XML=ROOT/'artifacts/swf-analysis/46923/game.xml'
tree=ET.parse(XML).getroot()
symbols={int(e.get('spriteId')):e for e in tree.iter() if e.get('type')=='DefineSpriteTag'}
IDENTITY=[1,0,0,1,0,0]

def matrix(e):
    m=e.find('matrix')
    if m is None:return IDENTITY[:]
    return [float(m.get('scaleX','1')),float(m.get('rotateSkew0','0')),float(m.get('rotateSkew1','0')),float(m.get('scaleY','1')),float(m.get('translateX','0'))/20,float(m.get('translateY','0'))/20]

def multiply(a,b):
    return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]

def point(m,x,y):return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]

def f32(v):return struct.unpack('<f',struct.pack('<f',v))[0]
def native_matrix(m):return [*map(f32,m[:4]),round(m[4]*20),round(m[5]*20)]
def native_multiply(a,b):
    add=lambda x,y:f32(f32(x)+f32(y))
    return [add(a[0]*b[0],a[2]*b[1]),add(a[1]*b[0],a[3]*b[1]),add(a[0]*b[2],a[2]*b[3]),add(a[1]*b[2],a[3]*b[3]),
        round(add(a[0]*b[4],a[2]*b[5]))+a[4],round(add(a[1]*b[4],a[3]*b[5]))+a[5]]
def native_point(m,x,y):return [round(f32(f32(m[0]*x)+f32(m[2]*y)))+m[4],round(f32(f32(m[1]*x)+f32(m[3]*y)))+m[5]]

def frames(sid):
    display={};result=[]
    for e in symbols[sid].find('subTags'):
        kind=e.get('type','')
        if kind.startswith('PlaceObject'):
            depth=int(e.get('depth'));old=display.get(depth,{}) if e.get('placeFlagMove')=='true' else {}
            item=copy.deepcopy(old)
            if e.get('characterId'):item['symbol']=int(e.get('characterId'))
            if e.get('name'):item['name']=e.get('name')
            if e.find('matrix') is not None:item['matrix']=matrix(e)
            item.setdefault('matrix',IDENTITY[:]);display[depth]=item
        elif kind.startswith('RemoveObject'):display.pop(int(e.get('depth')),None)
        elif kind=='ShowFrameTag':result.append(copy.deepcopy(display))
    assert len(result)==int(symbols[sid].get('frameCount')),(sid,len(result))
    return result

timelines={sid:frames(sid) for sid in symbols}
def named(display,name):return next(v for k,v in sorted(display.items(),reverse=True) if v.get('name')==name)
shape=next(e for e in tree.iter() if e.get('shapeId')=='117').find('shapeBounds')
assert [int(shape.get(k)) for k in ['Xmin','Ymin','Xmax','Ymax']]==[-210,-210,210,210]
hitbox=named(timelines[186][0],'hitbox');assert hitbox['symbol']==119
corners=[(-10.5,-10.5),(-10.5,10.5),(10.5,-10.5),(10.5,10.5)]
data={}
gun_matrices={}
for side,hero in [('p1',306),('p2',268)]:
    gun=named(timelines[hero][0],'gun');serve=named(timelines[hero][0],'gunServe')
    gun_matrices[side+'-swing']=gun['matrix'];gun_matrices[side+'-serve']=serve['matrix']
    for kind,indices in [('swing',range(1,16)),('underhand',range(16,30))] if side=='p1' else [('swing',range(1,16))]:
        records=[]
        for frame in indices:
            outer=named(timelines[gun['symbol']][frame-1],'racket')
            inner=named(timelines[outer['symbol']][0],'racket')
            assert inner['symbol']==186
            composed=multiply(multiply(multiply(gun['matrix'],outer['matrix']),inner['matrix']),hitbox['matrix'])
            points=[point(composed,*p) for p in corners]
            # getBounds/hitTest query the leaf's local-to-global matrix, built
            # from the child upward. f32/twip concatenation is not associative.
            native=native_matrix(hitbox['matrix'])
            for item in [inner,outer,gun]:native=native_multiply(native_matrix(item['matrix']),native)
            native_points=[native_point(native,x*20,y*20) for x,y in corners]
            local=native_matrix(outer['matrix'])
            records.append({'frame':frame,'active':2<=frame<=8 or 16<=frame<=22,'rotation':math.degrees(math.atan2(outer['matrix'][1],outer['matrix'][0])),
                'matrix':composed,'bounds':[min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)],
                'native':{'rotation':math.degrees(math.atan2(local[1],local[0])),'matrix':native,
                    'twips':[min(p[0] for p in native_points),min(p[1] for p in native_points),max(p[0] for p in native_points),max(p[1] for p in native_points)]}})
        data[side+'-'+kind]=records
    records=[]
    for frame,display in enumerate(timelines[serve['symbol']],1):
        marker=named(display,'mc');m=multiply(serve['matrix'],marker['matrix'])
        records.append({'frame':frame,'point':point(m,0,0)})
    data[side+'-serve']=records
record={'source':'games/46923/game.swf','sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'xmlSha256':hashlib.sha256(XML.read_bytes()).hexdigest(),
    'method':'Static display-list state, parent/child matrix composition, transparent21px hitbox117/118/119 transformed to stage-axis bounds; hitTest(point,false). No AS2 execution or frame-exact callback claim.',
    'heroSymbols':{'p1':306,'p2':268},'gunMatrices':gun_matrices,'timelines':data}
cache=ROOT/'artifacts/badminton-native-geometry';cache.mkdir(parents=True,exist_ok=True)
if args.export_art:
    jar=Path(args.ffdec or os.environ.get('FFDEC_JAR') or Path(os.environ['LOCALAPPDATA'])/'Temp/opencode/4399/ffdec/ffdec.jar')
    assert jar.is_file(),'Set --ffdec to JPEXS ffdec.jar'
    for kind,options in [('png',[]),('svg',['-format','sprite:svg'])]:
        with (cache/(kind+'.log')).open('w',encoding='utf-8') as log:
            subprocess.run(['java','-jar',str(jar),*options,'-selectid','283,205,285,211','-export','sprite',str(cache/kind),str(SOURCE)],cwd=ROOT,check=True,stdout=log,stderr=subprocess.STDOUT)
if (cache/'svg').exists():
    from PIL import Image
    art={};out=ROOT/'public/authority/assets/badminton'
    for side,kind,sid,indices in [('p1','swing',283,range(1,16)),('p1','underhand',283,range(16,30)),('p2','swing',205,range(1,16)),('p1','serve',285,range(1,14)),('p2','serve',211,range(1,14))]:
        pngdir=next((cache/'png').glob(f'DefineSprite_{sid}*'));svgdir=next((cache/'svg').glob(f'DefineSprite_{sid}*'))
        for index,frame in enumerate(indices,1):
            name=f'{side}-{kind}-{index:02d}';svg=ET.parse(svgdir/f'{frame}.svg').getroot();group=svg.find('{http://www.w3.org/2000/svg}g')
            m=[float(v) for v in re.search(r'matrix\(([^)]+)\)',group.get('transform'))[1].replace(',',' ').split()];assert m[:4]==[1,0,0,1]
            png=pngdir/f'{frame}.png';image=Image.open(png);shutil.copyfile(png,out/(name+'.png'))
            padding=filter_padding(sid,symbols)
            art[name]={'file':name+'.png','symbol':sid,'frame':frame,'x':-m[4]-padding[0],'y':-m[5]-padding[1],'svgX':-m[4],'svgY':-m[5],'filterPadding':padding,'w':image.width,'h':image.height,'sha256':hashlib.sha256(png.read_bytes()).hexdigest()}
    record['art']=art
else:
    raise SystemExit('Run with --export-art and --ffdec to create native PNG/SVG registration evidence before writing metadata.')
(ROOT/'src/badminton/geometry.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
for key in ['p1-swing','p2-swing','p1-underhand']:print(key,[(r['frame'],[round(v,2) for v in r['bounds']]) for r in data[key][:3]])
print('Release markers:',data['p1-serve'][3],data['p2-serve'][3])
