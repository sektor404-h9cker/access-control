import { NextResponse } from "next/server";
import { readToken } from "./lib/token.js";

const PUBLIC_PATHS = new Set(["/login", "/setup"]);

export function proxy(request) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.next();
  const hasSession = Boolean(readToken(request.cookies.get("smz_session")?.value));
  if (!hasSession && !PUBLIC_PATHS.has(pathname) && !pathname.startsWith("/pair/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
