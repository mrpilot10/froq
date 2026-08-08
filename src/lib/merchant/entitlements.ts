import type { MerchantProductKind, ProductStatus } from "@/lib/supabase/database.types";
import type { MerchantProduct } from "./types";
import { MENU_PREVIEW } from "./feature-flags";
import { isFreePlanId } from "./pricing";

/**
 * Live per-merchant entitlement for a single product. Combines the purchase
 * record (from `merchant_products`) with onboarding state. The static plan
 * catalog (name / price / features) still lives in MERCHANT_PLANS.
 */
export interface ProductEntitlement {
  product: MerchantProduct;
  planId: string | null;
  status: ProductStatus;
  onboarded: boolean;
  pendingPlanId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  /** Set once, and kept forever: one free trial per merchant per product. */
  trialStartedAt: string | null;
  trialEndsAt: string | null;
}

export type Entitlements = Record<MerchantProduct, ProductEntitlement | null>;

export const EMPTY_ENTITLEMENTS: Entitlements = {
  loyalty: null,
  queue: null,
  reservation: null,
  menu: null,
};

/** Length of the free trial offered on the product paywall. */
export const TRIAL_DAYS = 7;

const DAY_MS = 86_400_000;

function endsAtMs(entitlement: ProductEntitlement): number | null {
  if (!entitlement.trialEndsAt) return null;
  const ms = Date.parse(entitlement.trialEndsAt);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * A trial row carries no plan_id. Once the merchant pays, plan_id wins and the
 * trial clock stops mattering.
 */
function isTrialRow(entitlement: ProductEntitlement): boolean {
  return !entitlement.planId && entitlement.trialEndsAt != null;
}

/** Merchant is inside an unexpired free trial (and hasn't paid yet). */
export function isTrialActive(entitlement: ProductEntitlement | null | undefined): boolean {
  if (!entitlement || !isTrialRow(entitlement)) return false;
  const ends = endsAtMs(entitlement);
  return ends != null && ends > Date.now();
}

/** Trial ran out and no plan was purchased — the product locks. */
export function isTrialExpired(entitlement: ProductEntitlement | null | undefined): boolean {
  if (!entitlement || !isTrialRow(entitlement)) return false;
  const ends = endsAtMs(entitlement);
  return ends != null && ends <= Date.now();
}

/** True once a trial has been started, whether or not it's still running. */
export function hasUsedTrial(entitlement: ProductEntitlement | null | undefined): boolean {
  return Boolean(entitlement?.trialStartedAt);
}

/** Whole days remaining, rounded up. 0 once the trial has lapsed. */
export function trialDaysLeft(entitlement: ProductEntitlement | null | undefined): number {
  if (!entitlement) return 0;
  const ends = endsAtMs(entitlement);
  if (ends == null) return 0;
  return Math.max(0, Math.ceil((ends - Date.now()) / DAY_MS));
}

/**
 * True when the merchant can use this product right now — an active paid plan,
 * or a trial that hasn't run out. Expiry is derived here rather than written by
 * a cron so a lapsed trial can never keep granting access.
 */
export function isProductEnabled(
  entitlements: Entitlements,
  product: MerchantProduct,
): boolean {
  // AI Menu can't be bought yet, so the paywall would lock out the preview.
  if (product === "menu") return MENU_PREVIEW;
  const entitlement = entitlements[product];
  if (!entitlement || entitlement.status !== "active") return false;
  if (isTrialRow(entitlement)) return isTrialActive(entitlement);
  return true;
}

/**
 * True when the product is usable but its onboarding block hasn't finished.
 * A lapsed trial is not usable, so it falls through to the paywall instead of
 * dropping the merchant back into the setup wizard.
 */
export function productNeedsOnboarding(
  entitlements: Entitlements,
  product: MerchantProduct,
): boolean {
  const entitlement = entitlements[product];
  return Boolean(
    entitlement && !entitlement.onboarded && isProductEnabled(entitlements, product),
  );
}

/** Paid plan that is still in its current billing period. */
export function isOnPaidPlan(entitlement: ProductEntitlement | null | undefined): boolean {
  return Boolean(
    entitlement &&
      entitlement.status === "active" &&
      !isFreePlanId(entitlement.planId),
  );
}

/** Build the entitlements map from raw `merchant_products` rows. */
export function entitlementsFromRows(
  rows: Array<{
    product: MerchantProductKind;
    plan_id: string | null;
    status: ProductStatus;
    onboarded_at: string | null;
    pending_plan_id?: string | null;
    cancel_at_period_end?: boolean | null;
    current_period_end?: string | null;
    trial_started_at?: string | null;
    trial_ends_at?: string | null;
  }>,
): Entitlements {
  const map: Entitlements = { ...EMPTY_ENTITLEMENTS };
  for (const row of rows) {
    map[row.product] = {
      product: row.product,
      planId: row.plan_id,
      status: row.status,
      onboarded: row.onboarded_at != null,
      pendingPlanId: row.pending_plan_id ?? null,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      currentPeriodEnd: row.current_period_end ?? null,
      trialStartedAt: row.trial_started_at ?? null,
      trialEndsAt: row.trial_ends_at ?? null,
    };
  }
  return map;
}
