import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  entitlementsFromRows,
  isTrialActive,
  type ProductEntitlement,
} from "@/lib/merchant/entitlements";
import { aiCreditsLimitError, menuPlanLimits } from "@/lib/merchant/plan-limits";
import {
  checkAiCredits,
  deductAiCredits,
  loadAiCreditDashboard,
  type AiCreditFeature,
} from "@/lib/ai/credits";
import { creditCost } from "@/lib/ai/credits-config";
import {
  ensureMenuAiCreditsSeeded,
  sumMenuAiCreditsGranted,
} from "@/lib/menu/ai-credits";

/**
 * Menu AI capacity — now backed by the unified AI Credits wallet.
 *
 * Legacy helpers (`checkAiGenerationCapacity`, `recordAiGeneration`, conversation
 * helpers) remain as thin wrappers so call sites migrate gradually.
 */

/** @deprecated Use creditCost("menu_description") — 1 unified credit. */
export const AI_GEN_DESCRIPTION_EVENT = "ai_gen_description";
/** @deprecated Use creditCost("dish_image") — 20 unified credits. */
export const AI_GEN_IMAGE_EVENT = "ai_gen_image";

export const AI_GEN_CREDITS = {
  description: creditCost("menu_description"),
  image: creditCost("dish_image"),
} as const;

export type AiGenerationKind = keyof typeof AI_GEN_CREDITS;

export interface MenuUsage {
  /** Unified AI Credits used this billing cycle (monthly pool). */
  generations: number;
  /** Alias — same unified used count (keeps older meter field names). */
  conversations: number;
  maxGenerations: number;
  maxConversations: number;
  available: number;
  cycleEndsAt: string | null;
}

export type MenuUsageLegacy = MenuUsage & { aiDishes: number };

async function loadMenuEntitlement(
  merchantId: string,
): Promise<ProductEntitlement | null> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("merchant_products")
    .select("product, plan_id, status, onboarded_at, trial_started_at, trial_ends_at")
    .eq("merchant_id", merchantId);
  return entitlementsFromRows(rows ?? []).menu;
}

/** @deprecated Prefer cycle from loadAiCreditDashboard. */
export function menuUsageWindowStart(entitlement: ProductEntitlement | null): string {
  if (isTrialActive(entitlement) && entitlement?.trialStartedAt) {
    return entitlement.trialStartedAt;
  }
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

/** @deprecated Lifetime event counter — prefer unified wallet. */
export async function countAiGenerations(merchantId: string): Promise<number> {
  const dash = await loadAiCreditDashboard(merchantId);
  return dash.usedDisplay;
}

/** @deprecated Prefer loadAiCreditDashboard. */
export async function countMenuConversations(merchantId: string): Promise<number> {
  const dash = await loadAiCreditDashboard(merchantId);
  return dash.usedDisplay;
}

export async function loadMenuUsage(merchantId: string): Promise<MenuUsageLegacy> {
  const dash = await loadAiCreditDashboard(merchantId);
  return {
    generations: dash.usedDisplay,
    conversations: dash.usedDisplay,
    maxGenerations: dash.limitDisplay,
    maxConversations: dash.limitDisplay,
    available: dash.balance.available,
    cycleEndsAt: dash.balance.cycleEndsAt,
    aiDishes: dash.usedDisplay,
  };
}

export type MenuCapacityResult = { ok: true } | { ok: false; error: string };

function featureForGeneration(kind: AiGenerationKind): AiCreditFeature {
  return kind === "image" ? "dish_image" : "menu_description";
}

/**
 * Gate for AI enrichment. `wanted` is how many description-equivalents for
 * legacy callers; image actions pass creditCost via AI_GEN_CREDITS.image.
 */
export async function checkAiGenerationCapacity(
  merchantId: string,
  wanted: number,
): Promise<MenuCapacityResult & { remaining?: number }> {
  if (wanted <= 0) return { ok: true, remaining: undefined };

  const { ensureAiCreditPeriod } = await import("@/lib/ai/credits");
  const balance = await ensureAiCreditPeriod(merchantId);
  if (wanted > balance.available) {
    return {
      ok: false,
      remaining: balance.available,
      error: aiCreditsLimitError(balance.monthlyTotal, balance.available, wanted),
    };
  }
  return { ok: true, remaining: balance.available };
}

/** Persist a successful generation into the unified wallet. */
export async function recordAiGeneration(
  merchantId: string,
  kind: AiGenerationKind,
  detail?: string,
): Promise<void> {
  void detail;
  try {
    await deductAiCredits({
      merchantId,
      feature: featureForGeneration(kind),
      units: 1,
    });
  } catch (error) {
    console.error("ai credit deduct failed", error);
  }
}

export async function checkMenuConversationCapacity(
  merchantId: string,
): Promise<MenuCapacityResult> {
  const check = await checkAiCredits(merchantId, "customer_reply", 1);
  if (!check.ok) {
    return { ok: false, error: check.error };
  }
  return { ok: true };
}

/** Exposed for tests / admin tooling. */
export { sumMenuAiCreditsGranted, ensureMenuAiCreditsSeeded, menuPlanLimits };
