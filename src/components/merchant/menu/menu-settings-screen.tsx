"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Receipt, Stamp } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { countMenuUsedForPlanMeter } from "@/app/merchant/menu-actions";
import { menuTaxSummary, type MenuTaxRates } from "@/lib/menu/tax";
import type { MerchantProfile } from "@/lib/merchant/types";
import { useMerchantWorkspace } from "../merchant-workspace-context";
import { MerchantPlanCard } from "../plan-card";
import { ProductBranchesSettings } from "../product-branches-settings";
import { DeviceSetupPanel } from "../device-setup-rows";
import { MenuTaxFields } from "./menu-tax-fields";

interface MenuSettingsScreenProps {
  profile: MerchantProfile;
  onSave: (patch: Partial<MerchantProfile>) => Promise<void> | void;
  productEnabled?: boolean;
  onGetStarted?: () => void;
  onManagePlan?: () => void;
  /** Branch slug for the QR (`?b=`). Null for the default branch. */
  branchSlug?: string | null;
  /** False when viewing All Branches — QR requires a concrete branch. */
  branchSelected?: boolean;
  /** Active branch name shown on the QR notice. */
  branchName?: string | null;
}

function ratesFromProfile(profile: MerchantProfile): MenuTaxRates {
  return {
    cgstPercent: profile.menuCgstPercent,
    sgstPercent: profile.menuSgstPercent,
    serviceChargePercent: profile.menuServiceChargePercent,
  };
}

export function MenuSettingsScreen({
  profile,
  onSave,
  productEnabled,
  onGetStarted,
  onManagePlan,
  branchSlug = null,
  branchSelected = true,
  branchName = null,
}: MenuSettingsScreenProps) {
  const { entitlements, branches, activeBranchId } = useMerchantWorkspace();
  const entitlement = entitlements.menu;
  const saved = ratesFromProfile(profile);
  const [rates, setRates] = useState<MenuTaxRates>(saved);
  const [taxOpen, setTaxOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggleSaving, setToggleSaving] = useState(false);
  const [metricUsed, setMetricUsed] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void countMenuUsedForPlanMeter().then((result) => {
      if (cancelled || !result.ok) return;
      setMetricUsed(result.conversations);
    });
    return () => {
      cancelled = true;
    };
  }, [entitlement?.planId]);

  const taxSummary = menuTaxSummary(rates);
  const branchesUsed =
    activeBranchId == null ? branches.length : Math.min(1, branches.length);
  const showLoyaltyStamps = profile.menuShowLoyaltyStamps !== false;

  async function toggleLoyaltyStamps() {
    if (toggleSaving) return;
    setToggleSaving(true);
    try {
      await onSave({ menuShowLoyaltyStamps: !showLoyaltyStamps });
    } finally {
      setToggleSaving(false);
    }
  }

  return (
    <>
      <div className="merchant-settings-group">
        <h3 className="merchant-settings-title">Guest checkout</h3>
        <div className="panel-card merchant-settings-panel">
          <button
            type="button"
            className="merchant-settings-row"
            onClick={() => {
              setRates(ratesFromProfile(profile));
              setTaxOpen(true);
            }}
          >
            <span className="profile-row-icon" aria-hidden>
              <Receipt size={18} strokeWidth={2.2} />
            </span>
            <div className="profile-row-copy">
              <div className="merchant-onboard-row-title">Tax and service charge</div>
              <div className="merchant-onboard-row-sub">{taxSummary}</div>
            </div>
            <ChevronRight size={16} strokeWidth={2.2} className="profile-row-arrow" />
          </button>
        </div>
      </div>

      <div className="merchant-settings-group">
        <h3 className="merchant-settings-title">Integrations</h3>
        <div className="panel-card merchant-settings-panel">
          <div className="merchant-settings-row" style={{ cursor: "default" }}>
            <span className="profile-row-icon" aria-hidden>
              <Stamp size={18} strokeWidth={2.2} />
            </span>
            <div className="profile-row-copy">
              <div className="merchant-onboard-row-title">Loyalty stamps</div>
              <div className="merchant-onboard-row-sub">
                {showLoyaltyStamps
                  ? "Show the loyalty stamp card on your digital menu"
                  : "Hidden on your digital menu"}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showLoyaltyStamps}
              aria-label="Show loyalty stamps on digital menu"
              className={`merchant-toggle${showLoyaltyStamps ? " on" : ""}`}
              disabled={toggleSaving}
              onClick={() => void toggleLoyaltyStamps()}
            >
              <span className="merchant-toggle-knob" />
            </button>
          </div>
        </div>
      </div>

      <ProductBranchesSettings product="menu" />

      <MerchantPlanCard
        product="menu"
        enabled={productEnabled}
        planId={entitlement?.planId}
        branchesUsed={branchesUsed}
        metricUsed={metricUsed}
        onGetStarted={onGetStarted}
        onManagePlan={onManagePlan}
      />

      <DeviceSetupPanel />

      <BottomSheet
        open={taxOpen}
        onClose={() => setTaxOpen(false)}
        labelledBy="menu-tax-title"
        className="merchant-theme merchant-edit-drawer"
      >
        <div className="merchant-edit-sheet">
          <div className="merchant-edit-sheet-head">
            <h3 id="menu-tax-title" className="merchant-edit-sheet-title">
              Tax and service charge
            </h3>
            <p className="merchant-edit-sheet-sub">
              Added on top of menu prices when a guest orders from the table
            </p>
          </div>

          <div className="merchant-edit-fields">
            <MenuTaxFields value={rates} onChange={setRates} disabled={saving} />

            <button
              type="button"
              className="cta-btn merchant-cta-accent"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onSave({
                    menuCgstPercent: rates.cgstPercent,
                    menuSgstPercent: rates.sgstPercent,
                    menuServiceChargePercent: rates.serviceChargePercent,
                  });
                  setTaxOpen(false);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
