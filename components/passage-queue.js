"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/time";

function leaving(direction) {
  return direction === "out" || direction === "exit";
}

function statusText(dict, event) {
  if (event.status === "registered") return dict.monitoring.autoRegistered;
  if (event.status === "paused") return dict.monitoring.pausedAuto;
  if (event.status === "error") return dict.monitoring.registerError;
  if (event.reason === "hold") return dict.monitoring.waitPresence;
  return dict.monitoring.waitSecond;
}

export function PassageQueue({ dict }) {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const response = await fetch("/api/recognition/live", { cache: "no-store" });
        const body = response.ok ? await response.json() : null;
        if (!stop && body?.ok) setEvents(body.events || []);
      } catch {
        if (!stop) setEvents([]);
      }
    }
    function onPassage(message) {
      const event = message.detail;
      if (!event?.id) return;
      setEvents((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 8));
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
  if (!events.length) return <p className="muted">{dict.monitoring.presenceMode}</p>;
  const waiting = events.filter((event) => event.status !== "registered");
  const saved = events.filter((event) => event.status === "registered");
  return (
    <div className="stack">
      <p className="muted">{dict.monitoring.presenceMode}</p>
      {waiting.length ? <h3>{dict.monitoring.liveRecognitions}</h3> : null}
      {waiting.map((event) => (
        <article key={event.id} className="passage-card">
          <p className="passage-kicker">{event.status === "error" ? dict.monitoring.registerError : dict.monitoring.identityConfirmed}</p>
          <h3>{event.name || "—"}</h3>
          {event.department ? <p>{event.department}</p> : null}
          {event.position ? <p>{event.position}</p> : null}
          <p className="muted">
            {event.cameraCode || "—"}
            {" · "}
            {leaving(event.direction) ? dict.monitoring.exit : dict.monitoring.entrance}
            {event.at ? ` · ${formatDateTime(event.at)}` : ""}
          </p>
          <p className="passage-wait">{statusText(dict, event)}{event.error ? ` · ${dict.errors[event.error] || event.error}` : ""}</p>
        </article>
      ))}
      {saved.length ? <h3>{dict.monitoring.autoEvents}</h3> : null}
      {saved.map((event) => (
        <article key={event.id} className="passage-card">
          <p className="passage-kicker">{dict.monitoring.autoRegistered}</p>
          <h3>{event.name || "—"}</h3>
          {event.department ? <p>{event.department}</p> : null}
          {event.position ? <p>{event.position}</p> : null}
          <p className="muted">
            {event.cameraCode || "—"}
            {" · "}
            {leaving(event.direction) ? dict.monitoring.exit : dict.monitoring.entrance}
            {event.at ? ` · ${formatDateTime(event.at)}` : ""}
          </p>
          <p className="passage-wait">{dict.monitoring.autoRegistered}</p>
        </article>
      ))}
    </div>
  );
}
