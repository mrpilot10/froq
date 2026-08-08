import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { formatTimeForInput } from "@/lib/merchant/queue-hours";
import {
  addDays,
  reservationStartMs,
  reservationToday,
} from "@/lib/merchant/reservations";
import {
  resolveReservationTarget,
  sendReservationNotification,
} from "./notify";

export interface ReservationReminderResult {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** Reminder offsets before the booking, in minutes. */
const OFFSETS = { h24: 24 * 60, h2: 2 * 60, m30: 30 } as const;

type ReminderKey = keyof typeof OFFSETS;

const SENT_COLUMN: Record<ReminderKey, string> = {
  h24: "reminder_24h_sent_at",
  h2: "reminder_2h_sent_at",
  m30: "reminder_30m_sent_at",
};

const HOUR_MS = 3_600_000;

/**
 * Which reminders a booking gets, decided by how much notice the merchant's
 * confirmation gave. A table confirmed two hours out doesn't need a nudge a day
 * earlier, and a very late confirmation gets none at all.
 */
export function remindersForLead(leadMs: number): ReminderKey[] {
  if (leadMs > 24 * HOUR_MS) return ["h24", "h2"];
  if (leadMs > 6 * HOUR_MS) return ["h2"];
  if (leadMs > 2 * HOUR_MS) return ["m30"];
  return [];
}

interface ReservationReminderRow {
  id: string;
  merchant_id: string;
  public_token: string;
  customer_id: string | null;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  status: string;
  confirmed_at: string | null;
  reminder_24h_sent_at: string | null;
  reminder_2h_sent_at: string | null;
  reminder_30m_sent_at: string | null;
}

function reminderLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown>,
) {
  const line = JSON.stringify({
    scope: "reservation_reminders",
    level,
    event,
    ...fields,
    at: new Date().toISOString(),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/** The earliest eligible reminder that is due now and hasn't been sent. */
function nextDueReminder(
  row: ReservationReminderRow,
  startMs: number,
  nowMs: number,
): ReminderKey | null {
  const confirmedMs = row.confirmed_at ? Date.parse(row.confirmed_at) : NaN;
  if (!Number.isFinite(confirmedMs)) return null;

  for (const key of remindersForLead(startMs - confirmedMs)) {
    if (row[SENT_COLUMN[key] as keyof ReservationReminderRow]) continue;
    if (nowMs >= startMs - OFFSETS[key] * 60_000) return key;
  }
  return null;
}

/**
 * Cron worker: send due reservation reminders.
 *
 * Claim-then-send — the sent-at column is written first, guarded on it still
 * being null and the booking still confirmed, so a delayed or overlapping run
 * can never send the same reminder twice. Bookings whose time has already
 * passed are left alone: a late reminder is worse than none.
 */
export async function processReservationReminders(
  limit = 100,
): Promise<ReservationReminderResult> {
  const admin = createAdminClient();
  const nowMs = Date.now();
  const today = reservationToday(new Date(nowMs));

  const { data, error } = await admin
    .from("reservations")
    .select(
      "id, merchant_id, public_token, customer_id, party_size, reservation_date, reservation_time, status, confirmed_at, reminder_24h_sent_at, reminder_2h_sent_at, reminder_30m_sent_at",
    )
    .eq("status", "confirmed")
    .not("confirmed_at", "is", null)
    // Reminders never fire more than a day ahead, so this window covers every
    // booking that could be due right now.
    .gte("reservation_date", addDays(today, -1))
    .lte("reservation_date", addDays(today, 2))
    .or(
      "reminder_24h_sent_at.is.null,reminder_2h_sent_at.is.null,reminder_30m_sent_at.is.null",
    )
    .order("reservation_date", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`reservation reminder query failed: ${error.message}`);
  }

  const rows = (data ?? []) as ReservationReminderRow[];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const time = formatTimeForInput(row.reservation_time);
    const startMs = reservationStartMs(row.reservation_date, time);
    if (!Number.isFinite(startMs) || startMs <= nowMs) {
      skipped += 1;
      continue;
    }

    const due = nextDueReminder(row, startMs, nowMs);
    if (!due) {
      skipped += 1;
      continue;
    }

    const column = SENT_COLUMN[due];
    const target = await resolveReservationTarget({
      merchantId: row.merchant_id,
      customerId: row.customer_id,
    });
    if (!target.enabled) {
      // WhatsApp is off for this merchant. Leave the column null so reminders
      // resume if they turn it back on before the booking.
      skipped += 1;
      continue;
    }

    const { data: claimed, error: claimError } = await admin
      .from("reservations")
      .update({ [column]: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "confirmed")
      .is(column, null)
      .select("id")
      .maybeSingle();

    if (claimError) {
      failed += 1;
      reminderLog("error", "claim_failed", {
        reservationId: row.id,
        reminder: due,
        error: claimError.message,
      });
      continue;
    }
    if (!claimed) {
      skipped += 1;
      continue;
    }

    const result = await sendReservationNotification({
      target,
      template: "reservation_reminder",
      merchantId: row.merchant_id,
      reservationToken: row.public_token,
      date: row.reservation_date,
      time,
      partySize: row.party_size,
    });

    if (!result.ok) {
      failed += 1;
      reminderLog("error", "send_failed", {
        reservationId: row.id,
        reminder: due,
        error: result.error,
      });
      continue;
    }

    sent += 1;
    reminderLog("info", "reminder_sent", { reservationId: row.id, reminder: due });
  }

  return { scanned: rows.length, sent, skipped, failed };
}
