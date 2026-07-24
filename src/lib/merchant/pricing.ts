import type { MerchantProduct } from "./types";

export interface PricingPlan {
  id: string;
  name: string;
  product: MerchantProduct;
  price: number;
  priceLabel: string;
  cycle: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    product: "loyalty",
    price: 999,
    priceLabel: "₹999",
    cycle: "/month",
    description: "For single-location shops getting started with loyalty.",
    features: [
      "Up to 500 loyalty members",
      "QR join & stamp approvals",
      "Basic customer list",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    product: "loyalty",
    price: 1499,
    priceLabel: "₹1,499",
    cycle: "/month",
    description: "For busy stores that want LTV insights and faster ops.",
    features: [
      "Unlimited loyalty members",
      "Customer LTV analytics",
      "Real-time approvals & scanner",
      "CSV export & priority support",
    ],
    highlighted: true,
  },
  {
    id: "scale",
    name: "Scale",
    product: "loyalty",
    price: 2999,
    priceLabel: "₹2,999",
    cycle: "/month",
    description: "For brands with multiple counters or locations.",
    features: [
      "Everything in Growth",
      "Multi-staff approvals",
      "Advanced reporting",
      "Dedicated onboarding",
    ],
  },
];

/** Queue Management plans (billed separately from loyalty). */
export const QUEUE_PLANS: PricingPlan[] = [
  {
    id: "queue",
    name: "Queue",
    product: "queue",
    price: 999,
    priceLabel: "₹999",
    cycle: "/month",
    description: "Live digital waitlist with ready-to-serve alerts.",
    features: [
      "Live digital waitlist & tokens",
      "SMS / WhatsApp ready-to-serve alerts",
      "Wait-time analytics on your customers",
    ],
  },
];

/** Every purchasable plan across products (used for checkout resolution). */
export const ALL_PLANS: PricingPlan[] = [...PRICING_PLANS, ...QUEUE_PLANS];

export function getPlanById(id: string) {
  return ALL_PLANS.find((plan) => plan.id === id) ?? PRICING_PLANS[1];
}

/** Default plan to purchase for a given product. */
export function getDefaultPlanForProduct(product: MerchantProduct): PricingPlan {
  if (product === "queue") return QUEUE_PLANS[0];
  return PRICING_PLANS[1];
}

export function productForPlanId(id: string): MerchantProduct {
  return getPlanById(id).product;
}
