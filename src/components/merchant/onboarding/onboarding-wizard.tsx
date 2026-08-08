"use client";

import { FROQ_LOGO_SRC } from "@/lib/brand";

import { useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  Gift,
  ImagePlus,
  Link2,
  Lock,
  MapPin,
  Palette,
  PartyPopper,
  QrCode,
  Receipt,
  ShieldCheck,
  Sparkles,
  Store,
  Timer,
  TrendingUp,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { BRAND_COLORS, FIELD_LIMITS } from "@/lib/merchant/constants";
import { fileToLogoDataUrl, LOGO_UPLOAD_HINT } from "@/lib/merchant/image";
import {
  COOLDOWN_VALUE_OPTIONS,
  STAMP_OPTIONS,
  WAIT_OPTIONS,
  buildOnboardingSteps,
  canAdvanceStep,
  emptyOnboardingDraft,
  type OnboardingDraft,
  type OnboardingMode,
  type OnboardingStep,
} from "@/lib/merchant/onboarding";
import { maxActiveBranches } from "@/lib/merchant/branch-assignments";
import type { Entitlements } from "@/lib/merchant/entitlements";
import { setInitialEstimatedWaitMinutes } from "@/lib/merchant/queue-settings";
import {
  formatHoursSummary,
  formatTimeForInput,
  QUEUE_HOURS_TIMEZONE,
} from "@/lib/merchant/queue-hours";
import {
  completeProductOnboarding,
  createBranch,
  createMerchant,
  updateMainBranchEstimatedWait,
  updateMerchantProfile,
} from "@/app/merchant/actions";
import type { CheckoutAccount } from "@/lib/merchant/checkout";
import type { Branch, MerchantProduct, MerchantProfile } from "@/lib/merchant/types";
import { PRODUCTS } from "@/lib/merchant/nav";
import {
  hoursFromProfile,
  QueueHoursFields,
} from "@/components/merchant/queue/queue-hours-fields";
import { MenuTaxFields } from "@/components/merchant/menu/menu-tax-fields";
import { ReservationSettingsFields } from "@/components/merchant/reservations/reservation-settings-fields";
import { DEFAULT_RESERVATION_SETTINGS } from "@/lib/merchant/reservations";
import {
  REWARD_COOLDOWN_UNITS,
  formatRewardCooldown,
  type RewardCooldownUnit,
} from "@/lib/loyalty/rules";
import { OnboardingVerifyStep } from "./onboarding-verify-step";
import {
  applyPlaceToDraft,
  BranchContactFields,
  BranchLinkFields,
  BranchLocationFields,
  EMPTY_BRANCH_DRAFT,
  type BranchDraft,
} from "@/components/merchant/branch-fields";

const BRANCH_FIELD_TO_DRAFT: Record<keyof BranchDraft, keyof OnboardingDraft> = {
  name: "branchName",
  address: "address",
  phone: "storePhone",
  email: "storeEmail",
  websiteUrl: "websiteUrl",
  instagramUrl: "instagramUrl",
  facebookUrl: "facebookUrl",
  xUrl: "xUrl",
  googleBusinessUrl: "googleBusinessUrl",
  googlePlaceId: "googlePlaceId",
  googleMapsUrl: "googleMapsUrl",
};

function reservationProfilePatch(draft: OnboardingDraft, options?: { includeHours?: boolean }) {
  const includeHours = options?.includeHours !== false;
  return {
    reservationMaxPartySize: draft.reservationMaxPartySize,
    reservationIntervalMinutes: draft.reservationIntervalMinutes,
    ...(includeHours
      ? {
          reservationOpenTime: draft.reservationOpenTime,
          reservationCloseTime: draft.reservationCloseTime,
        }
      : {}),
    reservationAllowSameDay: draft.reservationAllowSameDay,
  };
}

function menuProfilePatch(draft: OnboardingDraft) {
  return {
    menuCgstPercent: draft.menuCgstPercent,
    menuSgstPercent: draft.menuSgstPercent,
    menuServiceChargePercent: draft.menuServiceChargePercent,
  };
}

/** Queue + reservation columns from the shared store-hours step. */
function storeHoursProfilePatch(draft: OnboardingDraft) {
  return {
    queueOpenTime: draft.queueOpenTime,
    queueCloseTime: draft.queueCloseTime,
    queueHoursTimezone: QUEUE_HOURS_TIMEZONE,
    queueOpenDays: draft.queueOpenDays,
    // Seating window follows the same store hours — no second prompt.
    reservationOpenTime: draft.queueOpenTime,
    reservationCloseTime: draft.queueCloseTime,
  };
}

function seedDraftFromProfile(
  draft: OnboardingDraft,
  profile: MerchantProfile | null | undefined,
): OnboardingDraft {
  if (!profile) return draft;
  const hours = hoursFromProfile(profile);
  const open = formatTimeForInput(hours.openTime);
  const close = formatTimeForInput(hours.closeTime);
  return {
    ...draft,
    queueOpenTime: open,
    queueCloseTime: close,
    queueOpenDays: [...hours.openDays],
    queueAutoStart: hours.autoStart,
    queueAutoClose: hours.autoClose,
    // Seating follows store hours — don't keep a stale reservation default window.
    reservationOpenTime: open,
    reservationCloseTime: close,
    reservationMaxPartySize:
      profile.reservationMaxPartySize || draft.reservationMaxPartySize,
    reservationIntervalMinutes:
      profile.reservationIntervalMinutes || draft.reservationIntervalMinutes,
    reservationAllowSameDay:
      profile.reservationAllowSameDay ?? draft.reservationAllowSameDay,
    // ?? rather than ||: a rate they already set to 0 is a decision to keep.
    menuCgstPercent: profile.menuCgstPercent ?? draft.menuCgstPercent,
    menuSgstPercent: profile.menuSgstPercent ?? draft.menuSgstPercent,
    menuServiceChargePercent:
      profile.menuServiceChargePercent ?? draft.menuServiceChargePercent,
  };
}

/** Product-mode: auto-select the only global branch when there's exactly one. */
function seedBranchSelection(
  draft: OnboardingDraft,
  branches: Branch[],
): OnboardingDraft {
  if (branches.length === 1) {
    return { ...draft, selectedBranchIds: [branches[0].id] };
  }
  return draft;
}

function planPathForProduct(product: MerchantProduct): string {
  if (product === "queue") return "/merchant/queue/plan";
  if (product === "reservation") return "/merchant/reservations/plan";
  if (product === "menu") return "/merchant/menu/plan";
  return "/merchant/loyalty/plan";
}

interface OnboardingWizardProps {
  mode: OnboardingMode;
  product: MerchantProduct;
  checkoutAccount?: CheckoutAccount | null;
  /** Existing store profile — seeds hours when activating an extra product. */
  profile?: MerchantProfile | null;
  /** Global branches for product-mode selection (existing merchants). */
  branches?: Branch[];
  /** Needed to enforce per-product activation caps on the branches step. */
  entitlements?: Entitlements | null;
  onComplete: () => void | Promise<void>;
}

const INTRO_FEATURES: Array<{ Icon: typeof Sparkles; title: string; desc: string }> = [
  { Icon: TrendingUp, title: "Lifetime-value insights", desc: "See what every customer is worth." },
  { Icon: Zap, title: "One-tap operations", desc: "Approve stamps and calls instantly." },
  { Icon: QrCode, title: "Your own branded QR", desc: "Customers join in seconds." },
];

const STEP_HEAD: Record<
  OnboardingStep,
  { Icon: typeof Sparkles; title: string; desc: string }
> = {
  intro: { Icon: Sparkles, title: "Welcome to Froq", desc: "" },
  identity: { Icon: Store, title: "Your business", desc: "Add your name, business, and logo." },
  location: {
    Icon: MapPin,
    title: "Your first location",
    desc: "Find it on Google and we'll set it up as your main branch.",
  },
  verify: {
    Icon: ShieldCheck,
    title: "Verify contact",
    desc: "Confirm your email and mobile before branding.",
  },
  color: { Icon: Palette, title: "Brand color", desc: "Pick the color customers see." },
  contact: {
    Icon: Link2,
    title: "Contact & links",
    desc: "How customers reach your main branch, online and offline.",
  },
  hours: {
    Icon: Timer,
    title: "Store timings",
    desc: "When your main branch is open — used by Queue and Reservations.",
  },
  branches: {
    Icon: MapPin,
    title: "Select branches",
    desc: "Choose which locations will use this product.",
  },
  reward: { Icon: Gift, title: "Your reward", desc: "Set up the reward customers earn." },
  queue: {
    Icon: Users,
    title: "Queue setup",
    desc: "Wait times, auto sessions, and your floor plan.",
  },
  reservation: {
    Icon: CalendarCheck,
    title: "Reservations setup",
    desc: "Slot spacing, party size, and your floor plan.",
  },
  menu: {
    Icon: Receipt,
    title: "Menu billing",
    desc: "What a table order adds on top of your menu prices.",
  },
  outro: { Icon: PartyPopper, title: "You're all set!", desc: "" },
};

export function OnboardingWizard({
  mode,
  product,
  checkoutAccount,
  profile = null,
  branches: initialBranches = [],
  entitlements = null,
  onComplete,
}: OnboardingWizardProps) {
  const steps = buildOnboardingSteps(mode, product);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(() =>
    seedBranchSelection(
      seedDraftFromProfile(emptyOnboardingDraft(checkoutAccount), profile),
      initialBranches,
    ),
  );
  const [knownBranches, setKnownBranches] = useState<Branch[]>(initialBranches);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const rewardInputRef = useRef<HTMLInputElement>(null);

  const productMeta = PRODUCTS.find((p) => p.id === product) ?? PRODUCTS[0];
  const current = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const head =
    current === "branches" && knownBranches.length === 0
      ? {
          Icon: MapPin,
          title: "Create your first branch",
          desc: "Locations are shared across every Froq product.",
        }
      : current === "branches" && knownBranches.length === 1
        ? {
            Icon: MapPin,
            title: "Select branch",
            desc: `${productMeta.name} will run at this location. You can change this later.`,
          }
        : current === "branches"
          ? {
              Icon: MapPin,
              title: `Which branches will use ${productMeta.name}?`,
              desc: "Pick the locations to activate on your current plan.",
            }
          : STEP_HEAD[current];
  const Icon = head.Icon;
  const maxActive = entitlements
    ? maxActiveBranches(product, entitlements)
    : Number.POSITIVE_INFINITY;
  const advanceOpts = {
    existingBranchCount: knownBranches.length,
    maxActiveBranches: maxActive,
  };

  function update<K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleBranchSelection(branchId: string) {
    setDraft((prev) => {
      const selected = prev.selectedBranchIds.includes(branchId);
      if (selected) {
        return {
          ...prev,
          selectedBranchIds: prev.selectedBranchIds.filter((id) => id !== branchId),
        };
      }
      if (prev.selectedBranchIds.length >= maxActive) return prev;
      return { ...prev, selectedBranchIds: [...prev.selectedBranchIds, branchId] };
    });
  }

  // Onboarding fills in the main branch, so it edits the same field groups the
  // branches drawer and business settings use — through a flat-draft adapter.
  const branchDraft: BranchDraft = {
    name: draft.branchName,
    address: draft.address,
    phone: draft.storePhone,
    email: draft.storeEmail,
    websiteUrl: draft.websiteUrl,
    instagramUrl: draft.instagramUrl,
    facebookUrl: draft.facebookUrl,
    xUrl: draft.xUrl,
    googleBusinessUrl: draft.googleBusinessUrl,
    googlePlaceId: draft.googlePlaceId,
    googleMapsUrl: draft.googleMapsUrl,
  };

  function setBranchField(key: keyof BranchDraft, value: string) {
    setDraft((prev) => ({ ...prev, [BRANCH_FIELD_TO_DRAFT[key]]: value }));
  }

  async function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    update("logoDataUrl", await fileToLogoDataUrl(file));
    input.value = "";
  }

  async function handleRewardUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    update("rewardImageDataUrl", await fileToLogoDataUrl(file));
    input.value = "";
  }

  async function persist(): Promise<{ ok: boolean; error?: string }> {
    if (mode === "full") {
      const res = await createMerchant({
        businessName: draft.businessName.trim() || checkoutAccount?.businessName || "My Shop",
        ownerFirstName: draft.firstName.trim() || undefined,
        ownerLastName: draft.lastName.trim() || undefined,
        brandColor: draft.brandColor,
        logoDataUrl: draft.logoDataUrl,
        branchName: draft.branchName.trim() || undefined,
        address: draft.address,
        storePhone: draft.storePhone.trim() || undefined,
        storeEmail: draft.storeEmail.trim() || undefined,
        websiteUrl: draft.websiteUrl.trim() || undefined,
        googleBusinessUrl: draft.googleBusinessUrl.trim() || undefined,
        googlePlaceId: draft.googlePlaceId.trim() || undefined,
        googleMapsUrl: draft.googleMapsUrl.trim() || undefined,
        instagramUrl: draft.instagramUrl.trim() || undefined,
        facebookUrl: draft.facebookUrl.trim() || undefined,
        xUrl: draft.xUrl.trim() || undefined,
        rewardTitle: draft.rewardTitle.trim() || undefined,
        rewardName: draft.rewardName.trim() || "Free reward",
        rewardImageDataUrl: draft.rewardImageDataUrl,
        totalStamps: draft.totalStamps,
        rewardCooldownValue: draft.rewardCooldownValue,
        rewardCooldownUnit: draft.rewardCooldownUnit,
        product,
      });
      if (!res.ok) return res;

      // Store hours once — seeds queue branch hours and the reservation window.
      const hoursSaved = await updateMerchantProfile({
        ...storeHoursProfilePatch(draft),
        ...(product === "queue"
          ? {
              queueAutoStart: draft.queueAutoStart,
              queueAutoClose: draft.queueAutoClose,
            }
          : {}),
        ...(product === "reservation" ? reservationProfilePatch(draft, { includeHours: false }) : {}),
        ...(product === "menu" ? menuProfilePatch(draft) : {}),
      });
      if (!hoursSaved.ok) return hoursSaved;

      if (product === "queue") {
        setInitialEstimatedWaitMinutes(draft.estimatedWaitMinutes);
        await updateMainBranchEstimatedWait(draft.estimatedWaitMinutes);
      }
      return res;
    }

    // Product-only onboarding for an existing store — don't re-ask for hours.
    // Align reservation seating with the store hours already on the profile.
    if (product === "reservation") {
      const saved = await updateMerchantProfile({
        ...reservationProfilePatch(draft, { includeHours: false }),
        reservationOpenTime: draft.queueOpenTime,
        reservationCloseTime: draft.queueCloseTime,
      });
      if (!saved.ok) return saved;
    } else if (product === "queue") {
      setInitialEstimatedWaitMinutes(draft.estimatedWaitMinutes);
      const saved = await updateMerchantProfile({
        queueAutoStart: draft.queueAutoStart,
        queueAutoClose: draft.queueAutoClose,
      });
      if (!saved.ok) return saved;
      await updateMainBranchEstimatedWait(draft.estimatedWaitMinutes);
    } else if (product === "menu") {
      // Only the tax columns. This merchant may already run Loyalty, and the
      // reward branch below would overwrite their reward with a placeholder.
      const saved = await updateMerchantProfile(menuProfilePatch(draft));
      if (!saved.ok) return saved;
    } else {
      const saved = await updateMerchantProfile({
        rewardTitle: draft.rewardTitle.trim() || "Free reward",
        rewardName: draft.rewardName.trim() || "Free reward",
        rewardImageDataUrl: draft.rewardImageDataUrl,
        totalStamps: draft.totalStamps,
        rewardCooldownValue: draft.rewardCooldownValue,
        rewardCooldownUnit: draft.rewardCooldownUnit,
      });
      if (!saved.ok) return saved;
    }
    return completeProductOnboarding(product, draft.selectedBranchIds);
  }

  async function finish() {
    setSubmitting(true);
    setError("");
    try {
      const res = await persist();
      if (!res.ok) {
        setError(res.error ?? "Something went wrong. Please try again.");
        setStepIndex((s) => Math.max(0, s - 1));
        return;
      }
      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStepIndex((s) => Math.max(0, s - 1));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNext() {
    if (!canAdvanceStep(current, draft, advanceOpts) || submitting) return;

    // Scenario 0: create the first global branch, auto-assign to this product.
    if (current === "branches" && knownBranches.length === 0) {
      const name = draft.newBranchName.trim();
      if (!name) return;
      setSubmitting(true);
      setError("");
      try {
        const res = await createBranch({
          name,
          assignToProduct: product,
        });
        if (!res.ok || !res.branchId) {
          setError(res.error ?? "Could not create branch.");
          return;
        }
        const created: Branch = {
          id: res.branchId,
          name,
          slug: "",
          isDefault: true,
          address: "",
          phone: "",
          email: "",
          websiteUrl: "",
          instagramUrl: "",
          facebookUrl: "",
          xUrl: "",
          googleBusinessUrl: "",
          googlePlaceId: "",
          googleMapsUrl: "",
          queueOpenTime: draft.queueOpenTime,
          queueCloseTime: draft.queueCloseTime,
          queueHoursTimezone: QUEUE_HOURS_TIMEZONE,
          queueOpenDays: [...draft.queueOpenDays],
          queueAutoStart: draft.queueAutoStart,
          queueAutoClose: draft.queueAutoClose,
          estimatedWaitMinutes: draft.estimatedWaitMinutes,
        };
        setKnownBranches([created]);
        setDraft((prev) => ({
          ...prev,
          selectedBranchIds: [res.branchId!],
          newBranchName: "",
        }));
        setStepIndex((s) => s + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create branch.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (isLast) {
      void finish();
      return;
    }
    setStepIndex((s) => s + 1);
  }

  const isHero = current === "intro" || current === "outro";
  const introTitle = mode === "full" ? "Welcome to Froq" : `Set up ${productMeta.name}`;
  const introDesc =
    mode === "full"
      ? "Let's set up your business and your first product in a few quick steps."
      : `You've added ${productMeta.name}. Let's configure it — this only takes a moment.`;

  return (
    <div className="merchant-page merchant-theme">
      <div className="merchant-screen wizard-screen">
        <div className="wizard-top">
          <div className="wizard-progress">
            <span className="wizard-step-count">
              Step {stepIndex + 1} of {steps.length}
            </span>
            <div className="wizard-dots" aria-hidden="true">
              {steps.map((_, index) => (
                <span
                  key={index}
                  className={`wizard-dot${index === stepIndex ? " active" : ""}${
                    index < stepIndex ? " done" : ""
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {isHero ? (
          <div className={`wizard-body${current === "intro" ? " wizard-body--intro" : ""}`}>
            {current === "intro" ? (
              <div className="wizard-logo-badge" key={current}>
                <Image src={FROQ_LOGO_SRC} alt="Froq" width={72} height={72} priority />
              </div>
            ) : (
              <div className="wizard-icon-badge" key={current}>
                <Icon size={44} strokeWidth={2} className="wizard-icon wizard-anim-pop" />
              </div>
            )}
            <h1 className="wizard-title">{current === "intro" ? introTitle : head.title}</h1>
            <p className="wizard-desc">{current === "intro" ? introDesc : "Your setup is ready."}</p>

            {current === "intro" && mode === "full" && (
              <ul className="wizard-features">
                {INTRO_FEATURES.map(({ Icon: FeatureIcon, title, desc }) => (
                  <li key={title} className="wizard-feature">
                    <span className="wizard-feature-icon">
                      <FeatureIcon size={18} strokeWidth={2.2} />
                    </span>
                    <span className="wizard-feature-copy">
                      <span className="wizard-feature-title">{title}</span>
                      <span className="wizard-feature-desc">{desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {current === "outro" && (
              <div className="wizard-summary">
                {mode === "full" && (
                  <>
                    <SummaryRow
                      label="Business"
                      value={draft.businessName.trim() || "—"}
                    />
                    <SummaryRow
                      label="Brand color"
                      value={BRAND_COLORS.find((c) => c.value === draft.brandColor)?.name ?? "Custom"}
                      swatch={draft.brandColor}
                    />
                  </>
                )}
                <SummaryRow label="Product" value={productMeta.name} />
                {mode === "product" && draft.selectedBranchIds.length > 0 ? (
                  <SummaryRow
                    label="Branches"
                    value={knownBranches
                      .filter((b) => draft.selectedBranchIds.includes(b.id))
                      .map((b) => b.name)
                      .join(", ")}
                  />
                ) : null}
                {mode === "full" || product === "queue" || product === "reservation" ? (
                  <SummaryRow
                    label="Hours"
                    value={formatHoursSummary({
                      openTime: draft.queueOpenTime,
                      closeTime: draft.queueCloseTime,
                      openDays: draft.queueOpenDays,
                      autoStart: draft.queueAutoStart,
                      autoClose: draft.queueAutoClose,
                    })}
                  />
                ) : null}
                {product === "loyalty" ? (
                  <SummaryRow label="Reward" value={draft.rewardName.trim() || "—"} />
                ) : null}
                {product === "queue" ? (
                  <SummaryRow
                    label="Est. wait"
                    value={`${draft.estimatedWaitMinutes} min / party`}
                  />
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div className="wizard-scroll" key={current}>
            <div className="wizard-form-head">
              <div className="wizard-form-icon">
                <Icon size={22} strokeWidth={2.2} />
              </div>
              <h1 className="wizard-title">{head.title}</h1>
              <p className="wizard-desc">{head.desc}</p>
            </div>

            {current === "identity" && (
              <div className="panel-card merchant-edit-panel">
                <div className="merchant-logo-field">
                  <span className="auth-label">Business logo</span>
                  <div className="merchant-logo-upload">
                    <div className="merchant-logo-preview">
                      {draft.logoDataUrl ? (
                        <Image
                          src={draft.logoDataUrl}
                          alt="Business logo"
                          width={64}
                          height={64}
                          unoptimized
                        />
                      ) : (
                        <ImagePlus size={22} strokeWidth={2} />
                      )}
                    </div>
                    <div className="merchant-logo-actions">
                      <button
                        type="button"
                        className="merchant-action-btn merchant-action-btn--reject"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {draft.logoDataUrl ? "Replace" : "Upload"}
                      </button>
                      {draft.logoDataUrl && (
                        <button
                          type="button"
                          className="merchant-logo-remove"
                          onClick={() => update("logoDataUrl", undefined)}
                          aria-label="Remove logo"
                        >
                          <Trash2 size={16} strokeWidth={2.3} />
                        </button>
                      )}
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="merchant-file-input"
                      onChange={(event) => void handleLogoUpload(event)}
                    />
                  </div>
                  <span className="merchant-field-hint">{LOGO_UPLOAD_HINT}</span>
                </div>

                <div className="wizard-field-row">
                  <WizardField
                    label="First name"
                    value={draft.firstName}
                    maxLength={40}
                    placeholder="Alex"
                    onChange={(v) => update("firstName", v)}
                  />
                  <WizardField
                    label="Last name"
                    value={draft.lastName}
                    maxLength={40}
                    placeholder="Morgan"
                    onChange={(v) => update("lastName", v)}
                  />
                </div>

                <WizardField
                  label="Business name"
                  value={draft.businessName}
                  maxLength={FIELD_LIMITS.businessName}
                  placeholder="Bloom Coffee Co."
                  onChange={(v) => update("businessName", v)}
                />
              </div>
            )}

            {current === "verify" && (
              <OnboardingVerifyStep
                email={checkoutAccount?.email ?? ""}
                phone={checkoutAccount?.phone ?? ""}
                emailVerified={draft.emailVerified}
                phoneVerified={draft.phoneVerified}
                onEmailVerified={() => update("emailVerified", true)}
                onPhoneVerified={() => update("phoneVerified", true)}
              />
            )}

            {current === "location" && (
              <div className="panel-card merchant-edit-panel wizard-location-panel">
                <BranchLocationFields
                  autoFocus
                  grouped={false}
                  draft={{
                    ...EMPTY_BRANCH_DRAFT,
                    name: draft.branchName,
                    address: draft.address,
                    googlePlaceId: draft.googlePlaceId,
                    googleMapsUrl: draft.googleMapsUrl,
                  }}
                  businessName={draft.businessName}
                  searchPlaceholder="Search business name or Google listing…"
                  searchHint=""
                  onChange={(key, value) => {
                    if (key === "name") update("branchName", value);
                    else if (key === "address") update("address", value);
                    else if (key === "googlePlaceId") update("googlePlaceId", value);
                    else if (key === "googleMapsUrl") update("googleMapsUrl", value);
                  }}
                  onApplyPlace={(place) => {
                    // The listing names the business; the main branch takes the
                    // area name so later branches stay tellable apart.
                    const next = applyPlaceToDraft(EMPTY_BRANCH_DRAFT, place);
                    setDraft((prev) => ({
                      ...prev,
                      businessName: place.name,
                      branchName: next.name || prev.branchName,
                      address: next.address || prev.address,
                      googlePlaceId: next.googlePlaceId,
                      googleMapsUrl: next.googleMapsUrl,
                    }));
                  }}
                />
              </div>
            )}

            {current === "color" && (
              <div className="panel-card merchant-edit-panel">
                <div className="merchant-color-field">
                  <span className="auth-label">Brand color</span>
                  <div className="merchant-color-grid" role="radiogroup" aria-label="Brand color">
                    {BRAND_COLORS.map((color) => {
                      const isSelected = draft.brandColor === color.value;
                      return (
                        <button
                          key={color.value}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          aria-label={color.name}
                          title={color.name}
                          className={`merchant-color-swatch${isSelected ? " selected" : ""}`}
                          style={{ background: color.value }}
                          onClick={() => update("brandColor", color.value)}
                        >
                          {isSelected && <Check size={16} strokeWidth={3} />}
                        </button>
                      );
                    })}
                  </div>
                  <span className="merchant-field-hint">Used on your customer-facing pages.</span>
                </div>
              </div>
            )}

            {current === "contact" && (
              <div className="panel-card merchant-edit-panel wizard-contact-panel">
                <BranchContactFields draft={branchDraft} onChange={setBranchField} />
                <BranchLinkFields draft={branchDraft} onChange={setBranchField} />
              </div>
            )}

            {current === "hours" && (
              <div className="panel-card merchant-edit-panel">
                <div className="wizard-queue-hours">
                  <span className="auth-label">When are you open?</span>
                  <span
                    className="merchant-field-hint"
                    style={{ display: "block", marginBottom: 12 }}
                  >
                    Set once for your main branch. Queue and Reservations both use these hours —
                    you can change them later in settings.
                  </span>
                  <QueueHoursFields
                    compact
                    hideAutos
                    value={{
                      openTime: draft.queueOpenTime,
                      closeTime: draft.queueCloseTime,
                      openDays: draft.queueOpenDays,
                      autoStart: draft.queueAutoStart,
                      autoClose: draft.queueAutoClose,
                    }}
                    onChange={(hours) =>
                      setDraft((prev) => ({
                        ...prev,
                        queueOpenTime: hours.openTime,
                        queueCloseTime: hours.closeTime,
                        queueOpenDays: hours.openDays,
                        // Keep reservation seating aligned with store hours.
                        reservationOpenTime: hours.openTime,
                        reservationCloseTime: hours.closeTime,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {current === "branches" && knownBranches.length === 0 && (
              <div className="panel-card merchant-edit-panel">
                <WizardField
                  label="Branch name"
                  value={draft.newBranchName}
                  maxLength={FIELD_LIMITS.businessName}
                  placeholder="Mumbai"
                  onChange={(v) => update("newBranchName", v)}
                />
                <span className="merchant-field-hint">
                  Saved to your account and activated for {productMeta.name}. Other products can
                  reuse it later.
                </span>
              </div>
            )}

            {current === "branches" && knownBranches.length > 0 && (
              <div className="panel-card merchant-edit-panel wizard-branches-panel">
                {Number.isFinite(maxActive) && (
                  <p className="wizard-branches-limit">
                    Plan limit · {draft.selectedBranchIds.length} of {maxActive} active{" "}
                    {maxActive === 1 ? "branch" : "branches"}
                  </p>
                )}
                <div className="wizard-branches-list" role="group" aria-label="Branches">
                  {knownBranches.map((branch) => {
                    const checked = draft.selectedBranchIds.includes(branch.id);
                    const locked =
                      !checked && draft.selectedBranchIds.length >= maxActive;
                    return (
                      <button
                        key={branch.id}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        disabled={locked}
                        className={`wizard-branch-row${checked ? " is-selected" : ""}${
                          locked ? " is-locked" : ""
                        }`}
                        onClick={() => {
                          if (locked) return;
                          toggleBranchSelection(branch.id);
                        }}
                      >
                        <span
                          className={`wizard-branch-check${checked ? " is-on" : ""}${
                            locked ? " is-locked" : ""
                          }`}
                          aria-hidden="true"
                        >
                          {checked ? (
                            <Check size={14} strokeWidth={3} />
                          ) : locked ? (
                            <Lock size={12} strokeWidth={2.4} />
                          ) : null}
                        </span>
                        <span className="wizard-branch-copy">
                          <span className="wizard-branch-name">{branch.name}</span>
                          {branch.address ? (
                            <span className="wizard-branch-address">{branch.address}</span>
                          ) : null}
                          {locked ? (
                            <span className="wizard-branch-locked-hint">
                              Upgrade to activate
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {draft.selectedBranchIds.length >= maxActive &&
                knownBranches.length > maxActive ? (
                  <Link
                    href={planPathForProduct(product)}
                    className="wizard-branches-upgrade"
                  >
                    Upgrade plan to activate more branches
                  </Link>
                ) : null}
              </div>
            )}

            {current === "reward" && (
              <div className="panel-card merchant-edit-panel">
                <WizardField
                  label="Offer title"
                  value={draft.rewardTitle}
                  maxLength={FIELD_LIMITS.rewardTitle}
                  placeholder="Buy 4 coffees, get your 5th free"
                  onChange={(v) => update("rewardTitle", v)}
                />
                <WizardField
                  label="Reward name"
                  value={draft.rewardName}
                  maxLength={FIELD_LIMITS.rewardName}
                  placeholder="Free coffee"
                  onChange={(v) => update("rewardName", v)}
                />
                <div className="merchant-logo-field">
                  <span className="auth-label">Reward image</span>
                  <div className="merchant-logo-upload">
                    <div className="merchant-logo-preview">
                      {draft.rewardImageDataUrl ? (
                        <Image
                          src={draft.rewardImageDataUrl}
                          alt="Reward"
                          width={64}
                          height={64}
                          unoptimized
                        />
                      ) : (
                        <ImagePlus size={22} strokeWidth={2} />
                      )}
                    </div>
                    <div className="merchant-logo-actions">
                      <button
                        type="button"
                        className="merchant-action-btn merchant-action-btn--reject"
                        onClick={() => rewardInputRef.current?.click()}
                      >
                        {draft.rewardImageDataUrl ? "Replace" : "Upload"}
                      </button>
                      {draft.rewardImageDataUrl && (
                        <button
                          type="button"
                          className="merchant-logo-remove"
                          onClick={() => update("rewardImageDataUrl", undefined)}
                          aria-label="Remove reward image"
                        >
                          <Trash2 size={16} strokeWidth={2.3} />
                        </button>
                      )}
                    </div>
                    <input
                      ref={rewardInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="merchant-file-input"
                      onChange={(event) => void handleRewardUpload(event)}
                    />
                  </div>
                </div>
                <label className="auth-field">
                  <span className="auth-label">Stamps to earn a reward</span>
                  <select
                    className="auth-input"
                    value={draft.totalStamps}
                    onChange={(e) => update("totalStamps", Number(e.target.value))}
                  >
                    {STAMP_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} stamps
                      </option>
                    ))}
                  </select>
                </label>
                <div className="auth-field">
                  <span className="auth-label">Wait before next reward</span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <select
                      className="auth-input"
                      style={{ flex: 1 }}
                      value={draft.rewardCooldownValue}
                      onChange={(e) =>
                        update("rewardCooldownValue", Number(e.target.value))
                      }
                    >
                      {COOLDOWN_VALUE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n === 0 ? "No wait" : n}
                        </option>
                      ))}
                    </select>
                    <select
                      className="auth-input"
                      style={{ flex: 1 }}
                      value={draft.rewardCooldownUnit}
                      disabled={draft.rewardCooldownValue <= 0}
                      onChange={(e) =>
                        update(
                          "rewardCooldownUnit",
                          e.target.value as RewardCooldownUnit,
                        )
                      }
                    >
                      {REWARD_COOLDOWN_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="merchant-field-hint">
                    Reward QR stays locked for{" "}
                    {formatRewardCooldown(
                      draft.rewardCooldownValue,
                      draft.rewardCooldownUnit,
                    ).toLowerCase()}{" "}
                    after unlocking; the next stamp card uses the same wait after redeem. Changing
                    this later only applies to new rewards.
                  </span>
                </div>
              </div>
            )}

            {current === "queue" && (
              <div className="panel-card merchant-edit-panel">
                <label className="auth-field">
                  <span className="auth-label">
                    <Timer size={14} strokeWidth={2.2} /> Estimated wait per party
                  </span>
                  <select
                    className="auth-input"
                    value={draft.estimatedWaitMinutes}
                    onChange={(e) => update("estimatedWaitMinutes", Number(e.target.value))}
                  >
                    {WAIT_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} minutes
                      </option>
                    ))}
                  </select>
                  <span className="merchant-field-hint">
                    We&apos;ll refine this automatically from real seating times.
                  </span>
                </label>

                <div className="wizard-queue-hours">
                  <span className="auth-label">Auto sessions</span>
                  <span className="merchant-field-hint" style={{ display: "block", marginBottom: 12 }}>
                    Uses the store timings you set earlier. Turn auto start and auto close on
                    independently.
                  </span>
                  <QueueHoursFields
                    compact
                    autosOnly
                    value={{
                      openTime: draft.queueOpenTime,
                      closeTime: draft.queueCloseTime,
                      openDays: draft.queueOpenDays,
                      autoStart: draft.queueAutoStart,
                      autoClose: draft.queueAutoClose,
                    }}
                    onChange={(hours) =>
                      setDraft((prev) => ({
                        ...prev,
                        queueAutoStart: hours.autoStart,
                        queueAutoClose: hours.autoClose,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {current === "reservation" && (
              <div className="panel-card merchant-edit-panel">
                <div className="wizard-queue-hours">
                  <span className="auth-label">Booking rules</span>
                  <span className="merchant-field-hint" style={{ display: "block", marginBottom: 12 }}>
                    Guests book inside your store timings. Set how slots are spaced and how large
                    a party you take — notes and reminders are in settings.
                  </span>
                  <ReservationSettingsFields
                    compact
                    hideSeatingTimes
                    value={{
                      ...DEFAULT_RESERVATION_SETTINGS,
                      maxPartySize: draft.reservationMaxPartySize,
                      intervalMinutes: draft.reservationIntervalMinutes,
                      openTime: draft.reservationOpenTime,
                      closeTime: draft.reservationCloseTime,
                      allowSameDay: draft.reservationAllowSameDay,
                    }}
                    onChange={(settings) =>
                      setDraft((prev) => ({
                        ...prev,
                        reservationMaxPartySize: settings.maxPartySize,
                        reservationIntervalMinutes: settings.intervalMinutes,
                        reservationAllowSameDay: settings.allowSameDay,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {current === "menu" && (
              <div className="panel-card merchant-edit-panel">
                <span className="merchant-field-hint" style={{ display: "block", marginBottom: 12 }}>
                  Guests see these on the cart before they order. Common for
                  restaurants here is 2.5% CGST with 2.5% SGST — change them to
                  match your registration, and set any to 0 to leave it off.
                </span>
                <MenuTaxFields
                  value={{
                    cgstPercent: draft.menuCgstPercent,
                    sgstPercent: draft.menuSgstPercent,
                    serviceChargePercent: draft.menuServiceChargePercent,
                  }}
                  onChange={(rates) =>
                    setDraft((prev) => ({
                      ...prev,
                      menuCgstPercent: rates.cgstPercent,
                      menuSgstPercent: rates.sgstPercent,
                      menuServiceChargePercent: rates.serviceChargePercent,
                    }))
                  }
                />
              </div>
            )}
          </div>
        )}

        <div className="wizard-footer">
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="cta-btn merchant-cta-accent"
            onClick={() => void handleNext()}
            disabled={!canAdvanceStep(current, draft, advanceOpts) || submitting}
          >
            {submitting
              ? "Saving…"
              : isLast
                ? "Go to dashboard"
                : current === "intro"
                  ? "Get started"
                  : "Continue"}
            {!isLast && !submitting && <ArrowRight size={17} strokeWidth={2.4} />}
          </button>
          {stepIndex > 0 && !isLast && (
            <button
              type="button"
              className="wizard-back"
              onClick={() => setStepIndex((s) => s - 1)}
            >
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface WizardFieldProps {
  label: string;
  value: string;
  maxLength: number;
  placeholder?: string;
  onChange: (value: string) => void;
}

function WizardField({ label, value, maxLength, placeholder, onChange }: WizardFieldProps) {
  return (
    <label className="auth-field">
      <span className="merchant-field-head">
        <span className="auth-label">{label}</span>
        <span className="merchant-char-count">
          {value.length}/{maxLength}
        </span>
      </span>
      <input
        className="auth-input"
        type="text"
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SummaryRow({
  label,
  value,
  swatch,
}: {
  label: string;
  value: string;
  swatch?: string;
}) {
  return (
    <div className="wizard-summary-row">
      <span className="wizard-summary-label">{label}</span>
      <span className="wizard-summary-value">
        {swatch && <span className="wizard-summary-swatch" style={{ background: swatch }} />}
        {value}
      </span>
    </div>
  );
}
