import "server-only";

import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { periodMsForPlan } from "@/lib/merchant/billing";
import {
  entitlementsFromRows,
  isTrialActive,
  type ProductEntitlement,
} from "@/lib/merchant/entitlements";
import { menuPlanLimits } from "@/lib/merchant/plan-limits";
import type { ProductStatus } from "@/lib/supabase/database.types";

/** Hidden fair-use caps — not shown on pricing. */
export const AI_REPLY_LIMITS = {
  /** Max successful AI replies in one guest conversation thread. */
  conversationMax: 30,
  /** Max successful AI replies per guest per merchant (rolling 30 days). */
  rolling30DayPerGuest: 100,
  /** Max AI generate attempts per guest per minute. */
  perMinutePerGuest: 10,
  /** Hit this many abuse gates (same guest+merchant) → repeated flag signal. */
  abuseFlagThreshold: 3,
} as const;

export const AI_REPLY_MESSAGES = {
  merchantMonthly:
    "The restaurant's AI assistant is temporarily unavailable.",
  conversation:
    "This conversation has reached its AI limit. Please start a new conversation or contact the restaurant for further assistance.",
  customer:
    "You've reached the AI chat limit for this restaurant. Please contact the restaurant directly for further assistance.",
  rate: "Too many questions — please wait a moment and try again.",
} as const;

const GUEST_COOKIE = "froq_menu_guest";
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // ~13 months

export type AiReplyGate =
  | {
      ok: true;
      guestId: string;
      conversationId: string;
      setCookie?: string;
    }
  | {
      ok: false;
      reason: "merchant" | "conversation" | "customer" | "rate";
      message: string;
      status: 200 | 429;
      guestId: string;
      conversationId: string;
      setCookie?: string;
    };

type MenuProductRow = {
  id: string;
  plan_id: string | null;
  status: string;
  current_period_end: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  ai_replies_used: number | null;
  ai_replies_cycle_end: string | null;
};

function cleanId(raw: string | null | undefined, max = 64): string {
  const v = (raw ?? "").trim().slice(0, max);
  return v.replace(/[^\w.:-]/g, "") || "";
}

export function readGuestIdFromRequest(request: Request): {
  guestId: string;
  isNew: boolean;
} {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)froq_menu_guest=([^;]+)/);
  const existing = match?.[1] ? decodeURIComponent(match[1]).trim() : "";
  if (existing && existing.length >= 8 && existing.length <= 64) {
    return { guestId: existing, isNew: false };
  }
  return { guestId: randomUUID(), isNew: true };
}

