"use client";

import { useEffect, useState } from "react";

const STAGES = [
  "CAMERA_READY",
  "FRAME_RECEIVED",
  "FACE_DETECTED",
  "ALIGNMENT_OK",
  "EMBEDDING_READY",
  "MATCH_FOUND",
  "MATCH_STABLE",
  "EVENT_PUBLISHED",
  "EVENT_RECEIVED",
  "UI_RENDERED",
  "CARD_CREATED",
];

function stageOk(id, face, ui) {
  if (id === "CAMERA_READY") return ui.camera === true;
  if (id === "FRAME_RECEIVED") return ui.frame === true;
  if (id === "FACE_DETECTED") return face?.detected === true;
  if (id === "ALIGNMENT_OK") return face?.aligned === true;
  if (id === "EMBEDDING_READY") return face?.embedded === true;
  if (id === "MATCH_FOUND") return face?.reason === "MATCH_CONFIRMED";
  if (id === "MATCH_STABLE") return face?.stable === true;
  if (id === "EVENT_PUBLISHED") return face?.published === true;
  if (id === "EVENT_RECEIVED") return ui.received === true && face?.reason === "MATCH_CONFIRMED";
  if (id === "UI_RENDERED") return ui.rendered === true;
  if (id === "CARD_CREATED") return ui.card === true;
  return false;
}

export function RecognitionTrace({ dict }) {
  const [faces, setFaces] = useState([]);
  const [ui, setUi] = useState({});
  useEffect(() => {
    function onTrace(event) {
      const detail = event.detail;
      const next = Array.isArray(detail) ? detail : detail?.traces;
      setFaces(Array.isArray(next) ? next : []);
      setUi(detail?.ui || {});
    }
    window.addEventListener("smz-trace", onTrace);
    return () => window.removeEventListener("smz-trace", onTrace);
  }, []);
  const face = faces[0];
  const chain = STAGES.map((id) => ({ id, ok: stageOk(id, face, ui) }));
  const stopped = chain.find((stage) => !stage.ok);
  return (
    <section className="panel">
      <div className="panel-hd"><h2>{dict.monitoring.traceTitle}</h2></div>
      <div className="panel-bd">
        {!face ? <p className="muted">{dict.monitoring.traceWait}</p> : (
          <>
          <p className="muted">{dict.monitoring.traceChain}: {stopped ? `${stopped.id} · ${face.reason}` : chain[chain.length - 1].id}</p>
          <ol className="trace-chain">
            {chain.map((stage) => <li key={stage.id} className={stage.ok ? "trace-ok" : "trace-stop"}>{stage.id}</li>)}
          </ol>
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
          </>
        )}
      </div>
    </section>
  );
}
