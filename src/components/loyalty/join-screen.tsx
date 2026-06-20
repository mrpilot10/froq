"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Gift, Mail, Phone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { formatPhoneDisplay, isValidEmail, isValidPhone } from "@/lib/auth/format";
import { OTP_LENGTH, RESEND_SECONDS, sendOtp, verifyOtp } from "@/lib/auth/otp/client";
import { checkShopMembership, joinMerchant } from "@/app/actions/customer";
import { useBrandTheme } from "@/lib/loyalty/use-brand-theme";
import { OtpInput } from "@/components/auth/otp-input";
import { FroqFooter } from "@/components/shared/froq-footer";

type Step = "checking" | "phone" | "otp" | "signup" | "joining";

interface JoinScreenProps {
  slug: string;
  businessName: string;
  rewardTitle: string;
  rewardName: string;
  totalStamps: number;
  brandColor: string;
  logoUrl: string | null;
}

export function JoinScreen({
  slug,
  businessName,
  rewardTitle,
  rewardName,
  totalStamps,
  brandColor,
  logoUrl,
}: JoinScreenProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("checking");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [authedPhone, setAuthedPhone] = useState("");
  const [error, setError] = useState("");
  const [isReturningMember, setIsReturningMember] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);

  const e164 = authedPhone || `+91${phone}`;

  useBrandTheme(brandColor);

  useEffect(() => {
    let active = true;

    async function init() {
      const membership = await checkShopMembership(slug);

      if (!active) return;

      if (membership.isMember && membership.isAuthenticated) {
        router.replace(`/card/${slug}`);
        return;
      }

      setIsReturningMember(membership.isMember);

      // Already signed in on this device: the auth identity is the phone number,
      // so reuse the session to join this shop directly — no OTP, no SMS charge.
      if (membership.isAuthenticated && membership.phone) {
        setAuthedPhone(`+${membership.phone}`);
        setPhone(membership.phone.slice(-10));
        if (membership.name) setName(membership.name);
        if (membership.email) setEmail(membership.email);
        setStep("signup");
        return;
      }

      setStep("phone");
    }

    void init();
    return () => {
      active = false;
    };
  }, [slug, router]);

  const sendCode = useCallback(async () => {
    if (!isValidPhone(phone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setError("");
    setStep("checking");
    const res = await sendOtp(phone);
    if (!res.ok) {
      setError(res.message);
      setStep("phone");
      return;
    }
    setResendIn(RESEND_SECONDS);
    setStep("otp");
  }, [phone]);

  const verify = useCallback(async () => {
    if (otp.length !== OTP_LENGTH) {
      setError("Enter the 6-digit code we sent you.");
      return;
    }
    setError("");
    setStep("checking");
    const res = await verifyOtp(phone, otp);
    if (!res.ok) {
      setError(res.message);
      setStep("otp");
      return;
    }

    setAuthedPhone(`+91${phone}`);

    const membership = await checkShopMembership(slug);
    if (membership.isMember) {
      router.replace(`/card/${slug}`);
      return;
    }

    setStep("signup");
  }, [otp, phone, slug, router]);

  useEffect(() => {
    if (step !== "otp" || resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, resendIn]);

  const join = useCallback(async () => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setStep("joining");
    const res = await joinMerchant(slug, name.trim(), e164, email.trim());
    if (!res.ok) {
      setError(res.error ?? "Could not join. Please try again.");
      setStep("signup");
      return;
    }
    toast.success(`Welcome to ${businessName}!`);
    router.replace(`/card/${slug}`);
  }, [name, email, slug, e164, businessName, router]);

  return (
    <div className="loyalty-page">
      <div className="loyalty-screen auth-screen">
        <header className="merchant-auth-head">
          <div className="merchant-auth-logo" style={{ background: brandColor }}>
            {logoUrl ? (
              <Image src={logoUrl} alt={businessName} width={56} height={56} unoptimized />
            ) : (
              <Gift size={26} strokeWidth={2} color="#fff" />
            )}
          </div>
          <h1 className="merchant-auth-brand">{businessName}</h1>
          <p className="merchant-auth-tag">{rewardTitle}</p>
        </header>

        <div className="auth-card">
          {step === "checking" && (
            <div className="auth-loading" aria-busy="true">
              <div className="processing-spinner" aria-hidden="true" />
              <p className="processing-title">Just a moment…</p>
            </div>
          )}

          {step === "phone" && (
            <>
              <div className="auth-head">
                <div className="auth-badge" aria-hidden="true">
                  <Phone size={24} strokeWidth={2} color="#fff" />
                </div>
                <h2 className="auth-title">
                  {isReturningMember ? "Welcome back" : "Join the loyalty card"}
                </h2>
                <p className="auth-sub">
                  {isReturningMember
                    ? `Log in with your mobile number to open your ${businessName} card.`
                    : `Collect ${totalStamps} stamps to earn ${rewardName.toLowerCase()}. Verify your number to join ${businessName}.`}
                </p>
              </div>
              <label className="auth-field">
                <span className="auth-label">Mobile number</span>
                <div className="auth-phone-row">
                  <span className="auth-phone-prefix">+91</span>
                  <input
                    className="auth-input auth-input-phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                      setError("");
                    }}
                  />
                </div>
              </label>
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button type="button" className="cta-btn auth-submit" onClick={sendCode}>
                Continue
              </button>
              <p className="merchant-auth-note">
                Each shop has its own loyalty card. Scan this store&apos;s QR to log in here.
              </p>
            </>
          )}

          {step === "otp" && (
            <>
              <button
                type="button"
                className="auth-back"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                }}
              >
                <ArrowLeft size={16} strokeWidth={2.2} />
                Change number
              </button>
              <div className="auth-head">
                <div className="auth-badge" aria-hidden="true">
                  <Phone size={24} strokeWidth={2} color="#fff" />
                </div>
                <h2 className="auth-title">Enter verification code</h2>
                <p className="auth-sub">
                  We sent a 6-digit code to <strong>{formatPhoneDisplay(phone)}</strong>
                </p>
              </div>
              <OtpInput value={otp} length={OTP_LENGTH} onChange={setOtp} />
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="cta-btn auth-submit"
                disabled={otp.length !== OTP_LENGTH}
                onClick={verify}
              >
                Verify &amp; continue
              </button>
              <p className="auth-resend">
                {resendIn > 0 ? (
                  <>Resend code in {resendIn}s</>
                ) : (
                  <button type="button" className="auth-link" onClick={sendCode}>
                    Resend code
                  </button>
                )}
              </p>
            </>
          )}

          {(step === "signup" || step === "joining") && (
            <>
              <div className="auth-head">
                <div className="auth-badge" aria-hidden="true">
                  <UserRound size={24} strokeWidth={2} color="#fff" />
                </div>
                <h2 className="auth-title">Sign up</h2>
                <p className="auth-sub">
                  Create your {businessName} loyalty account to start collecting stamps.
                </p>
              </div>
              <label className="auth-field">
                <span className="auth-label">Full name</span>
                <input
                  className="auth-input"
                  type="text"
                  autoComplete="name"
                  placeholder="Alex Morgan"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError("");
                  }}
                />
              </label>
              <label className="auth-field">
                <span className="auth-label">Email</span>
                <div className="auth-input-with-icon">
                  <Mail size={18} strokeWidth={2} aria-hidden="true" />
                  <input
                    className="auth-input"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                  />
                </div>
              </label>
              <label className="auth-field">
                <span className="auth-label">Mobile number</span>
                <div className="auth-phone-row auth-phone-row--readonly">
                  <span className="auth-phone-prefix">+91</span>
                  <input
                    className="auth-input auth-input-phone"
                    type="tel"
                    value={phone}
                    readOnly
                    aria-readonly="true"
                  />
                </div>
                <span className="merchant-field-hint">
                  Verified as {formatPhoneDisplay(phone)}
                </span>
              </label>
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="cta-btn auth-submit"
                disabled={step === "joining"}
                onClick={join}
              >
                {step === "joining" ? "Joining…" : "Join loyalty card"}
              </button>
            </>
          )}
        </div>

        <FroqFooter />
      </div>
    </div>
  );
}
