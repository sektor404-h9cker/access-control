// Local gate worker. It owns recognition only when this process is the one
// writing the database. Do not run it beside `next dev`.
// USB capture is not included: Windows can feed JPEG frames from a local
// capture tool. This file was not executed on Windows.

import http from "node:http";
import { recognizeJpeg } from "../lib/recognition.js";
import { modelReady } from "../lib/face-embed.js";

const token = process.env.GATE_TOKEN || "";
const port = Number(process.env.GATE_PORT || 3010);
if (process.env.SMZ_GATE_ALLOW !== "1" || token.length < 24) {
  console.error("Refusing to start. Set SMZ_GATE_ALLOW=1 and GATE_TOKEN of at least 24 characters. Stop the web server first so only one process writes the database.");
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  if (request.socket.remoteAddress !== "127.0.0.1" && request.socket.remoteAddress !== "::ffff:127.0.0.1" && request.socket.remoteAddress !== "::1") {
    response.writeHead(403).end("local only");
    return;
  }
  if (request.url === "/health" && request.method === "GET") {
    const memory = process.memoryUsage();
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      ok: true,
      model: modelReady(),
      rssMb: Math.round(memory.rss / 1048576),
      heapMb: Math.round(memory.heapUsed / 1048576),
      cameras: "external-feed",
      testedOn: "not-windows",
    }));
    return;
  }
  if (request.url !== "/frame" || request.method !== "POST" || request.headers["x-smz-token"] !== token) {
    response.writeHead(401).end("unauthorized");
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const result = await recognizeJpeg(bytes, {
    cameraId: String(request.headers["x-camera-id"] || ""),
    faceCount: Number(request.headers["x-face-count"] || 1),
    quality: String(request.headers["x-quality"] || "good"),
    motion: Number(request.headers["x-motion"] || 0),
    meta: { actor: { username: "gate-worker" }, ip: "127.0.0.1" },
  });
  response.writeHead(result.ok ? 200 : 400, { "content-type": "application/json" });
  response.end(JSON.stringify(result));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Gate worker listening on 127.0.0.1:${port}. It does not open a camera by itself.`);
});
