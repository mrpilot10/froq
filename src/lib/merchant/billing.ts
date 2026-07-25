import {
  ALL_PLANS,
  basePlanId,
  getPlanById,
  type BillingCycle,
  type PricingPlan,
} from "./pricing";

export type PlanChangeKind = "upgrade" | "downgrade" | "same";

const TIER_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  growth: 2,
  pro: 3,
  queue: 1,
};

/** Public billing policy shown in manage-plan UI and FAQ. */
export const BILLING_POLICY = {
  moneyBack:
    "7-day money-back guarantee for first-time subscriptions only. After that, payments are non-refundable.",
  planChanges:
    "Plan changes are handled automatically at the next renewal. Your current plan stays active until then.",
  cancellations:
    "You can cancel anytime to prevent future renewals. Access continues until the end of the paid period, then moves to Free.",
  nonRefundable: "After the first-time refund window, all payments are non-refundable.",
  refundHelp: "To request a refund, go to /help.",
} as const;

export const BILLING_POLICY_ITEMS = [
  BILLING_POLICY.moneyBack,
  BILLING_POLICY.planChanges,
  BILLING_POLICY.cancellations,
  BILLING_POLICY.refundHelp,
] as const;

export function planRank(planId: string | null | undefined): number {
  if (!planId) return 0;
  return TIER_RANK[basePlanId(planId)] ?? 0;
}

export function billingCycleOf(planId: string | null | undefined): BillingCycle {
  return planId?.endsWith("-yearly") ? "yearly" : "monthly";
}

/** Classify a plan switch as upgrade, downgrade, or same. */
export function classifyPlanChange(
  fromPlanId: string | null | undefined,
  toPlanId: string,
): PlanChangeKind {
  if (!fromPlanId || fromPlanId === "free") {
    return toPlanId === "free" ? "same" : "upgrade";
  }
  if (fromPlanId === toPlanId) return "same";

  const fromRank = planRank(fromPlanId);
  const toRank = planRank(toPlanId);
  if (toRank > fromRank) return "upgrade";
  if (toRank < fromRank) return "downgrade";

  const fromYearly = fromPlanId.endsWith("-yearly");
  const toYearly = toPlanId.endsWith("-yearly");
  if (!fromYearly && toYearly) return "upgrade";
  if (fromYearly && !toYearly) return "downgrade";
  return "same";
}

export function periodMsForPlan(planId: string | null | undefined): number {
  return billingCycleOf(planId) === "yearly"
    ? 365 * 24 * 60 * 60 * 1000
    : 30 * 24 * 60 * 60 * 1000;
}

export function defaultPeriodEnd(
  planId: string | null | undefined,
  from: Date = new Date(),
): Date {
  return new Date(from.getTime() + periodMsForPlan(planId));
}

/**
 * Prorated upgrade charge (INR). Kept for order/API compatibility; plan changes
 * for existing subscribers are scheduled at renewal instead of charged mid-cycle.
 */
export function proratedUpgradeAmount(
  fromPlanId: string,
  toPlanId: string,
  periodEndIso: string | null | undefined,
  now: Date = new Date(),
): number {
  const from = getPlanById(fromPlanId);
  const to = getPlanById(toPlanId);
  if (to.price <= from.price && classifyPlanChange(fromPlanId, toPlanId) !== "upgrade") {
    return 0;
  }

  const periodEnd = periodEndIso ? new Date(periodEndIso) : defaultPeriodEnd(fromPlanId, now);
  const periodMs = periodMsForPlan(fromPlanId);
  const remainingMs = Math.max(0, periodEnd.getTime() - now.getTime());
  const fraction = periodMs > 0 ? Math.min(1, remainingMs / periodMs) : 1;

  const credit = Math.round(from.price * fraction);
  const chargeForRemainder = Math.round(to.price * fraction);
  const delta = chargeForRemainder - credit;

  if (delta > 0) return delta;
  return to.price > from.price ? Math.max(1, to.price - from.price) : 0;
}

export function formatPlanChangeCta(
  kind: PlanChangeKind,
  plan: PricingPlan,
  opts?: { effectiveOn?: string | null },
): string {
  const when = formatBillingDate(opts?.effectiveOn);
  if (kind === "upgrade") return `Upgrade to ${plan.name} on ${when}`;
  if (kind === "downgrade") return `Downgrade to ${plan.name} on ${when}`;
  return `Switch to ${plan.name} on ${when}`;
}

export function isPaidPlanId(planId: string | null | undefined): boolean {
  if (!planId || planId === "free") return false;
  return ALL_PLANS.some((p) => p.id === planId) || Boolean(TIER_RANK[basePlanId(planId)]);
}

export function formatBillingDate(iso: string | null | undefined): string {
  if (!iso) return "next renewal";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "next renewal";
  }
}
