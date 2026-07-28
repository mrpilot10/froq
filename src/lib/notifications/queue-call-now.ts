import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendCustomerNotification } from "@/lib/notifications/dispatcher";
import {
  CALL_NOTIFY_CATCHUP_AFTER_MS,
  CALL_NOTIFY_PROCESSING_STALE_MS,
} from "@/lib/queue/call-reminders";
import type { NotifiableCustomer } from "@/lib/notifications/types";

export type DeliverQueueCallNowResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; channel: "whatsapp" }
  | { ok: false; error: string };

function callNowLog(
  level: "info" | "error" | "warn",
  event: string,
  fields: Record<string, unknown>,
) {
  const line = JSON.stringify({
    scope: "queue_call_now",
    level,
    event,
    ...fields,
    at: new Date().toISOString(),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

function whatsAppCustomer(customer: NotifiableCustomer): NotifiableCustomer {
  return {
    ...customer,
    whatsappAvailable: true,
    preferredNotificationChannel: "whatsapp",
  };
}

/**
 * Single idempotent path for `queue_call_now`.
 * Used by merchant `after()` hooks and the catch-up cron.
 */
export async function deliverQueueCallNow(input: {
  jobId: string;
  /**
   * The call event this send belongs to. Every write is gated on it, so a send
   * left in flight by a superseded call can never deliver or mark.
   */
  calledAt: string;
  customer: NotifiableCustomer;
  businessName: string;
  bookingSize: number;
}): Promise<DeliverQueueCallNowResult> {
  const admin = createAdminClient();
  const nowMs = Date.now();
  const staleBefore = new Date(nowMs - CALL_NOTIFY_PROCESSING_STALE_MS).toISOString();

  const { data: job, error: loadError } = await admin
    .from("queue_call_jobs")
    .select("id, status, called_at, called_notified_at")
    .eq("id", input.jobId)
    .maybeSingle();

  if (loadError) {
    return { ok: false, error: loadError.message };
  }
  if (!job || job.status !== "called") {
    return { ok: true, skipped: true, reason: "job_not_open" };
  }
  if (job.called_at !== input.calledAt) {
    return { ok: true, skipped: true, reason: "superseded_call_event" };
  }
  if (job.called_notified_at) {
    return { ok: true, skipped: true, reason: "already_notified" };
  }

  const { data: claimed, error: claimError } = await admin
    .from("queue_call_jobs")
    .update({ call_notify_processing_at: new Date().toISOString() })
    .eq("id", input.jobId)
    .eq("status", "called")
    .eq("called_at", input.calledAt)
    .is("called_notified_at", null)
    .or(`call_notify_processing_at.is.null,call_notify_processing_at.lt.${staleBefore}`)
    .select("id")
    .maybeSingle();

  if (claimError) {
    return { ok: false, error: claimError.message };
  }
  if (!claimed) {
    return { ok: true, skipped: true, reason: "processing_elsewhere" };
  }

  try {
    const result = await sendCustomerNotification({
      customer: whatsAppCustomer(input.customer),
      template: "queue_call_now",
      data: {
        businessName: input.businessName,
        bookingSize: input.bookingSize,
      },
    });

    if (!result.ok) {
      await admin
        .from("queue_call_jobs")
        .update({ call_notify_processing_at: null })
        .eq("id", input.jobId)
        .is("called_notified_at", null);
      callNowLog("error", "send_failed", {
        jobId: input.jobId,
        error: result.error,
      });
      return { ok: false, error: result.error ?? "send_failed" };
    }

    const deliveredAt = new Date().toISOString();
    const { data: marked, error: markError } = await admin
      .from("queue_call_jobs")
      .update({
        called_notified_at: deliveredAt,
        call_notify_processing_at: null,
      })
      .eq("id", input.jobId)
      .eq("called_at", input.calledAt)
      .is("called_notified_at", null)
      .select("id")
      .maybeSingle();

    if (markError) {
      callNowLog("error", "mark_delivered_failed", {
        jobId: input.jobId,
        error: markError.message,
      });
      return { ok: false, error: markError.message };
    }
    if (!marked) {
      callNowLog("warn", "mark_delivered_raced", { jobId: input.jobId });
      return { ok: true, skipped: true, reason: "delivered_elsewhere" };
    }

    callNowLog("info", "delivered", { jobId: input.jobId, channel: result.channel });
    return { ok: true, skipped: false, channel: "whatsapp" };
  } catch (err) {
    await admin
      .from("queue_call_jobs")
      .update({ call_notify_processing_at: null })
      .eq("id", input.jobId)
      .is("called_notified_at", null);
    const message = err instanceof Error ? err.message : "unknown";
    callNowLog("error", "send_exception", { jobId: input.jobId, error: message });
    return { ok: false, error: message };
  }
}

/** Release stuck processing locks so a failed/incomplete send can retry. */
export async function releaseStaleQueueCallProcessing(
  admin: ReturnType<typeof createAdminClient>,
  nowMs: number,
  limit: number,
): Promise<number> {
  const staleBefore = new Date(nowMs - CALL_NOTIFY_PROCESSING_STALE_MS).toISOString();
  const { data: stale, error } = await admin
    .from("queue_call_jobs")
    .select("id")
    .eq("status", "called")
    .is("called_notified_at", null)
    .not("call_notify_processing_at", "is", null)
    .lte("call_notify_processing_at", staleBefore)
    .order("called_at", { ascending: true })
    .limit(limit);

  if (error) {
    callNowLog("error", "stale_processing_query_failed", { error: error.message });
    return 0;
  }

  let released = 0;
  for (const row of stale ?? []) {
    const { data: cleared } = await admin
      .from("queue_call_jobs")
      .update({ call_notify_processing_at: null })
      .eq("id", row.id)
      .is("called_notified_at", null)
      .lte("call_notify_processing_at", staleBefore)
      .select("id")
      .maybeSingle();
    if (!cleared) continue;
    released += 1;
    callNowLog("info", "stale_processing_released", {
      jobId: row.id,
      staleAfterMs: CALL_NOTIFY_PROCESSING_STALE_MS,
    });
  }
  return released;
}

/** Cron catch-up for queue_call_now when merchant after() never ran. */
export async function catchUpUndeliveredQueueCalls(
  admin: ReturnType<typeof createAdminClient>,
  nowMs: number,
  limit: number,
): Promise<{ sent: number; skipped: number; failed: number }> {
  await releaseStaleQueueCallProcessing(admin, nowMs, limit);

  const catchupBefore = new Date(nowMs - CALL_NOTIFY_CATCHUP_AFTER_MS).toISOString();
  const { data: pending, error: pendingErr } = await admin
    .from("queue_call_jobs")
    .select(
      "id, merchant_id, customer_id, customer_name, customer_phone, party_size, status, called_at",
    )
    .eq("status", "called")
    .is("called_notified_at", null)
    .lte("called_at", catchupBefore)
    .is("reminder_1_sent_at", null)
    .order("called_at", { ascending: true })
    .limit(limit);

  if (pendingErr) {
    callNowLog("error", "catchup_query_failed", { error: pendingErr.message });
    return { sent: 0, skipped: 0, failed: 0 };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of pending ?? []) {
    if (!job.customer_id) {
      skipped += 1;
      callNowLog("warn", "catchup_missing_customer", { jobId: job.id });
      continue;
    }

    const { data: customer } = await admin
      .from("customers")
      .select("name, phone, public_token, whatsapp_available, preferred_notification_channel")
      .eq("id", job.customer_id)
      .maybeSingle();

    if (!customer?.public_token || !customer.phone) {
      skipped += 1;
      callNowLog("warn", "catchup_missing_customer", { jobId: job.id });
      continue;
    }

    const { data: merchant } = await admin
      .from("merchants")
      .select("business_name")
      .eq("id", job.merchant_id)
      .maybeSingle();
    const businessName =
      (merchant?.business_name ?? "the store").trim() || "the store";

    const result = await deliverQueueCallNow({
      jobId: job.id,
      calledAt: job.called_at,
      customer: {
        phone: customer.phone,
        // The job carries the name given when this guest joined; `customers.name`
        // can belong to an earlier visitor on the same number.
        name: job.customer_name?.trim() || customer.name,
        publicToken: customer.public_token,
        whatsappAvailable: customer.whatsapp_available === true,
        preferredNotificationChannel:
          customer.preferred_notification_channel === "whatsapp" ? "whatsapp" : "sms",
      },
      businessName,
      bookingSize: job.party_size,
    });

    if (result.ok && result.skipped) {
      skipped += 1;
    } else if (result.ok && !result.skipped) {
      sent += 1;
      callNowLog("info", "catchup_delivered", { jobId: job.id });
    } else if (!result.ok) {
      failed += 1;
    }
  }

  return { sent, skipped, failed };
}
