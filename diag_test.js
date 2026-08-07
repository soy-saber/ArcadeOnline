"use strict";
// diag_test.js: 纯管道验证（不依赖游戏画面）——座位/姓名/按键映射/隔离
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = process.env.BASE_URL || "http://localhost:8000";
const ROOM = BASE_URL + "/room.html?game=46923&room=pipe" + Date.now();
const OUT = process.env.TEST_OUTPUT || path.join(os.tmpdir(), "arcade-online", "diag");
fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, "diag.log");
fs.writeFileSync(LOG, "");
function logline(s) {
  fs.appendFileSync(LOG, s + "\n");
  console.log(s);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--window-size=1400,1000"]
  });
  const pageB = await browser.newPage(); // B 先建，A 保持活动
  await pageB.setViewport({ width: 1400, height: 1000 });
  const pageA = await browser.newPage();
  await pageA.setViewport({ width: 1400, height: 1000 });

  const load = async (page, name) => {
    await page.goto(ROOM, { waitUntil: "domcontentloaded" });
    await page.evaluate((n) => localStorage.setItem("arcade_name", n), name);
    await page.goto(ROOM, { waitUntil: "domcontentloaded" });
  };
  await load(pageA, "小明");
  await load(pageB, "小红");
  await new Promise((r) => setTimeout(r, 3000));

  // 1. 占座：A=座位1, B=座位2
  await pageA.evaluate(() => document.querySelector("#seat-1 .btn").click());
  await pageB.evaluate(() => document.querySelector("#seat-2 .btn").click());
  await new Promise((r) => setTimeout(r, 1000));
  const seats = await pageB.evaluate(() => Array.from(document.querySelectorAll(".who")).map((e) => e.textContent));
  logline("1) B 视角座位显示: [" + seats.join(", ") + "]" + (seats[0].includes("小明") && seats[1].includes("小红") ? " ✓ 姓名正确" : " ✗"));

  const specs = await pageB.evaluate(() => Array.from(document.querySelectorAll("#spec-list li")).map((e) => e.textContent));
  logline("2) B 视角游客列表: [" + specs.join(", ") + "]");

  // A 上挂 in 消息计数
  await pageA.evaluate(() => {
    window.__inKeys = [];
    ArcadeNet.on("in", (m) => {
      if (m.kind === "key") window.__inKeys.push(m.type + ":" + m.code);
    });
  });
  await new Promise((r) => setTimeout(r, 500));

  // 3. B(座位2) 按 KeyD → 应映射为 ArrowRight 且到达 A
  await pageB.keyboard.down("KeyD");
  await pageB.keyboard.up("KeyD");
  await new Promise((r) => setTimeout(r, 1000));
  let got = await pageA.evaluate(() => window.__inKeys.slice());
  logline("3) B按WASD-D → A收到: [" + got.join(", ") + "]" + (got.includes("keydown:ArrowRight") && got.includes("keyup:ArrowRight") ? " ✓ 映射生效" : " ✗"));

  // 4. B(座位2) 按物理 ArrowRight → 不属于座位2物理键 → A 不应收到
  await pageA.evaluate(() => (window.__inKeys = []));
  await pageB.keyboard.down("ArrowRight");
  await pageB.keyboard.up("ArrowRight");
  await new Promise((r) => setTimeout(r, 1000));
  got = await pageA.evaluate(() => window.__inKeys.slice());
  logline("4) B按方向键 → A收到: [" + got.join(", ") + "]" + (got.length === 0 ? " ✓ 隔离生效" : " ✗ 越权"));

  // 5. A(房主,座位1) 按物理 ArrowRight → 属于座位2的游戏键，客户端应挡住
  await pageA.evaluate(() => (window.__inKeys = []));
  await pageA.keyboard.down("ArrowRight");
  await pageA.keyboard.up("ArrowRight");
  await new Promise((r) => setTimeout(r, 800));
  got = await pageA.evaluate(() => window.__inKeys.slice());
  logline("5) A(房主)按方向键 → A收到: [" + got.join(", ") + "]" + (got.length === 0 ? " ✓ 房主隔离生效" : " ✗ 房主越权"));

  // 6. A(房主,座位1) 按 KeyD → 属于座位1 → 原生直通（不注入、不回环）
  await pageA.evaluate(() => (window.__inKeys = []));
  await pageA.keyboard.down("KeyD");
  await pageA.keyboard.up("KeyD");
  await new Promise((r) => setTimeout(r, 800));
  got = await pageA.evaluate(() => window.__inKeys.slice());
  logline("6) A(房主)按WASD-D → A收到: [" + got.join(", ") + "]" + (got.length === 0 ? " ✓ 原生直通" : " ✗ 意外回环"));

  // 7. 空游客不能注入（观战无座位按键被挡）
  await pageA.evaluate(() => (window.__inKeys = []));
  await pageB.evaluate(() => document.querySelector("#seat-2 .btn").click()); // B 离座
  await new Promise((r) => setTimeout(r, 800));
  await pageB.keyboard.down("KeyD");
  await pageB.keyboard.up("KeyD");
  await new Promise((r) => setTimeout(r, 1000));
  got = await pageA.evaluate(() => window.__inKeys.slice());
  logline("7) B离座后按WASD → A收到: [" + got.join(", ") + "]" + (got.length === 0 ? " ✓ 观战不能污染" : " ✗"));

  await browser.close();
  logline("PIPE TEST DONE");
  process.exit(0);
})().catch((e) => {
  logline("FAIL: " + e.message);
  process.exit(1);
});
