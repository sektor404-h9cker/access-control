import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { randomUUID } from "node:crypto";
import { writeAudit } from "./audit.js";
import { biometricKey } from "./biometric-key.js";
import { all, get, run, transaction } from "./db.js";
import { embedJpeg } from "./face-embed.js";
import { pointMotion } from "./face-geometry.js";
import { ACCEPT_COSINE, MODEL_ID, cosine, decideMatch, l2normalize } from "./face-match.js";
import { bakuStamp } from "./time.js";

const MIN_SAMPLES = 6;
const MAX_SAMPLES = 12;
const MOTION_REQUIRED = 0.012;

function templateKey() {
  try {
    return biometricKey();
  } catch {
    return null;
  }
}

function seal(vector) {
  const key = templateKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), encrypted };
}

function openVector(row) {
  const key = templateKey();
  if (!key) return null;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(row.iv));
  decipher.setAuthTag(Buffer.from(row.tag));
  const plain = Buffer.concat([decipher.update(Buffer.from(row.vector)), decipher.final()]);
  const copy = new Float32Array(plain.length / 4);
  Buffer.from(copy.buffer).set(plain);
  return copy;
}

function actor(meta) {
  return { userId: meta.actor?.id, username: meta.actor?.username, ip: meta.ip };
}

export function activeTemplateCount() {
  return get("SELECT COUNT(*) AS count FROM face_templates WHERE active = 1 AND model = ?", [MODEL_ID]).count;
}

export function gallery() {
  return all(
    `SELECT t.employee_id, t.iv, t.tag, t.vector
     FROM face_templates t
     JOIN employees e ON e.id = t.employee_id
     WHERE t.active = 1 AND t.model = ? AND e.status = 'active' AND e.removed_at IS NULL AND e.biometric_allowed = 1 AND e.face_enrolled = 1`,
    [MODEL_ID],
  ).flatMap((row) => {
    try {
      const vector = openVector(row);
      if (!vector || vector.length !== 128) return [];
      return [{ employeeId: row.employee_id, vector }];
    } catch {
      return [];
    }
  });
}

export function matchGallery(vector, { exceptEmployeeId = "" } = {}) {
  const best = new Map();
  for (const item of gallery()) {
    if (item.employeeId === exceptEmployeeId) continue;
    const score = cosine(vector, item.vector);
    const current = best.get(item.employeeId);
    if (!current || score > current) best.set(item.employeeId, score);
  }
  return decideMatch([...best].map(([employeeId, value]) => ({ employeeId, cosine: value })));
}

function conflictingEmployee(vectors, employeeId) {
  let conflict = null;
  for (const vector of vectors) {
    for (const item of gallery()) {
      if (item.employeeId === employeeId) continue;
      const score = cosine(vector, item.vector);
      if (score >= ACCEPT_COSINE && (!conflict || score > conflict.score)) {
        conflict = { employeeId: item.employeeId, score };
      }
    }
  }
  return conflict;
}

function writeTemplates(employeeId, vectors, meta) {
  const sealed = vectors.map((vector) => seal(l2normalize(vector)));
  if (sealed.some((item) => !item)) return { ok: false, error: "model_missing" };
  const now = bakuStamp().iso;
  const ids = [];
  transaction(() => {
    run("DELETE FROM face_templates WHERE employee_id = ?", [employeeId]);
    for (const item of sealed) {
      const id = randomUUID();
      ids.push(id);
      run(
        `INSERT INTO face_templates (id, employee_id, model, dimension, iv, tag, vector, created_by, created_at, active)
         VALUES (?, ?, ?, 128, ?, ?, ?, ?, ?, 1)`,
        [id, employeeId, MODEL_ID, item.iv, item.tag, item.encrypted, meta.actor?.id || null, now],
      );
    }
    run("UPDATE employees SET face_enrolled = 1, updated_at = ? WHERE id = ?", [now, employeeId]);
  });
  const stored = get(
    "SELECT COUNT(*) AS count FROM face_templates WHERE employee_id = ? AND active = 1 AND model = ?",
    [employeeId, MODEL_ID],
  ).count;
  const enrolled = get("SELECT face_enrolled FROM employees WHERE id = ?", [employeeId]).face_enrolled;
  if (stored !== vectors.length || enrolled !== 1) return { ok: false, error: "template_unverified" };
  writeAudit({
    ...actor(meta),
    action: "face.template",
    entity: "employee",
    entityId: employeeId,
    details: { model: MODEL_ID, dimension: 128, templates: ids.length },
  });
  return { ok: true, id: ids[0], templates: ids.length };
}

