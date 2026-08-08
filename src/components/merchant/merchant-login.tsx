"use client";

import { FROQ_LOGO_SRC } from "@/lib/brand";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, Mail } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isValidEmail, isValidPassword } from "@/lib/auth/format";
import {
  requestMerchantPasswordReset,
  signInMerchantWithPassword,
} from "@/app/merchant/actions";
import { GoogleIdentityProvider } from "@/components/auth/google-identity-provider";
import { GoogleOneTap } from "@/components/auth/google-one-tap";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { googleAuthErrorMessage } from "@/lib/auth/google-errors";
import { TurnstileField } from "@/components/turnstile/turnstile-field";
import { useTurnstile } from "@/lib/turnstile/use-turnstile";
import { FroqFooter } from "@/components/shared/froq-footer";
import type { MerchantProduct } from "@/lib/merchant/types";

type View = "login" | "forgot" | "sent";

interface MerchantLoginProps {
  onAuthed: () => void | Promise<void>;
  /** Product the merchant is signing in to; null on product-agnostic routes. */
  product?: MerchantProduct | null;
}

/**
 * Per-product framing. Signing in happens against one Froq account either way —
 * only the wording and the "create an account" destination change, so arriving
 * from Queue Management doesn't look like a loyalty login.
 */
const PRODUCT_COPY: Record<MerchantProduct, { tag: string; signUpHref: string }> = {
  loyalty: { tag: "Loyalty Stamps dashboard", signUpHref: "/loyalty-stamps#pricing" },
  queue: { tag: "Smart Queue dashboard", signUpHref: "/checkout?plan=queue-growth" },
  reservation: {
    tag: "Reservations dashboard",
    signUpHref: "/checkout?plan=reservation-growth",
  },
  // AI Menu isn't sold yet, so sign-up points at the marketing pricing page.
  menu: { tag: "AI Menu dashboard", signUpHref: "/#pricing" },
};

/**
 * Why the merchant bounced back from /auth/callback without a session. The gate
 * mounts this after hydration, so reading the URL here is safe.
 */
function initialOAuthError(): string {
  if (typeof window === "undefined") return "";
  const reason = new URLSearchParams(window.location.search).get("auth_error");
  if (!reason) return "";
  return googleAuthErrorMessage(reason);
}

