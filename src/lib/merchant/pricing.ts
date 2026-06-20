export interface PricingPlan {
  id: string;
  name: string;
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

export function getPlanById(id: string) {
  return PRICING_PLANS.find((plan) => plan.id === id) ?? PRICING_PLANS[1];
}
