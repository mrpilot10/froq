"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Phone } from "lucide-react";
import { toast } from "sonner";
import {
  changeMerchantPassword,
  sendMerchantPhoneChangeOtp,
  updateAccountName,
  verifyAndUpdateMerchantPhone,
} from "@/app/merchant/actions";
import { formatPhoneDisplay, isValidPassword, isValidPhone } from "@/lib/auth/format";
import { OTP_LENGTH, RESEND_SECONDS } from "@/lib/auth/otp/client";
import { useResendCooldown } from "@/lib/auth/otp/use-resend-cooldown";
import { PRODUCTS } from "@/lib/merchant/nav";
import { ROLE_LABELS } from "@/lib/merchant/roles";
import type { MemberRole, MerchantProduct } from "@/lib/merchant/types";
import { createClient } from "@/lib/supabase/client";
import { OtpInput } from "@/components/auth/otp-input";
import { TurnstileField } from "@/components/turnstile/turnstile-field";
import { useTurnstile } from "@/lib/turnstile/use-turnstile";

type Panel = "idle" | "password" | "phone";
type PhoneStep = "edit" | "otp";

interface AccountSettingsPanelProps {
  email: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  role?: MemberRole;
  /** Empty = all products. */
  productIds?: MerchantProduct[];
  /** Empty = all branches. */
  branchIds?: string[];
  branchNameById?: Record<string, string>;
  onPhoneUpdated: (phone: string) => void;
  onNameUpdated?: (firstName: string, lastName: string) => void;
}

function productAccessLabel(role: MemberRole, productIds: MerchantProduct[]): string {
  if (role === "owner" || productIds.length === 0) return "All products";
  return productIds
    .map((id) => PRODUCTS.find((p) => p.id === id)?.name ?? id)
    .join(", ");
}

function branchAccessLabel(
  role: MemberRole,
  branchIds: string[],
  branchNameById: Record<string, string>,
): string {
  if (role === "owner" || branchIds.length === 0) return "All branches";
  return branchIds.map((id) => branchNameById[id] ?? "Branch").join(", ");
}

