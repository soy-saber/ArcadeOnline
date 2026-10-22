"""Render shipped Boxhead XSI polygon frames; never execute ActionScript."""
import json, re, hashlib
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'artifacts/swf-analysis/50737'
OUT = ROOT / 'public/expanded/assets/boxhead'
OUT.mkdir(parents=True, exist_ok=True)
def literal(value):
    return json.loads(re.sub(r'([,{]\s*)([A-Za-z_][A-Za-z_0-9]*):', r'\1"\2":', value))
models = {}
for line in (SRC / 'scripts/DefineSprite_755_TMP2639qh3hat/frame_1/DoAction.as').read_text(encoding='utf-8').splitlines():
    if line.startswith('var mRotations = '): rotations = literal(line[len('var mRotations = '):-1])
    elif line.startswith('var mMaterials = '): materials = literal(line[len('var mMaterials = '):-1])
    elif re.match(r'var m\w+ = \{mRotations:', line):
        models[line.split(' = ')[0][4:]] = (rotations, materials)
def render(name, prefix):
    rotations, materials = models[name]
    sheet = Image.new('RGBA', (64 * 8, 72 * 8))
    for direction in range(8):
        frames = rotations[direction % len(rotations)]
        for frame in range(8):
            im = Image.new('RGBA', (256, 288)); d = ImageDraw.Draw(im)
            base, _ = models['mPlayer_Default_Walk']
            base_models = base[direction % len(base)][frame % len(base[direction % len(base)])]['Models']
            # SWF animation records are deltas: Empty means inherit its partner.
            merged = dict(base_models)
            for key, model in frames[frame % len(frames)]['Models'].items():
                if not model.get('Empty'): merged[key] = model
            for model in merged.values():
                for i, vertices in enumerate(model.get('Shape_vList', [])):
                    material = model['Shape_Material'][i]; mat = materials.get(material, {})
                    col = mat.get('mColor', 0xffd5ab if 'Head' in material else 0x56755c)
                    b = model.get('Shape_Brightness', [0] * len(model.get('Shape_vList', [])))[i]
                    rgb = tuple(max(0, min(255, int(((col >> shift) & 255) * (1 + min(0, b) * .65) + max(0,b)*25))) for shift in (16,8,0))
                    points = [(128 + vertices[j] * 1.65, 255 + vertices[j+1] * 1.65) for j in range(0,len(vertices),2)]
                    if len(points) > 2: d.polygon(points, fill=rgb + (255,))
                for vertices in model.get('PEdge', []):
                    if len(vertices) >= 4: d.line([(128+vertices[j]*1.65,255+vertices[j+1]*1.65) for j in range(0,len(vertices),2)], fill=(18,20,18,255), width=2)
            sheet.alpha_composite(im.resize((64,72), Image.Resampling.LANCZOS), (frame*64, direction*72))
    sheet.save(OUT / (prefix + '.png'))
for model, prefix in [('mPlayer_Default_Handgun_Walk','player'),('mZombie_Default_Zombie_Walk','zombie'),('mDevil_Default_Devil_Attack','devil')]: render(model,prefix)
for sprite, symbol, name in [(631,'Object.Barrel','barrel'),(645,'Object.Pickup','pickup'),(660,'Object.Wall','wall')]:
    im = Image.open(SRC / f'preview/DefineSprite_{sprite}_{symbol}/1.png').convert('RGBA')
    im.crop(im.getbbox()).save(OUT / (name + '.png'))
(OUT / 'provenance.json').write_text(json.dumps({'source':'games/50737/game.swf','sha256':hashlib.sha256((ROOT/'games/50737/game.swf').read_bytes()).hexdigest(),'tool':'JPEXS 26.4.0 + Pillow','models':['mPlayer_Default_Handgun_Walk','mZombie_Default_Zombie_Walk','mDevil_Default_Devil_Attack'],'limitations':'Original polygon positions and material colors; material bitmap mapping approximated with flat fills.'},indent=2)+'\n')
print('Prepared original Boxhead polygon animation sheets and object sprites')
