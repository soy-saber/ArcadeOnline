**ArcadeOnline · 浏览器联机游戏平台**

ArcadeOnline 提供八款实时联机游戏，比赛由 Node.js 模拟，浏览器发送输入并绘制确认状态。大厅仅展示当前联机入口，游戏名称使用原名。旧房主原生版和原作串流已退出网站，旧房间链接跳转到对应联机游戏，旧版本执行文件和原始 SWF 不再通过网站提供。

**试玩与当前进展（2026-10-22）**

最新原作对照：优先修正泡泡堂1、2与僵尸危机3的友伤、换枪、死亡库存、音效和武器计数；两款泡泡堂接入原版头顶 HUD 图标及右侧状态面板，窗口/全屏图标同步缩放，姓名缩小并避让。保留用户指定的手套/特殊武器使用间隔。来源、浏览器验证与剩余差异见 [FIDELITY_AUDIT.md](FIDELITY_AUDIT.md)，发布版本见部署记录。

2026-10-23：先补齐僵尸危机3。现有入口已恢复 18 张原版地图、四名原版角色、僵尸/恶魔贴图动画、十种武器、连击升级和事件音效，使用持续生存与队友复活。共享镜头扩大视野并随队友分散缩放，姓名对齐镜头，保留沉浸全屏。详情及适配限制见 [僵尸危机重建说明](BOXHEAD_RECONSTRUCTION.md)；实际上线版本见 [部署记录](DEPLOYMENT_STATUS.md)。

大厅整理：八款游戏都有本地 WebP 封面，提供体育竞技、休闲对战、动作射击、合作冒险分类。分类与搜索复用卡片，预留滚动条空间，避免布局和滚动位置跳变；四种屏幕宽度已验证。背景通过用户选定网站生成，改为低对比蓝紫/琥珀色彩轮廓，仅保留优香发饰、光环与红莉栖长发、时钟的抽象暗示，不含面部或服装细节。1280×720 WebP 为 6558 字节，较上一张减少约 95%。最终图、来源校验和完整提示词见 `public/assets/yuuka-kurisu-background.webp`、`site-artwork.json`、`site-background-prompt.txt`。公网发布状态以 [部署记录](DEPLOYMENT_STATUS.md) 为准。

现有八款游戏资源均有独立服务器权威入口，包括坦克、Boxhead、小斗士、泡泡堂2、枪战和森林冰火人。新版本支持完整/增量同步、全屏准备、个人准备状态保留、自动续局及对战游戏的跨局击杀战绩；泡泡堂五种场景、泡泡堂2十八张地图、冰火人三十二关已导入。入口与重建范围见 [完整目录](EXPANDED_GAMES.md) 和 [平台说明](SERVER_AUTHORITY.md)。八款入口及本次泡泡堂2击杀模式更新已部署，版本和校验记录见 [部署记录](DEPLOYMENT_STATUS.md)。

最新微调：角色显示玩家姓名，炸弹人增加推弹冷却、头顶武器库存、公开 3 秒后隐藏的地雷/减速陷阱；所有特殊武器统一释放硬直 0.2 秒，冰箭硬直结束可转向离开，向前由冰面阻挡以避免自冻。僵尸危机3（现有 Boxhead 重建）和 Q版泡泡堂2提供四人入口；原始资源作为本地开发依据保留。

Q版泡泡堂2现可独立选择生存、击杀、金币、占地四种模式与十八张原作地图，共 72 种组合。击杀模式优先完善：无限基础锤子、原作武器次数与释放动画、地雷离开后感应、激光遇障碍停止、死亡掉落与复活保护；先得 10 分获胜，自杀扣分最低为 0，结束后保留准备与战绩自动续局。四浏览器已完成真实按键 10 次击杀、自然复活及续局验证。其他模式的原作细节与音效仍需继续完善，见 [重建说明](TANK_BOMB2_RECONSTRUCTION.md)。

