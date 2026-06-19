"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Lock, Phone } from "lucide-react";
import Image from "next/image";
import { formatPhoneDisplay, isValidPhone } from "@/lib/auth/format";
import { OtpInput } from "@/components/auth/otp-input";
import { createClient } from "@/lib/supabase/client";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

type Step = "phone" | "otp" | "loading";

interface MerchantLoginProps {
  onAuthed: () => void;
}

export function MerchantLogin({ onAuthed }: MerchantLoginProps) {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);

  const e164 = `+91${phone}`;

  const handlePhoneChange = (value: string) => {
    setPhone(value.replace(/\D/g, "").slice(0, 10));
    setError("");
  };

  const sendCode = useCallback(async () => {
    if (!isValidPhone(phone)) {
      setError("Enter your registered 10-digit mobile number.");
      return;
    }
    setError("");
    setStep("loading");
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: e164 });
    if (otpError) {
      setError(otpError.message);
      setStep("phone");
      return;
    }
    setResendIn(RESEND_SECONDS);
    setStep("otp");
  }, [phone, e164, supabase]);

  const verify = useCallback(async () => {
    if (otp.length !== OTP_LENGTH) {
      setError("Enter the 6-digit code we sent you.");
      return;
    }
    setError("");
    setStep("loading");
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: e164,
      token: otp,
      type: "sms",
    });
    if (verifyError) {
      setError(verifyError.message);
      setStep("otp");
      return;
    }
    onAuthed();
  }, [otp, e164, supabase, onAuthed]);

  useEffect(() => {
    if (step !== "otp" || resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, resendIn]);

  const isVerifying = step === "loading" && otp.length === OTP_LENGTH;

  return (
    <div className="merchant-page merchant-theme">
      <div className="merchant-screen auth-screen">
        <header className="merchant-auth-head">
          <div className="merchant-auth-logo">
            <Image src="/froq-logo.png" alt="Froq" width={56} height={56} priority />
          </div>
          <h1 className="merchant-auth-brand">Froq for Business</h1>
          <p className="merchant-auth-tag">Merchant dashboard</p>
        </header>

        <div className="auth-card">
          {step === "phone" && (
            <>
              <div className="auth-head">
                <div className="auth-badge merchant-auth-badge" aria-hidden="true">
                  <Phone size={24} strokeWidth={2} />
                </div>
                <h2 className="auth-title">Merchant log in</h2>
                <p className="auth-sub">
                  Enter your registered mobile number to access your store dashboard.
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
                    autoComplete="tel-national"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(event) => handlePhoneChange(event.target.value)}
                  />
                </div>
              </label>

              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="button"
                className="cta-btn merchant-cta-accent auth-submit"
                onClick={sendCode}
              >
                Continue
              </button>

              <p className="merchant-auth-note">
                <Lock size={13} strokeWidth={2.2} />
                New stores are onboarded by the Froq team.
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
                  setError("");
                }}
              >
                <ArrowLeft size={16} strokeWidth={2.2} />
                Change number
              </button>

              <div className="auth-head">
                <div className="auth-badge merchant-auth-badge" aria-hidden="true">
                  <Phone size={24} strokeWidth={2} />
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
                className="cta-btn merchant-cta-accent auth-submit"
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

          {step === "loading" && (
            <div className="auth-loading" aria-live="polite" aria-busy="true">
              <div className="processing-spinner" aria-hidden="true" />
              <p className="processing-title">{isVerifying ? "Verifying code" : "Sending your code"}</p>
              <p className="processing-sub">{isVerifying ? "Almost there…" : "Just a moment…"}</p>
            </div>
          )}
        </div>

        <div className="footer">
          Powered by <b>froq.io</b>
        </div>
      </div>
    </div>
  );
}
