"use client";

import { useCallback, useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, Mail } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { isValidEmail, isValidPassword } from "@/lib/auth/format";
import {
  requestMerchantPasswordReset,
  signInMerchantWithPassword,
} from "@/app/merchant/actions";
import { FroqFooter } from "@/components/shared/froq-footer";

type View = "login" | "forgot" | "sent";

interface MerchantLoginProps {
  onAuthed: () => void;
}

export function MerchantLogin({ onAuthed }: MerchantLoginProps) {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

      setLoading(true);
      const res = await signInMerchantWithPassword(email, password);
      setLoading(false);

      if (!res.ok) {
        setError(res.error ?? "Could not sign in.");
        return;
      }

      onAuthed();
    },
    [email, password, onAuthed],
  );

  const handleForgot = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError("");

      if (!isValidEmail(email)) {
        setError("Enter a valid email address.");
        return;
      }

      setLoading(true);
      const res = await requestMerchantPasswordReset(email);
      setLoading(false);

      if (!res.ok) {
        setError(res.error ?? "Could not send reset email.");
        return;
      }

      setView("sent");
    },
    [email],
  );

  return (
    <div className="merchant-page merchant-theme">
      <div className="merchant-screen auth-screen">
        <header className="merchant-auth-head">
          <div className="merchant-auth-logo">
            <Image src="/froq-logo.png" alt="Froq" width={64} height={64} priority />
          </div>
          <h1 className="merchant-auth-brand">Froq for Business</h1>
          <p className="merchant-auth-tag">Merchant dashboard</p>
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

              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className="cta-btn merchant-cta-accent auth-submit">
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
                  Sign in with the email and password you used when creating your Froq account.
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

              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className="cta-btn merchant-cta-accent auth-submit">
                Sign in
              </button>

              <p className="merchant-auth-note">
                <Lock size={13} strokeWidth={2.2} />
                New here?{" "}
                <Link href="/#pricing" className="auth-link">
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
