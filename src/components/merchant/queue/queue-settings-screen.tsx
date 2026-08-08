"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  Check,
  ChevronRight,
  Clock3,
  ImagePlus,
  Trash2,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import {
  DEFAULT_ESTIMATED_WAIT_MINUTES,
  ensureInitialEstimatedWaitMinutes,
  getInitialEstimatedWaitMinutes,
  getWaitEstimateMeta,
  setInitialEstimatedWaitMinutes,
} from "@/lib/merchant/queue-settings";
import {
  type QueueStoreHours,
  validateQueueStoreHours,
} from "@/lib/merchant/queue-hours";
import { fileToBannerDataUrl } from "@/lib/merchant/image";
import type { Branch, MerchantProfile } from "@/lib/merchant/types";
import { MerchantPlanCard } from "../plan-card";
import { ProductBranchesSettings } from "../product-branches-settings";
import { DeviceSetupPanel } from "../device-setup-rows";
import { MerchantQrPanel } from "../qr-panel";
import {
  hoursFromBranch,
  profilePatchFromHours,
  QueueHoursFields,
} from "./queue-hours-fields";

const WAIT_OPTIONS = [5, 8, 10, 12, 15, 20, 30];

type SheetKind = "wait" | "banner" | "autos" | null;

const SHEET_META: Record<Exclude<SheetKind, null>, { title: string; subtitle: string }> = {
  wait: {
    title: "Estimated wait",
    subtitle: "Starting wait for this branch; Froq refines it as guests are seated here",
  },
  banner: {
    title: "Guest banner",
    subtitle: "Image shown on the join screen after a guest joins",
  },
  autos: {
    title: "Auto sessions",
    subtitle: "Start and end the live queue from this branch’s store timings",
  },
};

interface QueueSettingsScreenProps {
  profile: MerchantProfile;
  /** Active / edit branch — wait and autos are scoped to this location. */
  branch?: Branch | null;
  /** Shown in the page subhead so multi-branch merchants know which location. */
  branchLabel?: string | null;
  banner: string;
  bannerLink: string;
  onSaveBanner: (banner: string, bannerLink: string) => Promise<void> | void;
  onSaveHours: (hours: QueueStoreHours) => Promise<void> | void;
  onSaveEstimatedWait?: (minutes: number) => Promise<void> | void;
  /** Persist Queue settings that live on the merchant profile (integrations). */
  onSaveProfile?: (patch: Partial<MerchantProfile>) => Promise<void> | void;
  productEnabled?: boolean;
  onGetStarted?: () => void;
  onManagePlan?: () => void;
  branchSlug?: string | null;
  branchSelected?: boolean;
}

const hasImage = (value: string) => value.trim().length > 0;

