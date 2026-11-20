"use client";

import { useEffect, useRef, useState } from "react";
import { holdCamera } from "./camera-hub";

const EMPTY = { width: 0, height: 0, fps: 0, track: "", lastFrameAt: 0, opens: 0 };

function statusFor(code) {
  if (code === "permission") return "permission";
  if (code === "noCamera") return "missing";
  if (code === "busy") return "busy";
  if (code === "aborted") return "aborted";
  if (code === "disconnected") return "stalled";
  return "failed";
}

async function showStream(video, stream) {
  video.srcObject = stream;
  if (video.readyState < 1) {
    await new Promise((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(Object.assign(new Error("metadata"), { name: "AbortError" })); };
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", done);
        video.removeEventListener("error", fail);
      };
      video.addEventListener("loadedmetadata", done);
      video.addEventListener("error", fail);
    });
  }
  await video.play();
}

export function cameraStatusText(dict, status, error) {
  if (status === "working") return dict.monitoring.connectionWorking;
  if (status === "reconnecting") return dict.monitoring.connectionReconnecting;
  if (status === "stalled") return dict.monitoring.connectionStalled;
  if (status === "pending") return dict.monitoring.connectionPending;
  if (status === "off") return dict.monitoring.connectionOff;
  if (error && dict.face[error]) return dict.face[error];
  if (status === "permission") return dict.face.permission;
  if (status === "missing") return dict.face.noCamera;
  if (status === "busy") return dict.face.busy;
  return dict.face.failed;
}

export function CameraDiag({ dict, label, deviceId, status, error, stats, ai, onReconnect }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn btn-ghost" type="button" onClick={() => setOpen(true)}>{dict.monitoring.cameraDiag}</button>;
  const when = stats.lastFrameAt ? new Date(stats.lastFrameAt).toLocaleTimeString() : "—";
  return (
    <div className="stack">
      <dl className="kv">
        <div><dt>{dict.monitoring.device}</dt><dd>{label || "—"}</dd></div>
        <div><dt>{dict.monitoring.deviceId}</dt><dd>{deviceId ? deviceId.slice(0, 8) : "—"}</dd></div>
        <div><dt>{dict.monitoring.resolution}</dt><dd>{stats.width && stats.height ? `${stats.width}×${stats.height}` : "—"}</dd></div>
        <div><dt>{dict.monitoring.fps}</dt><dd>{stats.fps || "—"}</dd></div>
        <div><dt>{dict.monitoring.trackState}</dt><dd>{stats.track || "—"}</dd></div>
        <div><dt>{dict.monitoring.lastFrame}</dt><dd>{when}</dd></div>
        <div><dt>{dict.monitoring.aiState}</dt><dd>{ai}</dd></div>
        <div><dt>{dict.monitoring.errorCause}</dt><dd>{error ? (dict.face[error] || error) : "—"}</dd></div>
        <div><dt>{dict.monitoring.reconnects}</dt><dd>{stats.opens || 0}</dd></div>
        <div><dt>{dict.monitoring.streamState}</dt><dd>{cameraStatusText(dict, status, error)}</dd></div>
      </dl>
      <div className="form-actions">
        <button className="btn btn-ghost" type="button" onClick={onReconnect}>{dict.monitoring.reconnect}</button>
        <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>{dict.common.close}</button>
      </div>
    </div>
  );
}

export function useCamera(deviceId, videoRef) {
  const retries = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState({ deviceId: deviceId || "", status: deviceId ? "pending" : "off", error: "", stats: EMPTY });
  const display = view.deviceId === (deviceId || "") ? view : {
    deviceId: deviceId || "",
    status: deviceId ? "pending" : "off",
    error: "",
    stats: EMPTY,
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!deviceId || !video) return undefined;
    let cancelled = false;
    let timer = 0;
    let frame = 0;
    let frames = 0;
    let lastFrame = 0;
    const opened = Date.now();
    const hold = holdCamera(deviceId);
    const stop = () => {
      window.clearInterval(timer);
      cancelAnimationFrame(frame);
    };
    const publish = (status, error = "", fps = 0) => {
      if (cancelled) return;
      const track = video.srcObject?.getVideoTracks?.()[0];
      setView({
        deviceId,
        status,
        error,
        stats: {
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
          fps,
          track: track?.readyState || "",
          lastFrameAt: lastFrame,
          opens: hold.opens(),
        },
      });
    };
    hold.ready
      .then(async (stream) => {
        if (cancelled) return;
        await showStream(video, stream);
        if (cancelled) return;
        const sample = () => {
          if (cancelled) return;
          if (video.currentTime !== video._smzTime) {
            video._smzTime = video.currentTime;
            frames += 1;
            lastFrame = Date.now();
          }
          frame = requestAnimationFrame(sample);
        };
        sample();
        timer = window.setInterval(() => {
          const track = stream.getVideoTracks()[0];
          const ended = !track || track.readyState === "ended";
          const stale = Boolean(lastFrame) && Date.now() - lastFrame > 5000 && video.readyState < 2;
          if (ended || stale) {
            if (retries.current < 3) {
              retries.current += 1;
              publish("reconnecting", "disconnected", 0);
              window.setTimeout(() => { if (!cancelled) setAttempt((value) => value + 1); }, 700);
            } else publish("stalled", "disconnected", 0);
            stop();
            return;
          }
          if (video.videoWidth) publish("working", "", Math.max(frames, 1));
          else if (Date.now() - opened > 2500 && retries.current < 3) {
            retries.current += 1;
            publish("reconnecting", "", 0);
            window.setTimeout(() => { if (!cancelled) setAttempt((value) => value + 1); }, 700);
            stop();
          } else publish("pending", "", 0);
          frames = 0;
        }, 1000);
      })
      .catch((error) => {
        if (!cancelled) publish(statusFor(hold.errorCode(error)), hold.errorCode(error));
      });
    return () => {
      cancelled = true;
      stop();
      hold.release();
      if (video.srcObject) video.srcObject = null;
    };
  }, [deviceId, attempt, videoRef]);

  return {
    status: display.status,
    error: display.error,
    stats: display.stats,
    reconnect: () => {
      retries.current = 0;
      setAttempt((value) => value + 1);
    },
  };
}
