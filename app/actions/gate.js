"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/guard";
import { setGateDesired } from "@/lib/gate-store";

export async function submitGateDesired(formData) {
  const context = await actionContext("settings.manage");
  if (context.error || context.user.role !== "owner") return { ok: false, error: context.error || "forbidden" };
  const result = setGateDesired(formData.get("desired"), context.meta);
  revalidatePath("/", "layout");
  return result;
}
