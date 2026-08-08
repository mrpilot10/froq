import { DEFAULT_MENU_TAX_RATES } from "@/lib/menu/tax";
import type { CheckoutAccount } from "./checkout";
import type { MerchantProduct } from "./types";
import { BRAND_COLORS } from "./constants";
import { DEFAULT_ESTIMATED_WAIT_MINUTES } from "./queue-settings";
import { DEFAULT_QUEUE_STORE_HOURS } from "./queue-hours";
import { DEFAULT_RESERVATION_SETTINGS } from "./reservations";
import {
  type GeneratedTable,
} from "./dining-tables";
import type { RewardCooldownUnit } from "@/lib/loyalty/rules";

/** One rendered screen in the onboarding wizard. */
export type OnboardingStep =
  | "intro"
  | "identity" // first/last name, business name, logo
  | "location" // Google Places search that names and addresses the main branch
  | "verify" // email + phone verification before branding
  | "color" // brand color
  | "contact" // main branch phone/email/website + social links
  | "hours" // store / branch open hours — once, shared by every product
  | "branches" // product-mode: pick which global branches this product activates
  | "reward" // loyalty product setup
  | "queue" // queue product setup
  | "reservation" // reservations product setup
  | "menu" // AI Menu product setup — what a table order bills
  | "outro";

/**
 * "full"    -> brand-new merchant: global block + first product block.
 * "product" -> existing merchant activating an additional product.
 */
export type OnboardingMode = "full" | "product";

/** Every field the wizard can collect across all blocks. */
export interface OnboardingDraft {
  // Universal (global block)
  firstName: string;
  lastName: string;
  businessName: string;
  logoDataUrl?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  brandColor: string;
  /** Name of the first (main) branch — derived from the Google listing. */
  branchName: string;
  address: string;
  /** Public store phone shown to customers, separate from the login phone. */
  storePhone: string;
  /** Public store email shown to customers, separate from the login email. */
  storeEmail: string;
  websiteUrl: string;
  googleBusinessUrl: string;
  googlePlaceId: string;
  googleMapsUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  xUrl: string;
  // Loyalty product block
  rewardTitle: string;
  rewardName: string;
  rewardImageDataUrl?: string;
  totalStamps: number;
  /** Shown in onboarding. 0 = no wait. */
  rewardCooldownValue: number;
  rewardCooldownUnit: RewardCooldownUnit;
  /** Shown in onboarding. Condition: purchase of ₹X+. */
  minPurchaseAmount: number;
  // Store hours (shared — filled on the hours step, used by queue + reservations)
  queueOpenTime: string;
  queueCloseTime: string;
  queueOpenDays: number[];
  // Queue product block
  estimatedWaitMinutes: number;
  queueAutoStart: boolean;
  queueAutoClose: boolean;
  // AI Menu product block — percent added on top of a table order's subtotal
  menuCgstPercent: number;
  menuSgstPercent: number;
  menuServiceChargePercent: number;
  // Reservations product block
  reservationMaxPartySize: number;
  reservationIntervalMinutes: number;
  /** Seeded from store hours; kept in sync so reservation slots match the store. */
  reservationOpenTime: string;
  reservationCloseTime: string;
  reservationAllowSameDay: boolean;
  /** Individual tables with editable numbers for the main branch. */
  tables: GeneratedTable[];
  /**
   * Product-mode only: global branches to activate for this product.
   * Seeded from existing locations (auto-select when there's exactly one).
   */
  selectedBranchIds: string[];
  /** Product-mode only: name for creating the first global branch when none exist. */
  newBranchName: string;
}

