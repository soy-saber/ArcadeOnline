"use strict";
const puppeteer = require("puppeteer-core");
const { PNG } = require("pngjs");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE_URL = process.env.BASE_URL || "http://localhost:8000";
const GAME_ID = process.env.GAME_ID || "46923";
const ROOM = BASE_URL + "/room.html?game=" + GAME_ID + "&room=alive" + Date.now();
const OUT = process.env.TEST_OUTPUT || path.join(os.tmpdir(), "arcade-online", "alive");
fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, "progress.log");
fs.writeFileSync(LOG, "");
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
  pageA.on("console", (message) => logline("[A] " + message.text().slice(0, 500)));
  pageB.on("console", (message) => logline("[B] " + message.text().slice(0, 500)));
  pageA.on("pageerror", (error) => logline("[A pageerror] " + error.message));
  pageB.on("pageerror", (error) => logline("[B pageerror] " + error.message));
  pageA.on("response", (response) => {
    if (response.status() >= 400) logline("[A HTTP " + response.status() + "] " + response.url());
  });
  const instrumentRtc = (page) => page.evaluateOnNewDocument(() => {
    window.__rtcEvents = [];
    window.__rtcPeers = [];
    const NativePeerConnection = window.RTCPeerConnection;
    if (!NativePeerConnection) return;
    function InstrumentedPeerConnection(...args) {
      const pc = new NativePeerConnection(...args);
      window.__rtcPeers.push(pc);
      window.__rtcEvents.push({ event: "created", at: Date.now() });
      pc.addEventListener("connectionstatechange", () => {
        window.__rtcEvents.push({ event: "connection", state: pc.connectionState, at: Date.now() });
      });
      pc.addEventListener("iceconnectionstatechange", () => {
        window.__rtcEvents.push({ event: "ice", state: pc.iceConnectionState, at: Date.now() });
      });
      return pc;
    }
    InstrumentedPeerConnection.prototype = NativePeerConnection.prototype;
    window.RTCPeerConnection = InstrumentedPeerConnection;
  });
  await instrumentRtc(pageA);
  await instrumentRtc(pageB);
  if (process.env.NO_RTC_VIEWER) {
    await pageB.evaluateOnNewDocument(() => {
      Object.defineProperty(window, "RTCPeerConnection", {
        configurable: true,
        value: undefined
      });
    });
  }
  await pageA.evaluateOnNewDocument(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      window.__arcadeCapture = { type, quality };
      window.__arcadeCaptureCount = (window.__arcadeCaptureCount || 0) + 1;
      return original.call(this, callback, type, quality);
    };
  });
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
  await new Promise((r) => setTimeout(r, 15000));
  const rtcDebug = async (page) => page.evaluate(() => ({
    rtcType: typeof RTCPeerConnection,
    captureStreamType: typeof HTMLCanvasElement.prototype.captureStream,
    hostLine: document.getElementById("host-line").textContent,
    spectators: Array.from(document.querySelectorAll("#spec-list li"), (item) => item.textContent),
    transport: document.getElementById("stage").dataset.streamTransport || null,
    hostStream: document.getElementById("stage").dataset.hostStream || null,
    fallbackNeeded: document.getElementById("stage").dataset.fallbackNeeded || null,
    events: window.__rtcEvents || []
  }));
  logline("A WebRTC: " + JSON.stringify(await rtcDebug(pageA)));
  logline("B WebRTC: " + JSON.stringify(await rtcDebug(pageB)));
  const canvasInfo = await pageA.evaluate(() => {
    const player = document.querySelector("ruffle-player");
    const rect = player ? player.getBoundingClientRect() : null;
    return {
      player: player && {
        width: player.getAttribute("width"),
        height: player.getAttribute("height"),
        readyState: player.readyState,
        metadata: player.metadata || null,
        rect: rect && { width: rect.width, height: rect.height }
      },
      canvases:
        player && player.shadowRoot
          ? Array.from(player.shadowRoot.querySelectorAll("canvas"), (canvas) => ({
              width: canvas.width,
              height: canvas.height,
              className: canvas.className,
              webgl: (() => {
                const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
                return gl
                  ? {
                      width: gl.drawingBufferWidth,
                      height: gl.drawingBufferHeight,
                      preserveDrawingBuffer: gl.getContextAttributes().preserveDrawingBuffer
                    }
                  : null;
              })(),
              rect: {
                width: canvas.getBoundingClientRect().width,
                height: canvas.getBoundingClientRect().height
              }
            }))
          : []
    };
  });
  logline("画布信息: " + JSON.stringify(canvasInfo));

  const capA = () =>
    pageA.evaluate(() => {
      const el = document.querySelector("ruffle-player");
      const c = el && el.shadowRoot ? el.shadowRoot.querySelector("canvas") : null;
      return c ? c.toDataURL("image/png") : null;
    });
  const capB = () =>
    pageB.evaluate(() => {
      const video = document.querySelector("#stage video");
      if (video && video.style.display !== "none" && video.readyState >= 2) {
        const out = document.createElement("canvas");
        out.width = video.videoWidth || video.width;
        out.height = video.videoHeight || video.height;
        out.getContext("2d").drawImage(video, 0, 0, out.width, out.height);
        return out.toDataURL("image/png");
      }
      const c = document.querySelector("#stage canvas");
      return c ? c.toDataURL("image/png") : null;
    });

  // 标题画面：A vs B 同步性
  let a1 = await capA();
  let b1 = await capB();
  if (!a1 || !b1) throw new Error("房主或观众画面未生成");
  fs.writeFileSync(path.join(OUT, "host-title.png"), Buffer.from(a1.split(",")[1], "base64"));
  fs.writeFileSync(path.join(OUT, "viewer-title.png"), Buffer.from(b1.split(",")[1], "base64"));
  logline("标题画面 A vs B 差异: " + (a1 && b1 ? diffData(a1, b1).toFixed(2) + "%" : "null"));
  const streamInfo = await pageB.evaluate(async () => {
    const stage = document.getElementById("stage");
    const video = stage.querySelector("video");
    const tracks = video && video.srcObject ? video.srcObject.getVideoTracks() : [];
    let codec = null;
    for (const pc of window.__rtcPeers || []) {
      const stats = await pc.getStats();
      for (const report of stats.values()) {
        if (report.type === "inbound-rtp" && report.kind === "video" && report.codecId) {
          const codecReport = stats.get(report.codecId);
          if (codecReport) codec = codecReport.mimeType;
        }
      }
    }
    return {
      transport: stage.dataset.streamTransport || "ws",
      readyState: video ? video.readyState : 0,
      currentTime: video ? video.currentTime : 0,
      videoWidth: video ? video.videoWidth : 0,
      videoHeight: video ? video.videoHeight : 0,
      codec,
      tracks: tracks.map((track) => ({ readyState: track.readyState, muted: track.muted }))
    };
  });
  logline("观众传输: " + JSON.stringify(streamInfo));
  const capture = await pageA.evaluate(() => window.__arcadeCapture || null);
  if (streamInfo.transport === "webrtc") {
    if (
      streamInfo.readyState < 2 ||
      streamInfo.currentTime <= 0 ||
      streamInfo.videoWidth < 1100 ||
      streamInfo.videoHeight < 800 ||
      streamInfo.codec !== "video/H264" ||
      !streamInfo.tracks.some((track) => track.readyState === "live")
    ) {
      throw new Error("WebRTC 已连接但观众视频未出帧: " + JSON.stringify(streamInfo));
    }
    const captureCount = await pageA.evaluate(() => window.__arcadeCaptureCount || 0);
    await new Promise((r) => setTimeout(r, 500));
    const stableCaptureCount = await pageA.evaluate(() => window.__arcadeCaptureCount || 0);
    if (stableCaptureCount !== captureCount) {
      throw new Error("WebRTC 建立后仍在重复编码 WS 降级帧");
    }
    logline("直播编码: WebRTC 60fps 主路径");
  } else {
    if (!capture || capture.type !== "image/webp" || capture.quality !== 0.9) {
      throw new Error("WebRTC 降级后未使用 WebP 0.9 编码: " + JSON.stringify(capture));
    }
    logline("直播编码: " + capture.type + " quality=" + capture.quality + "（降级）");
  }

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
