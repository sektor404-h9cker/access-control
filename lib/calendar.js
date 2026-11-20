import { all, get, run } from "./db.js";
import { writeAudit } from "./audit.js";
import { getSettings } from "./settings.js";
import { bakuStamp } from "./time.js";
import { cleanText } from "./text.js";
import { randomUUID } from "node:crypto";

const PERSONAL = new Set(["vacation", "sick", "trip", "excused"]);
const ORGANIZATION = new Set(["holiday", "work"]);

export function weekdayIndex(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  if (!year || !month || !day) return 0;
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function dayKind(dateKey, employeeId, settings, marks) {
  const personal = marks.find((mark) => mark.employee_id === employeeId && PERSONAL.has(mark.kind));
  if (personal) return personal.kind;
  const shared = marks.filter((mark) => mark.employee_id === "");
  if (shared.some((mark) => mark.kind === "work")) return "work";
  if (shared.some((mark) => mark.kind === "holiday")) return "holiday";
  const weekend = new Set(String(settings.weekendDays || "0,6").split(",").map((item) => item.trim()).filter(Boolean));
  if (weekend.has(String(weekdayIndex(dateKey)))) return "off";
  return "work";
}

export function marksBetween(from, to) {
  return all(
    "SELECT work_date, employee_id, kind, note FROM day_marks WHERE work_date >= ? AND work_date <= ?",
    [from, to],
  );
}

export function marksOn(dateKey) {
  return all(
    "SELECT id, work_date, employee_id, kind, note, created_at FROM day_marks WHERE work_date = ? ORDER BY employee_id, kind",
    [dateKey],
  );
}

export function saveDayMark({ date, employeeId = "", kind, note, meta }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return { ok: false, error: "invalid_time" };
  const personal = employeeId ? String(employeeId) : "";
  if (personal && !PERSONAL.has(kind)) return { ok: false, error: "invalid" };
  if (!personal && !ORGANIZATION.has(kind)) return { ok: false, error: "invalid" };
  if (personal && !get("SELECT id FROM employees WHERE id = ?", [personal])) {
    return { ok: false, error: "employee_not_found" };
  }
  const cleaned = cleanText(note, 200);
  if (!cleaned.ok) return { ok: false, error: "too_long" };
  const now = bakuStamp().iso;
  const existing = get(
    "SELECT id FROM day_marks WHERE work_date = ? AND employee_id = ? AND kind = ?",
    [date, personal, kind],
  );
  if (existing) {
    run("UPDATE day_marks SET note = ?, created_by = ?, created_at = ? WHERE id = ?", [
      cleaned.value, meta.actor?.id || null, now, existing.id,
    ]);
  } else {
    run(
      `INSERT INTO day_marks (id, work_date, employee_id, kind, note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), date, personal, kind, cleaned.value, meta.actor?.id || null, now],
    );
  }
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "day.mark",
    entity: "day_mark",
    entityId: personal || date,
    details: { date, employeeId: personal, kind },
    ip: meta.ip,
  });
  return { ok: true };
}

export function removeDayMark(id, meta) {
  const existing = get("SELECT * FROM day_marks WHERE id = ?", [id]);
  if (!existing) return { ok: false, error: "invalid" };
  run("DELETE FROM day_marks WHERE id = ?", [id]);
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "day.mark",
    entity: "day_mark",
    entityId: existing.employee_id || existing.work_date,
    details: { removed: true, date: existing.work_date, kind: existing.kind },
    ip: meta.ip,
  });
  return { ok: true };
}

export function contextFor(dateKey, employeeId, settings = getSettings(), marks = marksOn(dateKey)) {
  return { kind: dayKind(dateKey, employeeId, settings, marks) };
}
