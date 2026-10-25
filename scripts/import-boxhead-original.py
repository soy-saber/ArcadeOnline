"""Import original Boxhead rooms, textured XSI animation and audio without running AS2."""
import argparse
import copy
import hashlib
import json
import math
import re
import subprocess
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'artifacts/swf-analysis/50737'
OUT = ROOT / 'public/expanded/assets/boxhead'
SOURCE = ROOT / 'games/50737/game.swf'
OUT.mkdir(parents=True, exist_ok=True)
SRC.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ffdec', required=True)
parser.add_argument('--force', action='store_true', help='Rebake cached character animation sheets')
args = parser.parse_args()
JAR = args.ffdec

def ff(arguments, log):
    with (SRC / (log + '.log')).open('w', encoding='utf-8') as output:
        subprocess.run(['java', '-jar', JAR, *map(str, arguments)], cwd=ROOT,
                       stdout=output, stderr=subprocess.STDOUT, check=True)

def literal(text):
    return json.loads(re.sub(r'([,{]\s*)([A-Za-z_][A-Za-z_0-9]*):', r'\1"\2":', text))

if not (SRC / 'source.xml').exists():
    ff(['-swf2xml', SOURCE, SRC / 'source.xml'], 'xml-export')
clean = SRC / 'clean/scripts'
if not (clean / '__Packages/World/CWorld.as').exists():
    ff(['-config', 'autoDeobfuscate=true', '-export', 'script', SRC / 'clean', SOURCE], 'clean-export')
if not (SRC / 'media/sounds').exists():
    ff(['-export', 'sound,text', SRC / 'media', SOURCE], 'media-export')

tree = ET.parse(SRC / 'source.xml')
root = tree.getroot()
exports = {}
for element in root.iter():
    if element.get('type') == 'ExportAssetsTag':
        exports.update(zip([int(i.text) for i in element.findall('tags/item')],
                           [i.text for i in element.findall('names/item')]))
symbols = {int(e.get('spriteId') or e.get('shapeId')): e for e in root.iter()
           if e.get('type') in ['DefineSpriteTag','DefineShapeTag','DefineShape2Tag','DefineShape3Tag','DefineShape4Tag']}

def matrix(element):
    m = element.find('matrix')
    if m is None: return (1,0,0,1,0,0)
    return (float(m.get('scaleX',1)),float(m.get('rotateSkew0',0)),
            float(m.get('rotateSkew1',0)),float(m.get('scaleY',1)),
            float(m.get('translateX',0))/20,float(m.get('translateY',0))/20)

def compose(a,b):
    return (a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],
            a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5])

def point(m,x,y): return (m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5])

def placements(symbol, all_frames=False):
    display = {}; history = []
    for p in symbol.find('subTags') or []:
        if p.get('type') == 'ShowFrameTag':
            if not all_frames: break
            history.extend(display.values()); continue
        if p.get('type') in ['PlaceObject2Tag','PlaceObject3Tag']:
            depth = int(p.get('depth')); old = display.get(depth,{})
            display[depth] = {**old,**p.attrib,'matrix':matrix(p) if p.find('matrix') is not None else old.get('matrix',(1,0,0,1,0,0))}
        elif p.get('type') in ['RemoveObjectTag','RemoveObject2Tag']:
            display.pop(int(p.get('depth')),None)
    return [p for p in (history if all_frames else [display[d] for d in sorted(display)]) if 'characterId' in p]

def bounds(sid, transform=(1,0,0,1,0,0), all_frames=False):
    symbol = symbols.get(sid)
    if symbol is None: return []
    if symbol.get('type') == 'DefineSpriteTag':
        return [xy for p in placements(symbol,all_frames) for xy in bounds(int(p['characterId']),compose(transform,p['matrix']),all_frames)]
    rect = symbol.find('shapeBounds')
    return [] if rect is None else [point(transform,float(rect.get(x))/20,float(rect.get(y))/20)
                                    for x in ['Xmin','Xmax'] for y in ['Ymin','Ymax']]

