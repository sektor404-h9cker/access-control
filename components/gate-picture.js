"use client";

import { useEffect, useRef, useState } from "react";
import { formatMessage } from "@/lib/text";

export function GatePicture({ cameraId, dict }) {
  const image = useRef(null);
  const [meta, setMeta] = useState(null);
  const [miss, setMiss] = useState(0);

  useEffect(() => {
    let stop = false;
    let url = "";
    async function tick() {
      try {
        const response = await fetch(`/api/gate/live/${cameraId}`, { cache: "no-store" });
        if (stop) return;
        if (response.status === 204) {
          setMiss((count) => count + 1);
          return;
        }
        if (!response.ok) return;
        const blob = await response.blob();
        const next = URL.createObjectURL(blob);
        if (image.current) image.current.src = next;
        if (url) URL.revokeObjectURL(url);
        url = next;
        setMiss(0);
        setMeta({
          age: Number(response.headers.get("x-frame-age") || 0),
          fps: Number(response.headers.get("x-fps") || 0),
          width: Number(response.headers.get("x-width") || 0),
          height: Number(response.headers.get("x-height") || 0),
          ai: response.headers.get("x-ai") || "unavailable",
        });
      } catch {
        if (!stop) setMiss((count) => count + 1);
      }
    }
    tick();
    const timer = window.setInterval(tick, 250);
    return () => {
      stop = true;
      window.clearInterval(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [cameraId]);

  return (
    <>
      <div className="stage">
        {/* The frame is an authenticated live JPEG, not a static asset. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={image} className="gate-video" alt={dict.gate.remote} />
        {miss > 4 ? <div className="stage-note"><strong>{dict.gate.noFrames}</strong></div> : null}
      </div>
      <p className="muted">
        {dict.gate.remote}
        {meta ? ` · ${dict.gate.resolution} ${meta.width}×${meta.height} · ${dict.gate.fps} ${meta.fps} · ${dict.gate.delay} ${formatMessage(dict.gate.age, { ms: meta.age })} · ${dict.gate.ai} ${meta.ai === "ready" ? dict.gate.aiOn : dict.gate.aiOff}` : ""}
      </p>
    </>
  );
}
