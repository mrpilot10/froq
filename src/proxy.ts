import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // Exact /merchant is handled by app/merchant/page.tsx (last-used + access).
  const response = await updateSession(request);
  response.headers.set("x-pathname", request.nextUrl.pathname);
  return response;
}

export const config = {
  matcher: [
    // Session refresh / revocation check only on auth-sensitive trees.
    // Public marketing, card, checkout, demo, and /auth/* are unmatched —
    // login cookies are set by exchangeCodeForSession in the callback route.
    "/merchant",
    "/merchant/:path*",
    "/admin",
    "/admin/:path*",
    "/c/:path*",
    "/join/:path*",
    "/queue/:path*",
  ],
};
