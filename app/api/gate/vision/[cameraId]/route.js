import { connection } from "next/server";
import { get } from "@/lib/db";
import { latestVision } from "@/lib/gate-store";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

export const instant = false;

export async function GET(_request, { params }) {
  await connection();
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });
  if (!can(user, "monitoring.view") && !can(user, "cameras.view")) return Response.json({ ok: false }, { status: 403 });
  const { cameraId } = await params;
  const camera = get("SELECT id FROM cameras WHERE id = ?", [cameraId]);
  if (!camera) return Response.json({ ok: false }, { status: 404 });
  return Response.json({ ok: true, vision: latestVision(cameraId) }, { headers: { "cache-control": "no-store" } });
}
