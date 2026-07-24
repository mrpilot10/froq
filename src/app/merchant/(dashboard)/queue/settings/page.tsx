"use client";

import { QueueSettingsScreen } from "@/components/merchant/queue/queue-settings-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import { isProductEnabled } from "@/lib/merchant/entitlements";

export default function QueueSettingsPage() {
  const { profile, role, onSaveQueueBanner, entitlements, onPurchaseProduct } =
    useMerchantWorkspace();
  const isOwner = role === "owner";
  return (
    <QueueSettingsScreen
      profile={profile}
      banner={profile.queueBanner ?? ""}
      bannerLink={profile.queueBannerLink ?? ""}
      onSaveBanner={onSaveQueueBanner}
      productEnabled={isProductEnabled(entitlements, "queue")}
      onGetStarted={isOwner ? () => onPurchaseProduct("queue") : undefined}
    />
  );
}
