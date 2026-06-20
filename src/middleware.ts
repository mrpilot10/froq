import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip /api — OTP routes don't need session refresh and bad Supabase config
    // in middleware would block them before the handler runs.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
