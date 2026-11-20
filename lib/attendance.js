import { randomUUID } from "node:crypto";
import { all, get, run } from "./db.js";
import { writeAudit } from "./audit.js";
import { dayKind, marksOn } from "./calendar.js";
import { getEmployeeRow, mapEmployee } from "./employees.js";
import { policyFor } from "./work-policy.js";
import { passageDuration } from "./passages.js";
import { crossesMidnight, resolveSchedule, shiftHasEnded } from "./schedule.js";
import { getSettings } from "./settings.js";
import {
  addDays,
  bakuStamp,
  clockFromIso,
  formatDuration,
  isBakuIso,
  minutesFromIso,
  timeToMinutes,
  todayKey,
} from "./time.js";
import { cleanText, fullName } from "./text.js";

// Writes stay outside the UI so a future camera process can record events
// while the admin panel is closed. The browser is only one caller.
const EXCUSED = new Set(["off", "holiday", "vacation", "sick", "trip", "excused"]);

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
      meta.actor?.username || "",
      reason,
      JSON.stringify(before),
      JSON.stringify(after),
      bakuStamp().iso,
    ],
  );
}

function forward(from, to) {
  if (to >= from) return to - from;
  return 1440 - from + to;
}

export function evaluateAttendance(record, schedule, day = { kind: "work" }) {
  if (!record?.check_in && EXCUSED.has(day.kind)) {
    return finish({ status: day.kind, lateMinutes: 0, earlyMinutes: 0, durationMinutes: null, onSite: false, excused: true }, day);
  }
  if (!record?.check_in) {
    const pending = day.now && day.workDate && !shiftHasEnded(day.workDate, schedule, day.now);
    return finish({
      status: pending ? "pending" : "absent",
      lateMinutes: 0,
      earlyMinutes: 0,
      durationMinutes: null,
      onSite: false,
      excused: false,
    }, day);
  }
  const arrived = minutesFromIso(record.check_in);
  const start = timeToMinutes(schedule.start);
  const overnight = crossesMidnight(schedule);
  const grace = Number(schedule.grace || 0);
  const lateMinutes = overnight
    ? Math.max(0, forward(start, arrived) - grace)
    : Math.max(0, arrived - (start + grace));
  if (!record.check_out) {
    return finish({
      status: lateMinutes > 0 ? "late" : "on_site",
      lateMinutes,
      earlyMinutes: 0,
      durationMinutes: null,
      onSite: true,
      excused: false,
    }, day);
  }
  const left = minutesFromIso(record.check_out);
  const end = timeToMinutes(schedule.end);
  const durationMinutes = overnight || left < arrived ? forward(arrived, left) : Math.max(0, left - arrived);
  const earlyMinutes = overnight
    ? Math.max(0, forward(start, end) - forward(start, left))
    : Math.max(0, end - left);
  return finish({ status: "left", lateMinutes, earlyMinutes, durationMinutes, onSite: false, excused: false }, day);
}

function finish(result, day) {
  if (!day.flex || !["late", "absent", "pending", "on_site", "left"].includes(result.status)) return result;
  return { ...result, status: "flex", lateMinutes: 0, earlyMinutes: 0 };
}

function withinRange(iso) {
  const date = iso.slice(0, 10);
  const today = todayKey();
  return date >= "2024-01-01" && date <= addDays(today, 1);
}

