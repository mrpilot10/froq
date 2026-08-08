"use client";

import { useRouter } from "next/navigation";
import { MenuSettingsScreen } from "@/components/merchant/menu/menu-settings-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import { isProductEnabled } from "@/lib/merchant/entitlements";

export default function MenuSettingsPage() {
  const router = useRouter();
  const {
    profile,
    role,
    branches,
    activeBranchId,
    entitlements,
    onSaveMenuSettings,
    onPurchaseProduct,
  } = useMerchantWorkspace();
  const isOwner = role === "owner";
  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;
  const branchSlug =
    activeBranch && !activeBranch.isDefault ? activeBranch.slug : null;

  return (
    <MenuSettingsScreen
      profile={profile}
      onSave={onSaveMenuSettings}
      productEnabled={isProductEnabled(entitlements, "menu")}
      onGetStarted={isOwner ? () => onPurchaseProduct("menu") : undefined}
      onManagePlan={isOwner ? () => router.push("/merchant/menu/plan") : undefined}
      branchSlug={branchSlug}
      branchSelected={activeBranchId !== null || branches.length <= 1}
      branchName={activeBranch?.name ?? null}
    />
  );
}
