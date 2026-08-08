/**
 * Estimated Gemini Flash list prices for admin cost rollups.
 * Source: ai.google.dev (Gemini 2.5 Flash paid tier). Update when list prices change.
 *
 * Image-generation calls (`kind === "image"`) are billed per image when token
 * counts are missing; otherwise token math still applies.
 */

const USD_INR = 84;

/** USD per 1M tokens — Flash default used for all current froq models. */
export const GEMINI_FLASH_USD = {
  inputPerM: 0.3,
  cachedInputPerM: 0.03,
  outputPerM: 2.5,
  /** Fallback when an image call has no token counts. */
  imageFlatUsd: 0.039,
} as const;

export type AiUsageCostInput = {
  kind: string;
  prompt_tokens: number | null;
  response_tokens: number | null;
  thoughts_tokens: number | null;
  cached_tokens: number | null;
  total_tokens: number | null;
};

export function estimateUsageUsd(row: AiUsageCostInput): number {
  const prompt = Math.max(0, row.prompt_tokens ?? 0);
  const cached = Math.min(prompt, Math.max(0, row.cached_tokens ?? 0));
  const billablePrompt = Math.max(0, prompt - cached);
  const output =
    Math.max(0, row.response_tokens ?? 0) + Math.max(0, row.thoughts_tokens ?? 0);

  const hasTokenBreakdown = prompt > 0 || output > 0 || cached > 0;
  if (!hasTokenBreakdown) {
    if (row.kind === "image") return GEMINI_FLASH_USD.imageFlatUsd;
    const total = Math.max(0, row.total_tokens ?? 0);
    if (total === 0) return 0;
    // Unknown split — treat as all output (conservative upper bound).
    return (total / 1_000_000) * GEMINI_FLASH_USD.outputPerM;
  }

  return (
    (billablePrompt / 1_000_000) * GEMINI_FLASH_USD.inputPerM +
    (cached / 1_000_000) * GEMINI_FLASH_USD.cachedInputPerM +
    (output / 1_000_000) * GEMINI_FLASH_USD.outputPerM
  );
}

export function usdToInr(usd: number): number {
  return usd * USD_INR;
}

export function estimateUsageInr(row: AiUsageCostInput): number {
  return usdToInr(estimateUsageUsd(row));
}

export const AI_FEATURE_LABELS: Record<string, string> = {
  menu_chat: "Assistant answers",
  menu_cart_insights: "Cart insights",
  menu_translate: "Menu translation",
  menu_extract: "Menu import",
  dish_enrich: "Dish descriptions",
  dish_image: "Dish photos",
  other: "Other",
};

export function aiFeatureLabel(feature: string): string {
  return AI_FEATURE_LABELS[feature] ?? feature.replace(/_/g, " ");
}
