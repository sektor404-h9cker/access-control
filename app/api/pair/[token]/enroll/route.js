import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { completeEnrollment } from "@/lib/enrollment";
import { endPairing, readPairing } from "@/lib/pair";
import { takePhoto } from "@/lib/photos";
import { tooManyHits } from "@/lib/rate-limit";
import { findUserById } from "@/lib/users";

export const instant = false;

async function samplesFrom(formData) {
  const count = Number(formData.get("sample_count") || 0);
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const file = await takePhoto(formData.get(`sample_${index}`));
    if (!file.ok || !file.photo) return null;
    let points;
    try {
      points = JSON.parse(String(formData.get(`points_${index}`) || ""));
    } catch {
      return null;
    }
    samples.push({ bytes: file.photo.bytes, points });
  }
  return samples;
}

export async function POST(request, { params }) {
  const { token } = await params;
  if (tooManyHits(`pair-enroll:${token}`, 8, 10 * 60_000)) {
    return NextResponse.json({ ok: false, error: "rate" }, { status: 429 });
  }
  const session = readPairing(token);
  if (!session) return NextResponse.json({ ok: false, error: "pair_expired" }, { status: 404 });
  const formData = await request.formData();
  if (String(formData.get("employee_id") || "") !== session.employeeId) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const photo = await takePhoto(formData.get("photo"));
  if (!photo.ok || !photo.photo) return NextResponse.json({ ok: false, error: photo.error || "photo_type" }, { status: 400 });
  const mode = String(formData.get("mode") || "");
  const samples = mode === "scan" ? await samplesFrom(formData) : [];
  if (mode === "scan" && !samples) return NextResponse.json({ ok: false, error: "samples_required" }, { status: 400 });
  const actor = session.createdBy ? findUserById(session.createdBy) : null;
  const result = await completeEnrollment({
    employeeId: session.employeeId,
    clientToken: String(formData.get("client_token") || ""),
    mode,
    poses: String(formData.get("poses") || "").split(",").filter(Boolean),
    qualityNote: formData.get("quality_note"),
    photo: photo.photo,
    samples,
    confirmReplace: formData.get("confirm_replace") === "1",
  }, { actor: actor ? { id: actor.id, username: actor.username } : { username: "phone" }, ip: "pair" });
  if (result.ok) {
    endPairing(token);
    revalidatePath("/", "layout");
  }
  return NextResponse.json({ ok: Boolean(result.ok), error: result.error || "" });
}
