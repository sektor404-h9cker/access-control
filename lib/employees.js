import { randomUUID } from "node:crypto";
import { all, get, run, transaction } from "./db.js";
import { bakuStamp } from "./time.js";
import { cleanText, fold, isPhone } from "./text.js";
import { parseScheduleOverride } from "./schedule.js";
import { deleteEmployeeTemplates } from "./face-store.js";
import { removePhoto, savePhoto } from "./photos.js";
import { writeAudit } from "./audit.js";
import { MODEL_ID } from "./face-match.js";

const EMPLOYEE_SQL = `
  SELECT e.*,
         d.name AS department_name,
         d.schedule_start AS dept_start,
         d.schedule_end AS dept_end,
         d.grace_minutes AS dept_grace,
         (SELECT COUNT(*) FROM face_templates ft WHERE ft.employee_id = e.id AND ft.active = 1 AND ft.model = '${MODEL_ID}') AS current_templates
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
`;

export function presentEmployee(employee, sensitive) {
  if (sensitive) return employee;
  return { ...employee, photoUrl: null, faceStatus: null };
}

export function mapEmployee(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    patronymic: row.patronymic || "",
    departmentId: row.department_id,
    departmentName: row.department_name || "",
    position: row.position || "",
    personnelNumber: row.personnel_number,
    phone: row.phone || "",
    photoUrl: row.photo_file ? `/api/employees/${row.id}/photo` : null,
    faceStatus: row.face_status || "none",
    biometricAllowed: row.biometric_allowed === 1,
    faceEnrolled: row.face_enrolled === 1,
    faceCurrent: Number(row.current_templates) > 0,
    scheduleStart: row.schedule_start,
    scheduleEnd: row.schedule_end,
    graceMinutes: row.grace_minutes,
    status: row.status,
    schedule_start: row.schedule_start,
    schedule_end: row.schedule_end,
    grace_minutes: row.grace_minutes,
    dept_start: row.dept_start,
    dept_end: row.dept_end,
    dept_grace: row.dept_grace,
  };
}

function searchText(employee) {
  return fold(
    [employee.lastName, employee.firstName, employee.patronymic, employee.position, employee.phone]
      .filter(Boolean)
      .join(" "),
  );
}

export function getEmployeeRow(id) {
  return get(`${EMPLOYEE_SQL} WHERE e.id = ?`, [id]);
}

