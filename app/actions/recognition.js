"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/guard";
import { confirmRecognition, rejectRecognition } from "@/lib/recognition";

function refresh() {
  revalidatePath("/", "layout");
}

export async function submitRecognitionConfirm(_previous, formData) {
  const context = await actionContext("attendance.manual");
  if (context.error) return { ok: false, error: context.error };
  const result = confirmRecognition(String(formData.get("id") || ""), context.meta, context.user);
  if (result.ok) refresh();
  return result;
}

export async function submitRecognitionReject(_previous, formData) {
  const context = await actionContext("attendance.manual");
  if (context.error) return { ok: false, error: context.error };
  const result = rejectRecognition(String(formData.get("id") || ""), context.meta, context.user);
  if (result.ok) refresh();
  return result;
}
