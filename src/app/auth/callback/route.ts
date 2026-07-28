import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath, withParam } from "@/lib/auth/redirect";
import { userIsMerchantAccount } from "@/lib/merchant/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Where a merchant lands when no destination was preserved. */
const DEFAULT_NEXT = "/merchant";

/**
 * Behind a proxy the request host is the internal one, so build redirects from
 * the forwarded host when it's present (Vercel sets it on every request).
 */
function publicOrigin(request: Request, url: URL): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (!forwardedHost) return url.origin;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${forwardedHost}`;
}

/**
 * OAuth (and PKCE) callback: exchanges `?code=` for a session cookie.
 *
 * Google sends the browser to Supabase, which redirects here with a one-time
 * code. The code verifier lives in a cookie written by the browser client, so
 * the exchange happens server-side and the session cookie is set on this
 * response — no tokens ever touch client JS, and no secrets are involved.
 *
 * Email links (password recovery, magic links) deliver their tokens in the URL
 * fragment, which never reaches the server. Those arrive here without a code
 * and are handed to /auth/confirm, which can read the fragment in the browser.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(request, url);
  const next = safeRedirectPath(url.searchParams.get("next"), DEFAULT_NEXT);

  // Signing up from checkout: the merchant record doesn't exist yet, so skip the
  // merchant-account check and let checkout carry on with the new session.
  const isSignUp = url.searchParams.get("flow") === "signup";

  const failed = (reason: string) =>
    NextResponse.redirect(new URL(withParam(next, "auth_error", reason), origin));

  // Google itself refused (user dismissed the consent screen, app misconfigured…).
  if (url.searchParams.get("error")) {
    return failed(url.searchParams.get("error") === "access_denied" ? "cancelled" : "oauth");
  }

  const code = url.searchParams.get("code");
  if (!code) {
    const handoff = new URL("/auth/confirm", origin);
    url.searchParams.forEach((value, key) => handoff.searchParams.set(key, value));
    return NextResponse.redirect(handoff);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return failed("exchange");

  if (isSignUp) {
    return NextResponse.redirect(new URL(next, origin));
  }

  // Merchants and loyalty customers share one auth pool, so a Google account
  // with no store behind it must not land in the dashboard.
  const allowed = await userIsMerchantAccount(data.user.id);
  if (!allowed) {
    await supabase.auth.signOut();
    return failed("not_registered");
  }

  return NextResponse.redirect(new URL(next, origin));
}
