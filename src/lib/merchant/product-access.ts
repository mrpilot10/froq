import type { MemberRole, MerchantProduct } from "./types";

/**
 * True when the signed-in teammate may open this product.
 * Owners always can; empty productIds means all products.
 */
export function memberCanAccessProduct(
  role: MemberRole,
  productIds: MerchantProduct[],
  product: MerchantProduct,
): boolean {
  if (role === "owner") return true;
  if (productIds.length === 0) return true;
  return productIds.includes(product);
}

/**
 * Products visible in the rail / menu for this member.
 * Empty productIds (or owner) → full catalog.
 */
export function accessibleProducts(
  role: MemberRole,
  productIds: MerchantProduct[],
  catalog: readonly MerchantProduct[] = ["loyalty", "queue", "reservation"],
): MerchantProduct[] {
  if (role === "owner" || productIds.length === 0) return [...catalog];
  return catalog.filter((product) => productIds.includes(product));
}

const MEMBER_PRODUCT_SET = new Set<MerchantProduct>(["loyalty", "queue", "reservation"]);

/** Keep only known product ids; empty input stays empty (= all). */
export function normalizeMemberProductIds(
  ids: readonly string[] | null | undefined,
): MerchantProduct[] {
  if (!ids || ids.length === 0) return [];
  return ids.filter((id): id is MerchantProduct => MEMBER_PRODUCT_SET.has(id as MerchantProduct));
}
