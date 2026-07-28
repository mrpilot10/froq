import { basePlanId, plansForProduct, type BillingCycle, type PricingPlan } from "./pricing";
import {
  LOYALTY_PLAN_LIMITS,
  QUEUE_PLAN_LIMITS,
  RESERVATION_PLAN_LIMITS,
} from "./plan-limits";
import type { MerchantProduct } from "./types";

/** Self-serve tiers, cheapest first. Mirrors the pricing table order. */
const TIER_ORDER: Record<MerchantProduct, readonly string[]> = {
  loyalty: ["starter", "growth", "pro"],
  queue: ["queue-starter", "queue-growth", "queue-pro"],
  reservation: ["reservation-starter", "reservation-growth", "reservation-pro"],
};

/**
 * The two numbers a merchant actually shops on, per product. Branches are
 * shared; the second metric is customers for loyalty and tickets for queue.
 */
interface Allowance {
  branches: number;
  /** 0 when the tier's second metric is unlimited (Reservations). */
  metric: number;
  metricOne: string;
  metricMany: string;
}

function allowanceFor(product: MerchantProduct, baseId: string): Allowance | null {
  if (product === "reservation") {
    const limits = RESERVATION_PLAN_LIMITS[baseId as keyof typeof RESERVATION_PLAN_LIMITS];
    if (!limits) return null;
    return {
      branches: limits.maxBranches,
      metric: 0,
      metricOne: "booking",
      metricMany: "bookings",
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
    };
  }
  const limits = LOYALTY_PLAN_LIMITS[baseId as keyof typeof LOYALTY_PLAN_LIMITS];
  if (!limits) return null;
  return {
    branches: limits.maxBranches,
    metric: limits.maxCustomers,
    metricOne: "customer",
    metricMany: "customers",
  };
}

function count(value: number, one: string, many: string): string {
  return `${value.toLocaleString("en-IN")} ${value === 1 ? one : many}`;
}

export interface PlanUpgradeSummary {
  /** Tier name in force ("Growth"), or null when nothing is active. */
  currentTier: string | null;
  /** Price of the plan in force. Null while unowned or on a free trial. */
  currentPriceLabel: string | null;
  currentCycleLabel: string;
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
   * Live `merchant_products.plan_id`. Null covers both "never bought" and "on a
   * free trial" — neither has a tier, and both upgrade into the entry plan.
   */
  planId: string | null | undefined;
}): PlanUpgradeSummary {
  const billing: BillingCycle = input.planId?.endsWith("-yearly") ? "yearly" : "monthly";
  const plans = plansForProduct(input.product, billing);
  const order = TIER_ORDER[input.product];
  const byTier = (tier: string) =>
    plans.find((plan) => basePlanId(plan.id) === tier) ?? null;

  const base = input.planId ? basePlanId(input.planId) : null;
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
    } else if (to) {
      nextHighlights = [
        count(to.branches, "branch", "branches"),
        to.metric > 0 ? count(to.metric, to.metricOne, to.metricMany) : null,
      ].filter((item): item is string => item !== null);
    }
  }

  const isFree = base === "free";
  return {
    currentTier: isFree ? "Free" : (current?.name ?? null),
    currentPriceLabel: isFree ? "₹0" : (current?.priceLabel ?? null),
    currentCycleLabel: billing === "yearly" ? "/yr" : "/mo",
    nextPlan,
    nextHighlights,
  };
}
