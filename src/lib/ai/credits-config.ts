/**
 * Configurable AI credit costs and plan allotments.
 * Change numbers here — call sites read via AI_CREDIT_COSTS / planMonthlyAiCredits.
 */

export type AiCreditFeature =
  | "customer_reply"
  | "menu_description"
  | "rewrite_description"
  | "translate_menu_item"
  | "improve_description"
  | "menu_import"
  | "social_caption"
  | "marketing_email"
  | "whatsapp_campaign"
  | "dish_image"
  | "dish_image_regenerate"
  | "other";

/** Credits charged after a successful AI action. */
export const AI_CREDIT_COSTS: Record<AiCreditFeature, number> = {
  customer_reply: 1,
  menu_description: 1,
  rewrite_description: 1,
  /** Menu translations are included — no credit charge. */
  translate_menu_item: 0,
  improve_description: 1,
  /** Per dish extracted from a PDF / menu photo. */
  menu_import: 2,
  social_caption: 3,
  marketing_email: 3,
  whatsapp_campaign: 3,
  dish_image: 20,
  dish_image_regenerate: 20,
  other: 1,
};

/** Monthly AI Credits included with each Menu plan (billing cycle). */
export const MENU_AI_CREDITS_PER_MONTH = {
  "menu-starter": 5_000,
  "menu-growth": 20_000,
  "menu-pro": 100_000,
  /** Legacy single-tier id → Growth. */
  menu: 20_000,
} as const;

/** One-time AI Credit packs (INR). Rollover while subscription/active Menu remains. */
export const AI_CREDIT_PACKS = [
  {
    id: "credits-5k",
    credits: 5_000,
    priceInr: 299,
    /** Marketing discount badge — charged price stays `priceInr`. */
    discountPercent: 20,
    label: "5,000 Credits",
  },
  {
    id: "credits-15k",
    credits: 15_000,
    priceInr: 799,
    discountPercent: 50,
    label: "15,000 Credits",
  },
  {
    id: "credits-50k",
    credits: 50_000,
    priceInr: 2_299,
    discountPercent: 70,
    label: "50,000 Credits",
  },
] as const;

export type AiCreditPackId = (typeof AI_CREDIT_PACKS)[number]["id"];

export function getAiCreditPack(packId: string) {
  return AI_CREDIT_PACKS.find((pack) => pack.id === packId) ?? null;
}

/** Human labels for ai_usage_log.feature values. */
export const AI_CREDIT_FEATURE_LABELS: Record<string, string> = {
  customer_reply: "Customer chat reply",
  menu_description: "Menu description",
  rewrite_description: "Description rewrite",
  translate_menu_item: "Menu translation",
  improve_description: "Description improve",
  menu_import: "Menu import",
  social_caption: "Social media caption",
  marketing_email: "Marketing email",
  whatsapp_campaign: "WhatsApp campaign",
  dish_image: "Dish image",
  dish_image_regenerate: "Dish image regenerate",
  other: "Other AI",
  credit_pack_purchase: "Credit pack purchase",
};

export function labelForAiFeature(feature: string): string {
  return AI_CREDIT_FEATURE_LABELS[feature] ?? feature.replace(/_/g, " ");
}

export const AI_CREDITS_EXHAUSTED_MESSAGE =
  "You've used all your AI Credits for this billing period.";

export const AI_CREDITS_TOOLTIP =
  "AI Credits power customer chat, menu import, descriptions, dish images, marketing, and more. Different features use different amounts — for example, importing a dish costs 2 credits.";

/** Group features for dashboard breakdown. */
export type AiCreditBreakdownBucket =
  | "customer_chat"
  | "menu_descriptions"
  | "menu_images"
  | "menu_imports"
  | "marketing"
  | "other";

export function breakdownBucketFor(feature: AiCreditFeature): AiCreditBreakdownBucket {
  switch (feature) {
    case "customer_reply":
      return "customer_chat";
    case "menu_description":
    case "rewrite_description":
    case "improve_description":
    case "translate_menu_item":
      return "menu_descriptions";
    case "menu_import":
      return "menu_imports";
    case "dish_image":
    case "dish_image_regenerate":
      return "menu_images";
    case "social_caption":
    case "marketing_email":
    case "whatsapp_campaign":
      return "marketing";
    default:
      return "other";
  }
}

export const BREAKDOWN_LABELS: Record<AiCreditBreakdownBucket, string> = {
  customer_chat: "Customer Chat",
  menu_descriptions: "Descriptions",
  menu_images: "Images",
  menu_imports: "Per dish",
  marketing: "Marketing",
  other: "Other",
};

export function creditCost(feature: AiCreditFeature): number {
  return AI_CREDIT_COSTS[feature] ?? AI_CREDIT_COSTS.other;
}

/** Short chip/button suffix, e.g. "(1)" / "(20)" / "(free)". */
export function creditButtonSuffix(feature: AiCreditFeature): string {
  const cost = creditCost(feature);
  if (cost <= 0) return "(free)";
  return `(${cost.toLocaleString("en-IN")})`;
}
