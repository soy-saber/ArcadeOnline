"use strict";
const puppeteer = require("puppeteer-core");
const { PNG } = require("pngjs");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOM = "http://localhost:8000/room.html?game=46923&room=e2e_nomock";
const OUT = "C:\\Users\\walex\\AppData\\Local\\Temp\\opencode\\4399\\e2e3";
fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, "progress.log");
function logline(s) {
  fs.appendFileSync(LOG, s + "\n");
  console.log(s);
}

function emptySwf() {
  const rect = Buffer.from([0x78, 0x00, 0x05, 0x5f, 0x00, 0x00, 0x00, 0x00, 0x0a, 0x00]);
  const rest = Buffer.from([0x00, 0x11, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]);
  const body = Buffer.concat([rect, rest]);
  const head = Buffer.concat([Buffer.from("FWS\x09"), Buffer.from([0, 0, 0, 0])]);
  head.writeUInt32LE(8 + body.length, 4);
  return Buffer.concat([head, body]);
}

function diffPixels(bufA, bufB) {
  const a = PNG.sync.read(bufA);
  const b = PNG.sync.read(bufB);
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let changed = 0;
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) << 2;
      total++;
      if (
        Math.abs(a.data[i] - b.data[i]) > 12 ||
        Math.abs(a.data[i + 1] - b.data[i + 1]) > 12 ||
        Math.abs(a.data[i + 2] - b.data[i + 2]) > 12
      ) {
        changed++;
      }
    }
  }
  return changed / total;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--window-size=1400,1000"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  page.on("console", (m) => logline("[c] " + m.text().slice(0, 200)));

  const NOMOCK = !!process.env.NOMOCK;
  if (!NOMOCK) {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.url().includes("mochibot.com")) {
        req.respond({
          status: 200,
          contentType: "application/x-shockwave-flash",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: emptySwf()
        });
      } else {
        req.continue();
      }
    });
  }
  if (NOMOCK) logline("NOMOCK MODE: no mochibot interception");

  await page.goto(ROOM, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("arcade_name", "小明"));
  await page.goto(ROOM, { waitUntil: "domcontentloaded" });

  let canvasAt = null;
  for (let i = 0; i < 80; i++) {
    const has = await page.evaluate(() => {
      const el = document.querySelector("ruffle-player");
      return !!(el && el.shadowRoot && el.shadowRoot.querySelector("canvas"));
    });
    if (has) {
      canvasAt = i * 0.5;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  logline("shadow canvas at: " + (canvasAt !== null ? canvasAt + "s" : "NEVER"));
  if (canvasAt === null) process.exit(2);

  const stageBox = await page.evaluate(() => {
    const r = document.getElementById("stage").getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  logline("stage: " + JSON.stringify(stageBox));

  await new Promise((r) => setTimeout(r, 3000));
  const shot = async (name) => {
    const buf = await page.screenshot({ encoding: "binary" });
    fs.writeFileSync(path.join(OUT, name), buf);
    return buf;
  };
  const base = await shot("base.png");
  logline("base shot taken");

  await page.evaluate(() => document.querySelector("#seat-1 .btn").click());
  await new Promise((r) => setTimeout(r, 1000));
  logline("seated P1");

  let hit = null;
  outer:
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 6; gx++) {
      const cx = stageBox.x + (stageBox.w * (gx + 0.5)) / 6;
      const cy = stageBox.y + (stageBox.h * (gy + 0.5)) / 4;
      const before = await shot("s_b.png");
      await page.mouse.move(cx, cy);
      await new Promise((r) => setTimeout(r, 250));
      await page.mouse.click(cx, cy);
      await new Promise((r) => setTimeout(r, 450));
      const after = await shot("s_c.png");
      const d = diffPixels(before, after);
      logline("grid(" + gx + "," + gy + ") change=" + (d * 100).toFixed(2) + "%");
      if (d > 0.02) {
        hit = { cx, cy, d };
        break outer;
      }
    }
  }
  logline("FIRST RESPONSIVE: " + (hit ? JSON.stringify(hit) : "NONE"));

  if (hit) {
    await new Promise((r) => setTimeout(r, 2500));
    const after = await shot("after_hit.png");
    logline("after-hit change: " + (diffPixels(base, after) * 100).toFixed(2) + "%");

    const k1 = await shot("key_before.png");
    await page.keyboard.down("d");
    await new Promise((r) => setTimeout(r, 800));
    const k2 = await shot("key_hold.png");
    await page.keyboard.up("d");
    logline("key D change: " + (diffPixels(k1, k2) * 100).toFixed(2) + "%");
  }

  await browser.close();
  logline("E2E DONE");
  process.exit(0);
})().catch((e) => {
  logline("FAIL: " + e.message);
  process.exit(1);
});
