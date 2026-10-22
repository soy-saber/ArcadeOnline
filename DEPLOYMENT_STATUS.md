**ArcadeOnline 公网部署记录 · 2026-10-22**

2026-10-22 18:19（北京时间）清晰平面角色背景已上线，实现提交 `6920207`，当前发布目录 `/opt/arcade-online/releases/20261022102257-1537139`，上一版 `/opt/arcade-online/releases/20261022071341-1507760` 可回滚。发布包 SHA256 `09251bef4206424867debe7e8d5fe803c6ceda9341597dadb9b10e357e90e6d5`，15.4 MiB，4466 个文件校验通过。应用、Caddy、coturn 均 active，服务健康与八款游戏入房探针通过。

背景继续通过用户选定的 `https://l0veyou.com/chat` 使用 Playwright 生成、迭代。新版为可辨认五官、发饰、光环与服装配色的平面胸像，1536×864 WebP、49256 字节；只转换图片格式，尺寸和图形不作二次缩小。CSS 分别展示两侧人物并柔化边缘；宽屏为大厅预留两侧空间，1100px 及以下将人物展示在内容上方。已用 Playwright 查看公网 1600、1280、390px 截图，无横向溢出；提示词与来源已更新。证据：`artifacts/background-review/`、`artifacts/flat-clear-public-hashes.json`、`artifacts/authority-deployment-results.json`。服务器发布目录时间存在偏差，以部署工具时间为准。

2026-10-22 15:10（北京时间）分类布局与轻量轮廓背景更新已上线。实现提交 `e976cd2047b8fd0aec3f4e6d2b84aae22fddbf33`，当前 `/opt/arcade-online/releases/20261022071341-1507760`，上一版 `/opt/arcade-online/releases/20261022061214-1497942` 保留可回滚；上传目录 `/home/zkh/arcade-deploy-20261022-070944-authority/release`。包 SHA256 `a5aeeb7721a22bbedf4dc663ebc184911e3189e2e46f5b8ef723459d997238e2`，15.4 MiB，4466 文件校验、类型检查、构建哈希及三服务健康全部通过。部署工具记录 `2026-10-22T07:10:07Z`，服务器目录时间仍有时钟偏差。

分类/搜索由重建列表改为复用卡片显隐，预留滚动条空间和当前视口所需列表高度，固定封面比例，避免滚动位置钳制和重新加载。筛选按钮可自然换行，空搜索提示直接显示在列表顶部。本地与公网大厅 E2E 验证 1600、1060、700、390px 宽度下所有分类的数量、筛选栏位置/尺寸、卡片高度、滚动位置与 DOM 保留，空搜索提示可见，手机无横向溢出；八款原名、封面、旧房间跳转和旧资源 404 仍通过。公网健康与八款 WSS 入房通过。

背景按用户要求通过原选定的 Playwright 生图网站（标签 `GPT Image 2`）重新生成，改为低对比蓝紫/琥珀轮廓、细椭圆光环和时钟圆弧，无面部或服装细节，中央大留白。1280×720 WebP 为 6558 字节，较旧图 124964 字节减少约 95%；来源与完整提示词见 `public/assets/site-artwork.json`、`public/assets/site-background-prompt.txt`。页面、样式、房间、背景、提示词、来源清单、游戏包和目录公网哈希与发布包完全一致。证据 `artifacts/outline-public-hashes.json`、`artifacts/lobby-public-e2e/results.json`、`artifacts/authority-deployment-results.json`。本次仅调整大厅与共享背景，沿用既有游戏逻辑；下方为前次发布记录。

