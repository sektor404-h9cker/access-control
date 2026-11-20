"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionContext } from "@/lib/guard";
import { completeEnrollment } from "@/lib/enrollment";
import { deleteEmployeeTemplates } from "@/lib/face-store";
import { deleteEmployeeRecord, importEmployees, saveEmployee, setEmployeeStatus } from "@/lib/employees";
import { saveWorkPolicy } from "@/lib/work-policy";
import { takePhoto } from "@/lib/photos";

function refresh() {
  revalidatePath("/", "layout");
}

function employeeInput(formData, photo) {
  return {
    id: String(formData.get("id") || ""),
    lastName: formData.get("last_name"),
    firstName: formData.get("first_name"),
    patronymic: formData.get("patronymic"),
    departmentId: String(formData.get("department_id") || ""),
    position: formData.get("position"),
    personnelNumber: formData.get("personnel_number"),
    phone: formData.get("phone"),
    scheduleStart: formData.get("schedule_start"),
    scheduleEnd: formData.get("schedule_end"),
    graceMinutes: formData.get("grace_minutes"),
    removePhoto: formData.get("remove_photo") === "1",
    photo: photo?.photo || null,
    biometricPresent: formData.get("biometric_present") === "1",
    biometricAllowed: formData.get("biometric_allowed") === "1",
  };
}

async function samplesFrom(formData) {
  const count = Number(formData.get("sample_count") || 0);
  if (!count) return [];
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const file = await takePhoto(formData.get(`sample_${index}`));
    if (!file.ok || !file.photo) return null;
    let points;
    try {
      points = JSON.parse(String(formData.get(`points_${index}`) || ""));
    } catch {
      return null;
    }
    samples.push({ bytes: file.photo.bytes, points });
  }
  return samples;
}

export async function submitEmployee(_previous, formData) {
  const id = String(formData.get("id") || "");
  const context = await actionContext(id ? "employees.update" : "employees.create");
  if (context.error) return { ok: false, error: context.error };
  const photo = await takePhoto(formData.get("photo"));
  if (!photo.ok) return { ok: false, error: photo.error, fields: { photo: photo.error } };
  const result = saveEmployee(employeeInput(formData, photo), context.meta);
  if (result.ok) refresh();
  return result;
}

export async function submitEnrollment(_previous, formData) {
  const context = await actionContext("enrollment.manage");
  if (context.error) return { ok: false, error: context.error };
  const photo = await takePhoto(formData.get("photo"));
  if (!photo.ok || !photo.photo) return { ok: false, error: photo.error || "photo_type" };
  const mode = String(formData.get("mode") || "");
  const samples = mode === "scan" ? await samplesFrom(formData) : [];
  if (mode === "scan" && !samples) return { ok: false, error: "samples_required" };
  const result = await completeEnrollment({
    employeeId: String(formData.get("employee_id") || ""),
    clientToken: String(formData.get("client_token") || ""),
    mode,
    poses: String(formData.get("poses") || "").split(",").filter(Boolean),
    qualityNote: formData.get("quality_note"),
    photo: photo.photo,
    samples,
    confirmReplace: formData.get("confirm_replace") === "1",
  }, context.meta);
  if (result.ok) refresh();
  return result;
}

export async function archiveEmployee(formData) {
  const context = await actionContext("employees.archive");
  const id = String(formData.get("id") || "");
  if (context.error) redirect(`/employees?error=${context.error}`);
  const result = setEmployeeStatus(id, "archived", context.meta);
  if (!result.ok) redirect(`/employees?error=${result.error}`);
  refresh();
}

export async function submitImport(_previous, formData) {
  const file = formData.get("file");
  if (!file || typeof file.text !== "function" || file.size > 1_000_000) {
    return { ok: false, error: "import_failed" };
  }
  const context = await actionContext("employees.create");
  const updateContext = await actionContext("employees.update");
  if (context.error && updateContext.error) return { ok: false, error: "forbidden" };
  const actor = context.error ? updateContext : context;
  const result = importEmployees(await file.text(), actor.meta, {
    create: !context.error,
    update: !updateContext.error,
  });
  if (result.ok) refresh();
  return result;
}

export async function submitWorkPolicy(_previous, formData) {
  const context = await actionContext("employees.policy");
  if (context.error) return { ok: false, error: context.error };
  const result = saveWorkPolicy({
    employeeId: String(formData.get("id") || ""),
    leadership: formData.get("leadership") === "1",
    flexTime: formData.get("flex_time") === "1",
    effectiveFrom: String(formData.get("effective_from") || ""),
  }, context.meta, context.user);
  if (result.ok) refresh();
  return result;
}

export async function removeEmployee(formData) {
  const context = await actionContext("employees.archive");
  const id = String(formData.get("id") || "");
  if (context.error) redirect(`/employees/${id}?error=${context.error}`);
  const result = deleteEmployeeRecord(id, context.meta);
  if (!result.ok) redirect(`/employees/${id}?error=${result.error}`);
  refresh();
  redirect("/employees");
}

export async function revokeBiometric(formData) {
  const context = await actionContext("enrollment.manage");
  const id = String(formData.get("id") || "");
  if (context.error) redirect(`/employees/${id}?error=${context.error}`);
  const result = deleteEmployeeTemplates(id, context.meta);
  if (!result.ok) redirect(`/employees/${id}?error=${result.error}`);
  refresh();
}

export async function restoreEmployee(formData) {
  const context = await actionContext("employees.archive");
  const id = String(formData.get("id") || "");
  if (context.error) redirect(`/employees?error=${context.error}`);
  const result = setEmployeeStatus(id, "active", context.meta);
  if (!result.ok) redirect(`/employees?error=${result.error}`);
  refresh();
}
