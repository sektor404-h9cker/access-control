"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitGateDesired } from "@/app/actions/gate";
import { submitPerformanceProfile } from "@/app/actions/vision";
import { startMonitoring, stopMonitoring } from "@/app/actions/monitor";
import { formatMessage } from "@/lib/text";
import { audioState, enqueueAlert, primeAudio, setAudioMuted, stopAudio } from "./audio-session";
import { cameraErrorCode } from "./camera-devices";
import { listSharedDevices } from "./camera-hub";
import { CameraPreview } from "./camera-preview";
import { GateStage } from "./gate-stage";
import { CameraLog } from "./camera-log";
import { PassageQueue } from "./passage-queue";

const STATE_KEY = {
  stopped: "stateStopped",
  connecting: "stateConnecting",
  "loading-ai": "stateAi",
  running: "stateRunning",
  "running-without-ai": "stateNoAi",
  permission: "statePermission",
  unavailable: "stateUnavailable",
  error: "stateError",
  stopping: "stateStopping",
};

function toneFor(state) {
  if (state === "running") return "badge-ok";
  if (state === "running-without-ai" || state === "permission" || state === "unavailable") return "badge-warn";
  if (state === "error") return "badge-danger";
  return "badge-muted";
}

function headline(pending, cameras, reports, modelReady, running) {
  if (pending === "stopping") return "stopping";
  if (pending === "connecting") return "connecting";
  const active = cameras.filter((camera) => camera.enabled && camera.sourceKind === "usb" && camera.deviceId);
  if (running && !active.length) return "connecting";
  if (!active.length) return "stopped";
  const states = active.map((camera) => reports[camera.id]).filter(Boolean);
  if (!states.length || states.some((item) => item.video === "pending" || item.video === "reconnecting" || item.video === "off")) return "connecting";
  if (states.some((item) => item.video === "permission")) return "permission";
  const working = states.filter((item) => item.video === "working");
  if (!working.length) {
    if (states.some((item) => item.video === "missing")) return "unavailable";
    return "error";
  }
  if (!modelReady || working.every((item) => item.ai === "failed")) return "running-without-ai";
  if (working.some((item) => item.ai === "busy" || item.ai === "idle")) return "loading-ai";
  return "running";
}

function cameraTone(report) {
  if (!report) return "badge-muted";
  if (report.video === "working" && (report.ai === "ready" || report.ai === "shared")) return "badge-ok";
  if (report.video === "working") return "badge-warn";
  if (report.video === "permission" || report.video === "missing" || report.video === "failed" || report.video === "stalled") return "badge-danger";
  return "badge-muted";
}

