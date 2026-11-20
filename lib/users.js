import { randomUUID } from "node:crypto";
import { all, get, run, transaction } from "./db.js";
import { hashPassword, passwordProblems } from "./passwords.js";
import { bakuStamp } from "./time.js";
import { cleanText } from "./text.js";
import { writeAudit } from "./audit.js";

const USERNAME = /^[a-z0-9._-]{3,32}$/;

export function countUsers() {
  return get("SELECT COUNT(*) AS count FROM users").count;
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    locale: row.locale,
    theme: row.theme,
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

export function findUserById(id) {
  return get(
    `SELECT id, username, display_name, password_hash, role, locale, theme, active, session_version, created_at
     FROM users WHERE id = ?`,
    [id],
  );
}

export function findUserByUsername(username) {
  return get(
    `SELECT id, username, display_name, password_hash, role, locale, theme, active, session_version
     FROM users WHERE username = ?`,
    [String(username ?? "").trim().toLowerCase()],
  );
}

export function listUsers() {
  return all(
    `SELECT id, username, display_name, role, locale, theme, active, created_at
     FROM users ORDER BY active DESC, username`,
  ).map(publicUser);
}

function validateAccount(input, { requirePassword }) {
  const username = String(input.username ?? "").trim().toLowerCase();
  const display = cleanText(input.displayName, 80);
  const role = input.role;
  const fields = {};
  if (!USERNAME.test(username)) fields.username = "invalid_username";
  if (!display.ok || display.value.length < 2) fields.display_name = display.ok ? "required" : "too_long";
  if (!get("SELECT role_key FROM roles WHERE role_key = ?", [role])) fields.role = "invalid";
  if (requirePassword) {
    const problem = passwordProblems(input.password);
    if (problem) fields.password = problem;
    if (input.password !== input.confirmPassword) fields.confirm_password = "mismatch";
  }
  return { fields, username, displayName: display.value };
}

export async function createFirstAdmin(input, meta) {
  if (countUsers() > 0) return { ok: false, error: "setup_closed" };
  const parsed = validateAccount({ ...input, role: "owner" }, { requirePassword: true });
  if (Object.keys(parsed.fields).length) return { ok: false, error: "invalid", fields: parsed.fields };
  const passwordHash = await hashPassword(input.password);
  const now = bakuStamp().iso;
  const id = randomUUID();
  try {
    transaction(() => {
      if (countUsers() > 0) throw Object.assign(new Error("setup_closed"), { code: "setup_closed" });
      run(
        `INSERT INTO users (
          id, username, display_name, password_hash, role, locale, theme, active, session_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'owner', ?, ?, 1, 1, ?, ?)`,
        [id, parsed.username, parsed.displayName, passwordHash, input.locale === "ru" ? "ru" : "az", input.theme === "dark" ? "dark" : "light", now, now],
      );
    });
  } catch (error) {
    if (error.code === "setup_closed" || String(error.message).includes("setup_closed")) {
      return { ok: false, error: "setup_closed" };
    }
    if (String(error.message).includes("users.username")) return { ok: false, error: "username_taken", fields: { username: "username_taken" } };
    throw error;
  }
  writeAudit({
    userId: id,
    username: parsed.username,
    action: "auth.setup",
    entity: "user",
    entityId: id,
    ip: meta.ip,
  });
  return { ok: true, user: findUserById(id) };
}

export async function createUser(input, meta) {
  const parsed = validateAccount(input, { requirePassword: true });
  if (Object.keys(parsed.fields).length) return { ok: false, error: "invalid", fields: parsed.fields };
  const actor = meta.actor?.id ? findUserById(meta.actor.id) : null;
  if (input.role === "owner" && actor?.role !== "owner") return { ok: false, error: "forbidden" };
  const passwordHash = await hashPassword(input.password);
  const now = bakuStamp().iso;
  const id = randomUUID();
  const locale = input.locale === "ru" ? "ru" : "az";
  const theme = input.theme === "dark" ? "dark" : "light";
  try {
    run(
      `INSERT INTO users (
        id, username, display_name, password_hash, role, locale, theme, active, session_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      [id, parsed.username, parsed.displayName, passwordHash, input.role, locale, theme, now, now],
    );
  } catch (error) {
    if (String(error.message).includes("users.username")) {
      return { ok: false, error: "username_taken", fields: { username: "username_taken" } };
    }
    throw error;
  }
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "user.create",
    entity: "user",
    entityId: id,
    details: { username: parsed.username, role: input.role },
    ip: meta.ip,
  });
  return { ok: true, user: publicUser(findUserById(id)) };
}

export function setUserActive(id, active, meta) {
  const user = findUserById(id);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.id === meta.actor?.id) return { ok: false, error: "cannot_edit_self" };
  if (user.role === "owner") {
    const actor = meta.actor?.id ? findUserById(meta.actor.id) : null;
    if (actor?.role !== "owner") return { ok: false, error: "forbidden" };
    if (!active && user.active) {
      const owners = get("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND active = 1");
      if (owners.count <= 1) return { ok: false, error: "last_admin" };
    }
  }
  const now = bakuStamp().iso;
  run(
    "UPDATE users SET active = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?",
    [active ? 1 : 0, now, id],
  );
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: active ? "user.restore" : "user.deactivate",
    entity: "user",
    entityId: id,
    details: { username: user.username },
    ip: meta.ip,
  });
  return { ok: true };
}

export async function resetUserPassword(id, password, confirmPassword, meta) {
  const user = findUserById(id);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.id === meta.actor?.id) return { ok: false, error: "cannot_edit_self" };
  const actor = meta.actor?.id ? findUserById(meta.actor.id) : null;
  if (user.role === "owner" && actor?.role !== "owner") return { ok: false, error: "forbidden" };
  const problem = passwordProblems(password);
  if (problem) return { ok: false, error: "invalid", fields: { password: problem } };
  if (password !== confirmPassword) return { ok: false, error: "invalid", fields: { confirm_password: "mismatch" } };
  const passwordHash = await hashPassword(password);
  run(
    "UPDATE users SET password_hash = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?",
    [passwordHash, bakuStamp().iso, id],
  );
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "user.password",
    entity: "user",
    entityId: id,
    details: { username: user.username },
    ip: meta.ip,
  });
  return { ok: true };
}

export function updateUserAccount(id, input, meta) {
  const user = findUserById(id);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.id === meta.actor?.id && input.role && input.role !== user.role) return { ok: false, error: "cannot_edit_self" };
  const display = cleanText(input.displayName, 80);
  if (!display.ok || display.value.length < 2) return { ok: false, error: "invalid", fields: { display_name: display.ok ? "required" : "too_long" } };
  if (!get("SELECT role_key FROM roles WHERE role_key = ?", [input.role])) return { ok: false, error: "invalid", fields: { role: "invalid" } };
  const actor = meta.actor?.id ? findUserById(meta.actor.id) : null;
  if ((input.role === "owner" || user.role === "owner") && actor?.role !== "owner") return { ok: false, error: "forbidden" };
  if (user.role === "owner" && input.role !== "owner" && user.active) {
    const owners = get("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND active = 1");
    if (owners.count <= 1) return { ok: false, error: "last_admin" };
  }
  const roleChanged = input.role !== user.role;
  run(
    `UPDATE users SET display_name = ?, role = ?, session_version = session_version + ?, updated_at = ? WHERE id = ?`,
    [display.value, input.role, roleChanged ? 1 : 0, bakuStamp().iso, id],
  );
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "user.update",
    entity: "user",
    entityId: id,
    details: { username: user.username, role: input.role },
    ip: meta.ip,
  });
  return { ok: true };
}

export function endUserSessions(id, meta) {
  const user = findUserById(id);
  if (!user) return { ok: false, error: "user_not_found" };
  const actor = meta.actor?.id ? findUserById(meta.actor.id) : null;
  if (user.role === "owner" && actor?.role !== "owner") return { ok: false, error: "forbidden" };
  revokeUserSession(id);
  writeAudit({
    userId: meta.actor?.id,
    username: meta.actor?.username,
    action: "user.sessions",
    entity: "user",
    entityId: id,
    details: { username: user.username },
    ip: meta.ip,
  });
  return { ok: true };
}

export function revokeUserSession(id) {
  run("UPDATE users SET session_version = session_version + 1, updated_at = ? WHERE id = ?", [
    bakuStamp().iso,
    id,
  ]);
}

export function updateUserPreferences(id, { locale, theme }) {
  const nextLocale = locale === "ru" ? "ru" : locale === "az" ? "az" : null;
  const nextTheme = theme === "dark" ? "dark" : theme === "light" ? "light" : null;
  if (!nextLocale && !nextTheme) return;
  const sets = [];
  const params = [];
  if (nextLocale) {
    sets.push("locale = ?");
    params.push(nextLocale);
  }
  if (nextTheme) {
    sets.push("theme = ?");
    params.push(nextTheme);
  }
  sets.push("updated_at = ?");
  params.push(bakuStamp().iso, id);
  run(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, params);
}
