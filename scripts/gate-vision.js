import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const profile = path.join(os.tmpdir(), "smz-gate-vision-profile");
const pidFile = path.join(root, "data", "gate-vision.pid");
const port = 9333;

function token() {
  if (String(process.env.GATE_TOKEN || "").trim().length >= 24) return process.env.GATE_TOKEN.trim();
  return fs.readFileSync(path.join(root, "data", "gate.token"), "utf8").trim();
}

function chromePath() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  return candidates.find((item) => fs.existsSync(item)) || "";
}

function alreadyRunning() {
  try {
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function send(socket, method, params, sessionId) {
  const id = send.next = (send.next || 0) + 1;
  const payload = JSON.stringify({ id, method, params, sessionId });
  const answer = new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const body = JSON.parse(event.data);
      if (body.id !== id) return;
      socket.removeEventListener("message", onMessage);
      if (body.error) reject(new Error(body.error.message || method));
      else resolve(body.result || {});
    };
    socket.addEventListener("message", onMessage);
  });
  socket.send(payload);
  return answer;
}

async function main() {
  if (alreadyRunning()) return;
  const binary = chromePath();
  if (!binary) throw new Error("chrome_missing");
  const secret = token();
  if (secret.length < 24) throw new Error("gate_token_missing");
  fs.mkdirSync(profile, { recursive: true });
  const child = spawn(binary, [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--use-fake-ui-for-media-stream",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });
  fs.writeFileSync(pidFile, String(child.pid));
  const stopChrome = () => { if (!child.killed) child.kill("SIGTERM"); };
  process.on("SIGTERM", stopChrome);
  process.on("SIGINT", stopChrome);
  child.on("exit", () => {
    try { if (fs.readFileSync(pidFile, "utf8").trim() === String(child.pid)) fs.rmSync(pidFile); } catch { /* уже удалён */ }
  });
  let version = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        version = await response.json();
        break;
      }
    } catch { /* браузер ещё поднимается */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!version?.webSocketDebuggerUrl) throw new Error("debugger_unavailable");
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("debugger_unavailable")), { once: true });
  });
  const target = await send(socket, "Target.createTarget", { url: "about:blank" });
  const attached = await send(socket, "Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await send(socket, "Network.enable", {}, sessionId);
  await send(socket, "Network.setCookie", {
    name: "smz_gate",
    value: secret,
    url: "http://127.0.0.1:3000/service/vision",
    httpOnly: true,
    sameSite: "Lax",
  }, sessionId);
  await send(socket, "Page.enable", {}, sessionId);
  await send(socket, "Page.navigate", { url: "http://127.0.0.1:3000/service/vision" }, sessionId);
  socket.close();
  await new Promise((resolve) => child.once("exit", resolve));
}

main().catch((error) => {
  try { fs.rmSync(pidFile); } catch { /* файла может не быть */ }
  console.error(error.message || "gate_vision_failed");
  process.exit(1);
});
