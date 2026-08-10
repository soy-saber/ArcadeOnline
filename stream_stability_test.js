"use strict";

const puppeteer = require("puppeteer-core");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = process.env.BASE_URL || "http://localhost:8000";
const DURATION_MS = Number(process.env.STREAM_TEST_MS) || 45000;
const ROOM = `${BASE_URL}/room.html?game=3881&room=st${String(Date.now()).slice(-8)}`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stageBox(page) {
  return page.evaluate(() => {
    const rect = document.getElementById("stage").getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

async function streamSample(page) {
  return page.evaluate(async () => {
    const stage = document.getElementById("stage");
    const video = stage.querySelector("video");
    const peers = window.__streamTestPeers || [];
    let inbound = null;
    for (const pc of peers) {
      const stats = await pc.getStats();
      for (const report of stats.values()) {
        if (report.type === "inbound-rtp" && report.kind === "video") {
          inbound = {
            bytesReceived: report.bytesReceived || 0,
            framesDecoded: report.framesDecoded || 0,
            framesDropped: report.framesDropped || 0,
            framesPerSecond: report.framesPerSecond || 0,
            jitterBufferDelay: report.jitterBufferDelay || 0,
            jitterBufferEmittedCount: report.jitterBufferEmittedCount || 0,
            packetsLost: report.packetsLost || 0
          };
        }
      }
    }
    return {
      transport: stage.dataset.streamTransport || "ws",
      connectionState: peers.map((pc) => pc.connectionState),
      currentTime: video ? video.currentTime : 0,
      readyState: video ? video.readyState : 0,
      width: video ? video.videoWidth : 0,
      height: video ? video.videoHeight : 0,
      inbound
    };
  });
}

let browser;

(async () => {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    ignoreDefaultArgs: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding"
    ],
    args: ["--no-sandbox", "--window-size=1400,1000"]
  });
  const contextA = await browser.createBrowserContext();
  const contextB = await browser.createBrowserContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await pageA.setViewport({ width: 1400, height: 1000 });
  await pageB.setViewport({ width: 1400, height: 1000 });

  for (const page of [pageA, pageB]) {
    await page.evaluateOnNewDocument(() => {
      window.__streamTestPeers = [];
      const NativePeerConnection = window.RTCPeerConnection;
      if (!NativePeerConnection) return;
      function TrackedPeerConnection(...args) {
        const pc = new NativePeerConnection(...args);
        window.__streamTestPeers.push(pc);
        return pc;
      }
      TrackedPeerConnection.prototype = NativePeerConnection.prototype;
      window.RTCPeerConnection = TrackedPeerConnection;
    });
  }

  const load = async (page, name) => {
    await page.goto(ROOM, { waitUntil: "domcontentloaded" });
    await page.evaluate((value) => localStorage.setItem("arcade_name", value), name);
    await page.goto(ROOM, { waitUntil: "domcontentloaded" });
  };
  await load(pageB, "StreamP2");
  await load(pageA, "StreamHost");

  let host = null;
  for (let attempt = 0; attempt < 120 && !host; attempt++) {
    if (await pageA.$("ruffle-player")) host = pageA;
    else if (await pageB.$("ruffle-player")) host = pageB;
    else await wait(500);
  }
  if (!host) throw new Error("No runtime host");
  const viewer = host === pageA ? pageB : pageA;
  await host.waitForFunction(() => {
    const player = document.querySelector("ruffle-player");
    return Boolean(player && player.shadowRoot && player.shadowRoot.querySelector("canvas"));
  }, { timeout: 60000 });
  await wait(7000);
  await host.evaluate(() => document.querySelector("#seat-1 .btn").click());
  await viewer.evaluate(() => document.querySelector("#seat-2 .btn").click());
  await wait(600);

  const hostStage = await stageBox(host);
  await host.mouse.click(hostStage.x + hostStage.width * 0.83, hostStage.y + hostStage.height * 0.67);
  await wait(700);
  await host.mouse.click(hostStage.x + hostStage.width * 0.82, hostStage.y + hostStage.height * 0.79);
  await wait(700);
  await host.mouse.click(hostStage.x + hostStage.width * 0.82, hostStage.y + hostStage.height * 0.71);
  await wait(1800);

  const viewerStage = await stageBox(viewer);
  await viewer.mouse.click(
    viewerStage.x + viewerStage.width / 2,
    viewerStage.y + viewerStage.height / 2
  );
  await viewer.keyboard.press("KeyD");
  await viewer.keyboard.press("Enter");
  await wait(400);
  await host.keyboard.press("Space");
  await wait(3000);

  await viewer.waitForFunction(
    () => document.getElementById("stage").dataset.streamTransport === "webrtc",
    { timeout: 20000 }
  );

  const samples = [];
  const startedAt = Date.now();
  let direction = "KeyD";
  while (Date.now() - startedAt < DURATION_MS) {
    await viewer.keyboard.press(direction);
    if (samples.length % 2 === 0) await viewer.keyboard.press("Enter");
    direction = direction === "KeyD" ? "KeyA" : "KeyD";
    await wait(5000);
    const sample = await streamSample(viewer);
    samples.push(sample);
    console.log(JSON.stringify({ second: Math.round((Date.now() - startedAt) / 1000), ...sample }));
  }

  if (samples.length < 2) throw new Error("Not enough stream samples");
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1];
    const current = samples[i];
    if (current.transport !== "webrtc") throw new Error("Stream fell back from WebRTC");
    if (!current.connectionState.includes("connected")) throw new Error("Peer connection is not connected");
    if (current.currentTime - previous.currentTime < 3) {
      throw new Error(`Video stalled at sample ${i}: ${current.currentTime - previous.currentTime}s`);
    }
    if (previous.inbound && current.inbound) {
      const decoded = current.inbound.framesDecoded - previous.inbound.framesDecoded;
      if (decoded < 60) throw new Error(`Decode rate collapsed at sample ${i}: ${decoded} frames/5s`);
    }
  }

  const first = samples[0].inbound;
  const last = samples[samples.length - 1].inbound;
  if (first && last) {
    const emitted = last.jitterBufferEmittedCount - first.jitterBufferEmittedCount;
    const delay = last.jitterBufferDelay - first.jitterBufferDelay;
    const averageJitterDelay = emitted > 0 ? delay / emitted : 0;
    console.log(`Average jitter buffer delay: ${(averageJitterDelay * 1000).toFixed(1)}ms`);
    if (averageJitterDelay > 0.25) throw new Error("Jitter buffer delay grew too large");
  }

  await browser.close();
  console.log("STREAM STABILITY PASS");
})().catch(async (error) => {
  if (browser) await browser.close().catch(() => {});
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
