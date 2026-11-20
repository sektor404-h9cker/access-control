"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LivePulse() {
  const router = useRouter();
  useEffect(() => {
    let cursor = "";
    let stopped = false;
    async function tick() {
      if (stopped || document.hidden) return;
      try {
        const response = await fetch("/api/recognition/latest", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (body.cursor && cursor && body.cursor !== cursor) router.refresh();
        if (body.cursor) cursor = body.cursor;
      } catch {
        // The next tick tries again. A missed poll does not invent an event.
      }
    }
    const timer = window.setInterval(tick, 8000);
    tick();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [router]);
  return null;
}
