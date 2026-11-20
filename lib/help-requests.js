import { randomUUID } from "node:crypto";
import { writeAudit } from "./audit.js";
import { all, get, run } from "./db.js";
import { bakuStamp } from "./time.js";

function ready() {
  run(`CREATE TABLE IF NOT EXISTS help_requests (
    id TEXT PRIMARY KEY,
    camera_id TEXT,
    camera_code TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    confirmed_at TEXT,
    closed_at TEXT,
    actor_username TEXT
  )`);
}

export function createHelpRequest({ cameraId, source }, meta) {
  ready();
  const camera = get("SELECT id, code FROM cameras WHERE id = ?", [String(cameraId || "")]);
  if (!camera || (source !== "gesture" && source !== "button")) return { ok: false, error: "invalid" };
  const existing = get(
    "SELECT id, camera_id, camera_code, source, status, created_at FROM help_requests WHERE camera_id = ? AND status = 'open'",
    [camera.id],
  );
  if (existing) return { ok: true, duplicate: true, request: existing };
  const request = {
    id: randomUUID(),
    cameraId: camera.id,
    cameraCode: camera.code,
    source,
    status: "open",
    createdAt: bakuStamp().iso,
  };
  run(
    `INSERT INTO help_requests (id, camera_id, camera_code, source, status, created_at)
     VALUES (?, ?, ?, ?, 'open', ?)`,
    [request.id, request.cameraId, request.cameraCode, request.source, request.createdAt],
  );
  writeAudit({
    userId: meta?.actor?.id,
    username: meta?.actor?.username,
    action: "help.open",
    entity: "help_request",
    entityId: request.id,
    details: { camera: camera.code, source },
    ip: meta?.ip,
  });
  return { ok: true, request };
}

export function listHelpRequests(limit = 12) {
  ready();
  return all(
    `SELECT id, camera_id, camera_code, source, status, created_at, confirmed_at, closed_at, actor_username
     FROM help_requests
     ORDER BY created_at DESC
     LIMIT ?`,
    [Math.min(Math.max(Number(limit) || 12, 1), 30)],
  );
}

function change(id, from, status, meta, action) {
  ready();
  const row = get("SELECT id, status, camera_code FROM help_requests WHERE id = ?", [String(id || "")]);
  if (!row || !from.includes(row.status)) return { ok: false, error: "invalid" };
  const now = bakuStamp().iso;
  if (status === "confirmed") {
    run("UPDATE help_requests SET status = 'confirmed', confirmed_at = ?, actor_username = ? WHERE id = ?", [now, meta?.actor?.username || "", row.id]);
  } else {
    run("UPDATE help_requests SET status = 'closed', closed_at = ?, actor_username = ? WHERE id = ?", [now, meta?.actor?.username || "", row.id]);
  }
  writeAudit({
    userId: meta?.actor?.id,
    username: meta?.actor?.username,
    action,
    entity: "help_request",
    entityId: row.id,
    details: { camera: row.camera_code },
    ip: meta?.ip,
  });
  return { ok: true };
}

export function confirmHelpRequest(id, meta) {
  return change(id, ["open"], "confirmed", meta, "help.confirm");
}

export function closeHelpRequest(id, meta) {
  return change(id, ["open", "confirmed"], "closed", meta, "help.close");
}
