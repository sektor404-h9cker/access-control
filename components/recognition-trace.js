"use client";

import { useEffect, useState } from "react";

export function RecognitionTrace({ dict }) {
  const [faces, setFaces] = useState([]);
  useEffect(() => {
    function onTrace(event) {
      const next = Array.isArray(event.detail) ? event.detail : [];
      setFaces(next);
    }
    window.addEventListener("smz-trace", onTrace);
    return () => window.removeEventListener("smz-trace", onTrace);
  }, []);
  const face = faces[0];
  return (
    <section className="panel">
      <div className="panel-hd"><h2>{dict.monitoring.traceTitle}</h2></div>
      <div className="panel-bd">
        {!face ? <p className="muted">{dict.monitoring.traceWait}</p> : (
          <dl className="trace-grid">
            <div><dt>{dict.monitoring.traceDetected}</dt><dd>{face.detected ? dict.monitoring.traceYes : dict.monitoring.traceNo}</dd></div>
            <div><dt>{dict.monitoring.traceConfidence}</dt><dd>{face.detectionConfidence ?? "—"}</dd></div>
            <div><dt>{dict.monitoring.traceFacePx}</dt><dd>{face.facePx || "—"}</dd></div>
            <div><dt>{dict.monitoring.traceAligned}</dt><dd>{face.aligned ? dict.monitoring.traceYes : dict.monitoring.traceNo}</dd></div>
            <div><dt>{dict.monitoring.traceEmbedded}</dt><dd>{face.embedded ? dict.monitoring.traceYes : dict.monitoring.traceNo}</dd></div>
            <div><dt>{dict.monitoring.traceTemplates}</dt><dd>{face.templateCount}</dd></div>
            <div><dt>{dict.monitoring.traceScore}</dt><dd>{face.bestScore ?? "—"}</dd></div>
            <div><dt>{dict.monitoring.traceThreshold}</dt><dd>{face.threshold}</dd></div>
            <div><dt>{dict.monitoring.traceReason}</dt><dd>{face.reason}{face.stable ? ` · ${dict.monitoring.traceStable}` : ` · ${dict.monitoring.traceEarly}`}</dd></div>
            <div><dt>{dict.monitoring.traceDetect}</dt><dd>{face.timing?.detectMs ?? 0} {dict.vision.ms}</dd></div>
            <div><dt>{dict.monitoring.traceAlign}</dt><dd>{face.timing?.alignMs ?? 0} {dict.vision.ms}</dd></div>
            <div><dt>{dict.monitoring.traceEmbed}</dt><dd>{face.timing?.embedMs ?? 0} {dict.vision.ms}</dd></div>
            <div><dt>{dict.monitoring.traceMatch}</dt><dd>{face.timing?.matchMs ?? 0} {dict.vision.ms}</dd></div>
            <div><dt>{dict.monitoring.traceTotal}</dt><dd>{face.timing?.totalMs ?? 0} {dict.vision.ms}</dd></div>
          </dl>
        )}
      </div>
    </section>
  );
}
