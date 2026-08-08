import { basePlanId, plansForProduct, type BillingCycle, type PricingPlan } from "./pricing";
import {
  LOYALTY_PLAN_LIMITS,
  MENU_PLAN_LIMITS,
  QUEUE_PLAN_LIMITS,
  QUEUE_TRIAL_LIMITS,
  RESERVATION_PLAN_LIMITS,
  RESERVATION_TRIAL_LIMITS,
} from "./plan-limits";
import type { MerchantProduct } from "./types";

/** Self-serve tiers, cheapest first. Mirrors the pricing table order. */
const TIER_ORDER: Record<MerchantProduct, readonly string[]> = {
  loyalty: ["starter", "growth", "pro"],
  queue: ["queue-starter", "queue-growth", "queue-pro"],
  reservation: ["reservation-starter", "reservation-growth", "reservation-pro"],
  menu: ["menu-starter", "menu-growth", "menu-pro"],
};

/**
 * Plan to display / meter when `merchant_products.plan_id` is null.
 * Loyalty was seeded active without a plan for a long time — enforcement
 * already uses Starter caps; the UI should match.
 */
export function effectivePlanId(
  product: MerchantProduct,
  planId: string | null | undefined,
): string | null {
  if (planId) return planId;
  if (product === "loyalty") return "starter";
  return null;
}

/**
 * A second capped volume, for products that meter more than one thing.
 * AI Menu meters a single monthly AI Credits pool for every AI feature.
 */
interface SecondaryAllowance {
  metric: number;
  heading: string;
  slotOne: string;
  slotMany: string;
}

/**
 * The two numbers a merchant actually shops on, per product. Branches are
 * shared; the second metric is customers / tickets / reservations / AI replies.
 */
interface Allowance {
  branches: number;
  /** 0 when the tier's second metric is unlimited. */
  metric: number;
  metricOne: string;
  metricMany: string;
  /** Short noun for capacity copy ("customer", "ticket", "reservation"). */
  slotOne: string;
  slotMany: string;
  secondary?: SecondaryAllowance;
}

function allowanceFor(product: MerchantProduct, baseId: string): Allowance | null {
  if (product === "menu") {
    const limits = MENU_PLAN_LIMITS[baseId as keyof typeof MENU_PLAN_LIMITS];
    if (!limits) return null;
    return {
      branches: limits.maxBranches,
      metric: limits.maxAiCreditsPerMonth,
      metricOne: "AI Credit / mo",
      metricMany: "AI Credits / mo",
      slotOne: "credit",
      slotMany: "credits",
    };
  }
  if (product === "reservation") {
    const limits = RESERVATION_PLAN_LIMITS[baseId as keyof typeof RESERVATION_PLAN_LIMITS];
    if (!limits) return null;
    return {
      branches: limits.maxBranches,
      metric: limits.maxReservationsPerMonth,
      metricOne: "reservation / mo",
      metricMany: "reservations / mo",
      slotOne: "reservation",
      slotMany: "reservations",
    };
  }
  if (product === "queue") {
    const limits = QUEUE_PLAN_LIMITS[baseId as keyof typeof QUEUE_PLAN_LIMITS];
    if (!limits) return null;
    return {
      branches: limits.maxBranches,
      metric: limits.maxTicketsPerMonth,
      metricOne: "ticket / mo",
      metricMany: "tickets / mo",
      slotOne: "ticket",
      slotMany: "tickets",
    };
  }
  const limits = LOYALTY_PLAN_LIMITS[baseId as keyof typeof LOYALTY_PLAN_LIMITS];
  if (!limits) return null;
  return {
    branches: limits.maxBranches,
    metric: limits.maxCustomers,
    metricOne: "customer",
    metricMany: "customers",
    slotOne: "customer",
    slotMany: "customers",
  };
}

function count(value: number, one: string, many: string): string {
  return `${value.toLocaleString("en-IN")} ${value === 1 ? one : many}`;
}

function titleCount(value: number, one: string, many: string): string {
  const noun = value === 1 ? one : many;
  return `${value.toLocaleString("en-IN")} ${noun[0].toUpperCase()}${noun.slice(1)}`;
}

