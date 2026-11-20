import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ffmpegArgs, splitJpeg } from "../lib/gate-capture.js";
import { requestGateTone } from "../lib/gate-tone.js";

const root = process.cwd();
const logFile = path.join(root, "data", "gate-agent.log");
const children = new Set();
let stopped = false;
let desired = "running";
let alerts = { enabled: false, volume: 0 };
let lastSoundAt = 0;
let ffmpegPid = 0;
const liveStats = { captureFps: 0, encodeFps: 0, postFps: 0, dropped: 0, cpu: 0, ffmpegCpu: 0 };

function log(line) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
}

function token() {
  if (String(process.env.GATE_TOKEN || "").trim().length >= 24) return process.env.GATE_TOKEN.trim();
  return fs.readFileSync(path.join(root, "data", "gate.token"), "utf8").trim();
}

function loadConfig() {
  const file = process.env.GATE_CONFIG || path.join(root, "data", "gate-agent.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const cameras = (Array.isArray(raw.cameras) ? raw.cameras : []).slice(0, 2).map((camera) => ({
    id: String(camera.id || ""),
    device: String(camera.device ?? "0"),
    width: Number(camera.width) || 1280,
    height: Number(camera.height) || 720,
    fps: Number(camera.fps) || 20,
  })).filter((camera) => camera.id);
  const seen = new Set();
  for (const camera of cameras) {
    if (seen.has(camera.device)) throw new Error(`camera ${camera.id} uses the same device as another post`);
    seen.add(camera.device);
  }
  return { server: String(raw.server || "http://127.0.0.1:3000").replace(/\/$/, ""), cameras };
}