export function AccountSettingsPanel({
  email,
  phone,
  firstName: initialFirstName = "",
  lastName: initialLastName = "",
  role,
  productIds = [],
  branchIds = [],
  branchNameById = {},
  onPhoneUpdated,
  onNameUpdated,
}: AccountSettingsPanelProps) {
  const [panel, setPanel] = useState<Panel>("idle");
  const [accountEmail, setAccountEmail] = useState(email);
  const [accountPhone, setAccountPhone] = useState(phone);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [savedFirstName, setSavedFirstName] = useState(initialFirstName);
  const [savedLastName, setSavedLastName] = useState(initialLastName);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    setPanel("idle");
    setAccountPhone(phone);
    setAccountEmail(email);
    setFirstName(initialFirstName);
    setLastName(initialLastName);
    setSavedFirstName(initialFirstName);
    setSavedLastName(initialLastName);
  }, [email, phone, initialFirstName, initialLastName]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      if (user.email) setAccountEmail(user.email);
      const meta = user.user_metadata ?? {};
      const metaPhone = typeof meta.phone === "string" ? meta.phone : "";
      const resolved = metaPhone || user.phone || phone;
      if (resolved) setAccountPhone(resolved);

      const metaFirst = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
      const metaLast = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
      if (metaFirst || metaLast) {
        setFirstName(metaFirst || initialFirstName);
        setLastName(metaLast || initialLastName);
        setSavedFirstName(metaFirst || initialFirstName);
        setSavedLastName(metaLast || initialLastName);
      } else if (typeof meta.full_name === "string" && meta.full_name.trim()) {
        const parts = meta.full_name.trim().split(/\s+/);
        const first = parts[0] ?? "";
        const last = parts.slice(1).join(" ");
        setFirstName(first);
        setLastName(last);
        setSavedFirstName(first);
        setSavedLastName(last);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phone, initialFirstName, initialLastName]);

  const phoneDigits = accountPhone.replace(/\D/g, "").slice(-10);
  const phoneDisplay = phoneDigits ? formatPhoneDisplay(phoneDigits) : accountPhone || "Not set";
  const nameDirty =
    firstName.trim() !== savedFirstName.trim() || lastName.trim() !== savedLastName.trim();

  async function saveName() {
    setSavingName(true);
    try {
      const result = await updateAccountName({ firstName, lastName });
      if (!result.ok) {
        toast.error(result.error ?? "Could not update your name.");
        return;
      }
      const nextFirst = firstName.trim();
      const nextLast = lastName.trim();
      setSavedFirstName(nextFirst);
      setSavedLastName(nextLast);
      setFirstName(nextFirst);
      setLastName(nextLast);
      onNameUpdated?.(nextFirst, nextLast);
      toast.success("Name updated");
    } finally {
      setSavingName(false);
    }
  }

  return (
    <div className="merchant-account-panel">
      {panel === "idle" ? (
        <>
          <div className="wizard-field-row">
            <label className="auth-field">
              <span className="auth-label">First name</span>
              <input
                className="auth-input"
                type="text"
                autoComplete="given-name"
                maxLength={40}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="First name"
              />
            </label>
            <label className="auth-field">
              <span className="auth-label">Last name</span>
              <input
                className="auth-input"
                type="text"
                autoComplete="family-name"
                maxLength={40}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Last name"
              />
            </label>
          </div>
          {nameDirty ? (
            <button
              type="button"
              className="merchant-action-btn merchant-action-btn--reject"
              disabled={savingName}
              onClick={() => void saveName()}
            >
              {savingName ? "Saving…" : "Save name"}
            </button>
          ) : null}

          {role ? (
            <div className="merchant-account-access" aria-label="Your access">
              <ReadOnlyField label="Role" value={ROLE_LABELS[role]} />
              <ReadOnlyField
                label="Product access"
                value={productAccessLabel(role, productIds)}
              />
              <ReadOnlyField
                label="Branch access"
                value={branchAccessLabel(role, branchIds, branchNameById)}
              />
            </div>
          ) : null}
        </>
      ) : null}

      <ReadOnlyField label="Email" value={accountEmail || "Not set"} />

      {panel === "idle" ? (
        <>
          <div className="merchant-account-row">
            <ReadOnlyField label="Phone" value={phoneDisplay} />
            <button
              type="button"
              className="merchant-account-link"
              onClick={() => setPanel("phone")}
            >
              Update
            </button>
          </div>

          <button
            type="button"
            className="merchant-account-action"
            onClick={() => setPanel("password")}
          >
            <span className="merchant-account-action-icon" aria-hidden="true">
              <KeyRound size={17} strokeWidth={2.2} />
            </span>
            <span className="merchant-account-action-copy">
              <span className="merchant-account-action-title">Change password</span>
              <span className="merchant-account-action-sub">Update your sign-in password</span>
            </span>
          </button>
        </>
      ) : null}

      {panel === "password" ? (
        <ChangePasswordForm onCancel={() => setPanel("idle")} />
      ) : null}

      {panel === "phone" ? (
        <UpdatePhoneForm
          currentPhone={accountPhone}
          onCancel={() => setPanel("idle")}
          onUpdated={(next) => {
            setAccountPhone(next);
            onPhoneUpdated(next);
            setPanel("idle");
          }}
        />
      ) : null}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="auth-field">
      <span className="auth-label">{label}</span>
      <input
        className="auth-input auth-input--readonly"
        type="text"
        value={value}
        readOnly
        aria-readonly="true"
      />
    </label>
  );
}

function ChangePasswordForm({ onCancel }: { onCancel: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // The only dashboard form with a challenge: it re-checks the current password
  // through Supabase's captcha-protected password grant.
  const captcha = useTurnstile({ action: "merchant-change-password" });

  const handleSubmit = useCallback(async () => {
    setError("");
    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    if (!isValidPassword(password)) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }
    if (!captcha.ready) {
      setError(captcha.blockedMessage);
      return;
    }

    setBusy(true);
    const res = await changeMerchantPassword(
      currentPassword,
      password,
      captcha.token ?? undefined,
    );
    captcha.reset();
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not update password.");
      return;
    }
    toast.success("Password updated");
    onCancel();
  }, [currentPassword, password, confirm, onCancel, captcha]);

  return (
    <div className="merchant-account-form">
      <div className="merchant-account-form-head">
        <span className="merchant-account-form-icon" aria-hidden="true">
          <KeyRound size={18} strokeWidth={2.2} />
        </span>
        <div>
          <h4 className="merchant-account-form-title">Change password</h4>
          <p className="merchant-account-form-sub">Use at least 8 characters.</p>
        </div>
      </div>

      <label className="auth-field">
        <span className="auth-label">Current password</span>
        <div className="auth-input-with-icon">
          <input
            className="auth-input"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
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
        <span className="auth-label">New password</span>
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
      </label>

      <label className="auth-field">
        <span className="auth-label">Confirm new password</span>
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

      <TurnstileField {...captcha.fieldProps} />

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="merchant-account-form-actions">
        <button type="button" className="merchant-edit-cancel" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="cta-btn merchant-cta-accent"
          disabled={busy || !captcha.ready}
          onClick={() => void handleSubmit()}
        >
          {busy ? "Updating…" : "Update password"}
        </button>
      </div>
    </div>
  );
}

