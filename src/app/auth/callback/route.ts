import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Exchanges a Supabase auth code (from email magic/reset links) for a session,
 * then redirects to the `next` path (defaults to /merchant).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next") || "/merchant";
  const next = nextRaw.startsWith("/") ? nextRaw : "/merchant";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const fail = new URL("/merchant/reset-password", url.origin);
      fail.searchParams.set("error", "invalid_link");
      return NextResponse.redirect(fail);
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
