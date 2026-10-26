# 羽毛球单人人类、机器人与六级电脑

在 `0ecc83e` 上继续 [羽毛球](../../../BADMINTON_RESTORATION_PLAN.md) 与 [僵尸危机3](../../../BOXHEAD_RESTORATION_PLAN.md) 完整复原目标。本批接入原单人人类/鼠标机器人、六级电脑及升关/重试；服务器继续计算动作、随机流、球和计分。原菜单、教学、HUD、胜负过场与结局动画仍未完整复原，僵尸剩余机制继续，不能将本批检查通过视作整体目标完成。

来源仍是 `games/46923/game.swf`，SHA256 `a4b0f9bc5ed2cbc73eb681b2d2a93567a5134d68e57e6e6b2a8c51ba360fb9cf`；解析XML SHA256 `0ed596d2814f473f4ab20bc796112799d7c3a38c886d9ac49bd003643e36583e`。本地 JPEXS26.2.1 与 Ruffle `0.6.0-nightly.2026.8.6` 用于导出与原AS2参考执行，原SWF、Ruffle和分析缓存不进入线上包。没有独立运行Adobe Flash二进制。

## 实现与来源

房间可选双人、单人人类、单人机器人。单人仅P1入座并准备即可开始，P2是服务器电脑，禁止真人占用或输入。管理者只能在等待/结束时切换模式，切换清除准备；不能通过选项跳关、设分或替换AI。暂停、Next、Retry、Menu均校验角色、当前局、递增命令序号和实际胜负。Next只允许当前关胜利且未到第六关，Retry只允许当前关失败；完整/增量快照保存关卡、AI内部变量、鼠标目标、机器人相位、暂停和事件计数。重连保持关卡与命令序号并取消旧的持续操作。

原人类单人 `setupHero` 在球低于人物Y−40时走下手挥拍16–29帧；双人 `setupHero1/2` 仍走上手。机器人 `setupHero1p` 按鼠标二分跟随并叠加原余弦悬浮，保留原网侧上限与发球限制。原代码在左/上/下限中的分支为空，没有另加移动边界。按住鼠标、触点或S/↓击球，原Space只改变跳跃姿态和dy而没有在机器人回调中施加重力。暂停/结束仍继续原悬浮与拖尾，停止跟随和击球。初始发射标记Y378.5比地面376.25高2.25像素；人类/CPU首帧落地会掩盖此差异，机器人必须从原Y358.5开始。

六级电脑对应原268/267/261/255/248/242人物符号，概率门槛为0/10/20/35/50/70。第三关身体较矮，球拍与发球点比常规低21像素；第四关使用特殊球拍角度/边界。移植保留原AI动作顺序、随机抽取、未定义变量分支和暂停时的重力。`swingVar/swingVar2` 初始未定义，用null表达；升关保留它们和全局chance1。CPU初次创建先于P1，因此首关实际回调P1先于CPU；升关替换CPU后改为CPU先于P1。不能用同一固定顺序替代所有关卡。

去混淆器将CPU的getTimer错误折成1928/4084；P-code确认是原GetTime，现由30Hz权威回调时钟表达，保持严格 `serveTime+500 < now`。原舞台只有servingSpot2/3，缺少0/1；缺失坐标产生的比较分支照原保留，没有补造标记点。原Next替换CPU并归零比分，保留P1姿态、动作、粒子和全局变量；Retry保留双方演员与动作。单人结束后保持原回调等待Next/Retry，双人保留平台既有3秒自动续局。

[素材导入器](../../../scripts/import-badminton-solo.py) 导出42张图集、495帧，覆盖CPU/机器人身体、拖尾，以及完整根层球拍放置。双人人体继续使用既有十张动作图集。旧球拍单图只导出内层gun，遗漏根层alpha/滤镜；本批球拍图集保留原根矩阵、alpha、阴影和模糊，按PNG滤镜扩展后的注册点绘制。正常人类与CPU2表情按原脚本冻结在normal帧，其余CPU头饰保留原静态层。PNG是原矢量/滤镜的栅格导出，不能声称与原运行每个像素完全相等。

机器人每回调生成两个原particle4，共用随机位置、各自方向/自转/速度/缩小，严格12次随机抽取；与球particle3共用1000计数器但分别占135000/180000深度。同名实例可在不同深度共存，同类型相同槽才被替换。原变换/f32宽度与10%删除阈值分别保留。机器人深度139969，在机器人拖尾135000之上、球拖尾180000之下；CPU59998、球119999。音效 `badminton-sigh.mp3` 与 `badminton-next.mp3` 分别来自原312_sigh和111_shotgun，失败/进入下一关使用，来源哈希见本批导入记录。

