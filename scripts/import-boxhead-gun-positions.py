"""Extract original per-direction/per-frame GunPosition_Right; never execute AS2."""
import argparse
import hashlib
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'artifacts/swf-analysis/50737/clean/scripts/DefineSprite_755_TMP2639qh3hat/frame_1/DoAction.as'
TARGET = ROOT / 'src/expanded/boxhead-gun-positions.json'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true')
args = parser.parse_args()

def literal(text):
    return json.loads(re.sub(r'([,{]\s*)([A-Za-z_][A-Za-z_0-9]*):', r'\1"\2":', text))

models = {}
rotations = xsi = None
for line in SOURCE.read_text(encoding='utf-8').splitlines():
    if line.startswith('var mXSIInfo = '):
        xsi = literal(line[len('var mXSIInfo = '):-1])
    elif line.startswith('var mRotations = '):
        rotations = literal(line[len('var mRotations = '):-1])
    elif re.match(r'var m\w+ = \{mRotations:', line):
        models[line.split(' = ')[0][4:]] = (rotations, xsi)

actions = ['Stand', 'Walk', 'Handgun_Stand', 'Handgun_Walk', 'UZI_Stand', 'UZI_Walk',
           'Shotgun_Stand', 'Shotgun_Walk', 'RocketLauncher_Stand', 'RocketLauncher_Walk',
           'Railgun_Stand', 'Railgun_Walk', 'HitFront', 'HitRear', 'Dying', 'Dead']
poses = {}
for action in actions:
    name = 'mPlayer_Default_' + action
    rows, info = models[name]
    factor = -math.sin(info['mTilt'] * math.pi / 180)
    anchors = []
    for row in rows:
        points = []
        for frame in row:
            position = frame['Models'].get('GunPosition_Right', {}).get('XSIInfo', {}).get('vPosition')
            points.append(None if position is None else
                          [position['mX'] * .35, factor * position['mY'] * .35, -position['mZ'] * .35])
        anchors.append(points)
    sequence = [0, 1, 2, 3, 4, 3, 2, 1] if action.endswith('Walk') else list(range(len(rows[0])))
    poses[action.replace('_', '-').lower()] = {'model': name, 'directions': len(rows),
                                              'sequence': sequence, 'anchors': anchors}

classes = ROOT / 'artifacts/swf-analysis/50737/clean/scripts/__Packages'
names = ['DrawPrimitive/XSI/CDrawPrimitive_XSI_DI', 'DrawPrimitive/XSI/CDrawPrimitive_XSI_Animation',
         'DrawPrimitive/XSI/CDrawPrimitive_XSI_Collection', 'DrawPrimitive/XSI/CDrawPrimitive_XSI_StyleSheet',
         'Thing/Creature/CThing_Creature_Player', 'Thing/Math/CThing_Angle', 'Thing/Math/CThing_Position',
         'CInput', 'Thing/Weapon/CThing_Weapon']
data = {'sourceSha256': hashlib.sha256((ROOT / 'games/50737/game.swf').read_bytes()).hexdigest(),
        'modelScriptSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'classHashes': {name: hashlib.sha256((classes / (name + '.as')).read_bytes()).hexdigest() for name in names},
        'scale': .35, 'projection': -math.sin(math.pi / 4), 'poses': poses}
content = json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'
if args.check:
    if TARGET.read_text(encoding='utf-8') != content:
        raise SystemExit('Gun-position metadata differs from original source')
    print('Gun-position metadata matches original model directions, frames and source hashes.')
else:
    TARGET.write_text(content, encoding='utf-8')
    print('Imported16 native player poses and per-frame gun positions.')
