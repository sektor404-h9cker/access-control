import { connection } from "next/server";
import { PhoneEnroll } from "@/components/phone-enroll";
import { dictionary } from "@/lib/i18n";
import { readPairing } from "@/lib/pair";
import { getLocale } from "@/lib/session";

export const instant = false;

export default async function PairPage({ params }) {
  await connection();
  const { token } = await params;
  const session = readPairing(token);
  const dict = dictionary(await getLocale());
  if (!session) {
    return (
      <main className="page">
        <h1>{dict.face.phoneCamera}</h1>
        <p>{dict.face.phoneExpired}</p>
      </main>
    );
  }
  return <PhoneEnroll dict={dict} employeeId={session.employeeId} token={token} name={`${session.lastName} ${session.firstName}`} />;
}
