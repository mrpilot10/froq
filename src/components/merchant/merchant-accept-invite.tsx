"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { isValidPassword, isValidPhone } from "@/lib/auth/format";
import { completeTeamInvite, getTeamInvite } from "@/app/merchant/actions";
import { FroqFooter } from "@/components/shared/froq-footer";

type Status = "loading" | "ready" | "saving" | "done" | "invalid";

export function MerchantAcceptInvite() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [branchLabel, setBranchLabel] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token) {
        setStatus("invalid");
        setError("This invite link is invalid.");
        return;
      }
      const invite = await getTeamInvite(token);
      if (cancelled) return;
      if (invite.status !== "ok") {
        setStatus("invalid");
        setError(invite.error);
        return;
      }
      setEmail(invite.email);
      setBusinessName(invite.businessName);
      setBranchLabel(invite.branchLabel);
      if (invite.name) {
        const parts = invite.name.trim().split(/\s+/);
        setFirstName(parts[0] ?? "");
        setLastName(parts.slice(1).join(" "));
      }
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!firstName.trim()) {
      setError("Enter your first name.");
      return;
    }
    if (!lastName.trim()) {
      setError("Enter your last name.");
      return;
    }
    if (!isValidPhone(phone)) {
      setError("Enter a valid 10-digit phone number.");
      return;
    }
    if (!isValidPassword(password)) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }

    setStatus("saving");
    const res = await completeTeamInvite({
      token,
      firstName,
      lastName,
      phone,
      password,
    });
    if (!res.ok) {
      setError(res.error ?? "Could not complete your invite.");
      setStatus("ready");
      return;
    }
    setStatus("done");
    window.setTimeout(() => router.replace("/merchant"), 900);
  };

  return (
    <div className="merchant-page merchant-theme">
      <div className="merchant-screen auth-screen">
        <header className="merchant-auth-head">
          <div className="merchant-auth-logo">
            <Image src="/froq-logo.png" alt="Froq" width={64} height={64} priority />
          </div>
          <h1 className="merchant-auth-brand">Froq for Business</h1>
          <p className="merchant-auth-tag">Team invite</p>
        </header>

        <div className="auth-card">
          {status === "loading" || status === "saving" || status === "done" ? (
            <div className="auth-loading" aria-live="polite" aria-busy="true">
              <div className="processing-spinner" aria-hidden="true" />
              <p className="processing-title">
                {status === "loading"
                  ? "Loading invite"
                  : status === "saving"
                    ? "Creating your account"
                    : "You're in"}
              </p>
              <p className="processing-sub">
                {status === "done" ? "Taking you to the dashboard…" : "Just a moment…"}
              </p>
            </div>
          ) : status === "invalid" ? (
            <>
              <div className="auth-head">
                <div className="auth-badge merchant-auth-badge" aria-hidden="true">
                  <UserPlus size={24} strokeWidth={2} />
                </div>
                <h2 className="auth-title">Invite unavailable</h2>
                <p className="auth-sub">{error}</p>
              </div>
              <Link href="/merchant" className="cta-btn merchant-cta-accent auth-submit">
                Back to sign in
              </Link>
            </>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)}>
              <div className="auth-head">
                <div className="auth-badge merchant-auth-badge" aria-hidden="true">
                  <UserPlus size={24} strokeWidth={2} />
                </div>
                <h2 className="auth-title">Join the team</h2>
                <p className="auth-sub">
                  You are invited to manage <strong>{branchLabel}</strong> of{" "}
                  <strong>{businessName}</strong>.
                </p>
              </div>

              <div className="wizard-field-row">
                <label className="auth-field">
                  <span className="auth-label">First name</span>
                  <input
                    className="auth-input"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      setError("");
                    }}
                  />
                </label>
                <label className="auth-field">
                  <span className="auth-label">Last name</span>
                  <input
                    className="auth-input"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      setError("");
                    }}
                  />
                </label>
              </div>

              <label className="auth-field">
                <span className="auth-label">Phone number</span>
                <input
                  className="auth-input"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="10-digit mobile"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                    setError("");
                  }}
                />
              </label>

              <label className="auth-field">
                <span className="auth-label">Email</span>
                <input
                  className="auth-input auth-input--readonly"
                  type="email"
                  value={email}
                  readOnly
                  aria-readonly="true"
                />
              </label>

              <label className="auth-field">
                <span className="auth-label">Password</span>
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
                Create account
              </button>
            </form>
          )}
        </div>

        <FroqFooter />
      </div>
    </div>
  );
}
