import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { roleTitle } from "@/lib/access";
import { requireUser } from "@/lib/guard";
import { dictionary } from "@/lib/i18n";
import { getLocale, getTheme } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { bakuStamp } from "@/lib/time";

export const instant = false;

export default async function AppLayout({ children }) {
  await connection();
  const user = await requireUser();
  const locale = await getLocale();
  const theme = await getTheme();
  const settings = getSettings();
  return (
    <AppShell
      dict={dictionary(locale)}
      locale={locale}
      theme={theme}
      user={{ ...user, roleLabel: roleTitle(user.role, locale) }}
      enterprise={settings.enterpriseName}
      demo={settings.dataMode === "demo"}
      initialIso={bakuStamp().iso}
    >
      {children}
    </AppShell>
  );
}
