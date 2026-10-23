"""Extract original inventory HUD icons and portraits; never execute Flash scripts."""
import hashlib, json, os, subprocess
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parent.parent
CACHE=ROOT/'artifacts/fidelity-ui'
candidates=[Path(os.environ['FFDEC_JAR'])] if os.environ.get('FFDEC_JAR') else []
candidates += [ROOT/'artifacts/tools/ffdec/ffdec.jar',Path(os.environ.get('LOCALAPPDATA',''))/'Temp/opencode/4399/ffdec/ffdec.jar']
jar=next((p for p in candidates if p.is_file()),None)
if jar is None:raise SystemExit('Set FFDEC_JAR to JPEXS ffdec.jar')
def export(source,ids,target):
    target.mkdir(parents=True,exist_ok=True)
    subprocess.run(['java','-jar',str(jar),'-selectid',ids,'-export','sprite',str(target),str(source)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def source_frames(target,sid):return next(target.glob('DefineSprite_'+str(sid)+'*'))
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
source1=ROOT/'games/3881/game.swf';source2=ROOT/'games/9109/game.swf'
raw=CACHE/'bomb2-payload'
if not list(raw.glob('*.bin')):
    raw.mkdir(parents=True,exist_ok=True)
    subprocess.run(['java','-jar',str(jar),'-export','binaryData',str(raw),str(source2)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
payload=next(raw.glob('*.bin'))
export(source1,'294,528',CACHE/'import-bomb1')
export(payload,'3463',CACHE/'import-bomb2')
out1=ROOT/'public/authority/assets';out2=ROOT/'public/expanded/assets/bomb2'
assets=[]
def save(source,target,crop=None):
    image=Image.open(source).convert('RGBA')
    if crop:image=image.crop(crop)
    else:
        bounds=image.getbbox()
        if bounds:image=image.crop(bounds)
    image.save(target,optimize=True)
    assets.append({'path':str(target.relative_to(ROOT)).replace('\\','/'),'sha256':digest(target),'sourceFrame':source.name,'crop':crop})
for seat in range(1,5):save(source_frames(CACHE/'import-bomb1',528)/f'{seat}.png',out1/f'hud-portrait-{seat}.png',(9,12,54,48))
for frame,weapon in enumerate(['life','push','bomb','shield','range','speed','rocket','mine','grenade','gas','ice','fire'],1):
    save(source_frames(CACHE/'import-bomb1',294)/f'{frame}.png',out1/f'hud-weapon-{weapon}.png')
for weapon,frame in [(15,1),(16,3),(17,8),(18,6),(19,4),(20,7),(21,5),('remote-trigger',9)]:
    save(source_frames(CACHE/'import-bomb2',3463)/f'{frame}.png',out2/f'hud-weapon-{weapon}.png')
manifest={'sources':[{'path':'games/3881/game.swf','sha256':digest(source1),'symbols':[294,528]},
 {'path':'games/9109/game.swf','sha256':digest(source2),'embeddedSha256':digest(payload),'symbols':[3463]}],
 'method':'JPEXS static sprite export; transparent bounds crop; original inventory HUD artwork, no generated replacement graphics','assets':assets}
(ROOT/'public/authority/assets/inventory-hud.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Imported {len(assets)} original HUD icons and portraits')
