# 森林冰火人接入进展记录

> 日期：2026-08-14

> 2026-10-14 核对：本游戏代码使用 Phaser + Box2D，已纠正早期 Construct 2 的误记。资源已入库，房间接入尚未完成。平台现已增加原生状态同步路线，当前优先完成泡泡堂公网验收；总入口见 [README.md](README.md)。

## 目标

为 ArcadeOnline 平台引入经典双人合作游戏"森林冰火人 1：森林神殿"（Fireboy and Watergirl in the Forest Temple）。

## 游戏来源与选型

| 方案 | 结果 |
|---|---|
| 4399 原站 SWF | 站内搜索接口失效（返回推荐而非结果），未定位到游戏页 |
| pigame.cc Flash 存档 | play 页为 SPA 动态加载 + 广告 iframe，SWF 直链未暴露，放弃 |
| GitHub SWF 仓库 | 找到第 2 部（光之庙宇）SWF，但用户要第 1 部（森林神殿），未命中 |
| **GitHub H5 源码（采用）** | `w193241125/FireboyAndWatergirl` —— "脱壳得出的森林冰火人1源码"，使用 Phaser + Box2D |

用户确认：不限于 SWF，HTML5 版本可接受，故采用该 HTML5 游戏代码与资源。

## 接入情况

- 源码下载：`https://github.com/w193241125/FireboyAndWatergirl`（9.9MB zip，116 文件 / 16.7MB 解压）
- 本地存放：`games/fbw_forest/`（game.html + js/ + lib/ + bower_components/ + data/ + assets/ + images/ + css/ + game.json）
- 修复：源仓库缺 `manifest.json`（game.html 引用导致 404），已补最小 PWA manifest
- `index.html` 是 Windows UWP 壳（x-ms-webview + 广告），**网页入口是 `game.html`**
- 运行验证：`http://localhost:8000/games/fbw_forest/game.html` —— canvas 创建成功，无 JS 错误，游戏加载正常

## 集成待办（未开始）

以下是最初基于串流的 H5 接入候选方案，尚未实施。当前平台也支持原生本地模拟和状态同步；如以低延迟为目标，应先评估固定物理步长、角色/箱子/机关/平台快照及客户端预测，具体见 [TODO T11](AGENT_HANDOFF_TODO.md)。

1. **同源 iframe 托管**：房主页面 iframe 加载 `games/fbw_forest/game.html`（同源，可直接操作）
2. **输入桥接**：远端按键映射到 iframe 内的角色控制；需针对 Phaser 游戏验证合成输入的实际响应，P1=WASD / P2=方向键
3. **帧捕获**：iframe 内 canvas 走现有 `preserveDrawingBuffer` + drawImage 截帧通道（机制可复用）
4. **games.json 注册**：新增条目（type: "html5" 或类似标记，区分 SWF/Ruffle 加载路径）
5. **测试**：复用 `bomb_p2_e2e.js` / `stream_stability_test.js` 思路做 fbw 双人注入测试

## 遗留风险

- 游戏为社区"脱壳"源码，未验证版权/授权（仅供学习研究）
- 需要实测游戏画布在 iframe 和移动视口中的缩放适配
- 广告/统计残留（js/ads.js 等）后续应移除
