import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";

const directory = path.join(process.cwd(), "data", "certs");
const keyFile = path.join(directory, "lan.key");
const certFile = path.join(directory, "lan.crt");
fs.mkdirSync(directory, { recursive: true });
if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) {
  const created = spawnSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-keyout", keyFile, "-out", certFile,
    "-days", "825", "-nodes", "-subj", "/CN=smz-access-control",
  ], { stdio: "inherit" });
  if (created.status !== 0) process.exit(created.status || 1);
  fs.chmodSync(keyFile, 0o600);
}
const host = process.env.SMZ_LAN === "1" ? "0.0.0.0" : "127.0.0.1";
const server = https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, (request, response) => {
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: Number(process.env.PORT || 3000),
    path: request.url,
    method: request.method,
    headers: { ...request.headers, host: "127.0.0.1:3000" },
  }, (incoming) => {
    response.writeHead(incoming.statusCode || 502, incoming.headers);
    incoming.pipe(response);
  });
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  request.pipe(upstream);
});
server.listen(3443, host, () => {
  console.log(`SMZ HTTPS proxy on https://${host}:3443 -> http://127.0.0.1:${process.env.PORT || 3000}`);
});
