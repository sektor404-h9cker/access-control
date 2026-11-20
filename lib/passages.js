import { randomUUID } from "node:crypto";
import { writeAudit } from "./audit.js";
import { all, get, run, transaction } from "./db.js";
import { getEmployeeRow } from "./employees.js";
import { passageWorkDate, resolveSchedule } from "./schedule.js";
import { getSettings } from "./settings.js";
import { bakuStamp, isBakuIso } from "./time.js";

const DEBOUNCE_MS = 12_000;

function revisionSnapshot(row) {
  if (!row) return { work_date: null, check_in: null, check_out: null, note: "" };
  return {
    work_date: row.work_date,
    check_in: row.check_in,
    check_out: row.check_out,
    note: row.note || "",
  };
}

function writeRevision(attendanceId, employeeId, before, after, reason, meta) {
  run(
    `INSERT INTO attendance_revisions (
      id, attendance_id, employee_id, editor_id, editor_username, reason, before_json, after_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      attendanceId,
      employeeId,
      meta.actor?.id || null,
      meta.actor?.username || "camera",
      reason,
      JSON.stringify(before),
      JSON.stringify(after),
      bakuStamp().iso,
    ],
  );
}

function insertPassage({ employeeId, direction, source, cameraId, recognitionId, at, workDate, applied, reason }) {
  const id = randomUUID();
  const eventSource = source === "camera" ? "AUTO_FACE" : "ADMIN_CORRECTION";
  run(
    `INSERT INTO passage_events (
      id, employee_id, direction, source, camera_id, recognition_id, at, work_date, applied, reason, created_at, visit_id, event_source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, employeeId, direction, source, cameraId || null, recognitionId || null, at, workDate, applied, reason, bakuStamp().iso, recognitionId || null, eventSource],
  );
  return id;
}

export function applyPassage({ employeeId, direction, at, cameraId = null, recognitionId = null, source = "camera", meta, fresh = false }) {
  if (direction !== "in" && direction !== "out") return { ok: false, error: "invalid" };
  if (!isBakuIso(at)) return { ok: false, error: "invalid_time" };
  const employee = getEmployeeRow(employeeId);
  if (!employee || employee.status !== "active" || employee.removed_at) return { ok: false, error: "employee_archived" };
  const schedule = resolveSchedule(employee, getSettings());
  const workDate = passageWorkDate(at, schedule);
  return transaction(() => applyPassageLocked({ employeeId, direction, at, cameraId, recognitionId, source, meta, workDate, fresh }));
}

function applyPassageLocked({ employeeId, direction, at, cameraId, recognitionId, source, meta, workDate, fresh = false }) {
  const recent = get(
    `SELECT at FROM passage_events
     WHERE employee_id = ? AND direction = ? AND applied IN ('applied', 'return')
     ORDER BY at DESC LIMIT 1`,
    [employeeId, direction],
  );
  if (!fresh && recent && Math.abs(Date.parse(at) - Date.parse(recent.at)) < DEBOUNCE_MS) {
    insertPassage({ employeeId, direction, source, cameraId, recognitionId, at, workDate, applied: "debounced", reason: "debounce" });
    return { ok: true, applied: "debounced", workDate };
  }
  const existing = get("SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?", [employeeId, workDate]);
  const now = bakuStamp().iso;

  if (direction === "in") {
    if (!existing?.check_in) {
      const id = existing?.id || randomUUID();
      if (existing) {
        run("UPDATE attendance SET check_in = ?, source = ?, updated_at = ? WHERE id = ?", [at, source, now, id]);
      } else {
        run(
          `INSERT INTO attendance (id, employee_id, work_date, check_in, check_out, source, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, ?, '', ?, ?)`,
          [id, employeeId, workDate, at, source, now, now],
        );
      }
      const saved = get("SELECT * FROM attendance WHERE id = ?", [id]);
      writeRevision(id, employeeId, revisionSnapshot(existing), revisionSnapshot(saved), "camera_entrance", meta);
      insertPassage({ employeeId, direction, source, cameraId, recognitionId, at, workDate, applied: "applied", reason: "entrance" });
      writeAudit({
        userId: meta.actor?.id,
        username: meta.actor?.username || "camera",
        action: "attendance.record",
        entity: "attendance",
        entityId: employeeId,
        details: { direction, at, source, cameraId, workDate },
        ip: meta.ip,
      });
      return { ok: true, applied: "applied", workDate };
    }
    if (existing.check_out && at > existing.check_out) {
      const before = revisionSnapshot(existing);
      run("UPDATE attendance SET check_out = NULL, updated_at = ? WHERE id = ?", [now, existing.id]);
      const saved = get("SELECT * FROM attendance WHERE id = ?", [existing.id]);
      writeRevision(existing.id, employeeId, before, revisionSnapshot(saved), "camera_return", meta);
      insertPassage({ employeeId, direction, source, cameraId, recognitionId, at, workDate, applied: "return", reason: "return" });
      return { ok: true, applied: "return", workDate };
    }
    insertPassage({ employeeId, direction, source, cameraId, recognitionId, at, workDate, applied: "repeat", reason: "already_inside" });
    return { ok: true, applied: "repeat", workDate };
  }

  if (!existing?.check_in) {
    insertPassage({ employeeId, direction, source, cameraId, recognitionId, at, workDate, applied: "rejected", reason: "not_checked_in" });
    return { ok: false, error: "not_checked_in", applied: "rejected", workDate };
  }
  if (at < existing.check_in) {
    insertPassage({ employeeId, direction, source, cameraId, recognitionId, at, workDate, applied: "rejected", reason: "invalid_time" });
    return { ok: false, error: "invalid_time", applied: "rejected", workDate };
  }
  const before = revisionSnapshot(existing);
  const reason = existing.check_out ? "camera_last_exit" : "camera_exit";
  if (!existing.check_out || at > existing.check_out) {
    run("UPDATE attendance SET check_out = ?, source = ?, updated_at = ? WHERE id = ?", [at, source, now, existing.id]);
    const saved = get("SELECT * FROM attendance WHERE id = ?", [existing.id]);
    writeRevision(existing.id, employeeId, before, revisionSnapshot(saved), reason, meta);
    insertPassage({ employeeId, direction, source, cameraId, recognitionId, at, workDate, applied: "applied", reason });
    writeAudit({
      userId: meta.actor?.id,
      username: meta.actor?.username || "camera",
      action: "attendance.record",
      entity: "attendance",
      entityId: employeeId,
      details: { direction, at, source, cameraId, workDate },
      ip: meta.ip,
    });
    return { ok: true, applied: "applied", workDate };
  }
  insertPassage({ employeeId, direction, source, cameraId, recognitionId, at, workDate, applied: "repeat", reason: "earlier_exit" });
  return { ok: true, applied: "repeat", workDate };
}

