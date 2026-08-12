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

export type ReservationPlanLimits = {
  maxBranches: number;
  /** Reservations (bookings created) allowed per billing month. */
  maxReservationsPerMonth: number;
};

export type MenuPlanLimits = {
  maxBranches: number;
  /**
   * Monthly AI Credits for the Menu product billing cycle.
   * All AI features (chat, descriptions, images, translations, marketing)
   * draw from this single pool. See `lib/ai/credits-config.ts` for costs.
   */
  maxAiCreditsPerMonth: number;
};

/**
 * Hard caps for AI Menu (matches pricing cards).
 * Ids are product-prefixed so they never collide with the other products' tiers.
 */
export const MENU_PLAN_LIMITS = {
  "menu-starter": {
    maxBranches: 1,
    maxAiCreditsPerMonth: 5_000,
  },
  "menu-growth": {
    maxBranches: 3,
    maxAiCreditsPerMonth: 20_000,
  },
  "menu-pro": {
    maxBranches: 10,
    maxAiCreditsPerMonth: 100_000,
  },
  /** Legacy single-tier id → Growth. */
  menu: {
    maxBranches: 3,
    maxAiCreditsPerMonth: 20_000,
  },
} as const satisfies Record<string, MenuPlanLimits>;

/**
 * Hard caps for Reservations (matches pricing cards).
 * Ids are product-prefixed so they never collide with loyalty / queue tiers.
 */
export const RESERVATION_PLAN_LIMITS = {
  "reservation-starter": { maxBranches: 1, maxReservationsPerMonth: 500 },
  "reservation-growth": { maxBranches: 3, maxReservationsPerMonth: 2000 },
  "reservation-pro": { maxBranches: 10, maxReservationsPerMonth: 10000 },
  /** Legacy single-tier id → Growth. */
  reservation: { maxBranches: 3, maxReservationsPerMonth: 2000 },
} as const satisfies Record<string, ReservationPlanLimits>;

/**
 * Caps while on the free Queue trial. Tickets are counted for the whole trial,
 * not per month — the trial is shorter than a billing month. The ticket cap is
 * shown on the History usage card; limit-reached errors still avoid quoting it.
 */
export const QUEUE_TRIAL_LIMITS = {
  maxBranches: 3,
  maxTicketsPerTrial: 1000,
} as const;

/**
 * Caps while on the free Reservations trial. Counted for the whole trial
 * (mirrors the sidebar capacity meter).
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
 * Resolve AI Menu caps for a merchant_products.plan_id.
 * Unknown / null → Starter (entry paid tier), which is also what the
 * pre-launch preview meters against.
 */
export function menuPlanLimits(
  planId: string | null | undefined,
): MenuPlanLimits {
  if (!planId) return MENU_PLAN_LIMITS["menu-starter"];
  const base = basePlanId(planId);
  return (
    MENU_PLAN_LIMITS[base as keyof typeof MENU_PLAN_LIMITS] ??
    MENU_PLAN_LIMITS["menu-starter"]
  );
}

/**
 * Legacy helper: most-generous physical-branch allowance across products.
 *
 * Prefer {@link maxActiveBranchesForProduct} from branch-assignments.ts —
 * global branch creation is uncapped; each product meters its own activations.
 */
export function maxBranchesFor(input: {
  loyaltyPlanId: string | null | undefined;
  queuePlanId?: string | null;
  queueEnabled?: boolean;
  queueTrialActive?: boolean;
  menuPlanId?: string | null;
  menuEnabled?: boolean;
  reservationPlanId?: string | null;
  reservationEnabled?: boolean;
  reservationTrialActive?: boolean;
}): number {
  let max = loyaltyPlanLimits(input.loyaltyPlanId).maxBranches;
  if (input.queueTrialActive) {
    max = Math.max(max, QUEUE_TRIAL_LIMITS.maxBranches);
  } else if (input.queueEnabled) {
    max = Math.max(max, queuePlanLimits(input.queuePlanId).maxBranches);
  }
  if (input.reservationTrialActive) {
    max = Math.max(max, RESERVATION_TRIAL_LIMITS.maxBranches);
  } else if (input.reservationEnabled) {
    max = Math.max(
      max,
      reservationPlanLimits(input.reservationPlanId).maxBranches,
    );
  }
  if (input.menuEnabled) {
    max = Math.max(max, menuPlanLimits(input.menuPlanId).maxBranches);
  }
  return max;
}

export function branchLimitError(maxBranches: number): string {
  return `Branch limit reached (${maxBranches}). Upgrade your plan to activate more.`;
}

export function customerLimitError(maxCustomers: number): string {
  return `Customer limit reached (${maxCustomers.toLocaleString("en-IN")}). Upgrade your plan to add more.`;
}

export function ticketLimitError(maxTickets: number): string {
  return `Queue ticket limit reached (${maxTickets.toLocaleString("en-IN")}/month). Upgrade your plan to add more.`;
}

export function reservationLimitError(maxReservations: number): string {
  return `Reservation limit reached (${maxReservations.toLocaleString("en-IN")}/month). Upgrade your plan to add more.`;
}

/** Quotes remaining AI Credits; bulk actions are all-or-nothing up front. */
export function aiCreditsLimitError(
  monthlyTotal: number,
  remaining: number,
  wanted = 1,
): string {
  if (remaining <= 0) {
    return `You've used all your AI Credits. Upgrade your plan or buy more credits — purchased packs have no limit and never expire while Menu is active.`;
  }
  return `Not enough AI Credits — need ${wanted.toLocaleString("en-IN")}, only ${remaining.toLocaleString("en-IN")} left. Upgrade your plan or buy more credits.`;
}

/** @deprecated Prefer aiCreditsLimitError. */
export function aiGenerationLimitError(
  maxGenerations: number,
  remaining: number,
  wanted = 1,
): string {
  return aiCreditsLimitError(maxGenerations, remaining, wanted);
}

/** @deprecated Prefer aiCreditsLimitError. */
export function aiDishLimitError(maxDishes: number, remaining: number): string {
  return aiCreditsLimitError(maxDishes, remaining);
}

/** @deprecated Prefer aiCreditsLimitError. */
export function aiReplyLimitError(maxReplies: number): string {
  return aiCreditsLimitError(maxReplies, 0);
}

/** @deprecated Prefer aiCreditsLimitError. */
export function conversationLimitError(maxConversations: number): string {
  return aiReplyLimitError(maxConversations);
}

/** Trial caps are intentionally not quoted back to the merchant. */
export function trialTicketLimitError(): string {
  return "Your free trial has reached its queue limit. Upgrade to keep seating guests.";
}

export function trialBookingLimitError(): string {
  return "Your free trial has reached its reservation limit. Upgrade to keep taking bookings.";
}

/**
 * Resolve reservation caps for a merchant_products.plan_id.
 * Unknown / null → Starter (entry paid tier).
 */
export function reservationPlanLimits(
  planId: string | null | undefined,
): ReservationPlanLimits {
  if (!planId) return RESERVATION_PLAN_LIMITS["reservation-starter"];
  const base = basePlanId(planId);
  return (
    RESERVATION_PLAN_LIMITS[base as keyof typeof RESERVATION_PLAN_LIMITS] ??
    RESERVATION_PLAN_LIMITS["reservation-starter"]
  );
}
