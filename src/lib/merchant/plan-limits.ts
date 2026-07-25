import { basePlanId } from "./pricing";

export type LoyaltyPlanLimits = {
  maxBranches: number;
  maxCustomers: number;
};

/**
 * Hard caps for the loyalty product (matches pricing cards).
 * Yearly plan ids resolve via basePlanId (e.g. growth-yearly → growth).
 */
export const LOYALTY_PLAN_LIMITS = {
  free: { maxBranches: 1, maxCustomers: 50 },
  starter: { maxBranches: 1, maxCustomers: 500 },
  growth: { maxBranches: 3, maxCustomers: 2000 },
  pro: { maxBranches: 10, maxCustomers: 10000 },
} as const satisfies Record<string, LoyaltyPlanLimits>;

/**
 * Resolve loyalty caps for a merchant_products.plan_id.
 * - explicit `free` → Free tier
 * - null / unknown while setting up → Starter (entry paid tier)
 */
export function loyaltyPlanLimits(
  planId: string | null | undefined,
): LoyaltyPlanLimits {
  if (planId === "free") return LOYALTY_PLAN_LIMITS.free;
  if (!planId) return LOYALTY_PLAN_LIMITS.starter;
  const base = basePlanId(planId);
  return (
    LOYALTY_PLAN_LIMITS[base as keyof typeof LOYALTY_PLAN_LIMITS] ??
    LOYALTY_PLAN_LIMITS.starter
  );
}

export function branchLimitError(maxBranches: number): string {
  return `Branch limit reached (${maxBranches}). Upgrade your plan to add more.`;
}

export function customerLimitError(maxCustomers: number): string {
  return `Customer limit reached (${maxCustomers.toLocaleString("en-IN")}). Upgrade your plan to add more.`;
}
