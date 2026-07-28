"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  Check,
  ChevronRight,
  Clock3,
  ImagePlus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import {
  DEFAULT_ESTIMATED_WAIT_MINUTES,
  getInitialEstimatedWaitMinutes,
  getWaitEstimateMeta,
  setInitialEstimatedWaitMinutes,
} from "@/lib/merchant/queue-settings";
import {
  formatHoursSummary,
  type QueueStoreHours,
  validateQueueStoreHours,
} from "@/lib/merchant/queue-hours";
import { fileToBannerDataUrl } from "@/lib/merchant/image";
import type { MerchantProfile } from "@/lib/merchant/types";
import { MerchantPlanCard } from "../plan-card";
import { MerchantQrPanel } from "../qr-panel";
import {
  hoursFromProfile,
  profilePatchFromHours,
  QueueHoursFields,
} from "./queue-hours-fields";

const WAIT_OPTIONS = [5, 8, 10, 12, 15, 20, 30];

type SheetKind = "wait" | "banner" | "hours" | null;

const SHEET_META: Record<Exclude<SheetKind, null>, { title: string; subtitle: string }> = {
  wait: {
    title: "Estimated wait",
    subtitle: "Set the starting wait; Froq refines it as guests are seated",
  },
  banner: {
    title: "Guest banner",
    subtitle: "Image shown on the join screen after a guest joins",
  },
  hours: {
    title: "Store timings",
    subtitle: "Set when you’re open and let Froq start or close the queue for you",
  },
};

interface QueueSettingsScreenProps {
  profile: MerchantProfile;
  banner: string;
  bannerLink: string;
  onSaveBanner: (banner: string, bannerLink: string) => Promise<void> | void;
  onSaveHours: (hours: QueueStoreHours) => Promise<void> | void;
  productEnabled?: boolean;
  onGetStarted?: () => void;
  onManagePlan?: () => void;
}

const hasImage = (value: string) => value.trim().length > 0;

