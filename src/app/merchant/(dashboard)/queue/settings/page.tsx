"use client";

import { useRouter } from "next/navigation";
import { QueueSettingsScreen } from "@/components/merchant/queue/queue-settings-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import { isProductEnabled } from "@/lib/merchant/entitlements";

export default function QueueSettingsPage() {
  const router = useRouter();
  const {
    profile,
    role,
    branches,
    activeBranchId,
    onSaveQueueBanner,
    onSaveQueueHours,
    onSaveEstimatedWait,
    onSaveQueueSettings,
    entitlements,
    onPurchaseProduct,
  } = useMerchantWorkspace();
  const isOwner = role === "owner";

  // Hours + wait are per-branch: follow the header branch switcher. On "All
  // branches", fall back to main so single-branch merchants and the default
  // location still have a concrete target.
  const settingsBranch =
    branches.find((b) => b.id === activeBranchId) ??
    branches.find((b) => b.isDefault) ??
    branches[0] ??
    null;
  const branchSlug =
    settingsBranch && !settingsBranch.isDefault ? settingsBranch.slug : null;
  const viewingAllBranches = activeBranchId === null && branches.length > 1;

  return (
    <QueueSettingsScreen
      profile={profile}
      branch={settingsBranch}
      branchLabel={
        settingsBranch
          ? viewingAllBranches
            ? `${settingsBranch.name} (main)`
            : settingsBranch.name
          : null
      }
      banner={profile.queueBanner ?? ""}
      bannerLink={profile.queueBannerLink ?? ""}
      onSaveBanner={onSaveQueueBanner}
      onSaveHours={onSaveQueueHours}
      onSaveEstimatedWait={onSaveEstimatedWait}
      onSaveProfile={onSaveQueueSettings}
      productEnabled={isProductEnabled(entitlements, "queue")}
      onGetStarted={isOwner ? () => onPurchaseProduct("queue") : undefined}
      onManagePlan={isOwner ? () => router.push("/merchant/queue/plan") : undefined}
      branchSlug={branchSlug}
      branchSelected={activeBranchId !== null || branches.length <= 1}
    />
  );
}
