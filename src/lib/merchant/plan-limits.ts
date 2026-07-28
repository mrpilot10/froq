import { basePlanId } from "./pricing";

export type LoyaltyPlanLimits = {
  maxBranches: number;
  maxCustomers: number;
};

export type QueuePlanLimits = {
  maxBranches: number;
  /** Queue tickets (joins) allowed per billing month. */
  maxTicketsPerMonth: number;
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
 * Hard caps for Queue Management (matches pricing cards).
 * Ids are product-prefixed so they never collide with loyalty tiers.
 */
export const QUEUE_PLAN_LIMITS = {
  "queue-starter": { maxBranches: 1, maxTicketsPerMonth: 2000 },
  "queue-growth": { maxBranches: 3, maxTicketsPerMonth: 5000 },
  "queue-pro": { maxBranches: 10, maxTicketsPerMonth: 20000 },
  /** Legacy single-tier id → Growth. */
  queue: { maxBranches: 3, maxTicketsPerMonth: 5000 },
} as const satisfies Record<string, QueuePlanLimits>;

/**
 * Branch caps for Reservations (matches pricing cards). Booking requests are
 * unlimited on every tier, so branches are the only allowance that changes.
 */
export const RESERVATION_PLAN_LIMITS = {
  "reservation-starter": { maxBranches: 1 },
  "reservation-growth": { maxBranches: 3 },
  "reservation-pro": { maxBranches: 10 },
  /** Legacy single-tier id → Growth. */
  reservation: { maxBranches: 3 },
} as const satisfies Record<string, { maxBranches: number }>;

/**
 * Caps while on the free Queue trial. Tickets are counted for the whole trial,
 * not per month — the trial is shorter than a billing month. These numbers are
 * deliberately not surfaced in the UI.
 */
export const QUEUE_TRIAL_LIMITS = {
  maxBranches: 3,
  maxTicketsPerTrial: 1000,
} as const;

/**
 * Caps while on the free Reservations trial. Counted for the whole trial, and
 * deliberately not surfaced in the UI.
 */
export const RESERVATION_TRIAL_LIMITS = {
  maxBranches: 3,
  maxBookingsPerTrial: 500,
} as const;

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

/**
 * Resolve queue caps for a merchant_products.plan_id.
 * Unknown / null → Starter (entry paid tier).
 */
export function queuePlanLimits(
  planId: string | null | undefined,
): QueuePlanLimits {
  if (!planId) return QUEUE_PLAN_LIMITS["queue-starter"];
  const base = basePlanId(planId);
  return (
    QUEUE_PLAN_LIMITS[base as keyof typeof QUEUE_PLAN_LIMITS] ??
    QUEUE_PLAN_LIMITS["queue-starter"]
  );
}

/**
 * Branches are shared by both products, so the merchant gets the most generous
 * allowance they're entitled to. Queue only counts while it's usable — a lapsed
 * trial or an unowned product grants nothing.
 */
export function maxBranchesFor(input: {
  loyaltyPlanId: string | null | undefined;
  queuePlanId?: string | null;
  queueEnabled?: boolean;
  queueTrialActive?: boolean;
}): number {
  let max = loyaltyPlanLimits(input.loyaltyPlanId).maxBranches;
  if (input.queueTrialActive) {
    max = Math.max(max, QUEUE_TRIAL_LIMITS.maxBranches);
  } else if (input.queueEnabled) {
    max = Math.max(max, queuePlanLimits(input.queuePlanId).maxBranches);
  }
  return max;
}

export function branchLimitError(maxBranches: number): string {
  return `Branch limit reached (${maxBranches}). Upgrade your plan to add more.`;
}

export function customerLimitError(maxCustomers: number): string {
  return `Customer limit reached (${maxCustomers.toLocaleString("en-IN")}). Upgrade your plan to add more.`;
}

export function ticketLimitError(maxTickets: number): string {
  return `Queue ticket limit reached (${maxTickets.toLocaleString("en-IN")}/month). Upgrade your plan to add more.`;
}

/** Trial caps are intentionally not quoted back to the merchant. */
export function trialTicketLimitError(): string {
  return "Your free trial has reached its queue limit. Upgrade to keep seating guests.";
}

export function trialBookingLimitError(): string {
  return "Your free trial has reached its reservation limit. Upgrade to keep taking bookings.";
}
