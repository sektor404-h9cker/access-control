"use client";

import { dictionary } from "@/lib/i18n";

export default function ErrorPage({ reset }) {
  const locale = typeof document !== "undefined" && document.documentElement.lang === "ru" ? "ru" : "az";
  const dict = dictionary(locale);
  return (
    <div className="empty">
      <p className="empty-title">{dict.errors.generic}</p>
      <button className="btn btn-primary" type="button" onClick={() => reset()}>{dict.common.retry}</button>
    </div>
  );
}