export function QueueSettingsScreen({
  profile,
  banner,
  bannerLink,
  onSaveBanner,
  onSaveHours,
  productEnabled,
  onGetStarted,
  onManagePlan,
}: QueueSettingsScreenProps) {
  const [waitMinutes, setWaitMinutes] = useState(DEFAULT_ESTIMATED_WAIT_MINUTES);
  const [waitMeta, setWaitMeta] = useState(() => ({
    minutes: DEFAULT_ESTIMATED_WAIT_MINUTES,
    source: "initial" as "initial" | "learned",
    samples: 0,
  }));
  const [bannerUrl, setBannerUrl] = useState(banner);
  const [linkUrl, setLinkUrl] = useState(bannerLink);
  const [hours, setHours] = useState<QueueStoreHours>(() => hoursFromProfile(profile));
  const [savingBanner, setSavingBanner] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [waitReady, setWaitReady] = useState(false);

  useEffect(() => {
    setWaitMinutes(getInitialEstimatedWaitMinutes());
    setWaitMeta(getWaitEstimateMeta());
    setWaitReady(true);
  }, []);

  useEffect(() => {
    setBannerUrl(banner);
  }, [banner]);

  useEffect(() => {
    setLinkUrl(bannerLink);
  }, [bannerLink]);

  useEffect(() => {
    setHours(hoursFromProfile(profile));
  }, [
    profile.queueOpenTime,
    profile.queueCloseTime,
    profile.queueOpenDays,
    profile.queueAutoStart,
    profile.queueAutoClose,
  ]);

  const bannerDirty = bannerUrl !== (banner ?? "") || linkUrl !== (bannerLink ?? "");
  const closeSheet = () => setSheet(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    setProcessing(true);
    try {
      const dataUrl = await fileToBannerDataUrl(file);
      setBannerUrl(dataUrl);
    } catch {
      toast.error("Could not process that image.");
    } finally {
      setProcessing(false);
    }
  };

  const clearBanner = () => setBannerUrl("");

  const saveBanner = async () => {
    setSavingBanner(true);
    try {
      await onSaveBanner(bannerUrl.trim(), linkUrl.trim());
      closeSheet();
    } finally {
      setSavingBanner(false);
    }
  };

  const saveHours = async () => {
    const error = validateQueueStoreHours(hours);
    if (error) {
      toast.error(error);
      return;
    }
    setSavingHours(true);
    try {
      await onSaveHours(hours);
      closeSheet();
    } finally {
      setSavingHours(false);
    }
  };

  const saveWait = (minutes: number) => {
    const next = setInitialEstimatedWaitMinutes(minutes);
    setWaitMinutes(next);
    setWaitMeta({ minutes: next, source: "initial", samples: 0 });
    toast.success(`Initial wait estimate set to ${next} min per party`);
  };

  const rows: Array<{
    id: Exclude<SheetKind, null>;
    label: string;
    value: ReactNode;
    Icon: typeof Users;
  }> = [
    {
      id: "hours",
      label: "Store timings",
      value: formatHoursSummary(hours),
      Icon: Clock3,
    },
    {
      id: "wait",
      label: "Estimated wait",
      value: !waitReady ? (
        <span className="sk sk-line" style={{ width: 150, display: "block" }} />
      ) : waitMeta.source === "learned" ? (
        `${waitMeta.minutes} min/party · learned`
      ) : (
        `${waitMeta.minutes} min/party · your estimate`
      ),
      Icon: Users,
    },
    {
      id: "banner",
      label: "Guest banner",
      value: hasImage(bannerUrl) ? "Image set" : "Not set",
      Icon: ImagePlus,
    },
  ];

  const activeMeta = sheet ? SHEET_META[sheet] : null;

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Queue settings</h2>
        <p className="tab-sub">Configure how your live waitlist behaves</p>
      </div>

      <MerchantQrPanel profile={profile} product="queue" />

      <div className="merchant-settings-group">
        <h3 className="merchant-settings-title">Queue setup</h3>
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
        </div>
      </div>

      <MerchantPlanCard
        product="queue"
        enabled={productEnabled}
        onGetStarted={onGetStarted}
        onManagePlan={onManagePlan}
      />

      <BottomSheet
        open={sheet !== null}
        onClose={closeSheet}
        labelledBy="queue-setting-title"
        className="merchant-theme merchant-edit-drawer"
      >
        {sheet && activeMeta && (
          <div className="merchant-edit-sheet">
            <div className="merchant-edit-sheet-head">
              <h3 id="queue-setting-title" className="merchant-edit-sheet-title">
                {activeMeta.title}
              </h3>
              <p className="merchant-edit-sheet-sub">{activeMeta.subtitle}</p>
            </div>

            <div className="merchant-edit-fields">
              {sheet === "hours" && (
                <>
                  <QueueHoursFields value={hours} onChange={setHours} />
                  <button
                    type="button"
                    className="cta-btn merchant-cta-accent"
                    disabled={savingHours}
                    onClick={() => void saveHours()}
                  >
                    {savingHours ? "Saving…" : "Save timings"}
                  </button>
                </>
              )}

              {sheet === "wait" && (
                <div className="auth-field">
                  <span className="auth-label">Initial estimate (min per party)</span>
                  <div className="queue-accept-options">
                    {WAIT_OPTIONS.map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        className={`queue-accept-option${waitMinutes === mins && waitMeta.source === "initial" ? " active" : ""}`}
                        onClick={() => saveWait(mins)}
                      >
                        {waitMinutes === mins && waitMeta.source === "initial" && (
                          <Check size={13} strokeWidth={2.6} />
                        )}
                        {mins}m
                      </button>
                    ))}
                  </div>
                  <span className="merchant-field-hint">
                    {waitMeta.source === "learned"
                      ? `Learning from ${waitMeta.samples} seated ${waitMeta.samples === 1 ? "guest" : "guests"} · currently ${waitMeta.minutes} min/party`
                      : "Used until guests are seated, then Froq learns the real average."}
                  </span>
                </div>
              )}

              {sheet === "banner" && (
                <>
                  <div className="merchant-logo-field">
                    <span className="auth-label">Banner image</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="merchant-file-input"
                      onChange={(e) => {
                        void handleFile(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />

                    {hasImage(bannerUrl) ? (
                      <div className="queue-banner-preview">
                        <Image
                          src={bannerUrl}
                          alt="Queue banner preview"
                          width={640}
                          height={256}
                          unoptimized
                          className="queue-banner-preview-img"
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="queue-banner-drop"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={processing}
                      >
                        <ImagePlus size={22} strokeWidth={2} />
                        <span>{processing ? "Processing…" : "Upload a banner image"}</span>
                        <span className="queue-banner-drop-hint">1200 × 480 px recommended</span>
                      </button>
                    )}

                    <div className="merchant-logo-actions">
                      <button
                        type="button"
                        className="merchant-action-btn merchant-action-btn--reject"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={processing}
                      >
                        {hasImage(bannerUrl) ? "Replace" : "Upload"}
                      </button>
                      {hasImage(bannerUrl) && (
                        <button
                          type="button"
                          className="merchant-logo-remove"
                          onClick={clearBanner}
                          aria-label="Remove banner"
                        >
                          <Trash2 size={16} strokeWidth={2.3} />
                        </button>
                      )}
                    </div>
                    <span className="merchant-field-hint">
                      Recommended 1200 × 480 px (5:2). PNG or JPG.
                    </span>
                  </div>

                  <label className="auth-field">
                    <span className="auth-label">Link when tapped (optional)</span>
                    <input
                      className="auth-input"
                      type="url"
                      inputMode="url"
                      placeholder="https://example.com/offer"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                    />
                    <span className="merchant-field-hint">
                      Guests who tap the banner are sent here (e.g. your menu or an offer).
                    </span>
                  </label>

                  <button
                    type="button"
                    className="cta-btn merchant-cta-accent"
                    disabled={!bannerDirty || savingBanner || processing}
                    onClick={saveBanner}
                  >
                    {savingBanner ? "Saving…" : "Save banner"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

export { profilePatchFromHours };