export function MerchantLogin({ onAuthed, product = null }: MerchantLoginProps) {
  const copy = product ? PRODUCT_COPY[product] : null;
  const pathname = usePathname();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(initialOAuthError);
  const [loading, setLoading] = useState(false);
  // One challenge serves both views: switching between sign-in and forgot
  // remounts the widget, which mints a token for whichever form is showing.
  const captcha = useTurnstile({ action: view === "forgot" ? "password-reset" : "merchant-sign-in" });

  // Drop the param once it has been shown, so a refresh doesn't keep a stale
  // Google failure on screen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("auth_error")) return;

    params.delete("auth_error");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, []);

  const handleSignIn = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError("");

      if (!isValidEmail(email)) {
        setError("Enter a valid email address.");
        return;
      }
      if (!isValidPassword(password)) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (!captcha.ready) {
        setError(captcha.blockedMessage);
        return;
      }

      setLoading(true);
      try {
        const res = await signInMerchantWithPassword(email, password, captcha.token ?? undefined);
        // Single-use token: replace it before any retry, successful or not.
        captcha.reset();
        if (!res.ok) {
          setError(res.error ?? "Could not sign in.");
          setLoading(false);
          return;
        }

        // Keep the signing-in UI up until the gate finishes loading the
        // workspace — clearing loading here used to flash the form again.
        await onAuthed();
      } catch {
        setError("Could not sign in.");
        setLoading(false);
      }
    },
    [email, password, onAuthed, captcha],
  );

  const handleForgot = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError("");

      if (!isValidEmail(email)) {
        setError("Enter a valid email address.");
        return;
      }
      if (!captcha.ready) {
        setError(captcha.blockedMessage);
        return;
      }

      setLoading(true);
      const res = await requestMerchantPasswordReset(email, captcha.token ?? undefined);
      captcha.reset();
      setLoading(false);

      if (!res.ok) {
        setError(res.error ?? "Could not send reset email.");
        return;
      }

      setView("sent");
    },
    [email, captcha],
  );

  // One Tap and Google's button report through the card's own progress and
  // error UI, so a Google sign-in looks like any other.
  const handleGoogleStart = useCallback(() => {
    setError("");
    setLoading(true);
  }, []);

  const handleGoogleError = useCallback((message: string) => {
    setError(message);
    setLoading(false);
  }, []);

  return (
    <div className="merchant-page merchant-theme">
      <div className="merchant-screen auth-screen">
        <header className="merchant-auth-head">
          <div className="merchant-auth-logo">
            <Image src={FROQ_LOGO_SRC} alt="Froq" width={64} height={64} priority />
          </div>
          <h1 className="merchant-auth-brand">Froq for Business</h1>
          <p className="merchant-auth-tag">{copy?.tag ?? "Merchant dashboard"}</p>
        </header>

        <div className="auth-card">
          {loading ? (
            <div className="auth-loading" aria-live="polite" aria-busy="true">
              <div className="processing-spinner" aria-hidden="true" />
              <p className="processing-title">
                {view === "forgot" ? "Sending reset link" : "Signing you in"}
              </p>
              <p className="processing-sub">Just a moment…</p>
            </div>
          ) : view === "sent" ? (
            <>
              <div className="auth-head">
                <div className="auth-badge merchant-auth-badge" aria-hidden="true">
                  <Mail size={24} strokeWidth={2} />
                </div>
                <h2 className="auth-title">Check your email</h2>
                <p className="auth-sub">
                  If an account exists for <strong>{email.trim()}</strong>, we sent a link to reset
                  your password. It may take a minute to arrive.
                </p>
              </div>
              <button
                type="button"
                className="cta-btn merchant-cta-accent auth-submit"
                onClick={() => {
                  setView("login");
                  setPassword("");
                  setError("");
                }}
              >
                Back to sign in
              </button>
            </>
          ) : view === "forgot" ? (
            <form onSubmit={handleForgot}>
              <button
                type="button"
                className="auth-back"
                onClick={() => {
                  setView("login");
                  setError("");
                }}
              >
                <ArrowLeft size={16} strokeWidth={2.2} />
                Back to sign in
              </button>

              <div className="auth-head">
                <div className="auth-badge merchant-auth-badge" aria-hidden="true">
                  <KeyRound size={24} strokeWidth={2} />
                </div>
                <h2 className="auth-title">Forgot password?</h2>
                <p className="auth-sub">
                  Enter your work email and we&apos;ll send you a link to choose a new password.
                </p>
              </div>

              <label className="auth-field">
                <span className="auth-label">Work email</span>
                <input
                  className="auth-input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@bloomcoffee.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                />
              </label>

              <TurnstileField {...captcha.fieldProps} />

              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="cta-btn merchant-cta-accent auth-submit"
                disabled={!captcha.ready}
              >
                Send reset link
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignIn}>
              <div className="auth-head">
                <div className="auth-badge merchant-auth-badge" aria-hidden="true">
                  <Mail size={24} strokeWidth={2} />
                </div>
                <h2 className="auth-title">Merchant log in</h2>
                <p className="auth-sub">
                  Continue with Google, or use the email and password you set up your Froq account
                  with.
                </p>
              </div>

              <GoogleIdentityProvider
                next={pathname || "/merchant"}
                onStart={handleGoogleStart}
                onSignedIn={onAuthed}
                onError={handleGoogleError}
              >
                <GoogleOneTap />
                <GoogleSignInButton />
              </GoogleIdentityProvider>

              <div className="auth-divider">
                <span>or</span>
              </div>

              <label className="auth-field">
                <span className="auth-label">Work email</span>
                <input
                  className="auth-input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@bloomcoffee.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                />
              </label>

              <label className="auth-field">
                <div className="auth-label-row">
                  <span className="auth-label">Password</span>
                  <button
                    type="button"
                    className="auth-link auth-forgot-link"
                    onClick={() => {
                      setView("forgot");
                      setPassword("");
                      setError("");
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="auth-input-with-icon">
                  <input
                    className="auth-input"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError("");
                    }}
                  />
                  <button
                    type="button"
                    className="auth-input-icon-btn"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                  </button>
                </div>
              </label>

              <TurnstileField {...captcha.fieldProps} />

              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="cta-btn merchant-cta-accent auth-submit"
                disabled={!captcha.ready}
              >
                Sign in
              </button>

              <p className="merchant-auth-note">
                <Lock size={13} strokeWidth={2.2} />
                New here?{" "}
                <Link href={copy?.signUpHref ?? "/loyalty-stamps#pricing"} className="auth-link">
                  Create an account
                </Link>
              </p>
            </form>
          )}
        </div>

        <FroqFooter />
      </div>
    </div>
  );
}
