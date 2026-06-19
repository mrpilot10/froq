"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Gift, Phone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { formatPhoneDisplay, isValidPhone } from "@/lib/auth/format";
import { joinMerchant } from "@/app/actions/customer";
import { createClient } from "@/lib/supabase/client";
import { OtpInput } from "@/components/auth/otp-input";

const OTP_LENGTH = 6;

type Step = "checking" | "phone" | "otp" | "details" | "joining";

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
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [step, setStep] = useState<Step>("checking");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [authedPhone, setAuthedPhone] = useState("");
  const [error, setError] = useState("");

  const e164 = authedPhone || `+91${phone}`;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setAuthedPhone(data.user.phone ? `+${data.user.phone}` : "");
        setStep("details");
      } else {
        setStep("phone");
      }
    });
  }, [supabase]);

  const sendCode = useCallback(async () => {
    if (!isValidPhone(phone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setError("");
    const prev = step;
    setStep("checking");
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: `+91${phone}` });
    if (otpError) {
      setError(otpError.message);
      setStep(prev);
      return;
    }
    setStep("otp");
  }, [phone, step, supabase]);

  const verify = useCallback(async () => {
    if (otp.length !== OTP_LENGTH) return;
    setError("");
    setStep("checking");
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone: `+91${phone}`,
      token: otp,
      type: "sms",
    });
    if (verifyError) {
      setError(verifyError.message);
      setStep("otp");
      return;
    }
    setAuthedPhone(data.user?.phone ? `+${data.user.phone}` : `+91${phone}`);
    setStep("details");
  }, [otp, phone, supabase]);

  const join = useCallback(async () => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    setError("");
    setStep("joining");
    const res = await joinMerchant(slug, name.trim(), e164);
    if (!res.ok) {
      setError(res.error ?? "Could not join. Please try again.");
      setStep("details");
      return;
    }
    toast.success(`Welcome to ${businessName}!`);
    router.replace("/");
  }, [name, slug, e164, businessName, router]);

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
                <h2 className="auth-title">Join the loyalty card</h2>
                <p className="auth-sub">
                  Collect {totalStamps} stamps to earn {rewardName.toLowerCase()}. Log in to start.
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
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button type="button" className="cta-btn auth-submit" onClick={sendCode}>
                Continue
              </button>
            </>
          )}

          {step === "otp" && (
            <>
              <button type="button" className="auth-back" onClick={() => { setStep("phone"); setOtp(""); }}>
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
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button
                type="button"
                className="cta-btn auth-submit"
                disabled={otp.length !== OTP_LENGTH}
                onClick={verify}
              >
                Verify &amp; continue
              </button>
            </>
          )}

          {(step === "details" || step === "joining") && (
            <>
              <div className="auth-head">
                <div className="auth-badge" aria-hidden="true">
                  <UserRound size={24} strokeWidth={2} color="#fff" />
                </div>
                <h2 className="auth-title">Almost there</h2>
                <p className="auth-sub">What name should {businessName} see on your card?</p>
              </div>
              <label className="auth-field">
                <span className="auth-label">Full name</span>
                <input
                  className="auth-input"
                  type="text"
                  autoComplete="name"
                  placeholder="Alex Morgan"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(""); }}
                />
              </label>
              {error && <p className="auth-error" role="alert">{error}</p>}
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

        <div className="footer">
          Powered by <b>froq.io</b>
        </div>
      </div>
    </div>
  );
}