async function send(server, secret, pathName, body, headers = {}) {
  const response = await fetch(`${server}${pathName}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, ...headers },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `http_${response.status}`);
  if (payload.alerts) alerts = payload.alerts;
  return payload;
}

function playOnce(sound) {
  if (!sound || !alerts.enabled) return;
  const now = Date.now();
  if (now - lastSoundAt < 1500) return;
  lastSoundAt = now;
  requestGateTone(sound, alerts.volume);
}

function cpuSince(mark) {
  const used = process.cpuUsage(mark.sample);
  const elapsed = Math.max(1, Date.now() - mark.at);
  mark.sample = process.cpuUsage();
  mark.at = Date.now();
  return Math.round((used.user + used.system) / 1000 / elapsed * 100);
}

function processCpu(pid) {
  return new Promise((resolve) => {
    execFile("ps", ["-p", String(pid), "-o", "%cpu="], { timeout: 1000 }, (error, stdout) => {
      if (error) resolve(0);
      else resolve(Math.round(Number(stdout) || 0));
    });
  });
}

async function heartbeat(server, secret, cameras, stats) {
  const payload = await send(server, secret, "/api/gate/heartbeat", JSON.stringify({
    cameras: cameras.map((camera) => ({ id: camera.id })),
    stats,
  }), { "content-type": "application/json" });
  return payload;
}

function capture(camera, server, secret) {
      let child = null;
      let rest = Buffer.alloc(0);
      let attempts = 0;
      let startedAttempt = 0;
  const stop = () => {
    if (child && !child.killed) child.kill("SIGTERM");
  };
  const run = async () => {
    while (!stopped) {
      if (desired === "stopped") {
        if (child) log(`${camera.id} capture released because the gate is stopped`);
        stop();
        child = null;
        await delay(1000);
        continue;
      }
      attempts += 1;
      startedAttempt = attempts;
      if (attempts > 5) {
        log(`${camera.id} paused after 5 capture failures`);
        await delay(15000);
        attempts = 0;
        continue;
      }
      child = spawn("ffmpeg", ffmpegArgs(camera), { stdio: ["ignore", "pipe", "pipe"] });
      ffmpegPid = child.pid;
      children.add(child);
      log(`${camera.id} capture started on device ${camera.device}`);
      child.stderr.on("data", (chunk) => {
        const text = String(chunk).trim();
        if (!text) return;
        log(`${camera.id} ffmpeg: ${text.slice(0, 300)}`);
        if (/lock|busy|in use|Input\/output/i.test(text)) log(`${camera.id} camera is busy, retry ${startedAttempt}/5`);
      });
      let latest = null;
      let sending = false;
      let encoded = 0;
      let posted = 0;
      let encodeFps = 0;
      let postFps = 0;
      let stamp = Date.now();
      const publish = () => {
        const now = Date.now();
        if (now - stamp >= 1000) {
          encodeFps = encoded;
          postFps = posted;
          liveStats.encodeFps = encodeFps;
          liveStats.postFps = postFps;
          liveStats.dropped = Math.max(0, encoded - posted);
          liveStats.captureFps = encoded > 0 ? 30 : 0;
          encoded = 0;
          posted = 0;
          stamp = now;
        }
      };
      const pump = () => {
        if (sending || !latest || stopped) return;
        const frame = latest;
        latest = null;
        sending = true;
        send(server, secret, "/api/gate/frame", frame.bytes, {
          "content-type": "image/jpeg",
          "x-camera-id": camera.id,
          "x-width": String(camera.width),
          "x-height": String(camera.height),
          "x-captured-at": String(frame.at),
          "x-encode-fps": String(encodeFps),
          "x-dropped": String(liveStats.dropped),
        }).then((payload) => {
          attempts = 0;
          posted += 1;
          playOnce(payload.sound);
        }).catch((error) => {
          log(`${camera.id} frame failed: ${error.message}`);
        }).finally(() => {
          sending = false;
          publish();
          pump();
        });
      };
      child.stdout.on("data", (chunk) => {
        const split = splitJpeg(Buffer.concat([rest, chunk]));
        rest = Buffer.from(split.rest);
        for (const frame of split.frames) {
          encoded += 1;
          latest = { bytes: Buffer.from(frame), at: Date.now() };
        }
        publish();
        pump();
      });
      const code = await new Promise((resolve) => {
        child.once("error", (error) => {
          log(`${camera.id} ffmpeg error: ${error.message}`);
          resolve(-1);
        });
        child.once("exit", (exitCode) => resolve(exitCode));
      });
      children.delete(child);
      if (stopped) break;
      log(`${camera.id} capture exited ${code}, attempt ${startedAttempt}/5`);
      await delay(Math.min(8000, 1000 * attempts));
    }
    stop();
  };
  return { run, stop };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shutdown() {
  if (stopped) return;
  stopped = true;
  for (const child of children) child.kill("SIGTERM");
  log("cameras released");
  setTimeout(() => process.exit(0), 300);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

let secret = "";
let config = { server: "", cameras: [] };
try {
  secret = token();
  config = loadConfig();
} catch (error) {
  log(error.message);
  process.exit(1);
}
if (!config.cameras.length) {
  log("no cameras configured");
  process.exit(1);
}
log(`agent started for ${config.cameras.map((camera) => camera.id).join(", ")}`);
const cpuMark = { sample: process.cpuUsage(), at: Date.now() };
setInterval(() => {
  liveStats.cpu = cpuSince(cpuMark);
  const cpu = ffmpegPid ? processCpu(ffmpegPid) : Promise.resolve(0);
  cpu.then((value) => {
    liveStats.ffmpegCpu = value;
    return heartbeat(config.server, secret, config.cameras, liveStats);
  }).then((payload) => {
    desired = payload.desired === "stopped" ? "stopped" : "running";
    const viewFps = Number(payload.viewFps) || 0;
    const changed = viewFps && config.cameras.some((camera) => camera.fps !== viewFps);
    if (changed) {
      for (const camera of config.cameras) camera.fps = viewFps;
      for (const child of children) child.kill("SIGTERM");
    }
    if (desired === "stopped") {
      for (const child of children) child.kill("SIGTERM");
    }
  }).catch((error) => log(`heartbeat failed: ${error.message}`));
}, 2000);
for (const camera of config.cameras) capture(camera, config.server, secret).run();