export function QueueSettingsScreen({
  profile,
  branch = null,
  branchLabel = null,
  banner,
  bannerLink,
  onSaveBanner,
  onSaveHours,
  onSaveEstimatedWait,
  onSaveProfile,
  productEnabled,
  onGetStarted,
  onManagePlan,
  branchSlug = null,
  branchSelected = true,
}: QueueSettingsScreenProps) {
  const branchId = branch?.id ?? null;
  const [waitMinutes, setWaitMinutes] = useState(DEFAULT_ESTIMATED_WAIT_MINUTES);
  const [waitMeta, setWaitMeta] = useState(() => ({
    minutes: DEFAULT_ESTIMATED_WAIT_MINUTES,
    source: "initial" as "initial" | "learned",
    samples: 0,
  }));
  const [bannerUrl, setBannerUrl] = useState(banner);
  const [linkUrl, setLinkUrl] = useState(bannerLink);
  const [hours, setHours] = useState<QueueStoreHours>(() =>
    hoursFromBranch(branch, profile),
  );
  const [savingBanner, setSavingBanner] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [toggleSaving, setToggleSaving] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [waitReady, setWaitReady] = useState(false);
  const aiMenuEnabled = profile.queueAiMenuEnabled === true;

  async function toggleAiMenu() {
    if (!onSaveProfile || toggleSaving) return;
    setToggleSaving(true);
    try {
      await onSaveProfile({ queueAiMenuEnabled: !aiMenuEnabled });
    } finally {
      setToggleSaving(false);
    }
  }

  useEffect(() => {
    ensureInitialEstimatedWaitMinutes(branchId, branch?.estimatedWaitMinutes);
    setWaitMinutes(getInitialEstimatedWaitMinutes(branchId));
    setWaitMeta(getWaitEstimateMeta(branchId));
    setWaitReady(true);
  }, [branchId, branch?.estimatedWaitMinutes]);

  useEffect(() => {
    setBannerUrl(banner);
  }, [banner]);

  useEffect(() => {
    setLinkUrl(bannerLink);
  }, [bannerLink]);

  useEffect(() => {
    setHours(hoursFromBranch(branch, profile));
  }, [
    branch?.queueOpenTime,
    branch?.queueCloseTime,
    branch?.queueOpenDays,
    branch?.queueAutoStart,
    branch?.queueAutoClose,
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
    const next = setInitialEstimatedWaitMinutes(minutes, branchId);
    setWaitMinutes(next);
    setWaitMeta({ minutes: next, source: "initial", samples: 0 });
    void onSaveEstimatedWait?.(next);
    toast.success(`Initial wait estimate set to ${next} min per party`);
  };

  const autoSummary = [
    hours.autoStart ? "Auto start on" : "Auto start off",
    hours.autoClose ? "auto close on" : "auto close off",
  ].join(" · ");

  const rows: Array<{
    id: Exclude<SheetKind, null>;
    label: string;
    value: ReactNode;
    Icon: typeof Users;
  }> = [
    {
      id: "autos",
      label: "Auto sessions",
      value: autoSummary,
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
        <p className="tab-sub">
          {branchLabel
            ? `Waitlist settings for ${branchLabel}`
            : "Configure how your live waitlist behaves"}
        </p>
      </div>

      <MerchantQrPanel
        profile={profile}
        product="queue"
        branchSlug={branchSlug}
        needsBranch
        branchSelected={branchSelected}
      />

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

      <div className="merchant-settings-group">
        <h3 className="merchant-settings-title">Integrations</h3>
        <div className="panel-card merchant-settings-panel">
          <div className="merchant-settings-row" style={{ cursor: "default" }}>
            <div className="profile-row-icon">
              <UtensilsCrossed size={18} strokeWidth={2.2} />
            </div>
            <div className="profile-row-copy">
              <div className="profile-row-label">AI Menu</div>
              <div className="profile-row-value profile-row-value--soft">
                {aiMenuEnabled
                  ? "Waitlist shows View our AI menu · queue_first_notify_menu / seated_menu"
                  : "Off — standard queue WhatsApp templates"}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={aiMenuEnabled}
              aria-label="Enable AI Menu integration on Queue"
              className={`merchant-toggle${aiMenuEnabled ? " on" : ""}`}
              disabled={toggleSaving || !onSaveProfile}
              onClick={() => void toggleAiMenu()}
            >
              <span className="merchant-toggle-knob" />
            </button>
          </div>
        </div>
      </div>

      <ProductBranchesSettings product="queue" />

      <MerchantPlanCard
        product="queue"
        enabled={productEnabled}
        onGetStarted={onGetStarted}
        onManagePlan={onManagePlan}
      />

      <DeviceSetupPanel />

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
              {sheet === "autos" && (
                <>
                  <span className="merchant-field-hint" style={{ display: "block", marginBottom: 12 }}>
                    Uses store timings from Business settings → Branch
                    {branchLabel ? ` · ${branchLabel}` : ""}.
                  </span>
                  <QueueHoursFields autosOnly value={hours} onChange={setHours} />
                  <button
                    type="button"
                    className="cta-btn merchant-cta-accent"
                    disabled={savingHours}
                    onClick={() => void saveHours()}
                  >
                    {savingHours ? "Saving…" : "Save"}
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
