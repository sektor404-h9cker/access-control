import { connection } from "next/server";
import { get } from "@/lib/db";
import { claimVision, gateAuthorized, latestFrame, liveCameraIds } from "@/lib/gate-store";
import { notePresence } from "@/lib/presence";
import { publishVision } from "@/lib/vision-pass";

export const instant = false;

function presentedToken(request) {
  const header = request.headers.get("authorization") || "";
  if (header) return header;
  const raw = request.headers.get("cookie") || "";
  const match = raw.match(/(?:^|;\s*)smz_gate=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export async function GET(request) {
  await connection();
  if (!gateAuthorized(presentedToken(request))) return Response.json({ ok: false }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get("list") === "1") {
    return Response.json({ ok: true, cameras: liveCameraIds() }, { headers: { "cache-control": "no-store" } });
  }
  const cameraId = String(url.searchParams.get("camera") || "");
  const frame = latestFrame(cameraId);
  if (!frame) return new Response(null, { status: 404 });
  const seq = String(frame.camera.seq || "");
  if (seq && url.searchParams.get("since") === seq) {
    return new Response(null, { status: 204, headers: { "x-frame-seq": seq, "cache-control": "no-store" } });
  }
  return new Response(frame.bytes, { headers: { "content-type": "image/jpeg", "cache-control": "no-store", "x-frame-seq": seq } });
}

export async function POST(request) {
  await connection();
  if (!gateAuthorized(presentedToken(request))) return Response.json({ ok: false }, { status: 401 });
  const body = await request.json().catch(() => null);
  const cameraId = String(body?.cameraId || "");
  const camera = get("SELECT id FROM cameras WHERE id = ?", [cameraId]);
  if (!camera) return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  const leader = claimVision(cameraId, "gate-service");
  if (!leader) return Response.json({ ok: true, leader: false });
  if (body?.presence === true) {
    notePresence(cameraId, body.employeeIds || [], Number(body.pendingFaces) || 0);
    return Response.json({ ok: true, leader: true, service: true }, { headers: { "cache-control": "no-store" } });
  }
  const published = await publishVision(cameraId, body?.result || {});
  return Response.json({ ok: true, leader: true, service: true, ...published }, { headers: { "cache-control": "no-store" } });
}
