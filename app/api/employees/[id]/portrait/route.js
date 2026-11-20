import fs from "node:fs";
import { connection } from "next/server";
import { get } from "@/lib/db";
import { getEmployeeRow } from "@/lib/employees";
import { photoPath, photoType } from "@/lib/photos";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

export const instant = false;

export async function GET(_request, { params }) {
  await connection();
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const recent = get(
    `SELECT created_at FROM recognition_events
     WHERE employee_id = ? AND outcome = 'matched'
     ORDER BY created_at DESC LIMIT 1`,
    [id],
  );
  const fresh = recent ? Date.now() - Date.parse(recent.created_at) < 15 * 60 * 1000 : false;
  const allowed = can(user, "enrollment.manage") || (can(user, "monitoring.view") && fresh);
  if (!allowed) return new Response("Forbidden", { status: 403 });
  const employee = getEmployeeRow(id);
  const full = photoPath(employee?.photo_file);
  if (!employee || !full || !fs.existsSync(full)) return new Response("Not found", { status: 404 });
  const bytes = fs.readFileSync(full);
  return new Response(bytes, {
    headers: {
      "Content-Type": photoType(employee.photo_file),
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
