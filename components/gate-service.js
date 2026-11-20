"use client";

import { useEffect } from "react";
import { FACE_LIMIT, assessAll, createLandmarker, detectFaces, drawAnalysisFrame, unmirrorBox, warpFace } from "./face-vision";

function overlapRatio(left, right) {
  if (!left || !right) return 0;
  const width = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y));
  const shared = width * height;
  const smaller = Math.min(left.w * left.h, right.w * right.h);
  return smaller > 0 ? shared / smaller : 0;
}

function frameToken(source, probe) {
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, 8, 8);
  const data = ctx.getImageData(0, 0, 8, 8).data;
  let hash = 2166136261;
  for (let index = 0; index < data.length; index += 4) hash = Math.imul(hash ^ data[index], 16777619);
  return hash >>> 0;
}

function assignTracks(tracks, faces, now) {
  const used = new Set();
  const next = [];
  for (const face of faces) {
    let best = null;
    let bestScore = 0.25;
    for (const track of tracks) {
      if (used.has(track.id) || !track.box) continue;
      const score = overlapRatio(track.box, face.box);
      if (score > bestScore) {
        best = track;
        bestScore = score;
      }
    }
    if (best) {
      used.add(best.id);
      next.push({ ...best, box: face.box, points: face.points, facePx: face.facePx, confidence: face.confidence, seen: now, live: true });
    } else {
      next.push({ id: crypto.randomUUID(), box: face.box, points: face.points, facePx: face.facePx, confidence: face.confidence, seen: now, born: now, sentAt: 0, employeeId: "", outcome: "", live: true });
    }
  }
  for (const track of tracks) {
    if (used.has(track.id)) continue;
    if (now - track.seen < 1200) next.push({ ...track, live: false });
  }
  return next;
}

async function jpeg64(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) return "";
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = "";
  for (const value of bytes) text += String.fromCharCode(value);
  return btoa(text);
}

export function GateService() {
  useEffect(() => {
    let stop = false;
    let busy = false;
    let timer = 0;
    let landmarker = null;
    let cameraId = "";
    let lastToken = 0;
    let lastPresence = 0;
    let lastSeq = "";
    let delay = 80;
    const tracks = [];
    const image = new Image();
    const probe = document.createElement("canvas");
    probe.width = 8;
    probe.height = 8;
    const faceNode = document.createElement("canvas");
    async function tick() {
      if (stop || busy) {
        timer = window.setTimeout(tick, 80);
        return;
      }
      busy = true;
      try {
        if (!cameraId) {
          const listed = await fetch("/api/gate/service?list=1", { cache: "no-store", credentials: "include" });
          const body = listed.ok ? await listed.json() : null;
          cameraId = body?.cameras?.[0] || "";
          if (!cameraId) return;
        }
        delay = 80;
        const response = await fetch(`/api/gate/service?camera=${encodeURIComponent(cameraId)}&since=${encodeURIComponent(lastSeq)}`, { cache: "no-store", credentials: "include" });
        if (response.status === 204) {
          lastSeq = response.headers.get("x-frame-seq") || lastSeq;
          delay = 200;
          return;
        }
        if (!response.ok) {
          cameraId = "";
          return;
        }
        lastSeq = response.headers.get("x-frame-seq") || lastSeq;
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        await new Promise((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("frame"));
          image.src = url;
        });
        URL.revokeObjectURL(url);
        if (!image.naturalWidth) return;
        const token = frameToken(image, probe);
        const now = Date.now();
        if (token === lastToken) {
          delay = 200;
          return;
        }
        if (!landmarker) landmarker = await createLandmarker();
        if (stop || !drawAnalysisFrame(image, faceNode, 640)) return;
        const started = performance.now();
        const detected = detectFaces(landmarker, faceNode);
        const detectMs = Math.round(performance.now() - started);
        const found = assessAll(detected, faceNode, true).filter((face) => face.box).slice(0, FACE_LIMIT);
        const next = assignTracks(tracks, found.map((face) => ({
          box: unmirrorBox(face.box),
          points: face.aligned,
          facePx: face.facePx,
          confidence: face.confidence,
        })), now);
        tracks.splice(0, tracks.length, ...next);
        const due = tracks.filter((track) => track.live && track.points && now - (track.sentAt || 0) >= 700);
        const result = {
          cameraId,
          width: image.naturalWidth,
          height: image.naturalHeight,
          capturedAt: now,
          faces: [],
          models: { face: "ready" },
          timing: { faceMs: detectMs, totalMs: detectMs },
        };
        for (const track of due) {
          const weak = Number.isFinite(track.confidence) && track.confidence > 0 && track.confidence < 0.3;
          track.sentAt = now;
          result.faces.push({
            trackId: track.id,
            box: track.box,
            facePx: track.facePx,
            aligned: !weak,
            confidence: track.confidence,
            reason: weak ? "LOW_DETECTION_CONFIDENCE" : "",
            detectMs,
            seenAt: track.born || now,
            warp: weak ? "" : await jpeg64(warpFace(faceNode, track.points)),
          });
        }
        if (result.faces.length) {
          const posted = await fetch("/api/gate/service", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cameraId, result }),
          });
          const body = posted.ok ? await posted.json() : null;
          for (const face of body?.vision?.faces || []) {
            const track = tracks.find((item) => item.id === face.trackId) || tracks.find((item) => overlapRatio(item.box, face.box) > 0.45);
            if (!track) continue;
            track.employeeId = face.employeeId || "";
            track.outcome = face.outcome || "";
          }
        }
        const pendingFaces = tracks.filter((track) => track.live && !track.employeeId && track.outcome !== "unknown" && track.outcome !== "ambiguous").length;
        lastToken = token;
        delay = result.faces.length ? 40 : 200;
        if (!result.faces.length && now - lastPresence >= 400) {
          lastPresence = now;
          await fetch("/api/gate/service", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              cameraId,
              presence: true,
              employeeIds: tracks.filter((track) => track.employeeId).map((track) => track.employeeId),
              pendingFaces,
            }),
          });
        }
      } catch {
        cameraId = "";
      } finally {
        busy = false;
        if (!stop) timer = window.setTimeout(tick, delay);
      }
    }
    tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      landmarker?.close();
    };
  }, []);
  return null;
}
