import os from "node:os";

const addresses = [];
for (const entries of Object.values(os.networkInterfaces())) {
  for (const entry of entries || []) {
    if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
  }
}
console.log(addresses.length ? addresses.map((address) => `https://${address}:3443`).join("\n") : "https://127.0.0.1:3443");
