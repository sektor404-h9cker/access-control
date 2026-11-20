import { connection } from "next/server";
import { recognizeJpeg } from "@/lib/recognition";
import { tooManyHits } from "@/lib/rate-limit";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { clientIp } from "@/lib/meta";

export const instant = false;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  await connection();
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "forbidden" }, 401);
  if (!can(user, "monitoring.view")) return json({ ok: false, error: "forbidden" }, 403);
  if (tooManyHits(`recognize:${user.id}`, 300, 60_000)) return json({ ok: false, error: "rate_limited" }, 429);
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "invalid" }, 400);
  }
  const file = form.get("image");
  if (!file || typeof file.arrayBuffer !== "function" || file.size > 200_000) {
    return json({ ok: false, error: "frame_required" }, 400);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length < 32 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return json({ ok: false, error: "photo_type" }, 400);
  const result = await recognizeJpeg(bytes, {
    cameraId: String(form.get("camera_id") || ""),
    faceCount: Number(form.get("face_count") || 0),
    quality: String(form.get("quality") || "poor"),
    motion: Number(form.get("motion") || 0),
    blink: form.get("blink") === "1",
    probe: form.get("probe") === "1",
    subject: String(form.get("subject") || "").slice(0, 80),
    meta: { actor: { id: user.id, username: user.username }, ip: await clientIp() },
  });
  if (!result.ok) return json(result, result.error === "ip_stream_unavailable" ? 409 : 400);
  return json(result);
}