export function emptyOnboardingDraft(account?: CheckoutAccount | null): OnboardingDraft {
  const legacyParts = (account?.ownerName ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = account?.firstName?.trim() || legacyParts[0] || "";
  const lastName = account?.lastName?.trim() || legacyParts.slice(1).join(" ") || "";
  const location = [account?.city, account?.state].filter(Boolean).join(", ");
  return {
    firstName,
    lastName,
    businessName: account?.businessName ?? "",
    emailVerified: false,
    phoneVerified: false,
    brandColor: BRAND_COLORS[0].value,
    branchName: "",
    address: location,
    storePhone: "",
    storeEmail: "",
    websiteUrl: "",
    googleBusinessUrl: "",
    googlePlaceId: "",
    googleMapsUrl: "",
    instagramUrl: "",
    facebookUrl: "",
    xUrl: "",
    rewardTitle: "",
    rewardName: "",
    totalStamps: 5,
    rewardCooldownValue: 0,
    rewardCooldownUnit: "days",
    minPurchaseAmount: 0,
    estimatedWaitMinutes: DEFAULT_ESTIMATED_WAIT_MINUTES,
    queueOpenTime: DEFAULT_QUEUE_STORE_HOURS.openTime,
    queueCloseTime: DEFAULT_QUEUE_STORE_HOURS.closeTime,
    queueOpenDays: [...DEFAULT_QUEUE_STORE_HOURS.openDays],
    queueAutoStart: DEFAULT_QUEUE_STORE_HOURS.autoStart,
    queueAutoClose: DEFAULT_QUEUE_STORE_HOURS.autoClose,
    menuCgstPercent: DEFAULT_MENU_TAX_RATES.cgstPercent,
    menuSgstPercent: DEFAULT_MENU_TAX_RATES.sgstPercent,
    menuServiceChargePercent: DEFAULT_MENU_TAX_RATES.serviceChargePercent,
    reservationMaxPartySize: DEFAULT_RESERVATION_SETTINGS.maxPartySize,
    reservationIntervalMinutes: DEFAULT_RESERVATION_SETTINGS.intervalMinutes,
    // Same window as store hours — not a second booking-hours prompt.
    reservationOpenTime: DEFAULT_QUEUE_STORE_HOURS.openTime,
    reservationCloseTime: DEFAULT_QUEUE_STORE_HOURS.closeTime,
    reservationAllowSameDay: DEFAULT_RESERVATION_SETTINGS.allowSameDay,
    tables: [],
    selectedBranchIds: [],
    newBranchName: "",
  };
}

function productStep(product: MerchantProduct): OnboardingStep {
  if (product === "queue") return "queue";
  if (product === "reservation") return "reservation";
  if (product === "menu") return "menu";
  return "reward";
}

/**
 * Ordered list of steps for a given mode + product.
 * Store hours are collected once in full onboarding (shared by every product).
 * Product-mode reuses global branches — pick / create, then product settings.
 */
export function buildOnboardingSteps(
  mode: OnboardingMode,
  product: MerchantProduct,
): OnboardingStep[] {
  if (mode === "full") {
    return [
      "intro",
      "identity",
      "location",
      "verify",
      "color",
      "contact",
      "hours",
      productStep(product),
      "outro",
    ];
  }
  return ["intro", "branches", productStep(product), "outro"];
}

/** Whether the Continue button is enabled for the current step. */
export function canAdvanceStep(
  step: OnboardingStep,
  draft: OnboardingDraft,
  opts?: { existingBranchCount?: number; maxActiveBranches?: number },
): boolean {
  switch (step) {
    case "identity":
      return draft.firstName.trim().length > 0 && draft.businessName.trim().length > 0;
    case "location":
      // Optional — picking a listing auto-advances; Continue lets them skip.
      return true;
    case "verify":
      return draft.emailVerified && draft.phoneVerified;
    case "hours":
      return (
        draft.queueOpenDays.length > 0 &&
        Boolean(draft.queueOpenTime) &&
        Boolean(draft.queueCloseTime)
      );
    case "branches": {
      const existing = opts?.existingBranchCount ?? 0;
      const max = opts?.maxActiveBranches ?? Infinity;
      if (existing === 0) return draft.newBranchName.trim().length > 0;
      if (draft.selectedBranchIds.length === 0) return false;
      return draft.selectedBranchIds.length <= max;
    }
    case "reward":
      return draft.rewardTitle.trim().length > 0 && draft.rewardName.trim().length > 0;
    default:
      return true;
  }
}

export const WAIT_OPTIONS = [5, 10, 15, 20, 30, 45] as const;
export const STAMP_OPTIONS = [5, 6, 8, 10, 12] as const;
export const COOLDOWN_VALUE_OPTIONS = [0, 1, 2, 3, 6, 12, 24, 48] as const;