原透明墙/网限制的true shape测试改为原世界边界裁剪、f32逆矩阵及ties-even twip点转换，保留形状边缘开闭方向；左墙26.5边为false、46.5边为true。右墙bounds测试继续使用原包围框。参考 [Ruffle hitTest](https://github.com/ruffle-rs/ruffle/blob/nightly-2026-08-06/core/src/avm1/globals/movie_clip.rs)、[形状绕组](https://github.com/ruffle-rs/ruffle/blob/nightly-2026-08-06/render/src/shape_utils.rs) 与 [attachMovie按深度替换](https://github.com/ruffle-rs/ruffle/blob/nightly-2026-08-06/core/src/avm1/globals/movie_clip.rs)。

## 发球审计更正

上一批 `909cd5c` 及 [物理报告](../badminton-physics-2026-10-26/README.md) 错误声称发球方可以再次触自己的发球。原因是仅检查 `setupBirdie` 工厂时看到双方p1Hit/p2Hit清空，遗漏原服务时间轴第4帧在调用返回后写入 `_root.p1Hit=true` / `_root.p2Hit=true`。本批完整原运行轨迹暴露了该错误，现发球出生就保存contactBy=发球方，下一次触球须来自对方。新增发球断言和全局原运行对照覆盖此顺序。此前隔离工厂测试不足以证明服务帧动作的最终状态，报告已明确更正。

## 参考与验收范围

[隔离参考构建](../../../scripts/prepare-badminton-solo-reference.py)、[采集](../../../scripts/trace-badminton-solo-reference.cjs)、[整理](../../../scripts/collect-badminton-solo-reference.cjs) 使用原setupCPU/setupHero/setupHero1p/mothershipTrail/turn和原嵌套符号，外部随机/键鼠/时钟由可复现提供者表达。覆盖1376个CPU分支、32个机器人回调、134个原球拍getter、104发球点、84个shape/bounds边缘查询，以及共享粒子槽共存/回绕。隔离向量在同一root action内调用，goto后的getter即时更新，嵌套帧脚本尚未逐向量刷新；其ready/active字段仅保留为观测，不作为已完成帧动作的证明。

独立 [完整运行参考](../../../scripts/prepare-badminton-live-reference.py)、[采集](../../../scripts/trace-badminton-live-reference.cjs)、[整理](../../../scripts/collect-badminton-live-reference.cjs) 让原时间轴和回调队列实际推进。八段每段60回调，覆盖人类六关与机器人第一/第六关；保留原Key/Mouse事件、嵌套帧脚本，按同一指定种子随机流和回调时钟对照。实际得到278条帧后快照，不能称为480条完整快照。得分回调仅记录pointOver，不运行下一分定时器；各段在复位前结束。逐条匹配双方坐标/动作/拍帧/标记、缓存角度、AI变量、球体、粒子、网面和随机流。[金样本](../../../tests/fixtures/badminton-solo-live.json) 与 [测试](../../../tests/authority-badminton-live.test.cjs) 区分首关与升关创建顺序。

[模式/协议测试](../../../tests/authority-badminton-modes.test.cjs) 检查单人准入、命令权限/重放、同tick暂停完整恢复、六阶段Next/Retry保留规则、无单人自动重开、重连取消、状态校验、逐回调增量恢复及仅本地姿态预测。触屏pointercancel/丢失capture新增动作墓碑，避免同一个浏览器任务内按下后取消的tap在下一输入包重放。

[浏览器专项](../../../tests/badminton-solo-e2e.cjs) 使用独立Chrome会话与正常DOM键鼠/触控/准备/Next/Retry操作；只读取权威状态安排合法操作，不授予分数、关卡、球速或计时。检查人类自然CPU回球/输球/重试、低球下手动作、暂停恢复、取消、机器人跟随/持续击球/刷新恢复/全屏，以及六关自然得分和实际Next。逐次绘制检查原图集裁剪/注册点与层级，观战端观察六种CPU。媒体play拦截用于核对事件调用，不评价实际听感。

首次鼠标检查失败是测试假定目标恰为130，但浏览器CSS坐标换算得到129.999998，原整数twip赋值正确成为129.95。等待条件现根据实际输入执行同一明确的原截断，同时验证指针确在目标处，没有放宽游戏碰撞/AI/计分条件。原双人回球、人物、控制/全局计分、球体/网/特效与僵尸四端过程继续回归。

双人控制回归首次停在P2入座，发现初始化尚未收到权威模式时UI把undefined当成单人，暂时禁用了P2按钮；修正为只有明确收到单人模式才显示CPU，测试也等待按钮实际可用再点击。粒子槽探针起初用MovieClip相等判断身份，但同名实例的路径相同导致比较不能区分深度；改用原getInstanceAtDepth的数值深度/坐标同时验证共存和替换，没有改动游戏槽号规则。

本地 [439项默认测试](tests.log)、[8项原羽毛球及5项部署](legacy-deploy-tests.log)、[21项新模式/原函数/完整运行对照](targeted-tests.log)、类型与构建来源全部通过。[46个缓存导入输出](cached-rebuild.json) 重新运行后逐字节一致，包括42图集、2份元数据与2音频；[来源与像素哈希](source.json) 和 [参考统计](reference-summary.json) 可独立审查。

最终构建 [单人实际过程](local-solo-results.json) 在正常输入下完成人类自然失败/重试、触屏取消与机器人六级挑战，六关均获胜且没有失败重试；六关部分约286秒。见 [六关结束截图](local-robot-six-completed.png)、[全屏](local-robot-fullscreen.png) 与 [人类自然失败](local-human-native-loss.png)。[实际双人回球与自然0:7](local-restoration-results.json)、[按住/替代键/自然7:0/结束延时](local-controls-results.json)、[原人物八帧/注册点/相位恢复](local-characters-results.json)、[球体/网/粒子/音效与恢复](local-physics-results.json) 及 [僵尸四Chrome过程](local-boxhead-four-results.json) 全部通过。部分大记录只保存精简证据并保留原完整采集SHA256，测试源码包含实际断言，未以截图代替过程检查。
