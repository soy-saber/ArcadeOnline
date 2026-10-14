**ArcadeOnline 公网部署记录 · 2026-10-14**

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