[打开游戏平台](https://223.109.141.251/) · [Q版泡泡堂](https://223.109.141.251/authority-room.html?game=3881-server&room=demo) · [火柴人打羽毛球](https://223.109.141.251/authority-room.html?game=46923-server&room=demo)

2026-10-22 分类稳定布局与轻量轮廓背景已发布；公网四种屏幕宽度的大厅验证通过。当前实现提交为 `e976cd2`，现场版本和回滚目录见部署记录。前次两个四人游戏、炸弹人武器专项已通过，真实跨设备体验仍待验收。

| 功能 | 当前状态 |
| --- | --- |
| Q版泡泡堂 `3881-server` | 2～4 名真人自由对战，全员准备自动开局、无电脑补位；五种原作场景、特殊武器、跨局战绩 |
| 火柴人打羽毛球 `46923-server` | 双人入座并准备开局；原 SWF 球场、人物、羽毛球与挥拍素材，30Hz 力学参数及 7 分赛制 |
| 在线联机 | 服务器判定、WebSocket/WSS、完整/增量快照、观战、断线恢复与自动续局 |
| 旧游戏版本 | 已退出网站与发布包；旧房间链接跳转到对应联机游戏 |
| 六款扩展游戏 | 服务器模拟、原素材、席位与浏览器操作已接入；原作对应范围和限制见各重建报告 |
| 森林冰火人 | 两人合作，导入原始 32 关，机关与刚体物理重建；尚未逐关真人通关验收 |
| 公网部署 | 应用、Caddy、coturn 已安装；真实 IP 证书、HTTPS/WSS 和外网双浏览器 WSS 游戏同步通过 |
| 尚待验收 | 两地真实设备的延迟与触屏体验、真实证书续期和回滚演练；旧 WebRTC 链路的 TURN 验收保留在历史记录 |

联机游戏是玩法重建，尚未完整复刻原作所有细节。房间创建者的浏览器不承担比赛模拟，服务器持续运行比赛。已有同机人工延迟测试不能证明公网 P95 或物理按键到屏幕延迟。

**本地启动**

使用 Node.js 22 或更新版本；当前部署使用 Node 22.23.3。

```sh
npm ci
npm run build:native
npm start
```

打开 `http://localhost:8000/`，选择游戏。至少两名玩家进入相同房间、分别入座并准备；所有已入座玩家准备后自动开局，空席位不由电脑填充。跨设备邀请使用服务器地址或可达的局域网 IP。

WASD/方向键移动，空格/回车攻击；持有特殊武器时先用完弹药，之后才放普通炸弹，E/Shift 也是同一攻击键。手机可用触屏按钮，音效开关和音量可在画面下方调整。原生游戏不依赖 Flash/Ruffle。

**代码与文档入口**

| 路径 | 用途 |
| --- | --- |
| `src/authority/engine.ts` / `protocol.ts` | 服务器模拟、房间适配、输入校验、快照与战绩 |
| `src/authority/main.ts` | 房间界面、输入、本地预测和 Canvas 绘制 |
| `src/expanded/` / `src/badminton/` | 各游戏模拟、素材适配与绘制 |
| `server.js` | 静态资源、HTTP 路由与服务器房间接入 |
| `public/games.json` | 八款游戏目录，统一 `runtime: "server"` |
| `public/authority/game.js` / `runtime/authority.cjs` | 浏览器包与生产模拟包；源码修改后须重新构建 |
| [服务器平台说明](SERVER_AUTHORITY.md) | 当前架构、输入/快照、准备与自动续局 |
| [Linux 部署指南](LINUX_DEPLOY.md) | 打包、安装、IP HTTPS、TURN、更新与回滚 |
| [实际部署记录](DEPLOYMENT_STATUS.md) | 现场地址、版本、验证证据和当前阻塞项 |
| [Agent 交接 TODO](AGENT_HANDOFF_TODO.md) | 优先级、依赖、执行步骤、验收标准与后续扩展 |
| [SWF 分析与重建](SWF_RECONSTRUCTION.md) | 原作逻辑位置、导出命令和逆向限制 |
| [待处理游戏清单](PENDING_GAMES.md) | 新增 5 款游戏的原始文件、校验值、已知依赖及逐款验收事项 |
| [旧串流优化记录](optimization-notes.md) / [冰火人接入记录](integration-notes.md) | 旧入口说明与第二款游戏的候选改造路线 |

当前游戏通过 WebSocket/WSS 与服务器交换输入和快照，房间创建者离开或页面暂停不会中断其余玩家的比赛。旧浏览器房主网络设计见历史文档 `NATIVE_PLATFORM.md`。

**验证与打包**

```sh
npm run typecheck
npm test
npm run test:authority
npm run test:authority:e2e
npm run test:expanded
npm run test:expanded:e2e
npm run test:authority:weapons:e2e
npm run test:expanded:kill:e2e
npm run test:lobby:e2e
npm run test:deploy
npm run package:linux
```

原生 E2E 使用 Puppeteer，默认 Chrome 路径为 Windows 安装位置；其他环境通过 `CHROME` 指定可执行文件。部署测试可通过 `CADDY` 指定 Caddy 可执行文件进行真实配置解析；未找到时相关测试会跳过。

`package:linux` 执行类型检查、构建与文件哈希验证，产出 `artifacts/releases/arcade-online-linux.tar.gz` 和 `.sha256`，不自动运行全部测试。发布前先完成上述相关验证。

`artifacts/`、`node_modules/` 和 `.env` 不进入 Git。逆向中间文件、临时运维工具和测试产物需要另行传递；运行素材位于 `public/authority/assets/` 与 `public/expanded/`。正常构建不需要 Python、Java 或 FFDec，仅重新导出素材时需要这些工具。

`scripts/prepare-site-assets.py` 默认只更新来源清单并保留已选背景；替换背景时显式传入 `--background`、`--prompt`、`--model`，使用 Pillow 转换 WebP，默认最长宽度 1280、质量 78；`--composition` 记录当前构图。生成网站只通过用户指定的已登录浏览器访问，认证资料与临时下载地址不进入仓库。

**部署与下一步**

通用安装入口为 `deploy/public-linux.sh`。当前服务器实际使用 Ubuntu 26.04.1，应用监听 `127.0.0.1:18088`，由 Caddy 在 443 提供 HTTPS；原有 8000 端口业务保留。以 [部署记录](DEPLOYMENT_STATUS.md) 的现场参数为准。

下一步继续完善金币/占地原作细节与扩展游戏音效，开展两地真实设备试玩、P50/P95 测量、触屏兼容性和运维回滚验收。当前服务器联机使用 WSS，旧 WebRTC/TURN 历史待办不影响当前链路。完整任务见 [TODO](AGENT_HANDOFF_TODO.md)。

## 火柴人打羽毛球联机版

`46923-server`：两名玩家进入同一房间，分别占据 P1/P2 席位并准备后自动开局。A/D 或方向键左右移动，W/↑ 跳跃，S/↓ 发球及挥拍；发球动画第 13 帧结束后清除跳跃与网前移动限制。球落在己方半场时对方得分，先得 7 分获胜，赛后保留准备自动续局。页面提供触屏按钮、音效开关与音量，服务器负责规则判定和同步。

本地验证：`npm run typecheck`、`npm run test:authority`、`npm run test:authority:e2e`。核心位于 `src/badminton/`，页面统一为 `public/authority-room.html`；`npm run build:native` 生成当前统一浏览器包和生产模拟包。
