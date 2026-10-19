"""Build the small runtime asset set from local JPEXS exports (no network)."""
from pathlib import Path
from shutil import copyfile
from PIL import Image, ImageOps

repo = Path(__file__).resolve().parent.parent
source = repo / "artifacts/swf-analysis/3881"
target = repo / "public/native/assets"
target.mkdir(parents=True, exist_ok=True)

def image(src, name):
    value = Image.open(src).convert("RGBA")
    bounds = value.getbbox()
    if bounds:
        value = value.crop(bounds)
    value.save(target / name)

for hero, sprite in [(1, 91), (2, 69), (3, 47), (4, 25)]:
    for direction in range(1, 5):
        image(source / f"character-preview/DefineSprite_{sprite}_hero{hero}/{direction}.png", f"hero-{hero}-{direction - 1}.png")
for sprite, frame, name in [(232, 1, "floor"), (196, 1, "crate"), (196, 7, "wall"), (372, 1, "bomb")]:
    image(source / f"board-preview/DefineSprite_{sprite}_{ {232:'bg',196:'brick',372:'bomb'}[sprite]}/{frame}.png", name + ".png")
for src, name in [("401_putBomb.wav.mp3", "place.mp3"), ("398_exp.wav.mp3", "explode.mp3"), ("403_tool.wav.mp3", "item.mp3")]:
    copyfile(source / "sounds" / src, target / name)

# Eight sampled frames per strip, with a shared bounding box so the feet do not
# jitter. The body timelines are identified from PlaceObject2 in tags.txt.
def strip(directory, name, mirror=False):
    files = sorted(directory.glob("*.png"), key=lambda p: int(p.stem))
    frames = [Image.open(files[min(len(files) - 1, i * len(files) // 8)]).convert("RGBA") for i in range(8)]
    boxes = [frame.getbbox() for frame in frames if frame.getbbox()]
    bounds = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    sheet = Image.new("RGBA", (64 * 8, 72))
    for i, frame in enumerate(frames):
        frame = frame.crop(bounds)
        if mirror:
            frame = ImageOps.mirror(frame)
        frame.thumbnail((60, 68), Image.Resampling.LANCZOS)
        sheet.alpha_composite(frame, (i * 64 + (64 - frame.width) // 2, 72 - frame.height))
    sheet.save(target / (name + ".png"))

for hero, bodies in [(1, [78, 87, 78, 90]), (2, [56, 65, 56, 68]), (3, [34, 43, 34, 46]), (4, [12, 21, 12, 24])]:
    for direction, sprite in enumerate(bodies):
        strip(source / f"walk-preview/DefineSprite_{sprite}", f"walk-{hero}-{direction}", direction == 0)

for sprite, symbol, name in [(320, "fireEffect", "fire"), (326, "freezeEffect", "ice"), (274, "exp", "blast"), (280, "heroDieSmoke", "death")]:
    strip(source / f"effects-preview/DefineSprite_{sprite}_{symbol}", "fx-" + name)
for sprite, symbol, name in [(307, "mine", "mine"), (316, "gasBomb", "gas"), (311, "grenade", "grenade")]:
    image(source / f"effects-preview/DefineSprite_{sprite}_{symbol}/1.png", name + ".png")
for direction in range(4):
    image(source / f"effects-preview/DefineSprite_306_rocket/{direction + 1}.png", f"rocket-{direction}.png")

# DefineSprite_327 has 12 named tool frames. The later frames repeat their
# animation, so use the first cycle for a stable inventory and board icon.
for frame, name in enumerate(["life", "push", "bomb", "shield", "range", "speed",
                              "rocket", "mine", "grenade", "gas", "ice", "fire"], start=1):
    image(source / f"item-preview/DefineSprite_327_tool/{frame}.png", f"item-{name}.png")
print(f"Prepared {len(list(target.iterdir()))} runtime assets")
