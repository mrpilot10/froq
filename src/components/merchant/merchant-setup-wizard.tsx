"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  Gift,
  ImagePlus,
  Palette,
  PartyPopper,
  QrCode,
  Sparkles,
  Store,
  Trash2,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { BRAND_COLORS, FIELD_LIMITS } from "@/lib/merchant/constants";
import { fileToLogoDataUrl } from "@/lib/merchant/image";
import { createMerchant } from "@/app/merchant/actions";
import type { CheckoutAccount } from "@/lib/merchant/checkout";

interface MerchantSetupWizardProps {
  onComplete: () => void | Promise<void>;
  checkoutAccount?: CheckoutAccount | null;
}

interface ShopDraft {
  businessName: string;
  address: string;
  brandColor: string;
  logoDataUrl?: string;
  rewardTitle: string;
  rewardName: string;
  avgOrderValue: number;
}

type StepKind = "intro" | "store" | "color" | "reward" | "outro";

const INTRO_BENEFITS: Array<{ Icon: typeof Gift; title: string; desc: string }> = [
  {
    Icon: Gift,
    title: "Digital loyalty cards",
    desc: "Reward repeat customers — no plastic punch cards.",
  },
  {
    Icon: BarChart3,
    title: "Lifetime value insights",
    desc: "Track visits, active cards, and revenue trends.",
  },
  {
    Icon: Zap,
    title: "One-tap stamping",
    desc: "Approve stamps and redeem rewards in seconds.",
  },
  {
    Icon: QrCode,
    title: "Your branded QR",
    desc: "Customers join by scanning — no app to download.",
  },
];

const STEPS: Array<{
  kind: StepKind;
  Icon: typeof Sparkles;
  anim?: string;
  title: string;
  desc: string;
}> = [
  {
    kind: "intro",
    Icon: Sparkles,
    anim: "wizard-anim-pop",
    title: "Welcome to Froq",
    desc: "Everything you need to turn first-time buyers into regulars. Set up your shop in a few quick steps.",
  },
  {
    kind: "store",
    Icon: Store,
    title: "Your store",
    desc: "Add your logo and store details.",
  },
  {
    kind: "color",
    Icon: Palette,
    title: "Brand color",
    desc: "Pick the color your customers see on their loyalty card.",
  },
  {
    kind: "reward",
    Icon: Gift,
    title: "Your reward",
    desc: "Set up the free reward your customers earn.",
  },
  {
    kind: "outro",
    Icon: PartyPopper,
    anim: "wizard-anim-pop",
    title: "You're all set!",
    desc: "Your dashboard is ready. Track customer lifetime value, approvals, and more.",
  },
];