2026-10-22 大厅与服务器版更新已部署到 `https://223.109.141.251/`。当前应用 `/opt/arcade-online/releases/20261022061214-1497942`，上一版 `/opt/arcade-online/releases/20261021085137-1293425` 保留可回滚；上传目录 `/home/zkh/arcade-deploy-20261022-060818-authority/release`。发布包 SHA256 `35ac02d7b24f7147a4e2a939ca5d10ecf06ce359a0b52c66772c597837193d48`，15.5 MiB，4466 个文件与构建哈希在本地及服务器全部通过校验。包内代码/素材与实现提交 `0fc6390a7c3b2409e39bce75207aff666d058a3d` 一致；本条现场记录在部署后另行提交，不反向修改已发布包的校验。部署工具记录 `2026-10-22T06:08:45Z`（北京时间 14:08:45），服务器目录时间有时钟偏差，不能当作本地精确时间。

网站只展示八款服务器联机游戏，标题恢复原名，八张 WebP 封面为实际游戏画面。Flash 串流与浏览器房主网页、旧执行资源及原始 SWF 已退出网站/发布包；旧房间 URL 保留房间名并跳转对应服务器版。羽毛球素材和音效位于 `public/authority/assets/`。早濑优香与牧濑红莉栖最终背景通过用户指定的 Playwright 和已登录网站生成（网站模型标签 `GPT Image 2`），直接参考优香原图，已核对黑蓝三角机械发夹、双侧扎发和细长光环。WebP SHA256 `798c0eeac91beb2e13c2067135ae1efcdc28030dbb2351a21f0d3f6eecbefff6`；完整提示词与来源清单位于 `public/assets/site-background-prompt.txt`、`public/assets/site-artwork.json`。浏览器认证、临时下载地址和未选生成图不进入 Git 或发布包。

应用仍只监听 `127.0.0.1:18088`，应用、Caddy、coturn 均为 active。公网可信 HTTPS/WSS、八款目录/素材/入房、所有封面及最终背景通过；公网大厅 E2E 验证桌面和手机、分类搜索、原名、旧链接跳转与旧资源 404。僵尸危机3和 Q版泡泡堂2通过公网四 Chrome 上下文准备、姓名、移动/攻击、管理者暂停后继续模拟、完整/增量恢复、准备保留及模式/地图切换。炸弹人公网专项通过全屏姓名、武器库存、冰箭恢复与公开 3 秒后只向拥有者展示的陷阱快照。证据：`artifacts/authority-deployment-results.json`、`artifacts/lobby-public-e2e/results.json`、`artifacts/expanded-public-e2e/results.json`、`artifacts/authority-weapons-public-e2e/results.json`。

本轮本地 `npm test` 118/118、类型检查通过；服务器浏览器 E2E 覆盖四人准备/恢复与羽毛球自然 7 分结算和自动续局，四浏览器击杀 E2E 完成 10 次真实按键击杀、自然复活和自动续局。部署测试 4 通过、1 因本机无 Caddy 可执行文件跳过。干净目录 `npm ci`、类型检查与构建复现通过；发布包只安装生产依赖 `ws` 即可运行八款，不需 TypeScript/esbuild。上述公网浏览器来自同一台设备，不能据此宣称两地真实设备延迟已验收。金币/占地部分原作细则、扩展音效、冰火人逐关通关、容量与运维回滚仍待完善；当前八款使用 WSS，不依赖下方历史 TURN 待办。

**历史发布记录（以下为各次发布时的状态）**

2026-10-21 击杀模式更新已发布到 `https://223.109.141.251/`。当前目录 `/opt/arcade-online/releases/20261021085137-1293425`，上一版 `/opt/arcade-online/releases/20261021073346-1280560` 可回滚，原始资源和两个旧原生入口保留。上传目录 `/home/zkh/arcade-deploy-20261021-084719-authority/release`，发布包 SHA256 `01f1ee879ab5ee19eb76fbe6789bc38ddf29015d27718ce7917abd89d01745df`，4667 个文件和构建哈希全部通过校验；应用、Caddy、coturn 均为 active。本次仍基于未提交工作区，无新 Git 提交。部署脚本记录时间为 `2026-10-21T08:47:57Z`，服务器时钟比本地约快四分钟，目录时间不应作为本地精确时间。

