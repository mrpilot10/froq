import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // Exact /merchant is redirect-only. Handle it here so client soft-nav
  // (e.g. marketing "Log in") does not land on Next's not-found UI from
  // a page that only throws NEXT_REDIRECT.
  if (request.nextUrl.pathname === "/merchant") {
    const url = request.nextUrl.clone();
    url.pathname = "/merchant/loyalty";
    return NextResponse.redirect(url);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    // Session refresh / revocation check only on auth-sensitive trees.
    // Public marketing, card, checkout, demo, and /auth/* are unmatched —
    // login cookies are set by exchangeCodeForSession in the callback route.
    "/merchant",
    "/merchant/:path*",
    "/c/:path*",
    "/join/:path*",
    "/queue/:path*",
  ],
};
