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
  /** Yearly marketing badge, e.g. "1 Month Free". */
  freeMonthsLabel?: string;
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
    "Unlimited Staff",
  ],
  growth: [
    "3 Branches",
    "Up to 2,000 Customers",
    "Unlimited Loyalty Cards",
    "Unlimited Rewards",
    "QR Stamp Collection",
    "WhatsApp Notifications",
    "Advanced Analytics",
    "Email Support",
    "Unlimited Staff",
  ],
  pro: [
    "10 Branches",
    "Up to 10,000 Customers",
    "Unlimited Loyalty Cards",
    "Unlimited Rewards",
    "QR Stamp Collection",
    "WhatsApp Notifications",
    "Advanced Analytics",
    "Email Support",
    "Unlimited Staff",
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
  product: MerchantProduct;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyList: number;
  description: string;
  features: string[];
  highlighted?: boolean;
  freeMonthsLabel?: string;
}): PricingPlan {
  const monthlyEquivalent = Math.round(input.yearlyPrice / 12);
  const saveAmount = Math.max(0, input.yearlyList - input.yearlyPrice);
  return {
    id: `${input.id}-yearly`,
    name: input.name,
    product: input.product,
    price: input.yearlyPrice,
    priceLabel: inr(input.yearlyPrice),
    cycle: "/year",
    description: input.description,
    features: [...input.features],
    highlighted: input.highlighted,
    billing: "yearly",
    listPrice: saveAmount > 0 ? input.yearlyList : undefined,
    listPriceLabel: saveAmount > 0 ? inr(input.yearlyList) : undefined,
    monthlyEquivalent,
    monthlyEquivalentLabel: inr(monthlyEquivalent),
    saveAmount: saveAmount > 0 ? saveAmount : undefined,
    saveLabel: saveAmount > 0 ? inr(saveAmount) : undefined,
    freeMonthsLabel: input.freeMonthsLabel ?? "2 Months Free",
  };
}

