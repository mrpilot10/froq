import type { MerchantProductKind, ProductStatus } from "@/lib/supabase/database.types";
import type { MerchantProduct } from "./types";

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
}

export type Entitlements = Record<MerchantProduct, ProductEntitlement | null>;

export const EMPTY_ENTITLEMENTS: Entitlements = { loyalty: null, queue: null };

/** True when the merchant owns an active subscription for this product. */
export function isProductEnabled(
  entitlements: Entitlements,
  product: MerchantProduct,
): boolean {
  const entitlement = entitlements[product];
  return Boolean(entitlement && entitlement.status === "active");
}

/** True when the product is owned but its onboarding block hasn't finished. */
export function productNeedsOnboarding(
  entitlements: Entitlements,
  product: MerchantProduct,
): boolean {
  const entitlement = entitlements[product];
  return Boolean(entitlement && entitlement.status === "active" && !entitlement.onboarded);
}

/** Build the entitlements map from raw `merchant_products` rows. */
export function entitlementsFromRows(
  rows: Array<{
    product: MerchantProductKind;
    plan_id: string | null;
    status: ProductStatus;
    onboarded_at: string | null;
  }>,
): Entitlements {
  const map: Entitlements = { loyalty: null, queue: null };
  for (const row of rows) {
    map[row.product] = {
      product: row.product,
      planId: row.plan_id,
      status: row.status,
      onboarded: row.onboarded_at != null,
    };
  }
  return map;
}
