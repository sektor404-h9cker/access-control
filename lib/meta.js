import "server-only";
import { headers } from "next/headers";

export async function clientIp() {
  const headerStore = await headers();
  const raw = headerStore.get("x-forwarded-for") || headerStore.get("x-real-ip") || "local";
  return raw.split(",")[0].trim().slice(0, 64) || "local";
}