export function guestCookieHeader(guestId: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${GUEST_COOKIE}=${encodeURIComponent(guestId)}; Path=/; Max-Age=${GUEST_COOKIE_MAX_AGE}; SameSite=Lax; HttpOnly${secure}`;
}

async function loadMenuProduct(merchantId: string): Promise<MenuProductRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("merchant_products")
    .select(
      "id, plan_id, status, current_period_end, trial_started_at, trial_ends_at, ai_replies_used, ai_replies_cycle_end",
    )
    .eq("merchant_id", merchantId)
    .eq("product", "menu")
    .maybeSingle();
  return (data as MenuProductRow | null) ?? null;
}



/**
 * Align ai_replies_used to the current Menu billing cycle (or trial window).
 * Returns the effective used count after any reset.
 */
export async function ensureMerchantAiReplyCycle(
  merchantId: string,
): Promise<{ used: number; limit: number; productId: string | null }> {
  const product = await loadMenuProduct(merchantId);
  if (!product) {
    return { used: 0, limit: menuPlanLimits(null).maxAiCreditsPerMonth, productId: null };
  }

  const limit = menuPlanLimits(product.plan_id).maxAiCreditsPerMonth;
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

  let cycleEnd = product.current_period_end;
  if (!cycleEnd) {
    // Trial / uncycled: synthetic cycle end = trial end or +period from trial start.
    // Prefer a still-valid stored cycle so we don't reset the meter every request.
    const stored = product.ai_replies_cycle_end;
    if (stored && Date.parse(stored) > Date.now()) {
      cycleEnd = stored;
    } else if (isTrialActive(entitlement) && product.trial_ends_at) {
      cycleEnd = product.trial_ends_at;
    } else if (product.trial_started_at) {
      cycleEnd = new Date(
        Date.parse(product.trial_started_at) + periodMsForPlan(product.plan_id),
      ).toISOString();
    } else {
      cycleEnd = new Date(Date.now() + periodMsForPlan(product.plan_id)).toISOString();
    }
  }

  const admin = createAdminClient();
  const storedEnd = product.ai_replies_cycle_end;
  let used = Number(product.ai_replies_used) || 0;

  if (storedEnd !== cycleEnd) {
    used = 0;
    await admin
      .from("merchant_products")
      .update({
        ai_replies_used: 0,
        ai_replies_cycle_end: cycleEnd,
      })
      .eq("id", product.id);
  }

  return { used, limit, productId: product.id };
}

async function countLog(opts: {
  merchantId: string;
  conversationId?: string;
  guestId?: string;
  sinceIso: string;
}): Promise<number> {
  const admin = createAdminClient();
  let q = admin
    .from("menu_ai_reply_log")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", opts.merchantId)
    .gte("created_at", opts.sinceIso);
  if (opts.conversationId) q = q.eq("conversation_id", opts.conversationId);
  if (opts.guestId) q = q.eq("guest_id", opts.guestId);
  const { count } = await q;
  return count ?? 0;
}

/**
 * Pre-model gates for guest AI chat.
 * Order: rate → merchant credits → conversation → rolling 30-day customer.
 * Does not increment any counters.
 */
export async function checkAiReplyGates(input: {
  request: Request;
  merchantId: string;
  conversationId: string | null;
}): Promise<AiReplyGate> {
  const { guestId, isNew } = readGuestIdFromRequest(input.request);
  const conversationId =
    cleanId(input.conversationId, 80) || `anon:${guestId.slice(0, 8)}`;
  const setCookie = isNew ? guestCookieHeader(guestId) : undefined;

  const fail = async (
    reason: "merchant" | "conversation" | "customer" | "rate",
    message: string,
    status: 200 | 429,
  ): Promise<AiReplyGate> => {
    // Abuse analytics — zeros-cost log rows for limit hits (moderation later).
    void recordAbuseSignal({
      merchantId: input.merchantId,
      guestId,
      conversationId,
      reason,
    }).catch((err) => console.error("abuse signal failed", err));

    return {
      ok: false,
      reason,
      message,
      status,
      guestId,
      conversationId,
      setCookie,
    };
  };

  // Per-IP × slug ceiling lives in consumePublicRateLimit on the route
  // (cluster-wide). Do not re-check here with an in-memory map.

  // Merchant monthly pool → unified AI Credits.
  const { checkAiCredits } = await import("@/lib/ai/credits");
  const credits = await checkAiCredits(input.merchantId, "customer_reply", 1);
  if (!credits.ok) {
    return await fail("merchant", AI_REPLY_MESSAGES.merchantMonthly, 200);
  }

  const conversationCount = await countLog({
    merchantId: input.merchantId,
    conversationId,
    sinceIso: new Date(0).toISOString(),
  });
  if (conversationCount >= AI_REPLY_LIMITS.conversationMax) {
    return await fail("conversation", AI_REPLY_MESSAGES.conversation, 200);
  }

  const rollingSince = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const customerCount = await countLog({
    merchantId: input.merchantId,
    guestId,
    sinceIso: rollingSince,
  });
  if (customerCount >= AI_REPLY_LIMITS.rolling30DayPerGuest) {
    return await fail("customer", AI_REPLY_MESSAGES.customer, 200);
  }

  return { ok: true, guestId, conversationId, setCookie };
}

async function recordAbuseSignal(input: {
  merchantId: string;
  guestId: string;
  conversationId: string;
  reason: "merchant" | "conversation" | "customer" | "rate";
}): Promise<void> {
  const admin = createAdminClient();
  const feature =
    input.reason === "conversation"
      ? "abuse_conversation_limit"
      : input.reason === "customer"
        ? "abuse_customer_limit"
        : input.reason === "rate"
          ? "abuse_rate_limit"
          : "abuse_merchant_credits";

  await admin.from("ai_usage_log").insert({
    merchant_id: input.merchantId,
    customer_id: input.guestId,
    feature,
    credits_used: 0,
    model: null,
    prompt_tokens: null,
    completion_tokens: null,
    thoughts_tokens: null,
    estimated_cost_usd: null,
    response_ms: null,
  });

  // Repeated hits → quieter console flag for ops / future moderation queue.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", input.merchantId)
    .eq("customer_id", input.guestId)
    .like("feature", "abuse_%")
    .gte("created_at", since);

  if ((count ?? 0) >= AI_REPLY_LIMITS.abuseFlagThreshold) {
    console.warn(
      JSON.stringify({
        type: "ai_abuse_flag",
        merchantId: input.merchantId,
        guestId: input.guestId,
        conversationId: input.conversationId,
        reason: input.reason,
        abuseHits30d: count,
      }),
    );
  }
}

export type AiReplySuccessMeta = {
  merchantId: string;
  guestId: string;
  conversationId: string;
  model?: string | null;
  promptTokens?: number | null;
  responseTokens?: number | null;
  thoughtsTokens?: number | null;
  totalTokens?: number | null;
  responseMs?: number | null;
};

/**
 * Record one successful AI reply: analytics row + merchant monthly counter.
 * Call only after a usable model response has been produced.
 */
export async function recordSuccessfulAiReply(meta: AiReplySuccessMeta): Promise<void> {
  const admin = createAdminClient();

  // Fair-use analytics (conversation / rolling-customer caps read this table).
  await admin.from("menu_ai_reply_log").insert({
    merchant_id: meta.merchantId,
    guest_id: meta.guestId,
    conversation_id: meta.conversationId,
    model: meta.model ?? null,
    prompt_tokens: meta.promptTokens ?? null,
    response_tokens: meta.responseTokens ?? null,
    thoughts_tokens: meta.thoughtsTokens ?? null,
    total_tokens: meta.totalTokens ?? null,
    response_ms: meta.responseMs ?? null,
  });

  // Unified AI Credits — also powers "credits consumed per customer" analytics.
  const { deductAiCredits } = await import("@/lib/ai/credits");
  await deductAiCredits({
    merchantId: meta.merchantId,
    feature: "customer_reply",
    customerId: meta.guestId,
    model: meta.model,
    promptTokens: meta.promptTokens,
    completionTokens: meta.responseTokens,
    thoughtsTokens: meta.thoughtsTokens,
    responseMs: meta.responseMs,
  });
}

/** Dashboard meter — unified AI Credits for the current Menu billing cycle. */
export async function loadMerchantAiReplyUsage(merchantId: string): Promise<{
  used: number;
  limit: number;
}> {
  const { loadAiCreditDashboard } = await import("@/lib/ai/credits");
  const dash = await loadAiCreditDashboard(merchantId);
  return { used: dash.usedDisplay, limit: dash.limitDisplay };
}

/** @deprecated entitlement helper for older capacity paths. */
export async function loadMenuEntitlement(
  merchantId: string,
): Promise<ProductEntitlement | null> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("merchant_products")
    .select("product, plan_id, status, onboarded_at, trial_started_at, trial_ends_at")
    .eq("merchant_id", merchantId);
  return entitlementsFromRows(rows ?? []).menu;
}
