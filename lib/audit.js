import { randomUUID } from "node:crypto";
import { all, run } from "./db.js";
import { bakuStamp } from "./time.js";

export function writeAudit({
  userId = null,
  username = null,
  action,
  entity = null,
  entityId = null,
  details = null,
  ip = null,
}) {
  const payload = details ? JSON.stringify(details).slice(0, 2000) : null;
  run(
    `INSERT INTO audit_log (id, user_id, username, action, entity, entity_id, details, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), userId, username, action, entity, entityId, payload, ip, bakuStamp().iso],
  );
}

export function auditForEntity(entity, entityId, limit = 20) {
  const size = Math.min(Math.max(Number(limit) || 20, 1), 50);
  return all(
    `SELECT id, username, action, entity, entity_id, ip, created_at
     FROM audit_log
     WHERE entity = ? AND entity_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [entity, entityId, size],
  );
}

export function recentAudit(limit = 40) {
  const size = Math.min(Math.max(Number(limit) || 40, 1), 100);
  return all(
    `SELECT id, username, action, entity, entity_id, ip, created_at
     FROM audit_log
     ORDER BY created_at DESC
     LIMIT ?`,
    [size],
  );
}
