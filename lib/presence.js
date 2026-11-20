import { all, get, run, transaction } from "./db.js";
import { bakuStamp } from "./time.js";
import { LEAVE_MS } from "./visit-state.js";

const absentSince = new Map();

function directionOf(cameraId) {
  const camera = get("SELECT direction FROM cameras WHERE id = ?", [cameraId]);
  return camera?.direction === "exit" ? "out" : "in";
}

function visitKey(employeeId, cameraId, direction) {
  return `${employeeId}:${cameraId}:${direction}`;
}

// Открытый визит хранится в SQLite. Пока служба не увидела отсутствие дольше LEAVE_MS,
// повторный запуск процесса не создаёт вторую запись того же прохода.
export function claimPresence(employeeId, cameraId, direction, at) {
  return transaction(() => {
    const row = get(
      "SELECT phase, last_seen, event_id FROM presence_visits WHERE employee_id = ? AND camera_id = ? AND direction = ?",
      [employeeId, cameraId, direction],
    );
    const abandoned = row?.phase === "writing" && Date.parse(at) - Date.parse(row.last_seen) > 8000;
    if (row && (row.phase === "present" || (row.phase === "writing" && !abandoned))) {
      return { held: true, eventId: row.event_id || "", at: row.last_seen, reentry: false };
    }
    run(
      `INSERT INTO presence_visits (employee_id, camera_id, direction, phase, last_seen, event_id)
       VALUES (?, ?, ?, 'writing', ?, NULL)
       ON CONFLICT(employee_id, camera_id, direction) DO UPDATE SET phase = 'writing', last_seen = excluded.last_seen, event_id = NULL`,
      [employeeId, cameraId, direction, at],
    );
    return { held: false, eventId: "", at, reentry: !row || row.phase === "left" || abandoned };
  });
}

export function finishPresence(employeeId, cameraId, direction, at, eventId) {
  run(
    "UPDATE presence_visits SET phase = 'present', last_seen = ?, event_id = ? WHERE employee_id = ? AND camera_id = ? AND direction = ?",
    [at, eventId || null, employeeId, cameraId, direction],
  );
  absentSince.delete(visitKey(employeeId, cameraId, direction));
}

export function releasePresence(employeeId, cameraId, direction) {
  run(
    "UPDATE presence_visits SET phase = 'left', event_id = NULL WHERE employee_id = ? AND camera_id = ? AND direction = ? AND phase = 'writing'",
    [employeeId, cameraId, direction],
  );
}

export function notePresence(cameraId, employeeIds, pendingFaces = 0, now = Date.now()) {
  const direction = directionOf(cameraId);
  const seen = new Set((Array.isArray(employeeIds) ? employeeIds : []).filter(Boolean));
  const stamp = bakuStamp(new Date(now)).iso;
  const visits = all(
    "SELECT employee_id, phase, last_seen FROM presence_visits WHERE camera_id = ? AND direction = ? AND phase IN ('present', 'writing')",
    [cameraId, direction],
  );
  for (const row of visits) {
    const key = visitKey(row.employee_id, cameraId, direction);
    if (seen.has(row.employee_id)) {
      absentSince.delete(key);
      run(
        "UPDATE presence_visits SET last_seen = ? WHERE employee_id = ? AND camera_id = ? AND direction = ?",
        [stamp, row.employee_id, cameraId, direction],
      );
      continue;
    }
    if (pendingFaces > 0) continue;
    if (row.phase === "writing" && now - Date.parse(row.last_seen) > 8000) {
      run(
        "UPDATE presence_visits SET phase = 'left', event_id = NULL WHERE employee_id = ? AND camera_id = ? AND direction = ?",
        [row.employee_id, cameraId, direction],
      );
      absentSince.delete(key);
      continue;
    }
    const started = absentSince.get(key);
    if (!started) {
      absentSince.set(key, now);
      continue;
    }
    if (now - started >= LEAVE_MS) {
      run(
        "UPDATE presence_visits SET phase = 'left' WHERE employee_id = ? AND camera_id = ? AND direction = ? AND phase = 'present'",
        [row.employee_id, cameraId, direction],
      );
      absentSince.delete(key);
    }
  }
}
