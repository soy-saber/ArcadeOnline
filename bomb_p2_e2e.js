"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const puppeteer = require("puppeteer-core");
const { PNG } = require("pngjs");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = process.env.BASE_URL || "http://localhost:8000";
const ROOM = `${BASE_URL}/room.html?game=3881&room=bp${String(Date.now()).slice(-8)}`;
const OUT = process.env.TEST_OUTPUT || path.join(os.tmpdir(), "arcade-online", "bomb-p2");

fs.mkdirSync(OUT, { recursive: true });

function changedRatio(before, after, crop) {
  const a = PNG.sync.read(before);
  const b = PNG.sync.read(after);
  let changed = 0;
  let total = 0;
  for (let y = crop.y; y < crop.y + crop.height; y++) {
    for (let x = crop.x; x < crop.x + crop.width; x++) {
      const i = (y * a.width + x) * 4;
      total++;
      if (
        Math.abs(a.data[i] - b.data[i]) > 18 ||
        Math.abs(a.data[i + 1] - b.data[i + 1]) > 18 ||
        Math.abs(a.data[i + 2] - b.data[i + 2]) > 18
      ) {
        changed++;
      }
    }
  }
  return changed / total;
}

async function waitForCanvas(page) {
  await page.waitForFunction(() => {
    const player = document.querySelector("ruffle-player");
    return Boolean(player && player.shadowRoot && player.shadowRoot.querySelector("canvas"));
  }, { timeout: 60000 });
}

async function captureHostCanvas(page, name) {
  const dataUrl = await page.evaluate(() => {
    const player = document.querySelector("ruffle-player");
    return player.shadowRoot.querySelector("canvas").toDataURL("image/png");
  });
  const buffer = Buffer.from(dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(OUT, name), buffer);
  return buffer;
}

async function stageBox(page) {
  return page.evaluate(() => {
    const rect = document.getElementById("stage").getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

let browser;

(async () => {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--window-size=1400,1000"]
  });
  const hostContext = await browser.createBrowserContext();
  const guestContext = await browser.createBrowserContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await host.setViewport({ width: 1400, height: 1000 });
  await guest.setViewport({ width: 1400, height: 1000 });

  const load = async (page, name) => {
    await page.goto(ROOM, { waitUntil: "domcontentloaded" });
    await page.evaluate((value) => localStorage.setItem("arcade_name", value), name);
    await page.goto(ROOM, { waitUntil: "domcontentloaded" });
  };

  // The latest member becomes the active host in an empty room.
  await load(guest, "BombP2");
  await load(host, "BombHost");
  let runtimeHost = null;
  for (let attempt = 0; attempt < 120 && !runtimeHost; attempt++) {
    if (await host.$("ruffle-player")) runtimeHost = host;
    else if (await guest.$("ruffle-player")) runtimeHost = guest;
    else await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!runtimeHost) {
    const debug = await Promise.all([host, guest].map((page) => page.evaluate(() => ({
      hostLine: document.getElementById("host-line")?.textContent || null,
      role: document.getElementById("role-status")?.textContent || null,
      members: document.getElementById("member-count")?.textContent || null,
      title: document.title
    }))));
    throw new Error(`Neither browser became the room host: ${JSON.stringify(debug)}`);
  }
  const runtimeGuest = runtimeHost === host ? guest : host;
  console.log(`Runtime host: ${runtimeHost === host ? "host context" : "guest context"}`);
  await waitForCanvas(runtimeHost);
  console.log("Ruffle canvas ready");
  await new Promise((resolve) => setTimeout(resolve, 8000));
  await runtimeHost.evaluate(() => document.querySelector("#seat-1 .btn").click());
  await runtimeGuest.evaluate(() => document.querySelector("#seat-2 .btn").click());
  await new Promise((resolve) => setTimeout(resolve, 800));

  const hostStage = await stageBox(runtimeHost);
  await runtimeHost.mouse.click(
    hostStage.x + hostStage.width * 0.83,
    hostStage.y + hostStage.height * 0.67
  );
  await new Promise((resolve) => setTimeout(resolve, 800));
  await runtimeHost.mouse.click(
    hostStage.x + hostStage.width * 0.82,
    hostStage.y + hostStage.height * 0.79
  );
  await new Promise((resolve) => setTimeout(resolve, 800));
  await runtimeHost.mouse.click(
    hostStage.x + hostStage.width * 0.82,
    hostStage.y + hostStage.height * 0.71
  );
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const before = await captureHostCanvas(runtimeHost, "before-p2-input.png");

  const guestStage = await stageBox(runtimeGuest);
  await runtimeGuest.mouse.click(
    guestStage.x + guestStage.width / 2,
    guestStage.y + guestStage.height / 2
  );
  await runtimeGuest.keyboard.press("KeyD");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const afterMove = await captureHostCanvas(runtimeHost, "after-p2-move.png");

  await runtimeGuest.keyboard.press("Enter");
  await new Promise((resolve) => setTimeout(resolve, 700));
  const afterConfirm = await captureHostCanvas(runtimeHost, "after-p2-confirm.png");
  await runtimeHost.keyboard.press("Space");
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const afterBothConfirm = await captureHostCanvas(runtimeHost, "after-both-confirm.png");

  const image = PNG.sync.read(afterMove);
  const scaleX = image.width / 550;
  const scaleY = image.height / 400;
  const p2Marker = {
    x: Math.round(275 * scaleX),
    y: Math.round(45 * scaleY),
    width: Math.round(85 * scaleX),
    height: Math.round(90 * scaleY)
  };
  const moveChange = changedRatio(before, afterMove, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height
  });
  const confirmChange = changedRatio(afterMove, afterConfirm, p2Marker);
  const gameTransition = changedRatio(afterConfirm, afterBothConfirm, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height
  });

  console.log(`P2 move frame change: ${(moveChange * 100).toFixed(2)}%`);
  console.log(`P2 confirm marker change: ${(confirmChange * 100).toFixed(2)}%`);
  console.log(`Both players confirmed frame change: ${(gameTransition * 100).toFixed(2)}%`);
  if (moveChange < 0.001) throw new Error("P2 movement did not change the character selection screen");
  if (gameTransition < 0.1) throw new Error("P2 Enter did not lock; P1 confirmation stayed on character selection");

  await browser.close();
  console.log("BOMB P2 E2E PASS");
})().catch(async (error) => {
  if (browser) await browser.close().catch(() => {});
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
