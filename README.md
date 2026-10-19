**ArcadeOnline · 浏览器联机游戏平台**

ArcadeOnline 支持两种游戏入口：原生泡泡堂在各玩家浏览器中运行和绘制，通过输入与状态同步联机；旧 Flash 游戏由房主通过 Ruffle 运行，向其他成员串流画面。Node.js 提供网页、房间、席位、信令和备用中继。

**试玩与当前进展（2026-10-20）**

[打开游戏平台](https://223.109.141.251/) · [泡泡堂原生联机房间](https://223.109.141.251/native-room.html?game=3881-native&room=demo)

四人联机与全员准备功能已于 2026-10-20 部署到以上公网地址；两人和四人的公网浏览器开局流程已验证，真实跨设备体验仍待验收。

| 功能 | 当前状态 |
| --- | --- |
| 泡泡堂原生版 `3881-native` | 2～4 名真人自由对战，全员准备自动开局、无电脑补位；三张程序地图、六类道具、六种特殊武器、原作道具图标与部分动画 |
| 原生联机 | 房主权威、35Hz 模拟、本地预测、快照校正重演、WebRTC DataChannel、WebSocket 回退、观战及刷新恢复 |
| 旧 Flash 游戏 | 原版泡泡堂、火柴人打羽毛球继续使用原串流入口 |
| 森林冰火人 | 仓库内有 Phaser + Box2D 游戏代码与资源，尚未接入平台房间流程 |
| 公网部署 | 应用、Caddy、coturn 已安装；真实 IP 证书、HTTPS/WSS 和外网双浏览器 WSS 游戏同步通过 |
| 尚待验收 | TURN 外网端口超时，待安全组核查；两地设备延迟、移动端、真实证书续期和回滚演练待完成 |

原生版是玩法重建，尚未完整复刻原作关卡、计分成长和过场。房主离开或刷新会进入新的等待回合；未实现无缝中局房主迁移或竞技级反作弊。已有同机人工延迟测试不能证明公网 P95 或物理按键到屏幕延迟。

**本地启动**

使用 Node.js 22 或更新版本；当前部署使用 Node 22.23.3。

```sh
npm ci
npm run build:native
npm start
```

打开 `http://localhost:8000/`，选择「泡泡堂 · 对等联机版」。2～4 名玩家进入相同房间、分别入座并准备；所有已入座玩家准备后自动开局，空席位不由电脑填充。跨设备邀请使用服务器地址或可达的局域网 IP。

WASD/方向键移动，空格/回车攻击；持有特殊武器时先用完弹药，之后才放普通炸弹，E/Shift 也是同一攻击键。手机可用触屏按钮，音效开关和音量可在画面下方调整。原生游戏不依赖 Flash/Ruffle。

**代码与文档入口**

| 路径 | 用途 |
| --- | --- |
| `src/native/core.ts` | 确定性模拟、游戏状态、输入校验与重演 |
| `src/native/network.ts` | 房间连接、DataChannel、信令、临时 TURN 配置与中继回退 |
| `src/native/main.ts` / `view.ts` | 房间适配、本地预测、输入及 Canvas 绘制 |
| `server.js` | 静态资源、房间/席位、信令、权限校验与备用中继 |
| `public/games.json` | 游戏目录；`runtime: "native"` 选择原生页面 |
| `public/native/bomb.js` | 已生成的浏览器包；修改 TypeScript 后须重新构建 |
| [原生平台说明](NATIVE_PLATFORM.md) | 玩法、架构、输入/快照协议、测试及行为差异 |
| [Linux 部署指南](LINUX_DEPLOY.md) | 打包、安装、IP HTTPS、TURN、更新与回滚 |
| [实际部署记录](DEPLOYMENT_STATUS.md) | 现场地址、版本、验证证据和当前阻塞项 |
| [Agent 交接 TODO](AGENT_HANDOFF_TODO.md) | 优先级、依赖、执行步骤、验收标准与后续扩展 |
| [SWF 分析与重建](SWF_RECONSTRUCTION.md) | 原作逻辑位置、导出命令和逆向限制 |
| [旧串流优化记录](optimization-notes.md) / [冰火人接入记录](integration-notes.md) | 旧入口说明与第二款游戏的候选改造路线 |

原生网络采用房主为中心的星形结构。界面“对等连接”表示 WebRTC 数据通道，可能经过 TURN；“中继连接”表示 WebSocket 回退。TURN 可提高连通率，是否更流畅仍需测量。

**验证与打包**

```sh
npm run typecheck
npm run test:native
npm run test:native:e2e
npm run test:deploy
npm test
npm run package:linux
```

原生 E2E 使用 Puppeteer，默认 Chrome 路径为 Windows 安装位置；其他环境通过 `CHROME` 指定可执行文件。部署测试可通过 `CADDY` 指定 Caddy 可执行文件进行真实配置解析；未找到时相关测试会跳过。

`package:linux` 执行类型检查、构建与文件哈希验证，产出 `artifacts/releases/arcade-online-linux.tar.gz` 和 `.sha256`，不自动运行全部测试。发布前先完成上述相关验证。

`artifacts/`、`node_modules/` 和 `.env` 不进入 Git。逆向中间文件、临时运维工具和测试产物需要按交接清单另行传递；运行所需精选素材已放入 `public/native/assets/`。正常构建不需要 Python、Java 或 FFDec，仅重新导出素材时需要这些工具。

**部署与下一步**

通用安装入口为 `deploy/public-linux.sh`。当前服务器实际使用 Ubuntu 26.04.1，应用监听 `127.0.0.1:18088`，由 Caddy 在 443 提供 HTTPS；原有 8000 端口业务保留。以 [部署记录](DEPLOYMENT_STATUS.md) 的现场参数为准。

下一步是核查/放行 TCP、UDP 3478 与 UDP 49160–49260，重新验证 TURN 认证分配和 relay 候选对的数据传输；同时开展两地真实设备试玩、P50/P95 测量和移动端兼容性测试。完整任务见 [TODO](AGENT_HANDOFF_TODO.md)。
