"use client";

import { useRef, useState } from "react";
import { FaceCapture } from "./face-capture";
import { fillEnrollmentForm } from "./face-vision";

export function PhoneEnroll({ dict, employeeId, token, name }) {
  const [phase, setPhase] = useState("ready");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const tokenRef = useRef("");

  async function preview(blob) {
    await fetch(`/api/pair/${token}/frame`, {
      method: "POST",
      headers: { "content-type": "image/jpeg" },
      body: blob,
    });
  }

  async function confirm(result) {
    if (!tokenRef.current) tokenRef.current = crypto.randomUUID();
    const data = new FormData();
    data.set("employee_id", employeeId);
    data.set("client_token", tokenRef.current);
    if (result.replace) data.set("confirm_replace", "1");
    fillEnrollmentForm(data, result);
    setBusy(true);
    const response = await fetch(`/api/pair/${token}/enroll`, { method: "POST", body: data });
    const payload = await response.json().catch(() => ({ ok: false, error: "failed" }));
    setBusy(false);
    if (payload.ok) setDone(true);
    else setError(payload.error || "failed");
  }

  if (phase === "ready") {
    return (
      <main className="page">
        <h1>{name}</h1>
        <button className="btn btn-primary" type="button" onClick={() => setPhase(window.isSecureContext ? "live" : "blocked")}>{dict.face.phoneCamera}</button>
      </main>
    );
  }
  if (phase === "blocked") {
    return (
      <main className="page">
        <h1>{dict.face.phoneCamera}</h1>
        <p>{dict.face.phoneInsecure}</p>
        <p>{dict.face.phoneSystem}</p>
      </main>
    );
  }
  if (done) return <main className="page"><h1>{dict.face.hintDone}</h1><p>{name}</p></main>;
  return (
    <main className="page">
      <h1>{name}</h1>
      <FaceCapture dict={dict} busy={busy} serverError={error ? (dict.errors[error] || dict.face.failed) : ""} onPreview={preview} onClose={() => setPhase("ready")} onConfirm={confirm} />
    </main>
  );
}
