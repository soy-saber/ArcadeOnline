"use strict";
// RFC 5389/5766 UDP allocation probe. Checks authentication and the advertised
// relay address; two-device RTC testing is still needed to verify relayed data.
const dgram = require("node:dgram");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
function attribute(type, value) {
  const output = Buffer.alloc(4 + Math.ceil(value.length / 4) * 4);
  output.writeUInt16BE(type); output.writeUInt16BE(value.length, 2); value.copy(output, 4);
  return output;
}
function message(type, id, attributes, key) {
  const body = Buffer.concat(attributes), header = Buffer.alloc(20);
  header.writeUInt16BE(type); header.writeUInt16BE(body.length + (key ? 24 : 0), 2); header.writeUInt32BE(0x2112a442, 4); id.copy(header, 8);
  const raw = Buffer.concat([header, body]);
  return key ? Buffer.concat([raw, attribute(8, crypto.createHmac("sha1", key).update(raw).digest())]) : raw;
}
function attributes(packet) {
  assert(packet.length >= 20 && packet.readUInt32BE(4) === 0x2112a442, "Invalid STUN response");
  const result = new Map();
  const end = 20 + packet.readUInt16BE(2); assert(end <= packet.length, "Truncated STUN response");
  for (let at = 20; at < end;) {
    assert(at + 4 <= end); const length = packet.readUInt16BE(at + 2); assert(at + 4 + length <= end);
    result.set(packet.readUInt16BE(at), packet.subarray(at + 4, at + 4 + length)); at += 4 + Math.ceil(length / 4) * 4;
  }
  return result;
}
async function probe(base) {
  const config = await (await fetch(new URL("/rtc-config", base), { signal: AbortSignal.timeout(10000) })).json();
  const server = config.iceServers.find((s) => s.username && s.credential);
  assert(server, "TURN credentials missing");
  const url = [].concat(server.urls).find((url) => /^turn:[^:]+:\d+\?transport=udp$/.test(url));
  assert(url, "An IPv4/hostname TURN UDP URL is required");
  const match = /^turn:([^:]+):(\d+)/.exec(url), host = match[1], port = Number(match[2]);
  const socket = dgram.createSocket("udp4");
  let fatal = null;
  socket.on("error", (error) => { fatal = error; });
  const request = (packet) => new Promise((resolve, reject) => {
    let attempts = 0;
    const receive = (response) => {
      if (response.length >= 20 && response.subarray(8, 20).equals(packet.subarray(8, 20))) { clearInterval(timer); socket.off("message", receive); resolve(response); }
    };
    const send = () => {
      if (fatal || attempts++ >= 4) { clearInterval(timer); socket.off("message", receive); reject(fatal || new Error("TURN UDP timed out: check listener, security group and firewall")); return; }
      socket.send(packet, port, host);
    };
    const timer = setInterval(send, 1200); socket.on("message", receive); send();
  });
  try {
    const transport = attribute(0x19, Buffer.from([17, 0, 0, 0]));
    const challenge = await request(message(3, crypto.randomBytes(12), [transport]));
    const values = attributes(challenge), realm = values.get(0x14), nonce = values.get(0x15);
    assert.equal(challenge.readUInt16BE(0), 0x113, "Expected TURN authentication challenge");
    assert(realm && nonce, "Missing TURN realm/nonce");
    const key = crypto.createHash("md5").update(`${server.username}:${realm.toString()}:${server.credential}`).digest();
    const auth = [attribute(6, Buffer.from(server.username)), attribute(0x14, realm), attribute(0x15, nonce)];
    const response = await request(message(3, crypto.randomBytes(12), [transport, ...auth], key));
    assert.equal(response.readUInt16BE(0), 0x103, "TURN allocation rejected: check shared secret and server clock");
    const relay = attributes(response).get(0x16);
    assert(relay && relay[1] === 1, "Expected an IPv4 relay address");
    const mask = Buffer.from([0x21, 0x12, 0xa4, 0x42]);
    const relayIP = Array.from(relay.subarray(4, 8), (b, i) => b ^ mask[i]).join(".");
    const relayPort = relay.readUInt16BE(2) ^ 0x2112;
    console.log(`PASS TURN UDP: authenticated allocation at ${relayIP}:${relayPort}. Verify this is the public IP and an open relay port.`);
    // Release the allocation instead of leaving it consuming the quota.
    const released = await request(message(4, crypto.randomBytes(12), [...auth, attribute(0x0d, Buffer.alloc(4))], key));
    assert.equal(released.readUInt16BE(0), 0x104, "Allocation release failed");
    return { relayIP, relayPort };
  } finally { socket.close(); }
}
if (require.main === module) {
  if (!process.argv[2]) { console.error("Usage: node scripts/check-turn.cjs https://PUBLIC_IP_OR_DOMAIN"); process.exitCode = 1; }
  else probe(process.argv[2]).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { probe, message, attributes, attribute };
