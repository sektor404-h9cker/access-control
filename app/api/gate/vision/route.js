import { connection } from "next/server";
import { get } from "@/lib/db";
import { claimVision, noteVision } from "@/lib/gate-store";
import { can } from "@/lib/permissions";
import { observePassage } from "@/lib/passage-track";
import { ACCEPT_COSINE } from "@/lib/face-match";
import { identifyProbe } from "@/lib/recognition";
import { getCurrentUser } from "@/lib/session";
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
  const incoming = body.result || {};
  const faces = [];
  const traces = [];
  let proposal = null;
  for (const face of (Array.isArray(incoming.faces) ? incoming.faces : []).slice(0, 2)) {
    let identity = { name: "", outcome: "unchecked", score: null, secondScore: null, enrolled: false, reason: face?.reason || "NO_FACE", embedMs: 0, matchMs: 0, templateCount: 0, decryptFailed: 0 };
    const warp = String(face?.warp || "");
    if (warp && face?.aligned) {
      const bytes = Buffer.from(warp, "base64");
      if (bytes.length >= 32 && bytes.length <= 200_000 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        const probe = await identifyProbe(bytes);
        if (probe.ok) {
          identity = probe;
          if (!proposal && probe.outcome === "matched" && probe.employeeId) proposal = probe;
        } else identity = { ...identity, outcome: probe.error || "failed", reason: "EMBEDDING_FAILED" };
      } else identity = { ...identity, reason: "EMBEDDING_FAILED" };
    } else if (face?.reason === "LOW_DETECTION_CONFIDENCE") identity = { ...identity, reason: "LOW_DETECTION_CONFIDENCE" };
    else if (face?.box && !face?.aligned) identity = { ...identity, reason: "ALIGNMENT_FAILED" };
    faces.push({
      box: face?.box || null,
      name: identity.outcome === "matched" ? identity.name || "" : "",
      outcome: identity.outcome === "matched" ? "preliminary" : identity.outcome || "unchecked",
      score: identity.score ?? null,
      enrolled: identity.enrolled === true,
    });
    traces.push({
      detected: Boolean(face?.box),
      detectionConfidence: Number.isFinite(Number(face?.confidence)) ? Number(face.confidence) : null,
      facePx: Number(face?.facePx) || 0,
      aligned: face?.aligned === true,
      embedded: identity.reason !== "EMBEDDING_FAILED" && identity.reason !== "NO_FACE" && identity.reason !== "ALIGNMENT_FAILED" && identity.reason !== "LOW_DETECTION_CONFIDENCE",
      templateCount: identity.templateCount || 0,
      decryptFailed: identity.decryptFailed || 0,
      bestScore: identity.score ?? null,
      secondScore: identity.secondScore ?? null,
      threshold: ACCEPT_COSINE,
      reason: identity.reason || "NO_FACE",
      stable: false,
      timing: {
        detectMs: Number(face?.detectMs) || 0,
        alignMs: Number(face?.alignMs) || 0,
        embedMs: identity.embedMs || 0,
        matchMs: identity.matchMs || 0,
        totalMs: (Number(face?.detectMs) || 0) + (Number(face?.alignMs) || 0) + (identity.embedMs || 0) + (identity.matchMs || 0),
      },
    });
  }
  if (!faces.length) {
    traces.push({
      detected: false,
      detectionConfidence: null,
      facePx: 0,
      aligned: false,
      embedded: false,
      templateCount: 0,
      decryptFailed: 0,
      bestScore: null,
      secondScore: null,
      threshold: ACCEPT_COSINE,
      reason: "NO_FACE",
      stable: false,
      timing: { detectMs: Number(incoming.timing?.faceMs) || 0, alignMs: 0, embedMs: 0, matchMs: 0, totalMs: Number(incoming.timing?.totalMs) || 0 },
    });
  }
  let alert = null;
  let card = null;
  const side = camera.direction === "exit" ? "exit" : "entrance";
  if (proposal) {
    const passage = observePassage(cameraId, { ...proposal, direction: side });
    if (passage?.alert?.id && passage.alert.sound) alert = passage.alert;
    if (passage?.id) {
      for (const face of faces) {
        if (face.outcome === "preliminary") face.outcome = "matched";
      }
      for (const trace of traces) {
        if (trace.reason === "MATCH_CONFIRMED") trace.stable = true;
      }
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
  return Response.json({ ok: true, leader: true, vision, alert, card, traces }, { headers: { "cache-control": "no-store" } });
}
