"use client";

import { ArrowUpRight, Check, Lock, Sparkles } from "lucide-react";
import { MERCHANT_PLANS } from "@/lib/merchant/constants";
import {
  planBranchUsage,
  planSecondaryUsage,
  planUpgradeSummary,
  planUsageSnapshot,
  type PlanBranchUsage,
  type PlanUsageSnapshot,
  type PlanUsageUrgency,
} from "@/lib/merchant/plan-summary";
import type { MerchantProduct } from "@/lib/merchant/types";

interface MerchantPlanCardProps {
  product?: MerchantProduct;
  /** Live entitlement state; falls back to the static catalog when omitted. */
  enabled?: boolean;
  /** Live `merchant_products.plan_id` — enables tier + restriction meters. */
  planId?: string | null;
  branchesUsed?: number | null;
  /** Customers / tickets / reservations / AI Replies depending on product. */
  metricUsed?: number | null;
  /** Second volume (AI Generations on Menu). */
  secondaryUsed?: number | null;
  /** Credit bank size for AI Generations. */
  secondaryLimit?: number | null;
  onTrial?: boolean;
  onGetStarted?: () => void;
  onManagePlan?: () => void;
}

const fmt = (value: number) => value.toLocaleString("en-IN");
const MAX_PIPS = 6;

function PlanMeter({
  heading,
  value,
  percent,
  slots = null,
  urgency,
  helper,
  ariaLabel,
}: {
  heading: string;
  value: string;
  percent: number;
  slots?: { total: number; filled: number } | null;
  urgency: PlanUsageUrgency;
  helper: string | null;
  ariaLabel: string;
}) {
  return (
    <div
      className={`merchant-side-plan-usage${urgency === "high" ? " is-warn" : ""}`}
    >
      <div className="merchant-side-plan-usage-row">
        <span className="merchant-side-plan-usage-heading">{heading}</span>
        <span className="merchant-side-plan-usage-value">{value}</span>
      </div>
      {slots ? (
        <div
          className="merchant-side-plan-usage-pips"
          role="progressbar"
          aria-valuenow={slots.filled}
          aria-valuemin={0}
          aria-valuemax={slots.total}
          aria-label={ariaLabel}
        >
          {Array.from({ length: slots.total }, (_, index) => (
            <span
              key={index}
              className={`merchant-side-plan-usage-pip${
                index < slots.filled ? " is-on" : ""
              }`}
            />
          ))}
        </div>
      ) : (
        <div
          className="merchant-side-plan-usage-track"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={ariaLabel}
        >
          <span
            className="merchant-side-plan-usage-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {helper ? (
        <p className="merchant-side-plan-usage-helper">{helper}</p>
      ) : null}
    </div>
  );
}

function BranchMeter({ snap }: { snap: PlanBranchUsage }) {
  const percent =
    snap.limit > 0 ? Math.min(100, Math.round((snap.used / snap.limit) * 100)) : 0;
  return (
    <PlanMeter
      heading="Branches"
      value={`${fmt(snap.used)} / ${fmt(snap.limit)}`}
      percent={percent}
      slots={
        snap.limit <= MAX_PIPS
          ? { total: snap.limit, filled: Math.min(snap.used, snap.limit) }
          : null
      }
      urgency={snap.urgency}
      helper={null}
      ariaLabel={`Branches: ${snap.used} of ${snap.limit}`}
    />
  );
}

function UsageMeter({ snap }: { snap: PlanUsageSnapshot }) {
  return (
    <PlanMeter
      heading={snap.heading}
      value={`${fmt(snap.used)} / ${fmt(snap.limit)}`}
      percent={snap.percent}
      urgency={snap.urgency}
      helper={snap.helper}
      ariaLabel={`${snap.heading}: ${snap.used} of ${snap.limit}`}
    />
  );
}

export function MerchantPlanCard({
  product = "loyalty",
  enabled,
  planId,
  branchesUsed = null,
  metricUsed = null,
  secondaryUsed = null,
  secondaryLimit = null,
  onTrial = false,
  onGetStarted,
  onManagePlan,
}: MerchantPlanCardProps) {
  const catalog = MERCHANT_PLANS[product];
  const plan = { ...catalog, enabled: enabled ?? catalog.enabled };
  const live = planId !== undefined && plan.enabled;
  const summary = live
    ? planUpgradeSummary({ product, planId })
    : null;
  const branchSnap = live
    ? planBranchUsage({
        product,
        planId,
        branchesUsed,
        onTrial,
      })
    : null;
  const usageSnap = live
    ? planUsageSnapshot({
        product,
        planId,
        branchesUsed,
        metricUsed: metricUsed ?? 0,
        onTrial,
      })
    : null;
  const secondarySnap =
    live && secondaryUsed != null
      ? planSecondaryUsage({
          product,
          planId,
          secondaryUsed,
          secondaryLimit,
          onTrial,
        })
      : null;
  const metricSnap =
    usageSnap && usageSnap.heading !== "Branches" ? usageSnap : null;

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

  const tierName = summary?.currentTier ?? plan.name;
  const priceLabel = summary?.currentPriceLabel ?? plan.price;
  const cycleLabel = summary?.currentCycleLong ?? plan.cycle;
  const features =
    summary?.currentLimitsLabel
      ? summary.currentLimitsLabel.split(" · ")
      : plan.features;

  return (
    <div className="merchant-settings-group">
      <h3 className="merchant-settings-title">Your plan</h3>

      <div className="panel-card merchant-plan-card">
        <div className="merchant-plan-head">
          <div className="merchant-plan-icon">
            <Sparkles size={20} strokeWidth={2.2} />
          </div>
          <div className="merchant-plan-copy">
            <span className="merchant-plan-eyebrow">Froq {tierName}</span>
            <div className="merchant-plan-price">
              {priceLabel}
              <span>{cycleLabel}</span>
            </div>
          </div>
          <span className="merchant-plan-badge">{plan.status}</span>
        </div>

        {branchSnap || metricSnap || secondarySnap ? (
          <div className="merchant-plan-meters merchant-side-plan-meters">
            {branchSnap ? <BranchMeter snap={branchSnap} /> : null}
            {secondarySnap ? <UsageMeter snap={secondarySnap} /> : null}
            {metricSnap ? <UsageMeter snap={metricSnap} /> : null}
          </div>
        ) : (
          <ul className="merchant-plan-features">
            {features.map((feature) => (
              <li key={feature}>
                <Check size={15} strokeWidth={2.6} />
                {feature}
              </li>
            ))}
          </ul>
        )}

        <div className="merchant-plan-foot">
          {summary?.currentLimitsLabel && !branchSnap && !metricSnap ? (
            <span className="merchant-plan-renew">{summary.currentLimitsLabel}</span>
          ) : (
            <span className="merchant-plan-renew">
              {plan.renewsOn ? `Renews ${plan.renewsOn}` : `${tierName} plan limits`}
            </span>
          )}
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
