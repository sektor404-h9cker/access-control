"use client";

import { useEffect, useRef, useState } from "react";
import { audioState, enqueueAlert, primeAudio } from "./audio-session";

export function OperatorAlert({ dict, history }) {
  const [notice, setNotice] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const playedRef = useRef("");

  useEffect(() => {
    function onSignal(event) {
      const detail = event.detail || {};
      if (!detail.visual || !detail.id || playedRef.current === detail.id) return;
      playedRef.current = detail.id;
      setNotice(detail);
      if (!detail.sound || detail.tone === "silent") return;
      enqueueAlert(detail);
      setBlocked(audioState() !== "running");
    }
    window.addEventListener("smz-signal", onSignal);
    window.addEventListener("smz-unknown", onSignal);
    return () => {
      window.removeEventListener("smz-signal", onSignal);
      window.removeEventListener("smz-unknown", onSignal);
    };
  }, []);

  function allowSound() {
    primeAudio({ open: true }).then((state) => setBlocked(state !== "running"));
  }

  return (
    <section className="panel" style={{ marginTop: 12 }}>
      <div className="panel-hd">
        <div>
          <h2>{dict.monitoring.alertHistory}</h2>
          <p>{dict.monitoring.alertBody}</p>
        </div>
        {blocked ? <button className="btn btn-ghost" type="button" onClick={allowSound}>{dict.monitoring.alertSound}</button> : null}
      </div>
      {notice ? <p className="banner" role="status">{dict.monitoring.alertTitle}. {dict.monitoring.alertBody}</p> : null}
      {blocked ? <p className="banner">{dict.monitoring.alertBlocked}</p> : null}
      {history.length === 0 ? <p className="empty">{dict.monitoring.alertEmpty}</p> : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>{dict.common.time}</th><th>{dict.settings.cameras}</th></tr></thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td className="num">{entry.label}</td>
                  <td>{entry.cameraCode || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
