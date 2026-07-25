"use client";

import { ManagePlanScreen } from "@/components/merchant/manage-plan-screen";

/** Same homepage pricing table; returns to Queue settings. */
export default function QueuePlanPage() {
  return <ManagePlanScreen product="loyalty" backHref="/merchant/queue/settings" />;
}
