"use client";

import { ManagePlanScreen } from "@/components/merchant/manage-plan-screen";

/** AI Menu pricing table; returns to Menu settings. */
export default function MenuPlanPage() {
  return <ManagePlanScreen product="menu" backHref="/merchant/menu/settings" />;
}
