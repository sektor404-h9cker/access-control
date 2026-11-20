import { all } from "./db.js";
import { listCameras } from "./settings.js";

export function isStreamCamera(camera) {
  return Boolean(camera.enabled && camera.sourceKind === "usb" && camera.deviceId);
}

export function selectLiveCameras(cameras) {
  return cameras;
}

function latestRecognition(cameraId) {
  return all(
    `SELECT outcome, status, note, created_at
     FROM recognition_events
     WHERE camera_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [cameraId],
  )[0] || null;
}

function latestConfirmed(cameraId) {
  return all(
    `SELECT p.at, p.direction, e.last_name, e.first_name, e.patronymic
     FROM passage_events p
     JOIN employees e ON e.id = p.employee_id
     WHERE p.camera_id = ? AND p.applied IN ('applied', 'return')
     ORDER BY p.at DESC
     LIMIT 1`,
    [cameraId],
  )[0] || null;
}

export function recentConfirmedPassages(limit = 8) {
  return all(
    `SELECT p.id, p.at, p.direction, p.camera_id, c.code AS camera_code,
            e.last_name, e.first_name, e.patronymic, d.name AS department_name
     FROM passage_events p
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN cameras c ON c.id = p.camera_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE p.applied IN ('applied', 'return')
     ORDER BY p.at DESC
     LIMIT ?`,
    [limit],
  );
}

export function aiStatusKey(camera, event) {
  if (!camera.enabled) return "cameraOff";
  if (camera.sourceKind === "ip") return "ipNoStream";
  if (!event) return "journalEmpty";
  if (event.status === "confirmed" || event.status === "applied") return "phaseConfirmed";
  if (event.outcome === "unknown") return "phaseUnknown";
  if (event.outcome === "ambiguous" || event.status === "pending") return "phaseReview";
  if (event.outcome === "matched") return "phaseReview";
  return "phaseDetect";
}

export function liveBoard() {
  const cameras = selectLiveCameras(listCameras()).map((camera) => {
    const event = latestRecognition(camera.id);
    const confirmed = latestConfirmed(camera.id);
    return {
      ...camera,
      aiKey: aiStatusKey(camera, event),
      confirmedAt: confirmed?.at || "",
      confirmedName: confirmed ? [confirmed.last_name, confirmed.first_name, confirmed.patronymic].filter(Boolean).join(" ") : "",
      confirmedDirection: confirmed?.direction || "",
    };
  });
  return { cameras, passages: recentConfirmedPassages() };
}
