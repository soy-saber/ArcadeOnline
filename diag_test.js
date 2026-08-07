"use strict";
// diag_test.js: 纯管道验证（不依赖游戏画面）——座位/姓名/按键映射/隔离
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = process.env.BASE_URL || "http://localhost:8000";
const GAME_ID = process.env.GAME_ID || "46923";
const ROOM = BASE_URL + "/room.html?game=" + GAME_ID + "&room=pipe" + Date.now();
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
  await pageA.evaluateOnNewDocument(() => {
    window.__keyboardListenerTargets = [];
    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (type === "keydown" || type === "keyup" || type === "focus" || type === "blur") {
        window.__keyboardListenerTargets.push({
          type,
          target: this === window
            ? "window"
            : this === document
              ? "document"
              : (this.tagName || this.constructor.name).toLowerCase(),
          id: this.id || null
        });
      }
      return original.call(this, type, listener, options);
    };
  });

  const load = async (page, name) => {
    await page.goto(ROOM, { waitUntil: "domcontentloaded" });
    await page.evaluate((n) => localStorage.setItem("arcade_name", n), name);
    await page.goto(ROOM, { waitUntil: "domcontentloaded" });
  };
  await load(pageA, "小明");
  await load(pageB, "小红");
  await new Promise((r) => setTimeout(r, 3000));
  logline(
    "0) 房主键盘监听目标: " +
      JSON.stringify(await pageA.evaluate(() => window.__keyboardListenerTargets))
  );

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
    window.__observedKeyEvents = [];
    window.addEventListener("keydown", (event) => {
      window.__observedKeyEvents.push({
        trusted: event.isTrusted,
        target: event.target === window
          ? "window"
          : (event.target.tagName || event.target.constructor.name).toLowerCase(),
        key: event.key,
        code: event.code,
        keyCode: event.keyCode,
        which: event.which,
        location: event.location,
        repeat: event.repeat,
        composed: event.composed,
        viewIsWindow: event.view === window,
        defaultPrevented: event.defaultPrevented
      });
    }, true);
    ArcadeNet.on("in", (m) => {
      if (m.kind === "key") {
        window.__inKeys.push(m.type + ":" + m.code);
      }
    });
  });
  await new Promise((r) => setTimeout(r, 500));

  // 3. B 点击观众画面后按 KeyD → 应映射为 ArrowRight 且到达 A
  const viewerStage = await pageB.evaluate(() => {
    const rect = document.getElementById("stage").getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await pageB.mouse.click(
    viewerStage.x + viewerStage.width / 2,
    viewerStage.y + viewerStage.height / 2
  );
  await pageB.keyboard.down("KeyD");
  await new Promise((r) => setTimeout(r, 150));
  const virtualPressed = await pageA.evaluate(() => {
    const gamepad = Array.from(navigator.getGamepads()).find(
      (item) => item && item.id === "ArcadeOnline Remote Input"
    );
    return gamepad
      ? { pressed: gamepad.buttons[15].pressed, value: gamepad.buttons[15].value }
      : null;
  });
  await pageB.keyboard.up("KeyD");
  await new Promise((r) => setTimeout(r, 150));
  const virtualReleased = await pageA.evaluate(() => {
    const gamepad = Array.from(navigator.getGamepads()).find(
      (item) => item && item.id === "ArcadeOnline Remote Input"
    );
    return gamepad
      ? { pressed: gamepad.buttons[15].pressed, value: gamepad.buttons[15].value }
      : null;
  });
  let got = await pageA.evaluate(() => window.__inKeys.slice());
  const documentFocused = await pageA.evaluate(() => document.hasFocus());
  logline("3) B点击画面后按WASD-D → A收到: [" + got.join(", ") + "]" + (got.includes("keydown:ArrowRight") && got.includes("keyup:ArrowRight") ? " ✓ 映射生效" : " ✗"));
  logline("3b) Ruffle 虚拟 D-pad 按下/释放: " + JSON.stringify({ virtualPressed, virtualReleased }));
  logline("3c) 远端窗口操作时房主 document.hasFocus(): " + documentFocused);
  if (!virtualPressed || !virtualPressed.pressed || !virtualReleased || virtualReleased.pressed) {
    throw new Error("远端按键未正确驱动 Ruffle 虚拟手柄");
  }

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
  logline(
    "6c) 房主观察到的真实/合成按键: " +
      JSON.stringify(await pageA.evaluate(() => window.__observedKeyEvents))
  );

  if (GAME_ID === "3881") {
    await pageA.evaluate(() => (window.__inKeys = []));
    await pageB.keyboard.down("Space");
    await pageB.keyboard.up("Space");
    await new Promise((r) => setTimeout(r, 800));
    got = await pageA.evaluate(() => window.__inKeys.slice());
    logline(
      "6b) B按空格放炸弹 → A收到: [" +
        got.join(", ") +
        "]" +
        (got.includes("keydown:Enter") && got.includes("keyup:Enter") ? " ✓ 映射生效" : " ✗")
    );
  }

  // 7. P2 按住移动键离座时，房主必须立即释放虚拟按键
  await pageA.evaluate(() => (window.__inKeys = []));
  await pageB.keyboard.down("KeyD");
  await new Promise((r) => setTimeout(r, 150));
  await pageB.evaluate(() => document.querySelector("#seat-2 .btn").click()); // B 离座
  await new Promise((r) => setTimeout(r, 300));
  const releasedOnLeave = await pageA.evaluate(() => {
    const gamepad = Array.from(navigator.getGamepads()).find(
      (item) => item && item.id === "ArcadeOnline Remote Input"
    );
    return gamepad ? !gamepad.buttons[15].pressed : null;
  });
  await pageB.keyboard.up("KeyD");
  logline("7) B按住D离座 → 房主虚拟方向键释放: " + (releasedOnLeave ? "✓" : "✗"));
  if (!releasedOnLeave) throw new Error("P2 离座后房主虚拟按键仍处于按下状态");

  // 8. 空游客不能注入（观战无座位按键被挡）
  await pageA.evaluate(() => (window.__inKeys = []));
  await pageB.keyboard.down("KeyD");
  await pageB.keyboard.up("KeyD");
  await new Promise((r) => setTimeout(r, 1000));
  got = await pageA.evaluate(() => window.__inKeys.slice());
  logline("8) B离座后按WASD → A收到: [" + got.join(", ") + "]" + (got.length === 0 ? " ✓ 观战不能污染" : " ✗"));

  // 9. 房主本人坐 P2 时，WASD 映射同样使用虚拟 D-pad
  await pageA.evaluate(() => document.querySelector("#seat-1 .btn").click());
  await new Promise((r) => setTimeout(r, 300));
  await pageA.evaluate(() => document.querySelector("#seat-2 .btn").click());
  await new Promise((r) => setTimeout(r, 300));
  await pageA.keyboard.down("KeyD");
  await new Promise((r) => setTimeout(r, 100));
  const localP2Pressed = await pageA.evaluate(() => {
    const gamepad = Array.from(navigator.getGamepads()).find(
      (item) => item && item.id === "ArcadeOnline Remote Input"
    );
    return gamepad ? gamepad.buttons[15].pressed : null;
  });
  await pageA.keyboard.up("KeyD");
  await new Promise((r) => setTimeout(r, 100));
  const localP2Released = await pageA.evaluate(() => {
    const gamepad = Array.from(navigator.getGamepads()).find(
      (item) => item && item.id === "ArcadeOnline Remote Input"
    );
    return gamepad ? !gamepad.buttons[15].pressed : null;
  });
  logline("9) 房主坐P2按WASD-D → 虚拟方向键按下/释放: " + localP2Pressed + "/" + localP2Released);
  if (!localP2Pressed || !localP2Released) {
    throw new Error("房主坐 P2 时 WASD 映射未驱动 Ruffle 虚拟手柄");
  }

  await browser.close();
  logline("PIPE TEST DONE");
  process.exit(0);
})().catch((e) => {
  logline("FAIL: " + e.message);
  process.exit(1);
});
