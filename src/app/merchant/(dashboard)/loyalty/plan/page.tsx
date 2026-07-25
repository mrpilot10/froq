"use client";

import { ManagePlanScreen } from "@/components/merchant/manage-plan-screen";

export default function LoyaltyPlanPage() {
  return <ManagePlanScreen product="loyalty" backHref="/merchant/loyalty/settings" />;
}
