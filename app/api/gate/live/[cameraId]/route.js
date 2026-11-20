import { connection } from "next/server";
import { get } from "@/lib/db";
import { latestFrame, noteViewer } from "@/lib/gate-store";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

export const instant = false;

export async function GET(request, { params }) {
  await connection();
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "monitoring.view") && !can(user, "cameras.view")) return new Response("Forbidden", { status: 403 });
  const { cameraId } = await params;
  const camera = get("SELECT id FROM cameras WHERE id = ?", [cameraId]);
  if (!camera) return new Response("Not found", { status: 404 });
  const frame = latestFrame(cameraId);
  if (!frame) return new Response(null, { status: 204 });
  noteViewer(cameraId, request.headers.get("x-viewer"));
  const age = Date.now() - (frame.camera.lastFrameAt || Date.now());
  return new Response(frame.bytes, {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "no-store",
      "x-frame-age": String(Math.max(0, age)),
      "x-frame-at": String(frame.camera.capturedAt || frame.camera.lastFrameAt || Date.now()),
      "x-seq": String(frame.camera.seq || 0),
      "x-fps": String(frame.camera.fps || 0),
      "x-encode-fps": String(frame.camera.encodeFps || 0),
      "x-dropped": String(frame.camera.dropped || 0),
      "x-width": String(frame.camera.width || 0),
      "x-height": String(frame.camera.height || 0),
      "x-ai": frame.camera.ai || "unavailable",
    },
  });
}
