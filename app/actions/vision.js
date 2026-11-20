"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/guard";
import { closeHelpRequest, confirmHelpRequest, createHelpRequest } from "@/lib/help-requests";
import { can } from "@/lib/permissions";
import { updateAiSettings, updatePerformanceProfile, updateVisionSettings } from "@/lib/vision-settings";

function operator(context) {
  return context.user?.role === "owner" || can(context.user, "attendance.manual");
}

export async function submitVisionSettings(formData) {
  const context = await actionContext("settings.manage");
  if (context.error || context.user.role !== "owner") return { ok: false, error: context.error || "forbidden" };
  const result = updateVisionSettings({
    sound: formData.get("sound") === "1",
    tone: String(formData.get("tone") || "soft"),
    volume: Number(formData.get("volume")),
    cooldownSeconds: Number(formData.get("cooldown")),
    sensitivity: String(formData.get("sensitivity") || "medium"),
    assistHoldMs: Number(formData.get("assist_hold")),
  }, context.meta);
  if (result.ok) revalidatePath("/vision");
  return result;
}

export async function submitAiSettings(formData) {
  const context = await actionContext("settings.manage");
  if (context.error || context.user.role !== "owner") return { ok: false, error: context.error || "forbidden" };
  const result = updateAiSettings({
    face: formData.get("face") === "1",
    analysisFps: Number(formData.get("analysis_fps")),
    performance: String(formData.get("performance") || "balanced"),
  }, context.meta);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function submitPerformanceProfile(formData) {
  const context = await actionContext("settings.manage");
  if (context.error || context.user.role !== "owner") return { ok: false, error: context.error || "forbidden" };
  const result = updatePerformanceProfile(String(formData.get("performance") || ""), context.meta);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function requestHelp(formData) {
  const context = await actionContext("monitoring.view");
  if (context.error) return { ok: false, error: context.error };
  return createHelpRequest({
    cameraId: formData.get("camera_id"),
    source: "button",
  }, context.meta);
}

export async function confirmHelp(formData) {
  const context = await actionContext("attendance.manual");
  if (context.error || !operator(context)) return { ok: false, error: context.error || "forbidden" };
  const result = confirmHelpRequest(formData.get("id"), context.meta);
  if (result.ok) revalidatePath("/monitoring");
  return result;
}

export async function closeHelp(formData) {
  const context = await actionContext("attendance.manual");
  if (context.error || !operator(context)) return { ok: false, error: context.error || "forbidden" };
  const result = closeHelpRequest(formData.get("id"), context.meta);
  if (result.ok) revalidatePath("/monitoring");
  return result;
}
