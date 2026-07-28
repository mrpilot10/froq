"use client";

import { ManagePlanScreen } from "@/components/merchant/manage-plan-screen";

/** Queue product pricing table; returns to Queue settings. */
export default function QueuePlanPage() {
  return <ManagePlanScreen product="queue" backHref="/merchant/queue/settings" />;
}
