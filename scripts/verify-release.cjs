"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "release-manifest.json"), "utf8"));
for (const [name, expected] of Object.entries(manifest.files)) {
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep)) throw new Error("Invalid release path");
  const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (actual !== expected) throw new Error(`Release checksum mismatch: ${name}`);
}
console.log(`Release verified (${Object.keys(manifest.files).length} files).`);
