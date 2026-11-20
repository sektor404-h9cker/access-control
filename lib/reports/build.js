import { all } from "../db.js";
import { evaluateAttendance } from "../attendance.js";
import { dayKind, marksBetween } from "../calendar.js";
import { passageDuration } from "../passages.js";
import { resolveSchedule } from "../schedule.js";
import { getSettings } from "../settings.js";
import { policyFor } from "../work-policy.js";
import {
  bakuStamp,
  clockFromIso,
  eachDate,
  formatDateKey,
  formatDateTime,
  formatDuration,
  formatMinutes,
} from "../time.js";

function statusLabel(status, dict) {
  if (status === "on_site") return dict.attendance.statusOnSite;
  if (status === "late") return dict.attendance.statusLate;
  if (status === "left") return dict.attendance.statusLeft;
  if (status === "off") return dict.attendance.statusOff;
  if (status === "holiday") return dict.attendance.statusHoliday;
  if (status === "vacation") return dict.attendance.statusVacation;
  if (status === "sick") return dict.attendance.statusSick;
  if (status === "trip") return dict.attendance.statusTrip;
  if (status === "excused") return dict.attendance.statusExcused;
  if (status === "pending") return dict.attendance.statusPending;
  if (status === "flex") return dict.attendance.statusFlex;
  return dict.attendance.statusAbsent;
}

export function buildReport({ from, to, employeeId = "", departmentId = "", dict, periodLabel }) {
  const settings = getSettings();
  const clauses = ["1 = 1"];
  const params = [];
  if (employeeId) {
    clauses.push("e.id = ?");
    params.push(employeeId);
  }
  if (departmentId === "__none__") clauses.push("e.department_id IS NULL");
  else if (departmentId) {
    clauses.push("e.department_id = ?");
    params.push(departmentId);
  }
  const employees = all(
    `SELECT e.*, d.name AS department_name, d.schedule_start AS dept_start,
            d.schedule_end AS dept_end, d.grace_minutes AS dept_grace
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE ${clauses.join(" AND ")}`,
    params,
  );
  const records = all("SELECT * FROM attendance WHERE work_date >= ? AND work_date <= ?", [from, to]);
  const byKey = new Map(records.map((row) => [`${row.employee_id}|${row.work_date}`, row]));
  const passageCounts = new Map(all(
    `SELECT employee_id, work_date, COUNT(*) AS count
     FROM passage_events
     WHERE work_date >= ? AND work_date <= ? AND applied IN ('applied', 'return', 'repeat')
     GROUP BY employee_id, work_date`,
    [from, to],
  ).map((row) => [`${row.employee_id}|${row.work_date}`, row.count]));
  const marks = marksBetween(from, to);
  const marksByDate = new Map();
  for (const mark of marks) {
    const list = marksByDate.get(mark.work_date) || [];
    list.push(mark);
    marksByDate.set(mark.work_date, list);
  }
  const rows = [];
  for (const date of eachDate(from, to)) {
    for (const employee of employees) {
      const record = byKey.get(`${employee.id}|${date}`) || null;
      const evaluation = evaluateAttendance(record, resolveSchedule(employee, settings), {
        kind: dayKind(date, employee.id, settings, marksByDate.get(date) || []),
        now: bakuStamp().iso,
        workDate: date,
        flex: policyFor(employee.id, date).flexTime,
      });
      const worked = passageDuration(employee.id, date);
      if (worked !== undefined) evaluation.durationMinutes = worked;
      if (!record?.check_in && (employee.removed_at || employee.status !== "active")) continue;
      const exitMissing = Boolean(record?.check_in && !record?.check_out);
      const schedule = resolveSchedule(employee, settings);
      rows.push({
        sortDate: date,
        employeeId: employee.id,
        date: formatDateKey(date),
        personnel: employee.personnel_number || "—",
        employee: [employee.last_name, employee.first_name, employee.patronymic].filter(Boolean).join(" "),
        department: employee.report_department || employee.department_name || dict.dashboard.noDepartment,
        position: employee.position || "—",
        planned: schedule.start || "—",
        checkIn: record?.check_in ? clockFromIso(record.check_in) : "—",
        checkOut: record?.check_out ? clockFromIso(record.check_out) : exitMissing ? dict.reports.exitMissing : "—",
        duration: formatDuration(evaluation.durationMinutes),
        late: formatMinutes(evaluation.lateMinutes, dict.common.minutes),
        early: formatMinutes(evaluation.earlyMinutes, dict.common.minutes),
        status: statusLabel(evaluation.status, dict),
        absent: evaluation.status === "absent",
        wasLate: evaluation.lateMinutes > 0,
        wasEarly: evaluation.earlyMinutes > 0,
        exitMissing,
        durationMinutes: evaluation.durationMinutes,
        lateMinutes: evaluation.lateMinutes,
        earlyMinutes: evaluation.earlyMinutes,
        passages: passageCounts.get(`${employee.id}|${date}`) || 0,
      });
    }
  }
  rows.sort((a, b) => b.sortDate.localeCompare(a.sortDate) || a.employee.localeCompare(b.employee, "az"));
  const monthly = monthlyRows(rows, dict);
  const departments = departmentRows(rows);
  return {
    enterprise: settings.enterpriseName,
    title: dict.reports.title,
    periodLabel,
    generatedAt: bakuStamp().iso,
    weekendNote: dict.reports.weekendNote,
    columns: [
      { key: "date", label: dict.reports.colDate, width: 52 },
      { key: "personnel", label: dict.reports.colPersonnel, width: 46 },
      { key: "employee", label: dict.reports.colEmployee, width: 100 },
      { key: "department", label: dict.reports.colDepartment, width: 80 },
      { key: "position", label: dict.reports.colPosition, width: 60 },
      { key: "planned", label: dict.reports.colPlanned, width: 40 },
      { key: "checkIn", label: dict.reports.colIn, width: 40 },
      { key: "checkOut", label: dict.reports.colOut, width: 110 },
      { key: "duration", label: dict.reports.colDuration, width: 48 },
      { key: "late", label: dict.reports.colLate, width: 44 },
      { key: "early", label: dict.reports.colEarly, width: 48 },
      { key: "status", label: dict.reports.colStatus, width: 109 },
    ],
    rows,
    summary: {
      employees: new Set(rows.map((row) => row.employeeId)).size,
      present: rows.filter((row) => row.checkIn !== "—").length,
      absent: rows.filter((row) => row.absent).length,
      late: rows.filter((row) => row.wasLate).length,
      early: rows.filter((row) => row.wasEarly).length,
      incomplete: rows.filter((row) => row.exitMissing).length,
      passages: rows.reduce((sum, row) => sum + row.passages, 0),
      confirmedMinutes: rows.reduce((sum, row) => sum + (Number.isFinite(row.durationMinutes) ? row.durationMinutes : 0), 0),
    },
    monthly,
    departments,
  };
}

