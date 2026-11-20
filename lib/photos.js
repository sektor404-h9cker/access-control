import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 2 * 1024 * 1024;

function directory() {
  return path.join(process.cwd(), "data", "photos");
}

export function inspectPhoto(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 32 || bytes.length > MAX_BYTES) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

export async function takePhoto(file) {
  if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function" || !file.size) {
    return { ok: true, photo: null };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: "photo_size" };
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = inspectPhoto(bytes);
  if (!ext) return { ok: false, error: "photo_type" };
  return { ok: true, photo: { bytes, ext } };
}

export function savePhoto(photo) {
  const filename = `${randomUUID()}.${photo.ext}`;
  fs.mkdirSync(directory(), { recursive: true });
  fs.writeFileSync(path.join(directory(), filename), photo.bytes);
  return filename;
}

export function photoPath(filename) {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(filename || "")) return null;
  const full = path.join(directory(), filename);
  return full.startsWith(directory()) ? full : null;
}

export function removePhoto(filename) {
  const full = photoPath(filename);
  if (full) fs.rmSync(full, { force: true });
}

export function photoType(filename) {
  if (filename?.endsWith(".png")) return "image/png";
  if (filename?.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
