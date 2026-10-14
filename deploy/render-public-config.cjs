"use strict";
// Generate files into an explicit directory; installation is handled separately.
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");

function render(env) {
  const domain = env.ARCADE_DOMAIN || env.PUBLIC_IP || "";
  const turnHost = env.TURN_DOMAIN || domain;
  const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  if (![domain, turnHost].every((host) => domainPattern.test(host) || net.isIP(host) === 4)) throw new Error("ARCADE_DOMAIN and TURN_DOMAIN must be DNS names or IPv4 addresses, without scheme, path or port.");
  if (net.isIP(env.PUBLIC_IP || "") !== 4) throw new Error("PUBLIC_IP must be the server's public IPv4 address.");
  if (env.PRIVATE_IP && net.isIP(env.PRIVATE_IP) !== 4) throw new Error("PRIVATE_IP must be the IPv4 address of the server interface (for NAT).");
  if (!/^[a-f0-9]{64}$/i.test(env.TURN_SECRET || "")) throw new Error("TURN_SECRET must be 32 random bytes encoded as 64 hex characters.");
  const port = (value, fallback) => {
    const number = Number(value || fallback);
    if (!Number.isInteger(number) || number < 1024 || number > 65535) throw new Error("Invalid service port (1024–65535 required).");
    return number;
  };
  const appPort = port(env.ARCADE_PORT, 8000), turnPort = port(env.TURN_PORT, 3478);
  const min = port(env.TURN_MIN_PORT, 49160), max = port(env.TURN_MAX_PORT, 49260);
  if (min >= max || [appPort, turnPort].some((p) => p >= min && p <= max) || appPort === turnPort) throw new Error("Application, TURN listener and relay ports must not overlap.");
  const secret = env.TURN_SECRET;
  return {
    "arcade-online.caddy": `# Managed by ArcadeOnline\nhttps://${domain} {\n${net.isIP(domain) ? "    tls {\n        issuer acme {\n            dir https://acme-v02.api.letsencrypt.org/directory\n            profile shortlived\n        }\n    }\n" : ""}    encode zstd gzip\n    reverse_proxy 127.0.0.1:${appPort}\n}\n`,
    "turnserver.conf": `# Managed by ArcadeOnline\nlistening-port=${turnPort}\nlistening-ip=0.0.0.0\n${env.PRIVATE_IP ? `relay-ip=${env.PRIVATE_IP}\n` : ""}external-ip=${env.PUBLIC_IP}${env.PRIVATE_IP ? "/" + env.PRIVATE_IP : ""}\nmin-port=${min}\nmax-port=${max}\nrealm=${turnHost}\nfingerprint\nuse-auth-secret\nstatic-auth-secret=${secret}\nstale-nonce=600\nuser-quota=12\ntotal-quota=200\nmax-bps=1048576\nbps-capacity=33554432\nno-cli\nno-tls\nno-dtls\nno-multicast-peers\ndenied-peer-ip=0.0.0.0-0.255.255.255\ndenied-peer-ip=10.0.0.0-10.255.255.255\ndenied-peer-ip=127.0.0.0-127.255.255.255\ndenied-peer-ip=169.254.0.0-169.254.255.255\ndenied-peer-ip=172.16.0.0-172.31.255.255\ndenied-peer-ip=192.168.0.0-192.168.255.255\ndenied-peer-ip=::1\ndenied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff\nlog-file=stdout\nsimple-log\n`,
    "public.env": `HOST=127.0.0.1\nPORT=${appPort}\nTURN_URLS=turn:${turnHost}:${turnPort}?transport=udp,turn:${turnHost}:${turnPort}?transport=tcp\nTURN_SECRET=${secret}\n`,
    "ports.txt": `HTTPS: TCP 80,443\nTURN listener: UDP/TCP ${turnPort}\nTURN relay: UDP ${min}-${max}\nApplication: 127.0.0.1:${appPort} (loopback only)\n`
  };
}

if (require.main === module) {
  const directory = process.argv[2];
  if (!directory) throw new Error("Usage: node deploy/render-public-config.cjs OUTPUT_DIRECTORY");
  const files = render(process.env);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), content, { mode: 0o600 });
  console.log("Public configuration generated (secrets omitted).");
}
module.exports = { render };
