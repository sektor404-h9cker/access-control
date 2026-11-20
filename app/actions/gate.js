"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/guard";
import { setGateDesired } from "@/lib/gate-store";

export async function pauseGateForEnrollment() {
  const context = await actionContext("enrollment.manage");
  if (context.error) return { ok: false, error: context.error };
  return setGateDesired("stopped", context.meta);
}

export async function resumeGateAfterEnrollment() {
  const context = await actionContext("enrollment.manage");
  if (context.error) return { ok: false, error: context.error };
  return setGateDesired("running", context.meta);
}

export async function submitGateDesired(formData) {
  const context = await actionContext("settings.manage");
  if (context.error || context.user.role !== "owner") return { ok: false, error: context.error || "forbidden" };
  const result = setGateDesired(formData.get("desired"), context.meta);
  revalidatePath("/", "layout");
  return result;
}
