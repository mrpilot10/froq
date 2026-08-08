"use client";

import { ArrowUpRight } from "lucide-react";
import { PRODUCTS } from "@/lib/merchant/nav";
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
import {
  isProductEnabled,
  isTrialActive,
  trialDaysLeft,
  type Entitlements,
} from "@/lib/merchant/entitlements";

export interface MerchantSidePlanUsage {
  branchesUsed?: number | null;
  /** Customers (loyalty), tickets (queue), reservations, or AI Replies (menu). */
  metricUsed?: number | null;
  /** Second volume meter — AI Generations on Menu. */
  secondaryUsed?: number | null;
  /** Credit bank size for AI Generations (leftovers + grants). */
  secondaryLimit?: number | null;
}

interface MerchantSidePlanCardProps {
  product: MerchantProduct;
  entitlements: Entitlements;
  canPurchase?: boolean;
  usage?: MerchantSidePlanUsage;
  onAction?: (product: MerchantProduct) => void;
}

const fmt = (value: number) => value.toLocaleString("en-IN");

/** Above this, discrete slots get too thin to read and a bar works better. */
const MAX_PIPS = 6;

function Meter({
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
  /** Draw as discrete slots instead of a bar (branches, not volume). */
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
            // A few tickets into a 1,000 cap is a sub-pixel fill; floor it so
            // "started" never renders as an empty track.
            style={{ width: percent > 0 ? `max(6px, ${percent}%)` : 0 }}
          />
        </div>
      )}
      {helper ? (
        <p className="merchant-side-plan-usage-helper">{helper}</p>
      ) : null}
    </div>
  );
}

function UsageMeter({ snap }: { snap: PlanUsageSnapshot }) {
  return (
    <Meter
      heading={snap.heading}
      value={`${fmt(snap.used)} / ${fmt(snap.limit)}`}
      percent={snap.percent}
      urgency={snap.urgency}
      helper={snap.helper}
      ariaLabel={`${snap.heading}: ${snap.used} of ${snap.limit}`}
    />
  );
}

function BranchMeter({ snap }: { snap: PlanBranchUsage }) {
  const percent =
    snap.limit > 0 ? Math.min(100, Math.round((snap.used / snap.limit) * 100)) : 0;
  return (
    <Meter
      heading="Branches"
      value={`${fmt(snap.used)} / ${fmt(snap.limit)}`}
      percent={percent}
      slots={
        snap.limit <= MAX_PIPS
          ? { total: snap.limit, filled: Math.min(snap.used, snap.limit) }
          : null
      }
      urgency={snap.urgency}
      // A full branch allowance is the normal state of a small plan, and the
      // primary meter below carries its own helper — one warning per card.
      helper={null}
      ariaLabel={`Branches: ${snap.used} of ${snap.limit}`}
    />
  );
}

/**
 * Compact subscription card in the merchant sidebar / mobile menu.
 * Every enabled product uses the same capacity layout: product + status,
 * Branches + primary metric meters, and Upgrade now · price.
 */
export function MerchantSidePlanCard({
  product: activeProduct,
  entitlements,
  canPurchase = true,
  usage,
  onAction,
}: MerchantSidePlanCardProps) {
  const product = PRODUCTS.find((p) => p.id === activeProduct) ?? PRODUCTS[0];
  const entitlement = entitlements[activeProduct];
  const enabled = isProductEnabled(entitlements, activeProduct);
  const onTrial = isTrialActive(entitlement);
  const summary = planUpgradeSummary({
    product: activeProduct,
    planId: entitlement?.planId,
  });

  const usageSnap = planUsageSnapshot({
    product: activeProduct,
    planId: entitlement?.planId,
    branchesUsed: usage?.branchesUsed,
    metricUsed: usage?.metricUsed ?? (enabled ? 0 : null),
    onTrial,
  });
  const secondarySnap =
    enabled && usage?.secondaryUsed != null
      ? planSecondaryUsage({
          product: activeProduct,
          planId: entitlement?.planId,
          secondaryUsed: usage.secondaryUsed,
          secondaryLimit: usage.secondaryLimit,
          onTrial,
        })
      : null;
  const metricSnap =
    enabled && usageSnap && usageSnap.heading !== "Branches" ? usageSnap : null;
  const branchSnap = enabled
    ? planBranchUsage({
        product: activeProduct,
        planId: entitlement?.planId,
        branchesUsed: usage?.branchesUsed,
        onTrial,
      })
    : null;

  const daysLeft = onTrial ? trialDaysLeft(entitlement) : 0;
  const statusLabel = onTrial
    ? `${daysLeft}d trial left`
    : enabled
      ? "Active"
      : "Not enabled";
  const statusClass = onTrial
    ? ` is-trial${daysLeft <= 2 ? " is-urgent" : ""}`
    : enabled
      ? " is-active"
      : "";

  const ctaLabel = summary.nextPlan
    ? enabled
      ? "Upgrade now"
      : "Get started"
    : null;
  const showCta = Boolean(canPurchase && ctaLabel && summary.nextPlan);
  const showCapacity = enabled && Boolean(branchSnap || metricSnap || secondarySnap);

  return (
    <div
      className={`merchant-side-plan${enabled ? "" : " is-locked"}${
        showCapacity ? " merchant-side-plan--capacity" : ""
      }`}
    >
      <div className="merchant-side-plan-top">
        <span className="merchant-side-plan-product">{product.name}</span>
        <span className={`merchant-side-plan-status${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      {showCapacity ? (
        <div className="merchant-side-plan-capacity-body">
          {branchSnap ? <BranchMeter snap={branchSnap} /> : null}
          {secondarySnap ? <UsageMeter snap={secondarySnap} /> : null}
          {metricSnap ? <UsageMeter snap={metricSnap} /> : null}
        </div>
      ) : summary.nextPlan && summary.nextHighlights.length > 0 ? (
        <p className="merchant-side-plan-gain">
          {summary.nextHighlights.join(" · ")}
        </p>
      ) : null}

      {showCta && summary.nextPlan ? (
        <button
          type="button"
          className="merchant-side-plan-cta"
          onClick={() => onAction?.(activeProduct)}
        >
          <span>{ctaLabel}</span>
          <span className="merchant-side-plan-cta-price">
            {summary.nextPlan.priceLabel}
            {summary.currentCycleLabel}
          </span>
          <ArrowUpRight size={14} strokeWidth={2.4} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
