# ArcadeOnline Linux 部署

这是不依赖 Docker 的原生部署方式，适用于 Ubuntu、Debian、Rocky/Alma、Fedora 和 openSUSE 等带 systemd 的 Linux 发行版。

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
NODE_VERSION=22.18.0 bash deploy-linux.sh
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
