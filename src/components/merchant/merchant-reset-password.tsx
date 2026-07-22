"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import { isValidPassword } from "@/lib/auth/format";
import { updateMerchantPassword } from "@/app/merchant/actions";
import { createClient } from "@/lib/supabase/client";
import { FroqFooter } from "@/components/shared/froq-footer";

type Status = "checking" | "ready" | "saving" | "done" | "invalid";

export function MerchantResetPassword() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (searchParams.get("error") === "invalid_link") {
      setStatus("invalid");
      setError("This reset link is invalid or has expired.");
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setStatus("invalid");
        setError("This reset link is invalid or has expired. Request a new one from the login page.");
        return;
      }
      setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError("");

      if (!isValidPassword(password)) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords don’t match.");
        return;
      }

      setStatus("saving");
      const res = await updateMerchantPassword(password);
      if (!res.ok) {
        setError(res.error ?? "Could not update password.");
        setStatus("ready");
        return;
      }

      setStatus("done");
      window.setTimeout(() => router.replace("/merchant"), 900);
    },
    [password, confirm, router],
  );

  return (
    <div className="merchant-page merchant-theme">
      <div className="merchant-screen auth-screen">
        <header className="merchant-auth-head">
          <div className="merchant-auth-logo">
            <Image src="/froq-logo.png" alt="Froq" width={64} height={64} priority />
          </div>
          <h1 className="merchant-auth-brand">Froq for Business</h1>
          <p className="merchant-auth-tag">Reset password</p>
        </header>

        <div className="auth-card">
          {status === "checking" || status === "saving" || status === "done" ? (
            <div className="auth-loading" aria-live="polite" aria-busy="true">
              <div className="processing-spinner" aria-hidden="true" />
              <p className="processing-title">
                {status === "checking"
                  ? "Checking reset link"
                  : status === "saving"
                    ? "Saving new password"
                    : "Password updated"}
              </p>
              <p className="processing-sub">
                {status === "done" ? "Taking you to your dashboard…" : "Just a moment…"}
              </p>
            </div>
          ) : status === "invalid" ? (
            <>
              <div className="auth-head">
                <div className="auth-badge merchant-auth-badge" aria-hidden="true">
                  <KeyRound size={24} strokeWidth={2} />
                </div>
                <h2 className="auth-title">Link expired</h2>
                <p className="auth-sub">{error}</p>
              </div>
              <Link href="/merchant" className="cta-btn merchant-cta-accent auth-submit">
                Back to sign in
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="auth-head">
                <div className="auth-badge merchant-auth-badge" aria-hidden="true">
                  <Lock size={24} strokeWidth={2} />
                </div>
                <h2 className="auth-title">Choose a new password</h2>
                <p className="auth-sub">Use at least 8 characters. You’ll be signed in after this.</p>
              </div>

              <label className="auth-field">
                <span className="auth-label">New password</span>
                <div className="auth-input-with-icon">
                  <input
                    className="auth-input"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
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

              <label className="auth-field">
                <span className="auth-label">Confirm password</span>
                <input
                  className="auth-input"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    setError("");
                  }}
                />
              </label>

              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className="cta-btn merchant-cta-accent auth-submit">
                Update password
              </button>
            </form>
          )}
        </div>

        <FroqFooter />
      </div>
    </div>
  );
}
