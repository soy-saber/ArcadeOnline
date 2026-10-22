const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'games/fbw_forest');
const target = path.join(root, 'public/expanded/assets/forest');
fs.mkdirSync(target, { recursive: true });
const atlases = {};
for (const name of ['CharAssets', 'GroundAssets', 'MechAssets', 'Temples/forest/TempleAssets']) {
  const key = path.basename(name);
  const atlas = JSON.parse(fs.readFileSync(path.join(source, 'assets/atlasses', name + '.json')));
  atlases[key] = Object.fromEntries(atlas.frames.map(f => [f.filename, f]));
  fs.copyFileSync(path.join(source, 'assets/atlasses', name + '.png'), path.join(target, key + '.png'));
}
fs.copyFileSync(path.join(source, 'assets/images/TempleHallForest.jpg'), path.join(target, 'TempleHallForest.jpg'));
const tilesets = {};
for (const name of ['Ground', 'Chars', 'Objects', 'LargeObjects']) tilesets[name] = JSON.parse(fs.readFileSync(path.join(source, 'assets/tilemaps/tilesets', name + '.json')));
const levels = [];
for (let i = 1; i <= 32; i++) {
  const id = 'forest_' + String(i).padStart(2, '0');
  const file = path.join(source, 'data', i === 1 ? 'tutorials' : 'forest', 'levels', id + '.json');
  const raw = fs.readFileSync(file);
  const map = JSON.parse(raw);
  const ground = map.layers.find(l => l.name === 'Ground');
  const objects = [];
  for (const layer of map.layers) {
    if (layer.name !== 'Chars' && layer.name !== 'Objects') continue;
    for (const original of layer.objects || []) {
      const o = { ...original };
      let props = {};
      if (o.gid) {
        const gid = o.gid & 0x1fffffff;
        const set = [...map.tilesets].reverse().find(t => gid >= t.firstgid);
        const data = tilesets[path.basename(set.source, '.json')];
        const n = String(gid - set.firstgid);
        o.type = o.type || data.tiles[n]?.type || '';
        props = data.tileproperties[n] || {};
      }
      o.properties = { ...props, ...o.properties };
      if (o.type) objects.push(o);
    }
  }
  levels.push({ id, width: map.width, height: map.height, tile: map.tilewidth, ground: ground.data.map(gid => gid ? Number(tilesets.Ground.tileproperties[String((gid & 0x1fffffff) - 1)].type) : -1), objects, properties: map.properties || {}, sha256: crypto.createHash('sha256').update(raw).digest('hex') });
}
const output = { levels, atlases };
fs.writeFileSync(path.join(target, 'data.json'), JSON.stringify(output));
fs.writeFileSync(path.join(root, 'src/expanded/forest-data.json'), JSON.stringify(output));
console.log(`Imported ${levels.length} original forest maps and four sprite atlases.`);
