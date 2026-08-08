import "server-only";

import {
  areQueueHoursUsable,
  formatTimeForInput,
  getZonedClock,
  QUEUE_HOURS_TIMEZONE,
  shouldAutoCloseSessions,
  shouldAutoStartSessions,
} from "@/lib/merchant/queue-hours";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BranchRow, QueueSessionRow } from "@/lib/supabase/database.types";

/** Fail-open: never auto-close a session this young (cron race / clock skew). */
const AUTO_CLOSE_MIN_AGE_MS = 5 * 60_000;

/** Parse DB time; null when missing/unparseable (fail open — do not invent defaults). */
function parseConfiguredTime(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === "") return null;
  if (!/^\d{1,2}:\d{2}/.test(String(value).trim())) return null;
  return formatTimeForInput(value);
}

type HoursBranch = Pick<
  BranchRow,
  | "id"
  | "merchant_id"
  | "queue_open_time"
  | "queue_close_time"
  | "queue_open_days"
  | "queue_auto_start"
  | "queue_auto_close"
  | "queue_hours_timezone"
>;

async function listOpenSessionsForBranch(
  merchantId: string,
  branchId: string,
): Promise<QueueSessionRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("queue_sessions")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("branch_id", branchId)
    .in("status", ["live", "paused"]);
  return (data as QueueSessionRow[] | null) ?? [];
}

async function endSession(session: QueueSessionRow, nowIso: string) {
  const admin = createAdminClient();
  const { data: openEntries } = await admin
    .from("queue_entries")
    .select("id")
    .eq("session_id", session.id)
    .in("status", ["held", "waiting", "called"]);

  await admin
    .from("queue_entries")
    .update({ status: "left", left_at: nowIso })
    .eq("session_id", session.id)
    .in("status", ["held", "waiting", "called"]);

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

async function startSessionForBranch(merchantId: string, branchId: string) {
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

function sessionAgeMs(session: QueueSessionRow, now: Date): number {
  const started = new Date(session.started_at).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, now.getTime() - started);
}

/**
 * Starts / ends live queue sessions from each branch's store hours.
 * Intended to run every minute via Vercel Cron.
 *
 * Independence:
 * - Each branch is evaluated on its own hours / auto flags
 * - Auto start only creates a session for that branch when it has none
 * - Auto close only ends sessions belonging to that branch
 *
 * Fail-open rules for auto-close:
 * - Only when `queue_auto_close` is on for that branch
 * - Only after close time / closed day (`shouldAutoCloseSessions`) — never pre-open
 * - Never when hours / openDays are missing or invalid
 * - Never for sessions younger than AUTO_CLOSE_MIN_AGE_MS
 */
export async function processQueueAutoSessions(now = new Date()): Promise<{
  checked: number;
  started: number;
  closed: number;
  skippedYoung: number;
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
  if (merchantIds.length === 0) {
    return { checked: 0, started: 0, closed: 0, skippedYoung: 0 };
  }

  const { data: branches } = await admin
    .from("branches")
    .select(
      "id, merchant_id, queue_open_time, queue_close_time, queue_open_days, queue_auto_start, queue_auto_close, queue_hours_timezone",
    )
    .in("merchant_id", merchantIds)
    .or("queue_auto_start.eq.true,queue_auto_close.eq.true");

  // Only locations activated for Waitlist — global branches without a queue
  // assignment stay silent here even when their schedule flags are still on.
  const { data: queueAssignments } = await admin
    .from("product_branch_assignments")
    .select("merchant_id, branch_id")
    .eq("product", "queue")
    .eq("status", "active")
    .in("merchant_id", merchantIds);

  const assignedKeys = new Set(
    (queueAssignments ?? []).map((row) => `${row.merchant_id}:${row.branch_id}`),
  );
  // Pre-migration: if the table is empty for everyone, keep today's behaviour
  // (every flagged branch). Once any assignment exists, enforce the filter.
  const enforceAssignments = assignedKeys.size > 0;
  const scopedBranches = ((branches as HoursBranch[] | null) ?? []).filter((raw) =>
    enforceAssignments ? assignedKeys.has(`${raw.merchant_id}:${raw.id}`) : true,
  );

  let started = 0;
  let closed = 0;
  let skippedYoung = 0;
  const nowIso = now.toISOString();

  for (const raw of scopedBranches) {
    const openTime = parseConfiguredTime(raw.queue_open_time);
    const closeTime = parseConfiguredTime(raw.queue_close_time);
    const openDays = (
      Array.isArray(raw.queue_open_days) ? raw.queue_open_days : []
    )
      .map(Number)
      .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6);
    const timeZone =
      (raw.queue_hours_timezone || "").trim() || QUEUE_HOURS_TIMEZONE;
    const clock = getZonedClock(timeZone, now);
    const hoursOk =
      openTime !== null &&
      closeTime !== null &&
      areQueueHoursUsable(openTime, closeTime, openDays);
    let openSessions = await listOpenSessionsForBranch(raw.merchant_id, raw.id);

    // Close only at/after closing time (or on a closed day) — never the
    // pre-open gap, or a merchant starting early gets every guest auto-released.
    // Fail-open: invalid/empty hours → do not close.
    if (
      raw.queue_auto_close === true &&
      hoursOk &&
      openTime &&
      closeTime &&
      shouldAutoCloseSessions(clock, openTime, closeTime, openDays) &&
      openSessions.length > 0
    ) {
      for (const session of openSessions) {
        const age = sessionAgeMs(session, now);
        if (age < AUTO_CLOSE_MIN_AGE_MS) {
          skippedYoung += 1;
          console.info(
            JSON.stringify({
              scope: "queue_auto_sessions",
              event: "skip_close_young_session",
              merchantId: raw.merchant_id,
              branchId: raw.id,
              sessionId: session.id,
              ageMs: age,
              clock,
              openTime,
              closeTime,
              at: nowIso,
            }),
          );
          continue;
        }
        console.info(
          JSON.stringify({
            scope: "queue_auto_sessions",
            event: "auto_close_session",
            merchantId: raw.merchant_id,
            branchId: raw.id,
            sessionId: session.id,
            ageMs: age,
            clock,
            openTime,
            closeTime,
            openDays,
            at: nowIso,
          }),
        );
        await endSession(session, nowIso);
        closed += 1;
      }
      // Refresh before auto-start so we don't start on top of a just-closed set.
      openSessions = await listOpenSessionsForBranch(raw.merchant_id, raw.id);
    }

    // Auto start is independent: only creates when inside open window + flag + no session.
    if (
      raw.queue_auto_start === true &&
      hoursOk &&
      openTime &&
      closeTime &&
      shouldAutoStartSessions(clock, openTime, closeTime, openDays) &&
      openSessions.length === 0
    ) {
      const ok = await startSessionForBranch(raw.merchant_id, raw.id);
      if (ok) {
        started += 1;
        // Attach today's confirmed reservations as held slots.
        const sessions = await listOpenSessionsForBranch(raw.merchant_id, raw.id);
        for (const session of sessions) {
          const { syncTodayReservationHolds } = await import(
            "@/lib/queue/reservation-holds"
          );
          await syncTodayReservationHolds({
            merchantId: raw.merchant_id,
            sessionId: session.id,
            branchId: session.branch_id,
          });
        }
        console.info(
          JSON.stringify({
            scope: "queue_auto_sessions",
            event: "auto_start_session",
            merchantId: raw.merchant_id,
            branchId: raw.id,
            clock,
            openTime,
            closeTime,
            openDays,
            at: nowIso,
          }),
        );
      }
    }
  }

  return { checked: (branches ?? []).length, started, closed, skippedYoung };
}
