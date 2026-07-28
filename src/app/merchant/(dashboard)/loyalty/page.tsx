"use client";

import { DashboardScreen } from "@/components/merchant/dashboard-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";

export default function LoyaltyHomePage() {
  const {
    profile,
    approvals,
    customers,
    role,
    onShowQr,
    onRedeemCode,
    onApprove,
    onDisapprove,
    onRequestOfferStampOtp,
    onConfirmOfferStamp,
    goToTab,
  } = useMerchantWorkspace();
  return (
    <DashboardScreen
      profile={profile}
      approvals={approvals}
      customers={customers}
      role={role}
      onApprove={onApprove}
      onDisapprove={onDisapprove}
      onRequestOfferStampOtp={onRequestOfferStampOtp}
      onConfirmOfferStamp={onConfirmOfferStamp}
      onShowQr={() => onShowQr("loyalty")}
      onRedeemCode={onRedeemCode}
      onOpenAnalytics={() => goToTab("analytics")}
    />
  );
}
