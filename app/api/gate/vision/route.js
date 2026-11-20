import { connection } from "next/server";
import { get } from "@/lib/db";
import { claimVision } from "@/lib/gate-store";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { publishVision } from "@/lib/vision-pass";

export const instant = false;

export async function POST(request) {
  await connection();
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });
  if (!can(user, "monitoring.view") && !can(user, "cameras.view")) return Response.json({ ok: false }, { status: 403 });
  const body = await request.json().catch(() => null);
  const cameraId = String(body?.cameraId || "");
  const camera = get("SELECT id FROM cameras WHERE id = ?", [cameraId]);
  if (!camera) return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  const leader = claimVision(cameraId, body?.tabId);
  if (!leader) return Response.json({ ok: true, leader: false });
  if (!body?.result) return Response.json({ ok: true, leader: true });
  const published = await publishVision(cameraId, body.result || {});
  return Response.json({ ok: true, leader: true, ...published }, { headers: { "cache-control": "no-store" } });
}