export interface PlanUpgradeSummary {
  /** Tier name in force ("Growth"), or null when nothing is active. */
  currentTier: string | null;
  /** Price of the plan in force. Null while unowned or on a free trial. */
  currentPriceLabel: string | null;
  currentCycleLabel: string;
  /** Human cycle for active cards ("/month", "/year"). */
  currentCycleLong: string;
  /** Included allowances for the tier in force, e.g. "1 Branch · 500 Customers". */
  currentLimitsLabel: string | null;
  /** Cheapest tier above the current one, or null at the top. */
  nextPlan: PricingPlan | null;
  /**
   * What moving to `nextPlan` buys. Deltas ("7 more branches") when a plan is
   * already in force, plain inclusions ("1 branch") when there isn't one —
   * "1 more branch" would be nonsense from a standing start.
   */
  nextHighlights: string[];
}

/**
 * Everything the plan widgets need to show a real current price and a concrete
 * reason to upgrade, derived from the merchant's live entitlement rather than a
 * hard-coded catalog.
 */
export function planUpgradeSummary(input: {
  product: MerchantProduct;
  /**
   * Live `merchant_products.plan_id`. Null covers "never bought" and "on a free
   * trial" for most products; loyalty null resolves to Starter via
   * {@link effectivePlanId}.
   */
  planId: string | null | undefined;
}): PlanUpgradeSummary {
  const resolvedId = effectivePlanId(input.product, input.planId);
  const billing: BillingCycle = resolvedId?.endsWith("-yearly") ? "yearly" : "monthly";
  const plans = plansForProduct(input.product, billing);
  const order = TIER_ORDER[input.product];
  const byTier = (tier: string) =>
    plans.find((plan) => basePlanId(plan.id) === tier) ?? null;

  const base = resolvedId ? basePlanId(resolvedId) : null;
  const index = base ? order.indexOf(base) : -1;
  const current = index >= 0 ? byTier(order[index]) : null;
  const nextTier = index >= 0 ? order[index + 1] : order[0];
  const nextPlan = nextTier ? byTier(nextTier) : null;

  let nextHighlights: string[] = [];
  if (nextPlan && nextTier) {
    const to = allowanceFor(input.product, nextTier);
    const from = current ? allowanceFor(input.product, order[index]) : null;
    if (to && from) {
      const branches = to.branches - from.branches;
      const metric = to.metric - from.metric;
      if (branches > 0) {
        nextHighlights.push(`${count(branches, "more branch", "more branches")}`);
      }
      if (metric > 0) {
        nextHighlights.push(
          `${metric.toLocaleString("en-IN")} more ${metric === 1 ? to.metricOne : to.metricMany}`,
        );
      }
      const second =
        to.secondary && from.secondary
          ? to.secondary.metric - from.secondary.metric
          : 0;
      if (second > 0 && to.secondary) {
        nextHighlights.push(
          `${second.toLocaleString("en-IN")} more ${
            second === 1 ? to.secondary.slotOne : to.secondary.slotMany
          }`,
        );
      }
    } else if (to) {
      nextHighlights = [
        count(to.branches, "branch", "branches"),
        to.metric > 0 ? count(to.metric, to.metricOne, to.metricMany) : null,
        to.secondary
          ? count(to.secondary.metric, to.secondary.slotOne, to.secondary.slotMany)
          : null,
      ].filter((item): item is string => item !== null);
    }
  }

  const isFree = base === "free";
  const currentAllowance =
    isFree
      ? allowanceFor(input.product, "free") ?? allowanceFor(input.product, order[0])
      : index >= 0
        ? allowanceFor(input.product, order[index])
        : null;
  const currentLimitsLabel = currentAllowance
    ? [
        titleCount(currentAllowance.branches, "branch", "branches"),
        currentAllowance.secondary
          ? titleCount(
              currentAllowance.secondary.metric,
              currentAllowance.secondary.slotOne,
              currentAllowance.secondary.slotMany,
            )
          : null,
        currentAllowance.metric > 0
          ? titleCount(currentAllowance.metric, currentAllowance.metricOne, currentAllowance.metricMany)
          : null,
      ]
        .filter((item): item is string => item !== null)
        .join(" · ")
    : null;

  return {
    currentTier: isFree ? "Free" : (current?.name ?? null),
    currentPriceLabel: isFree ? "₹0" : (current?.priceLabel ?? null),
    currentCycleLabel: billing === "yearly" ? "/yr" : "/mo",
    currentCycleLong: billing === "yearly" ? "/year" : "/month",
    currentLimitsLabel,
    nextPlan,
    nextHighlights,
  };
}

