"""Build Gun Mayhem art and collision rectangles from shipped platform masks."""
import json, hashlib
from pathlib import Path
from collections import deque
from PIL import Image, ImageOps
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'artifacts/swf-analysis/97734/preview'
OUT = ROOT / 'public/expanded/assets/gunmayhem'
OUT.mkdir(parents=True,exist_ok=True)
maps=[]
for n, label in [(1838,'Classic'),(1872,'Twin Towers'),(1875,'Crossfire')]:
    im=Image.open(SRC/f'DefineSprite_{n}/1.png').convert('RGBA'); w,h=im.size
    # Separate opaque collision islands in exported hidden platform mask.
    alpha=im.getchannel('A'); pixels=alpha.load(); seen=set(); rects=[]
    for y in range(h):
        for x in range(w):
            if pixels[x,y] < 200 or (x,y) in seen: continue
            q=deque([(x,y)]); seen.add((x,y)); points=[]
            while q:
                a,b=q.popleft(); points.append((a,b))
                for c,d in ((a-1,b),(a+1,b),(a,b-1),(a,b+1)):
                    if 0<=c<w and 0<=d<h and pixels[c,d]>=200 and (c,d) not in seen: seen.add((c,d));q.append((c,d))
            if len(points)<80: continue
            x0=min(p[0] for p in points); y0=min(p[1] for p in points); x1=max(p[0] for p in points)+1; y1=max(p[1] for p in points)+1
            rects.append({'x':round(x0/w*820+40,2),'y':round(y0/h*330+175,2),'w':round((x1-x0)/w*820,2),'h':round((y1-y0)/h*330,2)})
    im.save(OUT/f'map-{n}.png'); maps.append({'id':str(n),'label':label,'platforms':rects})
player=Image.open(SRC/'DefineSprite_823_player/1.png').convert('RGBA')
# Remove the timeline's name label; keep the original body and weapon.
player=player.crop((46,65,148,146)); player=player.crop(player.getbbox()); player.save(OUT/'player.png')
for n,symbol,name in [(373,'gun_m1911','pistol'),(434,'gun_ak47','ak47'),(484,'gun_awm','sniper'),(515,'gun_ksg','shotgun'),(609,'gun_D3','grenade'),(784,'crate','crate')]:
    im=Image.open(SRC/f'DefineSprite_{n}_{symbol}/1.png').convert('RGBA'); im.crop(im.getbbox()).save(OUT/(name+'.png'))
(ROOT/'src/expanded/gunmayhem-data.json').write_text(json.dumps(maps,separators=(',',':'))+'\n')
(OUT/'provenance.json').write_text(json.dumps({'source':'games/97734/yy1-1.swf','sha256':hashlib.sha256((ROOT/'games/97734/yy1-1.swf').read_bytes()).hexdigest(),'tool':'JPEXS 26.4.0 + Pillow','platformSprites':[1838,1872,1875],'note':'Collision islands preserve original relative layout; scaled into 900x600 arena. Colors derive from original rendered sprites.'},indent=2)+'\n')
print('Prepared original Gun Mayhem sprites and',len(maps),'platform maps')
