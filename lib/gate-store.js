import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getAlertSettings } from "./alerts.js";
import { writeAudit } from "./audit.js";
import { get, run } from "./db.js";
import { describeGate } from "./gate-status.js";
import { getAiSettings } from "./vision-settings.js";
import { bakuStamp } from "./time.js";

const memory = globalThis.__smzGate || { seenAt: 0, cameras: new Map(), frames: new Map(), vision: new Map(), locks: new Map(), viewers: new Map(), metrics: {} };
globalThis.__smzGate = memory;
memory.vision ||= new Map();
memory.locks ||= new Map();
memory.viewers ||= new Map();
memory.metrics ||= {};
memory.signals ||= new Map();

export function gateToken() {
  const fromEnv = String(process.env.GATE_TOKEN || "").trim();
  if (fromEnv.length >= 24) return fromEnv;
  try {
    const file = fs.readFileSync(path.join(process.cwd(), "data", "gate.token"), "utf8").trim();
    return file.length >= 24 ? file : "";
  } catch {
    return "";
  }
}

export function gateAuthorized(header) {
  const expected = gateToken();
  const presented = String(header || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || presented.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

function desired() {
  const value = get("SELECT value FROM settings WHERE key = ?", ["gate_desired"])?.value;
  return value === "stopped" ? "stopped" : "running";
}

function alertPayload() {
  const settings = getAlertSettings();
  return { enabled: settings.enabled, volume: settings.volume, tones: settings.tones, events: settings.events };
}

export function setGateDesired(value, meta) {
  const next = value === "stopped" ? "stopped" : "running";
  const now = bakuStamp().iso;
  run(
    "INSERT INTO settings (key, value, updated_at) VALUES ('gate_desired', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [next, now],
  );
  writeAudit({
    userId: meta?.actor?.id,
    username: meta?.actor?.username,
    action: "gate.control",
    entity: "settings",
    details: { desired: next },
    ip: meta?.ip,
  });
  return { ok: true, desired: next };
}

export function noteHeartbeat({ cameras = [], stats = null } = {}, now = Date.now()) {
  memory.seenAt = now;
  if (stats && typeof stats === "object") memory.metrics = { ...memory.metrics, ...stats, at: now };
  for (const camera of cameras) {
    if (!camera?.id) continue;
    if (!memory.cameras.has(camera.id)) memory.cameras.set(camera.id, { id: camera.id, ai: "unavailable" });
  }
  const ai = getAiSettings();
  return { ok: true, desired: desired(), alerts: alertPayload(), viewFps: ai.viewFps, ai };
}

export function noteFrame(cameraId, bytes, facts = {}, now = Date.now()) {
  const id = String(cameraId || "");
  if (!id || !Buffer.isBuffer(bytes) || bytes.length < 32 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { ok: false, error: "frame_required" };
  const current = memory.cameras.get(id) || { id, frames: 0, fpsStamp: now, fps: 0 };
  const windowed = now - (current.fpsStamp || now) >= 1000;
  const next = {
    ...current,
    id,
    width: Number(facts.width) || current.width || 0,
    height: Number(facts.height) || current.height || 0,
    ai: current.ai === "ready" ? "ready" : "unavailable",
    seq: (current.seq || 0) + 1,
    capturedAt: Number(facts.capturedAt) || now,
    encodeFps: Number(facts.encodeFps) || current.encodeFps || 0,
    dropped: Number(facts.dropped) || current.dropped || 0,
    lastFrameAt: now,
    frames: windowed ? 1 : (current.frames || 0) + 1,
    fps: windowed ? current.frames || 1 : current.fps || 0,
    fpsStamp: windowed ? now : current.fpsStamp || now,
  };
  memory.cameras.set(id, next);
  memory.frames.set(id, bytes);
  memory.seenAt = now;
  return { ok: true, desired: desired(), sound: null };
}

export function latestFrame(cameraId) {
  const bytes = memory.frames.get(String(cameraId || ""));
  const camera = memory.cameras.get(String(cameraId || ""));
  if (!bytes || !camera) return null;
  return { bytes, camera };
}

export function noteViewer(cameraId, viewerId, now = Date.now()) {
  const id = String(cameraId || "");
  const viewer = String(viewerId || "");
  if (!id || !viewer) return;
  const recent = memory.viewers.get(id) instanceof Map ? memory.viewers.get(id) : new Map();
  recent.set(viewer, now);
  for (const [key, at] of recent) if (now - at > 2000) recent.delete(key);
  memory.viewers.set(id, recent);
  memory.metrics = { ...memory.metrics, subscribers: recent.size };
}

export function claimVision(cameraId, tabId, now = Date.now()) {
  const id = String(cameraId || "");
  const tab = String(tabId || "");
  if (!id || !tab) return false;
  const lock = memory.locks.get(id);
  if (lock && lock.tabId !== tab && now - lock.at < 1200) return false;
  memory.locks.set(id, { tabId: tab, at: now });
  return true;
}

function cleanPoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

export function noteVision(cameraId, facts = {}, now = Date.now()) {
  const id = String(cameraId || "");
  if (!id) return null;
  const camera = memory.cameras.get(id) || { id };
  const faces = (Array.isArray(facts.faces) ? facts.faces : []).slice(0, 4).map((face) => ({
    box: cleanPoint(face.box) ? {
      x: cleanPoint(face.box).x,
      y: cleanPoint(face.box).y,
      w: Math.min(1, Math.max(0, Number(face.box.w) || 0)),
      h: Math.min(1, Math.max(0, Number(face.box.h) || 0)),
    } : null,
    trackId: String(face.trackId || "").slice(0, 40),
    name: String(face.name || "").slice(0, 80),
    outcome: String(face.outcome || ""),
    score: Number.isFinite(Number(face.score)) ? Number(face.score) : null,
    enrolled: face.enrolled === true,
  }));
  const hands = (Array.isArray(facts.hands) ? facts.hands : []).slice(0, 2).map((hand) => ({
    landmarks: (Array.isArray(hand.landmarks) ? hand.landmarks : []).slice(0, 21).map(cleanPoint).filter(Boolean),
    label: String(hand.label || hand.name || ""),
    score: Number.isFinite(Number(hand.score)) ? Number(hand.score) : 0,
  })).filter((hand) => hand.landmarks.length >= 21);
  const ready = facts.models?.face === "ready" || facts.models?.hands === "ready";
  memory.cameras.set(id, { ...camera, id, ai: ready ? "ready" : camera.ai || "unavailable" });
  const snapshot = {
    cameraId: id,
    at: now,
    capturedAt: Number(facts.capturedAt) || camera.capturedAt || now,
    width: Number(facts.width) || camera.width || 0,
    height: Number(facts.height) || camera.height || 0,
    faces,
    hands,
    gesture: {
      label: String(facts.gesture?.label || "none"),
      confidence: Number(facts.gesture?.confidence) || 0,
      source: String(facts.gesture?.source || "none"),
      hands: Number(facts.gesture?.hands) || hands.length,
      assist: facts.gesture?.assist === true,
      reaction: String(facts.gesture?.reaction || ""),
    },
    people: facts.people && Number.isInteger(facts.people.count) ? { count: facts.people.count, approximate: facts.people.approximate === true } : null,
    models: {
      face: String(facts.models?.face || "off"),
      hands: String(facts.models?.hands || "off"),
      people: String(facts.models?.people || "off"),
      faceError: String(facts.models?.faceError || ""),
      handError: String(facts.models?.handError || ""),
    },
    timing: {
      faceMs: Number(facts.timing?.faceMs) || 0,
      handMs: Number(facts.timing?.handMs) || 0,
      totalMs: Number(facts.timing?.totalMs) || 0,
    },
  };
  const previous = memory.signals?.get(id);
  let signal = previous && now - previous.at < 5000 ? previous : null;
  if (facts.alert?.id && facts.alert.sound) signal = { ...facts.alert, at: now };
  if (!memory.signals) memory.signals = new Map();
  if (signal) memory.signals.set(id, signal);
  else memory.signals.delete(id);
  if (signal) {
    const alert = { ...signal };
    delete alert.at;
    snapshot.alert = alert;
  } else snapshot.alert = null;
  memory.vision.set(id, snapshot);
  return snapshot;
}

export function latestVision(cameraId) {
  return memory.vision.get(String(cameraId || "")) || null;
}

export function gateSnapshot(now = Date.now()) {
  const described = describeGate({
    seenAt: memory.seenAt,
    desired: desired(),
    cameras: [...memory.cameras.values()],
  }, now);
  return { ...described, metrics: memory.metrics || {}, ai: getAiSettings() };
}
