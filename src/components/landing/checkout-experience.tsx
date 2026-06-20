"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, CreditCard, Lock, Phone, Store } from "lucide-react";
import { formatPhoneDisplay, isValidEmail, isValidPhone } from "@/lib/auth/format";
import { OTP_LENGTH, RESEND_SECONDS, sendOtp, verifyOtp } from "@/lib/auth/otp/client";
import { OtpInput } from "@/components/auth/otp-input";
import { writeCheckoutAccount } from "@/lib/merchant/checkout";
import { getPlanById, type PricingPlan } from "@/lib/merchant/pricing";
import {
  writeMerchantAuth,
  writePaymentDone,
  writeSetupDone,
} from "@/lib/merchant/auth";

type Step = "account" | "otp" | "payment" | "loading";

interface CheckoutExperienceProps {
  plan: PricingPlan;
}

export function CheckoutExperience({ plan }: CheckoutExperienceProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("account");
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [loadingLabel, setLoadingLabel] = useState("Sending your code");

  const completeCheckout = useCallback(async () => {
    setLoadingLabel("Processing payment");
    setStep("loading");
    // Demo payment placeholder — a real gateway call goes here later.
    await new Promise((resolve) => setTimeout(resolve, 1400));

    writeCheckoutAccount({
      planId: plan.id,
      businessName: businessName.trim(),
      ownerName: ownerName.trim(),
      email: email.trim(),
      phone: `+91${phone}`,
    });
    writeMerchantAuth(true);
    writePaymentDone(true);
    writeSetupDone(false);
    router.replace("/merchant");
  }, [plan.id, businessName, ownerName, email, phone, router]);

  const handleSendCode = useCallback(async () => {
    setError("");
    if (!businessName.trim()) {
      setError("Enter your business name.");
      return;
    }
    if (!ownerName.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!isValidPhone(phone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setLoadingLabel("Sending your code");
    setStep("loading");
    const res = await sendOtp(phone);
    if (!res.ok) {
      setError(res.message);
      setStep("account");
      return;
    }
    setResendIn(RESEND_SECONDS);
    setStep("otp");
  }, [businessName, ownerName, email, phone]);

  const handleVerify = useCallback(async () => {
    if (otp.length !== OTP_LENGTH) {
      setError("Enter the 6-digit code we sent you.");
      return;
    }
    setError("");
    setLoadingLabel("Verifying code");
    setStep("loading");
    const res = await verifyOtp(phone, otp);
    if (!res.ok) {
      setError(res.message);
      setStep("otp");
      return;
    }
    setStep("payment");
  }, [otp, phone]);

  useEffect(() => {
    if (step !== "otp" || resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, resendIn]);

  return (
    <div className="checkout-page merchant-theme">
      <div className="checkout-screen">
        <header className="checkout-header">
          <Link href="/#pricing" className="checkout-back">
            <ArrowLeft size={16} strokeWidth={2.2} />
            Back to plans
          </Link>
          <div className="checkout-brand">
            <Image src="/froq-logo.png" alt="Froq" width={32} height={32} />
            <span>Froq</span>
          </div>
        </header>

        <div className="checkout-layout">
          <aside className="panel-card checkout-summary">
            <span className="checkout-summary-label">Your plan</span>
            <h1 className="checkout-summary-plan">{plan.name}</h1>
            <div className="checkout-summary-price">
              {plan.priceLabel}
              <span>{plan.cycle}</span>
            </div>
            <ul className="checkout-summary-features">
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Check size={14} strokeWidth={2.5} aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>
            <p className="checkout-summary-note">
              Account created during checkout. Store setup starts right after payment.
            </p>
          </aside>

          <div className="auth-card checkout-card">
            {step === "account" && (
              <>
                <div className="auth-head">
                  <div className="auth-badge merchant-auth-badge" aria-hidden="true">
                    <Store size={24} strokeWidth={2} />
                  </div>
                  <h2 className="auth-title">Create your account</h2>
                  <p className="auth-sub">We&apos;ll use this to set up your Froq business dashboard.</p>
                </div>

                <label className="auth-field">
                  <span className="auth-label">Business name</span>
                  <input
                    className="auth-input"
                    type="text"
                    placeholder="Bloom Coffee Co."
                    value={businessName}
                    onChange={(e) => {
                      setBusinessName(e.target.value);
                      setError("");
                    }}
                  />
                </label>

                <label className="auth-field">
                  <span className="auth-label">Your name</span>
                  <input
                    className="auth-input"
                    type="text"
                    autoComplete="name"
                    placeholder="Alex Morgan"
                    value={ownerName}
                    onChange={(e) => {
                      setOwnerName(e.target.value);
                      setError("");
                    }}
                  />
                </label>

                <label className="auth-field">
                  <span className="auth-label">Work email</span>
                  <input
                    className="auth-input"
                    type="email"
                    autoComplete="email"
                    placeholder="you@bloomcoffee.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                  />
                </label>

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

                <button type="button" className="cta-btn merchant-cta-accent auth-submit" onClick={handleSendCode}>
                  Continue
                </button>
              </>
            )}

            {step === "otp" && (
              <>
                <button
                  type="button"
                  className="auth-back"
                  onClick={() => {
                    setStep("account");
                    setOtp("");
                    setError("");
                  }}
                >
                  <ArrowLeft size={16} strokeWidth={2.2} />
                  Edit details
                </button>

                <div className="auth-head">
                  <div className="auth-badge merchant-auth-badge" aria-hidden="true">
                    <Phone size={24} strokeWidth={2} />
                  </div>
                  <h2 className="auth-title">Verify your number</h2>
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
                  onClick={handleVerify}
                >
                  Verify &amp; continue
                </button>

                <p className="auth-resend">
                  {resendIn > 0 ? (
                    <>Resend code in {resendIn}s</>
                  ) : (
                    <button type="button" className="auth-link" onClick={handleSendCode}>
                      Resend code
                    </button>
                  )}
                </p>
              </>
            )}

            {step === "payment" && (
              <>
                <div className="auth-head">
                  <div className="auth-badge merchant-auth-badge" aria-hidden="true">
                    <CreditCard size={24} strokeWidth={2} />
                  </div>
                  <h2 className="auth-title">Complete payment</h2>
                  <p className="auth-sub">
                    You&apos;re subscribing to Froq {plan.name} at {plan.priceLabel}
                    {plan.cycle}.
                  </p>
                </div>

                <div className="checkout-pay-box">
                  <div className="checkout-pay-row">
                    <span>Froq {plan.name}</span>
                    <strong>{plan.priceLabel}</strong>
                  </div>
                  <div className="checkout-pay-row checkout-pay-row--muted">
                    <span>Billed monthly</span>
                    <span>INR</span>
                  </div>
                </div>

                <p className="checkout-pay-demo">
                  Demo checkout — payment gateway will be connected later.
                </p>

                {error && (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                )}

                <button type="button" className="cta-btn merchant-cta-accent auth-submit" onClick={completeCheckout}>
                  Pay {plan.priceLabel}
                </button>

                <p className="merchant-auth-note">
                  <Lock size={13} strokeWidth={2.2} />
                  Secure checkout · Cancel anytime
                </p>
              </>
            )}

            {step === "loading" && (
              <div className="auth-loading" aria-live="polite" aria-busy="true">
                <div className="processing-spinner" aria-hidden="true" />
                <p className="processing-title">{loadingLabel}</p>
                <p className="processing-sub">Just a moment…</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
