"use strict";
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
require("esbuild").buildSync({
  entryPoints: [path.join(__dirname, "../src/authority/engine.ts")],
  outfile: path.join(__dirname, "../runtime/authority.cjs"),
  bundle: true, platform: "node", format: "cjs", target: "node22", legalComments: "none"
});
require("esbuild").buildSync({
  entryPoints: [path.join(__dirname, "../src/authority/main.ts")],
  outfile: path.join(__dirname, "../public/authority/game.js"),
  bundle: true, format: "iife", target: "es2020", legalComments: "none"
});
const root = path.join(__dirname, "..");
const files = ["public/authority/game.js", "runtime/authority.cjs", "src/badminton/core.ts", "src/badminton/view.ts", ...["authority", "expanded"].flatMap((dir) => fs.readdirSync(path.join(root, "src", dir)).filter((f) => /\.(ts|json)$/.test(f)).map((f) => `src/${dir}/${f}`))];
const hashes = Object.fromEntries(files.map((file) => [file, crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n")).digest("hex")]));
fs.writeFileSync(path.join(__dirname, "native-build.json"), JSON.stringify({ version: 1, hashes }, null, 2) + "\n");
