import { connection } from "next/server";
import { latestCursor, listRecognitionEvents } from "@/lib/recognition";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

export const instant = false;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  await connection();
  const user = await getCurrentUser();
  if (!user) return json({ ok: false }, 401);
  if (!can(user, "monitoring.view")) return json({ ok: false }, 403);
  return json({ ok: true, cursor: latestCursor(), events: listRecognitionEvents(20) });
}
