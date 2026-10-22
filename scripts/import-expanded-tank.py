"""Keep original Tank Trouble recovered resource identities and reusable art."""
from pathlib import Path
from PIL import Image
import shutil,json,hashlib
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'artifacts/swf-analysis/137953'
OUT=ROOT/'public/expanded/assets/tank'
OUT.mkdir(parents=True,exist_ok=True)
for name in ['images','shapes','morphshapes','sounds','texts']:
    if (SOURCE/'game'/name).exists():shutil.copytree(SOURCE/'game'/name,OUT/'original'/name,dirs_exist_ok=True)
for symbol,name in [(212,'bullet'),(217,'frag'),(221,'gatling'),(225,'homing'),(234,'mine'),(239,'remote')]:
    folder=next((SOURCE/'runtime-preview').glob(f'DefineSprite_{symbol}_*'),None)
    if folder:
        for file in folder.glob('*.png'):
            image=Image.open(file).convert('RGBA');bounds=image.getbbox()
            if bounds:image=image.crop(bounds)
            image.save(OUT/(name+'-'+file.name))
identity={'rawSha256':hashlib.sha256((ROOT/'games/137953/game.swf').read_bytes()).hexdigest(),
 'recoveredSha256':hashlib.sha256((SOURCE/'source-game.swf').read_bytes()).hexdigest(),
 'recoveredUrl':'https://sda.4399.com/4399swf/upload_swf/ftp14/cwb/20140611/y2/TankTroublev40.swf',
 'missingImports':['Assets/Tank.swf','Assets/GameTank.swf','Assets/Crate.swf','Assets/Laika.swf'],
 'assets':[]}
for file in sorted(OUT.rglob('*')):
    if file.is_file() and file.name!='manifest.json':identity['assets'].append({'path':str(file.relative_to(OUT)).replace('\\','/'),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(OUT/'manifest.json').write_text(json.dumps(identity,indent=2),encoding='utf-8')
print(f'Imported {len(identity["assets"])} Tank Trouble art/effect/sound resources')
