export const PERMISSIONS = [
  ["dashboard.view", "sections"],
  ["monitoring.view", "sections"],
  ["attendance.view", "sections"],
  ["employees.view", "sections"],
  ["departments.view", "sections"],
  ["reports.view", "sections"],
  ["settings.view", "sections"],
  ["audit.view", "sections"],
  ["employees.create", "employees"],
  ["employees.update", "employees"],
  ["employees.archive", "employees"],
  ["employees.policy", "employees"],
  ["attendance.manual", "attendance"],
  ["attendance.edit", "attendance"],
  ["cameras.view", "cameras"],
  ["enrollment.manage", "cameras"],
  ["reports.export", "reports"],
  ["departments.manage", "organization"],
  ["settings.manage", "organization"],
  ["backup.create", "organization"],
  ["users.manage", "access"],
  ["roles.manage", "access"],
].map(([key, group]) => ({ key, group }));

export const PERMISSION_KEYS = PERMISSIONS.map((item) => item.key);

const ADMIN = PERMISSION_KEYS.filter((key) => !["users.manage", "roles.manage", "backup.create", "employees.policy"].includes(key));
const OBSERVER = [
  "dashboard.view",
  "monitoring.view",
  "attendance.view",
  "employees.view",
  "departments.view",
  "reports.view",
  "cameras.view",
];

export const ROLE_DEFAULTS = {
  admin: ADMIN,
  observer: OBSERVER,
};

export function can(user, permission) {
  if (!user || !PERMISSION_KEYS.includes(permission)) return false;
  if (user.role === "owner") return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

export function seedRoleRows(database, now) {
  const insertRole = database.prepare(
    `INSERT OR IGNORE INTO roles (
      id, role_key, name_ru, name_az, description_ru, description_az, builtin, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  insertRole.run(
    "role-owner",
    "owner",
    "Владелец",
    "Sahib",
    "Полный доступ. Эти разрешения нельзя снять.",
    "Tam giriş. Bu icazələri çıxarmaq olmaz.",
    now,
    now,
  );
  insertRole.run(
    "role-admin",
    "admin",
    "Администратор",
    "Administrator",
    "Ежедневная работа с людьми, посещаемостью и камерами.",
    "İnsanlar, davamiyyət və kameralarla gündəlik iş.",
    now,
    now,
  );
  insertRole.run(
    "role-observer",
    "observer",
    "Наблюдатель",
    "Müşahidəçi",
    "Только просмотр разрешённых разделов.",
    "Yalnız icazə verilən bölmələrə baxış.",
    now,
    now,
  );
  const insertPermission = database.prepare(
    "INSERT OR IGNORE INTO role_permissions (role_key, permission) VALUES (?, ?)",
  );
  for (const [role, keys] of Object.entries(ROLE_DEFAULTS)) {
    for (const key of keys) insertPermission.run(role, key);
  }
}
