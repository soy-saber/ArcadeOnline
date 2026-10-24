"""Preserve the original 11-frame brick destruction timeline (symbol 3006)."""
from pathlib import Path
from PIL import Image
import json, hashlib
root=Path(__file__).resolve().parents[1]
source=root/'artifacts/bomb-restoration/brick-preview/DefineSprite_3006_brickExp'
images=[Image.open(source/f'{i}.png').convert('RGBA') for i in range(1,12)]
boxes=[im.getbbox() for im in images if im.getbbox()]
bounds=(min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes))
w,h=bounds[2]-bounds[0],bounds[3]-bounds[1]
sheet=Image.new('RGBA',(w*11,h))
for i,im in enumerate(images):sheet.alpha_composite(im.crop(bounds),(w*i,0))
file=root/'public/expanded/assets/bomb2/brick-burst.png'
sheet.save(file)
metadata={'source':'games/9109/game.swf','symbol':3006,'frames':11,'w':w,'h':h,'path':str(file.relative_to(root)).replace('\\','/'),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
(root/'src/expanded/bomb2-brick.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
print('Imported original 11-frame brick destruction.')