export function passageDuration(employeeId, workDate) {
  const rows = all(
    `SELECT direction, at FROM passage_events
     WHERE employee_id = ? AND work_date = ? AND applied IN ('applied', 'return')
     ORDER BY at`,
    [employeeId, workDate],
  );
  if (!rows.length) return undefined;
  let open = null;
  let total = 0;
  let closed = 0;
  for (const row of rows) {
    if (row.direction === "in") {
      if (!open) open = row.at;
    } else if (open) {
      total += Math.max(0, Math.round((Date.parse(row.at) - Date.parse(open)) / 60000));
      open = null;
      closed += 1;
    }
  }
  if (!closed) return undefined;
  return total;
}

export function listAutomaticEvents(limit = 8) {
  return all(
    `SELECT p.id, p.at, p.direction, p.applied, p.reason, p.employee_id, c.code,
            e.last_name, e.first_name, e.patronymic, e.position, d.name AS department
     FROM passage_events p
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN cameras c ON c.id = p.camera_id
     WHERE p.applied IN ('applied', 'return', 'repeat')
     ORDER BY p.at DESC
     LIMIT ?`,
    [limit],
  ).map((row) => ({
    id: row.id,
    at: row.at,
    direction: row.direction,
    applied: row.applied,
    reason: row.reason,
    employeeId: row.employee_id,
    cameraCode: row.code || "",
    department: row.department || "",
    position: row.position || "",
    name: [row.last_name, row.first_name, row.patronymic].filter(Boolean).join(" "),
    status: "registered",
    outcome: "matched",
  }));
}

export function listPassages(workDate) {
  return all(
    `SELECT p.id, p.at, p.direction, p.source, p.applied, p.reason, c.code,
            e.last_name, e.first_name, e.patronymic
     FROM passage_events p
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN cameras c ON c.id = p.camera_id
     WHERE p.work_date = ?
     ORDER BY p.at`,
    [workDate],
  ).map((row) => ({
    id: row.id,
    at: row.at,
    direction: row.direction,
    source: row.source,
    applied: row.applied,
    reason: row.reason,
    cameraCode: row.code || "",
    name: [row.last_name, row.first_name, row.patronymic].filter(Boolean).join(" "),
  }));
}

export function listEmployeeAttendance(employeeId, from, to) {
  const days = all(
    `SELECT id, work_date, check_in, check_out, source, note
     FROM attendance
     WHERE employee_id = ? AND work_date >= ? AND work_date <= ?
     ORDER BY work_date DESC`,
    [employeeId, from, to],
  );
  const passages = all(
    `SELECT p.id, p.at, p.direction, p.applied, p.reason, p.event_source, p.visit_id, c.code
     FROM passage_events p
     LEFT JOIN cameras c ON c.id = p.camera_id
     WHERE p.employee_id = ? AND p.work_date >= ? AND p.work_date <= ?
       AND p.applied IN ('applied', 'return', 'repeat')
     ORDER BY p.at DESC`,
    [employeeId, from, to],
  ).map((row) => ({
    id: row.id,
    at: row.at,
    direction: row.direction,
    applied: row.applied,
    reason: row.reason,
    source: row.event_source || "",
    visitId: row.visit_id || "",
    cameraCode: row.code || "",
  }));
  const revisions = days.length
    ? all(
      `SELECT id, attendance_id, editor_username, reason, before_json, after_json, created_at
       FROM attendance_revisions
       WHERE attendance_id IN (${days.map(() => "?").join(", ")})
       ORDER BY created_at DESC`,
      days.map((day) => day.id),
    )
    : [];
  return {
    days: days.map((row) => ({
      id: row.id,
      workDate: row.work_date,
      checkIn: row.check_in,
      checkOut: row.check_out,
      source: row.source,
      note: row.note || "",
      exitMissing: Boolean(row.check_in && !row.check_out),
    })),
    passages,
    revisions: revisions.map((row) => ({
      id: row.id,
      at: row.created_at,
      editor: row.editor_username || "",
      reason: row.reason || "",
      before: row.before_json,
      after: row.after_json,
    })),
  };
}
