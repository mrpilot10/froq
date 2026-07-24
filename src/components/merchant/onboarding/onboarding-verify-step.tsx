"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Mail, Phone } from "lucide-react";
import { formatPhoneDisplay } from "@/lib/auth/format";
import { OTP_LENGTH, RESEND_SECONDS } from "@/lib/auth/otp/client";
import { useResendCooldown } from "@/lib/auth/otp/use-resend-cooldown";
import { createClient } from "@/lib/supabase/client";
import { OtpInput } from "@/components/auth/otp-input";
import {
  sendMerchantEmailVerification,
  sendMerchantPhoneVerification,
  verifyMerchantEmailVerification,
  verifyMerchantPhoneVerification,
} from "@/app/merchant/actions";

interface OnboardingVerifyStepProps {
  email: string;
  phone: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  onEmailVerified: () => void;
  onPhoneVerified: () => void;
}

type Channel = "email" | "phone";

export function OnboardingVerifyStep({
  email: emailProp,
  phone: phoneProp,
  emailVerified,
  phoneVerified,
  onEmailVerified,
  onPhoneVerified,
}: OnboardingVerifyStepProps) {
  const [email, setEmail] = useState(emailProp);
  const [phone, setPhone] = useState(phoneProp);
  const [active, setActive] = useState<Channel | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const emailCooldown = useResendCooldown();
  const phoneCooldown = useResendCooldown();

  useEffect(() => {
    setEmail(emailProp);
    setPhone(phoneProp);
  }, [emailProp, phoneProp]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      if (!emailProp && user.email) setEmail(user.email);
      const metaPhone =
        typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : "";
      if (!phoneProp && (metaPhone || user.phone)) {
        setPhone(metaPhone || user.phone || "");
      }
      if (user.user_metadata?.email_verified_at) onEmailVerified();
      if (user.user_metadata?.phone_verified_at) onPhoneVerified();
    })();
    return () => {
      cancelled = true;
    };
  }, [emailProp, phoneProp, onEmailVerified, onPhoneVerified]);

  const phoneDisplay = phone.replace(/\D/g, "").slice(-10);

  const send = useCallback(
    async (channel: Channel) => {
      const cooldown = channel === "email" ? emailCooldown : phoneCooldown;
      if (!cooldown.canResend) return;

      setBusy(true);
      setError("");
      setInfo("");
      if (channel === "email") {
        const res = await sendMerchantEmailVerification();
        setBusy(false);
        if (!res.ok) {
          setError(res.message);
          setActive("email");
          if (res.retryAfter) emailCooldown.start(res.retryAfter);
          return;
        }
        setActive("email");
        setCode("");
        emailCooldown.start(res.retryAfter ?? RESEND_SECONDS);
        setInfo(res.message);
        return;
      }

      const res = await sendMerchantPhoneVerification();
      setBusy(false);
      if (!res.ok) {
        setError(res.message);
        setActive("phone");
        if (res.retryAfter) phoneCooldown.start(res.retryAfter);
        return;
      }
      setActive("phone");
      setCode("");
      phoneCooldown.start(res.retryAfter ?? RESEND_SECONDS);
      setInfo(res.message);
    },
    [emailCooldown, phoneCooldown],
  );

  const verify = useCallback(async () => {
    if (!active) return;
    if (code.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code we sent you.`);
      return;
    }
    setBusy(true);
    setError("");
    const res =
      active === "email"
        ? await verifyMerchantEmailVerification(code)
        : await verifyMerchantPhoneVerification(code);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setInfo(res.message);
    setActive(null);
    setCode("");
    if (active === "email") onEmailVerified();
    else onPhoneVerified();
  }, [active, code, onEmailVerified, onPhoneVerified]);

  return (
    <div className="onboarding-verify">
      <VerifySection
        Icon={Mail}
        label="Email"
        value={email || "—"}
        verified={emailVerified}
        disabled={busy}
        expanded={active === "email"}
        code={code}
        error={active === "email" ? error : ""}
        info={active === "email" ? info : ""}
        busy={busy}
        resendIn={emailCooldown.secondsLeft}
        onSend={() => void send("email")}
        onCodeChange={setCode}
        onVerify={() => void verify()}
        onResend={() => void send("email")}
      />
      <VerifySection
        Icon={Phone}
        label="Mobile number"
        value={phoneDisplay ? formatPhoneDisplay(phoneDisplay) : "—"}
        verified={phoneVerified}
        disabled={busy || !phoneDisplay}
        expanded={active === "phone"}
        code={code}
        error={active === "phone" ? error : ""}
        info={active === "phone" ? info : ""}
        busy={busy}
        resendIn={phoneCooldown.secondsLeft}
        onSend={() => void send("phone")}
        onCodeChange={setCode}
        onVerify={() => void verify()}
        onResend={() => void send("phone")}
      />
    </div>
  );
}

function VerifySection({
  Icon,
  label,
  value,
  verified,
  disabled,
  expanded,
  code,
  error,
  info,
  busy,
  resendIn,
  onSend,
  onCodeChange,
  onVerify,
  onResend,
}: {
  Icon: typeof Mail;
  label: string;
  value: string;
  verified: boolean;
  disabled: boolean;
  expanded: boolean;
  code: string;
  error: string;
  info: string;
  busy: boolean;
  resendIn: number;
  onSend: () => void;
  onCodeChange: (value: string) => void;
  onVerify: () => void;
  onResend: () => void;
}) {
  const coolingDown = resendIn > 0;
  const sendDisabled = disabled || coolingDown;

  return (
    <div
      className={`onboarding-verify-card${verified ? " is-verified" : ""}${
        expanded ? " is-expanded" : ""
      }`}
    >
      <div className="onboarding-verify-card-top">
        <span className="onboarding-verify-icon">
          {verified ? <Check size={18} strokeWidth={2.6} /> : <Icon size={18} strokeWidth={2.2} />}
        </span>
        <div className="onboarding-verify-copy">
          <span className="onboarding-verify-label">{label}</span>
          <span className="onboarding-verify-value">{value}</span>
        </div>
        {verified ? (
          <span className="onboarding-verify-status">Verified</span>
        ) : (
          <button
            type="button"
            className="onboarding-verify-send"
            disabled={sendDisabled}
            onClick={onSend}
          >
            {busy && expanded ? "Sending…" : coolingDown ? `Resend in ${resendIn}s` : "Send Code"}
          </button>
        )}
      </div>

      {expanded && !verified && (
        <div className="onboarding-verify-code">
          <p className="onboarding-verify-code-label">
            Enter the code sent to your {label.toLowerCase().includes("email") ? "email" : "phone"}
          </p>
          {info && <p className="merchant-field-hint">{info}</p>}
          <OtpInput value={code} length={OTP_LENGTH} onChange={onCodeChange} />
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="cta-btn merchant-cta-accent onboarding-verify-confirm"
            disabled={busy || code.length !== OTP_LENGTH}
            onClick={onVerify}
          >
            {busy ? "Verifying…" : "Verify code"}
          </button>
          <p className="auth-resend" aria-live="polite">
            {coolingDown ? (
              <>Resend code in <strong>{resendIn}s</strong></>
            ) : (
              <button type="button" className="auth-link" disabled={busy} onClick={onResend}>
                Resend code
              </button>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
