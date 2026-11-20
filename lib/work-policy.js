import { randomUUID } from "node:crypto";
import { writeAudit } from "./audit.js";
import { get, run } from "./db.js";
import { can } from "./permissions.js";
import { bakuStamp } from "./time.js";

function parseDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  if (text < "2024-01-01" || text > "2035-12-31") return "";
  return text;
}

export function policyFor(employeeId, date) {
  const row = get(
    `SELECT leadership, flex_time, effective_from
     FROM employee_work_policies
     WHERE employee_id = ? AND effective_from <= ?
     ORDER BY effective_from DESC, created_at DESC
     LIMIT 1`,
    [employeeId, date],
  );
  if (!row || row.leadership !== 1) return { leadership: false, flexTime: false, effectiveFrom: row?.effective_from || "" };
  return { leadership: true, flexTime: row.flex_time === 1, effectiveFrom: row.effective_from };
}

export function saveWorkPolicy(input, meta, user) {
  if (!can(user, "employees.policy")) return { ok: false, error: "forbidden" };
  const employee = get("SELECT id FROM employees WHERE id = ?", [input.employeeId]);
  if (!employee) return { ok: false, error: "employee_not_found" };
  const effectiveFrom = parseDate(input.effectiveFrom);
  if (!effectiveFrom) return { ok: false, error: "invalid" };
  const leadership = input.leadership ? 1 : 0;
  const flexTime = leadership && input.flexTime ? 1 : 0;
  const now = bakuStamp().iso;
  run(
    `INSERT INTO employee_work_policies (id, employee_id, leadership, flex_time, effective_from, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), input.employeeId, leadership, flexTime, effectiveFrom, meta.actor?.id || null, now],
  );
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "employee.policy",
    entity: "employee",
    entityId: input.employeeId,
    details: { leadership: leadership === 1, flexTime: flexTime === 1, effectiveFrom },
    ip: meta.ip,
  });
  return { ok: true, leadership: leadership === 1, flexTime: flexTime === 1, effectiveFrom };
}
