"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { createBackup } from "@/lib/backup";
import { actionContext } from "@/lib/guard";
import { updateAlertSettings } from "@/lib/alerts";
import { purgeDemoData } from "@/lib/demo-purge";
import { clearOwnerData } from "@/lib/owner-data";
import { updateCamera, updateDashboardCameras, updateOrganization, updateRecognitionMode } from "@/lib/settings";
import { createRole, deleteRole, setRolePermissions } from "@/lib/access";
import { createUser, endUserSessions, resetUserPassword, setUserActive, updateUserAccount } from "@/lib/users";

function refresh() {
  revalidatePath("/", "layout");
}

export async function submitDashboardCameras(formData) {
  const context = await actionContext("settings.manage");
  if (context.error || context.user.role !== "owner") redirect(`/?error=${context.error || "forbidden"}`);
  const layout = String(formData.get("layout") || "");
  const visible = formData.get("visible");
  updateDashboardCameras({
    visible: visible == null || visible === "" ? null : visible === "1",
    layout: layout === "expanded" || layout === "compact" ? layout : null,
  }, context.meta);
  refresh();
}

export async function submitOrganization(_previous, formData) {
  const context = await actionContext("settings.manage");
  if (context.error) return { ok: false, error: context.error };
  const result = updateOrganization({
    enterpriseName: formData.get("enterprise_name"),
    workdayStart: formData.get("workday_start"),
    workdayEnd: formData.get("workday_end"),
    graceMinutes: formData.get("grace_minutes"),
  }, context.meta);
  if (result.ok) refresh();
  return result;
}

export async function submitCamera(_previous, formData) {
  const context = await actionContext("settings.manage");
  if (context.error) return { ok: false, error: context.error };
  const result = updateCamera({
    id: String(formData.get("id") || ""),
    source: String(formData.get("source") || "usb"),
    host: formData.get("host"),
    deviceLabel: formData.get("device_label"),
    deviceId: formData.get("device_id"),
    enabled: formData.get("enabled") === "1",
    direction: formData.get("direction"),
    takeover: formData.get("takeover") === "1",
  }, context.meta);
  if (result.ok) refresh();
  return result;
}

export async function submitBackup() {
  const context = await actionContext("backup.create");
  if (context.error) return { ok: false, error: context.error };
  try {
    const folder = createBackup();
    writeAudit({
      userId: context.user.id,
      username: context.user.username,
      action: "backup.create",
      entity: "backup",
      details: { folder },
      ip: context.meta.ip,
    });
    refresh();
    return { ok: true, folder };
  } catch {
    return { ok: false, error: "backup_failed" };
  }
}

export async function submitUser(_previous, formData) {
  const context = await actionContext("users.manage");
  if (context.error) return { ok: false, error: context.error };
  const result = await createUser({
    username: formData.get("username"),
    displayName: formData.get("display_name"),
    password: String(formData.get("password") || ""),
    confirmPassword: String(formData.get("confirm_password") || ""),
    role: String(formData.get("role") || ""),
    locale: context.user.locale,
    theme: context.user.theme,
  }, context.meta);
  if (result.ok) refresh();
  return result;
}

export async function deactivateUser(formData) {
  const context = await actionContext("users.manage");
  const id = String(formData.get("id") || "");
  if (context.error) redirect(`/settings?error=${context.error}`);
  const result = setUserActive(id, false, context.meta);
  if (!result.ok) redirect(`/settings?error=${result.error}`);
  refresh();
}

export async function submitRole(_previous, formData) {
  const context = await actionContext("roles.manage");
  if (context.error) return { ok: false, error: context.error };
  const result = createRole({
    nameRu: formData.get("name_ru"),
    nameAz: formData.get("name_az"),
    meta: context.meta,
  });
  if (result.ok) refresh();
  return result;
}

export async function submitRolePermissions(_previous, formData) {
  const context = await actionContext("roles.manage");
  if (context.error) return { ok: false, error: context.error };
  const result = setRolePermissions(String(formData.get("role_key") || ""), formData.getAll("perm"), context.meta);
  if (result.ok) refresh();
  return result;
}

