"use client";

import { LoyaltyExperience } from "@/components/loyalty/loyalty-experience";
import { DEMO_BUSINESS, DEMO_CUSTOMER, DEMO_HISTORY, INITIAL_FILLED } from "@/lib/loyalty/constants";

/**
 * Local-only stamp card preview. Uses demo data so you can review the UI
 * without a live Supabase merchant membership.
 */
export default function StampDemoPage() {
  return (
    <LoyaltyExperience
      business={DEMO_BUSINESS}
      card={{
        customerId: "demo-customer",
        filled: INITIAL_FILLED,
        totalStamps: DEMO_BUSINESS.totalStamps,
        status: "active",
        pending: false,
        rewardCode: "FROQ-DEMO1",
      }}
      history={DEMO_HISTORY}
      rewardCards={[
        {
          id: "current",
          index: 1,
          stampsCollected: INITIAL_FILLED,
          totalStamps: DEMO_BUSINESS.totalStamps,
          status: "active",
          rewardName: DEMO_BUSINESS.rewardName,
        },
      ]}
      totalStampsCollected={INITIAL_FILLED}
      memberSince="Jun 2026"
      customerName={DEMO_CUSTOMER.name}
      customerPhone="+91 98765 43210"
      customerEmail="alex@example.com"
      onRefresh={async () => undefined}
      onLogout={() => undefined}
      onDeleteAccount={async () => ({ ok: true })}
    />
  );
}
