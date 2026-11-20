import { connection } from "next/server";
import { employeesCsv } from "@/lib/employees";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  await connection();
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "employees.view")) return new Response("Forbidden", { status: 403 });
  return new Response(employeesCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"SMZ-employees.csv\"",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