export function recordMovement({ employeeId, direction, at, note = "", source = "manual", meta }) {
  if (direction !== "in" && direction !== "out") return { ok: false, error: "invalid" };
  if (source !== "manual" && source !== "camera") return { ok: false, error: "invalid" };
  const employee = getEmployeeRow(employeeId);
  if (!employee) return { ok: false, error: "employee_not_found" };
  if (employee.status !== "active" || employee.removed_at) return { ok: false, error: "employee_archived" };
  const iso = at || bakuStamp().iso;
  if (!isBakuIso(iso) || !withinRange(iso)) return { ok: false, error: "invalid_time" };
  const cleaned = cleanText(note, 300);
  if (!cleaned.ok) return { ok: false, error: "too_long" };
  const date = iso.slice(0, 10);
  const existing = get("SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?", [employeeId, date]);
  const now = bakuStamp().iso;

  if (direction === "in") {
    if (existing?.check_in) return { ok: false, error: "already_checked_in" };
    const id = existing?.id || randomUUID();
    if (existing) {
      run("UPDATE attendance SET check_in = ?, source = ?, note = ?, updated_at = ? WHERE id = ?", [
        iso, source, cleaned.value, now, id,
      ]);
    } else {
      run(
        `INSERT INTO attendance (id, employee_id, work_date, check_in, check_out, source, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
        [id, employeeId, date, iso, source, cleaned.value, now, now],
      );
    }
  } else {
    if (!existing?.check_in) return { ok: false, error: "not_checked_in" };
    if (existing.check_out) return { ok: false, error: "already_complete" };
    if (iso < existing.check_in) return { ok: false, error: "invalid_time" };
    run("UPDATE attendance SET check_out = ?, note = ?, updated_at = ? WHERE id = ?", [
      iso, cleaned.value || existing.note, now, existing.id,
    ]);
  }

  const saved = get("SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?", [employeeId, date]);
  writeRevision(
    saved.id,
    employeeId,
    revisionSnapshot(existing),
    revisionSnapshot(saved),
    cleaned.value || "manual",
    meta,
  );
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "attendance.record",
    entity: "attendance",
    entityId: employeeId,
    details: { direction, at: iso, source, personnelNumber: employee.personnel_number },
    ip: meta.ip,
  });
  return { ok: true };
}

export function updateAttendance({ id, checkIn, checkOut, note, reason, meta }) {
  const existing = get("SELECT * FROM attendance WHERE id = ?", [id]);
  if (!existing) return { ok: false, error: "employee_not_found" };
  if (!isBakuIso(checkIn) || !withinRange(checkIn)) return { ok: false, error: "invalid_time" };
  if (checkOut && (!isBakuIso(checkOut) || !withinRange(checkOut) || checkOut < checkIn)) {
    return { ok: false, error: "invalid_time" };
  }
  const cleaned = cleanText(note, 300);
  if (!cleaned.ok) return { ok: false, error: "too_long" };
  const why = cleanText(reason, 300);
  if (!why.ok) return { ok: false, error: "too_long" };
  if (!why.value) return { ok: false, error: "reason_required" };
  const date = checkIn.slice(0, 10);
  const clash = get(
    "SELECT id FROM attendance WHERE employee_id = ? AND work_date = ? AND id <> ?",
    [existing.employee_id, date, id],
  );
  if (clash) return { ok: false, error: "already_complete" };
  const before = revisionSnapshot(existing);
  run(
    `UPDATE attendance SET work_date = ?, check_in = ?, check_out = ?, note = ?, updated_at = ? WHERE id = ?`,
    [date, checkIn, checkOut || null, cleaned.value, bakuStamp().iso, id],
  );
  const saved = get("SELECT * FROM attendance WHERE id = ?", [id]);
  writeRevision(id, existing.employee_id, before, revisionSnapshot(saved), why.value, meta);
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "attendance.update",
    entity: "attendance",
    entityId: id,
    details: { checkIn, checkOut: checkOut || null, reason: why.value },
    ip: meta.ip,
  });
  return { ok: true };
}

export function revisionsFor(ids) {
  if (!ids.length) return {};
  const marks = ids.map(() => "?").join(", ");
  const rows = all(
    `SELECT id, attendance_id, editor_username, reason, before_json, after_json, created_at
     FROM attendance_revisions
     WHERE attendance_id IN (${marks})
     ORDER BY created_at DESC`,
    ids,
  );
  const grouped = {};
  for (const row of rows) {
    grouped[row.attendance_id] ||= [];
    grouped[row.attendance_id].push(row);
  }
  return grouped;
}

export function dailyBoard(dateKey) {
  const settings = getSettings();
  const marks = marksOn(dateKey);
  const records = all("SELECT * FROM attendance WHERE work_date = ?", [dateKey]);
  const byEmployee = new Map(records.map((row) => [row.employee_id, row]));
  const history = revisionsFor(records.map((row) => row.id));
  const people = all(
    `SELECT e.*, d.name AS department_name, d.schedule_start AS dept_start,
            d.schedule_end AS dept_end, d.grace_minutes AS dept_grace
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE (e.removed_at IS NULL AND e.status = 'active')
        OR e.id IN (SELECT employee_id FROM attendance WHERE work_date = ?)`,
    [dateKey],
  );
  return people
    .map((row) => {
      const record = byEmployee.get(row.id) || null;
      const employee = mapEmployee(row);
      const evaluation = evaluateAttendance(record, resolveSchedule(row, settings), {
        kind: dayKind(dateKey, row.id, settings, marks),
        now: bakuStamp().iso,
        workDate: dateKey,
        flex: policyFor(row.id, dateKey).flexTime,
      });
      const worked = record ? passageDuration(row.id, dateKey) : undefined;
      if (worked !== undefined) evaluation.durationMinutes = worked;
      return {
        employee,
        recordId: record?.id || null,
        revisions: record ? history[record.id] || [] : [],
        checkIn: record?.check_in || null,
        checkOut: record?.check_out || null,
        checkInLabel: record?.check_in ? clockFromIso(record.check_in) : "—",
        checkOutLabel: record?.check_out ? clockFromIso(record.check_out) : "—",
        note: record?.note || "",
        source: record?.source || null,
        durationLabel: formatDuration(evaluation.durationMinutes),
        ...evaluation,
      };
    })
    .sort((a, b) => fullName(a.employee).localeCompare(fullName(b.employee), "az"));
}

export function cameraEvents(limit = 20) {
  return all(
    `SELECT a.id, a.check_in, a.check_out, a.updated_at, a.source, a.work_date,
            e.first_name, e.last_name, e.patronymic, d.name AS department_name
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE a.source = 'camera'
     ORDER BY a.updated_at DESC
     LIMIT ?`,
    [limit],
  ).map((row) => ({
    id: row.id,
    at: row.check_out || row.check_in,
    kind: row.check_out ? "out" : "in",
    name: [row.last_name, row.first_name, row.patronymic].filter(Boolean).join(" "),
    departmentName: row.department_name || "",
  }));
}
