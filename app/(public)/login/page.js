import { connection } from "next/server";
import { redirect } from "next/navigation";
import { login } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";
import { dictionary } from "@/lib/i18n";
import { getCurrentUser, getLocale } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { countUsers } from "@/lib/users";

export const instant = false;

export default async function LoginPage() {
  await connection();
  if (await getCurrentUser()) redirect("/");
  if (countUsers() === 0) redirect("/setup");
  const dict = dictionary(await getLocale());
  const settings = getSettings();
  return (
    <section className="card">
      <div className="mark">SMZ</div>
      <h1>{dict.auth.loginTitle}</h1>
      <p className="lead">{settings.enterpriseName}. {dict.auth.loginSubtitle}</p>
      <AuthForm dict={dict} action={login} mode="login" />
    </section>
  );
}
