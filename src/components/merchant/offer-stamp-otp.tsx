"use client";

import { useEffect, useRef, useState } from "react";
import { Stamp } from "lucide-react";
import { OtpInput } from "@/components/auth/otp-input";
import { OTP_LENGTH, RESEND_SECONDS } from "@/lib/auth/otp/client";
import { useResendCooldown } from "@/lib/auth/otp/use-resend-cooldown";

export type RequestOfferStampOtpResult = {
  ok: boolean;
  error?: string;
  message?: string;
  channel?: "whatsapp" | "sms";
  retryAfter?: number;
};

interface OfferStampOtpProps {
  customerId: string;
  customerName: string;
  busy?: boolean;
  /** When true (default), sending the code starts as soon as this mounts. */
  autoSend?: boolean;
  onRequestCode: () => Promise<RequestOfferStampOtpResult>;
  onConfirm: (code: string) => Promise<{ ok: boolean; error?: string }>;
  onCancel?: () => void;
}

type Phase = "sending" | "code" | "failed";

/** Survives React Strict Mode remounts so autoSend only hits the provider once. */
const autoSentCustomerIds = new Set<string>();

/**
 * Offer-stamp OTP: one click upstream sends the code; this UI collects it.
 */
export function OfferStampOtp({
  customerId,
  customerName,
  busy = false,
  autoSend = true,
  onRequestCode,
  onConfirm,
  onCancel,
}: OfferStampOtpProps) {
  const alreadyAutoSent = autoSend && autoSentCustomerIds.has(customerId);
  const [phase, setPhase] = useState<Phase>(
    alreadyAutoSent ? "code" : autoSend ? "sending" : "failed",
  );
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(
    alreadyAutoSent ? "Code sent to the customer." : "",
  );
  const resend = useResendCooldown();
  const onRequestCodeRef = useRef(onRequestCode);
  onRequestCodeRef.current = onRequestCode;
  const sendingLockRef = useRef(false);

  async function sendCode(isResend = false) {
    if (sendingLockRef.current || busy || (isResend && !resend.canResend)) return;
    sendingLockRef.current = true;
    setSending(true);
    setError("");
    if (!isResend) setPhase("sending");
    try {
      const result = await onRequestCodeRef.current();

      if (!result.ok) {
        // Concurrent duplicate (Strict Mode / double-tap): first send already went out.
        if (!isResend && result.retryAfter) {
          autoSentCustomerIds.add(customerId);
          setPhase("code");
          setInfo("Code sent to the customer.");
          resend.start(result.retryAfter);
          return;
        }
        setError(result.error ?? "Could not send code.");
        setPhase("failed");
        if (result.retryAfter) resend.start(result.retryAfter);
        return;
      }

      autoSentCustomerIds.add(customerId);
      setInfo(result.message ?? "Code sent to the customer.");
      setPhase("code");
      setCode("");
      resend.start(result.retryAfter ?? RESEND_SECONDS);
    } finally {
      sendingLockRef.current = false;
      setSending(false);
    }
  }

  useEffect(() => {
    setCode("");
    setError("");
    setConfirming(false);

    if (!autoSend) {
      setInfo("");
      setPhase("failed");
      return;
    }

    if (autoSentCustomerIds.has(customerId)) {
      setPhase("code");
      setInfo("Code sent to the customer.");
      resend.start(RESEND_SECONDS);
      return;
    }

    setInfo("");
    setPhase("sending");
    void sendCode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, autoSend]);

  async function confirm() {
    if (confirming || busy || code.length !== OTP_LENGTH) return;
    setConfirming(true);
    setError("");
    const result = await onConfirm(code);
    setConfirming(false);
    if (!result.ok) {
      setError(result.error ?? "Could not add the stamp. Try again.");
      setCode("");
      return;
    }
    autoSentCustomerIds.delete(customerId);
  }

  if (phase === "sending") {
    return (
      <div className="merchant-stamp-otp">
        <p className="merchant-stamp-otp-copy">
          Sending a code to <strong>{customerName}</strong>…
        </p>
        <button
          type="button"
          className="merchant-action-btn merchant-action-btn--approve merchant-action-btn--block"
          disabled
        >
          <Stamp size={16} strokeWidth={2.3} />
          Sending…
        </button>
        {onCancel ? (
          <button
            type="button"
            className="merchant-action-btn merchant-action-btn--reject merchant-action-btn--block"
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null}
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="merchant-stamp-otp">
        <p className="merchant-stamp-otp-copy">
          We’ll send a code to <strong>{customerName}</strong>. Ask them for it to add a stamp.
        </p>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className="merchant-action-btn merchant-action-btn--approve merchant-action-btn--block"
          disabled={sending || busy}
          onClick={() => void sendCode(false)}
        >
          <Stamp size={16} strokeWidth={2.3} />
          {sending ? "Sending…" : "Offer stamp"}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="merchant-action-btn merchant-action-btn--reject merchant-action-btn--block"
            disabled={sending || busy}
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="merchant-stamp-otp">
      <p className="merchant-stamp-otp-copy">
        {info || `Enter the ${OTP_LENGTH}-digit code from ${customerName}.`}
      </p>
      <OtpInput value={code} length={OTP_LENGTH} onChange={setCode} disabled={confirming || busy} />
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="merchant-action-btn merchant-action-btn--approve merchant-action-btn--block"
        disabled={code.length !== OTP_LENGTH || confirming || busy}
        onClick={() => void confirm()}
      >
        {confirming ? "Adding…" : "Add stamp"}
      </button>
      <div className="merchant-stamp-otp-actions merchant-stamp-otp-actions--row">
        {onCancel ? (
          <button
            type="button"
            className="merchant-action-btn merchant-action-btn--reject"
            disabled={sending || confirming || busy}
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          className="merchant-link-btn merchant-stamp-otp-resend"
          disabled={!resend.canResend || sending || confirming || busy}
          onClick={() => void sendCode(true)}
        >
          {resend.canResend
            ? sending
              ? "Resending…"
              : "Resend code"
            : `Resend in ${resend.secondsLeft}s`}
        </button>
      </div>
    </div>
  );
}
