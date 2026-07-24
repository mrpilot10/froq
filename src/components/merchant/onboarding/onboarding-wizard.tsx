"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  Clock3,
  Gift,
  ImagePlus,
  Link2,
  Palette,
  PartyPopper,
  QrCode,
  ShieldCheck,
  Sparkles,
  Store,
  Timer,
  TrendingUp,
  Trash2,
  Zap,
} from "lucide-react";
import { BRAND_COLORS, FIELD_LIMITS } from "@/lib/merchant/constants";
import { fileToLogoDataUrl } from "@/lib/merchant/image";
import {
  CALL_OPTIONS,
  COOLDOWN_VALUE_OPTIONS,
  STAMP_OPTIONS,
  WAIT_OPTIONS,
  buildOnboardingSteps,
  canAdvanceStep,
  emptyOnboardingDraft,
  type OnboardingDraft,
  type OnboardingMode,
  type OnboardingStep,
} from "@/lib/merchant/onboarding";
import {
  setAcceptWindowMinutes,
  setInitialEstimatedWaitMinutes,
} from "@/lib/merchant/queue-settings";
import {
  completeProductOnboarding,
  createMerchant,
  updateMerchantProfile,
} from "@/app/merchant/actions";
import type { CheckoutAccount } from "@/lib/merchant/checkout";
import type { MerchantProduct } from "@/lib/merchant/types";
import { PRODUCTS } from "@/lib/merchant/nav";
import {
  REWARD_COOLDOWN_UNITS,
  formatRewardCooldown,
  type RewardCooldownUnit,
} from "@/lib/loyalty/rules";
import { OnboardingVerifyStep } from "./onboarding-verify-step";

interface OnboardingWizardProps {
  mode: OnboardingMode;
  product: MerchantProduct;
  checkoutAccount?: CheckoutAccount | null;
  onComplete: () => void | Promise<void>;
}

const INTRO_FEATURES: Array<{ Icon: typeof Sparkles; title: string; desc: string }> = [
  { Icon: TrendingUp, title: "Lifetime-value insights", desc: "See what every customer is worth." },
  { Icon: Zap, title: "One-tap operations", desc: "Approve stamps and calls instantly." },
  { Icon: QrCode, title: "Your own branded QR", desc: "Customers join in seconds." },
];

const STEP_HEAD: Record<
  OnboardingStep,
  { Icon: typeof Sparkles; title: string; desc: string }
> = {
  intro: { Icon: Sparkles, title: "Welcome to Froq", desc: "" },
  identity: { Icon: Store, title: "Your business", desc: "Add your name, business, and logo." },
  verify: {
    Icon: ShieldCheck,
    title: "Verify contact",
    desc: "Confirm your email and mobile before branding.",
  },
  color: { Icon: Palette, title: "Brand color", desc: "Pick the color customers see." },
  contact: { Icon: Link2, title: "Address & links", desc: "Where to find you online and offline." },
  reward: { Icon: Gift, title: "Your reward", desc: "Set up the reward customers earn." },
  queue: { Icon: Clock3, title: "Queue setup", desc: "Set your wait-time defaults." },
  outro: { Icon: PartyPopper, title: "You're all set!", desc: "" },
};

