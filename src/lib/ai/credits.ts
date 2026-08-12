import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { periodMsForPlan } from "@/lib/merchant/billing";
import { basePlanId } from "@/lib/merchant/pricing";
import {
  entitlementsFromRows,
  isTrialActive,
} from "@/lib/merchant/entitlements";
import type { ProductStatus } from "@/lib/supabase/database.types";
import {
  AI_CREDITS_EXHAUSTED_MESSAGE,
  BREAKDOWN_LABELS,
  MENU_AI_CREDITS_PER_MONTH,
  breakdownBucketFor,
  creditCost,
  type AiCreditBreakdownBucket,
  type AiCreditFeature,
} from "@/lib/ai/credits-config";

export {
  AI_CREDIT_COSTS,
  AI_CREDIT_PACKS,
  AI_CREDITS_EXHAUSTED_MESSAGE,
  AI_CREDITS_TOOLTIP,
  BREAKDOWN_LABELS,
  creditCost,
  type AiCreditFeature,
} from "@/lib/ai/credits-config";

type MenuProductRow = {
  id: string;
  plan_id: string | null;
  status: string;
  current_period_end: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
};

export type AiCreditBalance = {
  monthlyTotal: number;
  monthlyUsed: number;
  purchasedRemaining: number;
  /** Available = (monthlyTotal - monthlyUsed) + purchasedRemaining */
  available: number;
  cycleEndsAt: string | null;
  billingPeriod: string;
  planId: string | null;
};

export type AiCreditCheck =
  | { ok: true; balance: AiCreditBalance; cost: number }
  | { ok: false; error: string; balance: AiCreditBalance; cost: number };

export type AiCreditBreakdownRow = {
  bucket: AiCreditBreakdownBucket;
  label: string;
  credits: number;
};

function planMonthlyCredits(planId: string | null | undefined): number {
  if (!planId) return MENU_AI_CREDITS_PER_MONTH["menu-starter"];
  const base = basePlanId(planId);
  return (
    MENU_AI_CREDITS_PER_MONTH[base as keyof typeof MENU_AI_CREDITS_PER_MONTH] ??
    MENU_AI_CREDITS_PER_MONTH["menu-starter"]
  );
}

async function loadMenuProduct(merchantId: string): Promise<MenuProductRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("merchant_products")
    .select(
      "id, plan_id, status, current_period_end, trial_started_at, trial_ends_at",
    )
    .eq("merchant_id", merchantId)
    .eq("product", "menu")
    .maybeSingle();
  return (data as MenuProductRow | null) ?? null;
}

/**
 * Ensure a Menu merchant_products row exists so billing cycle + plan caps apply.
 * Preview merchants may use Menu without purchasing — seed a starter row.
 */
export async function ensureMenuProductRow(merchantId: string): Promise<MenuProductRow> {
  const existing = await loadMenuProduct(merchantId);
  if (existing) return existing;

  const admin = createAdminClient();
  const now = new Date();
  const cycleEnd = new Date(now.getTime() + periodMsForPlan("menu-starter")).toISOString();
  const { data, error } = await admin
    .from("merchant_products")
    .insert({
      merchant_id: merchantId,
      product: "menu",
      plan_id: "menu-starter",
      status: "active",
      purchased_at: now.toISOString(),
      current_period_end: cycleEnd,
    })
    .select(
      "id, plan_id, status, current_period_end, trial_started_at, trial_ends_at",
    )
    .maybeSingle();

  if (error || !data) {
    // Race: another request created the row.
    const again = await loadMenuProduct(merchantId);
    if (again) return again;
    throw new Error(error?.message ?? "Could not create Menu product row.");
  }
  return data as MenuProductRow;
}

