"use strict";

// 拦截已死亡的 mochibot.com（4399 老游戏内嵌的反盗链 bot），
// 用本地极简 SWF 冒充，让游戏正常通过加载校验、启用按钮。
// URL 保持原样 -> 游戏侧的域名校验通过；响应在本地伪造。

function botSwfResponse() {
  const bytes = new Uint8Array([
    0x46, 0x57, 0x53, 0x08, // "FWS" v8
    0x1a, 0x00, 0x00, 0x00, // 文件长度 26
    0x78, 0x00, 0x05, 0x5f, 0x00, 0x00, 0x00, 0x00, 0x0a, 0x00, // RECT 550x400
    0x00, 0x11, // 帧率 17
    0x01, 0x00, // 帧数 1
    0x01, 0x00, // ShowFrame
    0x00, 0x00 // End
  ]);
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/x-shockwave-flash",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    }
  });
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  let url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return;
  }
  if (url.hostname === "mochibot.com") {
    event.respondWith(botSwfResponse());
  }
});