Q版泡泡堂2开放四模式 × 十八地图；击杀模式实现无限基础锤子、原作武器次数/时序和攻击/死亡动画、地雷离开后感应及斜角爆炸、激光遇第一处障碍停止、死亡掉落/重置、自然复活和出生保护，先得 10 分结算后保留准备、模式/地图与战绩自动续局。84 项扩展测试、34 项服务器测试及类型检查通过。四个本地 Chrome 上下文以真实按键完成 10 次击杀、9 次自然复活、结算与自动续局；确定性站位夹具只在测试子进程中运行，不修改分数/伤害/计时，也不进入生产发布包。生产包只安装 `ws` 后成功启动八款服务器游戏，不依赖 TypeScript/esbuild。

公网验收通过 HTTPS/WSS 与目录/资源探针、四浏览器击杀模式选择/四人准备/姓名/移动/攻击/创建者暂停/恢复/增量同步/离座准备保留/地图切换；炸弹人专项回归通过全屏姓名、武器次数、冰箭恢复及陷阱私有快照。证据 `artifacts/authority-deployment-results.json`、`artifacts/expanded-kill-e2e/results.json`、`artifacts/expanded-public-e2e/results.json`、`artifacts/authority-weapons-public-e2e/results.json`、`artifacts/expanded-production-results.json`。完整 10 分对局在本地测试进程验证，公网验证为真实房间操作，未开放修改生产状态的测试接口。金币/占地的其余原作细则、音效与两地设备延迟体验仍待继续完善。当前本地预览为 `http://localhost:8000/`，本次启动 PID 46904。

2026-10-21 15:33（北京时间）更新：按用户指令读取桌面 `key.txt`，以已有 SSH 主机密钥验证连接后，将当前工作区的八款服务器权威入口部署到 `https://223.109.141.251/`。本次没有对应的新 Git 提交，发布依据为校验后的源码/构建与安装包。当前目录 `/opt/arcade-online/releases/20261021073346-1280560`（目录时间为 UTC），上一版 `/opt/arcade-online/releases/20261021072214-1278577` 可回滚；更新前旧原生版 `/opt/arcade-online/releases/20261020183031-1159686` 仍保留。上传目录 `/home/zkh/arcade-deploy-20261021-072928-authority/release`，包 SHA256 为 `a851fc17a402d686c6696206b6462a5a3766a7aba9ecaa55ad1bc0b6750e6b69`，4648 个文件和原生构建哈希通过服务器端校验。

应用仍监听 `127.0.0.1:18088`，应用、Caddy、coturn 均为 active。公网可信 HTTPS、目录、资源、TURN 临时凭据和八款新入口 WSS 入房通过；公网目录及新旧浏览器包的 SHA256 与交付包一致。旧 Flash 和 `3881-native` / `46923-native` 入口保留。

本次公网四 Chrome 上下文验证 `50737-server`（僵尸危机3 / Boxhead 四人合作）和 `9109-server`（Q版泡泡堂2 四人版）的四席位、全屏准备、姓名、移动/攻击、创建者页面暂停时继续模拟、完整/增量恢复、个人准备保留及地图切换，无脚本错误或素材 404。验收发现泡泡堂2爆炸动画误请求第 10～15 帧（实际仅 9 帧），已修正并重新部署、通过爆炸素材加载验证。炸弹人公网专项验收通过全屏姓名、武器次数、全特殊武器统一 0.2 秒硬直、冰面存在时可转向离开，以及陷阱公开 3 秒后仅放置者可见、完整恢复不泄露隐藏陷阱。证据为 `artifacts/authority-deployment-results.json`、`artifacts/expanded-public-e2e/results.json` 和 `artifacts/authority-weapons-public-e2e/results.json`。以上浏览器均由同一台本地设备访问公网，尚未验收两地真实设备的延迟表现。

