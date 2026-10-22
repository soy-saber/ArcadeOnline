# 僵尸危机3 / Boxhead 2Play 原版素材与服务器重建

2026-10-23。本轮只更新 `50737-server`。现有资源实际标题为 **BOXHEAD 2PLAY**；大厅沿用项目的「僵尸危机3」入口名。原始 `games/50737/game.swf` 未改写，SHA256：`9ecf3b4e6f8b7b1f05f536aa8577e63ba650607b464f15db138fa28e5201fe90`。

## 已实现

- **18 张原版地图**：BOXY、BUTTONS、MAZEY、GLADIATOR、STRIP、TIGHT、COLUMNS、CASTLE、BIG BOXY、RECTY、PATCHY、FOREST BOX、TIGHT 2、MASSIVE、THIN LINE、4 CASTLES、THE STRIPS、BIG ONE。保留原始尺寸（704×544 至 2784×2784）、32 像素碰撞网格、玩家/敌人出生标记、油桶、补给与可破坏墙。地图画面来自原始矢量，地面和遮挡层分别绘制。
- **原版角色材质与动作**：P1–P4 分别采用 SWAT、BOND、GIJOE、BAMBO；另含僵尸与恶魔。共 78 组动画，按原本方向数/帧数生成；保留多边形、贴图矩阵、材质亮度、阴影和 GIJOE 替代模型。包含站立、行走、对应枪械姿态、攻击、受击、倒地与尸体。原始物件、爆炸、血迹、弹着、枪口火焰和火球也已提取。
- **十种武器**：手枪、UZI、霰弹枪、油桶、手雷、假墙、地雷、火箭炮、遥控炸药、轨道炮。服务器判定命中、弹药、间隔、爆炸与穿透。霰弹枪基础三条射线；轨道炮穿透敌群；手雷反弹并保留 60 tick 引信；火箭加速；油桶连锁、地雷延迟启动、遥控炸药再次攻击引爆。切换武器保留各自剩余弹药。
- **原版升级与持续生存**：从 `CUpgrades` 提取 58 个升级条目。团队连击在 5/10/15/20/30/40/50/55/70 时解锁后续武器，强化和解锁在连击回落后仍保留。使用原版 25Hz、200 HP、逐渐回血、波次生成数量和间隔基线；持续递增波次，无六波胜利或十二分钟强制结束。队友尚存时倒地者延时复活；全队倒地结束，沿用平台自动续局。
- **共享大视野**：画布 1280×800，常规可视世界宽度至少 1152 像素（小地图整体显示）；原作视口为 640×480。按所有存活队友的包围范围缩放，分散时继续扩大视野。镜头不依赖本机席位，姓名与血条使用同一变换；正常和全屏均可用。
- **原版音效**：26 个原始音频文件，接入枪声、爆炸、放置、弹跳、拾取、僵尸攻击、死亡和结束事件。支持现有音效/音量设置；事件由服务器编号，重传和恢复快照不会重复播放历史声音。
- **联机适配**：四人真人合作扩展，僵尸网格寻路、恶魔火球、补给、倒地/击杀战绩、键盘和触屏。数字 1–0 选择已解锁武器，K/X 循环切换。

## 提取依据

`node scripts/import-expanded-boxhead.cjs` 使用 Java/JPEXS 与 Python/Pillow；通过环境变量 `FFDEC_JAR` 指定工具。去混淆脚本使用 `autoDeobfuscate=true`，不执行 ActionScript；仅解析静态字面量。分析缓存位于 ignored `artifacts/swf-analysis/50737/`，`--force` 可重烘焙人物帧。

依据为原版 XML 的 `ROOM_Single_0001…0018`、`World_Init_*`、`Piece.*` 和 `_Size/_Cover`，以及可读 AS2 的 `CWorld`、`CUpgrades`、`Thing/Weapon`、`Thing/Shot`、`Thing/Creature`、`CDrawPrimitive_XSI_StyleSheet` 与模型符号 755。发布数据在 `src/expanded/boxhead-data.json`，素材与来源清单在 `public/expanded/assets/boxhead/`。没有 AI 生成替代图。

## 适配边界

这仍是服务器原生重建，不运行 Flash。四名真人、共享缩放镜头、网格寻路、队友复活位置和友伤规则为联机适配。爆炸强化使用近似范围扩展，集束弹、精确动画节奏、连续碰撞、AI 转向与原版逐帧执行仍有差异。未移植原版菜单、难度选择、死亡竞赛、广告、存档或隐藏作弊；角色暂按席位固定。音频文件均保留，但未将所有环境音自动循环。不能宣称整款游戏逐帧等价。

## 验证

- `npm test`：服务器平台、全部适配器与原图数据回归。
- `node --test tests/expanded-boxhead*.test.cjs`：18 图四人出生、确定性、输入重传/过期、全部武器、解锁、弹药、手雷/火箭、连锁/地雷/遥控、穿透、迷宫寻路、持续生存、复活、音效事件及异常快照。
- `npm run test:boxhead:assets:e2e`：Chrome 解码 178 张图和 26 个音频，18 张地图四人分散时镜头/姓名对齐，截图位于 `artifacts/boxhead-original/`。
- `EXPANDED_GAMES=50737-server node tests/expanded-e2e.cjs`：四浏览器真实入座、准备、移动/射击、P3/P4、全屏、暂停/恢复、完整/增量同步、离座和换图。
- `npm run test:fullscreen:e2e`：八款全屏与两种触屏方向回归。

公网版本与实际验收结果以 [部署记录](DEPLOYMENT_STATUS.md) 为准；本机多个浏览器不代表两地延迟验收。
