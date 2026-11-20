import { NextResponse } from "next/server";
import { readPairing } from "@/lib/pair";
import { tooManyHits } from "@/lib/rate-limit";

export const instant = false;

export async function GET(_request, { params }) {
  const { token } = await params;
  if (tooManyHits(`pair:${token}`, 120, 60_000)) return NextResponse.json({ ok: false, error: "rate" }, { status: 429 });
  const session = readPairing(token);
  if (!session) return NextResponse.json({ ok: false, error: "pair_expired" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    expiresAt: session.expiresAt,
    name: `${session.lastName} ${session.firstName}`,
  });
}
