"use client";

import { FROQ_LOGO_SRC } from "@/lib/brand";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Zap,
} from "lucide-react";
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
import type { MerchantProduct } from "@/lib/merchant/types";
import { FeatureText } from "@/components/landing/feature-text";
import {
  payWithRazorpay,
  RazorpayCheckoutCancelledError,
} from "@/lib/payments/razorpay-checkout";

type Step = "account" | "payment" | "loading";

interface CheckoutExperienceProps {
  plan: PricingPlan;
}

interface CheckoutTestimonial {
  quote: string;
  name: string;
  initials: string;
  role: string;
  place: string;
}

const PRODUCT_COPY: Record<
  MerchantProduct,
  {
    label: string;
    pricingHref: string;
    outcome: string;
    socialProof: string;
    testimonials: CheckoutTestimonial[];
  }
> = {
  loyalty: {
    label: "Loyalty Stamps",
    pricingHref: "/loyalty-stamps#pricing",
    outcome: "Collect your first stamp today",
    socialProof: "Loved by cafés and shops launching loyalty",
    testimonials: [
      {
        quote:
          "We dropped plastic cards. Guests scan once and keep coming back for the free coffee — stamps just work.",
        name: "Meera Shah",
        initials: "MS",
        role: "Owner, Bloom Counter",
        place: "Ahmedabad",
      },
      {
        quote:
          "Setup took an afternoon. Now we can see who is returning without chasing spreadsheets after close.",
        name: "Dev Patel",
        initials: "DP",
        role: "Ops, Crumb & Co.",
        place: "Surat",
      },
      {
        quote:
          "The reward is simple and guests actually remember it. Repeat visits are up without running loud discounts.",
        name: "Sana Kapoor",
        initials: "SK",
        role: "Founder, Salt Studio",
        place: "Delhi",
      },
    ],
  },
  queue: {
    label: "Smart Queue",
    pricingHref: "/queue-management#pricing",
    outcome: "Open your live queue today",
    socialProof: "Built for busy doors and Friday rushes",
    testimonials: [
      {
        quote:
          "The entrance stays clear now. Guests wander, get a WhatsApp when ready, and we seat without shouting names.",
        name: "Rahul Mehra",
        initials: "RM",
        role: "Ops Lead, Oven Theory",
        place: "Pune",
      },
      {
        quote:
          "Party size on every ticket changed how we match tables. Less guesswork during the Friday rush.",
        name: "Ananya Desai",
        initials: "AD",
        role: "Owner, Coast & Crumb",
        place: "Mumbai",
      },
      {
        quote:
          "Hosts run the door from one list. Call, seat, done — paper clipboards are gone for good.",
        name: "Karthik Iyer",
        initials: "KI",
        role: "Founder, Green Bowl",
        place: "Bengaluru",
      },
    ],
  },
  reservation: {
    label: "Reservations",
    pricingHref: "/loyalty-stamps#pricing",
    outcome: "Take bookings today",
    socialProof: "Trusted by teams managing busy service",
    testimonials: [
      {
        quote:
          "Party size on every ticket changed how we match tables. Less guesswork during the Friday rush.",
        name: "Ananya Desai",
        initials: "AD",
        role: "Owner, Coast & Crumb",
        place: "Mumbai",
      },
      {
        quote:
          "Hosts run the door from one list. Call, seat, done — paper clipboards are gone for good.",
        name: "Karthik Iyer",
        initials: "KI",
        role: "Founder, Green Bowl",
        place: "Bengaluru",
      },
      {
        quote:
          "Setup took an afternoon. Now we can see who is returning without chasing spreadsheets after close.",
        name: "Dev Patel",
        initials: "DP",
        role: "Ops, Crumb & Co.",
        place: "Surat",
      },
    ],
  },
  menu: {
    label: "AI Digital Menu",
    pricingHref: "/ai-digital-menu#pricing",
    outcome: "Publish your menu today",
    socialProof: "Chosen by restaurants upgrading guest ordering",
    testimonials: [
      {
        quote:
          "Guests ask the menu in Marathi and Hindi now. Our staff spend less time explaining every dish.",
        name: "Ananya Desai",
        initials: "AD",
        role: "Owner, Coast & Crumb",
        place: "Mumbai",
      },
      {
        quote:
          "We uploaded our old printed menu and had descriptions and AI images ready the same afternoon.",
        name: "Rahul Mehra",
        initials: "RM",
        role: "Ops Lead, Oven Theory",
        place: "Pune",
      },
      {
        quote:
          "The cart suggestions show pairings we used to miss. Our average ticket improved without constantly pushing discounts.",
        name: "Karthik Iyer",
        initials: "KI",
        role: "Founder, Green Bowl",
        place: "Bengaluru",
      },
    ],
  },
};

