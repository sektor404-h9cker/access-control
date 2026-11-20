import { randomUUID } from "node:crypto";
import { all, get, run } from "./db.js";
import { bakuStamp } from "./time.js";
import { cleanText, fold } from "./text.js";
import { parseScheduleOverride } from "./schedule.js";
import { writeAudit } from "./audit.js";

function mapDepartment(row, headcount = 0) {
  return {
    id: row.id,
    name: row.name,
    scheduleStart: row.schedule_start,
    scheduleEnd: row.schedule_end,
    graceMinutes: row.grace_minutes,
    archived: Boolean(row.archived),
    headcount,
  };
}

export function listDepartments({ includeArchived = true } = {}) {
  const counts = all(
    "SELECT department_id, COUNT(*) AS count FROM employees WHERE status = 'active' GROUP BY department_id",
  );
  const byId = new Map(counts.map((row) => [row.department_id, row.count]));
  const rows = all(
    `SELECT * FROM departments ${includeArchived ? "" : "WHERE archived = 0"} ORDER BY archived, name`,
  );
  return rows
    .map((row) => mapDepartment(row, byId.get(row.id) || 0))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, "az"));
}

function nameTaken(name, exceptId) {
  const rows = all("SELECT id, name FROM departments WHERE archived = 0");
  const needle = fold(name);
  return rows.some((row) => row.id !== exceptId && fold(row.name) === needle);
}

export function saveDepartment(input, meta) {
  const name = cleanText(input.name, 80);
  const schedule = parseScheduleOverride(input.scheduleStart, input.scheduleEnd, input.graceMinutes);
  const fields = {};
  if (!name.ok || name.value.length < 2) fields.name = name.ok ? "required" : "too_long";
  if (!schedule.ok) fields.schedule_start = schedule.error;
  if (name.ok && name.value && nameTaken(name.value, input.id || null)) fields.name = "name_taken";
  if (Object.keys(fields).length) return { ok: false, error: "invalid", fields };

  const now = bakuStamp().iso;
  if (!input.id) {
    const id = randomUUID();
    run(
      `INSERT INTO departments (id, name, schedule_start, schedule_end, grace_minutes, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, name.value, schedule.start, schedule.end, schedule.grace, now, now],
    );
    writeAudit({
      userId: meta.actor?.id,
      username: meta.actor?.username,
      action: "department.create",
      entity: "department",
      entityId: id,
      details: { name: name.value },
      ip: meta.ip,
    });
    return { ok: true, id };
  }

  const existing = get("SELECT id FROM departments WHERE id = ?", [input.id]);
  if (!existing) return { ok: false, error: "department_not_found" };
  run(
    `UPDATE departments
     SET name = ?, schedule_start = ?, schedule_end = ?, grace_minutes = ?, updated_at = ?
     WHERE id = ?`,
    [name.value, schedule.start, schedule.end, schedule.grace, now, input.id],
  );
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "department.update",
    entity: "department",
    entityId: input.id,
    details: { name: name.value },
    ip: meta.ip,
  });
  return { ok: true, id: input.id };
}

export function deleteDepartment(id, meta) {
  const existing = get("SELECT id, name FROM departments WHERE id = ?", [id]);
  if (!existing) return { ok: false, error: "department_not_found" };
  const live = get("SELECT COUNT(*) AS count FROM employees WHERE department_id = ? AND removed_at IS NULL", [id]);
  if (live.count > 0) return { ok: false, error: "department_has_employees" };
  run(
    `UPDATE employees
     SET report_department = CASE WHEN report_department = '' THEN ? ELSE report_department END,
         department_id = NULL
     WHERE department_id = ?`,
    [existing.name, id],
  );
  run("DELETE FROM departments WHERE id = ?", [id]);
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "department.delete",
    entity: "department",
    entityId: id,
    details: { name: existing.name },
    ip: meta.ip,
  });
  return { ok: true };
}

export function setDepartmentArchived(id, archived, meta) {
  const existing = get("SELECT id, name, archived FROM departments WHERE id = ?", [id]);
  if (!existing) return { ok: false, error: "department_not_found" };
  if (archived) {
    const active = get(
      "SELECT COUNT(*) AS count FROM employees WHERE department_id = ? AND status = 'active'",
      [id],
    );
    if (active.count > 0) return { ok: false, error: "department_has_employees" };
  }
  run("UPDATE departments SET archived = ?, updated_at = ? WHERE id = ?", [
    archived ? 1 : 0,
    bakuStamp().iso,
    id,
  ]);
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: archived ? "department.archive" : "department.restore",
    entity: "department",
    entityId: id,
    details: { name: existing.name },
    ip: meta.ip,
  });
  return { ok: true };
}
