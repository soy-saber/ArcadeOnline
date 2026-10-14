"use strict";
const fs = require("node:fs");
const net = require("node:net");
function configure(existing, host) {
  const imported = "import /etc/caddy/arcade-online.caddy";
  let output = existing;
  if (net.isIP(host)) {
    // IP URL clients omit SNI. Behind NAT, the local address has no public cert.
    // Caddy requires this option in its top-level global options block.
    const configured = output.match(/^\s*default_sni\s+(\S+)/m);
    if (configured && configured[1] !== host) throw new Error("Existing default_sni belongs to another site; integrate the IP TLS policy manually.");
    if (!configured) {
      const global = /^(\s*(?:#[^\n]*\n\s*)*)\{/;
      if (global.test(output)) output = output.replace(global, `$1{\n    default_sni ${host}`);
      else output = `{\n    default_sni ${host}\n}\n\n` + output;
    }
  }
  if (!output.split(/\r?\n/).some(line => line.trim() === imported)) output += `\n${imported}\n`;
  return output;
}
if (require.main === module) {
  const file = process.argv[2], host = process.argv[3];
  fs.writeFileSync(file, configure(fs.readFileSync(file, "utf8"), host));
}
module.exports = { configure };
