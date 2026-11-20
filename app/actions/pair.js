"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/guard";
import { createPairing } from "@/lib/pair";

export async function submitPairing(_previous, formData) {
  const context = await actionContext("enrollment.manage");
  if (context.error) return { ok: false, error: context.error };
  const result = createPairing(String(formData.get("employee_id") || ""), context.meta);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
