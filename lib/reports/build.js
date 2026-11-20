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
      rows.push({
        sortDate: date,
        employeeId: employee.id,
        date: formatDateKey(date),
        employee: [employee.last_name, employee.first_name, employee.patronymic].filter(Boolean).join(" "),
        department: employee.report_department || employee.department_name || dict.dashboard.noDepartment,
        checkIn: record?.check_in ? clockFromIso(record.check_in) : "—",
        checkOut: record?.check_out ? clockFromIso(record.check_out) : "—",
        duration: formatDuration(evaluation.durationMinutes),
        late: formatMinutes(evaluation.lateMinutes, dict.common.minutes),
        early: formatMinutes(evaluation.earlyMinutes, dict.common.minutes),
        status: statusLabel(evaluation.status, dict),
        absent: evaluation.status === "absent",
        wasLate: evaluation.lateMinutes > 0,
        wasEarly: evaluation.earlyMinutes > 0,
      });
    }
  }
  rows.sort((a, b) => b.sortDate.localeCompare(a.sortDate) || a.employee.localeCompare(b.employee, "az"));
  return {
    enterprise: settings.enterpriseName,
    title: dict.reports.title,
    periodLabel,
    generatedAt: bakuStamp().iso,
    weekendNote: dict.reports.weekendNote,
    columns: [
      { key: "date", label: dict.reports.colDate, width: 68 },
      { key: "employee", label: dict.reports.colEmployee, width: 170 },
      { key: "department", label: dict.reports.colDepartment, width: 130 },
      { key: "checkIn", label: dict.reports.colIn, width: 52 },
      { key: "checkOut", label: dict.reports.colOut, width: 52 },
      { key: "duration", label: dict.reports.colDuration, width: 58 },
      { key: "late", label: dict.reports.colLate, width: 58 },
      { key: "early", label: dict.reports.colEarly, width: 70 },
      { key: "status", label: dict.reports.colStatus, width: 77 },
    ],
    rows,
    summary: {
      employees: new Set(rows.map((row) => row.employeeId)).size,
      present: rows.filter((row) => row.checkIn !== "—").length,
      absent: rows.filter((row) => row.absent).length,
      late: rows.filter((row) => row.wasLate).length,
      early: rows.filter((row) => row.wasEarly).length,
    },
  };
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
    ].join(" · "),
  };
}
