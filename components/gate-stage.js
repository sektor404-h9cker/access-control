"use client";

import { useEffect, useRef, useState } from "react";
import { submitPerformanceProfile } from "@/app/actions/vision";
import { primeAudio } from "./audio-session";
import { assessAll, createLandmarker, detectFaces, warpFace } from "./face-vision";

const LAYERS_KEY = "smz-ai-layers";

function readLayers() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYERS_KEY) || "");
    return { faces: saved.faces !== false, stats: saved.stats === true };
  } catch {
    return { faces: true, stats: false };
  }
}

function overlaps(left, right) {
  if (!left || !right) return false;
  const width = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y));
  const shared = width * height;
  const smaller = Math.min(left.w * left.h, right.w * right.h);
  return smaller > 0 && shared / smaller > 0.45;
}

function paintTo(source, canvas, edge) {
  const width = source.naturalWidth || source.videoWidth || source.width || 0;
  const height = source.naturalHeight || source.videoHeight || source.height || 0;
  if (!width || !height) return false;
  const scale = Math.min(1, edge / Math.max(width, height));
  const nextW = Math.max(2, Math.round(width * scale));
  const nextH = Math.max(2, Math.round(height * scale));
  if (canvas.width !== nextW) canvas.width = nextW;
  if (canvas.height !== nextH) canvas.height = nextH;
  canvas.getContext("2d").drawImage(source, 0, 0, nextW, nextH);
  return true;
}

function project(box, viewW, viewH, frameW, frameH) {
  const scale = Math.min(viewW / frameW, viewH / frameH);
  const width = frameW * scale;
  const height = frameH * scale;
  const offsetX = (viewW - width) / 2;
  const offsetY = (viewH - height) / 2;
  return {
    x: offsetX + box.x * width,
    y: offsetY + box.y * height,
    w: box.w * width,
    h: box.h * height,
  };
}

function faceCaption(face, dict) {
  if (!dict) return face.outcome === "matched" ? face.name : "";
  if (face.outcome === "matched") return face.name;
  if (face.enrolled === false) return dict.gate.noTemplate;
  if (face.outcome === "unknown") return dict.gate.unknown;
  if (face.outcome === "ambiguous") return dict.gate.unknown;
  return "";
}

function drawOverlay(canvas, frameW, frameH, vision, layers, dict) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const viewW = Math.max(1, rect.width);
  const viewH = Math.max(1, rect.height);
  if (canvas.width !== Math.round(viewW * ratio) || canvas.height !== Math.round(viewH * ratio)) {
    canvas.width = Math.round(viewW * ratio);
    canvas.height = Math.round(viewH * ratio);
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, viewW, viewH);
  if (!vision || !frameW || !frameH || layers.faces === false) return;
  for (const face of vision.faces || []) {
    if (!face.box) continue;
    const box = project(face.box, viewW, viewH, frameW, frameH);
    context.strokeStyle = face.outcome === "matched" ? "#7dcea0" : "#e0b15a";
    context.lineWidth = 2;
    context.strokeRect(box.x, box.y, box.w, box.h);
    const caption = faceCaption(face, dict);
    if (!caption) continue;
    context.font = "13px sans-serif";
    context.fillStyle = "rgba(8, 14, 20, 0.78)";
    const textW = context.measureText(caption).width + 10;
    context.fillRect(box.x, Math.max(0, box.y - 20), textW, 18);
    context.fillStyle = "#f4f7f8";
    context.fillText(caption, box.x + 5, Math.max(13, box.y - 6));
  }
}

async function jpeg64(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) return "";
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

