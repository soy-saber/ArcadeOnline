# SWF 反编译与重建记录

本次先验证了仓库中的两个 SWF，再按确认的范围完成了泡泡堂双人核心玩法试验版。反编译输出保存在 `artifacts/swf-analysis/`，原始 SWF 的 SHA-256 在操作前后保持一致。

工具：本机 JPEXS Free Flash Decompiler 26.2.1。两个游戏均包含 AS1/2 风格脚本；SWF 版本号 8、9 不等于 ActionScript 版本号。

| 游戏 | 原始脚本导出 | 图片 | SVG 形状 | 音频 | 判断 |
| --- | ---: | ---: | ---: | ---: | --- |
| 46923 火柴人打羽毛球 | 96 个文件，20,379 行 | 11 | 179 | 11 | 有明显混淆；可用于分析，须核对变换结果 |
| 3881 Q版泡泡堂 / Bomb It | 63 个文件，3,257 行 | 141 | 301 | 18 | 核心逻辑可读，适合作为首款重建试验 |

计数为工具导出的文件/文本行数，不代表独立源码模块数量；形状也不等于完整动画。

## 反编译结果的位置

- [输入文件哈希](artifacts/swf-analysis/inputs.json)
- [导出统计、诊断和函数索引](artifacts/swf-analysis/summary.json)
- [羽毛球原始导出](artifacts/swf-analysis/46923/scripts/)
- [羽毛球去混淆后的主要玩法](artifacts/swf-analysis/46923/deobfuscated/scripts/frame_38/DoAction.as)
- [羽毛球主要玩法的 P-code](artifacts/swf-analysis/46923/pcode/scripts/frame_38/DoAction.pcode)
- [泡泡堂核心函数](artifacts/swf-analysis/3881/scripts/DefineSprite_554/frame_1/DoAction.as)
- [泡泡堂初始化、输入和更新循环](artifacts/swf-analysis/3881/scripts/DefineSprite_554/frame_2/DoAction.as)
- [泡泡堂角色素材预览](artifacts/swf-analysis/3881/character-preview.jpg)

`artifacts/` 沿用仓库现有忽略规则，以上分析产物保留在本机，没有把整套反编译材料加入应用发布包。运行所需的精选素材已单独加入 `public/native/assets/`。

## 羽毛球：可读性改善，但不是可直接编译的源码

首次导出成功结束，但记录了 `Invalid property index: PopItem` 诊断，93 个脚本文件包含反编译器伪操作。使用一次性参数 `autoDeobfuscate=true,simplifyExpressions=true` 后，仍导出 96 个文件，缩减到 3,124 行，没有检测到 `§§` 伪操作，但仍有转义标识符。

已定位：

| 功能 | 去混淆后的主要玩法文件 |
| --- | --- |
| 羽毛球生成、运动和击球 | `setupBirdie`，约第 380 行 |
| 得分、7 分胜利和重置 | `p1Scored` / `p2Scored`，约第 599 / 634 行 |
| 双人角色控制 | `setupHero1` / `setupHero2`，约第 882 / 961 行 |
| 球拍碰撞 | `hitbox.hitTest`，依赖嵌套 MovieClip 的变换和时间轴 |

重要限制：原始主要玩法中的 `getTimer()`，在去混淆结果里出现了被折叠为常数的情况。例如 `setupLevelText` 的生成时间和淡出条件变成数字；原始 P-code 仍有 `GetTime` 指令。因此不能把“工具输出可读代码”当成行为等价证明，也不能直接把这些计时常数移植。原始 SWF 才是行为基准，原始导出和 P-code 是核对线索。

2026-10-21 的 `46923-native` 双人联机版已直接使用原 SWF 导出的球场、羽毛球、人物身体与头部、双人发球和挥拍序列，以及 P1 的下手挥拍序列；运行素材位于 `public/native/assets/badminton/`，旧 Flash 入口继续保留。原作主场景为 550×400、30 FPS，模拟已改为 30Hz；人物每帧水平移动 5.9、跳跃初速 12，发球初速 30，羽毛球的重力、0.925/0.92 阻力、墙/网/地面反弹及先得 7 分规则均按 `frame_38/DoAction.as` 对照。挥拍使用原序列第 2～8 帧的有效击球窗口，第 9 帧停止判定；P1 低球走原作下手挥拍分支。原 Flash 使用动画内部矢量 hitbox、随机拍面偏角及 `setTimeout`，原生版用导出帧测量的拍头圆形范围、可复现的偏角和 30Hz 计时近似，因此不能宣称逐帧等价。

## 泡泡堂：迁移依据

主要玩法集中在 `DefineSprite_554`：

