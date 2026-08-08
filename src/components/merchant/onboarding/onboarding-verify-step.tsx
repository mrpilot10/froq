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
  const [contactFor, setContactFor] = useState({ email: emailProp, phone: phoneProp });
  const [active, setActive] = useState<Channel | null>(null);
  const [codes, setCodes] = useState<Record<Channel, string>>({ email: "", phone: "" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busyChannel, setBusyChannel] = useState<Channel | null>(null);
  const emailCooldown = useResendCooldown();
  const phoneCooldown = useResendCooldown();

  // Keep local contact values in sync when checkout props arrive without an effect.
  if (contactFor.email !== emailProp || contactFor.phone !== phoneProp) {
    setContactFor({ email: emailProp, phone: phoneProp });
    setEmail(emailProp);
    setPhone(phoneProp);
  }

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
      if (!cooldown.canResend || busyChannel) return;

      // Switch channel first so the OTP panel can't stay on the other one,
      // and clear any leftover code/error from a previous attempt.
      setActive(channel);
      setCodes((prev) => ({ ...prev, [channel]: "" }));
      setError("");
      setInfo("");
      setBusyChannel(channel);

      const res =
        channel === "email"
          ? await sendMerchantEmailVerification()
          : await sendMerchantPhoneVerification();

      setBusyChannel(null);

      if (!res.ok) {
        setError(res.message);
        if (res.retryAfter) cooldown.start(res.retryAfter);
        return;
      }

      cooldown.start(res.retryAfter ?? RESEND_SECONDS);
      setInfo(res.message);
    },
    [busyChannel, emailCooldown, phoneCooldown],
  );

  const verify = useCallback(
    async (channel: Channel) => {
      const code = codes[channel];
      if (code.length !== OTP_LENGTH) {
        setError(`Enter the ${OTP_LENGTH}-digit code we sent you.`);
        setActive(channel);
        return;
      }
      if (busyChannel) return;

      setBusyChannel(channel);
      setError("");
      setActive(channel);

      const res =
        channel === "email"
          ? await verifyMerchantEmailVerification(code)
          : await verifyMerchantPhoneVerification(code);

      setBusyChannel(null);

      if (!res.ok) {
        setError(res.message);
        return;
      }

      setInfo(res.message);
      setActive(null);
      setCodes((prev) => ({ ...prev, [channel]: "" }));
      if (channel === "email") onEmailVerified();
      else onPhoneVerified();
    },
    [busyChannel, codes, onEmailVerified, onPhoneVerified],
  );

  return (
    <div className="onboarding-verify">
      <VerifySection
        channel="email"
        Icon={Mail}
        label="Email"
        value={email || "—"}
        verified={emailVerified}
        expanded={active === "email"}
        code={codes.email}
        error={active === "email" ? error : ""}
        info={active === "email" ? info : ""}
        busy={busyChannel === "email"}
        locked={busyChannel !== null && busyChannel !== "email"}
        resendIn={emailCooldown.secondsLeft}
        onSend={() => void send("email")}
        onCodeChange={(value) => setCodes((prev) => ({ ...prev, email: value }))}
        onVerify={() => void verify("email")}
        onResend={() => void send("email")}
      />
      <VerifySection
        channel="phone"
        Icon={Phone}
        label="Mobile number"
        value={phoneDisplay ? formatPhoneDisplay(phoneDisplay) : "—"}
        verified={phoneVerified}
        expanded={active === "phone"}
        code={codes.phone}
        error={active === "phone" ? error : ""}
        info={active === "phone" ? info : ""}
        busy={busyChannel === "phone"}
        locked={(busyChannel !== null && busyChannel !== "phone") || !phoneDisplay}
        resendIn={phoneCooldown.secondsLeft}
        onSend={() => void send("phone")}
        onCodeChange={(value) => setCodes((prev) => ({ ...prev, phone: value }))}
        onVerify={() => void verify("phone")}
        onResend={() => void send("phone")}
      />
    </div>
  );
}

function VerifySection({
  channel,
  Icon,
  label,
  value,
  verified,
  expanded,
  code,
  error,
  info,
  busy,
  locked,
  resendIn,
  onSend,
  onCodeChange,
  onVerify,
  onResend,
}: {
  channel: Channel;
  Icon: typeof Mail;
  label: string;
  value: string;
  verified: boolean;
  expanded: boolean;
  code: string;
  error: string;
  info: string;
  busy: boolean;
  locked: boolean;
  resendIn: number;
  onSend: () => void;
  onCodeChange: (value: string) => void;
  onVerify: () => void;
  onResend: () => void;
}) {
  const coolingDown = resendIn > 0;
  const sendDisabled = locked || busy || coolingDown;
  const destination = channel === "email" ? "email" : "phone";

  return (
    <section
      className={`onboarding-verify-card${verified ? " is-verified" : ""}${
        expanded ? " is-expanded" : ""
      }`}
      aria-label={`${label} verification`}
    >
      <div className="onboarding-verify-card-top">
        <span className="onboarding-verify-icon" aria-hidden>
          {verified ? <Check size={18} strokeWidth={2.6} /> : <Icon size={18} strokeWidth={2.2} />}
        </span>
        <div className="onboarding-verify-copy">
          <span className="onboarding-verify-label">{label}</span>
          <span className="onboarding-verify-value">{value}</span>
        </div>
        {verified ? <span className="onboarding-verify-status">Verified</span> : null}
      </div>

      {!verified && !expanded ? (
        <button
          type="button"
          className="onboarding-verify-send"
          disabled={sendDisabled}
          aria-label={`Send ${destination} verification code`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSend();
          }}
        >
          {busy ? "Sending…" : coolingDown ? `Resend in ${resendIn}s` : "Send code"}
        </button>
      ) : null}

      {expanded && !verified ? (
        <div className="onboarding-verify-code">
          <p className="onboarding-verify-code-label">Enter the code we sent</p>
          {info ? <p className="merchant-field-hint">{info}</p> : null}
          <OtpInput
            key={channel}
            value={code}
            length={OTP_LENGTH}
            disabled={busy}
            onChange={onCodeChange}
          />
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="cta-btn merchant-cta-accent onboarding-verify-confirm"
            disabled={busy || code.length !== OTP_LENGTH}
            aria-label={`Verify ${destination} code`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onVerify();
            }}
          >
            {busy ? "Verifying…" : "Verify code"}
          </button>
          <p className="auth-resend" aria-live="polite">
            {coolingDown ? (
              <>
                Resend code in <strong>{resendIn}s</strong>
              </>
            ) : (
              <button
                type="button"
                className="auth-link"
                disabled={busy || locked}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onResend();
                }}
              >
                Resend code
              </button>
            )}
          </p>
        </div>
      ) : null}
    </section>
  );
}
