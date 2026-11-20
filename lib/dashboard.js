import { all } from "./db.js";
import { recentAudit } from "./audit.js";
import { evaluateAttendance } from "./attendance.js";
import { dayKind, marksOn } from "./calendar.js";
import { latestBackupName } from "./backup.js";
import { resolveSchedule } from "./schedule.js";
import { exitCameraEnabled, getSettings, listCameras } from "./settings.js";
import { policyFor } from "./work-policy.js";
import { addDays, bakuStamp, todayKey } from "./time.js";

export function dashboardSnapshot() {
  const settings = getSettings();
  const today = todayKey();
  const employees = all(
    `SELECT e.*, d.name AS department_name, d.schedule_start AS dept_start,
            d.schedule_end AS dept_end, d.grace_minutes AS dept_grace
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.status = 'active' AND e.removed_at IS NULL`,
  );
  const todayRecords = all("SELECT * FROM attendance WHERE work_date = ?", [today]);
  const marks = marksOn(today);
  const byEmployee = new Map(todayRecords.map((row) => [row.employee_id, row]));
  const exitWatch = exitCameraEnabled();
  const counts = { total: employees.length, onSite: 0, absent: 0, late: 0, left: 0, exitUnconfirmed: 0 };
  const departments = new Map();

  for (const department of all("SELECT id, name FROM departments WHERE archived = 0")) {
    departments.set(department.id, {
      id: department.id,
      name: department.name,
      headcount: 0,
      onSite: 0,
      absent: 0,
      late: 0,
    });
  }

  for (const employee of employees) {
    const record = byEmployee.get(employee.id);
    const evaluation = evaluateAttendance(record, resolveSchedule(employee, settings), {
      kind: dayKind(today, employee.id, settings, marks),
      now: bakuStamp().iso,
      workDate: today,
      flex: policyFor(employee.id, today).flexTime,
    });
    const openStay = Boolean(record?.check_in && !record?.check_out);
    if (openStay && exitWatch) counts.onSite += 1;
    if (openStay && !exitWatch) counts.exitUnconfirmed += 1;
    if (evaluation.status === "absent") counts.absent += 1;
    if (evaluation.lateMinutes > 0) counts.late += 1;
    if (evaluation.status === "left") counts.left += 1;
    const key = employee.department_id || "__none__";
    if (!departments.has(key)) {
      departments.set(key, {
        id: key,
        name: employee.department_name || "",
        headcount: 0,
        onSite: 0,
        absent: 0,
        late: 0,
        unassigned: key === "__none__",
      });
    }
    const bucket = departments.get(key);
    bucket.headcount += 1;
    if (openStay && exitWatch) bucket.onSite += 1;
    if (evaluation.status === "absent") bucket.absent += 1;
    if (evaluation.lateMinutes > 0) bucket.late += 1;
  }

  const start = addDays(today, -13);
  const grouped = all(
    `SELECT work_date, COUNT(DISTINCT employee_id) AS present
     FROM attendance
     WHERE work_date >= ? AND work_date <= ? AND check_in IS NOT NULL
     GROUP BY work_date`,
    [start, today],
  );
  const presentByDate = new Map(grouped.map((row) => [row.work_date, row.present]));
  const series = [];
  for (let cursor = start; cursor <= today; cursor = addDays(cursor, 1)) {
    series.push({ date: cursor, value: presentByDate.get(cursor) || 0 });
  }

  const recent = all(
    `SELECT a.id, a.check_in, a.check_out, a.updated_at,
            e.last_name, e.first_name, e.patronymic, d.name AS department_name
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     ORDER BY a.updated_at DESC
     LIMIT 8`,
  ).map((row) => ({
    id: row.id,
    name: [row.last_name, row.first_name, row.patronymic].filter(Boolean).join(" "),
    departmentName: row.department_name || "",
    kind: row.check_out ? "out" : "in",
    at: row.check_out || row.check_in,
  }));

  const cameras = listCameras();
  const audit = recentAudit(1)[0] || null;
  return {
    counts,
    departments: [...departments.values()]
      .filter((item) => item.id !== "__none__" || item.headcount > 0)
      .sort((a, b) => Number(Boolean(a.unassigned)) - Number(Boolean(b.unassigned)) || a.name.localeCompare(b.name, "az")),
    recent,
    series,
    system: {
      dataMode: settings.dataMode,
      camerasConfigured: cameras.filter((camera) => camera.enabled || camera.host).length,
      cameraCount: cameras.length,
      lastBackup: latestBackupName(),
      lastAudit: audit ? { action: audit.action, at: audit.created_at } : null,
    },
  };
}
