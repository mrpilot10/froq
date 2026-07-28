"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Official Google "G" mark — fixed brand colours, so it stays out of the theme. */
function GoogleIcon() {
  return (
    <svg
      className="auth-oauth-icon"
      viewBox="0 0 18 18"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.32Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

interface GoogleAuthButtonProps {
  /** Path to return to once the session is set — preserved through the OAuth hop. */
  next: string;
  /**
   * "signup" skips the merchant-account check in the callback, because the store
   * only exists after checkout completes.
   */
  flow?: "signin" | "signup";
  label?: string;
  /** Called with a human-readable message when the redirect can't be started. */
  onError?: (message: string) => void;
  /** Runs just before leaving the page — used to keep in-progress form input. */
  onBeforeRedirect?: () => void;
  disabled?: boolean;
}

export function GoogleAuthButton({
  next,
  flow = "signin",
  label = "Continue with Google",
  onError,
  onBeforeRedirect,
  disabled = false,
}: GoogleAuthButtonProps) {
  const [loading, setLoading] = useState(false);

  const start = useCallback(async () => {
    onError?.("");
    setLoading(true);
    onBeforeRedirect?.();

    try {
      const params = new URLSearchParams({ next });
      if (flow === "signup") params.set("flow", "signup");

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?${params.toString()}`,
          queryParams: { prompt: "select_account" },
        },
      });

      if (error) {
        setLoading(false);
        onError?.("Could not open Google sign-in. Try again.");
      }
      // Success navigates away — keep the spinner up until the browser leaves.
    } catch {
      setLoading(false);
      onError?.("Could not open Google sign-in. Try again.");
    }
  }, [next, flow, onError, onBeforeRedirect]);

  return (
    <button
      type="button"
      className="auth-oauth-btn"
      onClick={start}
      disabled={disabled || loading}
      aria-busy={loading}
    >
      {loading ? (
        <>
          <span className="auth-oauth-spinner" aria-hidden="true" />
          Redirecting to Google…
        </>
      ) : (
        <>
          <GoogleIcon />
          {label}
        </>
      )}
    </button>
  );
}