// Один кадр браузеру до детектора. scheduler.yield здесь ждал слишком долго и раздувал замер.
function letPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function GateStage({ cameraId, code = "", dict, owner = false }) {
  const image = useRef(null);
  const overlay = useRef(null);
  const faceCanvas = useRef(null);
  const visionRef = useRef(null);
  const aiRef = useRef(null);
  const layersRef = useRef({ faces: true, stats: false });
  const layersReady = useRef(false);
  const dictRef = useRef(dict);
  const [layers, setLayers] = useState({ faces: true, stats: false });
  const [streamOff, setStreamOff] = useState(false);
  const [stats, setStats] = useState(null);
  const [overload, setOverload] = useState(false);
  const [chip, setChip] = useState("");

  useEffect(() => {
    dictRef.current = dict;
    layersRef.current = layers;
  }, [dict, layers]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      layersReady.current = true;
      setLayers(readLayers());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!layersReady.current) return;
    localStorage.setItem(LAYERS_KEY, JSON.stringify(layers));
    const frame = image.current;
    if (overlay.current && frame) drawOverlay(overlay.current, frame.naturalWidth, frame.naturalHeight, visionRef.current, layers, dictRef.current);
  }, [layers]);

  useEffect(() => {
    const img = image.current;
    if (!img) return undefined;
    let stop = false;
    img.onerror = () => {
      if (!stop) setStreamOff(true);
    };
    img.src = `/api/gate/stream/${cameraId}`;
    const observer = new ResizeObserver(() => {
      const frame = image.current;
      if (overlay.current && frame) drawOverlay(overlay.current, frame.naturalWidth, frame.naturalHeight, visionRef.current, layersRef.current, dictRef.current);
    });
    if (img.parentElement) observer.observe(img.parentElement);
    return () => {
      stop = true;
      observer.disconnect();
      img.onerror = null;
      img.removeAttribute("src");
    };
  }, [cameraId]);

  useEffect(() => {
    let stop = false;
    let timer = 0;
    const faceNode = faceCanvas.current;
    let landmarker = null;
    let busy = false;
    let slow = 0;
    let overloadOn = false;
    let faceClock = 0;
    let shownName = "";
    let lastAlert = "";
    let settingsStamp = 0;
    let sawFrame = false;
    const tabId = crypto.randomUUID();
    const hear = (alert) => {
      if (!alert?.id || !alert.sound || alert.id === lastAlert) return;
      lastAlert = alert.id;
      window.dispatchEvent(new CustomEvent("smz-signal", { detail: alert }));
      primeAudio({ open: true });
    };
    const show = (vision, local = false) => {
      const previous = (visionRef.current?.faces || []).filter((face) => face.outcome === "matched" && face.name && face.box);
      const faces = local
        ? (vision?.faces || []).map((face) => {
          const known = previous.find((item) => overlaps(item.box, face.box));
          return known ? { ...face, name: known.name, outcome: "matched" } : { ...face, name: "", outcome: "unchecked" };
        })
        : vision?.faces || [];
      const next = { ...vision, faces };
      visionRef.current = next;
      const frame = image.current;
      if (overlay.current && frame?.naturalWidth) drawOverlay(overlay.current, frame.naturalWidth, frame.naturalHeight, next, layersRef.current, dictRef.current);
      if (local) return;
      const nextName = faces.find((face) => face.outcome === "matched" && face.name)?.name || "";
      if (nextName !== shownName) {
        shownName = nextName;
        setChip(nextName);
      }
      hear(vision?.alert);
    };
    async function tick() {
      if (stop) return;
      if (busy) {
        timer = window.setTimeout(tick, 200);
        return;
      }
      busy = true;
      try {
        const claim = await fetch("/api/gate/vision", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cameraId, tabId }),
        });
        const claimed = claim.ok ? await claim.json() : { leader: false };
        if (!claimed.leader) {
          const follow = await fetch(`/api/gate/vision/${cameraId}`, { cache: "no-store" });
          if (follow.ok) show((await follow.json()).vision);
          landmarker?.close();
          landmarker = null;
          return;
        }
        const now = Date.now();
        if (!aiRef.current || now - settingsStamp > 4000) {
          const status = await fetch("/api/gate/status", { cache: "no-store" });
          const payload = status.ok ? await status.json() : null;
          settingsStamp = Date.now();
          if (payload?.ai) aiRef.current = payload.ai;
          if (layersRef.current.stats && payload) {
            const camera = payload.cameras?.find((item) => item.id === cameraId);
            const metrics = payload.metrics || {};
            setStats({
              captureFps: Number(metrics.captureFps) || 0,
              encodeFps: Number(metrics.encodeFps) || 0,
              streamFps: Number(metrics.postFps) || 0,
              dropped: Number(metrics.dropped) || 0,
              age: Number(camera?.frameAge) || 0,
              cpu: Number(metrics.cpu) || 0,
              ffmpegCpu: Number(metrics.ffmpegCpu) || 0,
              subscribers: Number(metrics.subscribers) || 0,
            });
          }
        }
        const ai = aiRef.current || { face: true, faceEdge: 640, analysisFps: 2 };
        const source = image.current;
        if (source?.naturalWidth && !sawFrame) {
          sawFrame = true;
          setStreamOff(false);
        }
        if (!ai?.face || !source?.naturalWidth || !faceNode) return;
        const result = {
          cameraId,
          width: source.naturalWidth,
          height: source.naturalHeight,
          capturedAt: Date.now(),
          faces: [],
          models: { face: "off" },
          timing: {},
        };
        try {
          if (!landmarker) landmarker = await createLandmarker();
          const wall = performance.now();
          await letPaint();
          if (stop || !paintTo(source, faceNode, ai.faceEdge || 640)) throw new Error("frame");
          const started = performance.now();
          faceClock += 16;
          const detected = detectFaces(landmarker, faceNode, faceClock);
          result.timing.faceMs = Math.round(performance.now() - started);
          result.timing.totalMs = Math.round(performance.now() - wall);
          const faces = assessAll(detected, faceNode, true).filter((face) => face.box);
          if (faces.length) show({ faces: faces.map((face) => ({ box: face.box })) }, true);
          const usable = faces.filter((face) => face.aligned && face.quality !== "poor" && face.facePx >= 96);
          for (const face of faces.slice(0, 2)) {
            let warp = "";
            if (usable.includes(face)) warp = await jpeg64(warpFace(faceNode, face.aligned));
            result.faces.push({ box: face.box, warp });
          }
          result.models.face = "ready";
        } catch (error) {
          // Ошибка лица не останавливает поток: картинка идёт своим эффектом.
          result.models.face = "failed";
          result.models.faceError = String(error?.message || "face");
        }
        if (result.timing.faceMs > 80) slow += 1;
        else slow = Math.max(0, slow - 1);
        const nextOverload = slow >= 3;
        if (nextOverload !== overloadOn) {
          overloadOn = nextOverload;
          setOverload(nextOverload);
        }
        const posted = await fetch("/api/gate/vision", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cameraId, tabId, result }),
        });
        if (posted.ok) {
          const body = await posted.json();
          if (body.vision) show({ ...body.vision, alert: body.alert || body.vision.alert });
          if (body.card?.id) window.dispatchEvent(new CustomEvent("smz-passage", { detail: body.card }));
          hear(body.alert);
        }
      } catch {
        /* сеть или разбор ответа не должны гасить видео */
      } finally {
        busy = false;
        if (!stop) timer = window.setTimeout(tick, Math.round(1000 / Math.max(2, aiRef.current?.analysisFps || 3)));
      }
    }
    tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      landmarker?.close();
    };
  }, [cameraId]);

  function toggle(key) {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <>
      <div className="stage compact-stage">
        {/* Поток подменяет кадр сам. React этот элемент по кадрам не перерисовывает. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={image} className="gate-video" alt={dict.gate.remote} decoding="async" />
        <canvas ref={overlay} className="overlay-canvas" />
        <canvas ref={faceCanvas} hidden />
        {chip ? <p className="stage-chip">{chip}</p> : null}
        {streamOff ? <div className="stage-note"><strong>{dict.gate.streamOff}</strong></div> : null}
      </div>
      {overload ? (
        <div className="form-actions">
          <p className="muted">{dict.monitoring.overload}</p>
          {owner ? (
            <form action={submitPerformanceProfile}>
              <button className="btn btn-ghost" type="submit" name="performance" value="economy">{dict.monitoring.useEconomy}</button>
            </form>
          ) : null}
        </div>
      ) : null}
      {owner ? (
        <div className="vision-switches">
          <label><input type="checkbox" checked={layers.faces} onChange={() => toggle("faces")} /> {dict.gate.showFaces}</label>
          <label><input type="checkbox" checked={layers.stats} onChange={() => toggle("stats")} /> {dict.gate.showStats}</label>
        </div>
      ) : null}
      {owner && layers.stats && stats ? (
        <p className="muted">
          {code} · {dict.gate.capture} {stats.captureFps} · {dict.gate.encode} {stats.encodeFps} · {dict.gate.stream} {stats.streamFps}
          {" · "}{dict.gate.dropped} {stats.dropped} · {dict.gate.delay} {stats.age} {dict.vision.ms} · {dict.gate.cpu} {stats.ffmpegCpu}+{stats.cpu} · {dict.gate.subscribers} {stats.subscribers}
        </p>
      ) : null}
    </>
  );
}
