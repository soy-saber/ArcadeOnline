# 羽毛球原球体、碰网、拖尾与回调顺序

本批在 `943b484` 上继续完整羽毛球/僵尸危机3目标。修正羽毛球双人过程的球体运动、网面与拖尾，同时修复人物和球拍 PNG 滤镜留白造成的定位偏移。完整目标仍以 [羽毛球清单](../../../BADMINTON_RESTORATION_PLAN.md) 和 [僵尸危机3清单](../../../BOXHEAD_RESTORATION_PLAN.md) 为准；本批没有完成原单人/机器人/六级CPU、菜单/HUD/结算和僵尸剩余机制。

原文件 `games/46923/game.swf` SHA256 为 `a4b0f9bc5ed2cbc73eb681b2d2a93567a5134d68e57e6e6b2a8c51ba360fb9cf`。新增 [原函数参考构建](../../../scripts/prepare-badminton-reference.py)、[Chrome/Ruffle采集](../../../scripts/trace-badminton-reference.cjs) 与 [结果整理](../../../scripts/collect-badminton-reference.cjs)。将原 `setupBirdie/mothershipTrail/turn/setupHero1/setupHero2` 和原符号/标记点编译进隔离参考 SWF；音频/计分回调采用观测桩，加入 trace 与 ExternalInterface 快照。随机源在参考函数中替换为固定提供者，按键使用实际 Chrome KeyS。参考程序、原SWF、Ruffle及分析缓存不进入线上包。参考引擎是本地 `0.6.0-nightly.2026.8.6` Ruffle，不能称为另行运行了 Adobe Flash 二进制。

