"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteDepartment, saveDepartment, setDepartmentArchived } from "@/lib/departments";
import { actionContext } from "@/lib/guard";

function refresh() {
  revalidatePath("/", "layout");
}

export async function submitDepartment(_previous, formData) {
  const context = await actionContext("departments.manage");
  if (context.error) return { ok: false, error: context.error };
  const result = saveDepartment({
    id: String(formData.get("id") || ""),
    name: formData.get("name"),
    scheduleStart: formData.get("schedule_start"),
    scheduleEnd: formData.get("schedule_end"),
    graceMinutes: formData.get("grace_minutes"),
  }, context.meta);
  if (result.ok) refresh();
  return result;
}

export async function removeDepartment(formData) {
  const context = await actionContext("departments.manage");
  const id = String(formData.get("id") || "");
  if (context.error) redirect(`/departments?error=${context.error}`);
  const result = deleteDepartment(id, context.meta);
  if (!result.ok) redirect(`/departments?id=${id}&error=${result.error}`);
  refresh();
  redirect("/departments");
}

export async function archiveDepartment(formData) {
  const context = await actionContext("departments.manage");
  const id = String(formData.get("id") || "");
  if (context.error) redirect(`/departments?error=${context.error}`);
  const result = setDepartmentArchived(id, true, context.meta);
  if (!result.ok) redirect(`/departments?id=${id}&error=${result.error}`);
  refresh();
}

export async function restoreDepartment(formData) {
  const context = await actionContext("departments.manage");
  const id = String(formData.get("id") || "");
  if (context.error) redirect(`/departments?error=${context.error}`);
  const result = setDepartmentArchived(id, false, context.meta);
  if (!result.ok) redirect(`/departments?id=${id}&error=${result.error}`);
  refresh();
}
