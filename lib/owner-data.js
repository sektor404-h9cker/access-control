import fs from "node:fs";
import path from "node:path";
import { writeAudit } from "./audit.js";
import { createBackup } from "./backup.js";
import { all, get, run, transaction } from "./db.js";
import { removePhoto } from "./photos.js";
import { bakuStamp } from "./time.js";

export const OWNER_SCOPES = ["logs", "recognition", "passages", "attendance", "calendar", "biometrics", "employees"];

function count(sql) {
  return get(sql).count;
}

export function previewOwnerData() {
  return {
    logs: count("SELECT COUNT(*) AS count FROM audit_log"),
    recognition: count("SELECT COUNT(*) AS count FROM recognition_events"),
    passages: count("SELECT COUNT(*) AS count FROM passage_events"),
    attendance: count("SELECT COUNT(*) AS count FROM attendance"),
    calendar: count("SELECT COUNT(*) AS count FROM day_marks"),
    biometrics: count("SELECT COUNT(*) AS count FROM face_templates") + count("SELECT COUNT(*) AS count FROM face_sessions"),
    employees: count("SELECT COUNT(*) AS count FROM employees"),
  };
}

function photosForEmployees() {
  return all("SELECT photo_file FROM employees WHERE photo_file IS NOT NULL").map((row) => row.photo_file);
}

export function clearOwnerData(meta, user, phrase, scopes) {
  if (user?.role !== "owner") return { ok: false, error: "forbidden" };
  if (phrase !== "clear-data") return { ok: false, error: "purge_denied" };
  const chosen = [...new Set(scopes)].filter((scope) => OWNER_SCOPES.includes(scope));
  if (!chosen.length) return { ok: false, error: "invalid" };
  const before = previewOwnerData();
  const affected = chosen.reduce((sum, scope) => sum + before[scope], 0);
  if (!affected) return { ok: true, empty: true, before };
  const folder = createBackup();
  const database = path.join(process.cwd(), folder, "database.db");
  if (!fs.existsSync(database) || fs.statSync(database).size < 1024) return { ok: false, error: "backup_failed" };
  const photos = chosen.includes("employees") ? photosForEmployees() : [];
  transaction(() => {
    if (chosen.includes("employees") || chosen.includes("biometrics")) {
      run("DELETE FROM face_templates");
      run("DELETE FROM face_sessions");
      run("DELETE FROM processing_events");
      run("UPDATE employees SET face_enrolled = 0, updated_at = ?", [bakuStamp().iso]);
    }
    if (chosen.includes("employees") || chosen.includes("passages")) run("DELETE FROM passage_events");
    if (chosen.includes("employees") || chosen.includes("recognition")) {
      run("DELETE FROM recognition_events");
      run("DELETE FROM alert_events");
    }
    if (chosen.includes("employees") || chosen.includes("attendance")) {
      run("DELETE FROM attendance_revisions");
      run("DELETE FROM attendance");
    }
    if (chosen.includes("employees") || chosen.includes("calendar")) run("DELETE FROM day_marks");
    if (chosen.includes("employees")) {
      run("DELETE FROM employee_work_policies");
      run("DELETE FROM employees");
    }
    if (chosen.includes("logs")) run("DELETE FROM audit_log");
  });
  for (const name of photos) removePhoto(name);
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "owner.clear",
    entity: "settings",
    details: { scopes: chosen, before, backup: folder },
    ip: meta.ip,
  });
  return { ok: true, empty: false, before, backup: folder };
}
