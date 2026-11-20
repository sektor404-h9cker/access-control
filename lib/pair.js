import { randomBytes } from "node:crypto";
import { writeAudit } from "./audit.js";
import { get, run } from "./db.js";
import { getEmployeeRow } from "./employees.js";
import { bakuStamp } from "./time.js";

const frames = globalThis.__smzPairFrames || new Map();
globalThis.__smzPairFrames = frames;

function ensure() {
  run(`CREATE TABLE IF NOT EXISTS pairing_sessions (
    token TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL
  )`);
}

export function createPairing(employeeId, meta) {
  const employee = getEmployeeRow(employeeId);
  if (!employee || employee.removed_at || employee.status !== "active") return { ok: false, error: "employee_not_found" };
  if (!employee.biometric_allowed) return { ok: false, error: "biometric_denied" };
  ensure();
  const token = randomBytes(24).toString("hex");
  const now = Date.now();
  const expires = new Date(now + 10 * 60 * 1000).toISOString();
  run(
    "INSERT INTO pairing_sessions (token, employee_id, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
    [token, employee.id, expires, meta.actor?.id || null, bakuStamp().iso],
  );
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "pair.create",
    entity: "employee",
    entityId: employee.id,
    details: { minutes: 10 },
    ip: meta.ip,
  });
  return { ok: true, token, expiresAt: expires };
}

export function readPairing(token) {
  if (!/^[a-f0-9]{48}$/.test(token || "")) return null;
  ensure();
  const row = get("SELECT token, employee_id, expires_at, created_by FROM pairing_sessions WHERE token = ?", [token]);
  if (!row || Date.parse(row.expires_at) < Date.now()) return null;
  const employee = getEmployeeRow(row.employee_id);
  if (!employee || employee.removed_at || employee.status !== "active") return null;
  return {
    token: row.token,
    employeeId: row.employee_id,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    firstName: employee.first_name,
    lastName: employee.last_name,
  };
}

export function endPairing(token) {
  if (!/^[a-f0-9]{48}$/.test(token || "")) return;
  ensure();
  run("DELETE FROM pairing_sessions WHERE token = ?", [token]);
  frames.delete(token);
}

export function storePairFrame(token, bytes) {
  const session = readPairing(token);
  if (!session) return false;
  frames.set(token, { bytes, at: Date.now() });
  return true;
}

export function readPairFrame(token) {
  if (!readPairing(token)) return null;
  const frame = frames.get(token);
  if (!frame || Date.now() - frame.at > 2500) return null;
  return frame.bytes;
}