2026-10-21 更新：已将 `53d9c83` 的火柴人打羽毛球双人原生联机版部署到 `https://223.109.141.251/`，独立入口为 `https://223.109.141.251/badminton-room.html?game=46923-native&room=demo`。发布目录 `/opt/arcade-online/releases/20261020155902-1137475`（UTC），上传包位于 `/home/zkh/arcade-deploy-20261020-badminton/release`，SHA256 为 `73225944c9a736459b8eb148d21e45370c1e85b09069ed411169f999adaab06f`；238 个包内文件和原生构建哈希通过校验，应用、Caddy、coturn 均为 active。公网探针验证新页面、浏览器包、音效资源、目录和双席位 WSS 入房；公网双浏览器加观战页跑通双方准备、移动、发球、7 分结算和再次准备重开。强制中继前观测到 WebRTC `p2p`，强制 WebSocket 中继后状态同步仍正常，页面无脚本错误。真实跨地点设备、TURN 数据通道和羽毛球原作动作/物理细节仍待验收。旧 Flash 羽毛球入口保留。

2026-10-20 再更新：将 `5acf9fd` 发布到公网，修复人物行走/站立时的模型尺寸切换，恢复特殊武器弹药优先于普通炸弹的攻击规则，并加入可持久化的音效开关和音量滑杆。当前目录 `/opt/arcade-online/releases/20261019181231-921469`（UTC），上一版 `/opt/arcade-online/releases/20261019171801-913055` 可回滚。上传包位于 `/home/zkh/arcade-deploy-20261020-effects/release`，SHA256 为 `f321a55ddb788ae7dab70ba09e3b28934c3c8b20e5f4f104e72298e0f702fab2`；包内 229 文件与构建哈希均通过校验。三服务 active，公网 `check-public` 通过；公网双浏览器验证音效设置刷新保留、两次特殊武器攻击不放炸弹、弹药用尽后普通炸弹成功放置，页面无脚本错误。行走比例另由本地四浏览器截图核对；真实跨设备体验仍待验收。

2026-10-20 更新：将 `1a3da26` 的四人真人联机版部署到 `https://223.109.141.251/`。发布目录 `/opt/arcade-online/releases/20261019171801-913055`（目录时间为 UTC），上一版 `/opt/arcade-online/releases/20261019120223-859533` 已保留作回滚。上传包位于 `/home/zkh/arcade-deploy-20261020/release`，SHA256 为 `2788b9742172e240ab37802047807e54ddb0e246b36a8ae9893905a566f54046`；包内 229 文件及原生构建哈希均通过校验。应用、Caddy、coturn 三服务均为 active。外网 `check-public` 的 HTTPS、资源、目录、TURN 临时凭据和 WSS 入房检查通过；公网四浏览器实测两人分别准备后自动 1 对 1、无电脑补位、远端放弹同步，以及四人全员准备后开局，页面无脚本错误。公网四人延迟、真实跨设备和 TURN 数据通道仍未验收。

2026-10-19 更新：已将原 SWF 的 12 种道具/特殊武器图标接入地图拾取物、装备栏、触屏按钮和玩法说明，并部署到 `https://223.109.141.251/`。发布目录为 `/opt/arcade-online/releases/20261019120223-859533`；上传包在 `/home/zkh/arcade-deploy-20261019/release`，SHA256 为 `5705b1ceba0b83661bb5319ff6934e18c90ea6a285e9bfeef0856c58da0e9484`。外网浏览器检查确认装备图标、12 张说明图标均加载，页面无脚本错误；本地原生 E2E 通过。下述 TURN 验收状态沿用 10 月 14 日最后一次检查，不能据此认定端口当前仍被阻断。

网址：https://223.109.141.251/

原生游戏：https://223.109.141.251/native-room.html?game=3881-native&room=demo

