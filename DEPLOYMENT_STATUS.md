**ArcadeOnline 公网部署记录 · 2026-10-21**

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