function resolveCycle(product: MenuProductRow): {
  billingPeriod: string;
  cycleEndsAt: string;
} {
  const entitlementRows = [
    {
      product: "menu" as const,
      plan_id: product.plan_id,
      status: product.status as ProductStatus,
      onboarded_at: null,
      trial_started_at: product.trial_started_at,
      trial_ends_at: product.trial_ends_at,
    },
  ];
  const entitlement = entitlementsFromRows(entitlementRows).menu;

  let cycleEndsAt = product.current_period_end;
  if (!cycleEndsAt) {
    if (isTrialActive(entitlement) && product.trial_ends_at) {
      cycleEndsAt = product.trial_ends_at;
    } else if (product.trial_started_at) {
      cycleEndsAt = new Date(
        Date.parse(product.trial_started_at) + periodMsForPlan(product.plan_id),
      ).toISOString();
    } else {
      cycleEndsAt = new Date(
        Date.now() + periodMsForPlan(product.plan_id),
      ).toISOString();
    }
  }

  // Stable key for the period row (ISO date of cycle end).
  const billingPeriod = cycleEndsAt.slice(0, 10);
  return { billingPeriod, cycleEndsAt };
}

/**
 * Purchased credit balance from the merchant's latest prior billing period.
 * Monthly unused credits do not roll over; purchased credits do (no balance cap).
 */
async function loadCarriedPurchasedCredits(
  merchantId: string,
  currentBillingPeriod: string,
): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("merchant_ai_usage")
    .select("purchased_credits_remaining, billing_period, cycle_ends_at")
    .eq("merchant_id", merchantId)
    .neq("billing_period", currentBillingPeriod)
    .order("billing_period", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return 0;
  return Math.max(0, Number(data.purchased_credits_remaining) || 0);
}

/**
 * Load or create the wallet row for the merchant's current Menu billing cycle.
 * New periods start with a fresh monthly allotment (unused monthly does not roll over)
 * and carry forward any remaining purchased credits (no expiry / no balance cap).
 */
export async function ensureAiCreditPeriod(
  merchantId: string,
): Promise<AiCreditBalance> {
  const product = await ensureMenuProductRow(merchantId);
  const { billingPeriod, cycleEndsAt } = resolveCycle(product);
  const monthlyTotal = planMonthlyCredits(product.plan_id);
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("merchant_ai_usage")
    .select(
      "monthly_credits_total, monthly_credits_used, purchased_credits_remaining, cycle_ends_at",
    )
    .eq("merchant_id", merchantId)
    .eq("billing_period", billingPeriod)
    .maybeSingle();

  if (!existing) {
    const carriedPurchased = await loadCarriedPurchasedCredits(
      merchantId,
      billingPeriod,
    );
    const { data: inserted, error } = await admin
      .from("merchant_ai_usage")
      .insert({
        merchant_id: merchantId,
        billing_period: billingPeriod,
        monthly_credits_total: monthlyTotal,
        monthly_credits_used: 0,
        purchased_credits_remaining: carriedPurchased,
        cycle_ends_at: cycleEndsAt,
        updated_at: new Date().toISOString(),
      })
      .select(
        "monthly_credits_total, monthly_credits_used, purchased_credits_remaining, cycle_ends_at",
      )
      .maybeSingle();

    if (error || !inserted) {
      // Race — re-read.
      const { data: raced } = await admin
        .from("merchant_ai_usage")
        .select(
          "monthly_credits_total, monthly_credits_used, purchased_credits_remaining, cycle_ends_at",
        )
        .eq("merchant_id", merchantId)
        .eq("billing_period", billingPeriod)
        .maybeSingle();
      if (!raced) throw new Error(error?.message ?? "Could not open AI credit period.");
      return balanceFromRow(raced, billingPeriod, product.plan_id);
    }
    return balanceFromRow(inserted, billingPeriod, product.plan_id);
  }

  // Keep allotment in sync with plan (upgrade mid-cycle increases the ceiling).
  if (Number(existing.monthly_credits_total) !== monthlyTotal) {
    await admin
      .from("merchant_ai_usage")
      .update({
        monthly_credits_total: monthlyTotal,
        cycle_ends_at: cycleEndsAt,
        updated_at: new Date().toISOString(),
      })
      .eq("merchant_id", merchantId)
      .eq("billing_period", billingPeriod);
    return balanceFromRow(
      { ...existing, monthly_credits_total: monthlyTotal, cycle_ends_at: cycleEndsAt },
      billingPeriod,
      product.plan_id,
    );
  }

  return balanceFromRow(existing, billingPeriod, product.plan_id);
}