function monthlyRows(rows, dict) {
  const grouped = new Map();
  for (const row of rows) {
    const item = grouped.get(row.employeeId) || {
      employeeId: row.employeeId,
      employee: row.employee,
      department: row.department,
      planned: 0,
      present: 0,
      absent: 0,
      late: 0,
      lateMinutes: 0,
      early: 0,
      confirmedMinutes: 0,
      incomplete: 0,
      passages: 0,
    };
    const excused = [dict.attendance.statusOff, dict.attendance.statusHoliday, dict.attendance.statusVacation, dict.attendance.statusSick, dict.attendance.statusTrip, dict.attendance.statusExcused].includes(row.status);
    if (!excused) item.planned += 1;
    if (row.checkIn !== "—") item.present += 1;
    if (row.absent) item.absent += 1;
    if (row.wasLate) item.late += 1;
    item.lateMinutes += row.lateMinutes || 0;
    if (row.wasEarly) item.early += 1;
    if (Number.isFinite(row.durationMinutes)) item.confirmedMinutes += row.durationMinutes;
    if (row.exitMissing) item.incomplete += 1;
    item.passages += row.passages;
    grouped.set(row.employeeId, item);
  }
  return [...grouped.values()].sort((a, b) => a.employee.localeCompare(b.employee, "az"));
}

function departmentRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const item = grouped.get(row.department) || {
      department: row.department,
      employees: new Set(),
      present: new Set(),
      absent: 0,
      late: 0,
      incomplete: 0,
      confirmedMinutes: 0,
    };
    item.employees.add(row.employeeId);
    if (row.checkIn !== "—") item.present.add(row.employeeId);
    if (row.absent) item.absent += 1;
    if (row.wasLate) item.late += 1;
    if (row.exitMissing) item.incomplete += 1;
    if (Number.isFinite(row.durationMinutes)) item.confirmedMinutes += row.durationMinutes;
    grouped.set(row.department, item);
  }
  return [...grouped.values()].map((item) => ({
    department: item.department,
    employees: item.employees.size,
    present: item.present.size,
    absent: item.absent,
    late: item.late,
    incomplete: item.incomplete,
    confirmedMinutes: item.confirmedMinutes,
  })).sort((a, b) => a.department.localeCompare(b.department, "az"));
}

export function presentReport(report, dict, locale) {
  return {
    ...report,
    emptyLabel: dict.reports.empty,
    generatedAtLabel: `${dict.reports.generated}: ${formatDateTime(report.generatedAt, locale)}`,
    summaryLabel: [
      `${dict.reports.summaryEmployees}: ${report.summary.employees}`,
      `${dict.reports.summaryPresent}: ${report.summary.present}`,
      `${dict.reports.summaryAbsent}: ${report.summary.absent}`,
      `${dict.reports.summaryLate}: ${report.summary.late}`,
      `${dict.reports.summaryEarly}: ${report.summary.early}`,
      `${dict.reports.summaryIncomplete}: ${report.summary.incomplete}`,
    ].join(" · "),
  };
}
