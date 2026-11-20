import { connection } from "next/server";
import { get } from "@/lib/db";
import { gateAuthorized, noteFrame } from "@/lib/gate-store";
import { tooManyHits } from "@/lib/rate-limit";

export const instant = false;

export async function POST(request) {
  await connection();
  if (!gateAuthorized(request.headers.get("authorization"))) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const cameraId = String(request.headers.get("x-camera-id") || "");
  const camera = get("SELECT id FROM cameras WHERE id = ?", [cameraId]);
  if (!camera) return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  if (tooManyHits(`gate:${cameraId}`, 30, 1000)) return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length > 1_500_000) return Response.json({ ok: false, error: "photo_size" }, { status: 413 });
  const result = noteFrame(cameraId, bytes, {
    width: Number(request.headers.get("x-width") || 0),
    height: Number(request.headers.get("x-height") || 0),
    capturedAt: Number(request.headers.get("x-captured-at") || 0),
    encodeFps: Number(request.headers.get("x-encode-fps") || 0),
    dropped: Number(request.headers.get("x-dropped") || 0),
  });
  return Response.json(result, { status: result.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
