import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMerchantSession } from "@/app/merchant/actions";
import {
  homeHrefForProduct,
  LAST_MERCHANT_PRODUCT_COOKIE,
  parseMerchantProduct,
  preferredMerchantProduct,
} from "@/lib/merchant/last-product";

/**
 * `/merchant` entry — send each user to a product they can open, preferring
 * the last product they used.
 */
export default async function MerchantPage() {
  const cookieStore = await cookies();
  const lastProduct = parseMerchantProduct(
    cookieStore.get(LAST_MERCHANT_PRODUCT_COOKIE)?.value,
  );

  const session = await getMerchantSession();
  if (session.status !== "ready") {
    redirect(homeHrefForProduct(lastProduct ?? "loyalty"));
  }

  const product = preferredMerchantProduct({
    role: session.role,
    memberProductIds: session.memberProductIds,
    lastProduct,
    entitlements: session.entitlements,
  });

  redirect(homeHrefForProduct(product));
}