const HIGHLIGHT_COUNT = 5;

function StarRow({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`checkout-stars${compact ? " checkout-stars--compact" : ""}`}
      aria-label="5 out of 5 stars"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={compact ? 11 : 13} strokeWidth={2.2} fill="currentColor" aria-hidden />
      ))}
    </span>
  );
}

function RazorpayBadge({ className }: { className?: string }) {
  return (
    <Image
      src="/checkout/powered-by-razorpay.png"
      alt="Payments powered by Razorpay"
      width={226}
      height={91}
      className={`checkout-razorpay-badge${className ? ` ${className}` : ""}`}
    />
  );
}

function CheckoutSteps({ step }: { step: Step }) {
  const activeIndex = step === "payment" ? 1 : step === "loading" ? 2 : 0;
  const items = [
    { id: "account", label: "Account" },
    { id: "payment", label: "Payment" },
    { id: "live", label: "Go live" },
  ] as const;

  return (
    <ol className="checkout-steps" aria-label="Checkout progress">
      {items.map((item, index) => {
        const state =
          index < activeIndex ? "is-done" : index === activeIndex ? "is-active" : "";
        return (
          <li key={item.id} className={`checkout-step ${state}`.trim()}>
            <span className="checkout-step-dot" aria-hidden="true">
              {index < activeIndex ? <Check size={12} strokeWidth={2.8} /> : index + 1}
            </span>
            <span className="checkout-step-label">{item.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function CheckoutSummary({
  plan,
  productLabel,
  outcome,
  featured,
}: {
  plan: PricingPlan;
  productLabel: string;
  outcome: string;
  featured: CheckoutTestimonial;
}) {
  const highlights = plan.features.slice(0, HIGHLIGHT_COUNT);
  const moreCount = Math.max(0, plan.features.length - highlights.length);
  const billedLabel = plan.billing === "yearly" ? "Billed yearly" : "Billed monthly";

  return (
    <aside className="panel-card checkout-summary">
      <div className="checkout-summary-top">
        <span className="checkout-summary-product">{productLabel}</span>
        {plan.highlighted ? <span className="checkout-summary-badge">Most popular</span> : null}
      </div>

      <h1 className="checkout-summary-plan">{plan.name}</h1>
      <p className="checkout-summary-desc">{plan.description}</p>

      <div className="checkout-summary-price-block">
        <div className="checkout-summary-price">
          {plan.listPriceLabel ? (
            <s className="checkout-summary-list">{plan.listPriceLabel}</s>
          ) : null}
          {plan.priceLabel}
          <span>{plan.cycle}</span>
        </div>
        {plan.monthlyEquivalentLabel ? (
          <p className="checkout-summary-equiv">
            ≈ {plan.monthlyEquivalentLabel}/month
            {plan.freeMonthsLabel ? ` · ${plan.freeMonthsLabel}` : ""}
          </p>
        ) : (
          <p className="checkout-summary-equiv">{billedLabel} · cancel anytime</p>
        )}
        {plan.saveLabel ? (
          <p className="checkout-summary-save">You save {plan.saveLabel}</p>
        ) : null}
      </div>

      <ul className="checkout-summary-features">
        {highlights.map((feature) => (
          <li key={feature}>
            <Check size={14} strokeWidth={2.5} aria-hidden />
            <FeatureText text={feature} />
          </li>
        ))}
      </ul>
      {moreCount > 0 ? (
        <p className="checkout-summary-more">+{moreCount} more included</p>
      ) : null}

      <div className="checkout-summary-next">
        <p className="checkout-summary-next-title">What happens next</p>
        <ul>
          <li>
            <Zap size={14} strokeWidth={2.4} aria-hidden />
            Pay securely in under a minute
          </li>
          <li>
            <Store size={14} strokeWidth={2.4} aria-hidden />
            Set up your shop right after checkout
          </li>
          <li>
            <Sparkles size={14} strokeWidth={2.4} aria-hidden />
            {outcome}
          </li>
        </ul>
      </div>

      <figure className="checkout-featured-quote">
        <StarRow compact />
        <blockquote>{featured.quote}</blockquote>
        <figcaption>
          <span className="checkout-quote-avatar" aria-hidden="true">
            {featured.initials}
          </span>
          <span>
            <strong>{featured.name}</strong>
            <em>
              {featured.role} · {featured.place}
            </em>
          </span>
        </figcaption>
      </figure>

      <div className="checkout-guarantee">
        <ShieldCheck size={18} strokeWidth={2.2} aria-hidden />
        <div>
          <strong>7-day guaranteed refund</strong>
          <span>First subscription · full refund if it isn&apos;t a fit · cancel anytime</span>
        </div>
      </div>
    </aside>
  );
}

function CheckoutTestimonials({
  testimonials,
  socialProof,
}: {
  testimonials: CheckoutTestimonial[];
  socialProof: string;
}) {
  return (
    <section className="checkout-testimonials" aria-label="Customer stories">
      <div className="checkout-testimonials-head">
        <div className="checkout-testimonials-proof">
          <span className="checkout-avatar-stack" aria-hidden="true">
            {testimonials.map((t) => (
              <i key={t.initials}>{t.initials}</i>
            ))}
          </span>
          <div>
            <StarRow compact />
            <p>{socialProof}</p>
          </div>
        </div>
        <h2>Restaurants switching to Froq</h2>
      </div>

      <div className="checkout-testimonial-grid">
        {testimonials.map((t) => (
          <article key={t.name} className="checkout-testimonial-card">
            <StarRow compact />
            <p className="checkout-testimonial-quote">{t.quote}</p>
            <div className="checkout-testimonial-meta">
              <span className="checkout-quote-avatar" aria-hidden="true">
                {t.initials}
              </span>
              <span>
                <strong>{t.name}</strong>
                <em>
                  {t.role} · {t.place}
                </em>
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
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
  const product = PRODUCT_COPY[plan.product];
  const billVerb = plan.billing === "yearly" ? "year" : "month";

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
          <Link href={product.pricingHref} className="checkout-back">
            <ArrowLeft size={16} strokeWidth={2.2} />
            Back to plans
          </Link>
          <div className="checkout-brand">
            <Image src={FROQ_LOGO_SRC} alt="Froq" width={48} height={48} priority />
            <span>Froq</span>
          </div>
          <div className="checkout-header-trust">
            <RazorpayBadge className="checkout-razorpay-badge--header" />
          </div>
        </header>

        <CheckoutSteps step={step} />

        <div className="checkout-layout">
          <div className="auth-card checkout-card">
            {step === "account" && (
              <>
                <div className="auth-head checkout-form-head">
                  <div className="auth-badge merchant-auth-badge" aria-hidden="true">
                    <Store size={24} strokeWidth={2} />
                  </div>
                  <h2 className="auth-title">Start your {plan.name} plan</h2>
                  <p className="auth-sub">
                    {googleEmail
                      ? `Signed in as ${googleEmail}. Confirm a few details — then pay ${plan.priceLabel}${plan.cycle}.`
                      : `Create your business account in about a minute. Then pay ${plan.priceLabel}${plan.cycle} and ${product.outcome.toLowerCase()}.`}
                  </p>
                  <div className="checkout-social-inline">
                    <StarRow compact />
                    <span>{product.socialProof}</span>
                  </div>
                </div>

                {!googleEmail && (
                  <div className="checkout-google">
                    <p className="checkout-google-label">
                      <Zap size={13} strokeWidth={2.5} aria-hidden />
                      Fastest way to continue
                    </p>
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
                      <span>or use email</span>
                    </div>
                  </div>
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
                  className="cta-btn merchant-cta-accent auth-submit checkout-submit"
                  onClick={handleCreateAccount}
                  disabled={!googleEmail && !captcha.ready}
                >
                  Continue to payment
                  <span className="checkout-submit-price">
                    {plan.priceLabel}
                    {plan.cycle}
                  </span>
                  <ArrowRight size={16} strokeWidth={2.5} aria-hidden />
                </button>

                <ul className="checkout-trust-strip" aria-label="Checkout assurances">
                  <li>
                    <ShieldCheck size={14} strokeWidth={2.3} aria-hidden />
                    7-day guaranteed refund
                  </li>
                  <li>
                    <Lock size={14} strokeWidth={2.3} aria-hidden />
                    Secure payment
                  </li>
                  <li>
                    <Zap size={14} strokeWidth={2.3} aria-hidden />
                    Live today
                  </li>
                </ul>

                <div className="checkout-razorpay-wrap">
                  <RazorpayBadge />
                </div>

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

                <div className="auth-head checkout-form-head">
                  <div className="auth-badge merchant-auth-badge" aria-hidden="true">
                    <CreditCard size={24} strokeWidth={2} />
                  </div>
                  <h2 className="auth-title">Confirm &amp; pay</h2>
                  <p className="auth-sub">
                    You&apos;re one step from launching {product.label}. Card, UPI, and netbanking
                    via Razorpay.
                  </p>
                </div>

                <div className="checkout-pay-box">
                  <div className="checkout-pay-row">
                    <span>
                      Froq {plan.name}
                      <em className="checkout-pay-product">{product.label}</em>
                    </span>
                    <strong>{plan.priceLabel}</strong>
                  </div>
                  <div className="checkout-pay-row checkout-pay-row--muted">
                    <span>{plan.billing === "yearly" ? "Billed yearly" : "Billed monthly"}</span>
                    <span>INR</span>
                  </div>
                  {plan.saveLabel ? (
                    <div className="checkout-pay-row checkout-pay-row--save">
                      <span>Yearly savings</span>
                      <span>{plan.saveLabel}</span>
                    </div>
                  ) : null}
                  <div className="checkout-pay-row checkout-pay-row--total">
                    <span>Due today</span>
                    <strong>{plan.priceLabel}</strong>
                  </div>
                </div>

                <div className="checkout-guarantee checkout-guarantee--inline">
                  <ShieldCheck size={18} strokeWidth={2.2} aria-hidden />
                  <div>
                    <strong>Risk-free for 7 days</strong>
                    <span>
                      Pay today, then try Froq live. If it isn&apos;t right, request a full
                      refund within a week of your first subscription.
                    </span>
                  </div>
                </div>

                {error && (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  className="cta-btn merchant-cta-accent auth-submit checkout-submit"
                  onClick={completeCheckout}
                >
                  Pay {plan.priceLabel} securely
                  <ArrowRight size={16} strokeWidth={2.5} aria-hidden />
                </button>

                <div className="checkout-razorpay-wrap">
                  <RazorpayBadge />
                </div>

                <p className="merchant-auth-note">
                  <Lock size={13} strokeWidth={2.2} />
                  Encrypted checkout · cancel anytime · renews each {billVerb}
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

          <CheckoutSummary
            plan={plan}
            productLabel={product.label}
            outcome={product.outcome}
            featured={product.testimonials[0]}
          />
        </div>

        <CheckoutTestimonials
          testimonials={product.testimonials}
          socialProof={product.socialProof}
        />
      </div>
    </div>
  );
}