export type PlanUsageUrgency = "low" | "mid" | "high";

export interface PlanUsageSnapshot {
  used: number;
  limit: number;
  percent: number;
  label: string;
  /** Short noun for the meter heading ("Queue", "Customers"). */
  heading: string;
  urgency: PlanUsageUrgency;
  helper: string | null;
}

export interface PlanBranchUsage {
  used: number;
  limit: number;
  /** e.g. "Branches 2/3" */
  label: string;
  urgency: PlanUsageUrgency;
  helper: string | null;
}

/**
 * Resolve branch + primary-metric caps for the entitlement in force.
 * Trials use trial caps; paid / free tiers use catalog limits.
 */
function capacityAllowance(
  product: MerchantProduct,
  planId: string | null | undefined,
  onTrial = false,
): Allowance | null {
  if (onTrial && !planId) {
    // AI Menu has no separate trial caps — a trial runs on the entry tier.
    if (product === "menu") return allowanceFor("menu", TIER_ORDER.menu[0]);
    if (product === "queue") {
      return {
        branches: QUEUE_TRIAL_LIMITS.maxBranches,
        metric: QUEUE_TRIAL_LIMITS.maxTicketsPerTrial,
        metricOne: "ticket",
        metricMany: "tickets",
        slotOne: "ticket",
        slotMany: "tickets",
      };
    }
    if (product === "reservation") {
      return {
        branches: RESERVATION_TRIAL_LIMITS.maxBranches,
        metric: RESERVATION_TRIAL_LIMITS.maxBookingsPerTrial,
        metricOne: "reservation",
        metricMany: "reservations",
        slotOne: "reservation",
        slotMany: "reservations",
      };
    }
    // Loyalty trial mirrors Starter (same as loyaltyPlanLimits(null)).
    return {
      branches: LOYALTY_PLAN_LIMITS.starter.maxBranches,
      metric: LOYALTY_PLAN_LIMITS.starter.maxCustomers,
      metricOne: "customer",
      metricMany: "customers",
      slotOne: "customer",
      slotMany: "customers",
    };
  }

  const resolvedId = effectivePlanId(product, planId);
  const summaryBase = resolvedId ? basePlanId(resolvedId) : null;
  // AI Menu is live in preview before it can be bought, so an unpaid merchant
  // still has real caps to meter against — the entry tier's. Loyalty null
  // already resolves to Starter via effectivePlanId.
  if (!summaryBase) {
    return product === "menu" ? allowanceFor("menu", TIER_ORDER.menu[0]) : null;
  }

  const freeBase =
    summaryBase === "free"
      ? "free"
      : TIER_ORDER[product].includes(summaryBase)
        ? summaryBase
        : null;
  if (!freeBase) return null;
  return allowanceFor(product, freeBase);
}

function usageUrgency(percent: number): PlanUsageUrgency {
  if (percent < 50) return "low";
  if (percent >= 80) return "high";
  return "mid";
}

function usageHelper(
  remaining: number,
  nounOne: string,
  nounMany: string,
  urgency: PlanUsageUrgency,
): string | null {
  if (urgency !== "high") return null;
  return remaining > 0
    ? `Only ${remaining.toLocaleString("en-IN")} ${
        remaining === 1 ? nounOne : nounMany
      } left`
    : "You're close to your plan limit";
}

/**
 * Branch used/limit for capacity cards ("Branches 2/3").
 */
export function planBranchUsage(input: {
  product: MerchantProduct;
  planId: string | null | undefined;
  branchesUsed?: number | null;
  onTrial?: boolean;
}): PlanBranchUsage | null {
  if (input.branchesUsed == null) return null;
  const allowance = capacityAllowance(input.product, input.planId, input.onTrial);
  if (!allowance || allowance.branches <= 0) return null;
  const used = Math.max(0, input.branchesUsed);
  const percent =
    allowance.branches > 0
      ? Math.min(100, Math.round((used / allowance.branches) * 100))
      : 0;
  const urgency = usageUrgency(percent);
  const remaining = Math.max(0, allowance.branches - used);
  return {
    used,
    limit: allowance.branches,
    label: `Branches ${used.toLocaleString("en-IN")}/${allowance.branches.toLocaleString("en-IN")}`,
    urgency,
    helper: usageHelper(remaining, "branch", "branches", urgency),
  };
}

