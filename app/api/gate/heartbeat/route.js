import { connection } from "next/server";
import { gateAuthorized, noteHeartbeat } from "@/lib/gate-store";

export const instant = false;

export async function POST(request) {
  await connection();
  if (!gateAuthorized(request.headers.get("authorization"))) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const cameras = Array.isArray(body.cameras) ? body.cameras.slice(0, 4).map((camera) => ({
    id: String(camera?.id || "").slice(0, 80),
    ai: camera?.ai === "ready" ? "ready" : "unavailable",
  })) : [];
  return Response.json(noteHeartbeat({ cameras, stats: body.stats && typeof body.stats === "object" ? body.stats : null }), { headers: { "cache-control": "no-store" } });
}
