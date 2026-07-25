import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CALL_REMINDER_MINUTES,
  QUEUE_CALL_REMINDER_TEMPLATE,
  type QueueCallReminderNumber,
} from "@/lib/queue/call-reminders";
import { sendCustomerNotification } from "@/lib/notifications/dispatcher";

export interface QueueCallReminderResult {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
}

type ReminderColumn =
  | "reminder_1_sent_at"
  | "reminder_2_sent_at"
  | "reminder_3_sent_at";

type ScheduledColumn =
  | "reminder_1_scheduled_at"
  | "reminder_2_scheduled_at"
  | "reminder_3_scheduled_at";

const REMINDER_COLUMN: Record<QueueCallReminderNumber, ReminderColumn> = {
  1: "reminder_1_sent_at",
  2: "reminder_2_sent_at",
  3: "reminder_3_sent_at",
};

const SCHEDULED_COLUMN: Record<QueueCallReminderNumber, ScheduledColumn> = {
  1: "reminder_1_scheduled_at",
  2: "reminder_2_scheduled_at",
  3: "reminder_3_scheduled_at",
};

interface QueueCallJobRow {
  id: string;
  merchant_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  status: string;
  called_at: string;
  reminder_1_scheduled_at: string;
  reminder_2_scheduled_at: string;
  reminder_3_scheduled_at: string;
  reminder_1_sent_at: string | null;
  reminder_2_sent_at: string | null;
  reminder_3_sent_at: string | null;
}

