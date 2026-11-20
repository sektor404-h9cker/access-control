import { randomUUID } from "node:crypto";
import { all, get, run } from "./db.js";
import { bakuStamp, isTime, timeToMinutes } from "./time.js";
import { cleanText } from "./text.js";
import { writeAudit } from "./audit.js";

export function getSettings() {
  const rows = all("SELECT key, value FROM settings");
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    enterpriseName: map.enterprise_name || "Suraxanı Maşınqayırma Zavodu",
    workdayStart: map.workday_start || "08:15",
    workdayEnd: map.workday_end || "16:30",
    graceMinutes: Number(map.grace_minutes ?? 0),
    weekendDays: map.weekend_days || "0,6",
    dataMode: map.data_mode === "demo" ? "demo" : "production",
    recognitionMode: map.recognition_mode === "pilot" ? "pilot" : map.recognition_mode === "diagnostic" ? "diagnostic" : "review",
    recognitionPace: map.recognition_pace === "close" ? "close" : "motion",
    autoAttendance: map.auto_attendance !== "0",
    dashboardCameras: map.dashboard_cameras !== "0",
    dashboardCameraLayout: map.dashboard_camera_layout === "expanded" ? "expanded" : "compact",
  };
}

export function updateRecognitionMode(mode, meta, pace, auto = true) {
  const value = mode === "pilot" ? "pilot" : mode === "diagnostic" ? "diagnostic" : "review";
  const walking = pace === "close" ? "close" : "motion";
  const now = bakuStamp().iso;
  const save = (key, stored) => run(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [key, stored, now],
  );
  save("recognition_mode", value);
  save("recognition_pace", walking);
  save("auto_attendance", auto === false ? "0" : "1");
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "recognition.mode",
    entity: "settings",
    details: { mode: value, livenessCertified: false },
    ip: meta.ip,
  });
  return { ok: true, mode: value };
}

export function updateDashboardCameras(input, meta) {
  const current = getSettings();
  const visible = input.visible == null ? current.dashboardCameras : Boolean(input.visible);
  const layout = input.layout === "expanded" || input.layout === "compact" ? input.layout : current.dashboardCameraLayout;
  const now = bakuStamp().iso;
  const save = (key, value) => run(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [key, value, now],
  );
  save("dashboard_cameras", visible ? "1" : "0");
  save("dashboard_camera_layout", layout);
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "dashboard.cameras",
    entity: "settings",
    details: { visible, layout },
    ip: meta.ip,
  });
  return { ok: true, visible, layout };
}

export function updateOrganization(input, meta) {
  const name = cleanText(input.enterpriseName, 120);
  const start = String(input.workdayStart || "").trim();
  const end = String(input.workdayEnd || "").trim();
  const graceText = String(input.graceMinutes ?? "").trim();
  const fields = {};
  if (!name.ok || name.value.length < 2) fields.enterprise_name = name.ok ? "required" : "too_long";
  if (!isTime(start)) fields.workday_start = "invalid_time";
  if (!isTime(end)) fields.workday_end = "invalid_time";
  if (isTime(start) && isTime(end) && timeToMinutes(start) === timeToMinutes(end)) {
    fields.workday_end = "invalid_time";
  }
  if (!/^\d{1,3}$/.test(graceText) || Number(graceText) > 180) fields.grace_minutes = "invalid_time";
  if (Object.keys(fields).length) return { ok: false, error: "invalid", fields };

  const now = bakuStamp().iso;
  const save = (key, value) => run("UPDATE settings SET value = ?, updated_at = ? WHERE key = ?", [value, now, key]);
  save("enterprise_name", name.value);
  save("workday_start", start);
  save("workday_end", end);
  save("grace_minutes", String(Number(graceText)));
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "settings.update",
    entity: "settings",
    details: { enterpriseName: name.value, workdayStart: start, workdayEnd: end, graceMinutes: Number(graceText) },
    ip: meta.ip,
  });
  return { ok: true };
}

function cleanDeviceId(value) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text.length > 256 ? "" : text;
}

export function exitCameraEnabled() {
  return listCameras().some((camera) => camera.enabled && camera.direction === "exit");
}

export function listCameras() {
  return all(
    "SELECT id, code, direction, enabled, host, source_kind, device_label, device_id, updated_at FROM cameras ORDER BY code",
  ).map((row) => ({
    id: row.id,
    code: row.code,
    direction: row.direction,
    enabled: Boolean(row.enabled),
    host: row.host || "",
    sourceKind: row.source_kind === "ip" ? "ip" : "usb",
    deviceLabel: row.device_label || "",
    deviceId: row.device_id || "",
    updatedAt: row.updated_at,
  }));
}

export function updateCamera(input, meta) {
  const camera = get("SELECT id, code, direction FROM cameras WHERE id = ?", [input.id]);
  if (!camera) return { ok: false, error: "invalid" };
  const sourceKind = input.source === "ip" ? "ip" : "usb";
  const host = sourceKind === "ip" ? String(input.host ?? "").trim() : "";
  if (sourceKind === "ip" && !/^[a-zA-Z0-9.\-:]{1,120}$/.test(host)) {
    return { ok: false, error: "invalid", fields: { host: "invalid" } };
  }
  const label = cleanText(input.deviceLabel, 120);
  if (!label.ok) return { ok: false, error: "too_long", fields: { device_label: "too_long" } };
  const deviceId = sourceKind === "usb" ? cleanDeviceId(input.deviceId) : "";
  const enabled = input.enabled ? 1 : 0;
  const direction = input.direction === "exit" || input.direction === "entrance" ? input.direction : camera.direction;
  const now = bakuStamp().iso;
  let released = "";
  if (enabled && sourceKind === "usb" && deviceId) {
    const other = get(
      "SELECT id, code FROM cameras WHERE id <> ? AND enabled = 1 AND device_id = ?",
      [input.id, deviceId],
    );
    if (other && !input.takeover) return { ok: false, error: "camera_busy", otherCode: other.code };
    if (other) {
      run(
        "UPDATE cameras SET enabled = 0, device_id = '', device_label = '', updated_at = ? WHERE id = ?",
        [now, other.id],
      );
      released = other.code;
    }
  }
  run(
    `UPDATE cameras
     SET host = ?, enabled = ?, source_kind = ?, device_label = ?, device_id = ?, direction = ?, updated_at = ?
     WHERE id = ?`,
    [host, enabled, sourceKind, label.value, deviceId, direction, now, input.id],
  );
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "camera.update",
    entity: "camera",
    entityId: input.id,
    details: { sourceKind, host, deviceLabel: label.value, enabled: Boolean(enabled), direction, released },
    ip: meta.ip,
  });
  run(
    `INSERT INTO processing_events (id, camera_id, employee_id, kind, note, created_at)
     VALUES (?, ?, NULL, 'camera.assigned', ?, ?)`,
    [randomUUID(), input.id, sourceKind, bakuStamp().iso],
  );
  return { ok: true };
}