ROOMS = sorted((int(name[-4:]),sid) for sid,name in exports.items() if name.startswith('ROOM_Single_'))
names = ['BOXY','BUTTONS','MAZEY','GLADIATOR','STRIP','TIGHT','COLUMNS','CASTLE','BIG BOXY',
         'RECTY','PATCHY','FOREST BOX','TIGHT 2','MASSIVE','THIN LINE','4 CASTLES','THE STRIPS','BIG ONE']
helpers = {74,82,85,88,91,94,96,98,112}
piece_ids = {sid for sid,name in exports.items() if name.startswith('Piece.')}
maps = []
for number,sid in ROOMS:
    placed = placements(symbols[sid])
    size = next(p for p in placed if p.get('name') == '_Size')
    corners = bounds(int(size['characterId']),size['matrix'])
    width = round(max(x for x,y in corners)-min(x for x,y in corners))
    height = round(max(y for x,y in corners)-min(y for x,y in corners))
    columns,rows = round(width/32),round(height/32)
    grid = [[int(x in [0,columns-1] or y in [0,rows-1]) for x in range(columns)] for y in range(rows)]
    def scan(id, transform):
        if id == 74:
            xy = bounds(id,transform)
            x0,y0 = round(min(x for x,y in xy)/32),round(min(y for x,y in xy)/32)
            x1,y1 = round(max(x for x,y in xy)/32),round(max(y for x,y in xy)/32)
            for y in range(max(0,y0),min(rows,y1)):
                for x in range(max(0,x0),min(columns,x1)): grid[y][x] = 1
        elif id in piece_ids:
            for child in placements(symbols[id]): scan(int(child['characterId']),compose(transform,child['matrix']))
    for p in placed: scan(int(p['characterId']),p['matrix'])
    def locations(id):
        return [{'x':math.floor(p['matrix'][4]/32)*32+16,'y':math.floor(p['matrix'][5]/32)*32+16,
                 'dir':round(math.atan2(p['matrix'][1],p['matrix'][0]),5)}
                for p in placed if int(p['characterId']) == id]
    maps.append({'id':f'original-{number:02}', 'label':f'{number:02} · {names[number-1]}',
                 'symbol':sid,'width':width,'height':height,'columns':columns,'rows':rows,
                 'collision':[''.join(map(str,row)) for row in grid],
                 'playerSpawns':locations(82),'otherSpawns':locations(96),'zombieSpawns':locations(85),
                 'devilSpawns':locations(88),'barrels':locations(91),'pickups':locations(94),'walls':locations(112)})

room_ids = {sid for _,sid in ROOMS}
for layer in ['floor','cover']:
    modified = copy.deepcopy(tree)
    for element in modified.getroot().iter():
        if element.get('type') != 'DefineSpriteTag': continue
        sid = int(element.get('spriteId')); tags = element.find('subTags')
        for p in list(tags):
            if p.get('type') not in ['PlaceObject2Tag','PlaceObject3Tag']: continue
            child = int(p.get('characterId','0')); remove = child in helpers
            if layer == 'cover':
                if sid in room_ids: remove = child not in piece_ids
                elif sid in piece_ids: remove = p.get('name') != '_Cover'
            if remove: tags.remove(p)
    xml = SRC / f'maps-{layer}.xml'; modified.write(xml,encoding='utf-8',xml_declaration=True)
    swf = SRC / f'maps-{layer}.swf'
    if not (SRC/layer).exists():
        ff(['-xml2swf',xml,swf],f'maps-{layer}-swf')
        ff(['-selectid',','.join(map(str,sorted(room_ids))),'-format','sprite:svg','-export','sprite',SRC/layer,swf],f'maps-{layer}-export')
    for entry in maps:
        file = next((SRC/layer).rglob(f'DefineSprite_{entry["symbol"]}_*/1.svg'))
        svg = ET.parse(file); svg_root = svg.getroot(); ns = '{http://www.w3.org/2000/svg}'
        content = next((e for e in svg_root if e.tag == ns+'g' and e.get('transform')),None)
        if content is not None:
            match = re.search(r'matrix\(([^)]+)\)',content.get('transform',''))
            if match:
                vals = list(map(float,re.split(r'[ ,]+',match.group(1).strip())))
                if len(vals)==6 and vals[:4] == [1,0,0,1]: content.set('transform','matrix(1 0 0 1 0 0)')
        svg_root.set('width',str(entry['width']));svg_root.set('height',str(entry['height']))
        svg_root.set('viewBox',f'0 0 {entry["width"]} {entry["height"]}')
        svg.write(OUT/f'{entry["id"]}-{layer}.svg',encoding='utf-8',xml_declaration=True)