export function MerchantSetupWizard({ onComplete, checkoutAccount }: MerchantSetupWizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ShopDraft>(() => ({
    businessName: checkoutAccount?.businessName ?? "",
    address: "",
    brandColor: BRAND_COLORS[0].value,
    logoDataUrl: undefined,
    rewardTitle: "",
    rewardName: "",
    avgOrderValue: 200,
  }));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const Icon = current.Icon;

  function update<K extends keyof ShopDraft>(key: K, value: ShopDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const dataUrl = await fileToLogoDataUrl(file);
    update("logoDataUrl", dataUrl);
    input.value = "";
  }

  const canAdvance =
    current.kind === "store"
      ? draft.businessName.trim().length > 0
      : current.kind === "reward"
        ? draft.rewardTitle.trim().length > 0 && draft.rewardName.trim().length > 0
        : true;

  async function finish() {
    setSubmitting(true);
    setError("");
    try {
      const name = draft.businessName.trim() || checkoutAccount?.businessName || "My Shop";
      const res = await createMerchant({
        businessName: name,
        brandColor: draft.brandColor,
        logoDataUrl: draft.logoDataUrl,
        address: draft.address,
        rewardTitle: draft.rewardTitle.trim() || undefined,
        rewardName: draft.rewardName.trim() || "Free reward",
        avgOrderValue: draft.avgOrderValue,
      });

      if (!res.ok) {
        // Surface the failure and stay on this step so the button never hangs.
        setError(res.error ?? "Could not create your store. Please try again.");
        setStep((s) => Math.max(0, s - 1));
        return;
      }

      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your store. Please try again.");
      setStep((s) => Math.max(0, s - 1));
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (!canAdvance || submitting) return;
    if (isLast) {
      void finish();
      return;
    }
    setStep((s) => s + 1);
  }

  function handleSkip() {
    void finish();
  }

  const isHero = current.kind === "intro" || current.kind === "outro";

  return (
    <div className="merchant-page merchant-theme">
      <div className="merchant-screen wizard-screen">
        <div className="wizard-top">
          <div className="wizard-progress">
            <span className="wizard-step-count">
              Step {step + 1} of {STEPS.length}
            </span>
            <div className="wizard-dots" aria-hidden="true">
              {STEPS.map((_, index) => (
                <span
                  key={index}
                  className={`wizard-dot${index === step ? " active" : ""}${
                    index < step ? " done" : ""
                  }`}
                />
              ))}
            </div>
          </div>
          {!isLast && (
            <button type="button" className="wizard-skip" onClick={handleSkip}>
              Skip
            </button>
          )}
        </div>

        {isHero ? (
          <div className={`wizard-body${current.kind === "intro" ? " wizard-body--intro" : ""}`}>
            <div className="wizard-icon-badge" key={step}>
              <Icon size={44} strokeWidth={2} className={`wizard-icon ${current.anim ?? ""}`} />
            </div>
            <h1 className="wizard-title">{current.title}</h1>
            <p className="wizard-desc">{current.desc}</p>
            {current.kind === "intro" && (
              <ul className="wizard-benefits">
                {INTRO_BENEFITS.map(({ Icon: BenefitIcon, title, desc }) => (
                  <li key={title} className="wizard-benefit">
                    <span className="wizard-benefit-icon" aria-hidden="true">
                      <BenefitIcon size={18} strokeWidth={2.2} />
                    </span>
                    <span className="wizard-benefit-copy">
                      <span className="wizard-benefit-title">{title}</span>
                      <span className="wizard-benefit-desc">{desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {current.kind === "outro" && (
              <div className="wizard-summary">
                <SummaryRow label="Store" value={draft.businessName.trim() || "—"} />
                <SummaryRow
                  label="Brand color"
                  value={BRAND_COLORS.find((c) => c.value === draft.brandColor)?.name ?? "Custom"}
                  swatch={draft.brandColor}
                />
                <SummaryRow label="Reward" value={draft.rewardName.trim() || "—"} />
              </div>
            )}
          </div>
        ) : (
          <div className="wizard-scroll" key={step}>
            <div className="wizard-form-head">
              <div className="wizard-form-icon">
                <Icon size={22} strokeWidth={2.2} />
              </div>
              <h1 className="wizard-title">{current.title}</h1>
              <p className="wizard-desc">{current.desc}</p>
            </div>

            {current.kind === "store" && (
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
                        onClick={() => fileInputRef.current?.click()}
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
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="merchant-file-input"
                      onChange={(event) => void handleLogoUpload(event)}
                    />
                  </div>
                </div>

                <WizardField
                  label="Business name"
                  value={draft.businessName}
                  maxLength={FIELD_LIMITS.businessName}
                  placeholder="Bloom Coffee Co."
                  onChange={(v) => update("businessName", v)}
                />
                <WizardField
                  label="Address"
                  value={draft.address}
                  maxLength={FIELD_LIMITS.address}
                  placeholder="42 Market Street, San Francisco"
                  onChange={(v) => update("address", v)}
                />
              </div>
            )}

            {current.kind === "color" && (
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
                  <span className="merchant-field-hint">Used on your customer loyalty card.</span>
                </div>
              </div>
            )}

            {current.kind === "reward" && (
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
                <label className="auth-field">
                  <span className="auth-label">Order value (₹)</span>
                  <input
                    className="auth-input"
                    type="number"
                    min={0}
                    step={10}
                    value={draft.avgOrderValue}
                    onChange={(e) => update("avgOrderValue", Number(e.target.value))}
                  />
                  <span className="merchant-field-hint">
                    Used to calculate customer lifetime value
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
            disabled={!canAdvance || submitting}
          >
            {submitting
              ? "Creating your store…"
              : isLast
                ? "Go to dashboard"
                : current.kind === "intro"
                  ? "Get started"
                  : "Continue"}
            {!isLast && !submitting && <ArrowRight size={17} strokeWidth={2.4} />}
          </button>
          {step > 0 && !isLast && (
            <button type="button" className="wizard-back" onClick={() => setStep((s) => s - 1)}>
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