function UpdatePhoneForm({
  currentPhone,
  onCancel,
  onUpdated,
}: {
  currentPhone: string;
  onCancel: () => void;
  onUpdated: (phone: string) => void;
}) {
  const [step, setStep] = useState<PhoneStep>("edit");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const cooldown = useResendCooldown();

  const sendCode = useCallback(async () => {
    if (!cooldown.canResend && step === "otp") return;
    if (!isValidPhone(phone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    const res = await sendMerchantPhoneChangeOtp(phone);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      if (res.retryAfter) cooldown.start(res.retryAfter);
      return;
    }
    setStep("otp");
    setCode("");
    setInfo(res.message);
    cooldown.start(res.retryAfter ?? RESEND_SECONDS);
  }, [phone, cooldown, step]);

  const verify = useCallback(async () => {
    if (code.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code we sent you.`);
      return;
    }
    setBusy(true);
    setError("");
    const res = await verifyAndUpdateMerchantPhone(phone, code);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    toast.success("Mobile number updated");
    onUpdated(res.phone ?? `+91${phone.replace(/\D/g, "").slice(-10)}`);
  }, [phone, code, onUpdated]);

  return (
    <div className="merchant-account-form">
      <div className="merchant-account-form-head">
        <span className="merchant-account-form-icon" aria-hidden="true">
          <Phone size={18} strokeWidth={2.2} />
        </span>
        <div>
          <h4 className="merchant-account-form-title">Update phone</h4>
          <p className="merchant-account-form-sub">
            {step === "edit"
              ? currentPhone
                ? `Current: ${formatPhoneDisplay(currentPhone.replace(/\D/g, "").slice(-10))}`
                : "Add a mobile number for alerts and verification."
              : `Enter the code sent to ${formatPhoneDisplay(phone)}`}
          </p>
        </div>
      </div>

      {step === "edit" ? (
        <label className="auth-field">
          <span className="auth-label">New mobile number</span>
          <div className="auth-phone-row">
            <span className="auth-phone-prefix">+91</span>
            <input
              className="auth-input auth-input-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              placeholder="10-digit number"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                setError("");
              }}
            />
          </div>
        </label>
      ) : (
        <>
          {info ? <p className="merchant-field-hint">{info}</p> : null}
          <OtpInput value={code} length={OTP_LENGTH} onChange={setCode} disabled={busy} />
        </>
      )}

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="merchant-account-form-actions">
        <button
          type="button"
          className="merchant-edit-cancel"
          onClick={step === "otp" ? () => setStep("edit") : onCancel}
          disabled={busy}
        >
          {step === "otp" ? "Back" : "Cancel"}
        </button>
        {step === "edit" ? (
          <button
            type="button"
            className="cta-btn merchant-cta-accent"
            disabled={busy || phone.length !== 10}
            onClick={() => void sendCode()}
          >
            {busy ? "Sending…" : "Send code"}
          </button>
        ) : (
          <button
            type="button"
            className="cta-btn merchant-cta-accent"
            disabled={busy || code.length !== OTP_LENGTH}
            onClick={() => void verify()}
          >
            {busy ? "Verifying…" : "Verify & update"}
          </button>
        )}
      </div>

      {step === "otp" ? (
        <p className="auth-resend" aria-live="polite">
          {cooldown.secondsLeft > 0 ? (
            <>
              Resend code in <strong>{cooldown.secondsLeft}s</strong>
            </>
          ) : (
            <button type="button" className="auth-link" disabled={busy} onClick={() => void sendCode()}>
              Resend code
            </button>
          )}
        </p>
      ) : null}
    </div>
  );
}
