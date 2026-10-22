"""Export the original five Bomb It map palettes without changing the SWF.

Prerequisites: Pillow, Java and a local FFDec jar. Example:
python scripts/import-original-maps.py --ffdec artifacts/tools/ffdec/ffdec.jar
Only selected map images and metadata are copied into the authority release.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
from xml.etree import ElementTree as ET
from PIL import Image

repo = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--ffdec", type=Path, default=repo / "artifacts/tools/ffdec/ffdec.jar")
args = parser.parse_args()
swf = repo / "games/3881/game.swf"
before = hashlib.sha256(swf.read_bytes()).hexdigest()
source = repo / "artifacts/swf-analysis/3881/original-map-preview"
xml = repo / "artifacts/swf-analysis/3881.xml"
target = repo / "public/authority/assets/maps"
target.mkdir(parents=True, exist_ok=True)
if not source.is_dir():
    subprocess.run(["java", "-jar", str(args.ffdec), "-onerror", "abort", "-selectid", "196,232", "-format", "sprite:png", "-export", "sprite", str(source), str(swf)], check=True)
if not xml.is_file():
    subprocess.run(["java", "-jar", str(args.ffdec), "-swf2xml", str(swf), str(xml)], check=True)
root = ET.parse(xml).getroot()
sprites = {int(item.get("spriteId")): item for item in root.iter("item") if item.get("type") == "DefineSpriteTag"}
brick = sprites[196]
shape_ids = {item.get("characterId") for item in brick.findall("subTags/item") if item.get("characterId")}
bounds = [item.find("shapeBounds") for item in root.iter("item") if item.get("shapeId") in shape_ids]
origin = {"x": min(int(b.get("Xmin")) for b in bounds) / 20, "y": min(int(b.get("Ymin")) for b in bounds) / 20}
manifest = {"source": "games/3881/game.swf", "sha256": before, "exporter": root.get("_generator"), "cellPixels": 30, "brickRasterOrigin": origin, "palettes": [], "files": []}
for sprite_id, symbol, prefix in [(196, "brick", "brick"), (232, "bg", "floor")]:
    sprite = sprites[sprite_id]
    frame = 1
    for tag in sprite.findall("subTags/item"):
        if tag.get("type") == "FrameLabelTag":
            manifest["palettes"].append({"spriteId": sprite_id, "frame": frame, "label": tag.get("name")})
        if tag.get("type") == "ShowFrameTag":
            frame += 1
    for frame in range(1, int(sprite.get("frameCount")) + 1):
        src = source / f"DefineSprite_{sprite_id}_{symbol}/{frame}.png"
        output = target / f"{prefix}-{frame}.png"
        im = Image.open(src).convert("RGBA")
        # Preserve the shared brick raster origin, so tall props and 2x2
        # landmarks keep their authored registration point and natural size.
        # Floors have an extra fully transparent export row/column.
        if sprite_id == 232:
            im = im.crop((0, 0, 30, 30))
        im.save(output)
        manifest["files"].append({"name": output.name, "spriteId": sprite_id, "frame": frame, "width": im.width, "height": im.height, "sha256": hashlib.sha256(output.read_bytes()).hexdigest()})
assert hashlib.sha256(swf.read_bytes()).hexdigest() == before, "Original SWF changed"
(target / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Exported {len(manifest['files'])} original map frames; SWF SHA-256 {before}")
