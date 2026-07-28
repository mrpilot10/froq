import "server-only";

import {
  formatTimeForInput,
  getZonedClock,
  isWithinOpenWindow,
  minutesSinceOpen,
  QUEUE_HOURS_TIMEZONE,
} from "@/lib/merchant/queue-hours";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MerchantRow, QueueSessionRow } from "@/lib/supabase/database.types";

const AUTO_START_CATCHUP_MINUTES = 45;

type HoursMerchant = Pick<
  MerchantRow,
  | "id"
  | "queue_open_time"
  | "queue_close_time"
  | "queue_open_days"
  | "queue_auto_start"
  | "queue_auto_close"
>;

async function listOpenSessions(merchantId: string): Promise<QueueSessionRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("queue_sessions")
    .select("*")
    .eq("merchant_id", merchantId)
    .in("status", ["live", "paused"]);
  return (data as QueueSessionRow[] | null) ?? [];
}

async function endSession(session: QueueSessionRow, nowIso: string) {
  const admin = createAdminClient();
  const { data: openEntries } = await admin
    .from("queue_entries")
    .select("id")
    .eq("session_id", session.id)
    .in("status", ["waiting", "called"]);

  await admin
    .from("queue_entries")
    .update({ status: "left", left_at: nowIso })
    .eq("session_id", session.id)
    .in("status", ["waiting", "called"]);

  await admin
    .from("queue_sessions")
    .update({ status: "ended", ended_at: nowIso })
    .eq("id", session.id)
    .in("status", ["live", "paused"]);

  for (const entry of openEntries ?? []) {
    await admin
      .from("queue_call_jobs")
      .update({ status: "left", resolved_at: nowIso })
      .eq("merchant_id", session.merchant_id)
      .eq("client_entry_id", entry.id)
      .eq("status", "called");
  }
}

async function startSessionForBranch(merchantId: string, branchId: string | null) {
  const admin = createAdminClient();
  const { data: last } = await admin
    .from("queue_sessions")
    .select("number")
    .eq("merchant_id", merchantId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const number = Math.max(0, Number(last?.number) || 0) + 1;

  const { error } = await admin.from("queue_sessions").insert({
    merchant_id: merchantId,
    branch_id: branchId,
    number,
    status: "live",
    started_by_user_id: null,
    started_by_name: "Auto-start",
    started_by_role: null,
  });
  return !error;
}

async function defaultBranchId(merchantId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("branches")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("is_default", true)
    .maybeSingle();
  if (data?.id) return data.id;

  const { data: anyBranch } = await admin
    .from("branches")
    .select("id")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return anyBranch?.id ?? null;
}

/**
 * Starts / ends live queue sessions from merchant store hours.
 * Intended to run every minute via Vercel Cron.
 */
export async function processQueueAutoSessions(now = new Date()): Promise<{
  checked: number;
  started: number;
  closed: number;
}> {
  const admin = createAdminClient();

  // Merchants with an active (or trial) queue product and at least one auto flag.
  const { data: products } = await admin
    .from("merchant_products")
    .select("merchant_id, plan_id, trial_ends_at")
    .eq("product", "queue")
    .eq("status", "active");

  const merchantIds = [
    ...new Set(
      (products ?? [])
        .filter((p) => {
          if (!p.trial_ends_at) return true;
          return new Date(p.trial_ends_at).getTime() > now.getTime();
        })
        .map((p) => p.merchant_id as string),
    ),
  ];
  if (merchantIds.length === 0) return { checked: 0, started: 0, closed: 0 };

  const { data: merchants } = await admin
    .from("merchants")
    .select(
      "id, queue_open_time, queue_close_time, queue_open_days, queue_auto_start, queue_auto_close",
    )
    .in("id", merchantIds)
    .or("queue_auto_start.eq.true,queue_auto_close.eq.true");

  let started = 0;
  let closed = 0;
  const nowIso = now.toISOString();

  for (const raw of (merchants as HoursMerchant[] | null) ?? []) {
    const openTime = formatTimeForInput(raw.queue_open_time);
    const closeTime = formatTimeForInput(raw.queue_close_time);
    const openDays = Array.isArray(raw.queue_open_days) ? raw.queue_open_days : [];
    const clock = getZonedClock(QUEUE_HOURS_TIMEZONE, now);
    const within = isWithinOpenWindow(clock, openTime, closeTime, openDays);
    const openSessions = await listOpenSessions(raw.id);
    const autoOn = raw.queue_auto_start === true || raw.queue_auto_close === true;

    if (autoOn && !within && openSessions.length > 0) {
      for (const session of openSessions) {
        await endSession(session, nowIso);
        closed += 1;
      }
    }

    if (autoOn && within && openSessions.length === 0) {
      const sinceOpen = minutesSinceOpen(clock, openTime);
      const sinceAdjusted = sinceOpen >= 0 ? sinceOpen : sinceOpen + 24 * 60;
      if (sinceAdjusted >= 0 && sinceAdjusted <= AUTO_START_CATCHUP_MINUTES) {
        const branchId = await defaultBranchId(raw.id);
        const ok = await startSessionForBranch(raw.id, branchId);
        if (ok) started += 1;
      }
    }
  }

  return { checked: (merchants ?? []).length, started, closed };
}
