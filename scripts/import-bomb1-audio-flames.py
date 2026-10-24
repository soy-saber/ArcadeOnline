"""Copy original linked sounds and all 12 directional/colour blast frames."""
from pathlib import Path
from PIL import Image
import shutil, json, hashlib
root = Path(__file__).resolve().parents[1]
source = root / 'artifacts/swf-analysis/3881'
target = root / 'public/authority/assets'
pairs = {'402_rocket.mp3.mp3': 'rocket', '399_grenade.mp3.mp3': 'grenade',
         '390_bibi.wav.mp3': 'mine', '400_pushBomb.mp3.mp3': 'push',
         '395_Bombit_-_level_complete.mp3': 'complete', '397_Bombit_-_mission_failed.mp3': 'failed',
         '396_Bombit_-_mainscreen.mp3': 'menu', '391_Bombit_-_level_1.mp3': 'music1',
         '392_Bombit_-_level_2.mp3': 'music2', '393_Bombit_-_level_3.mp3': 'music3',
         '394_Bombit_-_level_4.mp3': 'music4'}
assets = []
for original, name in pairs.items():
    file = target / ('bomb1-' + name + '.mp3')
    shutil.copyfile(source / 'sounds' / original, file)
    assets.append({'path': str(file.relative_to(root)).replace('\\', '/'), 'source': original})
for n in range(1, 13):
    file = target / ('bomb1-blast-' + str(n) + '.png')
    image = Image.open(source / 'effects-preview' / 'DefineSprite_274_exp' / (str(n) + '.png')).convert('RGBA')
    image.crop(image.getbbox()).save(file)
    assets.append({'path': str(file.relative_to(root)).replace('\\', '/'), 'symbol': 274, 'frame': n})
for asset in assets:
    asset['sha256'] = hashlib.sha256((root / asset['path']).read_bytes()).hexdigest()
manifest = {'source': 'games/3881/game.swf', 'sha256': hashlib.sha256((root / 'games/3881/game.swf').read_bytes()).hexdigest(),
            'method': 'Original linked sound bytes and transparent-bound crops of static FFDec frames; blast frames are four character centres, middles, and ends, not an animation.', 'assets': assets}
(target / 'bomb1-restoration.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(f'Imported {len(assets)} original Bomb It sounds and blast frames.')
