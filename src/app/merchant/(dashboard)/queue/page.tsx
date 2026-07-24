"use client";

import { QueueHomeScreen } from "@/components/merchant/queue/queue-home-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";

export default function QueueHomePage() {
  const { profile, goToTab } = useMerchantWorkspace();
  return (
    <QueueHomeScreen profile={profile} onViewHistory={() => goToTab("queue-history")} />
  );
}
