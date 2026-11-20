const TIME_ZONE = "Asia/Baku";

export function bakuStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value || "00";
  const year = read("year");
  const month = read("month");
  const day = read("day");
  let hour = read("hour");
  if (hour === "24") hour = "00";
  const minute = read("minute");
  const second = read("second");
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    iso: `${year}-${month}-${day}T${hour}:${minute}:${second}+04:00`,
  };
}

export function todayKey(date = new Date()) {
  return bakuStamp(date).date;
}

export function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "");
}

export function timeToMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T12:00:00+04:00`);
  date.setUTCDate(date.getUTCDate() + amount);
  return bakuStamp(date).date;
}

export function eachDate(from, to) {
  const dates = [];
  let cursor = from;
  while (cursor <= to && dates.length <= 366) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function startOfWeek(dateKey) {
  const utcDay = new Date(`${dateKey}T12:00:00+04:00`).getUTCDay();
  const offset = utcDay === 0 ? 6 : utcDay - 1;
  return addDays(dateKey, -offset);
}

export function endOfMonth(dateKey) {
  const [year, month] = dateKey.split("-").map(Number);
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return addDays(next, -1);
}

export function isBakuIso(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+04:00$/.test(value || "") && isDateKey(value.slice(0, 10)) && isTime(value.slice(11, 16));
}

export function fromLocalInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || "")) return null;
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  if (!isDateKey(date) || !isTime(time)) return null;
  return `${date}T${time}:00+04:00`;
}

export function localInputFromIso(iso) {
  const match = String(iso || "").match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return match ? match[1] : "";
}

export function clockFromIso(iso) {
  const match = String(iso || "").match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "—";
}

export function minutesFromIso(iso) {
  const match = String(iso || "").match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatDateKey(dateKey) {
  if (!isDateKey(dateKey)) return "—";
  const [year, month, day] = dateKey.split("-");
  return `${day}.${month}.${year}`;
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const stamp = bakuStamp(date);
  const [year, month, day] = stamp.date.split("-");
  return `${day}.${month}.${year} ${stamp.time}`;
}

export function formatDuration(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return "—";
  const absolute = Math.abs(Math.round(minutes));
  const hours = Math.floor(absolute / 60);
  const rest = absolute % 60;
  return `${hours}:${String(rest).padStart(2, "0")}`;
}

export function formatMinutes(minutes, unit) {
  if (!minutes) return "—";
  return `${minutes} ${unit}`;
}

export function resolvePeriod(input, today = todayKey()) {
  const period = input?.period || "today";
  if (period === "yesterday") {
    const date = addDays(today, -1);
    return { period, from: date, to: date };
  }
  if (period === "week") {
    const from = startOfWeek(today);
    return { period, from, to: addDays(from, 6) };
  }
  if (period === "month") {
    return { period, from: `${today.slice(0, 8)}01`, to: endOfMonth(today) };
  }
  if (period === "custom") {
    const from = String(input.from || "");
    const to = String(input.to || "");
    if (!isDateKey(from) || !isDateKey(to) || from > to) return { error: "invalid_range" };
    if (eachDate(from, to).length > 366) return { error: "range_too_long" };
    return { period, from, to };
  }
  return { period: "today", from: today, to: today };
}