export function listEmployees({ q = "", departmentId = "", status = "active" } = {}) {
  const clauses = ["e.removed_at IS NULL"];
  const params = [];
  if (status === "active" || status === "archived") {
    clauses.push("e.status = ?");
    params.push(status);
  }
  if (departmentId === "__none__") clauses.push("e.department_id IS NULL");
  else if (departmentId) {
    clauses.push("e.department_id = ?");
    params.push(departmentId);
  }
  const needle = fold(q).replaceAll("%", "").replaceAll("_", "");
  if (needle) {
    clauses.push("e.search_text LIKE ?");
    params.push(`%${needle}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all(`${EMPLOYEE_SQL} ${where}`, params)
    .map(mapEmployee)
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "az") || a.firstName.localeCompare(b.firstName, "az"));
}

export function listEmployeeRows() {
  return all(`${EMPLOYEE_SQL} WHERE e.status = 'active' AND e.removed_at IS NULL`);
}

function validate(input) {
  const lastName = cleanText(input.lastName, 80);
  const firstName = cleanText(input.firstName, 80);
  const patronymic = cleanText(input.patronymic, 80);
  const position = cleanText(input.position, 80);
  const phone = cleanText(input.phone, 32);
  const personnel = cleanText(input.personnelNumber, 32);
  const schedule = parseScheduleOverride(input.scheduleStart, input.scheduleEnd, input.graceMinutes);
  const fields = {};
  if (!lastName.ok || !lastName.value) fields.last_name = lastName.ok ? "required" : "too_long";
  if (!firstName.ok || !firstName.value) fields.first_name = firstName.ok ? "required" : "too_long";
  if (!patronymic.ok) fields.patronymic = "too_long";
  if (!position.ok) fields.position = "too_long";
  if (!personnel.ok) fields.personnel_number = "too_long";
  if (!phone.ok || !isPhone(phone.value)) fields.phone = phone.ok ? "invalid" : "too_long";
  if (!schedule.ok) fields.schedule_start = schedule.error;
  if (input.departmentId) {
    const department = get("SELECT id, archived FROM departments WHERE id = ?", [input.departmentId]);
    if (!department) fields.department_id = "department_not_found";
    else if (department.archived && department.id !== input.currentDepartmentId) fields.department_id = "department_not_found";
  }
  return {
    fields,
    value: {
      lastName: lastName.value,
      firstName: firstName.value,
      patronymic: patronymic.value,
      position: position.value,
      phone: phone.value,
      personnelNumber: personnel.value,
      departmentId: input.departmentId || null,
      schedule,
    },
  };
}

function nextPersonnelNumber() {
  const rows = all("SELECT personnel_number FROM employees");
  let width = 3;
  let max = 0;
  for (const row of rows) {
    if (/^\d+$/.test(row.personnel_number)) {
      width = Math.max(width, row.personnel_number.length);
      max = Math.max(max, Number(row.personnel_number));
    }
  }
  let next = max + 1;
  let candidate = String(next).padStart(width, "0");
  while (get("SELECT id FROM employees WHERE personnel_number = ? COLLATE NOCASE", [candidate])) {
    next += 1;
    candidate = String(next).padStart(width, "0");
  }
  return candidate;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function employeesCsv() {
  const header = ["id", "personnel_number", "last_name", "first_name", "patronymic", "department", "position", "phone"];
  const lines = [header.join(",")];
  for (const employee of listEmployees({ status: "all" })) {
    lines.push([
      employee.id,
      employee.personnelNumber,
      employee.lastName,
      employee.firstName,
      employee.patronymic,
      employee.departmentName || "",
      employee.position,
      employee.phone,
    ].map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => String(value).trim()));
}

export function importEmployees(text, meta, abilities) {
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false, error: "import_failed" };
  const header = table[0].map((item) => item.trim().toLowerCase());
  const index = Object.fromEntries(header.map((name, position) => [name, position]));
  for (const key of ["last_name", "first_name"]) {
    if (index[key] === undefined) return { ok: false, error: "import_failed" };
  }
  const departments = all("SELECT id, name FROM departments");
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const line of table.slice(1)) {
    const cell = (key) => (index[key] === undefined ? "" : line[index[key]] || "");
    const id = cell("id").trim();
    const personnel = cell("personnel_number").trim();
    let existingRow = null;
    if (id) {
      existingRow = getEmployeeRow(id);
      if (!existingRow) {
        skipped += 1;
        continue;
      }
    } else if (personnel) {
      const found = get("SELECT id FROM employees WHERE personnel_number = ? COLLATE NOCASE", [personnel]);
      existingRow = found ? getEmployeeRow(found.id) : null;
    }
    const departmentName = cell("department").trim();
    const department = departmentName
      ? departments.find((item) => fold(item.name) === fold(departmentName))
      : null;
    if (departmentName && !department) {
      skipped += 1;
      continue;
    }
    if (existingRow && !abilities.update) {
      skipped += 1;
      continue;
    }
    if (!existingRow && !abilities.create) {
      skipped += 1;
      continue;
    }
    const result = saveEmployee({
      id: existingRow?.id || "",
      lastName: cell("last_name"),
      firstName: cell("first_name"),
      patronymic: cell("patronymic"),
      departmentId: department?.id || existingRow?.department_id || "",
      position: cell("position"),
      personnelNumber: personnel,
      phone: cell("phone"),
      scheduleStart: existingRow?.schedule_start || "",
      scheduleEnd: existingRow?.schedule_end || "",
      graceMinutes: existingRow?.grace_minutes ?? "",
    }, meta);
    if (!result.ok) skipped += 1;
    else if (existingRow) updated += 1;
    else created += 1;
  }
  writeAudit({
    ...auditActor(meta),
    action: "employee.import",
    entity: "employee",
    details: { created, updated, skipped },
  });
  return { ok: true, created, updated, skipped };
}

function auditActor(meta) {
  return { userId: meta.actor?.id, username: meta.actor?.username, ip: meta.ip };
}

export function saveEmployee(input, meta) {
  const existing = input.id ? getEmployeeRow(input.id) : null;
  if (input.id && !existing) return { ok: false, error: "employee_not_found" };
  const parsed = validate({ ...input, currentDepartmentId: existing?.department_id || null });
  if (Object.keys(parsed.fields).length) return { ok: false, error: "invalid", fields: parsed.fields };
  const number = parsed.value.personnelNumber || (existing ? existing.personnel_number : nextPersonnelNumber());
  const duplicate = get(
    "SELECT id FROM employees WHERE personnel_number = ? AND id <> ?",
    [number, input.id || ""],
  );
  if (duplicate) return { ok: false, error: "personnel_taken", fields: { personnel_number: "personnel_taken" } };

  let filename = existing?.photo_file || null;
  let createdFile = null;
  if (input.removePhoto) filename = null;
  if (input.photo) {
    createdFile = savePhoto(input.photo);
    filename = createdFile;
  }
  const now = bakuStamp().iso;
  const { value } = parsed;
  value.personnelNumber = number;
  const search = searchText(value);
  try {
    if (!existing) {
      const id = randomUUID();
      run(
        `INSERT INTO employees (
          id, first_name, last_name, patronymic, department_id, position, personnel_number, phone,
          photo_file, schedule_start, schedule_end, grace_minutes, status, search_text, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        [
          id, value.firstName, value.lastName, value.patronymic, value.departmentId, value.position,
          number, value.phone, filename, value.schedule.start, value.schedule.end,
          value.schedule.grace, search, now, now,
        ],
      );
      if (input.biometricPresent && input.biometricAllowed) {
        run("UPDATE employees SET biometric_allowed = 1 WHERE id = ?", [id]);
      }
      writeAudit({
        ...auditActor(meta),
        action: "employee.create",
        entity: "employee",
        entityId: id,
        details: { name: `${value.lastName} ${value.firstName}`, personnelNumber: number },
      });
      return { ok: true, id };
    }
    run(
      `UPDATE employees SET
        first_name = ?, last_name = ?, patronymic = ?, department_id = ?, position = ?,
        personnel_number = ?, phone = ?, photo_file = ?, schedule_start = ?, schedule_end = ?,
        grace_minutes = ?, search_text = ?, updated_at = ?
       WHERE id = ?`,
      [
        value.firstName, value.lastName, value.patronymic, value.departmentId, value.position,
        number, value.phone, filename, value.schedule.start, value.schedule.end,
        value.schedule.grace, search, now, existing.id,
      ],
    );
  } catch (error) {
    if (createdFile) removePhoto(createdFile);
    if (String(error.message).includes("personnel_number")) {
      return { ok: false, error: "personnel_taken", fields: { personnel_number: "personnel_taken" } };
    }
    throw error;
  }
  if (createdFile && existing?.photo_file) removePhoto(existing.photo_file);
  if (input.removePhoto && existing?.photo_file && !input.photo) removePhoto(existing.photo_file);
  const savedId = existing?.id;
  if (savedId && input.biometricPresent) {
    const allow = input.biometricAllowed ? 1 : 0;
    if (!allow) deleteEmployeeTemplates(savedId, meta, { clearConsent: true });
    else run("UPDATE employees SET biometric_allowed = 1, updated_at = ? WHERE id = ?", [bakuStamp().iso, savedId]);
  }
  if (existing) {
    writeAudit({
      ...auditActor(meta),
      action: "employee.update",
      entity: "employee",
      entityId: existing.id,
      details: { name: `${value.lastName} ${value.firstName}`, personnelNumber: number },
    });
  }
  return { ok: true, id: existing?.id || savedId };
}

