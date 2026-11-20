import { randomUUID } from "node:crypto";
import { writeAudit } from "./audit.js";
import { all, get, run, transaction } from "./db.js";
import { getEmployeeRow } from "./employees.js";
import { storeBiometric } from "./face-store.js";
import { removePhoto, savePhoto } from "./photos.js";
import { bakuStamp } from "./time.js";
import { cleanText } from "./text.js";

const POSES = ["center", "left", "right", "up", "down"];
const REQUIRED_POSES = ["center", "left", "right"];
const MIN_SCAN = 6;
const MAX_SCAN = 12;
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function actor(meta) {
  return { userId: meta.actor?.id, username: meta.actor?.username, ip: meta.ip };
}

export function listFaceSessions(employeeId) {
  if (!getEmployeeRow(employeeId)) return [];
  return all(
    `SELECT id, mode, status, poses, quality_note, template_stored, created_at
     FROM face_sessions WHERE employee_id = ? ORDER BY created_at DESC LIMIT 20`,
    [employeeId],
  ).map((row) => ({
    id: row.id,
    mode: row.mode,
    status: row.status,
    poses: row.poses ? row.poses.split(",").filter(Boolean) : [],
    qualityNote: row.quality_note || "",
    templateStored: row.template_stored === 1,
    createdAt: row.created_at,
  }));
}

export function recordEnrollment(input, meta) {
  const employee = getEmployeeRow(input.employeeId);
  if (!employee) return { ok: false, error: "employee_not_found" };
  if (employee.status !== "active" || employee.removed_at) return { ok: false, error: "employee_archived" };
  const token = String(input.clientToken || "").trim().toLowerCase();
  if (!TOKEN.test(token)) return { ok: false, error: "invalid" };
  const existing = get("SELECT id, employee_id FROM face_sessions WHERE client_token = ?", [token]);
  if (existing) {
    if (existing.employee_id !== employee.id) return { ok: false, error: "invalid" };
    return { ok: true, id: employee.id, duplicate: true };
  }
  const mode = input.mode === "scan" ? "scan" : "still";
  const poses = (Array.isArray(input.poses) ? input.poses : []).filter((pose) => POSES.includes(pose));
  if (mode === "scan" && (poses.length < MIN_SCAN || poses.length > MAX_SCAN || REQUIRED_POSES.some((pose) => !poses.includes(pose)))) {
    return { ok: false, error: "enrollment_incomplete" };
  }
  if (!input.photo?.bytes) return { ok: false, error: "photo_type" };
  const quality = cleanText(input.qualityNote, 200);
  if (!quality.ok) return { ok: false, error: "too_long" };

  const filename = savePhoto(input.photo);
  const now = bakuStamp().iso;
  const sessionId = randomUUID();
  try {
    transaction(() => {
      const raced = get("SELECT id FROM face_sessions WHERE client_token = ?", [token]);
      if (raced) throw Object.assign(new Error("duplicate"), { code: "duplicate" });
      run(
        "UPDATE employees SET photo_file = ?, face_status = ?, updated_at = ? WHERE id = ?",
        [filename, mode === "scan" ? "captured" : employee.face_status || "none", now, employee.id],
      );
      run(
        `INSERT INTO face_sessions (
          id, employee_id, client_token, mode, status, poses, quality_note, template_stored, created_by, created_at
        ) VALUES (?, ?, ?, ?, 'confirmed', ?, ?, 0, ?, ?)`,
        [sessionId, employee.id, token, mode, poses.join(","), quality.value, meta.actor?.id || null, now],
      );
      if (mode === "scan") {
        run(
          `INSERT INTO processing_events (id, camera_id, employee_id, kind, note, created_at)
           VALUES (?, NULL, ?, 'enrollment.captured', 'template_not_stored', ?)`,
          [randomUUID(), employee.id, now],
        );
      }
    });
  } catch (error) {
    removePhoto(filename);
    if (error.code === "duplicate") return { ok: true, id: employee.id, duplicate: true };
    throw error;
  }
  if (employee.photo_file && employee.photo_file !== filename) removePhoto(employee.photo_file);
  writeAudit({
    ...actor(meta),
    action: mode === "scan" ? "face.capture" : "face.photo",
    entity: "employee",
    entityId: employee.id,
    details: { mode, poses, templateStored: false },
  });
  return { ok: true, id: employee.id, photoFile: filename };
}

export async function completeEnrollment(input, meta) {
  const employee = getEmployeeRow(input.employeeId);
  if (!employee) return { ok: false, error: "employee_not_found" };
  if (input.mode === "scan") {
    if (!employee.biometric_allowed) return { ok: false, error: "biometric_denied" };
    if (employee.face_enrolled && !input.confirmReplace) return { ok: false, error: "replace_required" };
    if (!Array.isArray(input.samples) || input.samples.length < MIN_SCAN || input.samples.length > MAX_SCAN) return { ok: false, error: "samples_required" };
  }
  const saved = recordEnrollment(input, meta);
  if (!saved.ok || input.mode !== "scan") return saved;
  if (saved.duplicate && employee.face_enrolled) return saved;
  const template = await storeBiometric({
    employeeId: employee.id,
    samples: input.samples,
    confirmReplace: Boolean(input.confirmReplace),
    meta,
  });
  if (!template.ok) return template;
  return { ...saved, template: true };
}
