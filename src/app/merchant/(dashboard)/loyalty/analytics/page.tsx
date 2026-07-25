"use client";

import { AnalyticsScreen } from "@/components/merchant/analytics-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";

export default function LoyaltyAnalyticsPage() {
  const { profile, dashboardStats, activeBranchId } = useMerchantWorkspace();
  return (
    <AnalyticsScreen
      profile={profile}
      initialStats={dashboardStats}
      activeBranchId={activeBranchId}
    />
  );
}
