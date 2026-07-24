import type { CheckoutAccount } from "./checkout";
import type { MerchantProduct } from "./types";
import { BRAND_COLORS } from "./constants";
import { DEFAULT_ACCEPT_MINUTES, DEFAULT_ESTIMATED_WAIT_MINUTES } from "./queue-settings";
import type { RewardCooldownUnit } from "@/lib/loyalty/rules";

/** One rendered screen in the onboarding wizard. */
export type OnboardingStep =
  | "intro"
  | "identity" // first/last name, business name, logo
  | "verify" // email + phone verification before branding
  | "color" // brand color
  | "contact" // address + social links
  | "reward" // loyalty product setup
  | "queue" // queue product setup
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
  address: string;
  websiteUrl: string;
  googleBusinessUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  xUrl: string;
  // Loyalty product block
  rewardTitle: string;
  rewardName: string;
  rewardImageDataUrl?: string;
  avgOrderValue: number;
  totalStamps: number;
  /** Shown in onboarding. 0 = no wait. */
  rewardCooldownValue: number;
  rewardCooldownUnit: RewardCooldownUnit;
  /** Shown in onboarding. Condition: purchase of ₹X+. */
  minPurchaseAmount: number;
  // Queue product block
  estimatedWaitMinutes: number;
  acceptMinutes: number;
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
    address: location,
    websiteUrl: "",
    googleBusinessUrl: "",
    instagramUrl: "",
    facebookUrl: "",
    xUrl: "",
    rewardTitle: "",
    rewardName: "",
    avgOrderValue: 200,
    totalStamps: 5,
    rewardCooldownValue: 0,
    rewardCooldownUnit: "days",
    minPurchaseAmount: 0,
    estimatedWaitMinutes: DEFAULT_ESTIMATED_WAIT_MINUTES,
    acceptMinutes: DEFAULT_ACCEPT_MINUTES,
  };
}

function productStep(product: MerchantProduct): OnboardingStep {
  return product === "queue" ? "queue" : "reward";
}

/** Ordered list of steps for a given mode + product. */
export function buildOnboardingSteps(
  mode: OnboardingMode,
  product: MerchantProduct,
): OnboardingStep[] {
  if (mode === "full") {
    return ["intro", "identity", "verify", "color", "contact", productStep(product), "outro"];
  }
  return ["intro", productStep(product), "outro"];
}

/** Whether the Continue button is enabled for the current step. */
export function canAdvanceStep(step: OnboardingStep, draft: OnboardingDraft): boolean {
  switch (step) {
    case "identity":
      return draft.firstName.trim().length > 0 && draft.businessName.trim().length > 0;
    case "verify":
      return draft.emailVerified && draft.phoneVerified;
    case "reward":
      return draft.rewardTitle.trim().length > 0 && draft.rewardName.trim().length > 0;
    default:
      return true;
  }
}

export const WAIT_OPTIONS = [5, 10, 15, 20, 30, 45] as const;
export const CALL_OPTIONS = [5, 10, 15, 20, 30] as const;
export const STAMP_OPTIONS = [5, 6, 8, 10, 12] as const;
export const COOLDOWN_VALUE_OPTIONS = [0, 1, 2, 3, 6, 12, 24, 48] as const;
