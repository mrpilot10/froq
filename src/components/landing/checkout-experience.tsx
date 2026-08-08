"use client";

import { FROQ_LOGO_SRC } from "@/lib/brand";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, CreditCard, Eye, EyeOff, Lock, Store } from "lucide-react";
import { isValidEmail, isValidPassword, isValidPhone } from "@/lib/auth/format";
import { INDIA_CITIES, stateForCity } from "@/lib/geo/india-cities";
import { readCheckoutDraft, writeCheckoutAccount, writeCheckoutDraft } from "@/lib/merchant/checkout";
import {
  getGoogleCheckoutIdentity,
  markMerchantOnboarding,
  signUpMerchantWithGoogle,
  signUpMerchantWithPassword,
} from "@/app/merchant/actions";
import { GoogleIdentityProvider } from "@/components/auth/google-identity-provider";
import { GoogleOneTap } from "@/components/auth/google-one-tap";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { TurnstileField } from "@/components/turnstile/turnstile-field";
import { useTurnstile } from "@/lib/turnstile/use-turnstile";
import { type PricingPlan } from "@/lib/merchant/pricing";
import { FeatureText } from "@/components/landing/feature-text";
import {
  payWithRazorpay,
  RazorpayCheckoutCancelledError,
} from "@/lib/payments/razorpay-checkout";

type Step = "account" | "payment" | "loading";

interface CheckoutExperienceProps {
  plan: PricingPlan;
}