export function deleteEmployeeRecord(id, meta) {
  const existing = getEmployeeRow(id);
  if (!existing) return { ok: false, error: "employee_not_found" };
  if (existing.removed_at) return { ok: true };
  const photo = existing.photo_file;
  const now = bakuStamp().iso;
  transaction(() => {
    run("DELETE FROM face_templates WHERE employee_id = ?", [id]);
    run("DELETE FROM face_sessions WHERE employee_id = ?", [id]);
    run("DELETE FROM processing_events WHERE employee_id = ?", [id]);
    run(
      `UPDATE employees
       SET status = 'archived', removed_at = ?, report_department = COALESCE(NULLIF(report_department, ''), ?),
           personnel_number = ?, search_text = '', photo_file = NULL, face_enrolled = 0, biometric_allowed = 0, face_status = 'none', updated_at = ?
       WHERE id = ?`,
      [now, existing.department_name || "", `del-${id}`, now, id],
    );
  });
  if (photo) removePhoto(photo);
  writeAudit({
    ...auditActor(meta),
    action: "employee.delete",
    entity: "employee",
    entityId: id,
    details: { name: `${existing.last_name} ${existing.first_name}`, reportKept: true },
  });
  return { ok: true };
}

export function setEmployeeStatus(id, status, meta) {
  const existing = getEmployeeRow(id);
  if (!existing) return { ok: false, error: "employee_not_found" };
  run("UPDATE employees SET status = ?, updated_at = ? WHERE id = ?", [status, bakuStamp().iso, id]);
  writeAudit({
    ...auditActor(meta),
    action: status === "archived" ? "employee.archive" : "employee.restore",
    entity: "employee",
    entityId: id,
    details: { name: `${existing.last_name} ${existing.first_name}`, personnelNumber: existing.personnel_number },
  });
  return { ok: true };
}
