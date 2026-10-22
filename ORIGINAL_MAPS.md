# Bomb It 原作地图证据与移植

新增的 `3881-server` 入口复用原作五种地图主题：森林、沙漠、城市、藏宝、糖果屋。默认森林；`classic`、`lanes`、`open` 仍作为程序生成的附加地图供代码使用。原作 Flash 和旧 `3881-native` 的源码、入口、素材保持独立。

## 原件与证据来源

原件：`games/3881/game.swf`，SHA-256 `a2b4cc65115e4b6eb813962d80e91f1e65746a91f27e91d5e86fa1963ed5b54d`。提取前、提取后与测试时散列一致。

本次使用 JPEXS Free Flash Decompiler 26.4.0 的便携 JAR，仅做离线脚本、时间轴/XML 和 PNG 导出。旧文档中的 FFDec 26.2.1 安装及分析目录在此环境未保留，因此重建导出在被忽略的 `artifacts/` 内；没有改写原 SWF。当前会话没有连接 REA MCP，以下是本地 FFDec 原件证据，不冒充 REA Evidence ID。

| 观察 | 原件导出定位 | 移植结果 |
| --- | --- | --- |
| `sceneStyle = random(5)` 与五组砖块样式 | `artifacts/swf-analysis/3881/scripts/DefineSprite_554/frame_1/DoAction.as`，1489–1511 行 | 五个主题 ID：`forest/desert/city/treasure/candy` |
| 五个原作主题名称 | `artifacts/swf-analysis/3881.xml` 的 `DefineSprite_196`、`DefineSprite_232` 中 `FrameLabelTag` | 使用作者的“森林系/沙漠系/城市系/藏宝系/糖果屋系”，没有凭视觉猜名字 |
| 15×13 地图、30 像素格子、四个出生点 | frame_1，1417–1421 行 | 出生点 `(3,3)/(11,3)/(3,9)/(11,9)` 对应原英雄 1–4 |
| 各主题地砖和大型中心物 | `getBgStyle`、`getBigBrickStyle`，1262–1294 行 | 每局一种地砖，主题大型物占中心 `(6,5)..(7,6)` 四格 |
| 随机不可破坏障碍生成 | frame_1，1528–1684 行；`disorder`，1373–1392 行 | 保留原生成顺序、八邻域判断、出生点对角优先插入和原循环上限 |
| 60% 可破坏障碍概率、最多四种当前砖块图案 | `DefineSprite_554/frame_2/DoAction.as`，49–77 行 | 每局先打乱主题砖块调色板，用前四种；60% 摆放；清空全部出生点十字 |
| 地图的四周也有地砖，没有强制围墙 | frame_1 的 `x=0..14/y=0..12` 初始化与地图生成 | 移动、爆炸可以进入边缘格；越界依然受阻 |

原作没有五张固定二维布局表。五种主题共用随机拓扑算法，每次开始关卡生成不可破坏障碍，再放置可破坏障碍。`src/authority/maps.ts` 直接移植这个构造过程，用服务器可复现 RNG 代替 Flash `random()`。新的联机回合重新生成整张地图，这是多人回合适配；不宣称复制原作单人关卡生命周期或 Flash 的随机序列。

## 全部地图图像

| 主题 | 地砖帧（bg 精灵 232） | 可破坏物帧（brick 精灵 196） | 不可破坏物帧 | 中央大型物帧 |
| --- | --- | --- | --- | --- |
| 森林 | 1–3 | 1–6 | 7–9 | 52 |
| 沙漠 | 4–5 | 10–12 | 13–19 | 53–54 |
| 城市 | 6–7 | 20–23 | 24–31 | 55–56 |
| 藏宝 | 8–10 | 32–38 | 39–41 | 57 |
| 糖果屋 | 11–12 | 42–47 | 48–51 | 58 |

已导出完整 12 帧地砖和 58 帧障碍/大型物，共 70 个 PNG，位于 `public/authority/assets/maps/`。`manifest.json` 包含原件散列、工具版本、时间轴标签、每张图的精灵编号/帧号/尺寸/散列；整个地图素材目录含 manifest 为 239,401 字节。另有 62 份复用的原作英雄、动画、武器、道具和声音，共 223,940 字节，位于 `public/authority/assets/`，只复制既有 Bomb It 精选素材。

地砖原始导出额外一行一列透明像素已去除，保存为原作 30×30。障碍图保留整张公共导出画布。根据精灵 196 的矢量边界并集，公共图原点为 `(-12.85,-38)`，按格子大小缩放绘制，保留原作者注册位置、物件高度与大型物的真实范围。不可破坏物、可破坏物、炸弹和人物按原 `calDepth` 的 y/x 顺序绘制，避免把所有大型物硬塞进一个方格。地砖 11/12 的图像引用与其他主题共享是原 SWF 的时间轴事实。

`mapVisual = {floor,landmark,tiles}` 随完整快照初始化；回合中保持不变，障碍销毁由 `board` 决定显示，因此地图图案无需每帧发送。服务端验证地图 ID 和其对应图案编号。

## 验证与边界

- `node --test tests/original-maps.test.cjs`：4 项通过，覆盖五个主题×80 个种子共 400 张地图；检查可复现布局、正确出生点、出生点十字畅通、中心四格、主题图案范围、移除可破坏物后的全图连通、边缘移动和爆炸、非法快照拒绝、全部素材和原件散列。
- 离线对应核验 `artifacts/authority-tests/map-oracle.cjs`：在小型 MovieClip 适配器内直接执行 FFDec 导出的原地图初始化代码，把两边随机数序列固定为同一种 RNG。400 张地图的 `board/floor/landmark/tiles` 与 TypeScript 逐项相同。这证明所检查地图构造的静态移植对应，不是原 Flash 运行时观察。
- Chrome Canvas 实际渲染五种主题，无页面错误、无缺失图片；截图保存在 `artifacts/authority-tests/map-forest.png`、`map-desert.png`、`map-city.png`、`map-treasure.png`、`map-candy.png`。已人工检查森林与糖果屋图的中央物、人物出生点和障碍排列。
- authority core/view 的 TypeScript 类型检查通过。旧 native 文件与旧生成包未改动。

本改动的完整范围是五种原作地图主题、全部地图视觉材料及原件地图构造规则。角色移动、武器与爆炸等来自原试验版独立模拟，仍存在原文档说明的适配差异，不能据地图对应宣称整个游戏逐帧等价。

## 重复提取

从仓库根目录执行：

```powershell
java -jar artifacts/tools/ffdec/ffdec.jar -onerror abort -export script artifacts/swf-analysis/3881 games/3881/game.swf
python scripts/import-original-maps.py --ffdec artifacts/tools/ffdec/ffdec.jar
node --test tests/original-maps.test.cjs
```

导入脚本会在缺少地图 PNG/XML 时调用给定的 FFDec JAR，仅向 `artifacts/` 和 `public/authority/assets/maps/` 写入导出；原 SWF 哈希必须保持一致。运行、构建和发布游戏不需要 Python、Pillow、Java 或 FFDec。