- SSH：`zkh@223.109.141.251`；已验证密码登录与 sudo。凭据仍位于用户指定的本地文件，本文不记录密码。
- 系统自报 Ubuntu 26.04.1 LTS / x86_64；网卡 IP 为 172.16.0.4，公网通过 NAT 映射。
- 已存在的 8000、6185、6199 服务保留；ArcadeOnline 使用 127.0.0.1:18088。
- Node 22.23.3；Caddy 2.11.7；coturn 4.6.1。三个 systemd 服务已启用并运行。
- Node 官方下载在服务器超时，改从 npmmirror 下载并与本地取得的官方 SHA256 校验一致；Caddy 从官方 GitHub 本地下载，官方 SHA512 校验后上传。
- 上传及解压工作目录：`/home/zkh/arcade-deploy-20261014`。应用目录：`/opt/arcade-online/current`。
- 配置备份：`/etc/arcade-online/backups/20261014141128-3864620`，另有修复前的 `Caddyfile-before-default-sni`。

**已验证**

- 发布包 SHA256、包内文件清单和原生构建哈希。
- 应用健康接口、systemd 启动、生产依赖安装。
- Let's Encrypt 实际签发 IP 证书，Caddy 日志记录 certificate obtained successfully；浏览器/Node 不关闭证书验证即可访问。
- 从本地网络执行 `node scripts/check-public.cjs https://223.109.141.251`：可信 TLS、静态资源、目录、临时 TURN 凭据、WSS 入房全部通过。
- 外网同机两个独立浏览器上下文通过 WSS 回退实际开局、移动并在房主权威状态中同步，无页面错误。证据：`artifacts/public-browser-results.json`。
- 本地完整原生 E2E 通过；人工约 218.6ms RTT 时一次本地移动响应约 84.7ms；这不是公网 P95。
- 部署回归 5/5 通过，含新增无 SNI/IP/NAT 配置处理及真实 Caddy 解析。

**现场修复**

证书签发成功后，IP URL 仍出现 TLS internal error。为 Caddy 全局配置加入 `default_sni 223.109.141.251` 后，可信 HTTPS 和浏览器访问通过。修复已纳入 `deploy/configure-caddy.cjs`、`deploy/public-linux.sh` 与部署测试，保留既有站点且重复应用不会重复插入。

依据：[Caddy default_sni 官方文档](https://caddyserver.com/docs/caddyfile/options#default-sni)。

**待完成 / 外部条件**

- [ ] 云安全组核查并放行 TCP 3478、UDP 3478、UDP 49160–49260；来源允许参与游戏的外部客户端。当前外网 TCP 3478 连接超时，UDP TURN 探测超时。
- [ ] 放行后重新运行 `node scripts/check-turn.cjs https://223.109.141.251`，然后 `node artifacts/public-browser-check.cjs`，验证候选对 relay/relay 和真实游戏数据。脚本位于本地 ignored artifacts，需另行交给下一 agent。
- [ ] 主机 coturn 正在监听，UFW inactive、iptables INPUT ACCEPT；目前推断云侧端口限制，尚未直接读取云安全组配置。不要把推断写成已确认原因。
- [ ] 两地、两台真实设备试玩，测 P50/P95、校正、移动端和后台恢复。当前浏览器检查由同一台本地设备完成。
- [ ] 自动续期配置与 Caddy 续期计划已生成；尚未等待一次真实续期。
- [ ] 正式演练应用回滚和服务器重启；本次未重启整机以免影响已有业务。

**运维命令**

```bash
sudo systemctl status arcade-online caddy coturn --no-pager
sudo journalctl -u arcade-online -n 100 --no-pager
sudo journalctl -u caddy -n 100 --no-pager
sudo journalctl -u coturn -n 100 --no-pager
# 在最新安装包解压目录执行应用回滚；配置与证书不随应用回滚
sudo bash deploy-linux.sh rollback
```

当前用户可先通过 HTTPS/WSS 试玩；TURN 端口与实际跨网络验收完成前，不声明公网低延迟目标已经完整达成。