export function MonitorDeck({ dict, cameras, canControl, canConfirm = false, owner, mode = "review", modelReady = false, templateCount = 0, alertSettings = null, passage = true }) {
  const router = useRouter();
  const lock = useRef(false);
  const [pending, setPending] = useState("");
  const [problem, setProblem] = useState(null);
  const [api, setApi] = useState(null);
  const [diag, setDiag] = useState(false);
  const [reports, setReports] = useState({});
  const serverRunning = cameras.some((camera) => camera.enabled && camera.sourceKind === "usb" && camera.deviceId);
  const [sound, setSound] = useState(serverRunning ? "blocked" : "idle");
  const [muted, setMuted] = useState(false);
  const [armed, setArmed] = useState(null);
  const [gate, setGate] = useState(null);
  const [gateKnown, setGateKnown] = useState(false);
  if (armed !== null && armed === serverRunning) setArmed(null);
  const running = armed === null ? serverRunning : armed;
  const active = cameras.filter((camera) => camera.enabled && camera.sourceKind === "usb" && camera.deviceId);
  const state = headline(pending, cameras, reports, modelReady, running);
  const showDiag = diag || ["permission", "unavailable", "error", "running-without-ai"].includes(state) || problem;

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const response = await fetch("/api/gate/status", { cache: "no-store" });
        if (stop) return;
        if (!response.ok) {
          setGateKnown(true);
          return;
        }
        setGate(await response.json());
        setGateKnown(true);
      } catch {
        if (!stop) setGateKnown(true);
      }
    }
    load();
    const timer = window.setInterval(load, 2000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    function onSignal(event) {
      const detail = event.detail || {};
      if (!detail.sound) return;
      enqueueAlert(detail);
    }
    function unlock() {
      primeAudio({ open: true }).then((next) => setSound((current) => (current === next ? current : next)));
    }
    window.addEventListener("smz-signal", onSignal);
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("smz-signal", onSignal);
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  useEffect(() => {
    if (!alertSettings?.enabled || muted) return undefined;
    const timer = window.setTimeout(() => {
      if (audioState() === "running") setSound("running");
      else if (serverRunning) setSound("blocked");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [alertSettings?.enabled, muted, serverRunning]);
  const remember = useCallback((report) => {
    setReports((current) => {
      const previous = current[report.id];
      if (previous && previous.video === report.video && previous.ai === report.ai && previous.fps === report.fps && previous.quality === report.quality && previous.stalled === report.stalled) return current;
      return { ...current, [report.id]: report };
    });
  }, []);

  async function start(onlyId = "") {
    if (lock.current) return;
    lock.current = true;
    setPending("connecting");
    setProblem(null);
    try {
      const devices = await listSharedDevices();
      const ping = await fetch("/api/recognition/latest", { cache: "no-store" });
      setApi(ping.ok);
      const result = await startMonitoring({ devices, onlyId });
      if (!result?.ok) setProblem(result || { error: "failed" });
      else {
        setArmed(true);
        router.refresh();
      }
    } catch (error) {
      setProblem({ error: cameraErrorCode(error) });
    } finally {
      lock.current = false;
      setPending("");
    }
  }

  async function stop() {
    if (lock.current) return;
    lock.current = true;
    setPending("stopping");
    stopAudio();
    setSound("idle");
    try {
      const result = await stopMonitoring();
      if (!result?.ok) setProblem(result || { error: "failed" });
      else {
        setArmed(false);
        setReports({});
        router.refresh();
      }
    } finally {
      lock.current = false;
      setPending("");
    }
  }

  const agentUp = Boolean(gate?.agentUp);
  const gateBanner = gate?.attention
    ? dict.gate.bannerAttention
    : gate?.system === "working"
      ? dict.gate.bannerWorking
      : gate?.system === "no-ai"
        ? dict.gate.bannerNoAi
        : gate?.system === "no-frames"
          ? dict.gate.bannerNoFrames
          : gate?.system === "stopped"
            ? dict.gate.bannerStopped
            : gate?.system === "agent"
              ? dict.gate.bannerAgent
              : "";

  return (
    <section className="stack">
      <div className="panel">
        <div className="panel-bd monitor-bar">
          <div>
            <span className={`badge ${agentUp ? (gate?.system === "working" ? "badge-ok" : gate?.system === "no-ai" || gate?.system === "stopped" ? "badge-warn" : "badge-danger") : toneFor(state)}`}>{agentUp ? (gate?.system === "working" ? dict.gate.working : gate?.system === "no-ai" ? dict.gate.noAi : gate?.system === "stopped" ? dict.gate.stopped : gate?.system === "no-frames" ? dict.gate.noFrames : dict.gate.agent) : dict.monitoring[STATE_KEY[state]]}</span>
            <p className="muted">{!gateKnown ? dict.gate.checking : agentUp ? (gate?.system === "working" ? dict.gate.working : gate?.system === "stopped" ? dict.gate.stopped : gate?.system === "no-frames" ? dict.gate.noFrames : dict.gate.agent) : dict.monitoring.browserOnly}</p>
          </div>
          <div className="form-actions">
            {owner && agentUp ? (
              <form action={submitGateDesired}>
                <button className="btn btn-ghost" type="submit" name="desired" value={gate?.desired === "stopped" ? "running" : "stopped"}>
                  {gate?.desired === "stopped" ? dict.gate.start : dict.gate.stop}
                </button>
              </form>
            ) : null}
            {canControl && gateKnown && !agentUp ? (
              running ? (
                <button className="btn btn-primary monitor-go" type="button" disabled={Boolean(pending)} onClick={stop}>
                  {pending === "stopping" ? dict.monitoring.stateStopping : dict.monitoring.stop}
                </button>
              ) : (
                <button className="btn btn-primary monitor-go" type="button" disabled={Boolean(pending)} onClick={() => { const primed = primeAudio({ open: true }); primed.then((next) => setSound(next)); start(); }}>
                  {pending === "connecting" ? dict.monitoring.stateConnecting : dict.monitoring.start}
                </button>
              )
            ) : null}
            {owner ? <Link className="btn btn-ghost" href="/settings#camera-entrance">{dict.monitoring.settingsLink}</Link> : null}
            <button className="btn btn-ghost" type="button" onClick={() => setDiag((value) => !value)}>{dict.monitoring.diagnostics}</button>
            {canControl ? (
              <button className="btn btn-ghost" type="button" onClick={() => { const next = !muted; setMuted(next); setAudioMuted(next); }}>
                {muted ? dict.monitoring.soundUnmute : dict.monitoring.soundMute}
              </button>
            ) : null}
            {alertSettings?.enabled && !muted && running && sound !== "running" ? (
              <button className="btn btn-primary" type="button" onClick={() => { primeAudio({ open: true }).then((next) => setSound(next)); }}>{dict.monitoring.alertSound}</button>
            ) : null}
          </div>
        </div>
        {problem?.error === "same_device" ? (
          <div className="panel-bd stack">
            <p className="banner">{dict.monitoring.pickDirection}</p>
            <div className="form-actions">
              {(problem.choices || []).map((choice) => (
                <button key={choice.id} className="btn btn-ghost" type="button" disabled={Boolean(pending)} onClick={() => { primeAudio({ open: true }).then((next) => setSound(next)); start(choice.id); }}>
                  {formatMessage(dict.monitoring.useThis, { code: choice.code })}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {problem && problem.error !== "same_device" ? (
          <div className="panel-bd">
            <p className="form-error" role="alert">{dict.errors[problem.error] || dict.face[problem.error] || dict.monitoring.stateError}</p>
            <div className="form-actions">
              {cameras.filter((camera) => camera.sourceKind !== "ip").map((camera) => (
                <Link key={camera.id} className="btn btn-ghost" href={`/settings#camera-${camera.id}`}>{dict.monitoring.chooseCamera}: {camera.code}</Link>
              ))}
            </div>
          </div>
        ) : null}
        {showDiag ? (
          <div className="panel-bd">
            <h2>{dict.monitoring.diagTitle}</h2>
            {owner ? (
              <form action={submitPerformanceProfile} className="form-actions">
                <button className="btn btn-ghost" type="submit" name="performance" value="economy">{dict.settings.aiEconomy}</button>
                <button className="btn btn-ghost" type="submit" name="performance" value="balanced">{dict.settings.aiBalanced}</button>
                <button className="btn btn-ghost" type="submit" name="performance" value="quality">{dict.settings.aiQuality}</button>
              </form>
            ) : null}
            {gateBanner ? <p className="muted">{gateBanner}</p> : null}
            <p className="muted">{passage ? dict.monitoring.motionMode : dict.monitoring.stillMode}</p>
            <p className="muted">{mode === "pilot" ? dict.monitoring.pilotMode : dict.monitoring.reviewMode}</p>
            <p className="muted">{!alertSettings?.enabled ? dict.monitoring.soundSavedOff : muted ? dict.monitoring.soundOff : sound === "running" ? dict.monitoring.soundOn : sound === "blocked" || sound === "missing" ? dict.monitoring.alertBlocked : running ? dict.monitoring.soundPress : dict.monitoring.soundIdle}</p>
            {templateCount ? null : <p className="muted">{dict.monitoring.noFaces}</p>}
            <ul className="stack">
              <li>{modelReady ? dict.monitoring.checkModel : dict.errors.model_missing}</li>
              <li>{templateCount ? dict.monitoring.checkTemplates.replace("{count}", String(templateCount)) : dict.monitoring.checkNoTemplates}</li>
              <li>{api === false ? dict.monitoring.apiDown : dict.monitoring.apiOk}</li>
              <li>{dict.monitoring.distanceNote}</li>
              {active.map((camera) => {
                const report = reports[camera.id];
                const video = report?.video === "working" ? dict.monitoring.checkCamera : report?.video === "permission" ? dict.face.permission : report?.video === "missing" ? dict.monitoring.deviceStale : dict.monitoring.connectionPending;
                const ai = report?.ai === "ready" || report?.ai === "shared" ? dict.monitoring.checkDetector : report?.ai === "failed" ? dict.monitoring.aiDown : dict.monitoring.detectorBusy;
                return <li key={camera.id}>{camera.code}: {video} {ai}</li>;
              })}
            </ul>
          </div>
        ) : null}
      </div>
      {(() => {
        const localCameras = cameras.filter((camera) => camera.sourceKind !== "ip");
        const deviceIds = localCameras.map((camera) => camera.deviceId).filter(Boolean);
        const labels = localCameras.map((camera) => camera.deviceLabel).filter(Boolean);
        const shared = deviceIds.find((id, index) => deviceIds.indexOf(id) !== index) || labels.find((label, index) => labels.indexOf(label) !== index);
        const shown = shared ? localCameras.filter((camera) => camera.direction !== "exit") : localCameras;
        return (
      <div className="camera-row">
      <div>
      {shared ? <p className="muted">{dict.monitoring.sharedDevice}</p> : null}
      <div className="live-grid" data-count="1">
        {shown.map((camera) => {
          const report = reports[camera.id];
          const remote = gate?.cameras?.find((item) => item.id === camera.id);
          const showRemote = agentUp && (remote?.state === "working" || remote?.state === "no-ai");
          const on = camera.enabled && camera.sourceKind === "usb" && camera.deviceId;
          const label = agentUp
            ? dict.gate[remote?.state === "working" ? "working" : remote?.state === "no-ai" ? "noAi" : remote?.state === "stopped" ? "stopped" : remote?.state === "agent" ? "agent" : "noFrames"]
            : on && report?.video === "working"
              ? dict.monitoring.connectionWorking
              : on
                ? dict.monitoring[STATE_KEY[state]]
                : camera.deviceId || camera.deviceLabel
                  ? dict.monitoring.stateStopped
                  : dict.monitoring.stateUnavailable;
          return (
            <article key={camera.id} className="panel" id={`camera-${camera.id}`}>
              <div className="panel-hd">
                <div>
                  <h2>{camera.code}</h2>
                  <p>{camera.direction === "exit" ? dict.monitoring.exit : dict.monitoring.entrance}{camera.deviceLabel ? ` · ${camera.deviceLabel}` : ""}</p>
                </div>
                <span className={`badge ${showRemote && remote?.state === "working" ? "badge-ok" : showRemote || (agentUp && remote?.state === "stopped") ? "badge-warn" : agentUp ? "badge-danger" : on ? cameraTone(report) : "badge-muted"}`}>{label}</span>
              </div>
              <div className="panel-bd">
                {showRemote ? (
                  <GateStage cameraId={camera.id} code={camera.code} dict={dict} owner={owner} />
                ) : agentUp || !gateKnown ? (
                  <p className="muted">{gateKnown ? label : dict.gate.checking}</p>
                ) : on ? (
                  <CameraPreview dict={dict} camera={camera} canWrite={false} compact mode={mode} modelReady={modelReady} templateCount={templateCount} owner={false} alertSettings={alertSettings} onStatus={remember} passage={passage} />
                ) : (
                  <Link className="btn btn-ghost" href={`/settings#camera-${camera.id}`}>{dict.monitoring.chooseCamera}</Link>
                )}
                {on && report ? (
                  <p className="muted">
                    {dict.vision.healthFps}: {report.fps || "—"} · {dict.vision.healthAi}: {report.ai || "—"}
                    {report.stalled ? ` · ${dict.vision.stalled}` : ""}
                    {report.quality === "dark" ? ` · ${dict.vision.dark}` : ""}
                    {report.quality === "blur" ? ` · ${dict.vision.blur}` : ""}
                    {report.quality === "far" ? ` · ${dict.vision.smallFace}` : ""}
                  </p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      </div>
      <aside className="panel camera-log">
        <div className="panel-hd"><h2>{dict.monitoring.faceSeen}</h2></div>
        <div className="panel-bd stack">
          <CameraLog cameraId={shown[0]?.id || ""} dict={dict} />
          <PassageQueue dict={dict} canConfirm={canConfirm} />
        </div>
      </aside>
      </div>
        );
      })()}
    </section>
  );
}
