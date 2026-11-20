import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function secret() {
  const value = process.env.SESSION_SECRET || "";
  if (value.length < 32) {
    throw new Error("SESSION_SECRET is missing. Start the application with npm run dev.");
  }
  return value;
}

function sign(body) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createToken(user) {
  const body = Buffer.from(
    JSON.stringify({
      sub: user.id,
      sv: user.session_version,
      exp: Date.now() + MAX_AGE_MS,
    }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readToken(token) {
  if (!token || !token.includes(".")) return null;
  const index = token.lastIndexOf(".");
  const body = token.slice(0, index);
  const signature = token.slice(index + 1);
  const expected = sign(body);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.sub || !Number.isInteger(payload.sv) || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE_MS / 1000;
