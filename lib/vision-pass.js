import { get } from "./db.js";
import { rememberCards, noteVision } from "./gate-store.js";
import { observePassage, observeUnknown } from "./passage-track.js";
import { notePresence } from "./presence.js";
import { ACCEPT_COSINE } from "./face-match.js";
import { identifyProbe } from "./recognition.js";

function cardStatus(passage) {
  if (passage?.already || passage?.saved || passage?.recorded) return "registered";
  if (passage && passage.ok === false) return "error";
  if (passage?.action === "paused") return "paused";
  return "identity";
}

export async function publishVision(cameraId, incoming = {}) {
  const camera = get("SELECT id, code, direction FROM cameras WHERE id = ?", [cameraId]);
  if (!camera) return { ok: false, error: "invalid" };
  const faces = [];
  const traces = [];
  const proposals = [];
  const sourceFaces = (Array.isArray(incoming.faces) ? incoming.faces : []).slice(0, 4);
  for (const face of sourceFaces) {
    let identity = { name: "", outcome: "unchecked", score: null, secondScore: null, enrolled: false, reason: face?.reason || "NO_FACE", embedMs: 0, matchMs: 0, templateCount: 0, decryptFailed: 0 };
    const warp = String(face?.warp || "");
    if (warp && face?.aligned) {
      const bytes = Buffer.from(warp, "base64");
      if (bytes.length >= 32 && bytes.length <= 200_000 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        const probe = await identifyProbe(bytes);
        if (probe.ok) {
          identity = probe;
          if (probe.outcome === "matched" && probe.employeeId && !proposals.some((item) => item.employeeId === probe.employeeId)) {
            proposals.push({ ...probe, trackId: face.trackId, seenAt: Number(face.seenAt) || 0 });
          }
        } else identity = { ...identity, outcome: probe.error || "failed", reason: "EMBEDDING_FAILED" };
      } else identity = { ...identity, reason: "EMBEDDING_FAILED" };
    } else if (face?.reason === "LOW_DETECTION_CONFIDENCE") identity = { ...identity, reason: "LOW_DETECTION_CONFIDENCE" };
    else if (face?.box && !face?.aligned) identity = { ...identity, reason: "ALIGNMENT_FAILED" };
    faces.push({
      box: face?.box || null,
      trackId: String(face?.trackId || ""),
      name: identity.outcome === "matched" ? identity.name || "" : "",
      outcome: identity.outcome === "matched" ? "preliminary" : identity.outcome || "unchecked",
      score: identity.score ?? null,
      enrolled: identity.enrolled === true,
      employeeId: identity.outcome === "matched" ? identity.employeeId || "" : "",
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
  const cards = [];
  const side = camera.direction === "exit" ? "exit" : "entrance";
  for (const proposal of proposals) {
    const passage = observePassage(cameraId, { ...proposal, direction: side });
    if (!alert && passage?.alert?.id && passage.alert.sound) alert = passage.alert;
    const status = cardStatus(passage);
    if (status === "registered") {
      for (const face of faces) {
        if (face.employeeId === proposal.employeeId) face.outcome = "matched";
      }
      for (const trace of traces) {
        if (trace.reason === "MATCH_CONFIRMED") trace.stable = true;
      }
    }
    const employee = get(
      "SELECT e.position AS position, d.name AS department FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE e.id = ?",
      [proposal.employeeId],
    );
    cards.push({
      id: passage?.id || `wait:${proposal.employeeId}:${cameraId}`,
      employeeId: proposal.employeeId,
      name: passage?.name || proposal.name || "",
      department: employee?.department || "",
      position: employee?.position || "",
      cameraCode: passage?.cameraCode || camera.code || "",
      direction: passage?.direction || (camera.direction === "exit" ? "out" : "in"),
      outcome: passage?.outcome || proposal.outcome,
      at: passage?.at || null,
      status,
      reason: passage?.action || passage?.error || passage?.note || "",
      error: passage?.ok === false ? passage.error || "rejected" : "",
    });
  }
  for (const face of faces) {
    if (face.outcome !== "unknown" || !face.trackId) continue;
    const signal = observeUnknown(cameraId, face.trackId, side);
    if (!alert && signal?.id && signal.sound) alert = signal;
  }
  for (const trace of traces) trace.published = cards.some((card) => card.status === "registered") && trace.reason === "MATCH_CONFIRMED";
  const identified = faces.filter((face) => face.employeeId).map((face) => face.employeeId);
  const pendingFaces = faces.filter((face) => face.box && !face.employeeId && face.outcome !== "unknown" && face.outcome !== "ambiguous").length;
  notePresence(cameraId, identified, pendingFaces);
  rememberCards(cards);
  const vision = noteVision(cameraId, { ...incoming, faces, alert });
  return { ok: true, vision, alert, card: cards[0] || null, cards, traces };
}
