"use client";

import { LoyaltySettingsScreen } from "@/components/merchant/loyalty-settings-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import { isProductEnabled } from "@/lib/merchant/entitlements";

export default function LoyaltySettingsPage() {
  const { profile, role, onEditSection, entitlements, onPurchaseProduct } = useMerchantWorkspace();
  const isOwner = role === "owner";
  return (
    <LoyaltySettingsScreen
      profile={profile}
      canEditProgram={isOwner}
      canPurchase={isOwner}
      onEditSection={onEditSection}
      productEnabled={isProductEnabled(entitlements, "loyalty")}
      onGetStarted={() => onPurchaseProduct("loyalty")}
    />
  );
}
