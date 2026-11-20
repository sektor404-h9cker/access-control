import fs from "node:fs";
import path from "node:path";
import { writeAudit } from "./audit.js";
import { createBackup } from "./backup.js";
import { all, get, run, transaction } from "./db.js";
import { removePhoto } from "./photos.js";

const PROTECTED = new Set(["jamal.huseynov", "xanim.cabarzade", "raife"]);

function demoEmployees() {
  return all(
    `SELECT id, photo_file FROM employees
     WHERE last_name LIKE 'DEMO-%' OR first_name LIKE 'DEMO-%' OR personnel_number LIKE 'DEMO-%'`,
  );
}

function demoDepartments(employeeIds) {
  const rows = all("SELECT id, name FROM departments WHERE name LIKE 'DEMO-%'");
  return rows.filter((department) => {
    const occupied = get(
      `SELECT id FROM employees WHERE department_id = ? AND id NOT IN (${employeeIds.map(() => "?").join(",") || "''"}) LIMIT 1`,
      [department.id, ...employeeIds],
    );
    return !occupied;
  });
}

export function previewDemoPurge() {
  const employees = demoEmployees();
  const ids = employees.map((row) => row.id);
  const marks = ids.length ? ids.map(() => "?").join(",") : "";
  const countFor = (sql) => (ids.length ? get(sql, ids).count : 0);
  const departments = demoDepartments(ids);
  const users = all("SELECT username FROM users WHERE username = 'demo'").filter((row) => !PROTECTED.has(row.username));
  const counts = {
    employees: employees.length,
    departments: departments.length,
    users: users.length,
    attendance: countFor(`SELECT COUNT(*) AS count FROM attendance WHERE employee_id IN (${marks})`),
    passages: countFor(`SELECT COUNT(*) AS count FROM passage_events WHERE employee_id IN (${marks})`),
    templates: countFor(`SELECT COUNT(*) AS count FROM face_templates WHERE employee_id IN (${marks})`),
    sessions: countFor(`SELECT COUNT(*) AS count FROM face_sessions WHERE employee_id IN (${marks})`),
    events: countFor(`SELECT COUNT(*) AS count FROM recognition_events WHERE employee_id IN (${marks})`),
    photos: employees.filter((row) => row.photo_file).length,
  };
  counts.total = counts.employees + counts.departments + counts.users + counts.attendance + counts.passages + counts.templates + counts.sessions + counts.events;
  return counts;
}

export function purgeDemoData(meta, user, phrase) {
  if (user?.role !== "owner") return { ok: false, error: "forbidden" };
  if (phrase !== "purge-demo") return { ok: false, error: "purge_denied" };
  const before = previewDemoPurge();
  if (!before.total) return { ok: true, empty: true, ...before };
  const folder = createBackup();
  const database = path.join(process.cwd(), folder, "database.db");
  if (!fs.existsSync(database) || fs.statSync(database).size < 1024) return { ok: false, error: "backup_failed" };
  const employees = demoEmployees();
  const ids = employees.map((row) => row.id);
  const departments = demoDepartments(ids);
  const photos = employees.map((row) => row.photo_file).filter(Boolean);
  transaction(() => {
    if (ids.length) {
      const marks = ids.map(() => "?").join(",");
      run(`DELETE FROM passage_events WHERE employee_id IN (${marks})`, ids);
      run(`DELETE FROM recognition_events WHERE employee_id IN (${marks})`, ids);
      run(`DELETE FROM face_templates WHERE employee_id IN (${marks})`, ids);
      run(`DELETE FROM face_sessions WHERE employee_id IN (${marks})`, ids);
      run(`DELETE FROM processing_events WHERE employee_id IN (${marks})`, ids);
      run(`DELETE FROM attendance WHERE employee_id IN (${marks})`, ids);
      run(`DELETE FROM day_marks WHERE employee_id IN (${marks})`, ids);
      run(`DELETE FROM employees WHERE id IN (${marks})`, ids);
    }
    for (const department of departments) run("DELETE FROM departments WHERE id = ?", [department.id]);
    run("DELETE FROM users WHERE username = 'demo'");
  });
  for (const filename of photos) removePhoto(filename);
  const after = previewDemoPurge();
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "demo.purge",
    entity: "settings",
    details: { removed: before, remaining: after.total, backup: folder },
    ip: meta.ip,
  });
  return { ok: true, empty: false, removed: before, backup: folder };
}
