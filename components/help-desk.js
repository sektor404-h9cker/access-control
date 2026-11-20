"use client";

import { useEffect, useState } from "react";
import { closeHelp, confirmHelp, requestHelp } from "@/app/actions/vision";
import { formatMessage } from "@/lib/text";

export function HelpDesk({ dict, camera, canConfirm, compact = false }) {
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const response = await fetch("/api/help", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (!stop && body.ok) setRows(body.requests || []);
      } catch {
        // The next poll retries. A missed poll does not invent a request.
      }
    }
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  async function call() {
    if (!camera?.id) return;
    const data = new FormData();
    data.set("camera_id", camera.id);
    data.set("source", "button");
    const result = await requestHelp(data);
    setNote(result?.ok ? formatMessage(dict.vision.assistNotice, { code: camera.code }) : dict.errors[result?.error] || dict.errors.generic);
  }

  async function act(action, id) {
    const data = new FormData();
    data.set("id", id);
    const result = await action(data);
    if (!result?.ok) setNote(dict.errors[result?.error] || dict.errors.generic);
  }

  const visible = compact ? rows.filter((row) => row.status !== "closed").slice(0, 3) : rows.slice(0, 8);
  return (
    <section className="panel">
      <div className="panel-hd">
        <div>
          <h2>{dict.vision.assist}</h2>
          <p>{dict.vision.notEmergency}</p>
        </div>
        {canConfirm && camera?.id ? <button className="btn btn-primary" type="button" onClick={call}>{dict.vision.assistButton}</button> : null}
      </div>
      <div className="panel-bd stack">
        {note ? <p className="banner" role="status">{note}</p> : null}
        {visible.length ? visible.map((row) => (
          <div key={row.id} className="split">
            <div>
              <strong>{formatMessage(dict.vision.assistNotice, { code: row.camera_code || "CAM" })}</strong>
              <p className="muted">{row.status === "open" ? dict.vision.assistOpen : row.status === "confirmed" ? dict.vision.assistConfirmed : dict.vision.assistClosed}</p>
            </div>
            {canConfirm && row.status !== "closed" ? (
              <div className="form-actions">
                {row.status === "open" ? <button className="btn btn-ghost" type="button" onClick={() => act(confirmHelp, row.id)}>{dict.vision.assistConfirm}</button> : null}
                <button className="btn btn-ghost" type="button" onClick={() => act(closeHelp, row.id)}>{dict.vision.assistClose}</button>
              </div>
            ) : null}
          </div>
        )) : <p className="muted">{dict.vision.assistEmpty}</p>}
      </div>
    </section>
  );
}
