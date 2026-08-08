import "server-only";

import { FREE_PLAN, getPlanById } from "@/lib/merchant/pricing";
import type { MerchantProduct } from "@/lib/merchant/types";

/** Normalize a catalog plan into monthly recurring rupees. */
export function planToMrr(planId: string | null | undefined): number {
  if (!planId || planId === FREE_PLAN.id) return 0;
  try {
    const plan = getPlanById(planId);
    if (!plan || plan.price <= 0) return 0;
    if (plan.billing === "yearly") {
      return plan.monthlyEquivalent ?? plan.price / 12;
    }
    return plan.price;
  } catch {
    return 0;
  }
}

export function productLabel(product: MerchantProduct | string): string {
  switch (product) {
    case "loyalty":
      return "Loyalty Stamps";
    case "queue":
      return "Queue Management";
    case "reservation":
      return "Reservations";
    case "menu":
      return "AI Menu";
    default:
      return String(product);
  }
}

export const ADMIN_PRODUCTS: MerchantProduct[] = [
  "loyalty",
  "queue",
  "reservation",
  "menu",
];
