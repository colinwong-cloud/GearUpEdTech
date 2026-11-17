import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Exact-case only — Next.js config redirects treat ia/IA as the same path. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/guides/ia" || pathname === "/guides/ia/") {
    const url = request.nextUrl.clone();
    url.pathname = "/guides/IA";
    return NextResponse.redirect(url, 301);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/guides/ia", "/guides/ia/"],
};