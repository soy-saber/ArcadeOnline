#!/usr/bin/env bash
set -Eeuo pipefail

# Native Linux deployment for ArcadeOnline. No Docker is required.

APP_NAME="arcade-online"
BASE_DIR="/opt/arcade-online"
SERVICE_NAME="arcade-online.service"
SERVICE_USER="arcade-online"
NODE_VERSION="${NODE_VERSION:-22.23.3}"
PORT_EXPLICIT=0
if [[ -n "${ARCADE_PORT+x}" ]]; then PORT_EXPLICIT=1; fi
ARCADE_PORT="${ARCADE_PORT:-8000}"
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="/etc/arcade-online.env"

log() { printf '\n[arcade-online] %s\n' "$*"; }
die() { printf '\n[arcade-online] ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: bash deploy-linux.sh [deploy|rollback|start|stop|restart|status|logs]

deploy (default)  Install/update Node.js, dependencies and the systemd service
rollback          Switch back to the previous healthy application release
start             Start the service
stop              Stop the service
restart           Restart the service
status            Show service status
logs              Follow the last 200 service log lines

Environment:
  ARCADE_PORT=8000       Host port (also written to /etc/arcade-online.env)
  NODE_VERSION=22.23.3   Official Node.js runtime version
EOF
}

require_linux() {
  [[ "$(uname -s)" == "Linux" ]] || die "此脚本只支持 Linux。"
  case "$(uname -m)" in
    x86_64|amd64) NODE_ARCH="x64" ;;
    aarch64|arm64) NODE_ARCH="arm64" ;;
    armv7l) NODE_ARCH="armv7l" ;;
    *) die "不支持的 CPU 架构: $(uname -m)（支持 x86_64、aarch64、armv7l）。" ;;
  esac
  [[ "$ARCADE_PORT" =~ ^[0-9]+$ ]] && (( ARCADE_PORT >= 1 && ARCADE_PORT <= 65535 )) \
    || die "ARCADE_PORT 必须是 1-65535 之间的数字。"
  [[ "$NODE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "NODE_VERSION 必须是完整版本号。"
}

reexec_as_root() {
  if (( EUID == 0 )); then return; fi
  command -v sudo >/dev/null 2>&1 || die "需要 root 权限，请安装 sudo 或使用 root 执行。"
  log "需要 root 权限，正在请求 sudo。"
  if (( PORT_EXPLICIT )); then
    exec sudo env ARCADE_PORT="$ARCADE_PORT" NODE_VERSION="$NODE_VERSION" bash "$0" "$@"
  fi
  exec sudo env NODE_VERSION="$NODE_VERSION" bash "$0" "$@"
}

install_bootstrap_tools() {
  local missing=()
  for tool in curl tar sha256sum systemctl; do
    command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
  done
  ((${#missing[@]} == 0)) && return

  log "正在安装部署工具: ${missing[*]}"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl tar coreutils systemd
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl tar coreutils systemd
  elif command -v yum >/dev/null 2>&1; then
    yum install -y ca-certificates curl tar coreutils systemd
  elif command -v zypper >/dev/null 2>&1; then
    zypper --non-interactive install ca-certificates curl tar coreutils systemd
  else
    die "找不到支持的系统包管理器，请手动安装 curl、tar、sha256sum 和 systemd。"
  fi
}

install_node_runtime() {
  local runtime_dir="$BASE_DIR/runtime/node-v$NODE_VERSION-linux-$NODE_ARCH"
  local archive="node-v$NODE_VERSION-linux-$NODE_ARCH.tar.gz"
  local url="https://nodejs.org/dist/v$NODE_VERSION/$archive"
  local temp_dir expected
  install -d -m 0755 "$BASE_DIR/runtime"
  if [[ ! -x "$runtime_dir/bin/node" || ! -x "$runtime_dir/bin/npm" ]]; then
    temp_dir="$(mktemp -d)"
    trap 'rm -rf "$temp_dir"' RETURN
    log "下载并校验 Node.js v$NODE_VERSION ($NODE_ARCH)。"
    curl --fail --location --retry 3 --silent --show-error "$url" -o "$temp_dir/$archive"
    curl --fail --location --retry 3 --silent --show-error \
      "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$temp_dir/SHASUMS256.txt"
    expected="$(awk -v file="$archive" '$2 == file { print $1; exit }' "$temp_dir/SHASUMS256.txt")"
    [[ -n "$expected" ]] || die "Node.js 校验文件中没有找到 $archive。"
    printf '%s  %s\n' "$expected" "$temp_dir/$archive" | sha256sum -c -
    tar -xzf "$temp_dir/$archive" -C "$BASE_DIR/runtime"
    [[ -x "$runtime_dir/bin/node" ]] || die "Node.js 解压后文件不完整。"
    rm -rf "$temp_dir"
    trap - RETURN
  fi
  ln -sfn "$runtime_dir" "$BASE_DIR/node"
  NODE_BIN="$BASE_DIR/node/bin/node"
  NPM_BIN="$BASE_DIR/node/bin/npm"
}

ensure_service_user() {
  if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$BASE_DIR" --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  fi
}

publish_release() {
  local release="$BASE_DIR/releases/$(date -u +%Y%m%d%H%M%S)-$$"
  install -d -m 0755 "$release"
  log "发布应用文件到 $release。"
  cp -a "$ROOT_DIR/package.json" "$ROOT_DIR/package-lock.json" "$ROOT_DIR/server.js" "$release/"
  cp -a "$ROOT_DIR/public" "$ROOT_DIR/games" "$ROOT_DIR/libs" "$release/"
  "$NODE_BIN" "$ROOT_DIR/scripts/verify-native-build.cjs"
  if [[ -f "$ROOT_DIR/release-manifest.json" ]]; then "$NODE_BIN" "$ROOT_DIR/scripts/verify-release.cjs" "$ROOT_DIR"; fi
  env PATH="$BASE_DIR/node/bin:$PATH" "$NPM_BIN" ci --omit=dev --ignore-scripts --prefix "$release"
  chown -R root:root "$release"
  chmod -R a+rX,go-w "$release"
  PRIOR_RELEASE="$(readlink -f "$BASE_DIR/current" || true)"
  switch_release "$release"
}

switch_release() {
  local target="$1"
  [[ "$target" == "$BASE_DIR/releases/"* && -f "$target/server.js" ]] || die "无效的应用版本目录。"
  ln -sfn "$target" "$BASE_DIR/current.next"
  mv -Tf "$BASE_DIR/current.next" "$BASE_DIR/current"
}

write_environment() {
  if [[ ! -f "$ENV_FILE" ]]; then
    cat > "$ENV_FILE" <<EOF
PORT=$ARCADE_PORT
NODE_ENV=production
DISCONNECT_GRACE_MS=4000
MAX_FRAME_BUFFER_BYTES=1048576
EOF
    chmod 0600 "$ENV_FILE"
  elif (( PORT_EXPLICIT )); then
    sed -i "s/^PORT=.*/PORT=$ARCADE_PORT/" "$ENV_FILE"
  fi
  EFFECTIVE_PORT="$(sed -n 's/^PORT=//p' "$ENV_FILE" | tail -n 1 | tr -d '\r" ' )"
  EFFECTIVE_PORT="${EFFECTIVE_PORT:-8000}"
  [[ "$EFFECTIVE_PORT" =~ ^[0-9]+$ ]] && (( EFFECTIVE_PORT >= 1 && EFFECTIVE_PORT <= 65535 )) || die "环境文件 PORT 无效。"
  chmod 0600 "$ENV_FILE"
}

write_systemd_unit() {
  cat > "/etc/systemd/system/$SERVICE_NAME" <<EOF
[Unit]
Description=ArcadeOnline browser game relay
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$BASE_DIR/current
EnvironmentFile=-$ENV_FILE
ExecStart=$BASE_DIR/node/bin/node $BASE_DIR/current/server.js
Restart=on-failure
RestartSec=2
KillSignal=SIGTERM
TimeoutStopSec=15
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
RestrictSUIDSGID=true
LockPersonality=true
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
  chmod 0644 "/etc/systemd/system/$SERVICE_NAME"
  systemctl daemon-reload
}

service_action() {
  case "$1" in
    start) systemctl start "$SERVICE_NAME" ;;
    stop) systemctl stop "$SERVICE_NAME" ;;
    restart) systemctl restart "$SERVICE_NAME" ;;
    status) systemctl --no-pager --full status "$SERVICE_NAME" ;;
    logs) journalctl -u "$SERVICE_NAME" -n 200 -f ;;
    *) die "未知操作: $1" ;;
  esac
}

