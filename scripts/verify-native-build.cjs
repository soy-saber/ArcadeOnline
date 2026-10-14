"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "native-build.json"), "utf8"));
for (const [file, expected] of Object.entries(manifest.hashes)) {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
  if (actual !== expected) throw new Error(`Stale native build: ${file}. Run npm run build:native before packaging/deploying.`);
}
console.log("Native build matches source.");
