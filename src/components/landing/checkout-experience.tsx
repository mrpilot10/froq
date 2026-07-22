"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, CreditCard, Eye, EyeOff, Lock, Store } from "lucide-react";
import { load } from "@cashfreepayments/cashfree-js";
import { isValidEmail, isValidPassword, isValidPhone } from "@/lib/auth/format";
import { writeCheckoutAccount } from "@/lib/merchant/checkout";
import { markMerchantOnboarding, signUpMerchantWithPassword } from "@/app/merchant/actions";
import { type PricingPlan } from "@/lib/merchant/pricing";

const CASHFREE_MODE =
  process.env.NEXT_PUBLIC_CASHFREE_ENV === "production" ? "production" : "sandbox";

type Step = "account" | "payment" | "loading";

interface CheckoutExperienceProps {
  plan: PricingPlan;
}

export function CheckoutExperience({ plan }: CheckoutExperienceProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("account");
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loadingLabel, setLoadingLabel] = useState("Creating your account");

  const finishOnboarding = useCallback(async () => {
    setLoadingLabel("Setting up your account");
    setStep("loading");

    writeCheckoutAccount({
      planId: plan.id,
      businessName: businessName.trim(),
      ownerName: ownerName.trim(),
      email: email.trim(),
      phone: `+91${phone}`,
    });

    const marked = await markMerchantOnboarding();
    if (!marked.ok) {
      setError(marked.error ?? "Payment succeeded but setup failed. Please contact support.");
      setStep("payment");
      return;
    }

    router.replace("/merchant");
  }, [plan.id, businessName, ownerName, email, phone, router]);

  const completeCheckout = useCallback(async () => {
    setError("");
    setLoadingLabel("Starting secure checkout");
    setStep("loading");

    try {
      const orderRes = await fetch("/api/checkout/cashfree/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          customerName: ownerName.trim(),
          customerEmail: email.trim(),
        }),
      });
      const orderData = await orderRes.json().catch(() => null);
      if (!orderRes.ok || !orderData?.paymentSessionId) {
        throw new Error(orderData?.error ?? "Could not start the payment.");
      }

      const cashfree = await load({ mode: CASHFREE_MODE });
      const result = await cashfree.checkout({
        paymentSessionId: orderData.paymentSessionId,
        redirectTarget: "_modal",
      });

      if (result?.error) {
        setError("Payment was cancelled or failed. Please try again.");
        setStep("payment");
        return;
      }

      setLoadingLabel("Confirming payment");
      const verifyRes = await fetch("/api/checkout/cashfree/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderData.orderId }),
      });
      const verifyData = await verifyRes.json().catch(() => null);
      if (!verifyRes.ok || !verifyData?.paid) {
        setError("We couldn't confirm your payment. If you were charged, please contact support.");
        setStep("payment");
        return;
      }

      await finishOnboarding();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete the payment.");
      setStep("payment");
    }
  }, [plan.id, ownerName, email, finishOnboarding]);

  const handleCreateAccount = useCallback(async () => {
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
    if (!isValidPassword(password)) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!isValidPhone(phone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }

    setLoadingLabel("Creating your account");
    setStep("loading");
    const res = await signUpMerchantWithPassword({
      email,
      password,
      ownerName,
      phone,
    });
    if (!res.ok) {
      setError(res.error ?? "Could not create your account.");
      setStep("account");
      return;
    }
    setStep("payment");
  }, [businessName, ownerName, email, password, phone]);

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
                  <p className="auth-sub">
                    Use email and password to access your Froq business dashboard.
                  </p>
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
                      {showPassword ? (
                        <EyeOff size={18} strokeWidth={2} />
                      ) : (
                        <Eye size={18} strokeWidth={2} />
                      )}
                    </button>
                  </div>
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

                <button
                  type="button"
                  className="cta-btn merchant-cta-accent auth-submit"
                  onClick={handleCreateAccount}
                >
                  Continue
                </button>

                <p className="merchant-auth-note">
                  Already have an account?{" "}
                  <Link href="/merchant" className="auth-link">
                    Sign in
                  </Link>
                </p>
              </>
            )}

            {step === "payment" && (
              <>
                <button
                  type="button"
                  className="auth-back"
                  onClick={() => {
                    setStep("account");
                    setError("");
                  }}
                >
                  <ArrowLeft size={16} strokeWidth={2.2} />
                  Edit details
                </button>

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

                <p className="checkout-pay-demo">You&apos;ll complete payment securely via Cashfree.</p>

                {error && (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  className="cta-btn merchant-cta-accent auth-submit"
                  onClick={completeCheckout}
                >
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
