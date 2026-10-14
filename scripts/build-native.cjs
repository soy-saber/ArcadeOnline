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
const root = path.join(__dirname, "..");
const files = ["public/native/bomb.js", ...fs.readdirSync(path.join(root, "src/native")).filter((f) => f.endsWith(".ts")).map((f) => "src/native/" + f)];
const hashes = Object.fromEntries(files.map((file) => [file, crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")]));
fs.writeFileSync(path.join(__dirname, "native-build.json"), JSON.stringify({ version: 1, hashes }, null, 2) + "\n");
