import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { formatTimeForInput } from "@/lib/merchant/queue-hours";
import { recordReservationEvent } from "@/lib/reservations/events";
import {
  resolveReservationTarget,
  sendReservationNotification,
} from "@/lib/reservations/notify";
import { releaseQueueHoldForReservation } from "@/lib/queue/reservation-holds";

export interface ReservationAutoDeclineResult {
  scanned: number;
  declined: number;
  skipped: number;
  failed: number;
}

const HOUR_MS = 3_600_000;
/** Smallest non-zero setting — anything newer than this can't be due yet. */
const MIN_AUTO_DECLINE_HOURS = 2;

const AUTO_DECLINE_REASON =
  "No response from the restaurant within the time limit.";

interface PendingRow {
  id: string;
  merchant_id: string;
  public_token: string;
  customer_id: string | null;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  created_at: string;
  suggested_at: string | null;
  merchants:
    | { reservation_auto_decline_hours: number | null }
    | { reservation_auto_decline_hours: number | null }[]
    | null;
}

function autoDeclineLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown>,
) {
  const line = JSON.stringify({
    scope: "reservation_auto_decline",
    level,
    event,
    ...fields,
    at: new Date().toISOString(),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

function merchantHours(
  merchants: PendingRow["merchants"],
): number {
  const row = Array.isArray(merchants) ? merchants[0] : merchants;
  return Math.max(0, Math.floor(Number(row?.reservation_auto_decline_hours) || 0));
}

/**
 * Cron worker: decline pending requests the merchant never reviewed.
 *
 * A booking is due when `created_at + auto_decline_hours` has passed, the
 * status is still pending, and no alternate-time proposal is waiting on the
 * guest. Claim-then-notify so overlapping runs can't double-send.
 */
export async function processReservationAutoDeclines(
  limit = 100,
): Promise<ReservationAutoDeclineResult> {
  const admin = createAdminClient();
  const nowMs = Date.now();
  const oldestCandidateIso = new Date(
    nowMs - MIN_AUTO_DECLINE_HOURS * HOUR_MS,
  ).toISOString();

  const { data, error } = await admin
    .from("reservations")
    .select(
      `id, merchant_id, public_token, customer_id, party_size, reservation_date, reservation_time, created_at, suggested_at,
       merchants!inner(reservation_auto_decline_hours)`,
    )
    .eq("status", "pending")
    .is("suggested_at", null)
    .lte("created_at", oldestCandidateIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`reservation auto-decline query failed: ${error.message}`);
  }

  const rows = (data ?? []) as PendingRow[];
  let declined = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const hours = merchantHours(row.merchants);
    if (hours <= 0) {
      skipped += 1;
      continue;
    }

    const createdMs = Date.parse(row.created_at);
    if (!Number.isFinite(createdMs) || nowMs < createdMs + hours * HOUR_MS) {
      skipped += 1;
      continue;
    }

    const nowIso = new Date(nowMs).toISOString();
    const { data: claimed, error: claimError } = await admin
      .from("reservations")
      .update({
        status: "declined",
        declined_at: nowIso,
        decline_reason: AUTO_DECLINE_REASON,
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .is("suggested_at", null)
      .select("id")
      .maybeSingle();

    if (claimError) {
      failed += 1;
      autoDeclineLog("error", "claim_failed", {
        reservationId: row.id,
        error: claimError.message,
      });
      continue;
    }
    if (!claimed) {
      skipped += 1;
      continue;
    }

    await recordReservationEvent({
      reservationId: row.id,
      merchantId: row.merchant_id,
      event: "declined",
      actor: { kind: "system" },
      detail: `Auto-declined after ${hours} hour${hours === 1 ? "" : "s"}`,
    });

    await releaseQueueHoldForReservation(row.id, "declined");

    const target = await resolveReservationTarget({
      merchantId: row.merchant_id,
      customerId: row.customer_id,
    });
    const time = formatTimeForInput(row.reservation_time);
    const notify = await sendReservationNotification({
      target,
      template: "reservation_declined",
      merchantId: row.merchant_id,
      reservationToken: row.public_token,
      date: row.reservation_date,
      time,
      partySize: row.party_size,
      declineReason: AUTO_DECLINE_REASON,
    });

    if (!notify.ok && !notify.skipped) {
      autoDeclineLog("warn", "notify_failed", {
        reservationId: row.id,
        error: notify.error,
      });
    }

    declined += 1;
    autoDeclineLog("info", "declined", {
      reservationId: row.id,
      merchantId: row.merchant_id,
      hours,
    });
  }

  return {
    scanned: rows.length,
    declined,
    skipped,
    failed,
  };
}
