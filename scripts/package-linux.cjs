"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const runNode = (...args) => execFileSync(process.execPath, args, { cwd: root, stdio: "inherit", windowsHide: true });
runNode("node_modules/typescript/bin/tsc", "--noEmit");
runNode("scripts/build-native.cjs");
runNode("scripts/verify-native-build.cjs");
const output = path.join(root, "artifacts/releases");
fs.mkdirSync(output, { recursive: true });
const staging = fs.mkdtempSync(path.join(output, "release-"));
const files = {};
function copy(relative) {
  if (/^public\/(?:native(?:\/|$)|(?:room|native-room|badminton-room)\.html$|room\.js$|sw\.js$)/.test(relative)) return;
  const source = path.join(root, relative), target = path.join(staging, relative);
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Release input must not be a symlink: ${relative}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(source).sort()) copy(relative + "/" + name);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let content = fs.readFileSync(source);
    if (/\.(sh|ts|cjs|js|json)$/.test(relative)) content = Buffer.from(content.toString("utf8").replace(/\r\n/g, "\n"));
    fs.writeFileSync(target, content);
    files[relative] = crypto.createHash("sha256").update(content).digest("hex");
  }
}
// Explicit allowlist: no .env, node_modules, SWF analysis, credentials or Git history.
for (const relative of ["package.json", "package-lock.json", "server.js", "deploy-linux.sh", "README.md", "LINUX_DEPLOY.md", "NATIVE_PLATFORM.md", "SWF_RECONSTRUCTION.md", "DEPLOYMENT_STATUS.md", "AGENT_HANDOFF_TODO.md", "PENDING_GAMES.md", "integration-notes.md", "optimization-notes.md", "public", "src/badminton/core.ts", "src/badminton/view.ts", "deploy",
  "src/authority", "src/expanded", "runtime", "SERVER_AUTHORITY.md", "ORIGINAL_MAPS.md", "EXPANDED_GAMES.md", "TANK_BOMB2_RECONSTRUCTION.md", "SHOOTERS_RECONSTRUCTION.md", "BRAWLER_FOREST_RECONSTRUCTION.md",
  "scripts/native-build.json", "scripts/verify-native-build.cjs", "scripts/verify-release.cjs", "scripts/check-public.cjs", "scripts/check-turn.cjs"]) copy(relative);
fs.writeFileSync(path.join(staging, "release-manifest.json"), JSON.stringify({ created: new Date().toISOString(), files }, null, 2) + "\n");
runNode("scripts/verify-release.cjs", staging);
execFileSync(process.execPath, [path.join(staging, "scripts/verify-native-build.cjs")], { stdio: "inherit", windowsHide: true });
const archive = path.join(output, "arcade-online-linux.tar.gz");
execFileSync("tar", ["-czf", archive, "-C", staging, "."], { stdio: "inherit", windowsHide: true });
const sha = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
fs.writeFileSync(archive + ".sha256", sha + "  arcade-online-linux.tar.gz\n");
console.log(`Linux package: ${archive}\nSHA256: ${sha}\nSize: ${(fs.statSync(archive).size / 1048576).toFixed(1)} MiB`);
