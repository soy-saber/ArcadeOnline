# ArcadeOnline Linux 部署

部署支持带 systemd 的 Linux；当前现场为 **Ubuntu 26.04.1 LTS，仅公网 IPv4，无需域名**。不依赖 Docker、数据库或 Redis。Node.js 运行八款游戏的服务器模拟，浏览器发送输入并绘制确认状态，通过 WSS 联机。建议至少 1 核 1GB 内存，实际承载量仍需实机压测。

实际部署：`https://223.109.141.251/`，应用监听 `127.0.0.1:18088`（8000 已有其他服务）。可信 HTTPS、WSS 入房和服务器状态同步已通过；现场版本、校验与证据见 `DEPLOYMENT_STATUS.md`。当前服务器游戏不依赖 TURN，下方 TURN 配置保留供旧 WebRTC 部署追溯，未验收的 TURN 端口不阻塞当前 WSS 游戏。

仅 IP 且经过 NAT 时，部署会在 Caddy 全局选项中设置 `default_sni` 为公网 IP，以便未发送 SNI 的浏览器选择正确证书；若已有其他站点的不同 `default_sni`，安装会停止并恢复配置，要求人工整合。依据：[Caddy 全局 default_sni](https://caddyserver.com/docs/caddyfile/options#default-sni)。

## 推荐：上传安装包，部署公网 IP + HTTPS + TURN

本地先执行：

```powershell
npm run package:linux
```

生成 `artifacts/releases/arcade-online-linux.tar.gz` 和同名 `.sha256` 校验文件。包内含统一联机页面、生产模拟包、所需精选素材、部署脚本和校验清单；不含旧 native 网页、原串流、games/libs、依赖目录、密钥、`.env` 或反编译中间文件。修改代码或素材后重新打包，实际体积以打包输出为准。

把这两个文件上传到服务器（例如使用 `scp`），然后执行：

```bash
sha256sum -c arcade-online-linux.tar.gz.sha256
mkdir -p arcade-online-release
tar -xzf arcade-online-linux.tar.gz -C arcade-online-release
cd arcade-online-release

# 把示例地址换成你的服务器公网 IPv4。
sudo env PUBLIC_IP=203.0.113.10 bash deploy/public-linux.sh
```

**先在云安全组与主机防火墙放行 TCP 80、443**，以便证书签发。完整开放范围：

| 用途 | 入站端口 |
| --- | --- |
| HTTP 证书验证与 HTTPS 跳转 | TCP 80 |
| 网站及当前 WSS 游戏输入/快照 | TCP 443 |
| 旧 WebRTC 的 TURN 连接（当前游戏不使用） | UDP 3478、TCP 3478 |
| 旧 WebRTC 的 TURN 数据转发 | UDP 49160–49260 |
| SSH 运维 | 保留你当前实际使用的 SSH 端口 |

公网安装完成后，Node 只监听 `127.0.0.1:8000`，不需要开放 8000。脚本不会改防火墙。若主机已经启用 UFW，可添加规则：

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 49160:49260/udp
```

脚本部署三项 systemd 服务：`arcade-online`、`caddy`、`coturn`，启用开机启动。Node 固定为 22.23.3，Caddy 固定为 2.11.7，分别校验官方 SHA256 与 SHA512。Caddy 使用发行版提供的服务用户和 systemd 单元，通过独立 drop-in 选择新版可执行文件，避免 Ubuntu 内置旧版本不支持证书 profile。

浏览器访问 `https://你的公网IP/`。IP 证书通过 Let's Encrypt 的 `shortlived` profile 申请，由 Caddy 自动续期，服务器需持续在线，80/443 在续期时也必须可达。当前部署已验证真实 IP 证书签发、Ubuntu 服务启动和可信 HTTPS/WSS；**真实 TURN 链路与一次实际自动续期仍待验收**。新部署也需逐项检查，不能把“安装服务成功”当作“证书已签发”。

证书机制参考：[Let's Encrypt profiles](https://letsencrypt.org/docs/profiles/#shortlived)、[Caddy ACME issuer](https://caddyserver.com/docs/caddyfile/directives/tls#acme)、[本次使用的 Caddy 版本](https://github.com/caddyserver/caddy/releases/tag/v2.11.7)。

## NAT、域名和自定义端口

云服务器的公网 IP 经常映射到一块私网网卡。脚本会根据默认路由检测网卡地址；多网卡或复杂路由时显式指定：

```bash
sudo env PUBLIC_IP=203.0.113.10 PRIVATE_IP=10.0.0.5 bash deploy/public-linux.sh
```

这会为 coturn 写入 `external-ip=公网IP/网卡IP`。云平台必须把 TURN 监听与中继端口一一映射到该机器。之后有域名时，把 A 记录指向公网 IP，然后执行：

```bash
sudo env PUBLIC_IP=203.0.113.10 ARCADE_DOMAIN=play.example.com bash deploy/public-linux.sh
```

可选变量：`TURN_DOMAIN`、`ARCADE_PORT`、`TURN_PORT`、`TURN_MIN_PORT`、`TURN_MAX_PORT`。不传 `TURN_DOMAIN` 时沿用网页地址；独立 TURN 域名应直接解析到服务器，不通过普通 HTTP CDN 代理。默认提供 TURN UDP/TCP，未启用 TURN TLS；在封锁 3478 的网络仍可使用 443 上的 WSS 备用中继。

## 上线验收

在解压目录中执行（新机器上的 Node 完整路径如下）：

```bash
/opt/arcade-online/node/bin/node scripts/check-public.cjs https://你的公网IP
/opt/arcade-online/node/bin/node scripts/check-turn.cjs https://你的公网IP
sudo systemctl --no-pager status arcade-online caddy coturn
```

`check-public` 检查可信 TLS 连接、健康接口、页面／脚本、游戏目录、临时 TURN 凭据以及真实 WSS 加入房间。`check-turn` 使用 UDP 完成认证分配、检查服务器公布的中继 IP／端口，再释放分配。**还需从服务器之外的网络执行 TURN 检查**；成功分配不能替代两台设备真正通过中继传输数据。

再用不同网络的两台设备进入同一房间：分别入座和准备，检查自动开始 1 对 1、移动、普通炸弹、特殊武器、观战、刷新与重连；有条件时用四台设备复测四人全员准备开局。测试时记录 RTT、校正次数与是否回退中继。真实 TURN 路径可在 Chromium 的 `chrome://webrtc-internals` 中检查选中的候选对（relay）。验收时两端打开 `/native-room.html?game=3881-native&room=turncheck&debug=1&turn=1`，会用 `iceTransportPolicy: relay` 强制 WebRTC 仅使用 TURN。如果依旧显示「中继连接」则是 WSS 回退，不能证明 TURN 数据路径通过；显示「对等连接」且选中 relay 候选对才是成功。普通邀请链接会移除测试参数。

本地验证命令：`npm run test:deploy`。覆盖配置校验、真实 Node/WS 探测，以及 TURN 认证协议夹具；检测到 `CADDY` 环境变量指向的可执行文件时，还测试真实 Caddy 配置解析。这些检查没有假装在 Windows 上启动 Ubuntu/systemd。

## 更新、回滚与凭据

上传新安装包、校验、解压后，执行 `sudo bash deploy-linux.sh` 更新应用。只改游戏不必重复安装 Caddy/coturn。部署会先检查原生构建哈希和包内 SHA256 清单，再安装生产依赖；新版本健康检查失败会切回旧版。

```bash
sudo bash deploy-linux.sh rollback
sudo journalctl -u arcade-online -n 100 --no-pager
sudo journalctl -u caddy -n 100 --no-pager
sudo journalctl -u coturn -n 100 --no-pager
```

更新会重启房间服务，正在玩的房间会断开；请选空闲时段。回滚针对应用版本，配置、运行时与 TLS/TURN 不跟随应用版本回滚。旧版本保留在 `/opt/arcade-online/releases`，不会自动删除。

配置位置：

- `/etc/arcade-online.env`：Node 配置和 TURN 共享密钥，权限 0600，由 systemd 读取。
- `/etc/arcade-online/turn.secret`：安装时随机生成的共享密钥，重装沿用；不需要手动复制到客户端。
- `/etc/turnserver.conf`：coturn 配置，root/turnserver 组可读；有总配额、单用户配额和转发速率限制。
- `/etc/caddy/arcade-online.caddy`：本项目 HTTPS 站点，主 Caddyfile 通过 import 引用。
- `/etc/arcade-online/backups`：公网配置修改前的备份；配置应用失败时恢复受影响文件。

服务使用系统时间生成 TURN 凭据，保持 `timedatectl status` 中时钟同步。`/rtc-config` 返回一小时有效的临时凭据，浏览器定期刷新；共享密钥不出现在 HTTP 响应或安装包中。

## 单独部署应用／其他 Linux 发行版

下面是不安装 HTTPS/TURN 的基础部署，适用于 Ubuntu、Debian、Rocky/Alma、Fedora 和 openSUSE 等带 systemd 的 Linux 发行版。其他发行版的 Caddy/coturn 需按上文配置手动集成。

## 一键部署

在仓库根目录执行：

```bash
bash deploy-linux.sh
```

脚本会自动完成：

- 请求 root 权限并安装 `curl`、`tar`、`sha256sum` 等基础工具
- 下载并校验官方 Node.js 22 运行时（支持 x86_64、aarch64、armv7l）
- 使用 `package-lock.json` 安装生产依赖
- 将应用发布到 `/opt/arcade-online`
- 创建低权限系统用户 `arcade-online`
- 创建并启用 `arcade-online.service`
- 等待 `/healthz` 返回成功

浏览器访问脚本最后打印的地址，默认端口是 `8000`。

## 常用命令

```bash
bash deploy-linux.sh status
bash deploy-linux.sh logs
bash deploy-linux.sh restart
bash deploy-linux.sh stop
```

拉取新代码后重新发布：

```bash
git pull
bash deploy-linux.sh
```

## 端口和运行时配置

首次部署时可以指定端口：

```bash
ARCADE_PORT=18088 bash deploy-linux.sh
```

配置会保存到 `/etc/arcade-online.env`。之后直接重新部署会保留该文件中的端口；需要修改时再次传入 `ARCADE_PORT` 即可。

也可以指定 Node.js 版本：

```bash
NODE_VERSION=22.23.3 bash deploy-linux.sh
```

## 防火墙

脚本不会自动修改防火墙规则。使用 `ufw` 时：

```bash
sudo ufw allow 8000/tcp
```

使用 `firewalld` 时：

```bash
sudo firewall-cmd --permanent --add-port=8000/tcp
sudo firewall-cmd --reload
```

若部署到公网，建议在前面配置 HTTPS 反向代理；同一局域网内直接使用 HTTP 即可。

## 服务文件

- 应用当前版本：`/opt/arcade-online/current`
- Node.js 运行时：`/opt/arcade-online/node`
- 配置：`/etc/arcade-online.env`
- systemd：`/etc/systemd/system/arcade-online.service`
- 日志：`journalctl -u arcade-online.service`
