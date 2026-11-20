"use server";

import { revalidatePath } from "next/cache";
import { recordMovement, updateAttendance } from "@/lib/attendance";
import { removeDayMark, saveDayMark } from "@/lib/calendar";
import { actionContext } from "@/lib/guard";
import { fromLocalInput } from "@/lib/time";

function refresh() {
  revalidatePath("/", "layout");
}

export async function submitMovement(_previous, formData) {
  const context = await actionContext("attendance.manual");
  if (context.error) return { ok: false, error: context.error };
  const at = fromLocalInput(String(formData.get("at") || ""));
  if (!at) return { ok: false, error: "invalid_time" };
  const result = recordMovement({
    employeeId: String(formData.get("employee_id") || ""),
    direction: String(formData.get("direction") || ""),
    at,
    note: formData.get("note"),
    source: "manual",
    meta: context.meta,
  });
  if (result.ok) refresh();
  return result;
}

export async function submitAttendanceEdit(_previous, formData) {
  const context = await actionContext("attendance.edit");
  if (context.error) return { ok: false, error: context.error };
  const checkIn = fromLocalInput(String(formData.get("check_in") || ""));
  const checkOutRaw = String(formData.get("check_out") || "");
  const checkOut = checkOutRaw ? fromLocalInput(checkOutRaw) : "";
  if (!checkIn || (checkOutRaw && !checkOut)) return { ok: false, error: "invalid_time" };
  const result = updateAttendance({
    id: String(formData.get("id") || ""),
    checkIn,
    checkOut,
    note: formData.get("note"),
    reason: formData.get("reason"),
    meta: context.meta,
  });
  if (result.ok) refresh();
  return result;
}

export async function submitDayMark(_previous, formData) {
  const context = await actionContext("attendance.edit");
  if (context.error) return { ok: false, error: context.error };
  const result = saveDayMark({
    date: String(formData.get("date") || ""),
    employeeId: String(formData.get("employee_id") || ""),
    kind: String(formData.get("kind") || ""),
    note: formData.get("note"),
    meta: context.meta,
  });
  if (result.ok) refresh();
  return result;
}

export async function deleteDayMark(formData) {
  const context = await actionContext("attendance.edit");
  if (context.error) return { ok: false, error: context.error };
  const result = removeDayMark(String(formData.get("id") || ""), context.meta);
  if (result.ok) refresh();
  return result;
}
