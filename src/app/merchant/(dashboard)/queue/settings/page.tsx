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
    onSaveQueueSettings,
    entitlements,
    onPurchaseProduct,
  } = useMerchantWorkspace();
  const isOwner = role === "owner";
  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;
  const branchSlug =
    activeBranch && !activeBranch.isDefault ? activeBranch.slug : null;

  return (
    <QueueSettingsScreen
      profile={profile}
      banner={profile.queueBanner ?? ""}
      bannerLink={profile.queueBannerLink ?? ""}
      onSaveBanner={onSaveQueueBanner}
      onSaveHours={onSaveQueueHours}
      onSaveProfile={onSaveQueueSettings}
      productEnabled={isProductEnabled(entitlements, "queue")}
      onGetStarted={isOwner ? () => onPurchaseProduct("queue") : undefined}
      onManagePlan={isOwner ? () => router.push("/merchant/queue/plan") : undefined}
      branchSlug={branchSlug}
      branchSelected={activeBranchId !== null}
    />
  );
}
