"use strict";
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
require("esbuild").buildSync({
  entryPoints: [path.join(__dirname, "../src/native/main.ts")],
  outfile: path.join(__dirname, "../public/native/bomb.js"),
  bundle: true, format: "iife", target: "es2020", minify: false,
  legalComments: "none"
});
require("esbuild").buildSync({
  entryPoints: [path.join(__dirname, "../src/badminton/main.ts")],
  outfile: path.join(__dirname, "../public/native/badminton.js"),
  bundle: true, format: "iife", target: "es2020", minify: false,
  legalComments: "none"
});
const root = path.join(__dirname, "..");
const files = ["public/native/bomb.js", "public/native/badminton.js", ...["native", "badminton"].flatMap((dir) => fs.readdirSync(path.join(root, "src", dir)).filter((f) => f.endsWith(".ts")).map((f) => `src/${dir}/${f}`))];
const hashes = Object.fromEntries(files.map((file) => [file, crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")]));
fs.writeFileSync(path.join(__dirname, "native-build.json"), JSON.stringify({ version: 1, hashes }, null, 2) + "\n");
