"use client";

import { ArrowUpRight, Check, Lock, Sparkles } from "lucide-react";
import { MERCHANT_PLANS } from "@/lib/merchant/constants";
import type { MerchantProduct } from "@/lib/merchant/types";

interface MerchantPlanCardProps {
  product?: MerchantProduct;
  /** Live entitlement state; falls back to the static catalog when omitted. */
  enabled?: boolean;
  onGetStarted?: () => void;
  onManagePlan?: () => void;
}

export function MerchantPlanCard({
  product = "loyalty",
  enabled,
  onGetStarted,
  onManagePlan,
}: MerchantPlanCardProps) {
  const catalog = MERCHANT_PLANS[product];
  const plan = { ...catalog, enabled: enabled ?? catalog.enabled };

  // Products that aren't enabled yet show an upgrade/enable placeholder only.
  if (!plan.enabled) {
    return (
      <div className="merchant-settings-group">
        <h3 className="merchant-settings-title">Your plan</h3>

        <div className="panel-card merchant-plan-card merchant-plan-card--locked">
          <div className="merchant-plan-head">
            <div className="merchant-plan-icon">
              <Lock size={20} strokeWidth={2.2} />
            </div>
            <div className="merchant-plan-copy">
              <span className="merchant-plan-eyebrow">Froq {plan.name}</span>
              <div className="merchant-plan-price">
                {plan.price}
                <span>{plan.cycle}</span>
              </div>
            </div>
            <span className="merchant-plan-badge merchant-plan-badge--locked">{plan.status}</span>
          </div>

          <ul className="merchant-plan-features">
            {plan.features.map((feature) => (
              <li key={feature}>
                <Check size={15} strokeWidth={2.6} />
                {feature}
              </li>
            ))}
          </ul>

          {onGetStarted && (
            <button
              type="button"
              className="cta-btn merchant-cta-accent merchant-plan-enable"
              onClick={onGetStarted}
            >
              Get Started
              <ArrowUpRight size={16} strokeWidth={2.4} />
            </button>
          )}
          <p className="merchant-plan-locked-note">
            {onGetStarted
              ? "Billed separately from Loyalty Stamps."
              : "Ask the store owner to unlock this product."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="merchant-settings-group">
      <h3 className="merchant-settings-title">Your plan</h3>

      <div className="panel-card merchant-plan-card">
        <div className="merchant-plan-head">
          <div className="merchant-plan-icon">
            <Sparkles size={20} strokeWidth={2.2} />
          </div>
          <div className="merchant-plan-copy">
            <span className="merchant-plan-eyebrow">Froq {plan.name}</span>
            <div className="merchant-plan-price">
              {plan.price}
              <span>{plan.cycle}</span>
            </div>
          </div>
          <span className="merchant-plan-badge">{plan.status}</span>
        </div>

        <ul className="merchant-plan-features">
          {plan.features.map((feature) => (
            <li key={feature}>
              <Check size={15} strokeWidth={2.6} />
              {feature}
            </li>
          ))}
        </ul>

        <div className="merchant-plan-foot">
          <span className="merchant-plan-renew">Renews {plan.renewsOn}</span>
          {onManagePlan ? (
            <button type="button" className="merchant-plan-manage" onClick={onManagePlan}>
              Manage plan
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
