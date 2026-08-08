import { MENU_PREVIEW } from "./feature-flags";
import { normalizeMemberRole } from "./roles";
import type { MemberRole, MerchantProduct } from "./types";

const DEFAULT_CATALOG: readonly MerchantProduct[] = [
  "loyalty",
  "queue",
  "reservation",
  ...(MENU_PREVIEW ? (["menu"] as const) : []),
];

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
  catalog: readonly MerchantProduct[] = DEFAULT_CATALOG,
): MerchantProduct[] {
  if (role === "owner" || productIds.length === 0) return [...catalog];
  return catalog.filter((product) => productIds.includes(product));
}

const MEMBER_PRODUCT_SET = new Set<MerchantProduct>([
  "loyalty",
  "queue",
  "reservation",
  "menu",
]);

/** Keep only known product ids; empty input stays empty (= all). */
export function normalizeMemberProductIds(
  ids: readonly string[] | null | undefined,
): MerchantProduct[] {
  if (!ids || ids.length === 0) return [];
  return ids.filter((id): id is MerchantProduct => MEMBER_PRODUCT_SET.has(id as MerchantProduct));
}

/**
 * True when a teammate counts as working a product day to day — they can open
 * it and have actually joined. Use this for rosters ("who served this table?"),
 * not for authorisation, which is `memberCanAccessProduct`.
 *
 * Owners are never invited, so their `acceptedAt` stays null and must not be
 * read as "hasn't joined yet".
 */
export function memberIsProductStaff(
  member: {
    role: string | null | undefined;
    productIds: readonly string[] | null | undefined;
    /** Has logged in at least once. Ignored for owners, who are never invited. */
    joined: boolean;
  },
  product: MerchantProduct,
): boolean {
  const role = normalizeMemberRole(member.role);
  if (!memberCanAccessProduct(role, normalizeMemberProductIds(member.productIds), product)) {
    return false;
  }
  return role === "owner" || member.joined;
}
