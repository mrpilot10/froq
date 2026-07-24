"use client";

import { toast } from "sonner";
import { DashboardScreen } from "@/components/merchant/dashboard-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";

export default function LoyaltyOverviewPage() {
  const {
    profile,
    dashboardStats,
    avgOrderValue,
    activeBranchId,
    role,
    onShowQr,
    onEditSection,
    goToTab,
  } = useMerchantWorkspace();
  return (
    <DashboardScreen
      profile={profile}
      initialStats={dashboardStats}
      avgOrderValue={avgOrderValue}
      activeBranchId={activeBranchId}
      onShowQr={onShowQr}
      onRedeemCode={() => goToTab("scan")}
      onEditRewards={() => {
        if (role !== "owner") {
          toast.error("Only the owner can edit the loyalty program.");
          return;
        }
        onEditSection("loyalty");
      }}
    />
  );
}
