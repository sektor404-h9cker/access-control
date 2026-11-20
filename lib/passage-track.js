import { recognizeVector } from "./recognition.js";
import { stepVisit } from "./visit-state.js";

const tracks = globalThis.__smzPassageTracks || new Map();
globalThis.__smzPassageTracks = tracks;

// Карточка создаётся один раз на визит и только для устойчивого совпадения.
export function observePassage(cameraId, face, now = Date.now()) {
  const key = String(cameraId || "");
  const stepped = stepVisit(tracks.get(key), face, now);
  tracks.set(key, stepped.track);
  if (stepped.action !== "offer") return { waiting: true, action: stepped.action };
  const result = recognizeVector(null, {
    cameraId: key,
    employeeId: face.employeeId,
    outcome: "matched",
    score: face.score,
    faceCount: 1,
    quality: "good",
    motion: 0.05,
    settled: true,
    reentry: stepped.reentry === true,
  });
  if (!result?.ok) tracks.set(key, { ...stepped.track, offered: false, phase: "tracking" });
  return result;
}
