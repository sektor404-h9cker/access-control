"use server";

import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { clientIp } from "@/lib/meta";
import { verifyPassword } from "@/lib/passwords";
import { clearFailures, recordFailure, tooManyAttempts } from "@/lib/rate-limit";
import { clearSession, getCurrentUser, getLocale, getTheme, issueSession } from "@/lib/session";
import { createFirstAdmin, findUserByUsername, revokeUserSession } from "@/lib/users";

export async function login(_previous, formData) {
  const ip = await clientIp();
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (tooManyAttempts(`ip:${ip}`, 20) || tooManyAttempts(`user:${username}`, 8)) {
    return { ok: false, error: "rate_limited" };
  }
  const user = findUserByUsername(username);
  const valid = Boolean(user?.active) && await verifyPassword(password, user?.password_hash);
  if (!valid) {
    recordFailure(`ip:${ip}`, 20);
    recordFailure(`user:${username}`, 8);
    writeAudit({ username, action: "auth.login_failed", details: { username }, ip });
    return { ok: false, error: "invalid_credentials" };
  }
  clearFailures(`ip:${ip}`);
  clearFailures(`user:${username}`);
  await issueSession(user.id);
  writeAudit({ userId: user.id, username: user.username, action: "auth.login", ip });
  redirect("/");
}

export async function setup(_previous, formData) {
  const ip = await clientIp();
  if (tooManyAttempts(`setup:${ip}`, 10)) return { ok: false, error: "rate_limited" };
  const result = await createFirstAdmin({
    username: formData.get("username"),
    displayName: formData.get("display_name"),
    password: String(formData.get("password") || ""),
    confirmPassword: String(formData.get("confirm_password") || ""),
    locale: await getLocale(),
    theme: await getTheme(),
  }, { ip });
  if (!result.ok) {
    recordFailure(`setup:${ip}`, 10);
    return result;
  }
  await issueSession(result.user.id);
  redirect("/");
}

export async function logout() {
  const user = await getCurrentUser();
  const ip = await clientIp();
  if (user) {
    writeAudit({ userId: user.id, username: user.username, action: "auth.logout", ip });
    revokeUserSession(user.id);
  }
  await clearSession();
  redirect("/login");
}
