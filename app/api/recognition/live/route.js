import { connection } from "next/server";
import { rememberedCards } from "@/lib/gate-store";
import { listAutomaticEvents } from "@/lib/passages";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

export const instant = false;

export async function GET() {
  await connection();
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });
  if (!can(user, "monitoring.view") && !can(user, "cameras.view")) return Response.json({ ok: false }, { status: 403 });
  const saved = listAutomaticEvents(8);
  const waiting = rememberedCards().filter((card) => card.status !== "registered" && !saved.some((row) => row.employeeId && row.employeeId === card.employeeId));
  return Response.json({ ok: true, events: [...waiting, ...saved] }, { headers: { "cache-control": "no-store" } });
}
