import { connection } from "next/server";
import { gateSnapshot } from "@/lib/gate-store";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

export const instant = false;

export async function GET() {
  await connection();
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });
  if (!can(user, "monitoring.view") && !can(user, "cameras.view")) return Response.json({ ok: false }, { status: 403 });
  return Response.json({ ok: true, ...gateSnapshot() }, { headers: { "cache-control": "no-store" } });
}
