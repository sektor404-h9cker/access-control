import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { seedRoleRows } from "./permissions.js";
import { fold } from "./text.js";
import { bakuStamp } from "./time.js";

const globalState = globalThis;

function databasePath() {
  if (process.env.SMZ_DB_PATH) return path.resolve(process.env.SMZ_DB_PATH);
  return path.join(process.cwd(), "data", "smz.db");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'az' CHECK (locale IN ('az', 'ru')),
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  schedule_start TEXT,
  schedule_end TEXT,
  grace_minutes INTEGER,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  patronymic TEXT NOT NULL DEFAULT '',
  department_id TEXT REFERENCES departments(id),
  position TEXT NOT NULL DEFAULT '',
  personnel_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT NOT NULL DEFAULT '',
  photo_file TEXT,
  schedule_start TEXT,
  schedule_end TEXT,
  grace_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  face_status TEXT NOT NULL DEFAULT 'none' CHECK (face_status IN ('none', 'captured')),
  biometric_allowed INTEGER NOT NULL DEFAULT 0 CHECK (biometric_allowed IN (0, 1)),
  face_enrolled INTEGER NOT NULL DEFAULT 0 CHECK (face_enrolled IN (0, 1)),
  search_text TEXT NOT NULL DEFAULT '',
  removed_at TEXT,
  report_department TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  work_date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'camera')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (employee_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(work_date);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cameras (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('entrance', 'exit')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  host TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL DEFAULT 'usb' CHECK (source_kind IN ('usb', 'ip')),
  device_label TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS face_sessions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  client_token TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('scan', 'still')),
  status TEXT NOT NULL CHECK (status IN ('confirmed')),
  poses TEXT NOT NULL DEFAULT '',
  quality_note TEXT NOT NULL DEFAULT '',
  template_stored INTEGER NOT NULL DEFAULT 0 CHECK (template_stored = 0),
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_face_sessions_employee ON face_sessions(employee_id);
CREATE TABLE IF NOT EXISTS processing_events (
  id TEXT PRIMARY KEY,
  camera_id TEXT,
  employee_id TEXT,
  kind TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_processing_events_created ON processing_events(created_at);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  role_key TEXT NOT NULL UNIQUE,
  name_ru TEXT NOT NULL,
  name_az TEXT NOT NULL,
  description_ru TEXT NOT NULL DEFAULT '',
  description_az TEXT NOT NULL DEFAULT '',
  builtin INTEGER NOT NULL DEFAULT 0 CHECK (builtin IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_key TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_key, permission)
);
CREATE TABLE IF NOT EXISTS day_marks (
  id TEXT PRIMARY KEY,
  work_date TEXT NOT NULL,
  employee_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('holiday', 'work', 'vacation', 'sick', 'trip', 'excused')),
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_day_marks_unique ON day_marks(work_date, employee_id, kind);
CREATE TABLE IF NOT EXISTS attendance_revisions (
  id TEXT PRIMARY KEY,
  attendance_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  editor_id TEXT,
  editor_username TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attendance_revisions_row ON attendance_revisions(attendance_id, created_at);
CREATE TABLE IF NOT EXISTS face_templates (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  model TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  iv BLOB NOT NULL,
  tag BLOB NOT NULL,
  vector BLOB NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_face_templates_employee ON face_templates(employee_id, active);
CREATE TABLE IF NOT EXISTS recognition_events (
  id TEXT PRIMARY KEY,
  camera_id TEXT,
  employee_id TEXT,
  direction TEXT,
  outcome TEXT NOT NULL,
  score REAL,
  second_score REAL,
  latency_ms INTEGER,
  liveness TEXT NOT NULL DEFAULT 'unchecked',
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recognition_events_created ON recognition_events(created_at);
CREATE TABLE IF NOT EXISTS passage_events (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  source TEXT NOT NULL,
  camera_id TEXT,
  recognition_id TEXT,
  at TEXT NOT NULL,
  work_date TEXT NOT NULL,
  applied TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_passage_events_employee ON passage_events(employee_id, work_date, at);
CREATE TABLE IF NOT EXISTS employee_work_policies (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  leadership INTEGER NOT NULL CHECK (leadership IN (0, 1)),
  flex_time INTEGER NOT NULL CHECK (flex_time IN (0, 1)),
  effective_from TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_work_policies_employee ON employee_work_policies(employee_id, effective_from);
CREATE TABLE IF NOT EXISTS alert_events (
  id TEXT PRIMARY KEY,
  camera_id TEXT,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alert_events_created ON alert_events(created_at);
`;

function seedDefaults(database) {
  const now = bakuStamp().iso;
  const insertSetting = database.prepare(
    "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
  );
  const defaults = [
    ["enterprise_name", "Suraxanı Maşınqayırma Zavodu"],
    ["workday_start", "08:15"],
    ["workday_end", "16:30"],
    ["grace_minutes", "0"],
    ["weekend_days", "0,6"],
    ["data_mode", "production"],
    ["recognition_mode", "review"],
    ["alert_enabled", "0"],
    ["alert_volume", "60"],
    ["alert_device", ""],
    ["alert_cooldown", "15"],
    ["dashboard_cameras", "1"],
    ["dashboard_camera_layout", "compact"],
  ];
  for (const [key, value] of defaults) insertSetting.run(key, value, now);
  const insertCamera = database.prepare(
    "INSERT OR IGNORE INTO cameras (id, code, direction, enabled, host, updated_at) VALUES (?, ?, ?, 0, '', ?)",
  );
  insertCamera.run("camera-entrance", "CAM-01", "entrance", now);
  insertCamera.run("camera-exit", "CAM-02", "exit", now);
  database.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, ?)").run(now);
}

function columnNames(database, table) {
  return database.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function snapshotDatabase(database) {
  const stamp = bakuStamp();
  const folderName = `pre-migrate-${stamp.date.replaceAll("-", "")}-${stamp.iso.slice(11, 19).replaceAll(":", "")}`;
  let folder = path.join(process.cwd(), "data", "backups", folderName);
  if (fs.existsSync(folder)) folder = `${folder}-${Math.random().toString(36).slice(2, 6)}`;
  fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, "database.db").replaceAll("'", "''");
  try {
    database.exec(`VACUUM INTO '${target}'`);
  } catch {
    database.exec("PRAGMA wal_checkpoint(FULL)");
    fs.copyFileSync(getDbPath(), path.join(folder, "database.db"));
  }
}

function migrate(database, ensureSnapshot) {
  const usersSql = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql || "";
  const cameraColumns = columnNames(database, "cameras");
  const employeeColumns = columnNames(database, "employees");
  const rebuildUsers = usersSql.includes("'hr'");
  const addCameraColumns = !cameraColumns.includes("source_kind");
  const addFaceStatus = !employeeColumns.includes("face_status");
  if (!rebuildUsers && !addCameraColumns && !addFaceStatus) {
    database.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (2, ?)").run(bakuStamp().iso);
    return;
  }
  ensureSnapshot();
  database.exec("PRAGMA foreign_keys = OFF");
  try {
    if (addFaceStatus) {
      database.exec("ALTER TABLE employees ADD COLUMN face_status TEXT NOT NULL DEFAULT 'none' CHECK (face_status IN ('none', 'captured'))");
    }
    if (addCameraColumns) {
      database.exec("ALTER TABLE cameras ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'usb' CHECK (source_kind IN ('usb', 'ip'))");
      database.exec("ALTER TABLE cameras ADD COLUMN device_label TEXT NOT NULL DEFAULT ''");
      database.exec("ALTER TABLE cameras ADD COLUMN device_id TEXT NOT NULL DEFAULT ''");
    }
    if (rebuildUsers) {
      database.exec(`
        CREATE TABLE users_next (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'observer')),
          locale TEXT NOT NULL DEFAULT 'az' CHECK (locale IN ('az', 'ru')),
          theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          session_version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO users_next (
          id, username, display_name, password_hash, role, locale, theme, active, session_version, created_at, updated_at
        )
        SELECT id, username, display_name, password_hash,
          CASE role
            WHEN 'admin' THEN 'owner'
            WHEN 'hr' THEN 'admin'
            WHEN 'owner' THEN 'owner'
            ELSE 'observer'
          END,
          CASE WHEN locale IN ('az', 'ru') THEN locale ELSE 'az' END,
          CASE WHEN theme IN ('light', 'dark') THEN theme ELSE 'light' END,
          active, session_version, created_at, updated_at
        FROM users;
        DROP TABLE users;
        ALTER TABLE users_next RENAME TO users;
      `);
    }
    database.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (2, ?)").run(bakuStamp().iso);
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateAccess(database, ensureSnapshot) {
  const done = database.prepare("SELECT version FROM schema_migrations WHERE version = 3").get();
  if (done) return;
  const usersSql = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql || "";
  const needsRoleFreedom = usersSql.includes("CHECK (role IN");
  if (needsRoleFreedom) ensureSnapshot();
  database.exec("PRAGMA foreign_keys = OFF");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        role_key TEXT NOT NULL UNIQUE,
        name_ru TEXT NOT NULL,
        name_az TEXT NOT NULL,
        description_ru TEXT NOT NULL DEFAULT '',
        description_az TEXT NOT NULL DEFAULT '',
        builtin INTEGER NOT NULL DEFAULT 0 CHECK (builtin IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_key TEXT NOT NULL,
        permission TEXT NOT NULL,
        PRIMARY KEY (role_key, permission)
      );
      CREATE TABLE IF NOT EXISTS day_marks (
        id TEXT PRIMARY KEY,
        work_date TEXT NOT NULL,
        employee_id TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL CHECK (kind IN ('holiday', 'work', 'vacation', 'sick', 'trip', 'excused')),
        note TEXT NOT NULL DEFAULT '',
        created_by TEXT,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_day_marks_unique ON day_marks(work_date, employee_id, kind);
      CREATE TABLE IF NOT EXISTS attendance_revisions (
        id TEXT PRIMARY KEY,
        attendance_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        editor_id TEXT,
        editor_username TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL,
        before_json TEXT NOT NULL,
        after_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_attendance_revisions_row ON attendance_revisions(attendance_id, created_at);
    `);
    if (needsRoleFreedom) {
      database.exec(`
        CREATE TABLE users_next (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL,
          locale TEXT NOT NULL DEFAULT 'az' CHECK (locale IN ('az', 'ru')),
          theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          session_version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO users_next (
          id, username, display_name, password_hash, role, locale, theme, active, session_version, created_at, updated_at
        )
        SELECT id, username, display_name, password_hash, role,
          CASE WHEN locale IN ('az', 'ru') THEN locale ELSE 'az' END,
          CASE WHEN theme IN ('light', 'dark') THEN theme ELSE 'light' END,
          active, session_version, created_at, updated_at
        FROM users;
        DROP TABLE users;
        ALTER TABLE users_next RENAME TO users;
      `);
    }
    const now = bakuStamp().iso;
    database.prepare("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('weekend_days', '0,6', ?)").run(now);
    seedRoleRows(database, now);
    database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)").run(now);
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateRecognition(database, ensureSnapshot) {
  const done = database.prepare("SELECT version FROM schema_migrations WHERE version = 4").get();
  if (done) return;
  const employeeColumns = columnNames(database, "employees");
  const needsColumns = !employeeColumns.includes("biometric_allowed") || !employeeColumns.includes("face_enrolled");
  if (needsColumns) ensureSnapshot();
  if (!employeeColumns.includes("biometric_allowed")) {
    database.exec("ALTER TABLE employees ADD COLUMN biometric_allowed INTEGER NOT NULL DEFAULT 0 CHECK (biometric_allowed IN (0, 1))");
  }
  if (!employeeColumns.includes("face_enrolled")) {
    database.exec("ALTER TABLE employees ADD COLUMN face_enrolled INTEGER NOT NULL DEFAULT 0 CHECK (face_enrolled IN (0, 1))");
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS face_templates (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      model TEXT NOT NULL,
      dimension INTEGER NOT NULL,
      iv BLOB NOT NULL,
      tag BLOB NOT NULL,
      vector BLOB NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS idx_face_templates_employee ON face_templates(employee_id, active);
    CREATE TABLE IF NOT EXISTS recognition_events (
      id TEXT PRIMARY KEY,
      camera_id TEXT,
      employee_id TEXT,
      direction TEXT,
      outcome TEXT NOT NULL,
      score REAL,
      second_score REAL,
      latency_ms INTEGER,
      liveness TEXT NOT NULL DEFAULT 'unchecked',
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recognition_events_created ON recognition_events(created_at);
    CREATE TABLE IF NOT EXISTS passage_events (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      source TEXT NOT NULL,
      camera_id TEXT,
      recognition_id TEXT,
      at TEXT NOT NULL,
      work_date TEXT NOT NULL,
      applied TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_passage_events_employee ON passage_events(employee_id, work_date, at);
  `);
  const now = bakuStamp().iso;
  database.prepare("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('recognition_mode', 'review', ?)").run(now);
  const people = database.prepare("SELECT id, first_name, last_name, patronymic, position, phone FROM employees").all();
  const rewrite = database.prepare("UPDATE employees SET search_text = ? WHERE id = ?");
  for (const person of people) {
    rewrite.run(fold([person.last_name, person.first_name, person.patronymic, person.position, person.phone].filter(Boolean).join(" ")), person.id);
  }
  database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (4, ?)").run(now);
}

function migrateWorkplace(database, ensureSnapshot) {
  const done = database.prepare("SELECT version FROM schema_migrations WHERE version = 5").get();
  if (done) return;
  ensureSnapshot();
  database.exec(`
    CREATE TABLE IF NOT EXISTS employee_work_policies (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      leadership INTEGER NOT NULL CHECK (leadership IN (0, 1)),
      flex_time INTEGER NOT NULL CHECK (flex_time IN (0, 1)),
      effective_from TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_work_policies_employee ON employee_work_policies(employee_id, effective_from);
    CREATE TABLE IF NOT EXISTS alert_events (
      id TEXT PRIMARY KEY,
      camera_id TEXT,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_alert_events_created ON alert_events(created_at);
  `);
  const now = bakuStamp().iso;
  const insert = database.prepare("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)");
  insert.run("alert_enabled", "0", now);
  insert.run("alert_volume", "60", now);
  insert.run("alert_device", "", now);
  insert.run("alert_cooldown", "15", now);
  database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (5, ?)").run(now);
}

function migrateRemoval(database, ensureSnapshot) {
  const done = database.prepare("SELECT version FROM schema_migrations WHERE version = 6").get();
  if (done) return;
  const columns = columnNames(database, "employees");
  if (!columns.includes("removed_at") || !columns.includes("report_department")) ensureSnapshot();
  if (!columns.includes("removed_at")) database.exec("ALTER TABLE employees ADD COLUMN removed_at TEXT");
  if (!columns.includes("report_department")) database.exec("ALTER TABLE employees ADD COLUMN report_department TEXT NOT NULL DEFAULT ''");
  const now = bakuStamp().iso;
  database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (6, ?)").run(now);
}

function migratePresence(database) {
  const done = database.prepare("SELECT version FROM schema_migrations WHERE version = 7").get();
  if (done) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS presence_visits (
      employee_id TEXT NOT NULL,
      camera_id TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      phase TEXT NOT NULL CHECK (phase IN ('present', 'writing', 'left')),
      last_seen TEXT NOT NULL,
      event_id TEXT,
      PRIMARY KEY (employee_id, camera_id, direction)
    );
  `);
  database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (7, ?)").run(bakuStamp().iso);
}

function migratePassageFacts(database) {
  const done = database.prepare("SELECT version FROM schema_migrations WHERE version = 8").get();
  if (done) return;
  const columns = columnNames(database, "passage_events");
  if (!columns.includes("visit_id")) database.exec("ALTER TABLE passage_events ADD COLUMN visit_id TEXT");
  if (!columns.includes("event_source")) database.exec("ALTER TABLE passage_events ADD COLUMN event_source TEXT NOT NULL DEFAULT ''");
  database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (8, ?)").run(bakuStamp().iso);
}

function applyMigrations(database) {
  let snapshotted = false;
  const ensureSnapshot = () => {
    if (snapshotted) return;
    const occupied = database.prepare("SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM employees) AS count").get();
    if (occupied.count > 0) snapshotDatabase(database);
    snapshotted = true;
  };
  migrate(database, ensureSnapshot);
  migrateAccess(database, ensureSnapshot);
  migrateRecognition(database, ensureSnapshot);
  migrateWorkplace(database, ensureSnapshot);
  migrateRemoval(database, ensureSnapshot);
  migratePresence(database);
  migratePassageFacts(database);
}

export function getDbPath() {
  return globalState.__smzDbPath || databasePath();
}

export function getDb() {
  if (!globalState.__smzDb) {
    const file = databasePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const database = new DatabaseSync(file);
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("PRAGMA journal_mode = WAL");
    database.exec("PRAGMA synchronous = NORMAL");
    database.exec("PRAGMA busy_timeout = 5000");
    globalState.__smzDbPath = file;
    database.exec(SCHEMA);
    seedDefaults(database);
    applyMigrations(database);
    globalState.__smzDb = database;
  } else {
    const ready = globalState.__smzDb.prepare("SELECT version FROM schema_migrations WHERE version = 8").get();
    if (!ready) applyMigrations(globalState.__smzDb);
  }
  return globalState.__smzDb;
}

export function closeDb() {
  if (globalState.__smzDb) {
    globalState.__smzDb.close();
    globalState.__smzDb = undefined;
    globalState.__smzDbPath = undefined;
  }
}

function plainRow(row) {
  return row ? { ...row } : row;
}

export function all(sql, params = []) {
  return getDb().prepare(sql).all(...params).map(plainRow);
}

export function get(sql, params = []) {
  return plainRow(getDb().prepare(sql).get(...params));
}

export function run(sql, params = []) {
  return getDb().prepare(sql).run(...params);
}

export function transaction(fn) {
  const database = getDb();
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // The original error is the one the caller needs.
    }
    throw error;
  }
}
