import type { MerchantProduct } from "@/lib/merchant/types";

/**
 * Products that have a printable QR poster template.
 * Kept free of Node-only deps so client components can gate the Poster tab
 * without pulling `sharp` into the browser bundle.
 */
const POSTER_PRODUCTS: ReadonlySet<MerchantProduct> = new Set([
  "loyalty",
  "queue",
  "reservation",
  "menu",
]);

export function posterAvailableFor(product: MerchantProduct): boolean {
  return POSTER_PRODUCTS.has(product);
}
