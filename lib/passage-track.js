import { noteSignal } from "./alerts.js";
import { recognizeVector } from "./recognition.js";
import { getSettings } from "./settings.js";
import { stepVisit } from "./visit-state.js";

const tracks = globalThis.__smzPassageTracks || new Map();
globalThis.__smzPassageTracks = tracks;
const unknownTracks = globalThis.__smzUnknownTracks || new Map();
globalThis.__smzUnknownTracks = unknownTracks;

// Карточка и запись создаются один раз на визит и только после двух согласованных совпадений.
export function observePassage(cameraId, face, now = Date.now()) {
  const cameraKey = String(cameraId || "");
  const key = `${cameraKey}:${face?.employeeId || ""}`;
  const stepped = stepVisit(tracks.get(key), face, now);
  tracks.set(key, stepped.track);
  if (stepped.action !== "offer") return { waiting: true, action: stepped.action };
  const settings = getSettings();
  if (!settings.autoAttendance || settings.recognitionMode === "diagnostic") {
    return { waiting: true, action: "paused" };
  }
  const result = recognizeVector(null, {
    cameraId: cameraKey,
    employeeId: face.employeeId,
    outcome: "matched",
    score: face.score,
    faceCount: 1,
    quality: "good",
    motion: 0.05,
    settled: true,
    automatic: true,
    reentry: stepped.reentry === true,
    seenAt: Number(face.seenAt) || 0,
  });
  if (!result?.ok || (!result.saved && !result.already && !result.duplicate)) {
    tracks.set(key, { ...stepped.track, offered: false, phase: "tracking" });
  }
  return result;
}

// Одно событие на непрерывное появление. Фото и шаблон неизвестного не сохраняются.
export function observeUnknown(cameraId, trackId, direction = "entrance", now = Date.now()) {
  const key = `${cameraId}:${String(trackId || "").slice(0, 40)}`;
  if (!trackId) return null;
  const previous = unknownTracks.get(key);
  unknownTracks.set(key, now);
  for (const [id, at] of unknownTracks) if (now - at > 4000) unknownTracks.delete(id);
  if (previous && now - previous < 4000) return null;
  return noteSignal(cameraId, "unknown", direction, key, now);
}