| 原函数或数据 | 位置与用途 |
| --- | --- |
| `putBomb` | frame_1 第 245 行；放置条件、容量、60 次更新后爆炸 |
| `putSpecial` | frame_1 第 295 行；六种特殊武器、引爆、减速和冻结 |
| `bombExp` | frame_1 第 755 行；爆炸传播、障碍和连锁 |
| `brickBreak` | frame_1 第 899 行；障碍销毁和道具掉落 |
| `movHero` | frame_1 第 1021 行；格子移动、移动进度、捡道具 |
| `w=15; h=13; d=30` | frame_1 第 1420 行附近；原地图尺寸与格子大小 |
| `vLevel=6` | frame_2 角色初始化；默认每格移动 6 次更新 |
| `game.onEnterFrame` | frame_2 第 143 行附近；玩家按键、AI 和状态更新 |
| `timer.timeInit` | `DefineSprite_519`；原局长 180 秒 |

反编译没有检测到 `§§` 伪操作，但 `for(§each§ ...)` 等保留字转义仍需要人工转换。`attachMovie`、`gotoAndStop`、`onEnterFrame`、声音和界面更新与逻辑混在一起，不能直接当 JavaScript 执行。

## 已完成的重建范围

用户确认首轮优先：移动、炸弹、连锁爆炸、常规道具和胜负。

- TypeScript 独立模拟层；保存的是普通对象和数组，不依赖 Flash 或 Canvas 对象。
- 35 次/秒更新；默认每格 6 次更新、炸弹引信 60 次更新、3 分钟一局。
- 双人移动、障碍、普通炸弹、连锁爆炸、六类常规道具、六种特殊武器、平局/胜负及再来一局。
- 双人对战、电脑补位的人机练习、两人合作对抗电脑，以及三张程序生成地图。
- 复用原 SWF 中四名角色的四方向图与行走动画、地砖、障碍、炸弹、武器效果和部分声音。
- 游戏画面由各浏览器本地 Canvas 2D 绘制；不再传输视频。

上述模式是早期重建范围。2026-10-20 的公网版本已将页面入口改为 2～4 名真人自由对战，所有已入座玩家准备后自动开局；空席无电脑补位。原作分析仍用于素材和单局行为对照，完整闯关流程不再是当前联机目标。

这是一份玩法重建，不是原作逐帧等价移植。普通爆炸采用即时射线；地图、早期电脑寻路策略和生命道具行为属于适配实现。当前真人联机入口已恢复原作的单键攻击优先级：特殊武器弹药用尽后才放普通炸弹。原作全关卡、计分成长、角色选择、全部场景及过场没有完整移植。普通道具掉落权重已沿用原作，特殊武器改为六类随机掉落。羽毛球现有独立原生联机入口；它和原版泡泡堂的旧 Flash 入口均继续保留。

## 语言与平台选择

选择 TypeScript 的依据是 AS2 逻辑迁移便利、浏览器原生运行，以及同一份模拟代码可用于两端预测、权威确认和离线测试。首款格子游戏使用 Canvas 2D，暂不需要完整物理引擎；后续可替换渲染层，而保持模拟层和网络协议独立。

平台实现与启动方式见 [NATIVE_PLATFORM.md](NATIVE_PLATFORM.md)。

## 重复导出

以下 PowerShell 命令从仓库根目录执行，输出目录与原文件分离：

```powershell
$ffdecPath = 'C:\Program Files (x86)\FFDec\ffdec-cli.exe'
& $ffdecPath -onerror abort -export 'script,image,shape,sound,symbolClass' 'artifacts\swf-analysis\3881' 'games\3881\game.swf'
& $ffdecPath -onerror abort -export 'script,image,shape,sound,symbolClass' 'artifacts\swf-analysis\46923' 'games\46923\game.swf'
& $ffdecPath -config 'autoDeobfuscate=true,simplifyExpressions=true' -export script 'artifacts\swf-analysis\46923\deobfuscated' 'games\46923\game.swf'
& $ffdecPath -format 'script:pcode' -export script 'artifacts\swf-analysis\46923\pcode' 'games\46923\game.swf'
& $ffdecPath -format 'script:pcode' -export script 'artifacts\swf-analysis\3881\pcode' 'games\3881\game.swf'
& $ffdecPath -selectid '25,47,69,91' -format 'sprite:png' -export sprite 'artifacts\swf-analysis\3881\character-preview' 'games\3881\game.swf'
& $ffdecPath -selectid '196,232,372' -format 'sprite:png' -export sprite 'artifacts\swf-analysis\3881\board-preview' 'games\3881\game.swf'
& $ffdecPath -selectid '306,307,311,316,320,326,238,249,274,280' -format 'sprite:png' -export sprite 'artifacts\swf-analysis\3881\effects-preview' 'games\3881\game.swf'
& $ffdecPath -selectid '12,21,24,34,43,46,56,65,68,78,87,90' -format 'sprite:png' -export sprite 'artifacts\swf-analysis\3881\walk-preview' 'games\3881\game.swf'
python scripts/import-bomb-assets.py
```

素材整理脚本需要 Pillow；正常运行、编译和部署游戏不需要 Python、Java 或 FFDec。
