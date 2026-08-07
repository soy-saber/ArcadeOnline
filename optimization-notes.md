# 优化方案记录

## 方案 1：WebRTC 视频流替换 WS 截帧直播

**状态**：已实施（2026-08-07）

**当前实现**：
- 房主以 60fps 重绘游戏合成画布，通过 `canvas.captureStream(60)` 输出视频轨道
- 每位支持 WebRTC 的观众使用独立 `RTCPeerConnection`，通过 WebSocket 交换 offer、answer 和 ICE
- 视频编码交由浏览器 WebRTC 媒体管线处理；双方支持时优先协商 H.264，并限制为 4Mbps / 60fps
- 观众收到并实际播放首帧后，向服务器确认使用 WebRTC；服务器随后停止向该观众转发截帧
- WebRTC 不可用、协商失败或视频中断时，自动回退 WebSocket + WebP（100ms、质量 0.9）
- 慢客户端仍受 WebSocket 缓冲上限保护，不会拖累其他降级观众
- 房主转移、成员离开和 PeerConnection 失败时会清理旧连接并重新协商

**验证**：
- 服务端冒烟测试覆盖信令方向和房间隔离、传输状态切换、降级帧筛选
- Chromium 双页面测试覆盖 ICE 建连、H.264 协商、远端视频出帧、画面一致性，以及 WebRTC 建立后停止 WebP 编码

**仍需部署/验收**：
- 当前使用公共 STUN，未配置 TURN；对称 NAT 或严格防火墙环境可能回退到 WebSocket
- 需要在目标局域网设备上实测端到端延迟，确认是否达到 `<50ms` 目标

**依赖**：无新增 npm 依赖，浏览器侧使用原生 WebRTC API。

## 方案 2：远端键盘改用 Ruffle 虚拟手柄输入

**状态**：已实施（2026-08-07）

**原因**：浏览器创建的 `KeyboardEvent` 始终是非可信事件；输入虽然已从 P2 正确映射并转发到房主，但 Ruffle 不保证把这种合成事件交给 SWF。

**当前实现**：
- 房主页面向 Ruffle 提供一个标准虚拟 Gamepad，并保留浏览器已有的真实手柄
- P1 的 WASD 映射到手柄面键，P2 的方向键映射到 D-pad；Space 和 Enter 映射到两个扳机键
- 虚拟对象通过 Ruffle 的 `Gamepad` / `GamepadButton` 类型检查，按钮状态由远端 keydown/keyup 直接更新
- 快速点按至少保持 40ms，避免按下和释放落在同一次 Ruffle 轮询之间
- 离座、断线、房主切换和播放器销毁时立即释放相关按钮，防止卡键
- 不支持 Gamepad API 的旧浏览器继续使用 DOM 键盘事件降级

**验证**：
- Chromium 双页面测试覆盖 P2 的 WASD 到 P2 方向键映射、虚拟 D-pad 按下/释放、离座释放和观众输入隔离
- 覆盖房主本人坐 P2 时的本地 WASD 映射
- 已确认 Ruffle 的实际加载配置包含全部按钮到 Flash keyCode 的映射
