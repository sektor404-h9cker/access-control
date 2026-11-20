import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const PARAMS = { N: 16384, r: 8, p: 1 };

export function passwordProblems(password) {
  const value = String(password ?? "");
  if (value.length < 10 || value.length > 128) return "weak_password";
  if (!/\p{L}/u.test(value) || !/\d/.test(value)) return "weak_password";
  return null;
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  return `scrypt$${salt}$${Buffer.from(derived).toString("base64url")}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = Buffer.from(await scrypt(password, salt, KEY_LENGTH, PARAMS));
  const actual = Buffer.from(hash, "base64url");
  if (actual.length !== derived.length) return false;
  return timingSafeEqual(actual, derived);
}
