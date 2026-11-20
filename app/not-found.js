import Link from "next/link";
import { dictionary } from "@/lib/i18n";
import { getLocale } from "@/lib/session";

export default async function NotFound() {
  const dict = dictionary(await getLocale());
  return (
    <main className="gate">
      <section className="card">
        <div className="mark">SMZ</div>
        <h1>{dict.notFound.title}</h1>
        <p className="lead">{dict.notFound.body}</p>
        <Link className="btn btn-primary" href="/">{dict.nav.dashboard}</Link>
      </section>
    </main>
  );
}
