import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { listPendingEvents } from "@/lib/recognition";
import { getCurrentUser } from "@/lib/session";

export const instant = false;

export async function GET() {
  await connection();
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });
  if (!can(user, "monitoring.view") && !can(user, "attendance.view")) return Response.json({ ok: false }, { status: 403 });
  return Response.json({ ok: true, events: listPendingEvents() }, { headers: { "cache-control": "no-store" } });
}
