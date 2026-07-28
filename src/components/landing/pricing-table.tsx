"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Check,
  Gift,
  LayoutDashboard,
  MessageCircle,
  Palette,
  QrCode,
  Shield,
  Sparkles,
  Stamp,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  ENTERPRISE_CONTACT,
  plansForProduct,
  type BillingCycle,
  type PricingPlan,
} from "@/lib/merchant/pricing";
import type { MerchantProduct } from "@/lib/merchant/types";
import { FeatureText } from "@/components/landing/feature-text";

const FEATURE_ICONS: LucideIcon[] = [
  Building2,
  Users,
  Stamp,
  Gift,
  QrCode,
  MessageCircle,
  LayoutDashboard,
  Sparkles,
  Palette,
  Zap,
  Shield,
  Check,
];

function featureIcon(index: number): LucideIcon {
  return FEATURE_ICONS[index % FEATURE_ICONS.length];
}

export interface PricingTableProps {
  /** Which product's catalog to show. Defaults to loyalty. */
  product?: MerchantProduct;
  /** Landing CTAs vs in-dashboard plan management. */
  variant?: "landing" | "manage";
  currentPlanId?: string | null;
  initialBilling?: BillingCycle;
  selectingPlanId?: string | null;
  onSelectPlan?: (plan: PricingPlan) => void | Promise<void>;
  onViewPlan?: () => void;
  /** Custom CTA label for non-current manage cards (upgrade / downgrade). */
  planActionLabel?: (plan: PricingPlan) => string;
  title?: string;
  subtitle?: string;
}

export function PricingTable({
  product = "loyalty",
  variant = "landing",
  currentPlanId = null,
  initialBilling = "monthly",
  selectingPlanId = null,
  onSelectPlan,
  onViewPlan,
  planActionLabel,
  title,
  subtitle,
}: PricingTableProps) {
  const [billing, setBilling] = useState<BillingCycle>(initialBilling);
  const toggleId = useId();
  const plans = plansForProduct(product, billing);
  const isManage = variant === "manage";

  useEffect(() => {
    setBilling(initialBilling);
  }, [initialBilling]);

  return (
    <section className="landing-pricing" aria-labelledby={`${toggleId}-title`}>
      <div className="landing-section-head landing-pricing-head">
        {!isManage ? <span className="landing-hero-badge">Pricing</span> : null}
        <h2 id={`${toggleId}-title`} className="landing-section-title">
          {title ?? (isManage ? "Manage your plan" : "Simple, transparent pricing")}
        </h2>
        <p className="landing-section-sub">
          {subtitle ??
            (isManage
              ? "Switch plans anytime. You only pay when you confirm checkout."
              : "Start with a 7-day free trial. No credit card required. Cancel anytime.")}
        </p>
      </div>

      <div className="landing-billing-toggle" role="group" aria-label="Billing period">
        <button
          type="button"
          className={`landing-billing-option${billing === "monthly" ? " is-active" : ""}`}
          aria-pressed={billing === "monthly"}
          disabled={Boolean(selectingPlanId)}
          onClick={() => setBilling("monthly")}
        >
          Monthly
        </button>
        <button
          type="button"
          className={`landing-billing-option${billing === "yearly" ? " is-active" : ""}`}
          aria-pressed={billing === "yearly"}
          disabled={Boolean(selectingPlanId)}
          onClick={() => setBilling("yearly")}
        >
          Yearly
          <span className="landing-billing-save">Save 17%</span>
        </button>
        <span
          className={`landing-billing-thumb${billing === "yearly" ? " is-yearly" : ""}`}
          aria-hidden="true"
        />
      </div>

      <div className="landing-pricing-grid" data-billing={billing}>
        {plans.map((plan) => (
          <PricingCard
            key={`${plan.id}-${billing}`}
            plan={plan}
            billing={billing}
            variant={variant}
            isCurrent={plan.id === currentPlanId}
            selecting={selectingPlanId === plan.id}
            disabled={Boolean(selectingPlanId)}
            actionLabel={planActionLabel?.(plan)}
            onSelectPlan={onSelectPlan}
            onViewPlan={onViewPlan}
          />
        ))}
      </div>

      <p className="landing-enterprise-line">
        <span className="landing-enterprise-copy">
          <strong>{ENTERPRISE_CONTACT.title}</strong> {ENTERPRISE_CONTACT.body}
        </span>{" "}
        <a href={ENTERPRISE_CONTACT.href} className="landing-enterprise-link">
          {ENTERPRISE_CONTACT.cta}
        </a>
      </p>
    </section>
  );
}

