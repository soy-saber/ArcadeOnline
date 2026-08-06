"use strict";
const puppeteer = require("puppeteer-core");
const { PNG } = require("pngjs");
const fs = require("fs");
const path = require("path");

const OUT = "C:\\Users\\walex\\AppData\\Local\\Temp\\opencode\\4399\\alive";
fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, "progress.log");
function logline(s) {
  fs.appendFileSync(LOG, s + "\n");
  console.log(s);
}

const diffData = (da, db) => {
  const a = PNG.sync.read(Buffer.from(da.split(",")[1], "base64"));
  const b = PNG.sync.read(Buffer.from(db.split(",")[1], "base64"));
  let ch = 0, total = 0;
  for (let y = 0; y < a.height; y += 2) {
    for (let x = 0; x < a.width; x += 2) {
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
  const pageB = await browser.newPage();
  const load = async (page, name) => {
    await page.goto("http://localhost:8000/room.html?game=46923&room=alive", { waitUntil: "domcontentloaded" });
    await page.evaluate((n) => localStorage.setItem("arcade_name", n), name);
    await page.goto("http://localhost:8000/room.html?game=46923&room=alive", { waitUntil: "domcontentloaded" });
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

  const capA = () =>
    pageA.evaluate(() => {
      const el = document.querySelector("ruffle-player");
      const c = el && el.shadowRoot ? el.shadowRoot.querySelector("canvas") : null;
      return c ? c.toDataURL("image/png") : null;
    });
  const capB = () =>
    pageB.evaluate(() => {
      const c = document.querySelector("#stage canvas");
      return c ? c.toDataURL("image/png") : null;
    });

  // 标题画面：A vs B 同步性
  let a1 = await capA();
  let b1 = await capB();
  logline("标题画面 A vs B 差异: " + (a1 && b1 ? diffData(a1, b1).toFixed(2) + "%" : "null"));

  // A 点击 play
  await pageA.evaluate(() => document.querySelector("#seat-1 .btn").click());
  await new Promise((r) => setTimeout(r, 400));
  const box = await pageA.evaluate(() => {
    const r = document.getElementById("stage").getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await pageA.mouse.move(box.x + box.w * 0.49, box.y + box.h * 0.85);
  await new Promise((r) => setTimeout(r, 500));
  await pageA.mouse.down();
  await new Promise((r) => setTimeout(r, 250));
  await pageA.mouse.up();
  await new Promise((r) => setTimeout(r, 2500));

  let a2 = await capA();
  let b2 = await capB();
  logline("play 后 A 变化: " + (a1 && a2 ? diffData(a1, a2).toFixed(2) + "%" : "null"));
  logline("play 后 A vs B 差异: " + (a2 && b2 ? diffData(a2, b2).toFixed(2) + "%" : "null"));
  logline("play 后 B 变化: " + (b1 && b2 ? diffData(b1, b2).toFixed(2) + "%" : "null"));

  await browser.close();
  logline("ALIVE DONE");
  process.exit(0);
})().catch((e) => {
  logline("FAIL: " + e.message);
  process.exit(1);
});
