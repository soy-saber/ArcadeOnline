#!/usr/bin/env bash
set -Eeuo pipefail

# Public deployment on Ubuntu 22.04+ / Debian 12+, with systemd.
# Example: sudo env PUBLIC_IP=203.0.113.10 bash deploy/public-linux.sh
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
die() { printf '[arcade-online] %s\n' "$*" >&2; exit 1; }
if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
sudo env PUBLIC_IP=203.0.113.10 bash deploy/public-linux.sh
Required: PUBLIC_IP (server public IPv4)
Optional: ARCADE_DOMAIN (defaults to PUBLIC_IP), TURN_DOMAIN (defaults to site host), PRIVATE_IP (server NIC IPv4 behind NAT),
          ARCADE_PORT=8000, TURN_PORT=3478, TURN_MIN_PORT=49160, TURN_MAX_PORT=49260
Creates the application, Caddy HTTPS/WSS and coturn services. Keeps the TURN secret on updates.
IP-only HTTPS uses Let's Encrypt short-lived certificates with automatic renewal by Caddy 2.11.7.
If using DNS, A records must point at PUBLIC_IP. Allow TCP 80/443 before installation for certificate issuance.
EOF
  exit 0
fi
[[ "$(uname -s)" == Linux ]] || die "This installer requires Linux."
(( EUID == 0 )) || die "Run with sudo env PUBLIC_IP=... bash deploy/public-linux.sh"
[[ -n "${PUBLIC_IP:-}" ]] || die "Set PUBLIC_IP first."
[[ -f /etc/os-release ]] || die "Cannot identify distribution."
. /etc/os-release
case "$ID" in ubuntu|debian) ;; *) die "Public installer supports Ubuntu/Debian. See LINUX_DEPLOY.md for other distributions." ;; esac
if systemctl is-active --quiet coturn && ! grep -q '^# Managed by ArcadeOnline$' /etc/turnserver.conf; then
  die "An existing coturn service is running. Integrate its credentials manually using LINUX_DEPLOY.md instead of replacing it."
fi

bash "$ROOT_DIR/deploy-linux.sh" deploy
apt-get update
had_caddy_config=0
if [[ -e /etc/caddy/Caddyfile ]]; then had_caddy_config=1; fi
temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT
# Ubuntu 22.04 images may not have Caddy in their enabled distribution repos.
# Use the official signed stable repository only when no candidate is available.
# https://caddyserver.com/docs/install#debian-ubuntu-raspbian
if ! apt-cache show caddy >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg
  curl -fsSL --retry 3 https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o "$temp_dir/caddy-key.asc"
  gpg --batch --yes --dearmor -o "$temp_dir/caddy-key.gpg" "$temp_dir/caddy-key.asc"
  curl -fsSL --retry 3 https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o "$temp_dir/caddy-stable.list"
  install -m 0644 "$temp_dir/caddy-key.gpg" /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  install -m 0644 "$temp_dir/caddy-stable.list" /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
fi
DEBIAN_FRONTEND=noninteractive apt-get install -y caddy coturn openssl
# Ubuntu's bundled Caddy predates IP certificate profiles. Keep the distro user
# and systemd unit, but select a checksummed upstream binary in a drop-in.
CADDY_VERSION=2.11.7
case "$(uname -m)" in x86_64|amd64) caddy_arch=amd64 ;; aarch64|arm64) caddy_arch=arm64 ;; *) die "Public installer requires x86_64 or arm64." ;; esac
caddy_dir="/opt/arcade-online/caddy/$CADDY_VERSION"
if [[ ! -x "$caddy_dir/caddy" ]]; then
  archive="caddy_${CADDY_VERSION}_linux_${caddy_arch}.tar.gz"
  url="https://github.com/caddyserver/caddy/releases/download/v$CADDY_VERSION"
  curl -fsSL --retry 3 "$url/$archive" -o "$temp_dir/$archive"
  curl -fsSL --retry 3 "$url/caddy_${CADDY_VERSION}_checksums.txt" -o "$temp_dir/checksums"
  expected="$(awk -v name="$archive" '$2 == name {print $1}' "$temp_dir/checksums")"
  [[ -n "$expected" ]] || die "Caddy checksum missing."
  printf '%s  %s\n' "$expected" "$temp_dir/$archive" | sha512sum -c -
  install -d -m 0755 "$caddy_dir"
  tar -xzf "$temp_dir/$archive" -C "$temp_dir" caddy
  install -m 0755 "$temp_dir/caddy" "$caddy_dir/caddy"
