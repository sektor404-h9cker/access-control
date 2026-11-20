"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraControls } from "./camera-controls";
import { CameraDiag, cameraStatusText, useCamera } from "./use-camera";
import { assignTracks, dueTracks, frameFresh, noteAgreement, readySample, summarizeLatency } from "@/lib/face-track";
import { forgetSubject } from "./audio-session";
import { listSharedDevices } from "./camera-hub";
import { HINT, assessAll, createLandmarker, detectFaces, viewBox, warpFace } from "./face-vision";

const detectors = new Set();
const DETECT_EDGE = 1280;

function identityLabel(dict, identity, face, live) {
  if (!live) return dict.monitoring.notConnected;
  if (identity?.ok === false) return dict.errors[identity.error] || dict.monitoring.phaseUnavailable;
  if (identity?.outcome === "matched" && identity.name) return `${identity.name} · ${identity.recorded ? dict.monitoring.phaseConfirmed : dict.monitoring.phaseReview}`;
  if (identity?.outcome === "unknown") return dict.monitoring.phaseUnknown;
  if (identity?.outcome === "ambiguous" || identity?.status === "pending") return dict.monitoring.phaseReview;
  if (face?.code === "far" || face?.code === "blur" || face?.code === "dark") return dict.monitoring.qualityLow;
  if (!face?.box) return dict.monitoring.faceMissing;
  return dict.monitoring.phaseDetect;
}

