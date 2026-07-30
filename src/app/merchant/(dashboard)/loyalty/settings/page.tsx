"use client";

import { useRouter } from "next/navigation";
import { LoyaltySettingsScreen } from "@/components/merchant/loyalty-settings-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import { isProductEnabled } from "@/lib/merchant/entitlements";

export default function LoyaltySettingsPage() {
  const router = useRouter();
  const { profile, role, branches, activeBranchId, onEditSection, entitlements, onPurchaseProduct } =
    useMerchantWorkspace();
  const isOwner = role === "owner";
  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;
  const branchSlug =
    activeBranch && !activeBranch.isDefault ? activeBranch.slug : null;

  return (
    <LoyaltySettingsScreen
      profile={profile}
      canEditProgram={isOwner}
      canPurchase={isOwner}
      onEditSection={onEditSection}
      productEnabled={isProductEnabled(entitlements, "loyalty")}
      onGetStarted={() => onPurchaseProduct("loyalty")}
      onManagePlan={isOwner ? () => router.push("/merchant/loyalty/plan") : undefined}
      branchSlug={branchSlug}
      branchSelected={activeBranchId !== null}
      branchName={activeBranch?.name ?? null}
    />
  );
}
