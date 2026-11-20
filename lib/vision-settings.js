import { writeAudit } from "./audit.js";
import { get, run } from "./db.js";
import { bakuStamp } from "./time.js";

const TONES = new Set(["soft", "security", "digital", "double", "chime", "silent"]);
const LEVELS = new Set(["low", "medium", "high"]);
const HOLDS = new Set([1500, 1800, 2000, 2500, 3000]);

function setting(key, fallback) {
  return get("SELECT value FROM settings WHERE key = ?", [key])?.value ?? fallback;
}

function save(key, value, now) {
  run(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [key, value, now],
  );
}

export function getVisionSettings() {
  const volume = Number(setting("vision_volume", "40"));
  const cooldown = Number(setting("vision_cooldown", "8"));
  const hold = Number(setting("vision_assist_ms", "1800"));
  const tone = setting("vision_tone", "soft");
  const sensitivity = setting("vision_sensitivity", "medium");
  return {
    sound: setting("vision_sound", "0") === "1",
    tone: TONES.has(tone) ? tone : "soft",
    volume: Number.isInteger(volume) ? Math.min(100, Math.max(0, volume)) : 40,
    cooldownSeconds: Number.isInteger(cooldown) ? Math.min(30, Math.max(3, cooldown)) : 8,
    sensitivity: LEVELS.has(sensitivity) ? sensitivity : "medium",
    assistHoldMs: HOLDS.has(hold) ? hold : 1800,
  };
}

// Камера отдаёт 30 кадров. На экран уходит меньше: так браузер успевает показать картинку без очереди.
const PROFILES = {
  economy: { viewFps: 15, faceEdge: 640, analysisFps: 4 },
  balanced: { viewFps: 15, faceEdge: 640, analysisFps: 4 },
  quality: { viewFps: 15, faceEdge: 640, analysisFps: 5 },
};
const MODES = new Set(Object.keys(PROFILES));

export function getAiSettings() {
  const vision = getVisionSettings();
  const performance = setting("ai_performance", "balanced");
  const mode = MODES.has(performance) ? performance : "balanced";
  const profile = PROFILES[mode];
  const requested = Number(setting("ai_fps", ""));
  return {
    ...vision,
    face: setting("ai_face", "1") === "1",
    // Руки, жесты и подсчёт людей в рабочем приложении не включаются, даже если старая настройка осталась.
    hands: false,
    gestures: false,
    people: false,
    assist: false,
    lab: false,
    analysisFps: Number.isInteger(requested) && requested >= 2 ? Math.min(10, requested) : profile.analysisFps,
    performance: mode,
    viewFps: profile.viewFps,
    faceEdge: profile.faceEdge,
  };
}

export function updateAiSettings(input, meta) {
  const mode = MODES.has(input.performance) ? input.performance : "";
  const fps = Number(input.analysisFps);
  if (!mode || !Number.isInteger(fps) || fps < 2 || fps > 10) return { ok: false, error: "invalid" };
  const now = bakuStamp().iso;
  save("ai_face", input.face ? "1" : "0", now);
  save("ai_hands", "0", now);
  save("ai_gestures", "0", now);
  save("ai_people", "0", now);
  save("ai_assist", "0", now);
  save("ai_lab", "0", now);
  save("ai_fps", String(fps), now);
  save("ai_performance", mode, now);
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "ai.update",
    entity: "settings",
    details: { face: Boolean(input.face), hands: false, gestures: false, people: false, assist: false, analysisFps: fps, performance: mode },
    ip: meta.ip,
  });
  return { ok: true };
}

export function updatePerformanceProfile(performance, meta) {
  if (!MODES.has(performance)) return { ok: false, error: "invalid" };
  const now = bakuStamp().iso;
  save("ai_performance", performance, now);
  save("ai_fps", "", now);
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "ai.update",
    entity: "settings",
    details: { performance },
    ip: meta.ip,
  });
  return { ok: true, performance };
}

export function updateVisionSettings(input, meta) {
  const volume = Number(input.volume);
  const cooldown = Number(input.cooldownSeconds);
  const hold = Number(input.assistHoldMs);
  if (!Number.isInteger(volume) || volume < 0 || volume > 100) return { ok: false, error: "invalid" };
  if (!Number.isInteger(cooldown) || cooldown < 3 || cooldown > 30) return { ok: false, error: "invalid" };
  if (!HOLDS.has(hold) || !TONES.has(input.tone) || !LEVELS.has(input.sensitivity)) return { ok: false, error: "invalid" };
  const now = bakuStamp().iso;
  save("vision_sound", input.sound ? "1" : "0", now);
  save("vision_tone", input.tone, now);
  save("vision_volume", String(volume), now);
  save("vision_cooldown", String(cooldown), now);
  save("vision_sensitivity", input.sensitivity, now);
  save("vision_assist_ms", String(hold), now);
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "vision.update",
    entity: "settings",
    details: { sound: Boolean(input.sound), tone: input.tone, volume, cooldownSeconds: cooldown, sensitivity: input.sensitivity, assistHoldMs: hold },
    ip: meta.ip,
  });
  return { ok: true };
}
