"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { submitCamera } from "@/app/actions/settings";
import { formatMessage } from "@/lib/text";
import { cameraErrorCode } from "./camera-devices";
import { listSharedDevices } from "./camera-hub";
import { cameraStatusText, useCamera } from "./use-camera";

export function CameraControls({ dict, camera, showPreview = false, onReconnect, onCheck, streamStatus = "off", streamError = "" }) {
  const [state, action, pending] = useActionState(submitCamera, null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(camera.deviceId || "");
  const [deviceLabel, setDeviceLabel] = useState(camera.deviceLabel || "");
  const [source, setSource] = useState(camera.sourceKind || "usb");
  const [direction, setDirection] = useState(camera.direction === "exit" ? "exit" : "entrance");
  const [enabled, setEnabled] = useState(Boolean(camera.enabled));
  const [deviceError, setDeviceError] = useState("");
  const videoRef = useRef(null);
  const [held, setHeld] = useState(false);
  const preview = useCamera(showPreview && !held && camera.enabled && camera.sourceKind === "usb" ? camera.deviceId : "", videoRef);
  const status = showPreview ? preview.status : streamStatus;
  const problem = showPreview ? preview.error : streamError;

  const applyDevices = useCallback((found) => {
    setDevices(found);
    setDeviceError(found.length ? "" : "noCamera");
    setDeviceId((current) => {
      if (current && found.some((item) => item.deviceId === current)) return current;
      if (!current && !camera.deviceId) return "";
      const match = found.find((item) => item.label && item.label === camera.deviceLabel);
      return match?.deviceId || (found.length ? "" : current);
    });
  }, [camera.deviceId, camera.deviceLabel]);

  async function refreshDevices() {
    try {
      const status = await fetch("/api/gate/status", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).catch(() => null);
      const gateOn = Boolean(status?.agentUp && status?.desired !== "stopped");
      setHeld(gateOn);
      if (gateOn) return;
      applyDevices(await listSharedDevices());
    } catch (reason) {
      setDeviceError(cameraErrorCode(reason));
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gate/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((status) => {
        if (cancelled) return null;
        const gateOn = Boolean(status?.agentUp && status?.desired !== "stopped");
        setHeld(gateOn);
        return gateOn ? null : listSharedDevices();
      })
      .then((found) => {
        if (!cancelled && found) applyDevices(found);
      })
      .catch((reason) => {
        if (!cancelled) setDeviceError(cameraErrorCode(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [camera.id, applyDevices]);

  const listed = devices.some((item) => item.deviceId === deviceId);
  const options = listed || !deviceId || devices.length ? devices : [{ deviceId, label: deviceLabel || deviceId }];
  let connection = cameraStatusText(dict, status, problem);
  if (camera.sourceKind === "ip") connection = dict.monitoring.ipNoStream;
  else if (!camera.enabled) connection = dict.monitoring.connectionOff;
  else if (!camera.deviceId) connection = dict.monitoring.connectionPick;

  return (
    <form action={action} className="stack">
      <input type="hidden" name="id" value={camera.id} />
      <input type="hidden" name="device_id" value={source === "usb" ? deviceId : ""} />
      <input type="hidden" name="device_label" value={source === "usb" ? deviceLabel : ""} />
      <p className="muted">
        {camera.enabled ? dict.monitoring.savedOn : dict.monitoring.savedOff}
        {" · "}
        {connection}
      </p>
      {held ? <p className="muted">{dict.face.cameraHeld}</p> : null}
      {showPreview ? (
        <div className="live-stage">
          {showPreview && !held && camera.enabled && camera.deviceId ? <video ref={videoRef} autoPlay playsInline muted /> : null}
          {status === "working" ? null : (
            <div className="stage-note">
              <strong>{connection}</strong>
              {camera.sourceKind === "ip" ? dict.monitoring.ipNoStream : dict.monitoring.localOnly}
            </div>
          )}
        </div>
      ) : null}
      <label className="field">
        <span>{dict.monitoring.direction}</span>
        <select name="direction" value={direction} onChange={(event) => setDirection(event.target.value)}>
          <option value="entrance">{dict.monitoring.entrance}</option>
          <option value="exit">{dict.monitoring.exit}</option>
        </select>
      </label>
      <label className="field">
        <span>{dict.monitoring.source}</span>
        <select name="source" value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="usb">{dict.monitoring.usb}</option>
          <option value="ip">{dict.monitoring.ip}</option>
        </select>
      </label>
      {source === "ip" ? (
        <label className="field">
          <span>{dict.settings.host}</span>
          <input name="host" defaultValue={camera.host} placeholder="192.168.1.21" />
        </label>
      ) : (
        <label className="field">
          <span>{dict.monitoring.device}</span>
          <select
            value={deviceId}
            onChange={(event) => {
              const next = options.find((item) => item.deviceId === event.target.value);
              setDeviceId(event.target.value);
              setDeviceLabel(next?.label || "");
            }}
          >
            <option value="">{dict.monitoring.deviceEmpty}</option>
            {options.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
          </select>
        </label>
      )}
      <label className="check">
        <input type="checkbox" name="enabled" value="1" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        <span>{dict.monitoring.cameraSwitch}</span>
      </label>
      <p className="muted">{dict.monitoring.localOnly}</p>
      {deviceError === "permission" ? (
        <p className="form-error" role="alert">{dict.face.permission}</p>
      ) : deviceError ? <p className="form-error" role="alert">{dict.face[deviceError] || dict.face.failed}</p> : null}
      {state?.error === "camera_busy" ? (
        <p className="form-error" role="alert">{formatMessage(dict.monitoring.deviceBusy, { code: state.otherCode || "" })}</p>
      ) : state?.error ? <p className="form-error" role="alert">{dict.errors[state.error] || dict.errors.generic}</p> : null}
      {state?.ok ? <p className="ok-note">{dict.common.saved}</p> : null}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? dict.common.loading : dict.common.save}</button>
        <button className="btn btn-ghost" type="button" onClick={refreshDevices}>{deviceError === "permission" ? dict.monitoring.grantCamera : dict.monitoring.refreshDevices}</button>
        <button className="btn btn-ghost" type="button" onClick={() => { if (onReconnect) onReconnect(); else preview.reconnect(); }}>{dict.monitoring.reconnect}</button>
        {onCheck ? <button className="btn btn-ghost" type="button" onClick={onCheck}>{dict.monitoring.checkRecognition}</button> : (
          <Link className="btn btn-ghost" href={`/monitoring#camera-${camera.id}`}>{dict.monitoring.checkRecognition}</Link>
        )}
        {state?.error === "camera_busy" ? (
          <button className="btn btn-primary" type="submit" name="takeover" value="1" disabled={pending}>
            {formatMessage(dict.monitoring.moveDevice, { code: state.otherCode || "" })}
          </button>
        ) : null}
      </div>
    </form>
  );
}
