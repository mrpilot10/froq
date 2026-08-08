import "server-only";

import {
  notifyTrialEnding,
  notifyUsageThreshold,
} from "@/lib/notifications/billing-emails";
import {
  isTrialActive,
  entitlementsFromRows,
} from "@/lib/merchant/entitlements";
import {
  QUEUE_TRIAL_LIMITS,
  RESERVATION_TRIAL_LIMITS,
  loyaltyPlanLimits,
  queuePlanLimits,
  reservationPlanLimits,
} from "@/lib/merchant/plan-limits";
import { loadMerchantAiReplyUsage } from "@/lib/menu/ai-replies";
import { basePlanId } from "@/lib/merchant/pricing";
import type { MerchantProduct } from "@/lib/merchant/types";
import { createAdminClient } from "@/lib/supabase/admin";

const USAGE_THRESHOLDS = [50, 70, 100] as const;

export interface BillingNoticeCronResult {
  trialScanned: number;
  trialNotified: number;
  usageScanned: number;
  usageNotified: number;
}

function calendarMonthStartIso(now = new Date()): string {
  const start = new Date(now);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function monthPeriodKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function crossedThresholds(used: number, limit: number): Array<50 | 70 | 100> {
  if (limit <= 0) return [];
  const ratio = used / limit;
  const hit: Array<50 | 70 | 100> = [];
  for (const threshold of USAGE_THRESHOLDS) {
    if (ratio >= threshold / 100) hit.push(threshold);
  }
  return hit;
}

/**
 * Trial ending reminders at 2 days and 1 day remaining.
 */
export async function processTrialEndingReminders(
  now = new Date(),
): Promise<{ scanned: number; notified: number }> {
  const admin = createAdminClient();
  const nowMs = now.getTime();
  const in2Days = new Date(nowMs + 2.5 * 86_400_000).toISOString();
  const from = now.toISOString();

  const { data: rows } = await admin
    .from("merchant_products")
    .select("merchant_id, product, plan_id, trial_started_at, trial_ends_at, status")
    .is("plan_id", null)
    .not("trial_ends_at", "is", null)
    .gt("trial_ends_at", from)
    .lte("trial_ends_at", in2Days)
    .eq("status", "active");

  let notified = 0;
  for (const row of rows ?? []) {
    const product = row.product as MerchantProduct;
    // Queue + Reservations ship with trials today; Menu is included so any
    // future/menu trial rows still get the same 2d / 1d owner reminders.
    if (
      product !== "queue" &&
      product !== "reservation" &&
      product !== "menu"
    ) {
      continue;
    }
    if (!row.trial_ends_at || !row.merchant_id) continue;

    const endsMs = new Date(row.trial_ends_at).getTime();
    const daysLeft = Math.ceil((endsMs - nowMs) / 86_400_000);
    if (daysLeft !== 1 && daysLeft !== 2) continue;

    await notifyTrialEnding({
      merchantId: row.merchant_id as string,
      product,
      daysLeft,
      trialEndsAt: row.trial_ends_at,
    });
    notified += 1;
  }

  return { scanned: rows?.length ?? 0, notified };
}

async function countLoyaltyCustomers(merchantId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .eq("banned", false);
  return count ?? 0;
}

async function countQueueTickets(
  merchantId: string,
  sinceIso: string,
): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("queue_entries")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .gte("joined_at", sinceIso);
  return count ?? 0;
}

async function countReservations(
  merchantId: string,
  sinceIso: string,
): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .gte("created_at", sinceIso);
  return count ?? 0;
}

type UsageTarget = {
  merchantId: string;
  product: MerchantProduct;
  metricKey: string;
  metricLabel: string;
  used: number;
  limit: number;
  periodKey: string;
};