function balanceFromRow(
  row: {
    monthly_credits_total: number;
    monthly_credits_used: number;
    purchased_credits_remaining: number;
    cycle_ends_at: string | null;
  },
  billingPeriod: string,
  planId: string | null,
): AiCreditBalance {
  const monthlyTotal = Number(row.monthly_credits_total) || 0;
  const monthlyUsed = Number(row.monthly_credits_used) || 0;
  const purchasedRemaining = Number(row.purchased_credits_remaining) || 0;
  const monthlyLeft = Math.max(0, monthlyTotal - monthlyUsed);
  return {
    monthlyTotal,
    monthlyUsed,
    purchasedRemaining,
    available: monthlyLeft + purchasedRemaining,
    cycleEndsAt: row.cycle_ends_at,
    billingPeriod,
    planId,
  };
}

/** Pre-model gate. Does not deduct. */
export async function checkAiCredits(
  merchantId: string,
  feature: AiCreditFeature,
  units = 1,
): Promise<AiCreditCheck> {
  const cost = creditCost(feature) * Math.max(1, units);
  const balance = await ensureAiCreditPeriod(merchantId);
  if (balance.available < cost) {
    return {
      ok: false,
      error: AI_CREDITS_EXHAUSTED_MESSAGE,
      balance,
      cost,
    };
  }
  return { ok: true, balance, cost };
}

export type DeductAiCreditsInput = {
  merchantId: string;
  feature: AiCreditFeature;
  /** How many feature-units succeeded (e.g. N translated items). Default 1. */
  units?: number;
  customerId?: string | null;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  thoughtsTokens?: number | null;
  estimatedCostUsd?: number | null;
  responseMs?: number | null;
};

/**
 * Deduct after a successful AI response. Consumes monthly first, then purchased.
 * Writes an analytics row. Safe to call only when the AI action succeeded.
 */
export async function deductAiCredits(input: DeductAiCreditsInput): Promise<AiCreditBalance> {
  const units = Math.max(1, input.units ?? 1);
  const cost = creditCost(input.feature) * units;
  const balance = await ensureAiCreditPeriod(input.merchantId);
  const admin = createAdminClient();

  const monthlyLeft = Math.max(0, balance.monthlyTotal - balance.monthlyUsed);
  const fromMonthly = Math.min(monthlyLeft, cost);
  const fromPurchased = cost - fromMonthly;

  const nextMonthlyUsed = balance.monthlyUsed + fromMonthly;
  const nextPurchased = Math.max(0, balance.purchasedRemaining - fromPurchased);

  await admin
    .from("merchant_ai_usage")
    .update({
      monthly_credits_used: nextMonthlyUsed,
      purchased_credits_remaining: nextPurchased,
      updated_at: new Date().toISOString(),
    })
    .eq("merchant_id", input.merchantId)
    .eq("billing_period", balance.billingPeriod);

  await admin.from("ai_usage_log").insert({
    merchant_id: input.merchantId,
    customer_id: input.customerId ?? null,
    feature: input.feature,
    credits_used: cost,
    model: input.model ?? null,
    prompt_tokens: input.promptTokens ?? null,
    completion_tokens: input.completionTokens ?? null,
    thoughts_tokens: input.thoughtsTokens ?? null,
    estimated_cost_usd: input.estimatedCostUsd ?? null,
    response_ms: input.responseMs ?? null,
  });

  return {
    ...balance,
    monthlyUsed: nextMonthlyUsed,
    purchasedRemaining: nextPurchased,
    available: Math.max(0, balance.monthlyTotal - nextMonthlyUsed) + nextPurchased,
  };
}