export function OnboardingWizard({
  mode,
  product,
  checkoutAccount,
  onComplete,
}: OnboardingWizardProps) {
  const steps = buildOnboardingSteps(mode, product);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(() =>
    emptyOnboardingDraft(checkoutAccount),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const rewardInputRef = useRef<HTMLInputElement>(null);

  const productMeta = PRODUCTS.find((p) => p.id === product) ?? PRODUCTS[0];
  const current = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const head = STEP_HEAD[current];
  const Icon = head.Icon;

  function update<K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    update("logoDataUrl", await fileToLogoDataUrl(file));
    input.value = "";
  }

  async function handleRewardUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    update("rewardImageDataUrl", await fileToLogoDataUrl(file));
    input.value = "";
  }

  async function persist(): Promise<{ ok: boolean; error?: string }> {
    if (mode === "full") {
      const res = await createMerchant({
        businessName: draft.businessName.trim() || checkoutAccount?.businessName || "My Shop",
        ownerFirstName: draft.firstName.trim() || undefined,
        ownerLastName: draft.lastName.trim() || undefined,
        brandColor: draft.brandColor,
        logoDataUrl: draft.logoDataUrl,
        address: draft.address,
        websiteUrl: draft.websiteUrl.trim() || undefined,
        googleBusinessUrl: draft.googleBusinessUrl.trim() || undefined,
        instagramUrl: draft.instagramUrl.trim() || undefined,
        facebookUrl: draft.facebookUrl.trim() || undefined,
        xUrl: draft.xUrl.trim() || undefined,
        rewardTitle: draft.rewardTitle.trim() || undefined,
        rewardName: draft.rewardName.trim() || "Free reward",
        rewardImageDataUrl: draft.rewardImageDataUrl,
        avgOrderValue: draft.avgOrderValue,
        totalStamps: draft.totalStamps,
        rewardCooldownValue: draft.rewardCooldownValue,
        rewardCooldownUnit: draft.rewardCooldownUnit,
        product,
      });
      if (!res.ok) return res;
      if (product === "queue") {
        setInitialEstimatedWaitMinutes(draft.estimatedWaitMinutes);
        setAcceptWindowMinutes(draft.acceptMinutes);
      }
      return res;
    }

    // Product-only onboarding for an existing store.
    if (product === "queue") {
      setInitialEstimatedWaitMinutes(draft.estimatedWaitMinutes);
      setAcceptWindowMinutes(draft.acceptMinutes);
    } else {
      const saved = await updateMerchantProfile({
        rewardTitle: draft.rewardTitle.trim() || "Free reward",
        rewardName: draft.rewardName.trim() || "Free reward",
        rewardImageDataUrl: draft.rewardImageDataUrl,
        avgOrderValue: draft.avgOrderValue,
        totalStamps: draft.totalStamps,
        rewardCooldownValue: draft.rewardCooldownValue,
        rewardCooldownUnit: draft.rewardCooldownUnit,
      });
      if (!saved.ok) return saved;
    }
    return completeProductOnboarding(product);
  }

  async function finish() {
    setSubmitting(true);
    setError("");
    try {
      const res = await persist();
      if (!res.ok) {
        setError(res.error ?? "Something went wrong. Please try again.");
        setStepIndex((s) => Math.max(0, s - 1));
        return;
      }
      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStepIndex((s) => Math.max(0, s - 1));
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (!canAdvanceStep(current, draft) || submitting) return;
    if (isLast) {
      void finish();
      return;
    }
    setStepIndex((s) => s + 1);
  }

  const isHero = current === "intro" || current === "outro";
  const introTitle = mode === "full" ? "Welcome to Froq" : `Set up ${productMeta.name}`;
  const introDesc =
    mode === "full"
      ? "Let's set up your business and your first product in a few quick steps."
      : `You've added ${productMeta.name}. Let's configure it — this only takes a moment.`;

  return (
    <div className="merchant-page merchant-theme">
      <div className="merchant-screen wizard-screen">
        <div className="wizard-top">
          <div className="wizard-progress">
            <span className="wizard-step-count">
              Step {stepIndex + 1} of {steps.length}
            </span>
            <div className="wizard-dots" aria-hidden="true">
              {steps.map((_, index) => (
                <span
                  key={index}
                  className={`wizard-dot${index === stepIndex ? " active" : ""}${
                    index < stepIndex ? " done" : ""
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {isHero ? (
          <div className={`wizard-body${current === "intro" ? " wizard-body--intro" : ""}`}>
            {current === "intro" ? (
              <div className="wizard-logo-badge" key={current}>
                <Image src="/froq-logo.png" alt="Froq" width={72} height={72} priority />
              </div>
            ) : (
              <div className="wizard-icon-badge" key={current}>
                <Icon size={44} strokeWidth={2} className="wizard-icon wizard-anim-pop" />
              </div>
            )}
            <h1 className="wizard-title">{current === "intro" ? introTitle : head.title}</h1>
            <p className="wizard-desc">{current === "intro" ? introDesc : "Your setup is ready."}</p>

            {current === "intro" && mode === "full" && (
              <ul className="wizard-features">
                {INTRO_FEATURES.map(({ Icon: FeatureIcon, title, desc }) => (
                  <li key={title} className="wizard-feature">
                    <span className="wizard-feature-icon">
                      <FeatureIcon size={18} strokeWidth={2.2} />
                    </span>
                    <span className="wizard-feature-copy">
                      <span className="wizard-feature-title">{title}</span>
                      <span className="wizard-feature-desc">{desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {current === "outro" && (
              <div className="wizard-summary">
                {mode === "full" && (
                  <>
                    <SummaryRow
                      label="Business"
                      value={draft.businessName.trim() || "—"}
                    />
                    <SummaryRow
                      label="Brand color"
                      value={BRAND_COLORS.find((c) => c.value === draft.brandColor)?.name ?? "Custom"}
                      swatch={draft.brandColor}
                    />
                  </>
                )}
                <SummaryRow label="Product" value={productMeta.name} />
                {product === "loyalty" ? (
                  <SummaryRow label="Reward" value={draft.rewardName.trim() || "—"} />
                ) : (
                  <SummaryRow label="Est. wait" value={`${draft.estimatedWaitMinutes} min / party`} />
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="wizard-scroll" key={current}>
            <div className="wizard-form-head">
              <div className="wizard-form-icon">
                <Icon size={22} strokeWidth={2.2} />
              </div>
              <h1 className="wizard-title">{head.title}</h1>
              <p className="wizard-desc">{head.desc}</p>
            </div>

            {current === "identity" && (
              <div className="panel-card merchant-edit-panel">
                <div className="merchant-logo-field">
                  <span className="auth-label">Business logo</span>
                  <div className="merchant-logo-upload">
                    <div className="merchant-logo-preview">
                      {draft.logoDataUrl ? (
                        <Image
                          src={draft.logoDataUrl}
                          alt="Business logo"
                          width={64}
                          height={64}
                          unoptimized
                        />
                      ) : (
                        <ImagePlus size={22} strokeWidth={2} />
                      )}
                    </div>
                    <div className="merchant-logo-actions">
                      <button
                        type="button"
                        className="merchant-action-btn merchant-action-btn--reject"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {draft.logoDataUrl ? "Replace" : "Upload"}
                      </button>
                      {draft.logoDataUrl && (
                        <button
                          type="button"
                          className="merchant-logo-remove"
                          onClick={() => update("logoDataUrl", undefined)}
                          aria-label="Remove logo"
                        >
                          <Trash2 size={16} strokeWidth={2.3} />
                        </button>
                      )}
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="merchant-file-input"
                      onChange={(event) => void handleLogoUpload(event)}
                    />
                  </div>
                </div>

                <div className="wizard-field-row">
                  <WizardField
                    label="First name"
                    value={draft.firstName}
                    maxLength={40}
                    placeholder="Alex"
                    onChange={(v) => update("firstName", v)}
                  />
                  <WizardField
                    label="Last name"
                    value={draft.lastName}
                    maxLength={40}
                    placeholder="Morgan"
                    onChange={(v) => update("lastName", v)}
                  />
                </div>

                <WizardField
                  label="Business name"
                  value={draft.businessName}
                  maxLength={FIELD_LIMITS.businessName}
                  placeholder="Bloom Coffee Co."
                  onChange={(v) => update("businessName", v)}
                />
              </div>
            )}

            {current === "verify" && (
              <OnboardingVerifyStep
                email={checkoutAccount?.email ?? ""}
                phone={checkoutAccount?.phone ?? ""}
                emailVerified={draft.emailVerified}
                phoneVerified={draft.phoneVerified}
                onEmailVerified={() => update("emailVerified", true)}
                onPhoneVerified={() => update("phoneVerified", true)}
              />
            )}

            {current === "color" && (
              <div className="panel-card merchant-edit-panel">
                <div className="merchant-color-field">
                  <span className="auth-label">Brand color</span>
                  <div className="merchant-color-grid" role="radiogroup" aria-label="Brand color">
                    {BRAND_COLORS.map((color) => {
                      const isSelected = draft.brandColor === color.value;
                      return (
                        <button
                          key={color.value}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          aria-label={color.name}
                          title={color.name}
                          className={`merchant-color-swatch${isSelected ? " selected" : ""}`}
                          style={{ background: color.value }}
                          onClick={() => update("brandColor", color.value)}
                        >
                          {isSelected && <Check size={16} strokeWidth={3} />}
                        </button>
                      );
                    })}
                  </div>
                  <span className="merchant-field-hint">Used on your customer-facing pages.</span>
                </div>
              </div>
            )}

            {current === "contact" && (
              <div className="panel-card merchant-edit-panel">
                <WizardField
                  label="Address"
                  value={draft.address}
                  maxLength={FIELD_LIMITS.address}
                  placeholder="42 Market Street, San Francisco"
                  onChange={(v) => update("address", v)}
                />
                <WizardField
                  label="Website"
                  value={draft.websiteUrl}
                  maxLength={FIELD_LIMITS.url}
                  placeholder="bloomcoffee.com"
                  onChange={(v) => update("websiteUrl", v)}
                />
                <WizardField
                  label="Google Business"
                  value={draft.googleBusinessUrl}
                  maxLength={FIELD_LIMITS.url}
                  placeholder="g.page/bloomcoffee"
                  onChange={(v) => update("googleBusinessUrl", v)}
                />
                <WizardField
                  label="Instagram"
                  value={draft.instagramUrl}
                  maxLength={FIELD_LIMITS.url}
                  placeholder="instagram.com/bloomcoffee"
                  onChange={(v) => update("instagramUrl", v)}
                />
                <WizardField
                  label="Facebook"
                  value={draft.facebookUrl}
                  maxLength={FIELD_LIMITS.url}
                  placeholder="facebook.com/bloomcoffee"
                  onChange={(v) => update("facebookUrl", v)}
                />
                <WizardField
                  label="X (Twitter)"
                  value={draft.xUrl}
                  maxLength={FIELD_LIMITS.url}
                  placeholder="x.com/bloomcoffee"
                  onChange={(v) => update("xUrl", v)}
                />
                <span className="merchant-field-hint">Links are optional — add what you have.</span>
              </div>
            )}

            {current === "reward" && (
              <div className="panel-card merchant-edit-panel">
                <WizardField
                  label="Offer title"
                  value={draft.rewardTitle}
                  maxLength={FIELD_LIMITS.rewardTitle}
                  placeholder="Buy 4 coffees, get your 5th free"
                  onChange={(v) => update("rewardTitle", v)}
                />
                <WizardField
                  label="Reward name"
                  value={draft.rewardName}
                  maxLength={FIELD_LIMITS.rewardName}
                  placeholder="Free coffee"
                  onChange={(v) => update("rewardName", v)}
                />
                <div className="merchant-logo-field">
                  <span className="auth-label">Reward image</span>
                  <div className="merchant-logo-upload">
                    <div className="merchant-logo-preview">
                      {draft.rewardImageDataUrl ? (
                        <Image
                          src={draft.rewardImageDataUrl}
                          alt="Reward"
                          width={64}
                          height={64}
                          unoptimized
                        />
                      ) : (
                        <ImagePlus size={22} strokeWidth={2} />
                      )}
                    </div>
                    <div className="merchant-logo-actions">
                      <button
                        type="button"
                        className="merchant-action-btn merchant-action-btn--reject"
                        onClick={() => rewardInputRef.current?.click()}
                      >
                        {draft.rewardImageDataUrl ? "Replace" : "Upload"}
                      </button>
                      {draft.rewardImageDataUrl && (
                        <button
                          type="button"
                          className="merchant-logo-remove"
                          onClick={() => update("rewardImageDataUrl", undefined)}
                          aria-label="Remove reward image"
                        >
                          <Trash2 size={16} strokeWidth={2.3} />
                        </button>
                      )}
                    </div>
                    <input
                      ref={rewardInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="merchant-file-input"
                      onChange={(event) => void handleRewardUpload(event)}
                    />
                  </div>
                </div>
                <label className="auth-field">
                  <span className="auth-label">Stamps to earn a reward</span>
                  <select
                    className="auth-input"
                    value={draft.totalStamps}
                    onChange={(e) => update("totalStamps", Number(e.target.value))}
                  >
                    {STAMP_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} stamps
                      </option>
                    ))}
                  </select>
                </label>
                <div className="auth-field">
                  <span className="auth-label">Wait before next reward</span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <select
                      className="auth-input"
                      style={{ flex: 1 }}
                      value={draft.rewardCooldownValue}
                      onChange={(e) =>
                        update("rewardCooldownValue", Number(e.target.value))
                      }
                    >
                      {COOLDOWN_VALUE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n === 0 ? "No wait" : n}
                        </option>
                      ))}
                    </select>
                    <select
                      className="auth-input"
                      style={{ flex: 1 }}
                      value={draft.rewardCooldownUnit}
                      disabled={draft.rewardCooldownValue <= 0}
                      onChange={(e) =>
                        update(
                          "rewardCooldownUnit",
                          e.target.value as RewardCooldownUnit,
                        )
                      }
                    >
                      {REWARD_COOLDOWN_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="merchant-field-hint">
                    Reward QR stays locked for{" "}
                    {formatRewardCooldown(
                      draft.rewardCooldownValue,
                      draft.rewardCooldownUnit,
                    ).toLowerCase()}{" "}
                    after unlocking; the next stamp card uses the same wait after redeem. Changing
                    this later only applies to new rewards.
                  </span>
                </div>
                <label className="auth-field">
                  <span className="auth-label">Average order value (₹)</span>
                  <input
                    className="auth-input"
                    type="number"
                    min={0}
                    step={10}
                    value={draft.avgOrderValue}
                    onChange={(e) => update("avgOrderValue", Number(e.target.value))}
                  />
                  <span className="merchant-field-hint">Used to calculate customer lifetime value.</span>
                </label>
              </div>
            )}

            {current === "queue" && (
              <div className="panel-card merchant-edit-panel">
                <label className="auth-field">
                  <span className="auth-label">
                    <Timer size={14} strokeWidth={2.2} /> Estimated wait per party
                  </span>
                  <select
                    className="auth-input"
                    value={draft.estimatedWaitMinutes}
                    onChange={(e) => update("estimatedWaitMinutes", Number(e.target.value))}
                  >
                    {WAIT_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} minutes
                      </option>
                    ))}
                  </select>
                  <span className="merchant-field-hint">
                    We&apos;ll refine this automatically from real seating times.
                  </span>
                </label>
                <label className="auth-field">
                  <span className="auth-label">
                    <Clock3 size={14} strokeWidth={2.2} /> Call window
                  </span>
                  <select
                    className="auth-input"
                    value={draft.acceptMinutes}
                    onChange={(e) => update("acceptMinutes", Number(e.target.value))}
                  >
                    {CALL_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} minutes
                      </option>
                    ))}
                  </select>
                  <span className="merchant-field-hint">
                    How long a called guest has to arrive before they&apos;re marked left.
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        <div className="wizard-footer">
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="cta-btn merchant-cta-accent"
            onClick={handleNext}
            disabled={!canAdvanceStep(current, draft) || submitting}
          >
            {submitting
              ? "Saving…"
              : isLast
                ? "Go to dashboard"
                : current === "intro"
                  ? "Get started"
                  : "Continue"}
            {!isLast && !submitting && <ArrowRight size={17} strokeWidth={2.4} />}
          </button>
          {stepIndex > 0 && !isLast && (
            <button
              type="button"
              className="wizard-back"
              onClick={() => setStepIndex((s) => s - 1)}
            >
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface WizardFieldProps {
  label: string;
  value: string;
  maxLength: number;
  placeholder?: string;
  onChange: (value: string) => void;
}

function WizardField({ label, value, maxLength, placeholder, onChange }: WizardFieldProps) {
  return (
    <label className="auth-field">
      <span className="merchant-field-head">
        <span className="auth-label">{label}</span>
        <span className="merchant-char-count">
          {value.length}/{maxLength}
        </span>
      </span>
      <input
        className="auth-input"
        type="text"
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SummaryRow({
  label,
  value,
  swatch,
}: {
  label: string;
  value: string;
  swatch?: string;
}) {
  return (
    <div className="wizard-summary-row">
      <span className="wizard-summary-label">{label}</span>
      <span className="wizard-summary-value">
        {swatch && <span className="wizard-summary-swatch" style={{ background: swatch }} />}
        {value}
      </span>
    </div>
  );
}