async function usageTargetsForRow(row: {
  merchant_id: string;
  product: string;
  plan_id: string | null;
  status: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
}): Promise<UsageTarget[]> {
  const product = row.product as MerchantProduct;
  const merchantId = row.merchant_id;
  const entitlements = entitlementsFromRows([
    {
      product,
      plan_id: row.plan_id,
      status: row.status as "active" | "past_due" | "canceled",
      onboarded_at: null,
      trial_started_at: row.trial_started_at,
      trial_ends_at: row.trial_ends_at,
    },
  ]);
  const entitlement = entitlements[product];
  const out: UsageTarget[] = [];

  if (product === "loyalty") {
    const limits = loyaltyPlanLimits(row.plan_id);
    const used = await countLoyaltyCustomers(merchantId);
    out.push({
      merchantId,
      product,
      metricKey: "customers",
      metricLabel: "customers",
      used,
      limit: limits.maxCustomers,
      periodKey: `plan:${basePlanId(row.plan_id ?? "starter")}`,
    });
    return out;
  }

  if (product === "queue") {
    const onTrial = isTrialActive(entitlement);
    const limit = onTrial
      ? QUEUE_TRIAL_LIMITS.maxTicketsPerTrial
      : queuePlanLimits(row.plan_id).maxTicketsPerMonth;
    const since =
      onTrial && row.trial_started_at
        ? row.trial_started_at
        : calendarMonthStartIso();
    const used = await countQueueTickets(merchantId, since);
    out.push({
      merchantId,
      product,
      metricKey: "tickets",
      metricLabel: "queue tickets",
      used,
      limit,
      periodKey: onTrial
        ? `trial:${(row.trial_ends_at ?? "").slice(0, 10)}`
        : monthPeriodKey(),
    });
    return out;
  }

  if (product === "reservation") {
    const onTrial = isTrialActive(entitlement);
    const limit = onTrial
      ? RESERVATION_TRIAL_LIMITS.maxBookingsPerTrial
      : reservationPlanLimits(row.plan_id).maxReservationsPerMonth;
    const since =
      onTrial && row.trial_started_at
        ? row.trial_started_at
        : calendarMonthStartIso();
    const used = await countReservations(merchantId, since);
    out.push({
      merchantId,
      product,
      metricKey: "bookings",
      metricLabel: "reservations",
      used,
      limit,
      periodKey: onTrial
        ? `trial:${(row.trial_ends_at ?? "").slice(0, 10)}`
        : monthPeriodKey(),
    });
    return out;
  }

  if (product === "menu") {
    const replies = await loadMerchantAiReplyUsage(merchantId);
    out.push({
      merchantId,
      product,
      metricKey: "ai_credits",
      metricLabel: "AI Credits",
      used: replies.used,
      limit: replies.limit,
      periodKey: isTrialActive(entitlement)
        ? `trial:${(row.trial_ends_at ?? "").slice(0, 10)}`
        : monthPeriodKey(),
    });
    return out;
  }

  return out;
}

/**
 * Sends 50% / 70% / 100% ownership usage emails for active product meters.
 */
export async function processUsageThresholdNotices(): Promise<{
  scanned: number;
  notified: number;
}> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("merchant_products")
    .select(
      "merchant_id, product, plan_id, status, trial_started_at, trial_ends_at",
    )
    .eq("status", "active");

  let scanned = 0;
  let notified = 0;

  for (const row of rows ?? []) {
    if (!row.merchant_id) continue;
    const targets = await usageTargetsForRow(row);
    for (const target of targets) {
      scanned += 1;
      if (target.limit <= 0) continue;
      for (const percent of crossedThresholds(target.used, target.limit)) {
        await notifyUsageThreshold({ ...target, percent });
        notified += 1;
      }
    }
  }

  return { scanned, notified };
}

export async function processBillingNoticeCrons(
  now = new Date(),
): Promise<BillingNoticeCronResult> {
  const trial = await processTrialEndingReminders(now);
  const usage = await processUsageThresholdNotices();
  return {
    trialScanned: trial.scanned,
    trialNotified: trial.notified,
    usageScanned: usage.scanned,
    usageNotified: usage.notified,
  };
}
