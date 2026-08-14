# 森林冰火人接入进展记录

> 日期：2026-08-14

## 目标

为 ArcadeOnline 平台引入经典双人合作游戏"森林冰火人 1：森林神殿"（Fireboy and Watergirl in the Forest Temple）。

## 游戏来源与选型

| 方案 | 结果 |
|---|---|
| 4399 原站 SWF | 站内搜索接口失效（返回推荐而非结果），未定位到游戏页 |
| pigame.cc Flash 存档 | play 页为 SPA 动态加载 + 广告 iframe，SWF 直链未暴露，放弃 |
| GitHub SWF 仓库 | 找到第 2 部（光之庙宇）SWF，但用户要第 1 部（森林神殿），未命中 |
| **GitHub H5 源码（采用）** | `w193241125/FireboyAndWatergirl` —— "脱壳得出的森林冰火人1源码"，Construct 2 导出，完整可玩 |

用户确认：不限于 SWF，HTML5 版本可接受，故采用 Construct 2 完整源码。

## 接入情况

- 源码下载：`https://github.com/w193241125/FireboyAndWatergirl`（9.9MB zip，116 文件 / 16.7MB 解压）
- 本地存放：`games/fbw_forest/`（game.html + js/ + lib/ + bower_components/ + data/ + assets/ + images/ + css/ + game.json）
- 修复：源仓库缺 `manifest.json`（game.html 引用导致 404），已补最小 PWA manifest
- `index.html` 是 Windows UWP 壳（x-ms-webview + 广告），**网页入口是 `game.html`**
- 运行验证：`http://localhost:8000/games/fbw_forest/game.html` —— canvas 创建成功，无 JS 错误，游戏加载正常

## 集成待办（未开始）

ArcadeOnline 当前架构是"房主 Ruffle 跑 SWF + 截帧 + 输入注入"。H5 游戏集成方案：

1. **同源 iframe 托管**：房主页面 iframe 加载 `games/fbw_forest/game.html`（同源，可直接操作）
2. **输入桥接**：远端按键 dispatch 到 iframe 的 `contentWindow`（同源可行）；Construct 2 游戏监听 window keydown，P1=WASD / P2=方向键（原生双人同屏，与平台座位模型天然匹配）
3. **帧捕获**：iframe 内 canvas 走现有 `preserveDrawingBuffer` + drawImage 截帧通道（机制可复用）
4. **games.json 注册**：新增条目（type: "html5" 或类似标记，区分 SWF/Ruffle 加载路径）
5. **测试**：复用 `bomb_p2_e2e.js` / `stream_stability_test.js` 思路做 fbw 双人注入测试

## 遗留风险

- 游戏为社区"脱壳"源码，未验证版权/授权（仅供学习研究）
- Construct 2 游戏尺寸固定（默认 16:9），需要在 iframe 内缩放适配
- 广告/统计残留（js/ads.js 等）后续应移除