print('Imported 18 original room layouts and floor/occlusion layers',flush=True)

asset_ids = {sid for sid,name in exports.items() if name.startswith(('Object.','Effect.','Shot.','Pistol.','Railgun.','Shotgun.','UZI.')) or
             name.startswith(('Zombie_','Swat_','GIJOE_','Devil_','Bond_','Bambo_','Body_','Head_'))}
if not (SRC/'objects').exists():
    ff(['-selectid',','.join(map(str,sorted(asset_ids))),'-export','sprite',SRC/'objects',SOURCE],'objects-export')
asset_meta = {}
for sid in sorted(asset_ids):
    directory = next((SRC/'objects').rglob(f'DefineSprite_{sid}_*'),None)
    if directory is None: continue
    frames = sorted(directory.glob('*.png'),key=lambda p:int(p.stem))
    if not frames: continue
    images = [Image.open(f).convert('RGBA') for f in frames]
    w,h = max(i.width for i in images),max(i.height for i in images)
    points = bounds(sid,all_frames=True)
    x0,y0 = (math.floor(min(x for x,y in points)),math.floor(min(y for x,y in points))) if points else (-w//2,-h//2)
    sheet = Image.new('RGBA',(w*len(images),h))
    for n,image in enumerate(images): sheet.alpha_composite(image,(n*w,0))
    filename = re.sub('[^a-z0-9-]','-',exports[sid].lower()).strip('-')
    sheet.save(OUT/(filename+'.png'))
    asset_meta[exports[sid]] = {'file':filename+'.png','frames':len(images),'w':w,'h':h,'x':x0,'y':y0}

models = {}; rotations = materials = None
for line in (clean/'DefineSprite_755_TMP2639qh3hat/frame_1/DoAction.as').read_text(encoding='utf-8').splitlines():
    if line.startswith('var mRotations = '): rotations = literal(line[len('var mRotations = '):-1])
    elif line.startswith('var mMaterials = '): materials = literal(line[len('var mMaterials = '):-1])
    elif re.match(r'var m\w+ = \{mRotations:',line): models[line.split(' = ')[0][4:]] = (rotations,materials)
master = {}
for _,materials in models.values(): master.update(copy.deepcopy(materials))
styles_text = (clean/'__Packages/DrawPrimitive/XSI/CDrawPrimitive_XSI_StyleSheet.as').read_text(encoding='utf-8')
styles = {}
for name,body in re.findall(r'static function SS_(\w+)\([^)]*\)\s*\{(.*?)\n   \}',styles_text,re.S):
    materials = copy.deepcopy(master)
    hidden = set(re.findall(r'\.mModels\.(\w+)\.mVisible = false',body))
    remaps = dict(re.findall(r'\.mModels\.(\w+)\.mGroup_Remap = "(\w+)"',body))
    for key,prop,value in re.findall(r'\.mMaterials\.(\w+)\.(mcLinkID|mColor) = ("[^"]+"|\d+)',body):
        materials.setdefault(key,{})[prop] = json.loads(value)
    styles[name] = (materials,hidden,remaps,.44 if name=='DEVIL' else .35)

def model_frame(name,direction,frame,directions):
    rotations,_ = models[name]; row = rotations[round(direction*len(rotations)/directions)%len(rotations)]
    return row[frame%len(row)]['Models']

textures = {}
def texture(link):
    if link not in textures:
        meta=asset_meta.get(link)
        if not meta: return None
        image=Image.open(OUT/meta['file']).convert('RGBA').crop((0,0,meta['w'],meta['h']))
        canvas=Image.new('RGBA',(64,64)); canvas.alpha_composite(image,(meta['x'],meta['y']))
        tiled=Image.new('RGBA',(192,192))
        for x in range(3):
            for y in range(3):tiled.alpha_composite(canvas,(x*64,y*64))
        textures[link]=tiled
    return textures[link]

animations={}
actions=['Stand','Walk','Handgun_Stand','Handgun_Walk','UZI_Stand','UZI_Walk','Shotgun_Stand','Shotgun_Walk',
         'RocketLauncher_Stand','RocketLauncher_Walk','Railgun_Stand','Railgun_Walk','HitFront','HitRear','Dying','Dead']
characters=[('swat','SWAT','Player'),('bond','BOND','Player'),('gijoe','GIJOE','Player'),
            ('bambo','BAMBO','Player'),('zombie','ZOMBIE','Zombie'),('devil','DEVIL','Devil')]
for character,style,group in characters:
    mats,hidden,remaps,scale=styles[style]
    selected=actions if group=='Player' else ['Stand','Walk','Attack','HitFront','HitRear','Dying','Dead']
    for action in selected:
        source_action=action
        if group!='Player' and action in ['Stand','Walk','Attack']:source_action=('Zombie' if group=='Zombie' else 'Devil')+'_'+action
        name=f'm{group}_Default_{source_action}'
        if name not in models:name=f'm{group}_Default_{action}'
        if name not in models:continue
        rotations,_=models[name]; directions=len(rotations);frames=len(rotations[0]);cell=192;factor=scale*2
        key=character+'-'+action.replace('_','-').lower()
        animations[key]={'file':key+'.png','frames':frames,'directions':directions,'w':cell,'h':cell,'x':-48,'y':-80,'scale':.5}
        if not args.force and (OUT/(key+'.png')).exists():continue
        sheet=Image.new('RGBA',(cell*frames,cell*directions))
        base_action=action.split('_')[-1] if action not in ['HitFront','HitRear','Dying','Dead'] else action
        partner=f'mPlayer_Default_{base_action}'
        if partner not in models:partner='mPlayer_Default_Walk'
        for direction in range(directions):
            for frame in range(frames):
                origin=(96,160); original=model_frame(name,direction,frame,directions);base=model_frame(partner,direction,frame,directions)
                drawn=Image.new('RGBA',(cell,cell));shadows=Image.new('L',(cell,cell));shadow_draw=ImageDraw.Draw(shadows)
                def xy(vertices):return [(origin[0]+vertices[i]*factor,origin[1]+vertices[i+1]*factor) for i in range(0,len(vertices),2)]
                for key,own in original.items():
                    if key in hidden:continue
                    shape=base.get(key,{}) if own.get('Empty') else own
                    if key in remaps:
                        remap=f'm{remaps[key]}_{base_action}'
                        if remap in models:shape=model_frame(remap,direction,frame,directions).get(key,shape)
                    d=ImageDraw.Draw(drawn)
                    for edge in shape.get('PEdge',[]):
                        if len(edge)>=4:d.line(xy(edge),fill=(0,0,0,255),width=2)
                    polygons=shape.get('Shape_vList',[])
                    for i in reversed(range(len(polygons))):
                        vertices=polygons[i]
                        if len(vertices)<6:continue
                        material=mats.get(shape['Shape_Material'][i],{})
                        mask=Image.new('L',(cell,cell));ImageDraw.Draw(mask).polygon(xy(vertices),fill=255)
                        transform=shape.get('Shape_Matrix',[0]*len(polygons))[i]
                        image=texture(material.get('mcLinkID')) if material.get('mcLinkID') else None
                        if image is not None and transform:
                            a,b,c,dv,tx,ty=[transform.get(k,0) for k in ['a','b','c','d','tx','ty']]
                            a*=factor;b*=factor;c*=factor;dv*=factor;tx=tx*factor+origin[0];ty=ty*factor+origin[1]
                            det=a*dv-b*c
                            if abs(det)<1e-9:continue
                            inverse=(dv/det,-c/det,(c*ty-dv*tx)/det+64,-b/det,a/det,(b*tx-a*ty)/det+64)
                            layer=image.transform((cell,cell),Image.Transform.AFFINE,inverse,Image.Resampling.BICUBIC)
                            layer.putalpha(ImageChops.darker(layer.getchannel('A'),mask))
                        else:
                            col=material.get('mColor',0)
                            layer=Image.new('RGBA',(cell,cell),tuple((col>>s)&255 for s in [16,8,0])+(255,));layer.putalpha(mask)
                        brightness=shape.get('Shape_Brightness',[0]*len(polygons))[i]
                        if brightness:
                            shade=Image.new('RGBA',(cell,cell),(255,255,255,255) if brightness>0 else (0,0,0,255))
                            shade.putalpha(mask.point(lambda n:int(n*abs(brightness)*.5)))
                            layer=Image.alpha_composite(layer,shade)
                        drawn=Image.alpha_composite(drawn,layer)
                    for poly in shape.get('Shadow',[]):
                        if len(poly)>=6:shadow_draw.polygon(xy(poly),fill=65)
                bg=Image.new('RGBA',(cell,cell));bg.putalpha(shadows.filter(ImageFilter.GaussianBlur(1.4)))
                sheet.alpha_composite(Image.alpha_composite(bg,drawn),(frame*cell,direction*cell))
        sheet.save(OUT/(key+'.png'),optimize=True)
    print('Rendered original textured animation:',character,flush=True)

audio={}
for file in (SRC/'media/sounds').glob('*'):
    if file.suffix.lower() not in ['.mp3','.wav']:continue
    match=re.match(r'(\d+)',file.name)
    if not match:continue
    name=exports.get(int(match.group(1)),'')
    if not name.endswith('.wav'):continue
    target=re.sub('[^a-z0-9-]','-',name[:-4].lower())+file.suffix.lower()
    (OUT/target).write_bytes(file.read_bytes());audio[name]=target

upgrades=[]
upgrade_source=(clean/'__Packages/World/CUpgrades.as').read_text(encoding='utf-8')
for level,record in re.findall(r'this.AddToMultipliers\((\d+),(\{[^\n]+?\})\)',upgrade_source):
    entry=literal(record);entry['threshold']=int(level);upgrades.append(entry)
data={'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'maps':maps,'animations':animations,'objects':asset_meta,'audio':audio,'upgrades':upgrades}
(ROOT/'src/expanded/boxhead-data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
manifest={'source':'games/50737/game.swf','sha256':data['sourceSha256'],'tool':root.get('_generator')+'; static XML/AS2 extraction and Pillow textured XSI rasterization',
          'maps':len(maps),'characters':[c[0] for c in characters],'animations':len(animations),'audio':len(audio),'upgrades':len(upgrades),
          'limitations':'Native server simulation, collision and four-player shared camera are adapted for online play. Original room geometry, material textures, polygon animations and audio are preserved; frame-exact Flash execution is not asserted.'}
(OUT/'provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False),flush=True)
subprocess.run(['python',str(ROOT/'scripts/import-boxhead-gun-positions.py')],check=True,cwd=ROOT)
subprocess.run(['python',str(ROOT/'scripts/import-boxhead-wall-art.py'),'--ffdec',JAR],check=True,cwd=ROOT)
