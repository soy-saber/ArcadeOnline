# 优化方案记录

## 方案 1（已确认，待实施）：WebRTC 视频流替换 WS 帧直播

**背景**：当前房主直播用 WebSocket + JPEG 截帧（100ms 间隔、质量 0.6），存在：
- 帧率仅 10fps，观众端动画幻灯片化
- 输入→显示延迟 100~200ms
- 每观众 ~1~2.4Mbps 带宽，TCP 无拥塞控制，慢观众拖累全房

**思路**：架构方向（单实例 + 输入转发 + 画面流）与 Steam Remote Play Together / Parsec 一致，仅传输层落后。改用浏览器原生 WebRTC，服务器退化为信令/房间管理。

**要点**：
- 房主 `canvas.captureStream()`（或 `getDisplayMedia`）获取 MediaStream
- `RTCPeerConnection` P2P 直连 房主↔观众，UDP 传输，丢帧不重传
- 视频编码用 WebCodecs 硬编 H.264（可在 Worker 中，避免主线程阻塞）
- 服务器只负责：房间管理 + WebSocket 信令（offer/answer/ICE 交换）
- 目标：60fps、局域网延迟 <50ms
- 观众退化为降级路径：不支持 WebRTC 时回退现有 WS+JPEG

**改动范围**：`public/room.js`（串流/接收侧）、`server.js`（信令消息转发，现有房间逻辑基本复用）、`public/arcade.js`（可选扩展信令通道）

**依赖**：无新增依赖（全部浏览器原生 API；Node 侧仅需 ws 即可做信令）

**状态**：待实施