/** Dashboard meter + optional breakdown for the current period. */
export async function loadAiCreditDashboard(merchantId: string): Promise<{
  balance: AiCreditBalance;
  /** Used against monthly total for the "3,842 / 5,000 Used" display. */
  usedDisplay: number;
  limitDisplay: number;
  breakdown: AiCreditBreakdownRow[];
}> {
  const balance = await ensureAiCreditPeriod(merchantId);
  const usedDisplay = balance.monthlyUsed;
  // Show the usable pool: monthly allotment + leftover purchased top-ups.
  const limitDisplay = balance.monthlyTotal + balance.purchasedRemaining;

  const admin = createAdminClient();
  const since = balance.cycleEndsAt
    ? new Date(Date.parse(balance.cycleEndsAt) - periodMsForPlan(balance.planId)).toISOString()
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await admin
    .from("ai_usage_log")
    .select("feature, credits_used")
    .eq("merchant_id", merchantId)
    .gte("created_at", since);

  const totals: Record<AiCreditBreakdownBucket, number> = {
    customer_chat: 0,
    menu_descriptions: 0,
    menu_images: 0,
    menu_imports: 0,
    marketing: 0,
    other: 0,
  };

  for (const row of rows ?? []) {
    const feature = (row.feature as AiCreditFeature) || "other";
    const bucket = breakdownBucketFor(feature);
    totals[bucket] += Number(row.credits_used) || 0;
  }

  const breakdown: AiCreditBreakdownRow[] = (
    Object.keys(totals) as AiCreditBreakdownBucket[]
  )
    .filter((bucket) => totals[bucket] > 0)
    .map((bucket) => ({
      bucket,
      label: BREAKDOWN_LABELS[bucket],
      credits: totals[bucket],
    }))
    .sort((a, b) => b.credits - a.credits);

  return { balance, usedDisplay, limitDisplay, breakdown };
}

export type AiCreditHistoryRow = {
  id: string;
  feature: string;
  label: string;
  creditsUsed: number;
  createdAt: string;
};

/** Recent credit spends for the merchant dashboard (excludes abuse / purchase rows). */
export async function loadAiCreditHistory(
  merchantId: string,
  limit = 10,
): Promise<AiCreditHistoryRow[]> {
  const { labelForAiFeature } = await import("@/lib/ai/credits-config");
  const admin = createAdminClient();
  const { data } = await admin
    .from("ai_usage_log")
    .select("id, feature, credits_used, created_at")
    .eq("merchant_id", merchantId)
    .neq("credits_used", 0)
    .not("feature", "like", "abuse_%")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    feature: String(row.feature),
    label: labelForAiFeature(String(row.feature)),
    creditsUsed: Number(row.credits_used) || 0,
    createdAt: String(row.created_at),
  }));
}

/**
 * Add purchased pack credits to the current billing-period wallet.
 * Purchased credits have no balance limit and roll across months (monthly unused does not).
 * Idempotent when `paymentId` is provided (retries won't double-credit).
 */
export async function addPurchasedAiCredits(input: {
  merchantId: string;
  credits: number;
  packId: string;
  paymentId?: string | null;
}): Promise<AiCreditBalance> {
  if (input.credits <= 0) {
    throw new Error("Credits must be positive.");
  }
  const admin = createAdminClient();
  const paymentId = input.paymentId?.trim() || null;
  if (!paymentId) {
    throw new Error("A Razorpay payment id is required to credit a pack.");
  }

  await ensureAiCreditPeriod(input.merchantId);

  const { data: applied, error: applyError } = await admin.rpc(
    "apply_purchased_ai_credit_pack",
    {
      p_merchant_id: input.merchantId,
      p_credits: input.credits,
      p_pack_id: input.packId,
      p_payment_id: paymentId,
    },
  );
  if (applyError) {
    throw new Error(
      applyError.message ||
        "Could not update your AI credit balance. Please contact support with your payment ID.",
    );
  }

  // Unique payment_id already recorded — same captured payment, no extra credits.
  if (applied === false) {
    return ensureAiCreditPeriod(input.merchantId);
  }

  const next = await ensureAiCreditPeriod(input.merchantId);

  const { error: logError } = await admin.from("ai_usage_log").insert({
    merchant_id: input.merchantId,
    customer_id: null,
    feature: "credit_pack_purchase",
    // Negative = credits added (history renders as +N).
    credits_used: -input.credits,
    model: paymentId,
    prompt_tokens: input.credits,
    completion_tokens: null,
    thoughts_tokens: null,
    estimated_cost_usd: null,
    response_ms: null,
  });
  if (logError) {
    console.error("ai_usage_log purchase insert failed", logError.message);
  }

  return next;
}
