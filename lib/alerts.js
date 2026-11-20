import { randomUUID } from "node:crypto";
import { writeAudit } from "./audit.js";
import { all, get, run } from "./db.js";
import { bakuStamp } from "./time.js";

function setting(key, fallback) {
  return get("SELECT value FROM settings WHERE key = ?", [key])?.value ?? fallback;
}

const TONES = new Set(["soft", "security", "digital", "double", "chime", "silent"]);
const KINDS = ["unknown", "ambiguous", "confirmed", "camera", "matched"];
const DEFAULT_TONE = {
  matched: "soft",
  unknown: "digital",
  ambiguous: "double",
  camera: "security",
  confirmed: "chime",
};
const recentSignals = new Map();

export function getAlertSettings() {
  const volume = Number(setting("alert_volume", "60"));
  const cooldown = Number(setting("alert_cooldown", "15"));
  const tone = setting("alert_tone", "soft");
  const ready = setting("alert_ready", "0") === "1";
  const tones = {};
  for (const kind of KINDS) {
    const saved = setting(`alert_tone_${kind}`, kind === "matched" ? tone : DEFAULT_TONE[kind]);
    tones[kind] = TONES.has(saved) ? saved : DEFAULT_TONE[kind];
  }
  return {
    enabled: (ready ? setting("alert_enabled", "1") : "1") === "1",
    tone: TONES.has(tone) ? tone : "soft",
    tones,
    voice: setting("alert_voice", "0") === "1",
    speakName: setting("alert_speak_name", "0") === "1",
    volume: Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : 60,
    deviceId: setting("alert_device", ""),
    cooldownSeconds: Number.isFinite(cooldown) ? Math.min(60, Math.max(8, Math.round(cooldown))) : 15,
    events: {
      unknown: setting("alert_unknown", "1") === "1",
      ambiguous: setting("alert_ambiguous", "1") === "1",
      confirmed: (ready ? setting("alert_confirmed", "1") : "1") === "1",
      camera: setting("alert_camera", "1") === "1",
      matched: setting("alert_matched", "1") === "1",
    },
    cameras: {
      entrance: setting("alert_cam_entrance", "1") === "1",
      exit: setting("alert_cam_exit", "1") === "1",
    },
  };
}

export function updateAlertSettings(input, meta) {
  const volume = Number(input.volume);
  const cooldown = Number(input.cooldownSeconds);
  if (!Number.isInteger(volume) || volume < 0 || volume > 100) return { ok: false, error: "invalid" };
  if (!Number.isInteger(cooldown) || cooldown < 8 || cooldown > 60) return { ok: false, error: "invalid" };
  const deviceId = String(input.deviceId || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 256);
  if (!TONES.has(input.tone)) return { ok: false, error: "invalid" };
  const tones = {};
  for (const kind of KINDS) {
    const chosen = input.tones?.[kind] || (kind === "matched" ? input.tone : DEFAULT_TONE[kind]);
    if (!TONES.has(chosen)) return { ok: false, error: "invalid" };
    tones[kind] = chosen;
  }
  const enabled = input.enabled ? "1" : "0";
  const now = bakuStamp().iso;
  const save = (key, value) => run(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [key, value, now],
  );
  save("alert_ready", "1");
  save("alert_enabled", enabled);
  save("alert_tone", tones.matched);
  save("alert_volume", String(volume));
  save("alert_device", deviceId);
  save("alert_cooldown", String(cooldown));
  save("alert_voice", input.voice ? "1" : "0");
  save("alert_speak_name", input.speakName ? "1" : "0");
  for (const kind of KINDS) {
    save(`alert_${kind}`, input.events?.[kind] ? "1" : "0");
    save(`alert_tone_${kind}`, tones[kind]);
  }
  save("alert_cam_entrance", input.cameras?.entrance ? "1" : "0");
  save("alert_cam_exit", input.cameras?.exit ? "1" : "0");
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "alert.update",
    entity: "settings",
    details: { enabled: enabled === "1", tone: input.tone, volume, cooldownSeconds: cooldown, deviceSelected: Boolean(deviceId) },
    ip: meta.ip,
  });
  return { ok: true };
}

export function noteSignal(cameraId, kind, direction = "entrance", subject = "", now = Date.now()) {
  if (!KINDS.includes(kind)) return { visual: false, sound: false, suppressed: true };
  const settings = getAlertSettings();
  const who = String(subject || "").slice(0, 80);
  const key = `${cameraId}:${kind}:${who}`;
  if (now - (recentSignals.get(key) || 0) < settings.cooldownSeconds * 1000) {
    return { visual: false, sound: false, suppressed: true };
  }
  recentSignals.set(key, now);
  const id = randomUUID();
  run(
    "INSERT INTO alert_events (id, camera_id, kind, created_at) VALUES (?, ?, ?, ?)",
    [id, cameraId, kind, bakuStamp().iso],
  );
  const cameraOn = direction === "exit" ? settings.cameras.exit : settings.cameras.entrance;
  const tone = settings.tones[kind] || settings.tone;
  const sound = settings.enabled && tone !== "silent" && settings.events[kind] && cameraOn;
  return {
    id,
    kind,
    subject: who,
    visual: true,
    sound,
    tone,
    voice: settings.voice,
    speakName: settings.speakName && kind === "matched",
    volume: settings.volume,
    deviceId: settings.deviceId,
    suppressed: false,
  };
}

export function noteUnknownFace(cameraId, direction = "entrance") {
  return noteSignal(cameraId, "unknown", direction);
}

export function listAlertEvents(limit = 20) {
  return all(
    `SELECT a.id, a.camera_id, a.kind, a.created_at, c.code AS camera_code
     FROM alert_events a
     LEFT JOIN cameras c ON c.id = a.camera_id
     ORDER BY a.created_at DESC
     LIMIT ?`,
    [Math.min(Math.max(Number(limit) || 20, 1), 50)],
  );
}
