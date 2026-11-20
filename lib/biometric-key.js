import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export function biometricKey() {
  const file = process.env.SMZ_BIOMETRIC_KEY_PATH || path.join(process.cwd(), "data", "biometric.key");
  let bytes = null;
  try {
    bytes = fs.readFileSync(/* turbopackIgnore: true */ file);
  } catch {
    bytes = null;
  }
  if (!bytes || bytes.length !== 32) {
    bytes = randomBytes(32);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(/* turbopackIgnore: true */ file, bytes, { mode: 0o600 });
  }
  return bytes;
}