function PricingCard({
  plan,
  billing,
  variant,
  isCurrent,
  selecting,
  disabled,
  actionLabel,
  onSelectPlan,
  onViewPlan,
}: {
  plan: PricingPlan;
  billing: BillingCycle;
  variant: "landing" | "manage";
  isCurrent: boolean;
  selecting: boolean;
  disabled: boolean;
  actionLabel?: string;
  onSelectPlan?: (plan: PricingPlan) => void | Promise<void>;
  onViewPlan?: () => void;
}) {
  const isYearly = billing === "yearly";
  const isManage = variant === "manage";
  const ctaHref = `/checkout?plan=${encodeURIComponent(plan.id)}`;

  return (
    <article
      className={`panel-card landing-plan-card${plan.highlighted ? " landing-plan-card--featured" : ""}${isCurrent ? " landing-plan-card--current" : ""}`}
    >
      {plan.highlighted && !isCurrent ? (
        <span className="landing-plan-popular">Most Popular</span>
      ) : null}
      {isCurrent ? <span className="landing-plan-popular">Current plan</span> : null}

      <div className="landing-plan-top">
        <h3 className="landing-plan-name">{plan.name}</h3>
        <p className="landing-plan-desc">{plan.description}</p>
      </div>

      <div className="landing-plan-price-block" key={billing}>
        {isYearly && plan.listPriceLabel ? (
          <div className="landing-plan-price-row">
            <span className="landing-plan-list">{plan.listPriceLabel}</span>
            <span className="landing-plan-free-badge">2 Months Free</span>
          </div>
        ) : null}

        <div className="landing-plan-price">
          {plan.priceLabel}
          {plan.cycle ? <span>{plan.cycle}</span> : null}
        </div>

        {isYearly && plan.saveLabel ? (
          <p className="landing-plan-save">Save {plan.saveLabel}</p>
        ) : null}

        {isYearly && plan.monthlyEquivalentLabel ? (
          <p className="landing-plan-equiv">
            Just {plan.monthlyEquivalentLabel}/month, billed yearly
          </p>
        ) : (
          <p className="landing-plan-equiv">Billed monthly</p>
        )}
      </div>

      <ul className="landing-plan-features">
        {plan.features.map((feature, index) => {
          const Icon = featureIcon(index);
          return (
            <li key={feature}>
              <span className="landing-plan-feature-icon" aria-hidden>
                <Icon size={14} strokeWidth={2.4} />
              </span>
              <FeatureText text={feature} />
            </li>
          );
        })}
      </ul>

      {isManage ? (
        isCurrent ? (
          <button
            type="button"
            className="cta-btn landing-plan-cta merchant-cta-accent"
            disabled={disabled}
            onClick={() => onViewPlan?.()}
          >
            View Plan
          </button>
        ) : (
          <button
            type="button"
            className={`cta-btn landing-plan-cta${plan.highlighted ? " merchant-cta-accent" : " landing-plan-cta--ghost"}`}
            disabled={disabled}
            onClick={() => void onSelectPlan?.(plan)}
          >
            {selecting ? "Processing…" : actionLabel ?? "Get started"}
          </button>
        )
      ) : (
        <Link
          href={ctaHref}
          className={`cta-btn landing-plan-cta${plan.highlighted ? " merchant-cta-accent" : " landing-plan-cta--ghost"}`}
        >
          Start 7-Day Free Trial
        </Link>
      )}
    </article>
  );
}
