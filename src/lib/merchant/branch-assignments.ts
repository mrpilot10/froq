import type { MerchantProduct } from "./types";
import {
  loyaltyPlanLimits,
  menuPlanLimits,
  QUEUE_TRIAL_LIMITS,
  queuePlanLimits,
  RESERVATION_TRIAL_LIMITS,
  reservationPlanLimits,
} from "./plan-limits";
import {
  isProductEnabled,
  isTrialActive,
  type Entitlements,
  type ProductEntitlement,
} from "./entitlements";

/** Row shape stored in `product_branch_assignments`. */
export type ProductBranchAssignmentStatus = "active" | "inactive";

export interface ProductBranchAssignment {
  product: MerchantProduct;
  branchId: string;
  status: ProductBranchAssignmentStatus;
}

/** Active branch ids keyed by product. Missing product → no activations. */
export type ProductBranchMap = Partial<Record<MerchantProduct, string[]>>;

export function buildProductBranchMap(
  rows: ReadonlyArray<{ product: MerchantProduct; branchId: string; status: string }>,
): ProductBranchMap {
  const map: ProductBranchMap = {};
  for (const row of rows) {
    if (row.status !== "active") continue;
    const list = map[row.product] ?? (map[row.product] = []);
    list.push(row.branchId);
  }
  return map;
}

/** Branches marked active for a product (empty when none assigned yet). */
export function activeBranchIdsForProduct(
  map: ProductBranchMap | null | undefined,
  product: MerchantProduct,
): string[] {
  return map?.[product] ?? [];
}

/**
 * Hard cap on how many branches this product may activate under the current
 * entitlement. Creation of global branches is uncapped — only activation is.
 */
export function maxActiveBranchesForProduct(
  product: MerchantProduct,
  entitlement: ProductEntitlement | null | undefined,
): number {
  if (isTrialActive(entitlement) && !entitlement?.planId) {
    if (product === "queue") return QUEUE_TRIAL_LIMITS.maxBranches;
    if (product === "reservation") return RESERVATION_TRIAL_LIMITS.maxBranches;
    // Menu / loyalty trials meter against the entry paid tier.
  }

  const planId = entitlement?.planId;
  if (product === "queue") return queuePlanLimits(planId).maxBranches;
  if (product === "reservation") return reservationPlanLimits(planId).maxBranches;
  if (product === "menu") return menuPlanLimits(planId).maxBranches;
  return loyaltyPlanLimits(planId).maxBranches;
}

/** Plan-limit helper that looks the entitlement up from the full map. */
export function maxActiveBranches(
  product: MerchantProduct,
  entitlements: Entitlements,
): number {
  return maxActiveBranchesForProduct(product, entitlements[product]);
}

export function productBranchLimitError(
  product: MerchantProduct,
  maxBranches: number,
): string {
  const label =
    product === "queue"
      ? "Waitlist"
      : product === "reservation"
        ? "Reservations"
        : product === "menu"
          ? "AI Menu"
          : "Loyalty";
  return `Your ${label} plan allows only ${maxBranches} active ${
    maxBranches === 1 ? "branch" : "branches"
  }. Upgrade to activate more.`;
}

/**
 * Message shown when a global branch was created but the product was already
 * at its activation cap — the branch still exists for other products.
 */
export function branchCreatedUnassignedMessage(maxBranches: number): string {
  return `Branch created successfully. Your current plan allows only ${maxBranches} active ${
    maxBranches === 1 ? "branch" : "branches"
  } for this product. Upgrade your plan to activate this branch.`;
}

/**
 * Whether a product can still activate another branch under its plan.
 * Disabled / unowned products have zero slots.
 */
export function canActivateAnotherBranch(
  product: MerchantProduct,
  entitlements: Entitlements,
  map: ProductBranchMap,
): boolean {
  if (!isProductEnabled(entitlements, product) && !isTrialActive(entitlements[product])) {
    // Preview products (menu) still enforce starter caps while unlocked.
    if (product !== "menu") return false;
  }
  const active = activeBranchIdsForProduct(map, product).length;
  return active < maxActiveBranches(product, entitlements);
}
