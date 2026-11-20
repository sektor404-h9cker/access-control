"use client";

import { useActionState, useEffect, useState } from "react";
import { submitRecognitionConfirm, submitRecognitionReject } from "@/app/actions/recognition";
import { formatDateTime } from "@/lib/time";

function Choice({ dict, id, action, label, tone }) {
  const [state, formAction, pending] = useActionState(action, null);
  useEffect(() => {
    if (state?.ok && state.alert?.id) window.dispatchEvent(new CustomEvent("smz-signal", { detail: state.alert }));
  }, [state]);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button className={`btn ${tone}`} type="submit" disabled={pending}>{pending ? dict.common.loading : label}</button>
    </form>
  );
}

function leaving(direction) {
  return direction === "out" || direction === "exit";
}

export function PassageQueue({ dict, canConfirm = false }) {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    let stop = false;
    function remember(event) {
      if (!event?.id) return;
      setEvents((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 3));
    }
    async function load() {
      try {
        const response = await fetch("/api/recognition/pending", { cache: "no-store" });
        const body = response.ok ? await response.json() : null;
        if (!stop && body?.ok) setEvents(body.events || []);
      } catch {
        if (!stop) setEvents([]);
      }
    }
    function onPassage(message) {
      remember(message.detail);
    }
    load();
    window.addEventListener("smz-passage", onPassage);
    const timer = window.setInterval(load, 1000);
    return () => {
      stop = true;
      window.removeEventListener("smz-passage", onPassage);
      window.clearInterval(timer);
    };
  }, []);
  if (!events.length) return null;
  return (
    <div className="stack">
      {events.map((event) => (
        <article key={event.id} className="passage-card">
          <p className="passage-kicker">{dict.monitoring.detected}</p>
          <h3>{event.name || "—"}</h3>
          {event.department ? <p>{event.department}</p> : null}
          {event.position ? <p>{event.position}</p> : null}
          <p className="muted">
            {event.cameraCode || "—"}
            {" · "}
            {leaving(event.direction) ? dict.monitoring.exit : dict.monitoring.entrance}
            {" · "}
            {dict.monitoring[event.outcome] || event.outcome}
            {event.at ? ` · ${formatDateTime(event.at)}` : ""}
          </p>
          <p className="passage-wait">{dict.monitoring.waitingDecision}</p>
          {canConfirm ? (
            <div className="form-actions">
              <Choice dict={dict} id={event.id} action={submitRecognitionConfirm} label={dict.monitoring.confirmEvent} tone="btn-primary" />
              <Choice dict={dict} id={event.id} action={submitRecognitionReject} label={dict.monitoring.rejectEvent} tone="btn-ghost" />
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
