"use client";

import { useActionState, useEffect, useState } from "react";
import { submitPairing } from "@/app/actions/pair";

export function PhonePair({ dict, employeeId }) {
  const [state, action, pending] = useActionState(submitPairing, null);
  const [frame, setFrame] = useState("");
  const link = state?.token && typeof window !== "undefined" ? `${window.location.origin}/pair/${state.token}` : "";

  useEffect(() => {
    if (!state?.token) return undefined;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/pair/${state.token}/frame`, { cache: "no-store" });
      if (cancelled || !response.ok || response.status === 204) return;
      const blob = await response.blob();
      setFrame((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
    }, 700);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [state?.token]);

  async function copy() {
    if (link) await navigator.clipboard.writeText(link);
  }

  return (
    <form action={action} className="stack">
      <input type="hidden" name="employee_id" value={employeeId} />
      <p className="muted">{dict.face.phoneHint}</p>
      {state?.error ? <p className="form-error" role="alert">{dict.errors[state.error] || dict.errors.generic}</p> : null}
      <button className="btn btn-ghost" type="submit" disabled={pending}>{pending ? dict.common.loading : dict.face.phoneCamera}</button>
      {link ? (
        <div className="stack">
          <p className="muted">{dict.face.phoneLink}</p>
          <code className="pair-link">{link}</code>
          <button className="btn btn-ghost" type="button" onClick={copy}>{dict.face.phoneCopy}</button>
          {frame ? (
            // The frame is a short-lived local object URL, not a remote image.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="pair-preview" src={frame} alt="" />
          ) : <p className="muted">{dict.face.phoneWaiting}</p>}
        </div>
      ) : null}
    </form>
  );
}
