import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  entitlementsFromRows,
  isProductEnabled,
  isTrialActive,
} from "@/lib/merchant/entitlements";
import { QUEUE_TRIAL_LIMITS, trialTicketLimitError } from "@/lib/merchant/plan-limits";

export type QueueCapacityResult =
  | { ok: true }
  /** `error` is merchant-facing; guests get generic copy from the caller. */
  | { ok: false; reason: "locked" | "trial_limit"; error: string };

/**
 * Single gate for creating a queue ticket, shared by the public QR join and the
 * merchant's own "add guest". Keeping both on one rule means a merchant can't
 * walk past a cap the guest form enforces (or the reverse).
 */
export async function checkQueueCapacity(
  merchantId: string,
): Promise<QueueCapacityResult> {
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("merchant_products")
    .select("product, plan_id, status, onboarded_at, trial_started_at, trial_ends_at")
    .eq("merchant_id", merchantId);

  const entitlements = entitlementsFromRows(rows ?? []);
  if (!isProductEnabled(entitlements, "queue")) {
    return {
      ok: false,
      reason: "locked",
      error: "Smart Queue isn't active on your account.",
    };
  }

  const queue = entitlements.queue;
  if (!isTrialActive(queue) || !queue?.trialStartedAt) return { ok: true };

  const { count } = await admin
    .from("queue_entries")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .gte("joined_at", queue.trialStartedAt);

  if ((count ?? 0) >= QUEUE_TRIAL_LIMITS.maxTicketsPerTrial) {
    return { ok: false, reason: "trial_limit", error: trialTicketLimitError() };
  }

  return { ok: true };
}