/**
 * Live capacity against the tier (or trial) in force. Prefers the product's
 * primary metric (customers / tickets); falls back to branches when that metric
 * is unlimited or usage wasn't supplied.
 */
export function planUsageSnapshot(input: {
  product: MerchantProduct;
  planId: string | null | undefined;
  branchesUsed?: number | null;
  metricUsed?: number | null;
  onTrial?: boolean;
}): PlanUsageSnapshot | null {
  const allowance = capacityAllowance(input.product, input.planId, input.onTrial);
  if (!allowance) return null;

  const candidates: Array<{
    used: number;
    limit: number;
    nounOne: string;
    nounMany: string;
    usedLabel: string;
    heading: string;
  }> = [];

  if (allowance.metric > 0 && input.metricUsed != null) {
    const heading =
      input.product === "queue"
        ? "Queue"
        : input.product === "reservation"
          ? "Reservations"
          : input.product === "menu"
            ? "AI Credits"
            : "Customers";
    candidates.push({
      used: input.metricUsed,
      limit: allowance.metric,
      nounOne: allowance.slotOne,
      nounMany: allowance.slotMany,
      usedLabel:
        input.product === "menu"
          ? "AI Credits Used"
          : `${allowance.slotMany[0].toUpperCase()}${allowance.slotMany.slice(1)} Used`,
      heading,
    });
  } else if (input.branchesUsed != null) {
    // Branch capacity only when the product has no countable second metric
    // (or we don't have that usage). Otherwise a 1-branch Starter plan would
    // always read as 100% full.
    candidates.push({
      used: input.branchesUsed,
      limit: allowance.branches,
      nounOne: "branch",
      nounMany: "branches",
      usedLabel: "Branches Used",
      heading: "Branches",
    });
  }
  if (candidates.length === 0) return null;

  const primary = candidates[0];

  const percent =
    primary.limit > 0 ? Math.min(100, Math.round((primary.used / primary.limit) * 100)) : 0;
  const remaining = Math.max(0, primary.limit - primary.used);
  const urgency = usageUrgency(percent);

  return {
    used: primary.used,
    limit: primary.limit,
    percent,
    label: `${primary.used.toLocaleString("en-IN")} / ${primary.limit.toLocaleString("en-IN")} ${primary.usedLabel}`,
    heading: primary.heading,
    urgency,
    helper: usageHelper(remaining, primary.nounOne, primary.nounMany, urgency),
  };
}

/**
 * The product's second capped volume, when it has one. Only AI Menu does today
 * (lifetime AI Generations, on top of monthly guest AI Replies), so every
 * other product returns null and renders one volume meter as before.
 */
export function planSecondaryUsage(input: {
  product: MerchantProduct;
  planId: string | null | undefined;
  secondaryUsed?: number | null;
  /** Override limit (AI Generation credit bank size). */
  secondaryLimit?: number | null;
  onTrial?: boolean;
}): PlanUsageSnapshot | null {
  if (input.secondaryUsed == null) return null;
  const allowance = capacityAllowance(input.product, input.planId, input.onTrial);
  const secondary = allowance?.secondary;
  if (!secondary || secondary.metric <= 0) return null;

  const limit =
    input.secondaryLimit != null && input.secondaryLimit > 0
      ? input.secondaryLimit
      : secondary.metric;
  const used = Math.max(0, input.secondaryUsed);
  const percent = Math.min(100, Math.round((used / limit) * 100));
  const remaining = Math.max(0, limit - used);
  const urgency = usageUrgency(percent);

  return {
    used,
    limit,
    percent,
    label: `${used.toLocaleString("en-IN")} / ${limit.toLocaleString("en-IN")} ${secondary.heading}`,
    heading: secondary.heading,
    urgency,
    helper: usageHelper(remaining, secondary.slotOne, secondary.slotMany, urgency),
  };
}

/**
 * Active-subscription CTA. Named next tier when available; capacity-first copy
 * when usage is high; manage-only on the top tier.
 */
export function planActiveCtaLabel(
  summary: Pick<PlanUpgradeSummary, "nextPlan">,
  urgency: PlanUsageUrgency | null = null,
): string {
  if (!summary.nextPlan) return "Manage Subscription";
  if (urgency === "high") return "Increase Limits";
  return `Upgrade to ${summary.nextPlan.name}`;
}
