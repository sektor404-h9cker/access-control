"use client";

import { useEffect, useState } from "react";

export function Clock({ locale, large = false, initialIso }) {
  const [now, setNow] = useState(() => new Date(initialIso || Date.now()));

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loc = locale === "ru" ? "ru-RU" : "az-AZ";
  const time = new Intl.DateTimeFormat(loc, {
    timeZone: "Asia/Baku",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const date = new Intl.DateTimeFormat(loc, {
    timeZone: "Asia/Baku",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <div className={large ? "clock clock-lg" : "clock"}>
      <span className="clock-time" suppressHydrationWarning>{time}</span>
      <span className="clock-date" suppressHydrationWarning>{date}</span>
    </div>
  );
}
