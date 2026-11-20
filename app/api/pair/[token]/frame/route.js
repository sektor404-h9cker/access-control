import { NextResponse } from "next/server";
import { readPairFrame, storePairFrame } from "@/lib/pair";
import { tooManyHits } from "@/lib/rate-limit";

export const instant = false;

export async function GET(_request, { params }) {
  const { token } = await params;
  const bytes = readPairFrame(token);
  if (!bytes) return new NextResponse(null, { status: 204 });
  return new NextResponse(bytes, {
    headers: { "content-type": "image/jpeg", "cache-control": "no-store" },
  });
}

export async function POST(request, { params }) {
  const { token } = await params;
  if (tooManyHits(`pair-frame:${token}`, 120, 60_000)) return NextResponse.json({ ok: false }, { status: 429 });
  const type = request.headers.get("content-type") || "";
  if (!type.includes("image/jpeg")) return NextResponse.json({ ok: false, error: "photo_type" }, { status: 415 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length < 32 || bytes.length > 180_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return NextResponse.json({ ok: false, error: "photo_type" }, { status: 415 });
  }
  if (!storePairFrame(token, bytes)) return NextResponse.json({ ok: false, error: "pair_expired" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