function jobLog(
  level: "info" | "error" | "warn",
  event: string,
  fields: Record<string, unknown>,
) {
  const line = {
    scope: "queue_call_reminders",
    level,
    event,
    ...fields,
    at: new Date().toISOString(),
  };
  const payload = JSON.stringify(line);
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

/**
 * Next missed/due reminder: scheduled_at <= now AND sent_at IS NULL.
 * Walks 1→2→3 so a delayed cron (+8m) still sends rem 1 then rem 2.
 */
function nextDueReminder(
  job: QueueCallJobRow,
  nowMs: number,
): QueueCallReminderNumber | null {
  for (const n of [1, 2, 3] as const) {
    const sentAt = job[REMINDER_COLUMN[n]];
    if (sentAt) continue;
    const scheduledMs = new Date(job[SCHEDULED_COLUMN[n]]).getTime();
    if (!Number.isFinite(scheduledMs)) continue;
    if (scheduledMs <= nowMs) return n;
  }
  return null;
}

async function loadNotifiableCustomer(
  admin: ReturnType<typeof createAdminClient>,
  job: QueueCallJobRow,
): Promise<{
  phone: string;
  name: string;
  publicToken: string;
  whatsappAvailable: boolean;
  preferredNotificationChannel: "sms" | "whatsapp";
} | null> {
  if (!job.customer_id) return null;

  const { data: customer } = await admin
    .from("customers")
    .select("name, phone, public_token, whatsapp_available, preferred_notification_channel")
    .eq("id", job.customer_id)
    .maybeSingle();

  if (!customer?.public_token || !customer.phone) return null;

  return {
    phone: customer.phone,
    name: customer.name || job.customer_name,
    publicToken: customer.public_token,
    whatsappAvailable: customer.whatsapp_available === true,
    preferredNotificationChannel:
      customer.preferred_notification_channel === "whatsapp" ? "whatsapp" : "sms",
  };
}

async function loadBusinessName(
  admin: ReturnType<typeof createAdminClient>,
  merchantId: string,
): Promise<string> {
  const { data } = await admin
    .from("merchants")
    .select("business_name")
    .eq("id", merchantId)
    .maybeSingle();
  return (data?.business_name ?? "the store").trim() || "the store";
}

/**
 * Cron worker: send due queue call reminders (CALL_REMINDER_MINUTES).
 *
 * Missed-cron recovery: any reminder with scheduled_at <= now and
 * sent_at IS NULL is eligible — delayed wakes catch up in order.
 *
 * Idempotent claim-then-send: UPDATE only when status is still `called`
 * and that reminder's sent_at is still null. Seated / skipped / left
 * never receive further reminders. After reminder 3, jobs stay `called`
 * until the merchant resolves them.
 */
export async function processQueueCallReminders(
  limit = 50,
): Promise<QueueCallReminderResult> {
  const admin = createAdminClient();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // Candidates: still called, at least one reminder unsent, and rem1 schedule
  // has passed (implies later reminders may also be due for catch-up).
  // Exact due check is scheduled_at <= now && sent_at IS NULL in nextDueReminder.
  const { data: candidates, error } = await admin
    .from("queue_call_jobs")
    .select(
      "id, merchant_id, customer_id, customer_name, customer_phone, party_size, status, called_at, reminder_1_scheduled_at, reminder_2_scheduled_at, reminder_3_scheduled_at, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at",
    )
    .eq("status", "called")
    .lte("reminder_1_scheduled_at", nowIso)
    .or(
      "reminder_1_sent_at.is.null,reminder_2_sent_at.is.null,reminder_3_sent_at.is.null",
    )
    .order("called_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`queue call reminder query failed: ${error.message}`);
  }

  const jobs = (candidates ?? []) as QueueCallJobRow[];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of jobs) {
    // Catch up every missed due reminder in one pass (e.g. cron wakes at +8m).
    let working: QueueCallJobRow = { ...job };
    let due = nextDueReminder(working, nowMs);
    if (!due) {
      skipped += 1;
      continue;
    }

    while (due) {
      const reminder = due;
      const column = REMINDER_COLUMN[reminder];
      const claimIso = new Date().toISOString();

      // Claim only if still called and this reminder was never sent.
      const { data: claimed, error: claimError } = await admin
        .from("queue_call_jobs")
        .update({ [column]: claimIso })
        .eq("id", working.id)
        .eq("status", "called")
        .is(column, null)
        .select("id, status")
        .maybeSingle();

      if (claimError) {
        failed += 1;
        jobLog("error", "claim_failed", {
          jobId: working.id,
          reminder,
          error: claimError.message,
        });
        break;
      }

      if (!claimed) {
        // Already sent, or merchant seated/left/skipped the party.
        skipped += 1;
        jobLog("info", "claim_skipped", {
          jobId: working.id,
          reminder,
          reason: "status_changed_or_already_sent",
        });
        break;
      }

      working = { ...working, [column]: claimIso };

      try {
        // Final status gate before network send.
        const { data: fresh } = await admin
          .from("queue_call_jobs")
          .select("status")
          .eq("id", working.id)
          .maybeSingle();
        if (!fresh || fresh.status !== "called") {
          skipped += 1;
          jobLog("info", "status_changed_before_send", {
            jobId: working.id,
            reminder,
            status: fresh?.status ?? "missing",
          });
          break;
        }

        const customer = await loadNotifiableCustomer(admin, working);
        if (!customer) {
          skipped += 1;
          jobLog("warn", "missing_customer", { jobId: working.id, reminder });
          break;
        }

        const businessName = await loadBusinessName(admin, working.merchant_id);
        const result = await sendCustomerNotification({
          customer,
          template: QUEUE_CALL_REMINDER_TEMPLATE[reminder],
          data: {
            businessName,
            bookingSize: working.party_size,
          },
        });

        if (!result.ok) {
          failed += 1;
          jobLog("error", "send_failed", {
            jobId: working.id,
            reminder,
            error: result.error,
          });
          break;
        }

        sent += 1;
        jobLog("info", "reminder_sent", {
          jobId: working.id,
          reminder,
          minutes: CALL_REMINDER_MINUTES[reminder - 1],
          channel: result.channel,
        });
      } catch (err) {
        failed += 1;
        jobLog("error", "send_exception", {
          jobId: working.id,
          reminder,
          error: err instanceof Error ? err.message : "unknown",
        });
        break;
      }

      due = nextDueReminder(working, nowMs);
    }
  }

  return { scanned: jobs.length, sent, skipped, failed };
}
