import "server-only";
import { cookies, headers } from "next/headers";
import { createToken, readToken, SESSION_MAX_AGE } from "./token.js";
import { permissionsFor } from "./access.js";
import { findUserById } from "./users.js";

const SESSION_COOKIE = "smz_session";
const YEAR = 60 * 60 * 24 * 365;

async function cookieBase() {
  const headerStore = await headers();
  const proto = headerStore.get("x-forwarded-proto") || "http";
  return { path: "/", sameSite: "lax", secure: proto === "https" };
}

export async function issueSession(userId) {
  const user = findUserById(userId);
  if (!user || !user.active) return false;
  const jar = await cookies();
  const base = await cookieBase();
  jar.set(SESSION_COOKIE, createToken(user), { ...base, httpOnly: true, maxAge: SESSION_MAX_AGE });
  jar.set("smz_locale", user.locale === "ru" ? "ru" : "az", { ...base, httpOnly: false, maxAge: YEAR });
  jar.set("smz_theme", user.theme === "dark" ? "dark" : "light", { ...base, httpOnly: false, maxAge: YEAR });
  return true;
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const jar = await cookies();
  const payload = readToken(jar.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const user = findUserById(payload.sub);
  if (!user || !user.active || user.session_version !== payload.sv) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    permissions: permissionsFor(user.role),
    locale: user.locale,
    theme: user.theme,
  };
}

export async function getLocale() {
  const jar = await cookies();
  return jar.get("smz_locale")?.value === "ru" ? "ru" : "az";
}

export async function getTheme() {
  const jar = await cookies();
  return jar.get("smz_theme")?.value === "dark" ? "dark" : "light";
}

export async function setPreferenceCookie(name, value) {
  const jar = await cookies();
  const base = await cookieBase();
  jar.set(name, value, { ...base, httpOnly: false, maxAge: YEAR });
}
