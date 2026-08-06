"use strict";
const fs = require("fs");
const zlib = require("zlib");

const SRC = "D:\\github repo\\ArcadeOnline\\games\\46923\\game.swf";
const BAK = "D:\\github repo\\ArcadeOnline\\games\\46923\\game.orig.swf";
const TARGET_TAG = 12569;

if (!fs.existsSync(BAK)) {
  fs.copyFileSync(SRC, BAK);
}
const src = fs.existsSync(BAK) ? BAK : SRC;
const raw = fs.readFileSync(src);
const body = zlib.inflateSync(raw.subarray(8));

let bitPos = 0;
function readBits(n) {
  let v = 0;
  for (let i = 0; i < n; i++) {
    const byteIdx = Math.floor(bitPos / 8);
    const bitIdx = 7 - (bitPos % 8);
    v = (v << 1) | ((body[byteIdx] >> bitIdx) & 1);
    bitPos++;
  }
  return v;
}
const nbits = readBits(5);
readBits(nbits * 4);
bitPos = Math.ceil(bitPos / 8) * 8;
let pos = bitPos + 4;

const tags = [];
while (pos < body.length - 2) {
  const head = body[pos] | (body[pos + 1] << 8);
  const code = head >> 6;
  let len = head & 0x3f;
  let p = pos + 2;
  let lenField = 2;
  if (len === 0x3f) {
    len = body[p] | (body[p + 1] << 8) | (body[p + 2] << 8) | (body[p + 3] << 8);
    p += 4;
    lenField = 6;
  }
  tags.push({ idx: tags.length + 1, code, len, pos, payloadPos: p, lenField, tagEnd: p + len });
  pos = p + len;
}

const t = tags.find((x) => x.idx === TARGET_TAG);
if (!t || t.code !== 12) {
  console.error("target tag not found / not DoAction");
  process.exit(1);
}
console.log(`tag ${t.idx}: code=${t.code} len=${t.len} payload@0x${t.payloadPos.toString(16)}`);

// 新 payload: gotoAndPlay("preloader") = 0x88, len(2B), "preloader\0" + End(0x00)
const label = "preloader";
const gotoLabel = Buffer.from([0x88, label.length + 1, 0x00, ...Buffer.from(label, "utf8"), 0x00]);
const newPayload = Buffer.concat([gotoLabel, Buffer.from([0x00])]); // + ActionEnd
console.log("new payload: " + newPayload.toString("hex"));

// 新 tag 头: code=12 -> (12<<6)|0x3f = 0x33F = bytes [0x3F, 0x33], 扩展长度 4 字节 LE
const newLen = newPayload.length;
const head = Buffer.from([0x3f, 0x33, newLen & 0xff, (newLen >> 8) & 0xff, (newLen >> 16) & 0xff, (newLen >> 24) & 0xff]);
const newTag = Buffer.concat([head, newPayload]);

const out = Buffer.concat([
  body.subarray(0, t.pos),
  newTag,
  body.subarray(t.tagEnd)
]);

// 重建 CWS
const compressed = zlib.deflateSync(out);
const cws = Buffer.concat([
  Buffer.from([0x43, 0x57, 0x53]), // CWS
  raw.subarray(3, 8),               // version + (length 占位)
  compressed
]);
cws.writeUInt32LE(8 + compressed.length, 4);

fs.writeFileSync(SRC, cws);
console.log("patched -> new file size: " + cws.length);