fi
umask 077
install -d -m 0700 /etc/arcade-online
if [[ ! -s /etc/arcade-online/turn.secret ]]; then openssl rand -hex 32 > /etc/arcade-online/turn.secret; fi
chmod 0600 /etc/arcade-online/turn.secret
export TURN_SECRET
TURN_SECRET="$(cat /etc/arcade-online/turn.secret)"
export PUBLIC_IP
if [[ -z "${PRIVATE_IP:-}" ]] && command -v ip >/dev/null 2>&1; then
  interface_ip="$(ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}')"
  if [[ -n "$interface_ip" && "$interface_ip" != "$PUBLIC_IP" ]]; then
    export PRIVATE_IP="$interface_ip"
    printf 'Detected NAT/interface address: %s (override with PRIVATE_IP if needed)\n' "$PRIVATE_IP"
  fi
fi
export ARCADE_PORT="${ARCADE_PORT:-$(sed -n 's/^PORT=//p' /etc/arcade-online.env | tail -n 1)}"
/opt/arcade-online/node/bin/node "$ROOT_DIR/deploy/render-public-config.cjs" "$temp_dir"
unset TURN_SECRET

# Back up only the files owned/modified by this installation.
backup="/etc/arcade-online/backups/$(date -u +%Y%m%d%H%M%S)-$$"
install -d -m 0700 "$backup"
files=(/etc/arcade-online.env /etc/caddy/Caddyfile /etc/caddy/arcade-online.caddy /etc/turnserver.conf /etc/default/coturn /etc/systemd/system/caddy.service.d/arcade-online.conf)
for i in "${!files[@]}"; do
  if [[ -f "${files[$i]}" ]]; then cp -a "${files[$i]}" "$backup/$i"; fi
done
restore_configuration() {
  local i
  for i in "${!files[@]}"; do
    if [[ -f "$backup/$i" ]]; then cp -a "$backup/$i" "${files[$i]}"; else rm -f -- "${files[$i]}"; fi
  done
  systemctl daemon-reload
  systemctl restart arcade-online || true
  systemctl reload caddy || true
  systemctl restart coturn || true
  printf 'Configuration failed. Restored files from %s\n' "$backup" >&2
}
trap 'restore_configuration' ERR
install -m 0644 "$temp_dir/arcade-online.caddy" /etc/caddy/arcade-online.caddy
if (( had_caddy_config == 0 )); then
  # A fresh package installs a :80 welcome page. Let automatic HTTPS handle
  # redirects instead; configurations that existed before installation stay.
  printf '# ArcadeOnline public site\n' > /etc/caddy/Caddyfile
fi
/opt/arcade-online/node/bin/node "$ROOT_DIR/deploy/configure-caddy.cjs" /etc/caddy/Caddyfile "${ARCADE_DOMAIN:-$PUBLIC_IP}"
"$caddy_dir/caddy" validate --config /etc/caddy/Caddyfile --adapter caddyfile
install -d -m 0755 /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/arcade-online.conf <<EOF
[Service]
ExecStart=
ExecStart=$caddy_dir/caddy run --config /etc/caddy/Caddyfile
ExecReload=
ExecReload=$caddy_dir/caddy reload --config /etc/caddy/Caddyfile --force
EOF
chmod 0644 /etc/systemd/system/caddy.service.d/arcade-online.conf
sed -E '/^(HOST|PORT|TURN_URLS|TURN_SECRET)=/d' /etc/arcade-online.env > "$temp_dir/app.env"
cat "$temp_dir/public.env" >> "$temp_dir/app.env"
install -m 0600 "$temp_dir/app.env" /etc/arcade-online.env
install -o root -g turnserver -m 0640 "$temp_dir/turnserver.conf" /etc/turnserver.conf
# Debian's legacy init wrapper reads this; harmless for the native systemd unit.
printf 'TURNSERVER_ENABLED=1\n' > /etc/default/coturn
systemctl daemon-reload
systemctl enable arcade-online caddy coturn
systemctl restart arcade-online coturn caddy
sleep 2
systemctl is-active --quiet arcade-online caddy coturn
curl --fail --silent --max-time 5 "http://127.0.0.1:$ARCADE_PORT/healthz" >/dev/null
trap - ERR
printf '\nPublic services installed. Configuration backup: %s\n' "$backup"
cat "$temp_dir/ports.txt"
printf '\nOpen the above ports in the cloud security group and host firewall. Keep SSH allowed.\n'
printf 'After certificate issuance, verify: /opt/arcade-online/node/bin/node scripts/check-public.cjs https://%s\n' "${ARCADE_DOMAIN:-$PUBLIC_IP}"
printf 'This installs TURN over UDP/TCP; blocked TURN networks can still use WSS relay on 443.\n'
