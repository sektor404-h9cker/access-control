"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale, setTheme } from "@/app/actions/preferences";

export function PreferenceSwitch({ dict, locale, theme }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function chooseLocale(next) {
    if (next === locale || pending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  function chooseTheme(next) {
    if (next === theme || pending) return;
    document.documentElement.classList.toggle("dark", next === "dark");
    startTransition(async () => {
      await setTheme(next);
      router.refresh();
    });
  }

  return (
    <div className="prefs">
      <div className="seg" role="group" aria-label={dict.common.language}>
        <button type="button" aria-pressed={locale === "az"} onClick={() => chooseLocale("az")}>AZ</button>
        <button type="button" aria-pressed={locale === "ru"} onClick={() => chooseLocale("ru")}>RU</button>
      </div>
      <div className="seg" role="group" aria-label={dict.common.theme}>
        <button type="button" aria-pressed={theme === "light"} onClick={() => chooseTheme("light")}>{dict.common.light}</button>
        <button type="button" aria-pressed={theme === "dark"} onClick={() => chooseTheme("dark")}>{dict.common.dark}</button>
      </div>
    </div>
  );
}