wait_for_health() {
  local i
  log "等待服务健康检查 http://127.0.0.1:$EFFECTIVE_PORT/healthz。"
  for i in $(seq 1 30); do
    if systemctl is-active --quiet "$SERVICE_NAME" && curl --fail --silent --max-time 2 "http://127.0.0.1:$EFFECTIVE_PORT/healthz" >/dev/null; then
      log "服务已就绪。"
      return
    fi
    sleep 1
  done
  systemctl --no-pager --full status "$SERVICE_NAME" || true
  journalctl -u "$SERVICE_NAME" -n 80 --no-pager || true
  return 1
}

rollback() {
  local previous current
  previous="$(readlink -f "$BASE_DIR/previous" || true)"
  current="$(readlink -f "$BASE_DIR/current" || true)"
  [[ -n "$previous" && -f "$previous/server.js" ]] || die "没有可回滚的版本。"
  write_environment
  switch_release "$previous"
  if systemctl restart "$SERVICE_NAME" && wait_for_health; then
    ln -sfn "$current" "$BASE_DIR/previous"
    log "已恢复上一版应用。"
  else
    switch_release "$current"
    systemctl restart "$SERVICE_NAME" || true
    die "回滚版本未通过健康检查，已恢复原指向。"
  fi
}

deploy() {
  require_linux
  install_bootstrap_tools
  install -d -m 0755 "$BASE_DIR" "$BASE_DIR/releases"
  install_node_runtime
  ensure_service_user
  publish_release
  write_environment
  write_systemd_unit
  systemctl enable "$SERVICE_NAME"
  if ! { systemctl restart "$SERVICE_NAME" && wait_for_health; }; then
    if [[ -n "$PRIOR_RELEASE" && -f "$PRIOR_RELEASE/server.js" ]]; then
      switch_release "$PRIOR_RELEASE"
      systemctl restart "$SERVICE_NAME" || true
      log "新版本启动失败，已恢复旧版本；请检查服务日志。"
    else
      systemctl stop "$SERVICE_NAME" || true
    fi
    die "新版本未通过健康检查。"
  fi
  if [[ -n "$PRIOR_RELEASE" && -f "$PRIOR_RELEASE/server.js" ]]; then ln -sfn "$PRIOR_RELEASE" "$BASE_DIR/previous"; fi
  local host_ip
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  log "部署完成。"
  printf '本机访问:  http://127.0.0.1:%s\n' "$EFFECTIVE_PORT"
  [[ -n "$host_ip" ]] && printf '局域网访问: http://%s:%s\n' "$host_ip" "$EFFECTIVE_PORT"
  printf '日志命令:  bash %s logs\n' "$ROOT_DIR/deploy-linux.sh"
}

main() {
  local action="${1:-deploy}"
  case "$action" in
    -h|--help|help) usage; return 0 ;;
  esac
  reexec_as_root "$@"
  if [[ "$action" == "deploy" || "$action" == "update" || "$action" == "up" ]]; then
    deploy
  elif [[ "$action" == "rollback" ]]; then
    rollback
  else
    service_action "$action"
  fi
}

main "$@"
