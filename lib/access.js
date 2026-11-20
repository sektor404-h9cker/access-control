import { randomUUID } from "node:crypto";
import { all, get, run } from "./db.js";
import { writeAudit } from "./audit.js";
import { PERMISSION_KEYS } from "./permissions.js";
import { bakuStamp } from "./time.js";
import { cleanText } from "./text.js";

function named(row, locale) {
  return {
    key: row.role_key,
    name: locale === "ru" ? row.name_ru : row.name_az,
    nameRu: row.name_ru,
    nameAz: row.name_az,
    description: locale === "ru" ? row.description_ru : row.description_az,
    builtin: Boolean(row.builtin),
  };
}

export function listRoles(locale = "az") {
  const roles = all("SELECT * FROM roles ORDER BY builtin DESC, role_key");
  const grants = all("SELECT role_key, permission FROM role_permissions");
  return roles.map((row) => ({
    ...named(row, locale),
    permissions: row.role_key === "owner"
      ? PERMISSION_KEYS.slice()
      : grants.filter((item) => item.role_key === row.role_key).map((item) => item.permission),
  }));
}

export function roleTitle(roleKey, locale) {
  const role = get("SELECT name_ru, name_az FROM roles WHERE role_key = ?", [roleKey]);
  if (!role) return roleKey;
  return locale === "ru" ? role.name_ru : role.name_az;
}

export function permissionsFor(roleKey) {
  if (roleKey === "owner") return PERMISSION_KEYS.slice();
  return all("SELECT permission FROM role_permissions WHERE role_key = ?", [roleKey])
    .map((row) => row.permission)
    .filter((key) => PERMISSION_KEYS.includes(key));
}

export function createRole({ nameRu, nameAz, meta }) {
  const ru = cleanText(nameRu, 80);
  const az = cleanText(nameAz, 80);
  if (!ru.ok || ru.value.length < 2 || !az.ok || az.value.length < 2) return { ok: false, error: "invalid" };
  const key = `r${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const now = bakuStamp().iso;
  run(
    `INSERT INTO roles (id, role_key, name_ru, name_az, description_ru, description_az, builtin, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', '', 0, ?, ?)`,
    [randomUUID(), key, ru.value, az.value, now, now],
  );
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "role.create",
    entity: "role",
    entityId: key,
    details: { name: ru.value },
    ip: meta.ip,
  });
  return { ok: true, roleKey: key };
}

export function deleteRole(roleKey, meta) {
  const role = get("SELECT * FROM roles WHERE role_key = ?", [roleKey]);
  if (!role) return { ok: false, error: "invalid" };
  if (role.builtin || roleKey === "owner") return { ok: false, error: "role_builtin" };
  const used = get("SELECT COUNT(*) AS count FROM users WHERE role = ?", [roleKey]);
  if (used.count > 0) return { ok: false, error: "role_in_use" };
  run("DELETE FROM role_permissions WHERE role_key = ?", [roleKey]);
  run("DELETE FROM roles WHERE role_key = ?", [roleKey]);
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "role.delete",
    entity: "role",
    entityId: roleKey,
    ip: meta.ip,
  });
  return { ok: true };
}

export function setRolePermissions(roleKey, permissions, meta) {
  if (roleKey === "owner") return { ok: false, error: "owner_locked" };
  const role = get("SELECT role_key FROM roles WHERE role_key = ?", [roleKey]);
  if (!role) return { ok: false, error: "invalid" };
  const next = [...new Set((permissions || []).filter((key) => PERMISSION_KEYS.includes(key)))];
  run("DELETE FROM role_permissions WHERE role_key = ?", [roleKey]);
  for (const key of next) {
    run("INSERT INTO role_permissions (role_key, permission) VALUES (?, ?)", [roleKey, key]);
  }
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "role.permissions",
    entity: "role",
    entityId: roleKey,
    details: { count: next.length },
    ip: meta.ip,
  });
  return { ok: true };
}
