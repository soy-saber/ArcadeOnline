"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const dgram = require("node:dgram");
const http = require("node:http");
const { spawn, execFileSync } = require("node:child_process");
const { render } = require("../deploy/render-public-config.cjs");
const { configure } = require("../deploy/configure-caddy.cjs");
const { check } = require("../scripts/check-public.cjs");
const { probe, attributes } = require("../scripts/check-turn.cjs");
const root = path.join(__dirname, "..");
const sample = { PUBLIC_IP: "203.0.113.10", TURN_SECRET: "a".repeat(64) };

test("IP TLS selects public certificate without SNI and preserves existing sites", () => {
  const existing = "# Existing sites\n:80 { respond ok }\n";
  const result = configure(existing, sample.PUBLIC_IP);
  assert(result.startsWith("{\n    default_sni 203.0.113.10\n}"));
  assert(result.includes(existing));
  assert.equal(configure(result, sample.PUBLIC_IP), result);
  const global = configure("# Options\n{\n email admin@example.com\n}\n:80 { respond ok }\n", sample.PUBLIC_IP);
  assert(global.includes("default_sni 203.0.113.10\n email"));
  assert.throws(() => configure("{\n default_sni other.example.com\n}\n", sample.PUBLIC_IP));
  assert(!configure(existing, "play.example.com").includes("default_sni"));
});

test("IP HTTPS uses short-lived ACME; DNS, NAT, credentials and private port match", () => {
  const ip = render(sample);
  assert(ip["arcade-online.caddy"].includes("https://203.0.113.10"));
  assert(ip["arcade-online.caddy"].includes("profile shortlived"));
  assert(!ip["arcade-online.caddy"].includes(sample.TURN_SECRET));
  assert(ip["public.env"].includes("HOST=127.0.0.1"));
  assert(ip["public.env"].includes("turn:203.0.113.10:3478?transport=udp"));
  const dns = render({ ...sample, ARCADE_DOMAIN: "play.example.com", TURN_DOMAIN: "turn.example.com", PRIVATE_IP: "10.2.0.4", ARCADE_PORT: "18088" });
  assert(dns["arcade-online.caddy"].includes("127.0.0.1:18088"));
  assert(!dns["arcade-online.caddy"].includes("shortlived"));
  assert(dns["turnserver.conf"].includes("external-ip=203.0.113.10/10.2.0.4"));
  assert(dns["turnserver.conf"].includes("realm=turn.example.com"));
  assert(dns["turnserver.conf"].includes("static-auth-secret=" + sample.TURN_SECRET));
  for (const overrides of [{ ARCADE_DOMAIN: "bad\n{\n}" }, { PUBLIC_IP: "10.1.1.999" }, { PRIVATE_IP: "x" }, { TURN_SECRET: "guess" }, { ARCADE_PORT: "49170" }, { TURN_MIN_PORT: "49260", TURN_MAX_PORT: "49160" }]) assert.throws(() => render({ ...sample, ...overrides }));
});

const caddy = process.env.CADDY || path.join(root, "artifacts/deploy-tests/tools/caddy/caddy.exe");
test("real Caddy parser accepts IP and DNS configurations and selects public ACME", { skip: !fs.existsSync(caddy) }, () => {
  const folder = path.join(root, "artifacts/deploy-tests/configs"); fs.mkdirSync(folder, { recursive: true });
  for (const [name, env] of [["ip", sample], ["dns", { ...sample, ARCADE_DOMAIN: "play.example.com" }]]) {
    const file = path.join(folder, name + ".caddy");
    const site = render(env)["arcade-online.caddy"];
    const config = configure(site, env.ARCADE_DOMAIN || env.PUBLIC_IP).replace("import /etc/caddy/arcade-online.caddy", "");
    fs.writeFileSync(file, config);
    const json = JSON.parse(execFileSync(caddy, ["adapt", "--adapter", "caddyfile", "--config", file], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }));
    assert(json.apps.http.servers);
    if (name === "ip") {
      const issuer = json.apps.tls.automation.policies[0].issuers[0];
      assert.equal(issuer.module, "acme"); assert.equal(issuer.profile, "shortlived");
      assert(Object.values(json.apps.http.servers).some(server => server.tls_connection_policies?.some(policy => policy.default_sni === sample.PUBLIC_IP)));
    }
  }
});

test("public readiness probe checks a real service and websocket upgrade", async () => {
  const port = 28000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ["server.js"], { cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), TURN_URLS: "turn:203.0.113.10:3478?transport=udp", TURN_SECRET: sample.TURN_SECRET }, windowsHide: true, stdio: "ignore" });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/healthz`); break; } catch { await new Promise((r) => setTimeout(r, 50)); } }
    await check(`http://127.0.0.1:${port}`);
  } finally { child.kill(); }
});

test("TURN probe authenticates, decodes relay address and releases its allocation", async () => {
  // Independent protocol fixture, not a substitute for real coturn deployment.
  const username = "2100000000:test", credential = "temporary-test-password", realm = "turn.example.com", nonce = "server-nonce";
  const key = crypto.createHash("md5").update(`${username}:${realm}:${credential}`).digest();
  const udp = dgram.createSocket("udp4"); let released = false, failure;
  const attr = (type, data) => { const b = Buffer.alloc(4 + Math.ceil(data.length / 4) * 4); b.writeUInt16BE(type); b.writeUInt16BE(data.length, 2); data.copy(b, 4); return b; };
  udp.on("message", (packet, from) => {
    try {
      const values = attributes(packet), type = packet.readUInt16BE(0);
      let replyType, valuesOut;
      if (!values.has(6)) {
        replyType = 0x113; valuesOut = [attr(0x14, Buffer.from(realm)), attr(0x15, Buffer.from(nonce)), attr(9, Buffer.from([0, 0, 4, 1]))];
      } else {
        assert.equal(values.get(6).toString(), username); assert.equal(values.get(0x14).toString(), realm); assert.equal(values.get(0x15).toString(), nonce);
        assert.equal(values.get(8).toString("hex"), crypto.createHmac("sha1", key).update(packet.subarray(0, packet.length - 24)).digest("hex"));
        if (type === 4) { released = true; assert.equal(values.get(0x0d).readUInt32BE(), 0); replyType = 0x104; valuesOut = []; }
        else {
          assert.equal(values.get(0x19)[0], 17); replyType = 0x103;
          const relay = Buffer.from([0, 1, 0, 0, 203 ^ 0x21, 0 ^ 0x12, 113 ^ 0xa4, 10 ^ 0x42]); relay.writeUInt16BE(49180 ^ 0x2112, 2);
          valuesOut = [attr(0x16, relay)];
        }
      }
      const body = Buffer.concat(valuesOut), header = Buffer.from(packet.subarray(0, 20)); header.writeUInt16BE(replyType); header.writeUInt16BE(body.length, 2);
      udp.send(Buffer.concat([header, body]), from.port, from.address);
    } catch (e) { failure = e; }
  });
  await new Promise((r) => udp.bind(0, "127.0.0.1", r));
  const server = http.createServer((req, res) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ iceServers: [{ urls: `turn:127.0.0.1:${udp.address().port}?transport=udp`, username, credential }] })); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const allocation = await probe(`http://127.0.0.1:${server.address().port}`);
    assert.deepEqual(allocation, { relayIP: "203.0.113.10", relayPort: 49180 }); assert(released); if (failure) throw failure;
  } finally { udp.close(); await new Promise((r) => server.close(r)); }
});