export function CheckoutExperience({ plan }: CheckoutExperienceProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("account");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [error, setError] = useState("");
  const [loadingLabel, setLoadingLabel] = useState("Creating your account");
  /** Set once we come back from Google — the account is already created. */
  const [googleEmail, setGoogleEmail] = useState("");
  const captcha = useTurnstile({ action: "merchant-sign-up" });

  const ownerName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  const checkoutPath = `/checkout?plan=${encodeURIComponent(plan.id)}`;

  /**
   * Switches the form over to a Google-verified account: the email comes from
   * the session and the password field goes away.
   *
   * `restoreDraft` only applies to the redirect flow, which leaves the page and
   * loses the form state. One Tap and Google's button sign in without
   * navigating, so whatever is already typed stays.
   */
  const adoptGoogleIdentity = useCallback(async (restoreDraft: boolean) => {
    const identity = await getGoogleCheckoutIdentity();
    if (!identity) return;

    const draft = restoreDraft ? readCheckoutDraft() : null;
    setGoogleEmail(identity.email);
    setEmail(identity.email);
    setFirstName((prev) => prev || draft?.firstName || identity.firstName);
    setLastName((prev) => prev || draft?.lastName || identity.lastName);
    if (draft) {
      setPhone((prev) => prev || draft.phone);
      setCity((prev) => prev || draft.city);
      setState((prev) => prev || draft.state);
    }
  }, []);

  // Returning from the Google redirect hop: adopt the verified account and
  // restore what the merchant had already filled in before leaving the page.
  useEffect(() => {
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const authError = params.get("auth_error");
      if (authError) {
        setError(
          authError === "cancelled"
            ? "Google sign-up was cancelled."
            : "Could not complete Google sign-up. Try again.",
        );
        params.delete("auth_error");
        const query = params.toString();
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${query ? `?${query}` : ""}`,
        );
      }

      await adoptGoogleIdentity(true);
    })();
  }, [adoptGoogleIdentity]);

  const saveDraft = useCallback(() => {
    writeCheckoutDraft({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone,
      city,
      state,
    });
  }, [firstName, lastName, phone, city, state]);

  // One Tap and Google's button sign in on this page, so they reuse the
  // checkout's own progress step instead of a separate spinner.
  const handleGoogleStart = useCallback(() => {
    setError("");
    setLoadingLabel("Signing you in");
    setStep("loading");
  }, []);

  const handleGoogleSignedIn = useCallback(async () => {
    await adoptGoogleIdentity(false);
    setStep("account");
  }, [adoptGoogleIdentity]);

  const handleGoogleError = useCallback((message: string) => {
    setError(message);
    setStep("account");
  }, []);

  const finishOnboarding = useCallback(async () => {
    setLoadingLabel("Setting up your account");
    setStep("loading");

    writeCheckoutAccount({
      planId: plan.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      ownerName,
      email: email.trim(),
      phone: `+91${phone}`,
      city,
      state,
    });

    const marked = await markMerchantOnboarding(plan.product);
    if (!marked.ok) {
      setError(marked.error ?? "Payment succeeded but setup failed. Please contact support.");
      setStep("payment");
      return;
    }

    router.replace("/merchant");
  }, [plan.id, plan.product, firstName, lastName, ownerName, email, phone, city, state, router]);

  const completeCheckout = useCallback(async () => {
    setError("");
    setLoadingLabel("Starting secure checkout");
    setStep("loading");

    try {
      await payWithRazorpay({
        planId: plan.id,
        customerName: ownerName,
        customerEmail: email.trim(),
        customerPhone: phone,
      });

      setLoadingLabel("Confirming payment");
      await finishOnboarding();
    } catch (err) {
      if (err instanceof RazorpayCheckoutCancelledError) {
        setError("Payment was cancelled. You can try again when ready.");
      } else {
        setError(err instanceof Error ? err.message : "Could not complete the payment.");
      }
      setStep("payment");
    }
  }, [plan.id, ownerName, email, phone, finishOnboarding]);

  const handleCreateAccount = useCallback(async () => {
    setError("");
    if (!firstName.trim()) {
      setError("Enter your first name.");
      return;
    }
    if (!lastName.trim()) {
      setError("Enter your last name.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!googleEmail && !isValidPassword(password)) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!isValidPhone(phone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (!city || !state) {
      setError("Select your city.");
      return;
    }
    // Google sign-ups already cleared Google's own bot checks and hold a verified
    // session, so the challenge only guards the email/password path.
    if (!googleEmail && !captcha.ready) {
      setError(captcha.blockedMessage);
      return;
    }

    setLoadingLabel("Creating your account");
    setStep("loading");
    // Google already created the auth user and the session — only the details
    // its profile can't provide are saved here.
    const res = googleEmail
      ? await signUpMerchantWithGoogle({ firstName, lastName, phone, city, state })
      : await signUpMerchantWithPassword({
          email,
          password,
          firstName,
          lastName,
          phone,
          city,
          state,
          captchaToken: captcha.token ?? undefined,
        });
    if (!googleEmail) captcha.reset();
    if (!res.ok) {
      setError(res.error ?? "Could not create your account.");
      setStep("account");
      return;
    }
    setStep("payment");
  }, [
    firstName,
    lastName,
    email,
    password,
    phone,
    city,
    state,
    googleEmail,
    captcha,
  ]);

  return (
    <div className="checkout-page merchant-theme">
      <div className="checkout-screen">
        <header className="checkout-header">
          <Link href="/loyalty-stamps#pricing" className="checkout-back">
            <ArrowLeft size={16} strokeWidth={2.2} />
            Back to plans
          </Link>
          <div className="checkout-brand">
            <Image src={FROQ_LOGO_SRC} alt="Froq" width={32} height={32} />
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
                  <FeatureText text={feature} />
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
                    {googleEmail
                      ? `Signed in as ${googleEmail}. Confirm your details to continue.`
                      : "Continue with Google, or use email and password to access your Froq business dashboard."}
                  </p>
                </div>

                {!googleEmail && (
                  <>
                    <GoogleIdentityProvider
                      next={checkoutPath}
                      flow="signup"
                      onStart={handleGoogleStart}
                      onSignedIn={handleGoogleSignedIn}
                      onError={handleGoogleError}
                      onBeforeRedirect={saveDraft}
                    >
                      <GoogleOneTap />
                      <GoogleSignInButton text="signup_with" fallbackLabel="Sign up with Google" />
                    </GoogleIdentityProvider>
                    <div className="auth-divider">
                      <span>or</span>
                    </div>
                  </>
                )}

                <div className="checkout-field-row">
                  <label className="auth-field">
                    <span className="auth-label">First name</span>
                    <input
                      className="auth-input"
                      type="text"
                      autoComplete="given-name"
                      placeholder="Alex"
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
                      type="text"
                      autoComplete="family-name"
                      placeholder="Morgan"
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        setError("");
                      }}
                    />
                  </label>
                </div>

                <label className="auth-field">
                  <span className="auth-label">Work email</span>
                  <input
                    className={`auth-input${googleEmail ? " auth-input--readonly" : ""}`}
                    type="email"
                    autoComplete="email"
                    placeholder="you@bloomcoffee.com"
                    value={email}
                    readOnly={Boolean(googleEmail)}
                    tabIndex={googleEmail ? -1 : undefined}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                  />
                </label>

                {!googleEmail && (
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
                )}

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

                <div className="checkout-field-row">
                  <label className="auth-field">
                    <span className="auth-label">City</span>
                    <select
                      className="auth-input auth-select"
                      value={city}
                      onChange={(e) => {
                        const nextCity = e.target.value;
                        setCity(nextCity);
                        setState(stateForCity(nextCity));
                        setError("");
                      }}
                    >
                      <option value="">Select city</option>
                      {INDIA_CITIES.map((entry) => (
                        <option key={entry.city} value={entry.city}>
                          {entry.city}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="auth-field">
                    <span className="auth-label">State</span>
                    <input
                      className="auth-input auth-input--readonly"
                      type="text"
                      value={state}
                      readOnly
                      tabIndex={-1}
                      placeholder="Auto-filled"
                      aria-live="polite"
                    />
                  </label>
                </div>

                {!googleEmail && <TurnstileField {...captcha.fieldProps} />}

                {error && (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  className="cta-btn merchant-cta-accent auth-submit"
                  onClick={handleCreateAccount}
                  disabled={!googleEmail && !captcha.ready}
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

                <p className="checkout-pay-demo">You&apos;ll complete payment securely via Razorpay.</p>

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
                  Secure checkout · 7-day money-back on first subscription
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
