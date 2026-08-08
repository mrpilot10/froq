import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { classifyPlanChange } from "@/lib/merchant/billing";
import { FREE_PLAN } from "@/lib/merchant/pricing";
import { menuPlanLimits } from "@/lib/merchant/plan-limits";

/**
 * AI Menu Generation credit bank.
 *
 * - Leftover credits are never wiped on upgrade.
 * - Activating / upgrading ADD the full new plan allotment on top.
 * - Downgrades do not remove credits.
 *
 * Capacity = sum(grants) − lifetime generation events.
 */

export type MenuCreditGrantReason = "activate" | "upgrade" | "seed";

export async function sumMenuAiCreditsGranted(merchantId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("menu_ai_credit_grants")
    .select("credits")
    .eq("merchant_id", merchantId);
  if (error) {
    console.error("menu_ai_credit_grants read failed", error.message);
    return 0;
  }
  let total = 0;
  for (const row of data ?? []) {
    total += Number(row.credits) || 0;
  }
  return total;
}

async function insertGrant(input: {
  merchantId: string;
  credits: number;
  planId: string | null;
  reason: MenuCreditGrantReason;
}): Promise<void> {
  if (input.credits <= 0) return;
  const admin = createAdminClient();
  const { error } = await admin.from("menu_ai_credit_grants").insert({
    merchant_id: input.merchantId,
    credits: input.credits,
    plan_id: input.planId,
    reason: input.reason,
  });
  if (error) {
    console.error("menu_ai_credit_grants insert failed", error.message);
  }
}

/**
 * First-time paid Menu merchants who predate the grants table get one seed
 * for their current plan so they aren't locked at 0 credits.
 */
export async function ensureMenuAiCreditsSeeded(
  merchantId: string,
  planId: string | null | undefined,
): Promise<number> {
  if (!planId || planId === FREE_PLAN.id) {
    return sumMenuAiCreditsGranted(merchantId);
  }
  const granted = await sumMenuAiCreditsGranted(merchantId);
  if (granted > 0) return granted;

  const credits = menuPlanLimits(planId).maxAiCreditsPerMonth;
  await insertGrant({
    merchantId,
    credits,
    planId,
    reason: "seed",
  });
  return credits;
}

/**
 * Call when a Menu plan becomes active: first purchase or an upgrade that
 * just applied. Downgrades / same-plan are no-ops. Leftovers stay; we ADD the
 * full new plan allotment.
 */
export async function grantMenuAiCreditsOnPlanApply(input: {
  merchantId: string;
  product: string;
  fromPlanId: string | null | undefined;
  toPlanId: string;
}): Promise<{ granted: number; reason: MenuCreditGrantReason | null }> {
  if (input.product !== "menu") return { granted: 0, reason: null };

  const toPlanId = input.toPlanId?.trim();
  if (!toPlanId || toPlanId === FREE_PLAN.id) {
    return { granted: 0, reason: null };
  }

  const from = input.fromPlanId?.trim() || null;
  const kind =
    !from || from === FREE_PLAN.id
      ? "activate"
      : classifyPlanChange(from, toPlanId);

  if (kind === "same" || kind === "downgrade") {
    return { granted: 0, reason: null };
  }

  const reason: MenuCreditGrantReason = kind === "upgrade" ? "upgrade" : "activate";
  const credits = menuPlanLimits(toPlanId).maxAiCreditsPerMonth;
  await insertGrant({
    merchantId: input.merchantId,
    credits,
    planId: toPlanId,
    reason,
  });
  return { granted: credits, reason };
}
