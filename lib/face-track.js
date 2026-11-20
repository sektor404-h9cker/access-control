const MATCH_DISTANCE = 0.2;
let serial = 1;

export function assignTracks(previous, faces) {
  const used = new Set();
  const tracks = [];
  for (const prior of previous) {
    let best = -1;
    let bestDistance = MATCH_DISTANCE;
    faces.forEach((face, index) => {
      if (used.has(index) || !face.box) return;
      const distance = Math.hypot(face.box.x - prior.x, face.box.y - prior.y);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    if (best >= 0) {
      used.add(best);
      tracks.push({
        id: prior.id,
        x: faces[best].box.x,
        y: faces[best].box.y,
        face: faces[best],
        sentAt: prior.sentAt || 0,
        hold: prior.hold || 0,
        agreeId: prior.agreeId || "",
        agree: prior.agree || 0,
        commit: Boolean(prior.commit),
        seenAt: prior.seenAt || 0,
        samples: prior.samples || 0,
        bestSharp: prior.bestSharp || 0,
      });
    }
  }
  for (const [index, face] of faces.entries()) {
    if (used.has(index) || !face.box) continue;
    tracks.push({
      id: `t${serial++}`,
      x: face.box.x,
      y: face.box.y,
      face,
      sentAt: 0,
      hold: 0,
      agreeId: "",
      agree: 0,
      commit: false,
      seenAt: 0,
      samples: 0,
      bestSharp: 0,
    });
  }
  return tracks;
}

export function readySample(track) {
  const face = track?.face;
  if (!face?.aligned || face.quality === "poor") return false;
  if (!["center", "left", "right", "off"].includes(face.code)) return false;
  if ((track.samples || 0) < 2) return false;
  const sharp = face.sharpness || 0;
  return sharp >= (track.bestSharp || sharp) * 0.75;
}

export function dueTracks(tracks, now) {
  return tracks.filter((track) => track.face && now - track.sentAt >= (track.hold || 0));
}

export function frameFresh(capturedAt, now, limit = 700) {
  return Number.isFinite(capturedAt) && now - capturedAt <= limit;
}

export function noteAgreement(track, result) {
  let key = "";
  let need = 3;
  if (result?.outcome === "matched" && result.employeeId) key = result.employeeId;
  else if (result?.outcome === "ambiguous" && result.employeeId) {
    key = `ambiguous:${result.employeeId}`;
    need = 2;
  } else if (result?.outcome === "unknown") {
    key = "unknown";
    need = 2;
  }
  if (!key) return { ...track, agreeId: "", agree: 0, commit: false };
  const agree = track.agreeId === key ? (track.agree || 0) + 1 : 1;
  return { ...track, agreeId: key, agree, commit: agree >= need };
}

export function summarizeLatency(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return { median: null, p95: null };
  const pick = (portion) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(portion * sorted.length) - 1))];
  return { median: pick(0.5), p95: pick(0.95) };
}