export function CameraPreview({ dict, camera, canWrite, mode = "review", templateCount = 0, modelReady = false, owner = false, alertSettings = null, compact = false, onStatus, passage = true }) {
  const router = useRouter();
  const detectRef = useRef(null);
  const fullRef = useRef(null);
  const [faces, setFaces] = useState([]);
  const [hint, setHint] = useState("");
  const [phase, setPhase] = useState("idle");
  const [identity, setIdentity] = useState(null);
  const [diagnostics, setDiagnostics] = useState(false);
  const [checkReport, setCheckReport] = useState([]);
  const [exitTest, setExitTest] = useState(null);
  const lastFace = useRef(null);
  const [timings, setTimings] = useState([]);
  const [metrics, setMetrics] = useState({ width: 0, height: 0, viewW: 0, viewH: 0 });
  const stageRef = useRef(null);
  const flightRef = useRef(false);
  const queueRef = useRef([]);
  const tracksRef = useRef([]);
  const motionRef = useRef([]);
  const eventRef = useRef("");
  const signRef = useRef("");
  const videoRef = useRef(null);
  const diagnosticsRef = useRef(false);
  const timingsRef = useRef([]);
  const savedId = camera.enabled && camera.sourceKind === "usb" ? camera.deviceId : "";
  const [pick, setPick] = useState({ saved: "", id: "" });
  const activeId = pick.saved === savedId && pick.id ? pick.id : savedId;
  const cam = useCamera(activeId, videoRef);
  const live = cam.status === "working";
  const cameraFault = useRef("");
  useEffect(() => {
    onStatus?.({
      id: camera.id,
      video: cam.status,
      ai: phase,
      fps: cam.stats.fps || 0,
      quality: faces[0]?.code || "",
      stalled: cam.status === "stalled",
    });
  }, [camera.id, cam.status, phase, cam.stats.fps, faces, onStatus]);
  useEffect(() => {
    if (phase !== "failed" || !camera.enabled) return undefined;
    window.dispatchEvent(new CustomEvent("smz-signal", {
      detail: {
        visual: true,
        sound: Boolean(alertSettings?.enabled && alertSettings.events?.camera),
        kind: "camera",
        id: `detector-${camera.id}`,
        subject: `detector-${camera.id}`,
        tone: alertSettings?.tones?.camera || "security",
        voice: Boolean(alertSettings?.voice),
        volume: alertSettings?.volume ?? 60,
        deviceId: alertSettings?.deviceId || "",
        phrase: alertSettings?.voice ? dict.monitoring.phraseModel : "",
        lang: document.documentElement.lang || "ru",
      },
    }));
    return () => forgetSubject(`detector-${camera.id}`);
  }, [phase, camera.enabled, camera.id, alertSettings, dict]);
  useEffect(() => {
    if (!savedId || !camera.deviceLabel) return undefined;
    let cancelled = false;
    listSharedDevices().then((found) => {
      if (cancelled || found.some((item) => item.deviceId === savedId)) return;
      const match = found.find((item) => item.label === camera.deviceLabel);
      if (match) setPick({ saved: savedId, id: match.deviceId });
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [savedId, camera.deviceLabel]);
  useEffect(() => {
    const failed = cam.status === "stalled" || cam.status === "failed" || cam.status === "busy" || cam.status === "permission";
    if (!alertSettings?.events?.camera || !failed) return;
    const id = `${camera.id}-${cam.status}-${cam.stats.opens}`;
    if (cameraFault.current === id) return;
    cameraFault.current = id;
    const sideOn = camera.direction === "exit" ? alertSettings.cameras.exit : alertSettings.cameras.entrance;
    window.dispatchEvent(new CustomEvent("smz-signal", {
      detail: {
        id,
        kind: "camera",
        visual: true,
        sound: Boolean(alertSettings.enabled && alertSettings.tone !== "silent" && sideOn),
        tone: alertSettings.tone,
        volume: alertSettings.volume,
        deviceId: alertSettings.deviceId,
      },
    }));
  }, [alertSettings, cam.status, cam.stats.opens, camera.direction, camera.id]);

  useEffect(() => {
    if (!live || camera.sourceKind !== "usb" || !activeId) return undefined;
    if (detectors.has(activeId)) {
      const timer = window.setTimeout(() => setPhase("shared"), 0);
      return () => window.clearTimeout(timer);
    }
    detectors.add(activeId);
    let cancelled = false;
    let frame = 0;
    let landmarker;
    let stamp = 0;
    let context = null;
    const video = videoRef.current;
    const canvas = detectRef.current;

    async function start() {
      try {
        setPhase("busy");
        landmarker = await createLandmarker();
        if (cancelled) {
          landmarker.close();
          return;
        }
        setPhase("ready");
        function fullFrame() {
          if (!video || video.videoWidth === canvas.width) return canvas;
          const full = fullRef.current;
          if (!full) return canvas;
          if (full.width !== video.videoWidth || full.height !== video.videoHeight) {
            full.width = video.videoWidth;
            full.height = video.videoHeight;
          }
          const ctx = full.getContext("2d", { willReadFrequently: true });
          ctx.save();
          ctx.translate(full.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0);
          ctx.restore();
          return full;
        }
        const loop = () => {
          if (cancelled) return;
          frame = requestAnimationFrame(loop);
          if (!video?.videoWidth || !landmarker || !canvas) return;
          const now = performance.now();
          if (now - stamp < 220) return;
          stamp = now;
          const scale = Math.min(1, DETECT_EDGE / Math.max(video.videoWidth, video.videoHeight));
          const width = Math.max(2, Math.round(video.videoWidth * scale));
          const height = Math.max(2, Math.round(video.videoHeight * scale));
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            context = canvas.getContext("2d", { willReadFrequently: true });
          }
          if (!context) context = canvas.getContext("2d", { willReadFrequently: true });
          context.save();
          context.translate(canvas.width, 0);
          context.scale(-1, 1);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          context.restore();
          const detectStarted = performance.now();
          let readings;
          try {
            readings = assessAll(detectFaces(landmarker, canvas, now), canvas, passage);
          } catch {
            return;
          }
          const detectMs = Math.round(performance.now() - detectStarted);
          if (detectMs > 40) stamp = now + detectMs;
          const view = stageRef.current?.getBoundingClientRect();
          const nextMetrics = { width: canvas.width, height: canvas.height, viewW: Math.round(view?.width || 0), viewH: Math.round(view?.height || 0) };
          setMetrics((current) => current.width === nextMetrics.width && current.height === nextMetrics.height && current.viewW === nextMetrics.viewW && current.viewH === nextMetrics.viewH ? current : nextMetrics);
          lastFace.current = readings.find((face) => face.box) || readings[0] || null;
          const signature = readings.map((face) => `${face.code}:${Math.round((face.box?.x || 0) * 50)}`).join("|");
          if (signature !== signRef.current) {
            signRef.current = signature;
            setFaces(readings.filter((face) => face.box));
            setHint(HINT[readings[0]?.code] || "hintNoFace");
          }
          const nose = readings[0]?.aligned?.[2];
          if (nose) {
            motionRef.current.push(nose);
            if (motionRef.current.length > 8) motionRef.current.shift();
          }
          let motion = 0;
          for (let index = 1; index < motionRef.current.length; index += 1) {
            motion += Math.hypot(
              motionRef.current[index].x - motionRef.current[index - 1].x,
              motionRef.current[index].y - motionRef.current[index - 1].y,
            );
          }
          if (motionRef.current.length > 1) motion /= motionRef.current.length - 1;
          const previousIds = new Set(tracksRef.current.map((track) => track.id));
          tracksRef.current = assignTracks(tracksRef.current, readings);
          const alive = new Set(tracksRef.current.map((track) => track.id));
          for (const id of previousIds) {
            if (!alive.has(id)) forgetSubject(id);
          }
          for (const track of tracksRef.current) {
            if (!track.seenAt) track.seenAt = now;
            track.samples = (track.samples || 0) + 1;
            track.bestSharp = Math.max(track.bestSharp || 0, track.face?.sharpness || 0);
          }
          if (camera.enabled) {
            for (const track of dueTracks(tracksRef.current, now)) {
              if (!readySample(track) || queueRef.current.some((job) => job.id === track.id) || queueRef.current.length >= 4) continue;
              const warpStarted = performance.now();
              const source = fullFrame();
              const image = warpFace(source, track.face.aligned);
              const warpMs = Math.round(performance.now() - warpStarted);
              const committing = Boolean(track.commit);
              track.sentAt = now;
              track.hold = committing ? 12000 : 700;
              track.commit = false;
              queueRef.current.push({
                id: track.id,
                image,
                quality: track.face.quality,
                motion,
                probe: !committing,
                capturedAt: now,
                detectMs,
                warpMs,
              });
            }
            pump();
          }
        };
        let label = "";
        function publish(next) {
          const key = `${next.ok === false ? next.error : next.outcome}:${next.employeeId || ""}:${next.probe ? 1 : 0}`;
          if (key === label) return;
          label = key;
          setIdentity(next);
        }
        function pump() {
          if (flightRef.current || cancelled) return;
          const job = queueRef.current.shift();
          if (!job) return;
          flightRef.current = true;
          job.image.toBlob(async (blob) => {
            try {
              if (!blob || cancelled || !frameFresh(job.capturedAt, performance.now())) return;
              const body = new FormData();
              body.set("camera_id", camera.id);
              body.set("face_count", "1");
              body.set("quality", job.quality);
              body.set("motion", String(job.motion));
              body.set("probe", job.probe ? "1" : "0");
              body.set("subject", job.id);
              body.set("image", blob, "face.jpg");
              const response = await fetch("/api/recognition/frame", { method: "POST", body });
              const payload = await response.json().catch(() => null);
              if (cancelled || !payload) return;
              const track = tracksRef.current.find((item) => item.id === job.id);
              const total = (job.detectMs || 0) + (job.warpMs || 0) + (payload.stages?.total || payload.latencyMs || 0);
              if (payload.stages || payload.latencyMs != null) {
                timingsRef.current = [...timingsRef.current, {
                  detect: job.detectMs || 0,
                  prepare: payload.stages?.prepare || 0,
                  embed: payload.stages?.embed || 0,
                  match: payload.stages?.match || 0,
                  total,
                }].slice(-20);
                if (diagnosticsRef.current) setTimings(timingsRef.current);
              }
              if (!payload.ok) {
                if (track) track.hold = 2000;
                publish({ ...payload, latencyMs: total });
                return;
              }
              if (payload.probe && track) {
                const agreed = noteAgreement(track, payload);
                Object.assign(track, agreed, { hold: agreed.commit ? 0 : 700, sentAt: agreed.commit ? 0 : track.sentAt });
                publish({ ...payload, name: "", employeeId: null, latencyMs: total });
                return;
              }
              if (track) {
                track.commit = false;
                track.agree = 0;
                track.hold = 12000;
              }
              const named = payload.outcome === "matched" ? payload : { ...payload, name: "", employeeId: null };
              publish({ ...named, latencyMs: total });
              if (payload.alert?.visual) {
                const phraseKey = { matched: "phraseMatched", unknown: "phraseUnknown", ambiguous: "phraseAmbiguous", confirmed: "phrasePassage", camera: "phraseCamera" }[payload.alert.kind];
                let phrase = dict.monitoring[phraseKey] || "";
                if (payload.alert.speakName && payload.name) phrase = `${phrase}. ${payload.name}`;
                window.dispatchEvent(new CustomEvent("smz-signal", { detail: { ...payload.alert, subject: payload.alert.subject || job.id, phrase: payload.alert.voice ? phrase : "", lang: document.documentElement.lang || "ru" } }));
              }
              if (payload.recorded && payload.id && payload.id !== eventRef.current) {
                eventRef.current = payload.id;
                router.refresh();
              }
            } catch {
              const track = tracksRef.current.find((item) => item.id === job.id);
              if (track) track.hold = 2000;
              if (!cancelled) setIdentity({ ok: false, error: "model_missing" });
            } finally {
              flightRef.current = false;
              pump();
            }
          }, "image/jpeg", 0.72);
        }
        loop();
      } catch {
        if (!cancelled) setPhase("failed");
      }
    }

    start();
    return () => {
      cancelled = true;
      detectors.delete(activeId);
      cancelAnimationFrame(frame);
      landmarker?.close();
    };
  }, [live, activeId, camera.sourceKind, camera.id, camera.enabled, router, videoRef, passage, dict, alertSettings]);

  async function probeFace(face) {
    const started = performance.now();
    if (!face?.aligned || !detectRef.current) return { ok: false, error: "frame_required", ms: 0 };
    const image = warpFace(detectRef.current, face.aligned);
    const blob = await new Promise((resolve) => image.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return { ok: false, error: "frame_required", ms: Math.round(performance.now() - started) };
    const body = new FormData();
    body.set("camera_id", camera.id);
    body.set("face_count", "1");
    body.set("quality", face.quality === "good" || face.quality === "ok" ? face.quality : "poor");
    body.set("motion", "0.02");
    body.set("probe", "1");
    body.set("image", blob, "face.jpg");
    const response = await fetch("/api/recognition/frame", { method: "POST", body });
    const payload = await response.json().catch(() => null);
    return { ...(payload || { ok: false, error: "model_missing" }), ms: Math.round(performance.now() - started) };
  }

  async function runCheck() {
    const lines = [];
    lines.push(!live ? cameraStatusText(dict, cam.status, cam.error) : dict.monitoring.checkCamera);
    lines.push(phase === "ready" ? dict.monitoring.checkDetector : phase === "busy" ? dict.monitoring.detectorBusy : dict.face.detectorFailed);
    lines.push(modelReady ? dict.monitoring.checkModel : dict.errors.model_missing);
    lines.push(templateCount > 0 ? dict.monitoring.checkTemplates.replace("{count}", String(templateCount)) : dict.monitoring.checkNoTemplates);
    const face = lastFace.current;
    if (!face?.aligned || face.quality === "poor") {
      lines.push(dict.face[HINT[face?.code]] || dict.face.hintNoFace);
      setCheckReport(lines);
      setDiagnostics(true);
      return;
    }
    lines.push(dict.monitoring.checkFace);
    const result = await probeFace(face);
    if (!result.ok) lines.push(dict.errors[result.error] || dict.monitoring.phaseUnavailable);
    else {
      const who = result.outcome === "matched" ? result.name : result.outcome === "ambiguous" ? dict.monitoring.phaseReview : result.outcome === "unknown" ? dict.monitoring.phaseUnknown : dict.monitoring.phaseReview;
      const waited = result.stages?.total || result.ms;
      lines.push(`${dict.monitoring.checkMatch}: ${who}. ${dict.monitoring.timeTotal}: ${waited} ${dict.monitoring.latency}`);
    }
    setCheckReport(lines);
    setDiagnostics(true);
  }

  async function runExitTest() {
    const face = lastFace.current;
    if (!live || !face?.aligned || face.quality === "poor") {
      setExitTest({ ok: false, error: HINT[face?.code] || "hintNoFace" });
      return;
    }
    const result = await probeFace(face);
    setExitTest({ ...result, test: true });
  }

  if (camera.sourceKind === "ip") {
    return (
      <div className="feed">
        <div>
          <strong>{camera.host || dict.monitoring.notConnected}</strong>
          {dict.monitoring.ipNoStream}
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="stage" ref={stageRef}>
        <video ref={videoRef} autoPlay playsInline muted />
        <canvas ref={detectRef} className="detect-canvas" />
        <canvas ref={fullRef} className="detect-canvas" />
        {faces.map((face) => {
          const placed = viewBox(face.box, metrics.width, metrics.height, metrics.viewW, metrics.viewH);
          if (!placed) return null;
          return <span key={`${face.box.x}-${face.box.y}`} className="face-box" style={{ left: `${placed.left}px`, top: `${placed.top}px`, width: `${placed.width}px`, height: `${placed.height}px` }} />;
        })}
        {live ? null : (
          <div className="stage-note">
            <strong>{cameraStatusText(dict, cam.status, cam.error)}</strong>
            {cam.status === "missing" ? dict.monitoring.deviceStale : phase === "failed" ? dict.monitoring.aiDown : dict.monitoring.localOnly}
          </div>
        )}
      </div>
      <p className="muted">
        {phase === "shared" ? dict.monitoring.sameSource : phase === "failed" ? dict.monitoring.aiDown : camera.enabled && phase === "busy" ? dict.monitoring.detectorBusy : identityLabel(dict, identity, faces[0], live)}
        {faces[0]?.facePx ? ` · ${faces[0].facePx} px` : ""}
        {cam.stats.width ? ` · ${cam.stats.width}×${cam.stats.height}` : ""}
        {faces.length > 1 ? ` · ${faces.length}` : ""}
        {hint && dict.face[hint] ? ` · ${dict.face[hint]}` : ""}
        {identity?.latencyMs != null ? ` · ${identity.latencyMs} ${dict.monitoring.latency}` : ""}
        {identity?.score != null ? ` · ${dict.monitoring.similarity} ${identity.score}` : ""}
      </p>
      {compact ? null : (
        <div className="form-actions">
          <button className="btn btn-ghost" type="button" onClick={() => { const next = !diagnosticsRef.current; diagnosticsRef.current = next; if (next) setTimings(timingsRef.current); setDiagnostics(next); }}>{dict.monitoring.diagnostics}</button>
          <button className="btn btn-ghost" type="button" onClick={runExitTest}>{dict.monitoring.testExit}</button>
        </div>
      )}
      {checkReport.length ? <ul className="stack">{checkReport.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ul> : null}
      {exitTest ? (
        <p className="muted">
          {exitTest.ok ? `${exitTest.outcome === "matched" ? exitTest.name : exitTest.outcome === "ambiguous" ? dict.monitoring.phaseReview : dict.monitoring.phaseUnknown} · ${exitTest.stages?.total || exitTest.ms} ${dict.monitoring.latency}` : (dict.face[exitTest.error] || dict.errors[exitTest.error] || dict.monitoring.phaseUnavailable)}
          {` · ${dict.monitoring.testExitNote}`}
        </p>
      ) : null}
      {diagnostics ? (
        <dl className="kv">
          <div><dt>{dict.monitoring.timeDetect}</dt><dd>{timings.at(-1)?.detect ?? "—"} {dict.monitoring.latency}</dd></div>
          <div><dt>{dict.monitoring.timePrepare}</dt><dd>{timings.at(-1)?.prepare ?? "—"} {dict.monitoring.latency}</dd></div>
          <div><dt>{dict.monitoring.timeEmbed}</dt><dd>{timings.at(-1)?.embed ?? "—"} {dict.monitoring.latency}</dd></div>
          <div><dt>{dict.monitoring.timeMatch}</dt><dd>{timings.at(-1)?.match ?? "—"} {dict.monitoring.latency}</dd></div>
          <div><dt>{dict.monitoring.timeTotal}</dt><dd>{timings.at(-1)?.total ?? "—"} {dict.monitoring.latency}</dd></div>
          <div><dt>{dict.monitoring.timeMedian}</dt><dd>{summarizeLatency(timings.map((item) => item.total)).median ?? "—"} {dict.monitoring.latency}</dd></div>
          <div><dt>{dict.monitoring.timeP95}</dt><dd>{summarizeLatency(timings.map((item) => item.total)).p95 ?? "—"} {dict.monitoring.latency}</dd></div>
        </dl>
      ) : null}
      {identity?.name ? (
        <div className="person">
          {identity.employeeId ? (
            // Shown only after this browser session received a match for the person.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="avatar" src={`/api/employees/${identity.employeeId}/portrait`} alt="" />
          ) : null}
          <div>
            <strong>{identity.name}</strong>
            <p className="muted">
              {identity.direction === "out" ? dict.monitoring.exit : dict.monitoring.entrance}
              {identity.note ? ` · ${dict.monitoring[identity.note] || identity.note}` : ""}
            </p>
          </div>
        </div>
      ) : null}
      {compact ? null : <p className="muted">{!camera.enabled ? dict.monitoring.connectionOff : mode === "pilot" ? dict.monitoring.pilotMode : dict.monitoring.reviewMode}</p>}
      {!compact && canWrite ? (
        <CameraControls
          key={`${camera.updatedAt}-${camera.deviceId}-${camera.enabled}-${camera.direction}`}
          dict={dict}
          camera={camera}
          streamStatus={cam.status}
          streamError={cam.error}
          onReconnect={cam.reconnect}
          onCheck={runCheck}
        />
      ) : null}
      {!compact && owner ? (
        <CameraDiag
          dict={dict}
          label={camera.deviceLabel}
          deviceId={camera.deviceId}
          status={cam.status}
          error={cam.error}
          stats={cam.stats}
          ai={phase === "failed" ? dict.monitoring.aiDown : phase === "ready" ? dict.monitoring.checkDetector : dict.monitoring.connectionPending}
          onReconnect={cam.reconnect}
        />
      ) : null}
    </div>
  );
}
