"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ChevronRight, MessageSquare, Text } from "lucide-react";
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
import { MerchantQrPanel } from "../qr-panel";
import { ReservationSettingsFields } from "./reservation-settings-fields";

type SheetKind = "booking" | "description" | null;

const SHEET_META: Record<Exclude<SheetKind, null>, { title: string; subtitle: string }> = {
  booking: {
    title: "Booking window",
    subtitle: "Times guests can request, party limits and WhatsApp updates",
  },
  description: {
    title: "Reservation page",
    subtitle: "The line guests read above your booking form",
  },
};

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
  const [settings, setSettings] = useState<ReservationSettings>(() =>
    reservationSettingsFromProfile(profile),
  );
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSettings(reservationSettingsFromProfile(profile));
  }, [profile]);

  const save = async (next: ReservationSettings) => {
    const error = validateReservationSettings(next);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      await onSave({
        reservationDescription: next.description,
        reservationMaxPartySize: next.maxPartySize,
        reservationIntervalMinutes: next.intervalMinutes,
        reservationOpenTime: next.openTime,
        reservationCloseTime: next.closeTime,
        reservationAllowSameDay: next.allowSameDay,
        reservationAllowNotes: next.allowNotes,
        reservationAutoDeclineHours: next.autoDeclineHours,
        reservationWhatsappEnabled: next.whatsappEnabled,
      });
      setSheet(null);
    } finally {
      setSaving(false);
    }
  };

  const rows: Array<{
    id: Exclude<SheetKind, null>;
    label: string;
    value: string;
    Icon: typeof CalendarClock;
  }> = [
    {
      id: "booking",
      label: "Booking window",
      value: formatSettingsSummary(settings),
      Icon: CalendarClock,
    },
    {
      id: "description",
      label: "Reservation page",
      value: settings.description.trim() || "No description set",
      Icon: Text,
    },
  ];

  const activeMeta = sheet ? SHEET_META[sheet] : null;

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Reservation settings</h2>
        <p className="tab-sub">Control when guests can book and what they can tell you</p>
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
          {rows.map(({ id, label, value, Icon }) => (
            <button
              key={id}
              type="button"
              className="merchant-settings-row"
              onClick={() => setSheet(id)}
            >
              <div className="profile-row-icon">
                <Icon size={18} strokeWidth={2.2} />
              </div>
              <div className="profile-row-copy">
                <div className="profile-row-label">{label}</div>
                <div className="profile-row-value profile-row-value--soft">{value}</div>
              </div>
              <ChevronRight size={16} strokeWidth={2.2} className="profile-row-arrow" />
            </button>
          ))}

          <div className="merchant-settings-row" style={{ cursor: "default" }}>
            <div className="profile-row-icon">
              <MessageSquare size={18} strokeWidth={2.2} />
            </div>
            <div className="profile-row-copy">
              <div className="profile-row-label">WhatsApp updates</div>
              <div className="profile-row-value profile-row-value--soft">
                {settings.whatsappEnabled
                  ? "Guests get confirmations, updates and reminders"
                  : "Turned off — guests won't hear from Froq"}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.whatsappEnabled}
              aria-label="WhatsApp updates"
              className={`merchant-toggle${settings.whatsappEnabled ? " on" : ""}`}
              disabled={saving}
              onClick={() =>
                void save({ ...settings, whatsappEnabled: !settings.whatsappEnabled })
              }
            >
              <span className="merchant-toggle-knob" />
            </button>
          </div>
        </div>
      </div>

      <MerchantPlanCard
        product="reservation"
        enabled={productEnabled}
        onGetStarted={onGetStarted}
        onManagePlan={onManagePlan}
      />

      <BottomSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        labelledBy="reservation-setting-title"
        className="merchant-theme merchant-edit-drawer"
      >
        {sheet && activeMeta && (
          <div className="merchant-edit-sheet">
            <div className="merchant-edit-sheet-head">
              <h3 id="reservation-setting-title" className="merchant-edit-sheet-title">
                {activeMeta.title}
              </h3>
              <p className="merchant-edit-sheet-sub">{activeMeta.subtitle}</p>
            </div>

            <div className="merchant-edit-fields">
              {sheet === "booking" ? (
                <ReservationSettingsFields value={settings} onChange={setSettings} />
              ) : (
                <label className="auth-field">
                  <span className="auth-label">Short description</span>
                  <textarea
                    className="auth-input merchant-textarea"
                    rows={3}
                    placeholder="Family-run South Indian kitchen. Tables held for 15 minutes."
                    value={settings.description}
                    onChange={(event) =>
                      setSettings({ ...settings, description: event.target.value })
                    }
                  />
                  <span className="merchant-field-hint">
                    Shown under your name on the public reservation page.
                  </span>
                </label>
              )}

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
        )}
      </BottomSheet>
    </div>
  );
}
