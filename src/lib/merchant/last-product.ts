import { PRODUCT_DEFAULT_TAB, TAB_HREF } from "./nav";
import { accessibleProducts } from "./product-access";
import { isProductEnabled, type Entitlements } from "./entitlements";
import type { MemberRole, MerchantProduct } from "./types";

/** Cookie + localStorage key for the last merchant product the user opened. */
export const LAST_MERCHANT_PRODUCT_COOKIE = "froq_last_merchant_product";
export const LAST_MERCHANT_PRODUCT_STORAGE_KEY = "froq_last_merchant_product";

const PRODUCT_SET = new Set<MerchantProduct>([
  "loyalty",
  "queue",
  "reservation",
  "menu",
]);

export function parseMerchantProduct(
  value: string | null | undefined,
): MerchantProduct | null {
  if (!value) return null;
  const cleaned = value.trim() as MerchantProduct;
  return PRODUCT_SET.has(cleaned) ? cleaned : null;
}

/** Canonical home URL for a product. */
export function homeHrefForProduct(product: MerchantProduct): string {
  return TAB_HREF[PRODUCT_DEFAULT_TAB[product]];
}

/**
 * Products this member may open. Owners use enabled entitlements when provided;
 * teammates use their grant list (optionally intersected with enabled products).
 */
export function productsForMerchantHome(input: {
  role: MemberRole;
  memberProductIds: MerchantProduct[];
  entitlements?: Entitlements | null;
}): MerchantProduct[] {
  const granted = accessibleProducts(input.role, input.memberProductIds);
  if (!input.entitlements) return granted;

  const enabled = granted.filter((product) =>
    isProductEnabled(input.entitlements!, product),
  );
  // Prefer enabled products; if none are live yet (brand-new checkout), keep grants.
  return enabled.length > 0 ? enabled : granted;
}

/**
 * Home product: last-used when still allowed, otherwise the first allowed product.
 */
export function preferredMerchantProduct(input: {
  role: MemberRole;
  memberProductIds: MerchantProduct[];
  lastProduct?: MerchantProduct | null;
  entitlements?: Entitlements | null;
}): MerchantProduct {
  const allowed = productsForMerchantHome(input);
  if (allowed.length === 0) return "loyalty";
  if (input.lastProduct && allowed.includes(input.lastProduct)) {
    return input.lastProduct;
  }
  return allowed[0];
}

/** Persist last product for server redirects (cookie) and client resume (localStorage). */
export function rememberMerchantProduct(product: MerchantProduct): void {
  if (typeof document === "undefined") return;
  try {
    window.localStorage.setItem(LAST_MERCHANT_PRODUCT_STORAGE_KEY, product);
  } catch {
    /* private mode */
  }
  const maxAge = 60 * 60 * 24 * 400;
  document.cookie = `${LAST_MERCHANT_PRODUCT_COOKIE}=${encodeURIComponent(
    product,
  )}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function readRememberedMerchantProduct(): MerchantProduct | null {
  if (typeof window === "undefined") return null;
  try {
    const fromStorage = parseMerchantProduct(
      window.localStorage.getItem(LAST_MERCHANT_PRODUCT_STORAGE_KEY),
    );
    if (fromStorage) return fromStorage;
  } catch {
    /* ignore */
  }
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LAST_MERCHANT_PRODUCT_COOKIE}=`));
  if (!match) return null;
  return parseMerchantProduct(decodeURIComponent(match.split("=").slice(1).join("=")));
}
