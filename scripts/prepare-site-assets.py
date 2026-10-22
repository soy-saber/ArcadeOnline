"""Import a selected generated background; default mode preserves the wallpaper."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--background', type=Path, help='Selected generated image')
    parser.add_argument('--prompt', type=Path, help='Exact generation prompt text')
    parser.add_argument('--model', help='Model label displayed by the website')
    parser.add_argument('--max-width', type=int, default=1280, help='Maximum output width')
    parser.add_argument('--quality', type=int, default=78, help='WebP quality (1-100)')
    parser.add_argument('--composition', help='Description of the selected composition')
    args = parser.parse_args()
    if args.background and (not args.prompt or not args.model):
        parser.error('--background requires --prompt and --model')
    if args.max_width < 1 or not 1 <= args.quality <= 100:
        parser.error('--max-width must be positive; --quality must be 1-100')
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / 'site-artwork.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    target = OUT / 'yuuka-kurisu-background.webp'
    if args.background:
        prompt = args.prompt.read_text(encoding='utf-8-sig').strip()
        if not prompt:
            raise ValueError('Generation prompt is empty')
        with Image.open(args.background) as source:
            dimensions = list(source.size)
            output = source.convert('RGB')
            if output.width > args.max_width:
                output = output.resize((args.max_width, round(output.height * args.max_width / output.width)), Image.Resampling.LANCZOS)
            output.save(target, 'WEBP', quality=args.quality, method=6)
            output_dimensions = list(output.size)
        (OUT / 'site-background-prompt.txt').write_text(prompt + '\n', encoding='utf-8')
        manifest['background'] = {
            'path': '/assets/yuuka-kurisu-background.webp',
            'method': 'Generated and reference-corrected through the user-selected website with Playwright; converted to WebP with Pillow',
            'website': 'https://l0veyou.com/chat',
            'websiteModelLabel': args.model,
            'promptPath': '/assets/site-background-prompt.txt',
            'sourceImageSha256': digest(args.background),
            'sourceDimensions': dimensions,
            'outputDimensions': output_dimensions,
            'outputBytes': target.stat().st_size,
            'composition': args.composition or 'Yuuka left with black/blue mechanical hair accessories and elliptical halo; Kurisu right with clock/circuit motifs; violet/amber night backdrop and dark central space',
            'sources': manifest.get('background', {}).get('sources', []),
        }
    if not target.exists() or 'background' not in manifest:
        raise ValueError('Import a selected background before refreshing provenance')
    manifest['background']['sha256'] = digest(target)
    manifest['covers'] = []
    for game in json.loads((ROOT / 'public/games.json').read_text(encoding='utf-8')):
        cover = ROOT / 'public' / game['cover'].lstrip('/')
        if not cover.is_file():
            raise FileNotFoundError(cover)
        manifest['covers'].append({
            'game': game['id'], 'path': game['cover'], 'sha256': digest(cover),
            'source': 'Current reconstructed game canvas capture',
        })
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print('Saved selected background and provenance' if args.background else 'Preserved selected background; refreshed provenance')


if __name__ == '__main__':
    main()
