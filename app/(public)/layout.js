import { PreferenceSwitch } from "@/components/preference-switch";
import { dictionary } from "@/lib/i18n";
import { getLocale, getTheme } from "@/lib/session";

export const instant = false;

export default async function PublicLayout({ children }) {
  const locale = await getLocale();
  const theme = await getTheme();
  const dict = dictionary(locale);
  return (
    <div className="gate">
      <div className="gate-toolbar">
        <PreferenceSwitch dict={dict} locale={locale} theme={theme} />
      </div>
      {children}
    </div>
  );
}
