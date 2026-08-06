"use strict";
const puppeteer = require("puppeteer-core");
const { PNG } = require("pngjs");
const fs = require("fs");
const path = require("path");

const OUT = "C:\\Users\\walex\\AppData\\Local\\Temp\\opencode\\4399\\stab2";
fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, "progress.log");
function logline(s) {
  fs.appendFileSync(LOG, s + "\n");
  console.log(s);
}

const diffB = (a, b) => {
  let ch = 0, total = 0;
  for (let y = 0; y < a.height; y += 3) {
    for (let x = 0; x < a.width; x += 3) {
      const k = (a.width * y + x) << 2;
      total++;
      if (Math.abs(a.data[k] - b.data[k]) > 10 || Math.abs(a.data[k + 1] - b.data[k + 1]) > 10 || Math.abs(a.data[k + 2] - b.data[k + 2]) > 10) ch++;
    }
  }
  return (ch / total) * 100;
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: ["--no-sandbox"]
  });
  const pageA = await browser.newPage();
  pageA.on("console", (m) => {
    const t = m.text();
    if (t.indexOf("ERROR") >= 0 || t.indexOf("Failed") >= 0) logline("[A-err] " + t.slice(0, 160));
  });
  const pageB = await browser.newPage();
  pageB.on("console", (m) => {
    const t = m.text();
    if (t.indexOf("ERROR") >= 0 || t.indexOf("Failed") >= 0) logline("[B-err] " + t.slice(0, 160));
  });

  const load = async (page, name) => {
    await page.goto("http://localhost:8000/room.html?game=46923&room=stab2", { waitUntil: "domcontentloaded" });
    await page.evaluate((n) => localStorage.setItem("arcade_name", n), name);
    await page.goto("http://localhost:8000/room.html?game=46923&room=stab2", { waitUntil: "domcontentloaded" });
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
  await new Promise((r) => setTimeout(r, 15000));
  logline("A 游戏已加载，开始进入游戏流程");

  await pageA.evaluate(() => document.querySelector("#seat-1 .btn").click());
  await pageB.evaluate(() => document.querySelector("#seat-2 .btn").click());
  await new Promise((r) => setTimeout(r, 500));
  const box = await pageA.evaluate(() => {
    const r = document.getElementById("stage").getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const clickSlow = async (x, y) => {
    await pageA.mouse.move(x, y);
    await new Promise((r) => setTimeout(r, 400));
    await pageA.mouse.down();
    await new Promise((r) => setTimeout(r, 200));
    await pageA.mouse.up();
    await new Promise((r) => setTimeout(r, 1200));
  };
  // play
  await clickSlow(box.x + box.w * 0.49, box.y + box.h * 0.85);
  logline("play 已点击");
  await new Promise((r) => setTimeout(r, 1500));
  // 选人界面：选角色 + 开始（扫描几个候选点）
  for (const [fx, fy] of [[0.5, 0.6], [0.5, 0.75], [0.3, 0.6], [0.7, 0.6], [0.5, 0.5]]) {
    await clickSlow(box.x + box.w * fx, box.y + box.h * fy);
  }
  logline("选人界面已操作");

  // 持续按方向键驱动游戏 + 监控 B 画面
  let prev = null;
  let frozen = 0;
  for (let t = 0; t < 20; t++) {
    await pageB.keyboard.press("ArrowRight");
    await pageB.keyboard.press("ArrowLeft");
    await new Promise((r) => setTimeout(r, 2500));
    const cur = await pageB.evaluate(() => {
      const c = document.querySelector("#stage canvas");
      return c ? c.toDataURL("image/png") : null;
    });
    if (cur && prev) {
      const a = PNG.sync.read(Buffer.from(prev.split(",")[1], "base64"));
      const b = PNG.sync.read(Buffer.from(cur.split(",")[1], "base64"));
      const pct = diffB(a, b);
      logline("t+" + (t + 1) * 2.5 + "s B画面: " + pct.toFixed(2) + "% 变化");
      if (pct < 0.1) frozen++;
    }
    prev = cur;
  }
  logline("低变化次数: " + frozen + "/20（>15 说明画面基本不动）");

  await browser.close();
  logline("STAB2 DONE");
  process.exit(0);
})().catch((e) => {
  logline("FAIL: " + e.message);
  process.exit(1);
});
