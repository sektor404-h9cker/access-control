import { addDays, isTime, timeToMinutes } from "./time.js";

export function parseScheduleOverride(startRaw, endRaw, graceRaw) {
  const start = String(startRaw ?? "").trim();
  const end = String(endRaw ?? "").trim();
  const graceText = String(graceRaw ?? "").trim();
  let grace = null;

  if (graceText !== "") {
    if (!/^\d{1,3}$/.test(graceText)) return { ok: false, error: "invalid_time" };
    grace = Number(graceText);
    if (grace > 180) return { ok: false, error: "invalid_time" };
  }

  if (!start && !end) return { ok: true, start: null, end: null, grace };
  if (!isTime(start) || !isTime(end) || timeToMinutes(start) === timeToMinutes(end)) {
    return { ok: false, error: "invalid_time" };
  }
  return { ok: true, start, end, grace };
}

export function crossesMidnight(schedule) {
  return Boolean(schedule?.start && schedule?.end && timeToMinutes(schedule.end) < timeToMinutes(schedule.start));
}

export function passageWorkDate(iso, schedule) {
  const date = String(iso || "").slice(0, 10);
  if (!crossesMidnight(schedule)) return date;
  const minutes = timeToMinutes(String(iso).slice(11, 16));
  if (minutes < timeToMinutes(schedule.end)) return addDays(date, -1);
  return date;
}

export function shiftHasEnded(workDate, schedule, nowIso) {
  if (!workDate || !schedule?.end || !nowIso) return true;
  const endDate = crossesMidnight(schedule) ? addDays(workDate, 1) : workDate;
  return nowIso >= `${endDate}T${schedule.end}:00+04:00`;
}

export function resolveSchedule(row, settings) {
  const start = row.schedule_start || row.dept_start || settings.workdayStart;
  const end = row.schedule_end || row.dept_end || settings.workdayEnd;
  const grace = row.grace_minutes ?? row.dept_grace ?? settings.graceMinutes;
  return {
    start,
    end,
    grace: Number.isInteger(grace) ? grace : Number(grace) || 0,
  };
}
