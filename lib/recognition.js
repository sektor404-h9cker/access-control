import { randomUUID } from "node:crypto";
import { noteSignal } from "./alerts.js";
import { writeAudit } from "./audit.js";
import { all, get, run } from "./db.js";
import { embedJpeg, modelReady } from "./face-embed.js";
import { ACCEPT_COSINE, MODEL_ID, livenessOf, matchReason } from "./face-match.js";
import { activeTemplateCount, galleryReport, matchGallery } from "./face-store.js";
import { can } from "./permissions.js";
import { applyPassage } from "./passages.js";
import { getSettings, listCameras } from "./settings.js";
import { bakuStamp } from "./time.js";

export const DEBOUNCE_MS = 12_000;

export function recognitionStatus() {
  const ready = modelReady();
  return {
    available: ready,
    identifies: ready,
    templatesStored: true,
    model: MODEL_ID,
    acceptCosine: ACCEPT_COSINE,
    mode: getSettings().recognitionMode,
    livenessCertified: false,
    stage: ready ? "match" : "model_missing",
  };
}

export function identify() {
  return { ok: false, error: "frame_required" };
}

function sharedDevice(camera) {
  if (!camera?.deviceId) return false;
  const cameras = listCameras();
  return cameras.filter((item) => item.enabled && item.deviceId && item.deviceId === camera.deviceId).length > 1;
}

