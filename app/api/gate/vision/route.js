import { connection } from "next/server";
import { get } from "@/lib/db";
import { claimVision, noteVision } from "@/lib/gate-store";
import { can } from "@/lib/permissions";
import { observePassage } from "@/lib/passage-track";
import { identifyProbe } from "@/lib/recognition";
import { getCurrentUser } from "@/lib/session";
import { getAiSettings } from "@/lib/vision-settings";

export const instant = false;

export async function POST(request) {
  await connection();
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });
  if (!can(user, "monitoring.view") && !can(user, "cameras.view")) return Response.json({ ok: false }, { status: 403 });
  const body = await request.json().catch(() => null);
  const cameraId = String(body?.cameraId || "");
  const camera = get("SELECT id, direction FROM cameras WHERE id = ?", [cameraId]);
  if (!camera) return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  const leader = claimVision(cameraId, body?.tabId);
  if (!leader) return Response.json({ ok: true, leader: false });
  if (!body?.result) return Response.json({ ok: true, leader: true });
  const settings = getAiSettings();
  const incoming = body.result || {};
  const faces = [];
  let proposal = null;
  for (const face of (Array.isArray(incoming.faces) ? incoming.faces : []).slice(0, 2)) {
    let identity = { name: "", outcome: "unchecked", score: null, enrolled: false };
    const warp = String(face?.warp || "");
    if (settings.face && warp) {
      const bytes = Buffer.from(warp, "base64");
      if (bytes.length >= 32 && bytes.length <= 200_000 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        const probe = await identifyProbe(bytes);
        if (probe.ok) {
          identity = probe;
          if (!proposal && probe.outcome === "matched" && probe.employeeId) proposal = probe;
        }
        else identity = { ...identity, outcome: probe.error || "failed" };
      }
    }
    faces.push({
      box: face?.box || null,
      name: identity.outcome === "matched" ? identity.name || "" : "",
      outcome: identity.outcome || "unchecked",
      score: identity.score ?? null,
      enrolled: identity.enrolled === true,
    });
  }
  let alert = null;
  let card = null;
  const side = camera.direction === "exit" ? "exit" : "entrance";
  if (proposal) {
    const passage = observePassage(cameraId, { ...proposal, direction: side });
    if (passage?.alert?.id && passage.alert.sound) alert = passage.alert;
    if (passage?.id) {
      const department = get(
        "SELECT d.name AS name FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE e.id = ?",
        [passage.employeeId],
      )?.name || "";
      card = {
        id: passage.id,
        name: passage.name || proposal.name || "",
        department,
        cameraCode: passage.cameraCode || "",
        direction: passage.direction || (camera.direction === "exit" ? "out" : "in"),
        outcome: passage.outcome || proposal.outcome,
        at: passage.at,
      };
    }
  }
  const vision = noteVision(cameraId, { ...incoming, faces, alert });
  return Response.json({ ok: true, leader: true, vision, alert, card }, { headers: { "cache-control": "no-store" } });
}
