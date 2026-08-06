"use strict";
const puppeteer = require("puppeteer-core");
const { PNG } = require("pngjs");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = "http://localhost:8000/room.html?game=46923&room=final";
const OUT = "C:\\Users\\walex\\AppData\\Local\\Temp\\opencode\\4399\\final";
fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, "progress.log");
function logline(s) {
  fs.appendFileSync(LOG, s + "\n");
  console.log(s);
}

function diffBuf(bufA, bufB) {
  let a, b;
  try {
    a = PNG.sync.read(bufA);
    b = PNG.sync.read(bufB);
  } catch (e) {
    return 0;
  }
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let changed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) << 2;
      if (
        Math.abs(a.data[i] - b.data[i]) > 12 ||
        Math.abs(a.data[i + 1] - b.data[i + 1]) > 12 ||
        Math.abs(a.data[i + 2] - b.data[i + 2]) > 12
      ) {
        changed++;
      }
    }
  }
  return changed / (w * h);
}

const clickSlow = async (page, x, y) => {
  await page.mouse.move(x, y);
  await new Promise((r) => setTimeout(r, 500));
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 250));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 1200));
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--window-size=1400,1000"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  page.on("console", (m) => {
    if (m.type() !== "log") logline("[c] " + m.text().slice(0, 160));
  });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("arcade_name", "小明"));
  await page.goto(URL, { waitUntil: "domcontentloaded" });

  for (let i = 0; i < 80; i++) {
    const has = await page.evaluate(() => {
      const el = document.querySelector("ruffle-player");
      return !!(el && el.shadowRoot && el.shadowRoot.querySelector("canvas"));
    });
    if (has) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  logline("game loaded");
  await new Promise((r) => setTimeout(r, 12000));
  logline("title ready");

  await page.evaluate(() => document.querySelector("#seat-1 .btn").click());
  await new Promise((r) => setTimeout(r, 800));

  const box = await page.evaluate(() => {
    const r = document.getElementById("stage").getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  logline("stage: " + JSON.stringify(box));

  const shot = async (name) => {
    const b = await page.screenshot({ encoding: "binary" });
    fs.writeFileSync(path.join(OUT, name), b);
    return b;
  };

  // 1) 标题 -> play
  const t0 = await shot("0_title.png");
  await clickSlow(page, box.x + box.w * 0.49, box.y + box.h * 0.85);
  const t1 = await shot("1_after_play.png");
  logline("STEP play click: " + (diffBuf(t0, t1) * 100).toFixed(2) + "%");

  // 2) 选人界面扫描
  let activated = false;
  for (const [fx, fy] of [
    [0.3, 0.5], [0.5, 0.5], [0.7, 0.5],
    [0.3, 0.6], [0.5, 0.6], [0.7, 0.6],
    [0.2, 0.75], [0.5, 0.75], [0.8, 0.75],
    [0.5, 0.35], [0.5, 0.9]
  ]) {
    const before = await shot("s_b.png");
    await clickSlow(page, box.x + box.w * fx, box.y + box.h * fy);
    const after = await shot("s_a.png");
    const d = diffBuf(before, after);
    logline("select click (" + fx + "," + fy + "): " + (d * 100).toFixed(2) + "%");
    if (d > 0.05) {
      activated = true;
      logline("SELECT ACTIVATED at (" + fx + "," + fy + ")");
      break;
    }
  }
  if (!activated) {
    logline("select did not activate - trying more points");
    for (const [fx, fy] of [[0.15, 0.8], [0.85, 0.8], [0.5, 0.15], [0.15, 0.3], [0.85, 0.3]]) {
      const before = await shot("s_b.png");
      await clickSlow(page, box.x + box.w * fx, box.y + box.h * fy);
      const after = await shot("s_a.png");
      const d = diffBuf(before, after);
      logline("select click2 (" + fx + "," + fy + "): " + (d * 100).toFixed(2) + "%");
      if (d > 0.05) {
        activated = true;
        logline("SELECT ACTIVATED at (" + fx + "," + fy + ")");
        break;
      }
    }
  }

  // 3) 键盘测试
  if (activated) {
    await new Promise((r) => setTimeout(r, 2000));
    const k1 = await shot("k_before.png");
    await page.keyboard.down("d");
    await new Promise((r) => setTimeout(r, 1200));
    const k2 = await shot("k_holding.png");
    await page.keyboard.up("d");
    logline("KEY D: " + (diffBuf(k1, k2) * 100).toFixed(2) + "%");
    await new Promise((r) => setTimeout(r, 500));
    const k3 = await shot("k_after.png");
    logline("KEY D after-release: " + (diffBuf(k1, k3) * 100).toFixed(2) + "%");
  }

  await browser.close();
  logline("E2E DONE");
  process.exit(0);
})().catch((e) => {
  logline("FAIL: " + e.message);
  process.exit(1);
});
