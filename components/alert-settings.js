"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitAlert } from "@/app/actions/settings";
import { Field } from "./ui";
import { playNow } from "./audio-session";
import { TONE_IDS } from "./tones";

export function AlertSettings({ dict, alert }) {
  const [state, action, pending] = useActionState(submitAlert, null);
  const [devices, setDevices] = useState([]);
  const [sink, setSink] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [proof, setProof] = useState(null);
  const tones = alert.tones || {};
  const formRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    const Context = window.AudioContext || window.webkitAudioContext;
    const supported = Boolean(Context?.prototype?.setSinkId);
    const listed = navigator.mediaDevices?.enumerateDevices?.() || Promise.resolve([]);
    listed
      .then((list) => {
        if (cancelled) return;
        setSink(supported);
        setDevices(list.filter((item) => item.kind === "audiooutput" && item.deviceId));
      })
      .catch(() => {
        if (!cancelled) setSink(supported);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function readChoice(toneId) {
    const data = new FormData(formRef.current || undefined);
    return {
      tone: toneId || String(data.get("tone_matched") || "soft"),
      volume: Number(data.get("volume") || alert.volume || 60),
      deviceId: String(data.get("device_id") || ""),
    };
  }

  function preview(id) {
    const choice = readChoice(id);
    playNow(choice.tone, choice.volume, choice.deviceId).then((result) => {
      setProof(result);
      setBlocked(!result.heard);
    });
  }

  return (
    <form ref={formRef} action={action} className="stack">
      <p className="muted">{dict.settings.soundHint}</p>
      {state?.error ? <p className="form-error" role="alert">{dict.errors[state.error] || dict.errors.generic}</p> : null}
      {state?.ok ? <p className="ok-note">{dict.common.saved}</p> : null}
      {blocked ? <p className="banner">{dict.monitoring.alertBlocked}</p> : null}
      {proof?.heard ? <p className="ok-note">{dict.settings.soundHeard}</p> : null}
      {proof && !proof.heard ? <p className="form-error">{dict.settings.soundNotHeard}</p> : null}
      <button className="btn btn-primary" type="button" onClick={() => preview()}>{dict.settings.soundCheck}</button>
      <label className="check">
        <input type="checkbox" name="enabled" value="1" defaultChecked={alert.enabled} />
        <span>{dict.settings.alertEnabled}</span>
      </label>
      <fieldset className="stack">
        <legend>{dict.settings.soundLibrary}</legend>
        {TONE_IDS.filter((id) => id !== "silent").map((id) => (
          <div className="form-actions" key={id}>
            <span>{dict.settings[`sound_${id}`]}</span>
            <button className="btn btn-ghost" type="button" onClick={() => preview(id)}>{dict.settings.soundPreview}</button>
          </div>
        ))}
      </fieldset>
      <label className="check"><input type="checkbox" name="voice" value="1" defaultChecked={alert.voice} /><span>{dict.settings.soundVoice}</span></label>
      <label className="check"><input type="checkbox" name="speak_name" value="1" defaultChecked={alert.speakName} /><span>{dict.settings.soundSpeakName}</span></label>
      {[
        ["matched", "soundMatched"],
        ["unknown", "soundUnknown"],
        ["ambiguous", "soundAmbiguous"],
        ["camera", "soundCamera"],
        ["confirmed", "soundConfirmed"],
      ].map(([kind, label]) => (
        <label className="field" key={kind}>
          <span>{dict.settings[label]}</span>
          <select name={`tone_${kind}`} defaultValue={tones[kind] || alert.tone || "soft"}>
            {TONE_IDS.map((id) => <option key={id} value={id}>{dict.settings[`sound_${id}`]}</option>)}
          </select>
        </label>
      ))}
      <Field label={dict.settings.alertVolume} name="volume" dict={dict} type="number" min="0" max="100" defaultValue={alert.volume} required />
      <Field label={dict.settings.alertCooldown} name="cooldown" dict={dict} type="number" min="8" max="60" defaultValue={alert.cooldownSeconds} required />
      <label className="check"><input type="checkbox" name="event_matched" value="1" defaultChecked={alert.events.matched !== false} /><span>{dict.settings.soundMatched}</span></label>
      <label className="check"><input type="checkbox" name="event_unknown" value="1" defaultChecked={alert.events.unknown} /><span>{dict.settings.soundUnknown}</span></label>
      <label className="check"><input type="checkbox" name="event_ambiguous" value="1" defaultChecked={alert.events.ambiguous} /><span>{dict.settings.soundAmbiguous}</span></label>
      <label className="check"><input type="checkbox" name="event_confirmed" value="1" defaultChecked={alert.events.confirmed} /><span>{dict.settings.soundConfirmed}</span></label>
      <label className="check"><input type="checkbox" name="event_camera" value="1" defaultChecked={alert.events.camera} /><span>{dict.settings.soundCamera}</span></label>
      <label className="check"><input type="checkbox" name="cam_entrance" value="1" defaultChecked={alert.cameras.entrance} /><span>{dict.settings.soundEntrance}</span></label>
      <label className="check"><input type="checkbox" name="cam_exit" value="1" defaultChecked={alert.cameras.exit} /><span>{dict.settings.soundExit}</span></label>
      <label className="field">
        <span>{dict.settings.alertDevice}</span>
        <select name="device_id" defaultValue={alert.deviceId}>
          <option value="">{dict.settings.alertDefault}</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>{device.label || device.deviceId}</option>
          ))}
        </select>
      </label>
      {devices.length ? null : <p className="muted">{dict.settings.alertNoList}</p>}
      {sink ? null : <p className="muted">{dict.settings.alertNoSink}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? dict.common.loading : dict.common.save}</button>
    </form>
  );
}
