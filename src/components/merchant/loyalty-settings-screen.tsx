"use client";

import { Bell, ChevronRight, Gift } from "lucide-react";
import type { MerchantEditSection, MerchantProfile } from "@/lib/merchant/types";
import { MerchantPlanCard } from "./plan-card";
import { MerchantQrPanel } from "./qr-panel";

interface LoyaltySettingsScreenProps {
  profile: MerchantProfile;
  canEditProgram?: boolean;
  canPurchase?: boolean;
  onEditSection: (section: MerchantEditSection) => void;
  productEnabled?: boolean;
  onGetStarted?: () => void;
}

const LOYALTY_SETTINGS: Array<{
  id: MerchantEditSection;
  label: string;
  value: string;
  Icon: typeof Gift;
}> = [
  {
    id: "loyalty",
    label: "Rewards & stamps",
    value: "Offer, stamps & order value",
    Icon: Gift,
  },
  {
    id: "notifications",
    label: "Alerts & email",
    value: "Stamp, approval, marketing",
    Icon: Bell,
  },
];

export function LoyaltySettingsScreen({
  profile,
  canEditProgram = true,
  canPurchase = true,
  onEditSection,
  productEnabled,
  onGetStarted,
}: LoyaltySettingsScreenProps) {
  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Loyalty settings</h2>
        <p className="tab-sub">Configure your stamp program, QR, and alerts</p>
      </div>

      <MerchantQrPanel profile={profile} />

      <div className="merchant-settings-group">
        <h3 className="merchant-settings-title">Loyalty program</h3>
        <div className="panel-card merchant-settings-panel">
          {LOYALTY_SETTINGS.map(({ id, label, value, Icon }) => {
            const locked = id === "loyalty" && !canEditProgram;
            return (
              <button
                key={id}
                type="button"
                className="merchant-settings-row"
                disabled={locked}
                onClick={() => {
                  if (locked) return;
                  onEditSection(id);
                }}
              >
                <div className="profile-row-icon">
                  <Icon size={18} strokeWidth={2.2} />
                </div>
                <div className="profile-row-copy">
                  <div className="profile-row-label">{label}</div>
                  <div className="profile-row-value profile-row-value--soft">
                    {locked ? "Only the owner can edit" : value}
                  </div>
                </div>
                {!locked && (
                  <ChevronRight size={16} strokeWidth={2.2} className="profile-row-arrow" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <MerchantPlanCard
        product="loyalty"
        enabled={productEnabled}
        onGetStarted={canPurchase ? onGetStarted : undefined}
      />
    </div>
  );
}