记录了107组球体分支、36组击球/既有命中标记、44帧原 hitTest/getBounds/角度、26发球点、18回调粒子与移动/复位探针，以及完整发球的逐回调快照。隔离球体/击球向量的命中测试使用确定性命中/未命中桩；44帧边界则单独查询真实原符号。原 AS2 与 P-code 同时核对，避免移植去混淆器错误折叠的 getTimer 常数。参考结果保存在 [测试夹具](../../../tests/fixtures/badminton-as2.json)，原舞台/网几何在 [runtime-geometry.json](../../../src/badminton/runtime-geometry.json)。运行 getter 确认网宽32.4、高88.5、顶310.4，netLimit宽129.7；原 `_x/_y` 每次赋值截断到整数twip，速度保持double。原 hitTest 计算的矩阵拼接/点变换使用f32与ties-even整数twip，必须从子向父拼接，不能用旧浮点包围框直接替代。参考 [Ruffle矩阵实现](https://github.com/ruffle-rs/ruffle/blob/nightly-2026-08-06/render/src/matrix.rs) 与 [显示对象实现](https://github.com/ruffle-rs/ruffle/blob/nightly-2026-08-06/core/src/display_object.rs)。

服务器现在按原顺序处理：旧粒子、时间轴帧动作、旧球回调，再P2/P1球拍及人物；球拍缓存角度供下一次球回调使用。新发球在第4帧出生，当帧保持原始±30/-30速度与标记点，下一回调才运动。已核对完整原运行快照中的球坐标/速度、球拍/发球帧、就绪/接触标记和身体独立相位。球体先设置区域标记，再阻力/重力、碰撞前朝向、按速度产生拖尾、移动和独立墙/网/地面分支；等于中线或网顶时保留旧标记。碰网回退Y也经过原坐标赋值，不能直接恢复上帧Y。地面反弹继续运动，计分仅首次落地；水平零速反弹按原分支变为+0.7。P1球速保留原先乘50再乘1.04的顺序。发球时双方原p1Hit/p2Hit均清空，故新增contactBy与显示lastHitter分开保存；发球者可以再次触球，已回击方须等对方触球后才能再次击球。已消费挥拍仍继续原时间轴。

原粒子16使用原形状、子矩阵和blur，速度高于20每回调两个、高于12一个；从球移动前位置生成，保留原随机位置/方向/自转/速度/缩小和1000深度槽。原alphaRate未定义，NaN alpha赋值被忽略，粒子保持100%透明度系数，按旋转后脚本宽度缩到原3.8px的10%删除；没有自行添加渐隐。固定随机参考的18回调轨迹、旋转、缩小、f32宽度与删除时点均匹配。球网425保留12帧、原根矩阵与bevel，碰撞play只继续当前帧，播放至12后回1停止。所有粒子/随机状态/球区域/朝向/出生帧/接触标记/网帧与事件进入完整和增量快照并校验。

新增 [原素材导出](../../../scripts/import-badminton-ball-art.py) 与 [PNG边界计算](../../../scripts/badminton_export.py)。静态球场只去掉netSprite，动态网保留全部原帧；球的红色glow和居中shadow分别导出，画面只旋转球形与阴影形状，投影偏移仍按原滤镜方向固定在父空间。原球图曾以人工中心旋转整张含阴影PNG，现按来源注册点和碰撞前朝向绘制。网、P2、P1、球与槽号排序后的粒子遵循原深度。PNG栅格化与缩放仍是对原矢量/滤镜的栅格近似，不声称全像素等价。

本次发现此前导入器使用SVG未滤镜边界作为PNG偏移，但JPEXS的PNG采用扩展滤镜边界，导致人物/球拍位置偏移。已按 [JPEXS26.2.1 DefineSpriteTag](https://github.com/jindrapetrik/jpexs-decompiler/blob/version26.2.1/libsrc/ffdec_lib/src/com/jpexs/decompiler/flash/tags/DefineSpriteTag.java) 与 [Timeline](https://github.com/jindrapetrik/jpexs-decompiler/blob/version26.2.1/libsrc/ffdec_lib/src/com/jpexs/decompiler/flash/timeline/Timeline.java) 的实际计算补正：递归子层最大留白与每层滤镜之和向上取整，PNG左上减去留白。原十张人物/70张球拍PNG字节未改，元数据保留SVG注册点和filterPadding，绘制改用正确PNG原点。球/网/粒子也使用相同规则。原单测中旧44.35/404.8等坐标改用实际AS2探针44.25/404.75；原矩形框外测点重新放到对应原第3帧真正框外，原命中门槛没有放宽。

新增 [三Chrome正常输入过程](../../../tests/badminton-physics-e2e.cjs)：P2走到原墙边，P1正常发球，P2较晚挥拍自然产生低球、落地反弹再碰网；检查网面帧、粒子、原图注册点/裁剪/绘制变换/透明度/层级、击球与得分声音、粒子和网播放时完整恢复及全屏。没有世界状态、球速、计分、计时或库存夹具。浏览器Canvas平移使用float32，绘制核对采用明确的f32转换，未用任意像素误差放宽。首次脚本以double平移作断言产生大量错误，格式化大数组导致测试进程内存耗尽；改正测试的数值模型并限制诊断数量后复测通过，游戏阈值未改变。

既有正常实际回球/完整7分比赛/观战重开、按住与方向替代/取消/精确45回调换发、114帧人物绘制/相位恢复/全屏及僵尸四Chrome回归继续执行。当前原菜单/暂停/淡入/结算/六级CPU与机器人、触屏取消及更多组合运行对照仍未完成；平台30Hz权威、结束冻结与自动重开、共享视野和键盘替代继续保留。完整参考轨迹仅覆盖本批所列路径，不能推断全部Flash全局回调等价。

本地418项默认、51项相关（含8项原羽毛球）及5项部署检查、类型/构建来源检查全部通过，见 [默认测试](tests.log) 与 [相关测试](targeted-tests.log)。三套既有羽毛球过程、[新特效过程](local-physics-results.json) 和僵尸四人过程均通过。新增普通输入测试按网络时延调整合法出手时机，必要时使用真实新房间/重新入座准备重试；未写入世界状态或改变命中/动画断言。首次走位失败来自切换前台后的visibilitychange清输入，测试等待页面可见/聚焦及两个绘制帧后再按键；短网动画截图由观战端单独采集，避免三端同时编码PNG干扰采样。[碰网截图](local-net-impact.png) 与 [全屏](local-fullscreen.png) 来自实际Canvas。三套缓存导入复现93个元数据/PNG文件逐字节一致，见 [重建哈希](cached-rebuild.json)。

`909cd5c` 已于北京时间2026-10-26 19:15发布腾讯云；5305文件清单和273项公网哈希通过。实际 [公网特效过程](public-physics-results.json) 由普通按键一次产生目标低球/落地反弹/碰网，三端分别观察7/6/5个网面帧，原图裁剪/变换/透明度/层级全部匹配；粒子和网播放中完整恢复，每端两次权威击球恰好触发两次hit播放调用。音效测试截获HTMLMediaElement.play，不评价听感。见 [实际碰网](public-net-impact.png) 与 [全屏](public-fullscreen.png)。

首次公网脚本未成功，是绘制记录器在球场PNG之前收到小网图时group为空，抛出错误并中断测试页面渲染；[诊断](public-driver-diagnostic.log) 同时记录服务器已真实碰网，确认问题来自测试仪器。记录器改为从网层开始记录每帧组，并保留首个页面错误/逐次出手帧的诊断；公网复测通过，线上构建未因该问题改动。此前固定时序与单一房间重试也会遇到换发方变化，脚本现以真实新房间/重新入座准备尝试，根据收到的快照和最小RTT安排合法按键，不注入输入包或世界状态。

公网 [人物](public-characters-results.json) 观察双方四种前后步行全部八帧、普通动作十一帧和固定跳跃，裁剪/定位/相位恢复/全屏通过；[控制与自然7:0](public-controls-results.json)、[实际回球与自然0:7](public-match-results.json)、观战和自动重开均通过。僵尸 [四端过程](public-boxhead-four-results.json) 继续通过，机制未改。发布路径/包与构建哈希/服务/检查范围见 [发布记录](public-deployment.json)，逐文件值见 [公网哈希](public-hashes.json)。本批没有重测容量或实际TURN中继，短时工作机测试不构成异地/长期保证。

剩余范围继续包括原单人/机器人/六级CPU、原菜单/HUD/暂停/淡入/胜负流程，以及复杂全局回调、形状边缘和滤镜像素对照。例如参考已采到左墙shape hitTest的两个外沿结果，当前移动仍使用点范围，须继续核对极端边界与组合路径，不能仅凭正常走位通过认定所有原碰撞等价。僵尸危机3完整集合/Mapwho历史、视线、波次/难度/补给/升级/模式/选人/HUD等仍未完成，整体目标保持。
