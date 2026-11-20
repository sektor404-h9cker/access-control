import fs from "node:fs";
import { connection } from "next/server";
import { getEmployeeRow } from "@/lib/employees";
import { photoPath, photoType } from "@/lib/photos";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

export async function GET(_request, { params }) {
  await connection();
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "enrollment.manage")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
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
