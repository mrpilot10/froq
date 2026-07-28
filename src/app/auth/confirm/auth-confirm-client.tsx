"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/auth/redirect";

/**
 * Completes Supabase email links (password reset, magic link).
 *
 * Recovery links redirect here with tokens in the URL hash (#access_token=…).
 * The hash never reaches the server, so this must run in the browser.
 * PKCE links may use ?code= instead — handled here too.
 *
 * Google sign-in does not come through here: OAuth codes are exchanged
 * server-side in /auth/callback.
 */
export function AuthConfirmClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const next = safeRedirectPath(searchParams.get("next"), "/merchant");
      const fail = `/merchant/reset-password?error=invalid_link`;

      const supabase = createClient();

      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        router.replace(error ? fail : next);
        return;
      }

      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "recovery" | "email" | "signup" | "invite" | "magiclink" | "email_change",
        });
        if (cancelled) return;
        router.replace(error ? fail : next);
        return;
      }

      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (cancelled) return;
          router.replace(error ? fail : next);
          return;
        }
      }

      if (cancelled) return;
      setMessage("This link is invalid or has expired.");
      router.replace(fail);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="merchant-page merchant-theme">
      <div className="merchant-screen auth-screen">
        <div className="auth-card">
          <div className="auth-loading" aria-live="polite" aria-busy="true">
            <div className="processing-spinner" aria-hidden="true" />
            <p className="processing-title">{message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
