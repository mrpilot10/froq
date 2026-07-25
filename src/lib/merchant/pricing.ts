import type { MerchantProduct } from "./types";

export type BillingCycle = "monthly" | "yearly";

export interface PricingPlan {
  id: string;
  name: string;
  product: MerchantProduct;
  /** Amount charged at checkout (INR). 0 = custom / contact sales. */
  price: number;
  priceLabel: string;
  cycle: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  /** Contact-sales plan (no self-serve checkout). */
  custom?: boolean;
  billing?: BillingCycle;
  /** List price before yearly discount (for strikethrough). */
  listPrice?: number;
  listPriceLabel?: string;
  /** Equivalent monthly cost when billed yearly. */
  monthlyEquivalent?: number;
  monthlyEquivalentLabel?: string;
  /** Absolute savings vs paying monthly for 12 months. */
  saveAmount?: number;
  saveLabel?: string;
}

function inr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

const LOYALTY_FEATURES = {
  starter: [
    "1 Branch",
    "Up to 500 Customers",
    "Unlimited Loyalty Cards",
    "Unlimited Rewards",
    "QR Stamp Collection",
    "WhatsApp Notifications",
    "Advanced Analytics",
    "Email Support",
    "Secure Cloud Hosting",
    "Free Updates",
  ],
  growth: [
    "3 Branches",
    "Up to 2,000 Customers",
    "Unlimited Loyalty Cards",
    "Unlimited Rewards",
    "QR Stamp Collection",
    "WhatsApp Notifications",
    "Advanced Analytics",
    "Add Staff",
    "Priority Support",
    "Secure Cloud Hosting",
  ],
  pro: [
    "10 Branches",
    "Up to 10,000 Customers",
    "Unlimited Loyalty Cards",
    "Unlimited Rewards",
    "QR Stamp Collection",
    "WhatsApp Notifications",
    "Advanced Analytics",
    "Add Staff",
    "Priority Support",
    "Multi-Branch Dashboard",
  ],
} as const;

/** Enterprise is shown as a contact line under the 3 self-serve plans. */
export const ENTERPRISE_CONTACT = {
  title: "Need Enterprise?",
  body: "Unlimited branches & customers, white label, custom integrations, dedicated onboarding, and SLA support.",
  cta: "Contact Sales",
  href: "mailto:hello@froq.io?subject=Froq%20Enterprise",
} as const;

function yearlyPlan(input: {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyList: number;
  description: string;
  features: string[];
  highlighted?: boolean;
}): PricingPlan {
  const monthlyEquivalent = Math.round(input.yearlyPrice / 12);
  const saveAmount = input.yearlyList - input.yearlyPrice;
  return {
    id: `${input.id}-yearly`,
    name: input.name,
    product: "loyalty",
    price: input.yearlyPrice,
    priceLabel: inr(input.yearlyPrice),
    cycle: "/year",
    description: input.description,
    features: [...input.features],
    highlighted: input.highlighted,
    billing: "yearly",
    listPrice: input.yearlyList,
    listPriceLabel: inr(input.yearlyList),
    monthlyEquivalent,
    monthlyEquivalentLabel: inr(monthlyEquivalent),
    saveAmount,
    saveLabel: inr(saveAmount),
  };
}

function monthlyPlan(input: {
  id: string;
  name: string;
  monthlyPrice: number;
  description: string;
  features: string[];
  highlighted?: boolean;
}): PricingPlan {
  return {
    id: input.id,
    name: input.name,
    product: "loyalty",
    price: input.monthlyPrice,
    priceLabel: inr(input.monthlyPrice),
    cycle: "/month",
    description: input.description,
    features: [...input.features],
    highlighted: input.highlighted,
    billing: "monthly",
  };
}

const STARTER_META = {
  id: "starter",
  name: "Starter",
  monthlyPrice: 299,
  yearlyPrice: 2999,
  yearlyList: 3588,
  description: "For single location shops launching loyalty today.",
  features: [...LOYALTY_FEATURES.starter],
};

const GROWTH_META = {
  id: "growth",
  name: "Growth",
  monthlyPrice: 699,
  yearlyPrice: 6999,
  yearlyList: 8388,
  description: "For busy stores that want insights and faster ops.",
  features: [...LOYALTY_FEATURES.growth],
  highlighted: true,
};

const PRO_META = {
  id: "pro",
  name: "Pro",
  monthlyPrice: 1499,
  yearlyPrice: 14999,
  yearlyList: 17988,
  description: "For brands managing loyalty across many locations.",
  features: [...LOYALTY_FEATURES.pro],
};

/** Monthly loyalty plans shown on the landing pricing table. */
export const PRICING_PLANS: PricingPlan[] = [
  monthlyPlan(STARTER_META),
  monthlyPlan(GROWTH_META),
  monthlyPlan(PRO_META),
];

/** Yearly loyalty variants (same features, discounted annual billing). */
export const YEARLY_PRICING_PLANS: PricingPlan[] = [
  yearlyPlan(STARTER_META),
  yearlyPlan(GROWTH_META),
  yearlyPlan(PRO_META),
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
    billing: "monthly",
  },
];

/** Free tier after a paid period ends (post-cancellation). */
export const FREE_PLAN: PricingPlan = {
  id: "free",
  name: "Free",
  product: "loyalty",
  price: 0,
  priceLabel: "₹0",
  cycle: "",
  description: "Limited access after your paid period ends.",
  features: [
    "1 Branch",
    "Up to 50 Customers",
    "Basic loyalty card",
    "Email support",
  ],
  billing: "monthly",
};

/** Every purchasable plan across products (used for checkout resolution). */
export const ALL_PLANS: PricingPlan[] = [
  ...PRICING_PLANS,
  ...YEARLY_PRICING_PLANS,
  ...QUEUE_PLANS,
];

export function getPlanById(id: string) {
  if (id === FREE_PLAN.id) return FREE_PLAN;
  return ALL_PLANS.find((plan) => plan.id === id) ?? PRICING_PLANS[1];
}

/** Resolve the plan for a base id + billing cycle (landing → checkout). */
export function getPlanForBilling(baseId: string, billing: BillingCycle): PricingPlan {
  if (billing === "yearly") {
    return getPlanById(`${baseId}-yearly`);
  }
  return getPlanById(baseId);
}

/** Default plan to purchase for a given product. */
export function getDefaultPlanForProduct(product: MerchantProduct): PricingPlan {
  if (product === "queue") return QUEUE_PLANS[0];
  return PRICING_PLANS[1];
}

export function productForPlanId(id: string): MerchantProduct {
  return getPlanById(id).product;
}

/** Base plan id without `-yearly` suffix (for UI grouping). */
export function basePlanId(id: string): string {
  return id.replace(/-yearly$/, "");
}

export function isFreePlanId(id: string | null | undefined): boolean {
  return !id || id === "free";
}
