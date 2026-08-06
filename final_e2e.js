"use strict";
const puppeteer = require("puppeteer-core");
const { PNG } = require("pngjs");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOM = "http://localhost:8000/room.html?game=46923&room=final2";
const OUT = "C:\\Users\\walex\\AppData\\Local\\Temp\\opencode\\4399\\final2";
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

async function capA(pageA) {
  return pageA.evaluate(() => {
    const el = document.querySelector("ruffle-player");
    const c = el && el.shadowRoot ? el.shadowRoot.querySelector("canvas") : null;
    return c ? c.toDataURL("image/png") : null;
  });
}
async function capB(pageB) {
  return pageB.evaluate(() => {
    const c = document.querySelector("#stage canvas");
    return c ? c.toDataURL("image/png") : null;
  });
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
  const pageA = await browser.newPage();
  await pageA.setViewport({ width: 1400, height: 1000 });
  pageA.on("console", (m) => {
    if (m.type() !== "log") logline("[A] " + m.text().slice(0, 140));
  });
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1400, height: 1000 });

  const load = async (page, name) => {
    await page.goto(ROOM, { waitUntil: "domcontentloaded" });
    await page.evaluate((n) => localStorage.setItem("arcade_name", n), name);
    await page.goto(ROOM, { waitUntil: "domcontentloaded" });
  };
  await load(pageA, "小明");
  await load(pageB, "小红");

  for (let i = 0; i < 80; i++) {
    const ok = await pageA.evaluate(() => {
      const el = document.querySelector("ruffle-player");
      return !!(el && el.shadowRoot && el.shadowRoot.querySelector("canvas"));
    });
    if (ok) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  logline("A 游戏已加载（房主）");
  await new Promise((r) => setTimeout(r, 12000));

  await pageA.evaluate(() => document.querySelector("#seat-1 .btn").click());
  await pageB.evaluate(() => document.querySelector("#seat-2 .btn").click());
  await new Promise((r) => setTimeout(r, 600));

  const box = await pageA.evaluate(() => {
    const r = document.getElementById("stage").getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

  // 1) A 点 play → 双端画面同步
  await clickSlow(pageA, box.x + box.w * 0.49, box.y + box.h * 0.85);
  await new Promise((r) => setTimeout(r, 1500));
  let a1 = await capA(pageA);
  let b1 = await capB(pageB);
  logline("步骤1 play 后双端差异: " + (diffBuf(Buffer.from(a1.split(",")[1], "base64"), Buffer.from(b1.split(",")[1], "base64")) * 100).toFixed(2) + "%");

  // 2) A 点开始（选人界面）
  await clickSlow(pageA, box.x + box.w * 0.5, box.y + box.h * 0.75);
  await new Promise((r) => setTimeout(r, 4000));
  a1 = await capA(pageA);
  b1 = await capB(pageB);
  logline("步骤2 开始后双端差异: " + (diffBuf(Buffer.from(a1.split(",")[1], "base64"), Buffer.from(b1.split(",")[1], "base64")) * 100).toFixed(2) + "%");

  // 3) B 按 P2 移动键 → A 的游戏应变化（B 驱动）
  const before = await capA(pageA);
  await pageB.keyboard.down("ArrowRight");
  await new Promise((r) => setTimeout(r, 1500));
  await pageB.keyboard.up("ArrowRight");
  await new Promise((r) => setTimeout(r, 500));
  const after = await capA(pageA);
  if (before && after) {
    const d = diffBuf(Buffer.from(before.split(",")[1], "base64"), Buffer.from(after.split(",")[1], "base64"));
    logline("步骤3 B按→ 驱动 A 画面变化: " + (d * 100).toFixed(2) + "%");
  } else {
    logline("步骤3 截屏失败");
  }

  // 4) B 的画面应跟随 A
  await new Promise((r) => setTimeout(r, 1500));
  a1 = await capA(pageA);
  b1 = await capB(pageB);
  logline("步骤4 最终双端差异: " + (diffBuf(Buffer.from(a1.split(",")[1], "base64"), Buffer.from(b1.split(",")[1], "base64")) * 100).toFixed(2) + "%");

  await browser.close();
  logline("FINAL E2E DONE");
  process.exit(0);
})().catch((e) => {
  logline("FAIL: " + e.message);
  process.exit(1);
});
