"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function CameraLog({ cameraId, dict }) {
  const [lines, setLines] = useState([]);
  useEffect(() => {
    if (!cameraId) return undefined;
    let stop = false;
    let previous = "";
    async function load() {
      try {
        const response = await fetch(`/api/gate/vision/${cameraId}`, { cache: "no-store" });
        const body = response.ok ? await response.json() : null;
        const face = body?.vision?.faces?.find((item) => item?.name) || body?.vision?.faces?.[0];
        const name = face?.name || (face?.outcome === "unknown" ? dict.monitoring.unknown : "");
        if (stop || !name || name === previous) return;
        previous = name;
        const stamp = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setLines((current) => {
          if (current[0]?.text === name) return current;
          return [{ id: crypto.randomUUID(), stamp, text: name }, ...current].slice(0, 6);
        });
      } catch {
        /* журнал не должен останавливать видео */
      }
    }
    load();
    const timer = window.setInterval(load, 2000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [cameraId, dict]);
  return (
    <div className="stack">
      {lines.length ? (
        <ul className="camera-log-list">
          {lines.map((line, index) => (
            <li key={`${line.id}-${index}`}><span>{line.stamp}</span>{line.text}</li>
          ))}
        </ul>
      ) : <p className="muted">{dict.monitoring.faceMissing}</p>}
      <Link href="/attendance">{dict.monitoring.journalAll}</Link>
    </div>
  );
}
