"use client";

import { useActionState, useEffect } from "react";
import { submitRecognitionConfirm, submitRecognitionReject } from "@/app/actions/recognition";
import { formatDateTime } from "@/lib/time";
import { Empty } from "./ui";

function Decision({ dict, id, action, label }) {
  const [state, formAction, pending] = useActionState(action, null);
  useEffect(() => {
    if (state?.ok && state.alert?.id) window.dispatchEvent(new CustomEvent("smz-signal", { detail: state.alert }));
  }, [state]);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-ghost" type="submit" disabled={pending}>{pending ? dict.common.loading : label}</button>
      {state?.error ? <p className="form-error">{dict.errors[state.error] || dict.errors.generic}</p> : null}
    </form>
  );
}

export function RecognitionJournal({ dict, locale, events, canConfirm }) {
  if (!events.length) return <Empty title={dict.monitoring.journalEmpty} />;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>{dict.common.time}</th>
            <th>{dict.attendance.employee}</th>
            <th>{dict.monitoring.result}</th>
            <th>{dict.monitoring.source}</th>
            <th>{dict.monitoring.similarity}</th>
            <th>{dict.monitoring.latency}</th>
            {canConfirm ? <th>{dict.common.actions}</th> : null}
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td className="num">{formatDateTime(event.at, locale)}</td>
              <td>{event.name || "—"}</td>
              <td>{dict.monitoring[event.outcome] || event.outcome} · {dict.monitoring[event.status] || event.status}</td>
              <td>{event.cameraCode || "—"} {event.direction === "out" ? dict.monitoring.exit : event.direction === "in" ? dict.monitoring.entrance : ""}</td>
              <td className="num">{event.score ?? "—"}</td>
              <td className="num">{event.latencyMs ?? "—"}</td>
              {canConfirm ? (
                <td>
                  {event.status === "pending" ? (
                    <div className="form-actions">
                      <Decision dict={dict} id={event.id} action={submitRecognitionConfirm} label={dict.monitoring.confirmEvent} />
                      <Decision dict={dict} id={event.id} action={submitRecognitionReject} label={dict.monitoring.rejectEvent} />
                    </div>
                  ) : "—"}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