function monthlyPlan(input: {
  id: string;
  name: string;
  product: MerchantProduct;
  monthlyPrice: number;
  description: string;
  features: string[];
  highlighted?: boolean;
}): PricingPlan {
  return {
    id: input.id,
    name: input.name,
    product: input.product,
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
  product: "loyalty" as const,
  monthlyPrice: 299,
  yearlyPrice: 3299,
  yearlyList: 3588,
  freeMonthsLabel: "1 Month Free",
  description: "For single location shops launching loyalty today.",
  features: [...LOYALTY_FEATURES.starter],
};

const GROWTH_META = {
  id: "growth",
  name: "Growth",
  product: "loyalty" as const,
  monthlyPrice: 699,
  yearlyPrice: 7349,
  yearlyList: 8388,
  freeMonthsLabel: "1.5 Months Free",
  description: "For busy stores that want insights and faster ops.",
  features: [...LOYALTY_FEATURES.growth],
  highlighted: true,
};

const PRO_META = {
  id: "pro",
  name: "Pro",
  product: "loyalty" as const,
  monthlyPrice: 1499,
  yearlyPrice: 14999,
  yearlyList: 17988,
  freeMonthsLabel: "2 Months Free",
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

const QUEUE_FEATURES = {
  starter: [
    "1 Branch",
    "2,000 Queue Tickets / Month",
    "Unlimited Staff Accounts",
    "Digital Smart Queue",
    "QR Queue Join",
    "WhatsApp Notifications",
    "Live Queue Display",
    "Queue Analytics",
    "Customer History",
    "Cloud Hosting & Automatic Updates",
    "Email Support",
  ],
  growth: [
    "3 Branches",
    "5,000 Queue Tickets / Month",
    "Unlimited Staff Accounts",
    "Digital Smart Queue",
    "QR Queue Join",
    "WhatsApp Notifications",
    "Live Queue Display",
    "Queue Analytics",
    "Customer History",
    "Cloud Hosting & Automatic Updates",
    "Priority Support",
  ],
  pro: [
    "10 Branches",
    "20,000 Queue Tickets / Month",
    "Unlimited Staff Accounts",
    "Digital Smart Queue",
    "QR Queue Join",
    "WhatsApp Notifications",
    "Live Queue Display",
    "Queue Analytics",
    "Customer History",
    "Cloud Hosting & Automatic Updates",
    "Premium Support",
  ],
} as const;

const QUEUE_STARTER_META = {
  id: "queue-starter",
  name: "Starter",
  product: "queue" as const,
  monthlyPrice: 799,
  yearlyPrice: 8799,
  yearlyList: 9588,
  freeMonthsLabel: "1 Month Free",
  description: "For a single location running a digital waitlist.",
  features: [...QUEUE_FEATURES.starter],
};

const QUEUE_GROWTH_META = {
  id: "queue-growth",
  name: "Growth",
  product: "queue" as const,
  monthlyPrice: 1499,
  yearlyPrice: 15799,
  yearlyList: 17988,
  freeMonthsLabel: "1.5 Months Free",
  description: "For busy venues with more tickets and locations.",
  features: [...QUEUE_FEATURES.growth],
  highlighted: true,
};

const QUEUE_PRO_META = {
  id: "queue-pro",
  name: "Pro",
  product: "queue" as const,
  monthlyPrice: 3999,
  yearlyPrice: 39999,
  yearlyList: 47988,
  freeMonthsLabel: "2 Months Free",
  description: "For multi-branch brands with high queue volume.",
  features: [...QUEUE_FEATURES.pro],
};

/** Monthly Queue Management plans (billed separately from loyalty). */
export const QUEUE_PLANS: PricingPlan[] = [
  monthlyPlan(QUEUE_STARTER_META),
  monthlyPlan(QUEUE_GROWTH_META),
  monthlyPlan(QUEUE_PRO_META),
];

/** Yearly Queue Management variants (same features; free months vary by tier). */
export const YEARLY_QUEUE_PLANS: PricingPlan[] = [
  yearlyPlan(QUEUE_STARTER_META),
  yearlyPlan(QUEUE_GROWTH_META),
  yearlyPlan(QUEUE_PRO_META),
];

const RESERVATION_FEATURES = {
  starter: [
    "1 Branch",
    "500 Reservations / Month",
    "QR & Link Reservations",
    "WhatsApp Confirmations",
    "Automatic Reminders",
    "Suggest Another Time",
    "No-Show Tracking",
    "Reservation Analytics",
    "Multi-Branch Dashboard",
    "Email & Chat Support",
  ],
  growth: [
    "3 Branches",
    "2,000 Reservations / Month",
    "QR & Link Reservations",
    "WhatsApp Confirmations",
    "Automatic Reminders",
    "Suggest Another Time",
    "No-Show Tracking",
    "Reservation Analytics",
    "Multi-Branch Dashboard",
    "Email & Chat Support",
  ],
  pro: [
    "10 Branches",
    "10,000 Reservations / Month",
    "QR & Link Reservations",
    "WhatsApp Confirmations",
    "Automatic Reminders",
    "Suggest Another Time",
    "No-Show Tracking",
    "Reservation Analytics",
    "Multi-Branch Dashboard",
    "Email & Chat Support",
  ],
} as const;

const RESERVATION_STARTER_META = {
  id: "reservation-starter",
  name: "Starter",
  product: "reservation" as const,
  monthlyPrice: 299,
  yearlyPrice: 2999,
  yearlyList: 3588,
  description: "For a single restaurant taking bookings on WhatsApp today.",
  features: [...RESERVATION_FEATURES.starter],
};

const RESERVATION_GROWTH_META = {
  id: "reservation-growth",
  name: "Growth",
  product: "reservation" as const,
  monthlyPrice: 699,
  yearlyPrice: 6999,
  yearlyList: 8388,
  description: "For busy dining rooms juggling requests across locations.",
  features: [...RESERVATION_FEATURES.growth],
  highlighted: true,
};

const RESERVATION_PRO_META = {
  id: "reservation-pro",
  name: "Pro",
  product: "reservation" as const,
  monthlyPrice: 1499,
  yearlyPrice: 14999,
  yearlyList: 17988,
  description: "For multi-branch brands with high booking volume.",
  features: [...RESERVATION_FEATURES.pro],
};

/** Monthly Reservations plans (billed separately from loyalty and queue). */
export const RESERVATION_PLANS: PricingPlan[] = [
  monthlyPlan(RESERVATION_STARTER_META),
  monthlyPlan(RESERVATION_GROWTH_META),
  monthlyPlan(RESERVATION_PRO_META),
];

/** Yearly Reservations variants (same features, 2 months free). */
export const YEARLY_RESERVATION_PLANS: PricingPlan[] = [
  yearlyPlan(RESERVATION_STARTER_META),
  yearlyPlan(RESERVATION_GROWTH_META),
  yearlyPlan(RESERVATION_PRO_META),
];

const MENU_FEATURES = {
  starter: [
    "1 Branch",
    "5,000 AI Credits / month",
    "Unlimited Menu Items",
    "Unlimited QR Scans",
    "Unlimited Customers",
    "Unlimited Languages",
    "Menu Analytics",
    "AI Insights",
    "Email Support",
  ],
  growth: [
    "3 Branches",
    "20,000 AI Credits / month",
    "Unlimited Menu Items",
    "Unlimited QR Scans",
    "Unlimited Customers",
    "Unlimited Languages",
    "Menu Analytics",
    "AI Insights",
    "Priority Support",
  ],
  pro: [
    "10 Branches",
    "100,000 AI Credits / month",
    "Unlimited Menu Items",
    "Unlimited QR Scans",
    "Unlimited Customers",
    "Unlimited Languages",
    "Menu Analytics",
    "AI Insights",
    "Priority Support",
  ],
} as const;

const MENU_STARTER_META = {
  id: "menu-starter",
  name: "Starter",
  product: "menu" as const,
  monthlyPrice: 699,
  yearlyPrice: 7699,
  yearlyList: 8388,
  freeMonthsLabel: "1 Month Free",
  description: "For a single restaurant putting its menu behind a QR.",
  features: [...MENU_FEATURES.starter],
};

const MENU_GROWTH_META = {
  id: "menu-growth",
  name: "Growth",
  product: "menu" as const,
  monthlyPrice: 1299,
  yearlyPrice: 13699,
  yearlyList: 15588,
  freeMonthsLabel: "1.5 Months Free",
  description: "For busy kitchens with a bigger menu and more guests asking.",
  features: [...MENU_FEATURES.growth],
  highlighted: true,
};

const MENU_PRO_META = {
  id: "menu-pro",
  name: "Pro",
  product: "menu" as const,
  monthlyPrice: 2599,
  yearlyPrice: 25999,
  yearlyList: 31188,
  freeMonthsLabel: "2 Months Free",
  description: "For multi-branch brands running a large AI menu.",
  features: [...MENU_FEATURES.pro],
};

/** Monthly AI Menu plans (billed separately from the other products). */
export const MENU_PLANS: PricingPlan[] = [
  monthlyPlan(MENU_STARTER_META),
  monthlyPlan(MENU_GROWTH_META),
  monthlyPlan(MENU_PRO_META),
];

/** Yearly AI Menu variants (same features; free months vary by tier). */
export const YEARLY_MENU_PLANS: PricingPlan[] = [
  yearlyPlan(MENU_STARTER_META),
  yearlyPlan(MENU_GROWTH_META),
  yearlyPlan(MENU_PRO_META),
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
  ...YEARLY_QUEUE_PLANS,
  ...RESERVATION_PLANS,
  ...YEARLY_RESERVATION_PLANS,
  ...MENU_PLANS,
  ...YEARLY_MENU_PLANS,
];

export function getPlanById(id: string) {
  if (id === FREE_PLAN.id) return FREE_PLAN;
  // Legacy single-tier product checkout links still land on Growth.
  if (id === "queue") return QUEUE_PLANS[1];
  if (id === "reservation") return RESERVATION_PLANS[1];
  if (id === "menu") return MENU_PLANS[1];
  return ALL_PLANS.find((plan) => plan.id === id) ?? PRICING_PLANS[1];
}

/** Resolve the plan for a base id + billing cycle (landing → checkout). */
export function getPlanForBilling(baseId: string, billing: BillingCycle): PricingPlan {
  if (billing === "yearly") {
    return getPlanById(`${baseId}-yearly`);
  }
  return getPlanById(baseId);
}

/** Plans shown for a product on landing / manage-plan tables. */
export function plansForProduct(
  product: MerchantProduct,
  billing: BillingCycle,
): PricingPlan[] {
  if (product === "queue") {
    return billing === "yearly" ? YEARLY_QUEUE_PLANS : QUEUE_PLANS;
  }
  if (product === "reservation") {
    return billing === "yearly" ? YEARLY_RESERVATION_PLANS : RESERVATION_PLANS;
  }
  if (product === "menu") {
    return billing === "yearly" ? YEARLY_MENU_PLANS : MENU_PLANS;
  }
  return billing === "yearly" ? YEARLY_PRICING_PLANS : PRICING_PLANS;
}

/** Default plan to purchase for a given product (Growth). */
export function getDefaultPlanForProduct(product: MerchantProduct): PricingPlan {
  if (product === "queue") return QUEUE_PLANS[1];
  if (product === "reservation") return RESERVATION_PLANS[1];
  if (product === "menu") return MENU_PLANS[1];
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
