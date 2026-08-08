"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronRight, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import {
  formatSettingsSummary,
  reservationSettingsFromProfile,
  validateReservationSettings,
  type ReservationSettings,
} from "@/lib/merchant/reservations";
import type { MerchantProfile } from "@/lib/merchant/types";
import { MerchantPlanCard } from "../plan-card";
import { ProductBranchesSettings } from "../product-branches-settings";
import { DeviceSetupPanel } from "../device-setup-rows";
import { MerchantQrPanel } from "../qr-panel";
import { ReservationSettingsFields } from "./reservation-settings-fields";
import {
  TableLayoutSheet,
  useTableLayoutSummary,
} from "../table-layout-sheet";
import { useMerchantWorkspace } from "../merchant-workspace-context";

interface ReservationSettingsScreenProps {
  profile: MerchantProfile;
  onSave: (patch: Partial<MerchantProfile>) => Promise<void> | void;
  productEnabled?: boolean;
  onGetStarted?: () => void;
  onManagePlan?: () => void;
  branchSlug?: string | null;
  branchSelected?: boolean;
}

export function ReservationSettingsScreen({
  profile,
  onSave,
  productEnabled,
  onGetStarted,
  onManagePlan,
  branchSlug = null,
  branchSelected = true,
}: ReservationSettingsScreenProps) {
  const { activeBranchId, branches } = useMerchantWorkspace();
  const activeBranch =
    branches.find((b) => b.id === activeBranchId) ??
    branches.find((b) => b.isDefault) ??
    branches[0] ??
    null;
  const { summary: tableSummary, refresh: refreshTables } =
    useTableLayoutSummary(activeBranchId);
  const settingsFromSources = useMemo(
    () =>
      reservationSettingsFromProfile({
        ...profile,
        queueOpenTime: activeBranch?.queueOpenTime ?? profile.queueOpenTime,
        queueCloseTime: activeBranch?.queueCloseTime ?? profile.queueCloseTime,
      }),
    [profile, activeBranch?.queueOpenTime, activeBranch?.queueCloseTime],
  );
  const [settings, setSettings] = useState<ReservationSettings>(settingsFromSources);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [tablesOpen, setTablesOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSettings(settingsFromSources);
  }, [settingsFromSources]);

  const save = async (next: ReservationSettings) => {
    const error = validateReservationSettings(next);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      // Open/close stay on Business settings → Branch; don't write them here.
      await onSave({
        reservationDescription: next.description,
        reservationMaxPartySize: next.maxPartySize,
        reservationIntervalMinutes: next.intervalMinutes,
        reservationAllowSameDay: next.allowSameDay,
        reservationAllowNotes: next.allowNotes,
        reservationAutoDeclineHours: next.autoDeclineHours,
        reservationWhatsappEnabled: next.whatsappEnabled,
        reservationGraceMinutes: next.graceMinutes,
        reservationAutoAssignTables: next.autoAssignTables,
      });
      setBookingOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Reservation settings</h2>
        <p className="tab-sub">Control booking rules and what guests can tell you</p>
      </div>

      <MerchantQrPanel
        profile={profile}
        product="reservation"
        branchSlug={branchSlug}
        needsBranch
        branchSelected={branchSelected}
      />

      <div className="merchant-settings-group">
        <h3 className="merchant-settings-title">Reservation setup</h3>
        <div className="panel-card merchant-settings-panel">
          <button
            type="button"
            className="merchant-settings-row"
            onClick={() => setBookingOpen(true)}
          >
            <div className="profile-row-icon">
              <CalendarClock size={18} strokeWidth={2.2} />
            </div>
            <div className="profile-row-copy">
              <div className="profile-row-label">Booking rules</div>
              <div className="profile-row-value profile-row-value--soft">
                {formatSettingsSummary(settings)}
              </div>
            </div>
            <ChevronRight size={16} strokeWidth={2.2} className="profile-row-arrow" />
          </button>

          <button
            type="button"
            className="merchant-settings-row"
            onClick={() => setTablesOpen(true)}
          >
            <div className="profile-row-icon">
              <LayoutGrid size={18} strokeWidth={2.2} />
            </div>
            <div className="profile-row-copy">
              <div className="profile-row-label">Tables</div>
              <div className="profile-row-value profile-row-value--soft">
                {tableSummary}
              </div>
            </div>
            <ChevronRight size={16} strokeWidth={2.2} className="profile-row-arrow" />
          </button>

          <div className="merchant-settings-row" style={{ cursor: "default" }}>
            <div className="profile-row-icon">
              <LayoutGrid size={18} strokeWidth={2.2} />
            </div>
            <div className="profile-row-copy">
              <div className="profile-row-label">Automatically assign tables</div>
              <div className="profile-row-value profile-row-value--soft">
                {settings.autoAssignTables
                  ? "On confirm — best free table for the party"
                  : "Off — assign tables yourself later"}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.autoAssignTables}
              aria-label="Automatically assign tables"
              className={`merchant-toggle${settings.autoAssignTables ? " on" : ""}`}
              disabled={saving}
              onClick={() =>
                void save({
                  ...settings,
                  autoAssignTables: !settings.autoAssignTables,
                })
              }
            >
              <span className="merchant-toggle-knob" />
            </button>
          </div>
        </div>
      </div>

      <ProductBranchesSettings product="reservation" />

      <MerchantPlanCard
        product="reservation"
        enabled={productEnabled}
        onGetStarted={onGetStarted}
        onManagePlan={onManagePlan}
      />

      <DeviceSetupPanel />

      <TableLayoutSheet
        open={tablesOpen}
        branchId={activeBranchId}
        onClose={() => setTablesOpen(false)}
        onSaved={(layout) => refreshTables(layout)}
      />

      <BottomSheet
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        labelledBy="reservation-setting-title"
        className="merchant-theme merchant-edit-drawer"
      >
        <div className="merchant-edit-sheet">
          <div className="merchant-edit-sheet-head">
            <h3 id="reservation-setting-title" className="merchant-edit-sheet-title">
              Booking rules
            </h3>
            <p className="merchant-edit-sheet-sub">
              Interval, party size, and guest options — seating window follows
              store timings
            </p>
          </div>

          <div className="merchant-edit-fields">
            <span className="merchant-field-hint" style={{ display: "block", marginBottom: 12 }}>
              Seating slots use store timings from Business settings → Branch
              {activeBranch?.name ? ` · ${activeBranch.name}` : ""}.
            </span>
            <ReservationSettingsFields
              hideSeatingTimes
              value={settings}
              onChange={setSettings}
            />

            <button
              type="button"
              className="cta-btn merchant-cta-accent"
              disabled={saving}
              onClick={() => void save(settings)}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
