"use client";

import { useEffect, useRef, useState } from "react";
import { cameraErrorCode } from "./camera-devices";
import { listSharedDevices } from "./camera-hub";
import { holdCamera } from "./camera-hub";
import { poseMatches } from "@/lib/face-geometry";
import { pauseGateForEnrollment, resumeGateAfterEnrollment } from "@/app/actions/gate";
import { ENROLL_STEPS, HINT, assess, createLandmarker, detectFaces, drawAnalysisFrame, hashDistance, imageHash, qualityLabel, viewBox, warpFace } from "./face-vision";

export function FaceCapture({ dict, onClose, onConfirm, busy, serverError = "", replace = false, onPreview }) {
  const videoRef = useRef(null);
  const previewRef = useRef(onPreview);
  useEffect(() => {
    previewRef.current = onPreview;
  }, [onPreview]);
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const shotsRef = useRef([]);
  const hashesRef = useRef([]);
  const capturingRef = useRef(false);
  const stableRef = useRef(0);
  const baselineRef = useRef(null);
  const [voice, setVoice] = useState(false);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");
  const [hint, setHint] = useState("hintPlace");
  const [quality, setQuality] = useState("poor");
  const [box, setBox] = useState(null);
  const [shots, setShots] = useState([]);
  const [live, setLive] = useState(false);
  const [allowReplace, setAllowReplace] = useState(false);
  const [frame, setFrame] = useState({ width: 0, height: 0, viewW: 0, viewH: 0 });
  const blockedRef = useRef(false);

  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  useEffect(() => {
    if (!voice || error || typeof window === "undefined" || !window.speechSynthesis) return undefined;
    const text = dict.face[hint];
    if (!text) return undefined;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = document.documentElement.lang === "az" ? "az-AZ" : "ru-RU";
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  }, [voice, error, hint, dict]);

  useEffect(() => {
    let cancelled = false;
    const held = { paused: false };
    async function releaseAndList() {
      const response = await fetch("/api/gate/status", { cache: "no-store" });
      const status = response.ok ? await response.json() : null;
      if (cancelled) return;
      if (status?.agentUp && status?.desired !== "stopped") {
        const paused = await pauseGateForEnrollment();
        if (cancelled) {
          if (paused?.ok) resumeGateAfterEnrollment();
          return;
        }
        if (!paused?.ok) {
          blockedRef.current = true;
          setError("cameraHeld");
          return;
        }
        held.paused = true;
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      if (cancelled) return;
      const found = await listSharedDevices();
      if (cancelled || !found) return;
      setDevices(found);
      setDeviceId((current) => current || found[0]?.deviceId || "");
      if (!found.length) setError("noCamera");
    }
    releaseAndList().catch((reason) => {
      if (!cancelled) setError(cameraErrorCode(reason));
    });
    return () => {
      cancelled = true;
      if (held.paused) resumeGateAfterEnrollment();
    };
  }, []);

  useEffect(() => {
    if (!deviceId || blockedRef.current) return undefined;
    let cancelled = false;
    let raf = 0;
    let landmarker;
    let stamp = 0;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const hold = holdCamera(deviceId);

    async function start() {
      try {
        const stream = await hold.ready;
        if (cancelled) return;
        video.srcObject = stream;
        if (video.readyState < 1) {
          await new Promise((resolve) => video.addEventListener("loadedmetadata", resolve, { once: true }));
        }
        await video.play();
        setLive(true);
        setError("");
        const [track] = stream.getVideoTracks();
        const markDisconnected = () => {
          cancelled = true;
          setLive(false);
          setError("disconnected");
        };
        track.addEventListener("ended", markDisconnected);
        try {
          landmarker = await createLandmarker();
        } catch {
          if (!cancelled) setError("detectorFailed");
          return;
        }
        let sent = 0;
        const loop = () => {
          if (cancelled) return;
          raf = requestAnimationFrame(loop);
          if (track.readyState === "ended") {
            markDisconnected();
            return;
          }
          if (!video.videoWidth || !landmarker) return;
          const now = performance.now();
          if (now - stamp < 180) return;
          if (!drawAnalysisFrame(video, canvas, 640)) return;
          if (previewRef.current && now - sent > 700) {
            sent = now;
            canvas.toBlob((blob) => { if (blob && previewRef.current) previewRef.current(blob); }, "image/jpeg", 0.55);
          }
          stamp = now;
          let reading;
          try {
            reading = assess(detectFaces(landmarker, canvas, now), canvas);
          } catch {
            setError("detectorFailed");
            return;
          }
          setBox(reading.box);
          setQuality(reading.quality);
          const view = stageRef.current?.getBoundingClientRect();
          setFrame((current) => {
            const next = { width: canvas.width, height: canvas.height, viewW: Math.round(view?.width || 0), viewH: Math.round(view?.height || 0) };
            return current.width === next.width && current.height === next.height && current.viewW === next.viewW && current.viewH === next.viewH ? current : next;
          });
          const step = ENROLL_STEPS[shotsRef.current.length];
          if (!step) {
            setHint("hintDone");
            return;
          }
          const blocked = reading.quality === "poor" || !reading.aligned;
          const posed = poseMatches(step, { yaw: reading.yaw, pitch: reading.pitch }, baselineRef.current);
          if (blocked || !posed) {
            stableRef.current = 0;
            setHint(blocked ? (HINT[reading.code] || "hintNoFace") : step.hint);
            return;
          }
          stableRef.current += 1;
          setHint(step.hint);
          if (stableRef.current < 4 || capturingRef.current) return;
          const aligned = warpFace(canvas, reading.aligned);
          const hash = imageHash(aligned);
          if (hashesRef.current.some((previous) => hashDistance(previous, hash) < 6)) {
            stableRef.current = 0;
            setHint(step.hint);
            return;
          }
          stableRef.current = 0;
          capturingRef.current = true;
          const points = reading.aligned.map((point) => [Number(point.x.toFixed(4)), Number(point.y.toFixed(4))]);
          aligned.toBlob((alignedBlob) => {
            canvas.toBlob((fullBlob) => {
              capturingRef.current = false;
              if (!alignedBlob || !fullBlob || cancelled) return;
              hashesRef.current.push(hash);
              if (!baselineRef.current) baselineRef.current = { yaw: reading.yaw, pitch: reading.pitch };
              const url = URL.createObjectURL(alignedBlob);
              setShots((current) => {
                if (current.length >= ENROLL_STEPS.length) return current;
                return [...current, { pose: step.pose, url, fullBlob, alignedBlob, points, quality: reading.quality }];
              });
            }, "image/jpeg", 0.92);
          }, "image/jpeg", 0.92);
        };
        loop();
      } catch (reason) {
        if (!cancelled) {
          setLive(false);
          setError(reason?.message === "detector" || reason?.name === "DetectorError" ? "detectorFailed" : hold.errorCode(reason));
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      hold.release();
      if (video) video.srcObject = null;
      landmarker?.close();
      setLive(false);
    };
  }, [deviceId]);

  useEffect(() => () => {
    shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.url));
  }, []);

  function resetShots() {
    shots.forEach((shot) => URL.revokeObjectURL(shot.url));
    hashesRef.current = [];
    baselineRef.current = null;
    stableRef.current = 0;
    setShots([]);
    setHint("hintPlace");
  }

  const done = shots.length >= ENROLL_STEPS.length && shots.every((shot) => shot.alignedBlob && shot.points);
  const placed = viewBox(box, frame.width, frame.height, frame.viewW, frame.viewH);
  const message = error ? dict.face[error] || dict.face.failed : dict.face[hint] || dict.face.hintPlace;
  const progress = dict.face.progress.replace("{count}", String(shots.length)).replace("{total}", String(ENROLL_STEPS.length));

  return (
    <div className="modal-root">
      <button className="modal-backdrop" type="button" aria-label={dict.common.close} onClick={onClose} />
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="face-capture-title">
        <header className="modal-head">
          <h2 id="face-capture-title">{dict.face.blockTitle}</h2>
          <button className="btn btn-ghost" type="button" onClick={onClose}>{dict.common.close}</button>
        </header>
        <p className="muted">{dict.face.blockHint}</p>
        <label className="check">
          <input type="checkbox" checked={voice} onChange={(event) => setVoice(event.target.checked)} />
          <span>{dict.face.voice}</span>
        </label>
        <div className="stage" ref={stageRef} style={frame.width ? { aspectRatio: `${frame.width} / ${frame.height}` } : undefined}>
          <video ref={videoRef} autoPlay playsInline muted />
          <canvas ref={canvasRef} hidden />
          <div className="face-oval" data-ready={done || (quality !== "poor" && !error) ? "true" : "false"} />
          {placed ? <div className="face-box" style={{ left: `${placed.left}px`, top: `${placed.top}px`, width: `${placed.width}px`, height: `${placed.height}px` }} /> : null}
          <div className="stage-hint">{message}</div>
        </div>
        <p className={error ? "form-error" : "muted"} role={error ? "alert" : "status"}>{progress}</p>
        {serverError ? <p className="form-error" role="alert">{serverError}</p> : null}
        <p className="muted">{dict.face.quality}: {qualityLabel(dict, quality)}{live ? "" : ` · ${dict.monitoring.notConnected}`}</p>
        <label className="field">
          <span>{dict.face.pickCamera}</span>
          <select value={deviceId} onChange={(event) => { resetShots(); setDeviceId(event.target.value); }}>
            {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
          </select>
        </label>
        <p className="muted">{dict.face.phoneSystem}</p>
        {shots.length ? (
          <div>
            <p className="muted">{done ? dict.face.hintDone : dict.face.review}</p>
            <div className="shot-row">
              {shots.map((shot) => (
                // Local preview of an accepted enrollment crop from this browser session.
                // eslint-disable-next-line @next/next/no-img-element
                <img key={shot.url} src={shot.url} alt="" />
              ))}
            </div>
          </div>
        ) : null}
        {replace ? (
          <label className="check">
            <input type="checkbox" checked={allowReplace} onChange={(event) => setAllowReplace(event.target.checked)} />
            <span>{dict.face.replaceNeed}</span>
          </label>
        ) : null}
        <div className="form-actions">
          <button className="btn btn-ghost" type="button" onClick={resetShots}>{dict.face.rescan}</button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || !done || (replace && !allowReplace)}
            onClick={() => onConfirm({
              blob: shots.find((shot) => shot.pose === "center")?.fullBlob || shots[0].fullBlob,
              poses: shots.map((shot) => shot.pose),
              mode: "scan",
              quality: shots.every((shot) => shot.quality === "good") ? "good" : "ok",
              confirmReplace: allowReplace,
              samples: shots.map((shot) => ({ blob: shot.alignedBlob, points: shot.points })),
            })}
          >
            {busy ? dict.common.loading : dict.face.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}