function insertEvent(fields) {
  const id = randomUUID();
  const now = bakuStamp().iso;
  run(
    `INSERT INTO recognition_events (
      id, camera_id, employee_id, direction, outcome, score, second_score, latency_ms, liveness, status, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      fields.cameraId || null,
      fields.employeeId || null,
      fields.direction || null,
      fields.outcome,
      fields.score ?? null,
      fields.secondScore ?? null,
      fields.latencyMs ?? null,
      fields.liveness || "unchecked",
      fields.status,
      fields.note || "",
      now,
    ],
  );
  return { id, createdAt: now };
}

function recentDuplicate(cameraId, employeeId, outcome, liveness, reentry = false) {
  const row = get(
    `SELECT id, employee_id, outcome, status, liveness, created_at FROM recognition_events
     WHERE camera_id = ? AND outcome = ? AND ifnull(employee_id, '') = ?
     ORDER BY created_at DESC LIMIT 1`,
    [cameraId, outcome, employeeId || ""],
  );
  if (!row || reentry) return null;
  const age = Date.now() - Date.parse(row.created_at);
  const mode = getSettings().recognitionMode;
  // В пилотном режиме неподвижный кадр не закрывает следующий живой проход.
  if (mode === "pilot" && liveness === "motion" && row.liveness === "static") return null;
  // Открытая карточка решения остаётся одной, пока оператор её не закроет.
  if (row.status === "pending" && age <= 60_000) return row;
  const windowMs = mode === "pilot" ? DEBOUNCE_MS : 45_000;
  if (age > windowMs) return null;
  return row;
}

function presentEvent(row) {
  if (!row) return null;
  const employee = row.employee_id
    ? get("SELECT first_name, last_name, patronymic FROM employees WHERE id = ?", [row.employee_id])
    : null;
  const camera = row.camera_id ? get("SELECT code, direction FROM cameras WHERE id = ?", [row.camera_id]) : null;
  return {
    id: row.id,
    at: row.created_at,
    employeeId: row.employee_id || null,
    name: employee ? [employee.last_name, employee.first_name, employee.patronymic].filter(Boolean).join(" ") : "",
    direction: camera?.direction || row.direction || "",
    cameraCode: camera?.code || "",
    outcome: row.outcome,
    status: row.status,
    score: row.score,
    secondScore: row.second_score,
    latencyMs: row.latency_ms,
    liveness: row.liveness,
    note: row.note || "",
  };
}

export async function recognizeJpeg(bytes, context) {
  const started = performance.now();
  if (!bytes?.length) return { ok: false, error: "frame_required" };
  const embedded = await embedJpeg(bytes);
  if (!embedded.ok) return { ok: false, error: embedded.error };
  const matchStarted = performance.now();
  const result = recognizeVector(embedded.vector, {
    ...context,
    latencyMs: Math.round(performance.now() - started),
  });
  const matchMs = Math.max(0, Math.round(performance.now() - matchStarted));
  return {
    ...result,
    acceptCosine: ACCEPT_COSINE,
    stages: {
      prepare: embedded.decodeMs || 0,
      embed: embedded.ms || 0,
      match: matchMs,
      total: Math.max(0, Math.round(performance.now() - started)),
    },
  };
}

export async function identifyProbe(bytes) {
  const enrolled = activeTemplateCount();
  if (!bytes?.length) return { ok: false, error: "frame_required", enrolled: enrolled > 0, recorded: false };
  const embedded = await embedJpeg(bytes);
  if (!embedded.ok) {
    return { ...embedded, enrolled: enrolled > 0, recorded: false, reason: "EMBEDDING_FAILED", embedMs: embedded.ms || 0, matchMs: 0 };
  }
  const report = galleryReport();
  const matchStarted = performance.now();
  const decision = matchGallery(embedded.vector);
  const matchMs = Math.max(0, Math.round(performance.now() - matchStarted));
  const employee = decision.employeeId
    ? get("SELECT first_name, last_name, patronymic FROM employees WHERE id = ?", [decision.employeeId])
    : null;
  return {
    ok: true,
    recorded: false,
    enrolled: enrolled > 0,
    outcome: decision.outcome,
    employeeId: decision.employeeId,
    name: employee ? [employee.last_name, employee.first_name, employee.patronymic].filter(Boolean).join(" ") : "",
    score: decision.score,
    secondScore: decision.secondScore,
    templateCount: report.opened,
    decryptFailed: report.failed,
    reason: matchReason({ embedded: true, templateCount: report.opened, decryptFailed: report.failed, outcome: decision.outcome }),
    ms: embedded.ms || 0,
    embedMs: embedded.ms || 0,
    matchMs,
  };
}

export function recognizeVector(vector, context) {
  const camera = get("SELECT id, code, direction, enabled, source_kind, device_id FROM cameras WHERE id = ?", [context.cameraId]);
  if (!camera) return { ok: false, error: "invalid" };
  if (camera.source_kind === "ip") return { ok: false, error: "ip_stream_unavailable" };
  const direction = camera.direction === "exit" ? "out" : "in";
  const conflict = sharedDevice({ deviceId: camera.device_id });
  const liveness = livenessOf({ motion: context.motion, blink: context.blink });
  const faceCount = Number(context.faceCount ?? 1);
  const quality = context.quality === "good" || context.quality === "ok" ? context.quality : "poor";
  const probe = context.probe === true || getSettings().recognitionMode === "diagnostic";
  if (faceCount !== 1 || quality === "poor") {
    if (probe) {
      return { ok: true, probe: true, recorded: false, outcome: faceCount > 1 ? "many" : faceCount < 1 ? "no_face" : "poor", employeeId: null, name: "", status: "probe" };
    }
    const outcome = faceCount > 1 ? "many" : faceCount < 1 ? "no_face" : "poor";
    const duplicate = recentDuplicate(camera.id, "", outcome, liveness);
    if (duplicate) return { ok: true, duplicate: true, ...presentEvent(duplicate), recorded: false };
    const event = insertEvent({
      cameraId: camera.id,
      direction,
      outcome,
      liveness,
      status: "logged",
      latencyMs: context.latencyMs ?? null,
      note: outcome,
    });
    return { ok: true, recorded: false, duplicate: false, ...presentEvent(get("SELECT * FROM recognition_events WHERE id = ?", [event.id])) };
  }
  let decision;
  if (context.settled && context.employeeId && (context.outcome === "matched" || context.outcome === "ambiguous")) {
    decision = {
      employeeId: context.employeeId,
      outcome: context.outcome,
      score: Number(context.score) || null,
      secondScore: null,
    };
  } else {
    if (!modelReady() || !vector) return { ok: false, error: "model_missing" };
    decision = matchGallery(vector);
  }
  if (probe) {
    const employee = decision.employeeId
      ? get("SELECT first_name, last_name, patronymic FROM employees WHERE id = ?", [decision.employeeId])
      : null;
    return {
      ok: true,
      probe: true,
      recorded: false,
      duplicate: false,
      id: null,
      employeeId: decision.employeeId,
      name: employee ? [employee.last_name, employee.first_name, employee.patronymic].filter(Boolean).join(" ") : "",
      direction,
      cameraCode: camera.code,
      outcome: decision.outcome,
      score: decision.score,
      secondScore: decision.secondScore,
      latencyMs: context.latencyMs ?? null,
      liveness,
      status: "probe",
      note: decision.outcome,
    };
  }
  const duplicate = recentDuplicate(camera.id, decision.employeeId || "", decision.outcome, liveness, context.reentry === true);
  if (duplicate) return { ok: true, duplicate: true, recorded: false, ...presentEvent(duplicate) };
  const mode = getSettings().recognitionMode;
  const enabled = camera.enabled === 1;
  let status = "logged";
  let note = decision.outcome;
  if (conflict) note = "camera_conflict";
  else if (!enabled) note = "camera_disabled";
  else if (decision.outcome === "unknown") note = "unknown";
  else if (liveness === "static") note = "static";
  else if (decision.outcome === "ambiguous") note = "ambiguous";
  else if (mode !== "pilot") note = "review";
  const canAuto = mode === "pilot" && decision.outcome === "matched" && liveness === "motion" && enabled && !conflict;
  const canReview = !conflict && enabled && (decision.outcome === "matched" || decision.outcome === "ambiguous");
  if (canAuto) status = "applied";
  else if (canReview) status = "pending";
  const event = insertEvent({
    cameraId: camera.id,
    employeeId: decision.employeeId,
    direction,
    outcome: decision.outcome,
    score: decision.score,
    secondScore: decision.secondScore,
    latencyMs: context.latencyMs ?? null,
    liveness,
    status,
    note,
  });
  let applied = null;
  if (canAuto) {
    const at = context.at || bakuStamp().iso;
    applied = applyPassage({
      employeeId: decision.employeeId,
      direction,
      at,
      cameraId: camera.id,
      recognitionId: event.id,
      source: "camera",
      meta: context.meta || { actor: { username: "camera" } },
    });
    if (!applied.ok) {
      run("UPDATE recognition_events SET status = 'logged', note = ? WHERE id = ?", [applied.error || "rejected", event.id]);
    }
  }
  const stored = presentEvent(get("SELECT * FROM recognition_events WHERE id = ?", [event.id]));
  const cameraSide = direction === "out" ? "exit" : "entrance";
  let alert = null;
  const subject = String(context.subject || decision.employeeId || "");
  if (enabled && !conflict && decision.outcome === "matched") alert = noteSignal(camera.id, "matched", cameraSide, subject);
  else if (enabled && !conflict && decision.outcome === "unknown") alert = noteSignal(camera.id, "unknown", cameraSide, subject);
  else if (enabled && !conflict && decision.outcome === "ambiguous") alert = noteSignal(camera.id, "ambiguous", cameraSide, subject);
  return {
    ok: true,
    recorded: Boolean(applied?.ok && applied.applied === "applied"),
    duplicate: false,
    applied: applied?.applied || null,
    alert,
    ...stored,
  };
}

export function confirmRecognition(eventId, meta, user) {
  if (!can(user, "attendance.manual")) return { ok: false, error: "forbidden" };
  const event = get("SELECT * FROM recognition_events WHERE id = ?", [eventId]);
  if (!event || !event.employee_id) return { ok: false, error: "invalid" };
  if (event.status === "confirmed") return { ok: true, duplicate: true };
  if (event.outcome !== "matched" && event.outcome !== "ambiguous") return { ok: false, error: "invalid" };
  const claimed = run("UPDATE recognition_events SET status = 'confirming' WHERE id = ? AND status = 'pending'", [event.id]);
  if (!claimed.changes) return { ok: true, duplicate: true };
  const camera = get("SELECT direction FROM cameras WHERE id = ?", [event.camera_id]);
  const direction = camera?.direction === "exit" ? "out" : event.direction === "out" ? "out" : "in";
  const applied = applyPassage({
    employeeId: event.employee_id,
    direction,
    at: bakuStamp().iso,
    cameraId: event.camera_id,
    recognitionId: event.id,
    source: "camera",
    meta,
  });
  if (!applied.ok) {
    run("UPDATE recognition_events SET status = 'pending' WHERE id = ? AND status = 'confirming'", [event.id]);
    return applied;
  }
  const saved = run("UPDATE recognition_events SET status = 'confirmed', note = ? WHERE id = ? AND status = 'confirming'", [applied.applied, event.id]);
  if (!saved.changes) return { ok: true, applied: applied.applied, duplicate: true };
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "recognition.confirm",
    entity: "recognition_event",
    entityId: event.id,
    details: { employeeId: event.employee_id, applied: applied.applied, score: event.score },
    ip: meta.ip,
  });
  const alert = noteSignal(event.camera_id, "confirmed", direction === "out" ? "exit" : "entrance");
  return { ok: true, applied: applied.applied, alert };
}

export function rejectRecognition(eventId, meta, user) {
  if (!can(user, "attendance.manual")) return { ok: false, error: "forbidden" };
  const event = get("SELECT * FROM recognition_events WHERE id = ?", [eventId]);
  if (!event || event.status !== "pending") return { ok: false, error: "invalid" };
  run("UPDATE recognition_events SET status = 'rejected', note = 'rejected' WHERE id = ?", [event.id]);
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "recognition.reject",
    entity: "recognition_event",
    entityId: event.id,
    details: { employeeId: event.employee_id, outcome: event.outcome },
    ip: meta.ip,
  });
  return { ok: true };
}

export function listPendingEvents() {
  const rows = all(
    `SELECT r.*, e.position AS position_name, d.name AS department_name
     FROM recognition_events r
     LEFT JOIN employees e ON e.id = r.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE r.status = 'pending'
     ORDER BY r.created_at DESC
     LIMIT 40`,
  );
  const seen = new Set();
  const fresh = [];
  for (const row of rows) {
    if (Date.now() - Date.parse(row.created_at) > 60_000) continue;
    const key = `${row.camera_id}:${row.employee_id || row.outcome}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push({ ...presentEvent(row), department: row.department_name || "", position: row.position_name || "" });
  }
  return fresh;
}

export function listOperatorEvents(limit = 12) {
  return all(
    `SELECT * FROM recognition_events
     WHERE status IN ('confirmed', 'applied', 'rejected')
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit],
  ).map((row) => presentEvent(row));
}

export function listRecognitionEvents(limit = 30) {
  return all(
    `SELECT * FROM recognition_events ORDER BY created_at DESC LIMIT ?`,
    [limit],
  ).map((row) => presentEvent(row));
}

export function latestCursor() {
  const recognition = get("SELECT MAX(created_at) AS cursor FROM recognition_events");
  const attendance = get("SELECT MAX(updated_at) AS cursor FROM attendance");
  return `${recognition?.cursor || ""}|${attendance?.cursor || ""}`;
}