export function saveTemplateVector(employeeId, vector, meta, { confirmReplace = false } = {}) {
  const employee = get("SELECT id, status, biometric_allowed, face_enrolled FROM employees WHERE id = ?", [employeeId]);
  if (!employee) return { ok: false, error: "employee_not_found" };
  if (employee.status !== "active" || employee.removed_at) return { ok: false, error: "employee_archived" };
  if (!employee.biometric_allowed) return { ok: false, error: "biometric_denied" };
  if (employee.face_enrolled && !confirmReplace) return { ok: false, error: "replace_required" };
  if (!vector || vector.length !== 128) return { ok: false, error: "samples_required" };
  return writeTemplates(employeeId, [vector], meta);
}

export async function storeBiometric({ employeeId, samples, confirmReplace, meta }) {
  const employee = get("SELECT id, status, biometric_allowed, face_enrolled FROM employees WHERE id = ?", [employeeId]);
  if (!employee) return { ok: false, error: "employee_not_found" };
  if (employee.status !== "active" || employee.removed_at) return { ok: false, error: "employee_archived" };
  if (!employee.biometric_allowed) return { ok: false, error: "biometric_denied" };
  if (employee.face_enrolled && !confirmReplace) return { ok: false, error: "replace_required" };
  if (!Array.isArray(samples) || samples.length < MIN_SAMPLES || samples.length > MAX_SAMPLES) return { ok: false, error: "samples_required" };
  const points = samples.map((sample) => sample.points);
  if (points.some((row) => !Array.isArray(row) || row.length !== 5)) return { ok: false, error: "samples_required" };
  if (pointMotion(points) < MOTION_REQUIRED) return { ok: false, error: "static_sample" };
  const uniqueBytes = new Set(samples.map((sample) => Buffer.from(sample.bytes).toString("base64")));
  if (uniqueBytes.size < MIN_SAMPLES) return { ok: false, error: "static_sample" };
  const vectors = [];
  for (const sample of samples) {
    const embedded = await embedJpeg(sample.bytes);
    if (!embedded.ok) return embedded;
    if (![...embedded.vector].every((value) => Number.isFinite(value))) return { ok: false, error: "samples_required" };
    vectors.push(embedded.vector);
  }
  let closest = 1;
  for (let left = 0; left < vectors.length; left += 1) {
    for (let right = left + 1; right < vectors.length; right += 1) {
      closest = Math.min(closest, cosine(vectors[left], vectors[right]));
    }
  }
  if (closest > 0.997) return { ok: false, error: "static_sample" };
  const conflict = conflictingEmployee(vectors, employeeId);
  if (conflict) {
    const now = bakuStamp().iso;
    run(
      `INSERT INTO processing_events (id, camera_id, employee_id, kind, note, created_at)
       VALUES (?, NULL, ?, 'enrollment.duplicate', 'review', ?)`,
      [randomUUID(), employeeId, now],
    );
    writeAudit({
      ...actor(meta),
      action: "face.duplicate",
      entity: "employee",
      entityId: employeeId,
      details: { otherEmployeeId: conflict.employeeId, score: Math.round(conflict.score * 10000) / 10000 },
    });
    return { ok: false, error: "duplicate_face" };
  }
  return writeTemplates(employeeId, vectors, meta);
}

export function deleteEmployeeTemplates(employeeId, meta, { clearConsent = true } = {}) {
  const existing = get("SELECT id FROM employees WHERE id = ?", [employeeId]);
  if (!existing) return { ok: false, error: "employee_not_found" };
  const count = get("SELECT COUNT(*) AS count FROM face_templates WHERE employee_id = ?", [employeeId]).count;
  const now = bakuStamp().iso;
  run("DELETE FROM face_templates WHERE employee_id = ?", [employeeId]);
  if (clearConsent) {
    run("UPDATE employees SET face_enrolled = 0, biometric_allowed = 0, updated_at = ? WHERE id = ?", [now, employeeId]);
  } else {
    run("UPDATE employees SET face_enrolled = 0, updated_at = ? WHERE id = ?", [now, employeeId]);
  }
  if (count) {
    writeAudit({
      ...actor(meta),
      action: "face.revoke",
      entity: "employee",
      entityId: employeeId,
      details: { removed: count },
    });
  }
  return { ok: true, removed: count };
}