export async function removeRole(formData) {
  const context = await actionContext("roles.manage");
  const key = String(formData.get("role_key") || "");
  if (context.error) redirect(`/settings?error=${context.error}`);
  const result = deleteRole(key, context.meta);
  if (!result.ok) redirect(`/settings?error=${result.error}`);
  refresh();
}

export async function submitRecognitionMode(_previous, formData) {
  const context = await actionContext("settings.manage");
  if (context.error) return { ok: false, error: context.error };
  if (context.user.role !== "owner") return { ok: false, error: "forbidden" };
  const result = updateRecognitionMode(String(formData.get("mode") || "review"), context.meta, formData.get("pace") === "close" ? "close" : "motion", formData.get("auto") === "1");
  if (result.ok) refresh();
  return result;
}

export async function submitAlert(_previous, formData) {
  const context = await actionContext("settings.manage");
  if (context.error) return { ok: false, error: context.error };
  const result = updateAlertSettings({
    enabled: formData.get("enabled") === "1",
    tone: String(formData.get("tone") || "soft"),
    volume: Number(formData.get("volume")),
    cooldownSeconds: Number(formData.get("cooldown")),
    deviceId: String(formData.get("device_id") || ""),
    voice: formData.get("voice") === "1",
    speakName: formData.get("speak_name") === "1",
    tones: {
      matched: String(formData.get("tone_matched") || formData.get("tone") || "soft"),
      unknown: String(formData.get("tone_unknown") || "digital"),
      ambiguous: String(formData.get("tone_ambiguous") || "double"),
      camera: String(formData.get("tone_camera") || "security"),
      confirmed: String(formData.get("tone_confirmed") || "chime"),
    },
    events: {
      unknown: formData.get("event_unknown") === "1",
      ambiguous: formData.get("event_ambiguous") === "1",
      confirmed: formData.get("event_confirmed") === "1",
      camera: formData.get("event_camera") === "1",
      matched: formData.get("event_matched") === "1",
    },
    cameras: {
      entrance: formData.get("cam_entrance") === "1",
      exit: formData.get("cam_exit") === "1",
    },
  }, context.meta);
  if (result.ok) refresh();
  return result;
}

export async function submitOwnerClear(_previous, formData) {
  const context = await actionContext("settings.manage");
  if (context.error) return { ok: false, error: context.error };
  const result = clearOwnerData(
    context.meta,
    context.user,
    String(formData.get("phrase") || "").trim(),
    formData.getAll("scope"),
  );
  if (result.ok) refresh();
  return result;
}

export async function submitPurgeDemo(_previous, formData) {
  const context = await actionContext("settings.manage");
  if (context.error) return { ok: false, error: context.error };
  const result = purgeDemoData(context.meta, context.user, String(formData.get("phrase") || "").trim());
  if (result.ok) refresh();
  return result;
}

export async function submitUserAccount(_previous, formData) {
  const context = await actionContext("users.manage");
  if (context.error) return { ok: false, error: context.error };
  const result = updateUserAccount(String(formData.get("id") || ""), {
    displayName: formData.get("display_name"),
    role: String(formData.get("role") || ""),
  }, context.meta);
  if (result.ok) refresh();
  return result;
}

export async function submitUserPassword(_previous, formData) {
  const context = await actionContext("users.manage");
  if (context.error) return { ok: false, error: context.error };
  const result = await resetUserPassword(
    String(formData.get("id") || ""),
    String(formData.get("password") || ""),
    String(formData.get("confirm_password") || ""),
    context.meta,
  );
  if (result.ok) refresh();
  return result;
}

export async function submitEndSessions(formData) {
  const context = await actionContext("users.manage");
  const id = String(formData.get("id") || "");
  if (context.error) redirect(`/settings?error=${context.error}`);
  const result = endUserSessions(id, context.meta);
  if (!result.ok) redirect(`/settings?error=${result.error}`);
  refresh();
}

export async function restoreUser(formData) {
  const context = await actionContext("users.manage");
  const id = String(formData.get("id") || "");
  if (context.error) redirect(`/settings?error=${context.error}`);
  const result = setUserActive(id, true, context.meta);
  if (!result.ok) redirect(`/settings?error=${result.error}`);
  refresh();
}
