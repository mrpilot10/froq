"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureGuestCustomer,
  normalizeGuestPhone,
} from "@/lib/merchant/guest-customer";
import {
  requireMerchantContext,
  resolveMerchantId,
} from "@/lib/merchant/server-context";
import { resolveBranchFilterForUser } from "@/lib/merchant/branch-access";
import { dashboardRangeStart } from "@/lib/merchant/analytics";
import { canViewAnalytics } from "@/lib/merchant/roles";
import {
  computeQueueAnalytics,
  filterQueueDataByStaff,
  queueStaffOptions,
  type QueueAnalyticsEntryRow,
  type QueueAnalyticsSessionRow,
  type QueueAnalyticsStats,
  type QueueStaffOption,
} from "@/lib/merchant/queue-analytics";
import type { DashboardDateRange, MemberRole } from "@/lib/merchant/types";
import { buildReminderSchedule } from "@/lib/queue/call-reminders";
import { checkQueueCapacity } from "@/lib/queue/capacity";
import {
  getOpenQueueSession,
  listSessionEntries,
  mapQueueEntryRow,
  mapQueueSessionRow,
  type LiveQueueEntry,
  type LiveQueueSession,
} from "@/lib/queue/live-board";
import { callAcceptDeadlineMs } from "@/lib/merchant/queue-settings";
import {
  queueJoinNotifyTemplate,
  queueSeatedNotifyTemplate,
} from "@/lib/queue/ai-menu";

type QueueCallResolveStatus = "seated" | "skipped" | "left";

type QueueNotifiableCustomer = {
  phone: string;
  name: string;
  publicToken: string;
  whatsappAvailable: boolean;
  preferred: "sms" | "whatsapp";
};

function toNotifiable(customer: QueueNotifiableCustomer) {
  return {
    phone: customer.phone,
    name: customer.name,
    publicToken: customer.publicToken,
    whatsappAvailable: customer.whatsappAvailable,
    preferredNotificationChannel: customer.preferred,
  };
}

type QueueNotifyTemplate =
  | "queue_first_notify"
  | "queue_first_notify_menu"
  | "queue_call_now"
  | "queue_seated"
  | "seated_menu"
  | "queue_customer_skipped";

type QueueNotifyData =
  | {
      businessName: string;
      bookingSize: number;
      queuePosition: number;
      estimatedWaitMinutes: number;
    }
  | {
      businessName: string;
      bookingSize: number;
    };

/** All values needed for a background send — never re-query inside `after()`. */
type CapturedQueueNotify = {
  customer: QueueNotifiableCustomer;
  template: QueueNotifyTemplate;
  data: QueueNotifyData;
  /** Persist delivery via deliverQueueCallNow. */
  callJobId?: string;
  /** queue_call_jobs.called_at this send belongs to — gates every write. */
  callEventAt?: string;
  /** Set `notified_joined_at` after a successful join notify. */
  markJoinedEntryId?: string;
};

function logQueueAfter(
  level: "error" | "warn" | "info",
  event: string,
  fields: Record<string, unknown>,
) {
  const line = JSON.stringify({
    scope: "queue_whatsapp_after",
    level,
    event,
    ...fields,
    at: new Date().toISOString(),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

async function notifyQueueTemplate(input: {
  customer: QueueNotifiableCustomer;
  template: QueueNotifyTemplate;
  data: QueueNotifyData;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { sendCustomerNotification } = await import("@/lib/notifications");
    const result = await sendCustomerNotification({
      customer: {
        ...toNotifiable(input.customer),
        // Queue Meta templates: always attempt WhatsApp.
        whatsappAvailable: true,
        preferredNotificationChannel: "whatsapp",
      },
      template: input.template,
      data: input.data as never,
    });
    if (!result.ok) {
      console.error(`${input.template} failed`, result.error);
      return { ok: false, error: result.error };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "notification_failed";
    console.error(`Failed to send ${input.template}`, err);
    return { ok: false, error: message };
  }
}

/** Runs inside `after()` — queue_call_now uses deliverQueueCallNow; others send directly. */
async function runCapturedQueueNotify(captured: CapturedQueueNotify): Promise<void> {
  const admin = createAdminClient();

  if (captured.callJobId && captured.callEventAt && captured.template === "queue_call_now") {
    const partyData = captured.data as { businessName: string; bookingSize: number };
    const { deliverQueueCallNow } = await import("@/lib/notifications/queue-call-now");
    const result = await deliverQueueCallNow({
      jobId: captured.callJobId,
      calledAt: captured.callEventAt,
      customer: {
        ...toNotifiable(captured.customer),
        whatsappAvailable: true,
        preferredNotificationChannel: "whatsapp",
      },
      businessName: partyData.businessName,
      bookingSize: partyData.bookingSize,
    });
    if (!result.ok) {
      logQueueAfter("error", "call_send_failed", {
        jobId: captured.callJobId,
        template: captured.template,
        error: result.error,
      });
    } else if (result.skipped) {
      logQueueAfter("info", "call_send_skipped", {
        jobId: captured.callJobId,
        template: captured.template,
        reason: result.reason,
      });
    }
    return;
  }

  const notified = await notifyQueueTemplate({
    customer: captured.customer,
    template: captured.template,
    data: captured.data,
  });
  if (!notified.ok) {
    logQueueAfter("error", "send_failed", {
      template: captured.template,
      error: notified.error,
      markJoinedEntryId: captured.markJoinedEntryId ?? null,
    });
    return;
  }
  if (captured.markJoinedEntryId) {
    await admin
      .from("queue_entries")
      .update({ notified_joined_at: new Date().toISOString() })
      .eq("id", captured.markJoinedEntryId);
  }
}

function scheduleQueueNotifyAfter(captured: CapturedQueueNotify): void {
  after(async () => {
    try {
      await runCapturedQueueNotify(captured);
    } catch (err) {
      logQueueAfter("error", "after_unhandled", {
        template: captured.template,
        callJobId: captured.callJobId ?? null,
        markJoinedEntryId: captured.markJoinedEntryId ?? null,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  });
}

/**
 * Guest joined the waitlist: ensure customer row + send queue_first_notify.
 */
export async function registerQueueJoin(input: {
  clientEntryId: string;
  name: string;
  phone: string;
  partySize: number;
  /** 1-based position in the waiting list (including this guest). */
  queuePosition: number;
  estimatedWaitMinutes: number;
  branchId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const name = input.name.trim();
    const partySize = Math.max(1, Math.round(input.partySize));
    const queuePosition = Math.max(1, Math.round(input.queuePosition));
    const estimatedWaitMinutes = Math.max(0, Math.round(input.estimatedWaitMinutes));
    if (!name) return { ok: false, error: "Guest name is required." };
    if (!input.clientEntryId.trim()) {
      return { ok: false, error: "Queue entry id is required." };
    }

    const customer = await ensureGuestCustomer({
      merchantId: ctx.merchantId,
      branchId: input.branchId,
      name,
      phone: input.phone,
    });
    if (!customer) {
      return { ok: false, error: "Enter a valid 10-digit mobile number." };
    }

    const supabase = await createClient();
    const { data: merchant } = await supabase
      .from("merchants")
      .select("business_name")
      .eq("id", ctx.merchantId)
      .maybeSingle();
    const businessName =
      (merchant?.business_name ?? "the store").trim() || "the store";

    scheduleQueueNotifyAfter({
      customer,
      template: await queueJoinNotifyTemplate(ctx.merchantId),
      data: {
        businessName,
        bookingSize: partySize,
        queuePosition,
        estimatedWaitMinutes,
      },
    });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not notify the guest.",
    };
  }
}

/**
 * Register a party as "called": persist the job, send queue_call_now
 * immediately, and schedule reminders at +3 / +7 / +9 minutes via cron.
 */
export async function registerQueueCall(input: {
  clientEntryId: string;
  name: string;
  phone: string;
  partySize: number;
  branchId?: string | null;
  /** queue_entries.called_at for this call event — used for idempotency. */
  entryCalledAt: string;
  /** Explicit re-call while still marked called (future UI). */
  forceRecall?: boolean;
}): Promise<{ ok: boolean; error?: string; jobId?: string }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const name = input.name.trim();
    const partySize = Math.max(1, Math.round(input.partySize));
    if (!name) return { ok: false, error: "Guest name is required." };
    if (!input.clientEntryId.trim()) {
      return { ok: false, error: "Queue entry id is required." };
    }

    const customer = await ensureGuestCustomer({
      merchantId: ctx.merchantId,
      branchId: input.branchId,
      name,
      phone: input.phone,
    });
    if (!customer) {
      return { ok: false, error: "Enter a valid 10-digit mobile number." };
    }

    const supabase = await createClient();
    const { data: merchant } = await supabase
      .from("merchants")
      .select("business_name")
      .eq("id", ctx.merchantId)
      .maybeSingle();
    const businessName =
      (merchant?.business_name ?? "the store").trim() || "the store";

    const entryCalledAt = input.entryCalledAt.trim();
    if (!entryCalledAt) {
      return { ok: false, error: "Call timestamp is required." };
    }

    const clientEntryId = input.clientEntryId.trim();
    const schedule = buildReminderSchedule(entryCalledAt);
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("queue_call_jobs")
      .select("id, status, called_at, called_notified_at")
      .eq("merchant_id", ctx.merchantId)
      .eq("client_entry_id", clientEntryId)
      .maybeSingle();

    const isNewCallEvent =
      input.forceRecall === true ||
      !existing ||
      existing.status !== "called" ||
      existing.called_at !== entryCalledAt;

    if (!isNewCallEvent) {
      if (existing.called_notified_at) {
        return { ok: true, jobId: existing.id };
      }
      scheduleQueueNotifyAfter({
        customer,
        template: "queue_call_now",
        data: {
          businessName,
          bookingSize: partySize,
        },
        callJobId: existing.id,
        callEventAt: existing.called_at,
      });
      return { ok: true, jobId: existing.id };
    }

    const { data: job, error } = await admin
      .from("queue_call_jobs")
      .upsert(
        {
          merchant_id: ctx.merchantId,
          branch_id: input.branchId ?? null,
          client_entry_id: clientEntryId,
          customer_id: customer.id,
          customer_name: name,
          customer_phone: customer.phone,
          party_size: partySize,
          status: "called",
          called_at: entryCalledAt,
          called_notified_at: null,
          call_notify_processing_at: null,
          ...schedule,
          reminder_1_sent_at: null,
          reminder_2_sent_at: null,
          reminder_3_sent_at: null,
          resolved_at: null,
        },
        { onConflict: "merchant_id,client_entry_id" },
      )
      .select("id, called_at")
      .single();

    if (error || !job) {
      return { ok: false, error: error?.message ?? "Could not register the call." };
    }

    scheduleQueueNotifyAfter({
      customer,
      template: "queue_call_now",
      data: {
        businessName,
        bookingSize: partySize,
      },
      callJobId: job.id,
      callEventAt: job.called_at,
    });

    return { ok: true, jobId: job.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not register the call.",
    };
  }
}

/**
 * Mark a called party as seated / skipped / left so cron will not send
 * further reminders. Also used when a guest is removed from the queue.
 */
export async function resolveQueueCall(input: {
  clientEntryId: string;
  status: QueueCallResolveStatus;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const clientEntryId = input.clientEntryId.trim();
    if (!clientEntryId) return { ok: false, error: "Queue entry id is required." };
    if (!["seated", "skipped", "left"].includes(input.status)) {
      return { ok: false, error: "Invalid queue status." };
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const { error } = await admin
      .from("queue_call_jobs")
      .update({
        status: input.status,
        resolved_at: nowIso,
      })
      .eq("merchant_id", ctx.merchantId)
      .eq("client_entry_id", clientEntryId)
      .eq("status", "called");

    // No matching open job is fine (never called, or already resolved).
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update queue call.",
    };
  }
}

async function businessNameFor(merchantId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("merchants")
    .select("business_name")
    .eq("id", merchantId)
    .maybeSingle();
  return (data?.business_name ?? "the store").trim() || "the store";
}

/** Load the open session + entries for the merchant live board. */
export async function fetchLiveQueueBoard(input?: {
  branchId?: string | null;
}): Promise<{
  ok: boolean;
  error?: string;
  session: LiveQueueSession | null;
  entries: LiveQueueEntry[];
}> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error, session: null, entries: [] };

    const open = await getOpenQueueSession(ctx.merchantId, input?.branchId ?? null);
    if (!open) return { ok: true, session: null, entries: [] };

    const rows = await listSessionEntries(open.id);
    const entries = rows.map(mapQueueEntryRow);

    // Attach reminder progress for called guests (from queue_call_jobs).
    const calledIds = entries.filter((e) => e.status === "called").map((e) => e.id);
    if (calledIds.length > 0) {
      const admin = createAdminClient();
      const { data: jobs } = await admin
        .from("queue_call_jobs")
        .select(
          "client_entry_id, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at",
        )
        .eq("merchant_id", ctx.merchantId)
        .in("client_entry_id", calledIds);

      const remindersById = new Map<string, number>();
      for (const job of jobs ?? []) {
        const sent =
          (job.reminder_1_sent_at ? 1 : 0) +
          (job.reminder_2_sent_at ? 1 : 0) +
          (job.reminder_3_sent_at ? 1 : 0);
        remindersById.set(job.client_entry_id, sent);
      }
      for (const entry of entries) {
        const sent = remindersById.get(entry.id);
        if (sent != null) entry.remindersSent = sent;
      }
    }

    return {
      ok: true,
      session: mapQueueSessionRow(open),
      entries,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load the queue.",
      session: null,
      entries: [],
    };
  }
}

export async function startLiveQueueSession(input?: {
  branchId?: string | null;
}): Promise<{ ok: boolean; error?: string; session?: LiveQueueSession }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const branchId = input?.branchId ?? null;
    const existing = await getOpenQueueSession(ctx.merchantId, branchId);
    if (existing) {
      return { ok: true, session: mapQueueSessionRow(existing) };
    }

    const admin = createAdminClient();
    const { data: last } = await admin
      .from("queue_sessions")
      .select("number")
      .eq("merchant_id", ctx.merchantId)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const number = Math.max(0, Number(last?.number) || 0) + 1;

    const { data: created, error } = await admin
      .from("queue_sessions")
      .insert({
        merchant_id: ctx.merchantId,
        branch_id: branchId,
        number,
        status: "live",
        started_by_user_id: ctx.userId,
        started_by_name: ctx.actorName,
        started_by_role: ctx.role,
      })
      .select("*")
      .single();

    if (error || !created) {
      return { ok: false, error: error?.message ?? "Could not start the queue." };
    }
    return { ok: true, session: mapQueueSessionRow(created) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not start the queue.",
    };
  }
}

export async function setLiveQueueSessionStatus(input: {
  status: "live" | "paused" | "ended";
  branchId?: string | null;
}): Promise<{ ok: boolean; error?: string; summary?: {
  number: number;
  startedAtMs: number;
  endedAtMs: number;
  served: number;
  left: number;
  avgWait: number;
  longestWait: number;
  startedByName?: string;
  startedByRole?: MemberRole;
} }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const open = await getOpenQueueSession(ctx.merchantId, input.branchId ?? null);
    if (!open) {
      if (input.status === "ended") return { ok: true };
      return { ok: false, error: "No live queue session." };
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    if (input.status === "ended") {
      await admin
        .from("queue_entries")
        .update({ status: "left", left_at: nowIso })
        .eq("session_id", open.id)
        .in("status", ["waiting", "called"]);

      const rows = await listSessionEntries(open.id);
      const seated = rows.filter((r) => r.status === "seated");
      const left = rows.filter((r) => r.status === "left" || r.left_at);
      // Re-fetch after update for accurate left count.
      const after = await listSessionEntries(open.id);
      const seatedNow = after.filter((r) => r.status === "seated");
      const leftNow = after.filter((r) => r.status === "left");
      const waits = seatedNow.map((e) =>
        Math.max(
          0,
          Math.round(
            ((msOrNow(e.seated_at) - msOrNow(e.joined_at)) / 60_000),
          ),
        ),
      );
      const avgWait = waits.length
        ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)
        : 0;
      const longestWait = waits.length ? Math.max(...waits) : 0;

      await admin
        .from("queue_sessions")
        .update({ status: "ended", ended_at: nowIso })
        .eq("id", open.id);

      // Cancel reminder jobs for open parties.
      for (const row of rows.filter((r) => r.status === "waiting" || r.status === "called")) {
        await admin
          .from("queue_call_jobs")
          .update({ status: "left", resolved_at: nowIso })
          .eq("merchant_id", ctx.merchantId)
          .eq("client_entry_id", row.id)
          .eq("status", "called");
      }

      void seated;
      void left;

      return {
        ok: true,
        summary: {
          number: open.number,
          startedAtMs: new Date(open.started_at).getTime(),
          endedAtMs: Date.now(),
          served: seatedNow.length,
          left: leftNow.length,
          avgWait,
          longestWait,
          startedByName: open.started_by_name ?? undefined,
          startedByRole: open.started_by_role ?? undefined,
        },
      };
    }

    const { error } = await admin
      .from("queue_sessions")
      .update({ status: input.status })
      .eq("id", open.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update queue session.",
    };
  }
}

function msOrNow(iso: string | null | undefined): number {
  if (!iso) return Date.now();
  const n = new Date(iso).getTime();
  return Number.isFinite(n) ? n : Date.now();
}

/** Merchant walk-in / reservation → persist entry + send queue_first_notify. */
export async function addLiveQueueEntry(input: {
  name: string;
  phone: string;
  email?: string;
  partySize: number;
  kind?: "walkin" | "reservation";
  reservationTime?: string;
  branchId?: string | null;
  estimatedWaitMinutes: number;
}): Promise<{ ok: boolean; error?: string; entry?: LiveQueueEntry }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const name = input.name.trim();
    const partySize = Math.max(1, Math.round(input.partySize));
    if (!name) return { ok: false, error: "Guest name is required." };

    const open = await getOpenQueueSession(ctx.merchantId, input.branchId ?? null);
    if (!open || open.status !== "live") {
      return { ok: false, error: "Start the queue before adding guests." };
    }

    const capacity = await checkQueueCapacity(ctx.merchantId);
    if (!capacity.ok) return { ok: false, error: capacity.error };

    const customer = await ensureGuestCustomer({
      merchantId: ctx.merchantId,
      branchId: input.branchId,
      name,
      phone: input.phone,
    });
    if (!customer) {
      return { ok: false, error: "Enter a valid 10-digit mobile number." };
    }

    const admin = createAdminClient();
    const { data: entry, error } = await admin
      .from("queue_entries")
      .insert({
        merchant_id: ctx.merchantId,
        session_id: open.id,
        branch_id: input.branchId ?? null,
        customer_id: customer.id,
        name,
        phone: customer.phone,
        email: input.email?.trim() || null,
        party_size: partySize,
        kind: input.kind ?? "walkin",
        reservation_time: input.reservationTime?.trim() || null,
        status: "waiting",
      })
      .select("*")
      .single();

    if (error || !entry) {
      return { ok: false, error: error?.message ?? "Could not add guest." };
    }

    const waiting = await admin
      .from("queue_entries")
      .select("id")
      .eq("session_id", open.id)
      .eq("status", "waiting")
      .lte("joined_at", entry.joined_at);
    const queuePosition = waiting.data?.length ?? 1;
    const businessName = await businessNameFor(ctx.merchantId);

    scheduleQueueNotifyAfter({
      customer,
      template: await queueJoinNotifyTemplate(ctx.merchantId),
      data: {
        businessName,
        bookingSize: partySize,
        queuePosition,
        estimatedWaitMinutes: Math.max(0, Math.round(input.estimatedWaitMinutes)),
      },
      markJoinedEntryId: entry.id,
    });

    return { ok: true, entry: mapQueueEntryRow(entry) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add guest.",
    };
  }
}

export async function updateLiveQueueEntryStatus(input: {
  entryId: string;
  status: "called" | "seated" | "left";
  branchId?: string | null;
}): Promise<{ ok: boolean; error?: string; entry?: LiveQueueEntry }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("queue_entries")
      .select("*")
      .eq("id", input.entryId)
      .eq("merchant_id", ctx.merchantId)
      .maybeSingle();
    if (!existing) return { ok: false, error: "Guest not found." };

    const nowIso = new Date().toISOString();

    if (input.status === "called") {
      // Atomic claim: `neq('called')` makes the transition itself the lock, so
      // two overlapping taps can't both mint a call event (and therefore two
      // queue_call_now sends). A read-then-write guard loses that race.
      const { data: claimed, error: claimError } = await admin
        .from("queue_entries")
        .update({
          status: "called",
          called_at: nowIso,
          accept_by: new Date(callAcceptDeadlineMs(Date.parse(nowIso))).toISOString(),
        })
        .eq("id", input.entryId)
        .eq("merchant_id", ctx.merchantId)
        .neq("status", "called")
        .select("*")
        .maybeSingle();

      if (claimError) {
        return { ok: false, error: claimError.message };
      }
      if (!claimed) {
        // Lost the race — someone already called this guest. Report the current
        // row and send nothing.
        const { data: current } = await admin
          .from("queue_entries")
          .select("*")
          .eq("id", input.entryId)
          .eq("merchant_id", ctx.merchantId)
          .maybeSingle();
        return { ok: true, entry: mapQueueEntryRow(current ?? existing) };
      }

      const called = await registerQueueCall({
        clientEntryId: claimed.id,
        name: claimed.name,
        phone: claimed.phone,
        partySize: claimed.party_size,
        branchId: input.branchId,
        entryCalledAt: claimed.called_at as string,
      });
      return {
        ok: true,
        entry: mapQueueEntryRow(claimed),
        error: called.ok
          ? undefined
          : called.error ?? "Called, but couldn't register the notify job.",
      };
    }

    const patch: Record<string, unknown> = { status: input.status };
    if (input.status === "seated") {
      patch.seated_at = nowIso;
    } else if (input.status === "left") {
      patch.left_at = nowIso;
    }

    const { data: updated, error } = await admin
      .from("queue_entries")
      .update(patch)
      .eq("id", input.entryId)
      .select("*")
      .single();
    if (error || !updated) {
      return { ok: false, error: error?.message ?? "Could not update guest." };
    }

    await resolveQueueCall({
      clientEntryId: updated.id,
      status: input.status === "seated" ? "seated" : "left",
    });

    const customer = await ensureGuestCustomer({
      merchantId: ctx.merchantId,
      branchId: input.branchId,
      name: updated.name,
      phone: updated.phone,
    });
    if (customer) {
      const businessName = await businessNameFor(ctx.merchantId);
      scheduleQueueNotifyAfter({
        customer,
        template:
          input.status === "seated"
            ? await queueSeatedNotifyTemplate(ctx.merchantId)
            : "queue_customer_skipped",
        data: {
          businessName,
          bookingSize: updated.party_size,
        },
      });
    }

    return { ok: true, entry: mapQueueEntryRow(updated) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update guest.",
    };
  }
}

/** Row ceiling per query; the UI warns when a range exceeds it. */
const QUEUE_ANALYTICS_FETCH_LIMIT = 5000;

export interface QueueAnalyticsResult {
  ok: boolean;
  error?: string;
  stats: QueueAnalyticsStats | null;
  /** Everyone who ran a session in this range/branch, regardless of `staffId`. */
  staffOptions: QueueStaffOption[];
  /** True when the range hit QUEUE_ANALYTICS_FETCH_LIMIT and numbers are partial. */
  truncated: boolean;
}

const EMPTY_QUEUE_ANALYTICS: Omit<QueueAnalyticsResult, "ok" | "error"> = {
  stats: null,
  staffOptions: [],
  truncated: false,
};

/**
 * Queue performance for a date range, scoped to one branch or all branches.
 * `branchId` null means all branches (clamped for staff with branch limits).
 * `staffId` narrows to sessions started by one teammate; null means everyone.
 */
export async function getQueueAnalytics(input?: {
  range?: DashboardDateRange;
  branchId?: string | null;
  staffId?: string | null;
}): Promise<QueueAnalyticsResult> {
  const range = input?.range ?? "7d";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated.", ...EMPTY_QUEUE_ANALYTICS };

    const ctx = await requireMerchantContext();
    if (!ctx.ok) {
      return { ok: false, error: ctx.error, ...EMPTY_QUEUE_ANALYTICS };
    }
    if (!canViewAnalytics(ctx.role)) {
      return { ok: false, error: "You do not have access to analytics.", ...EMPTY_QUEUE_ANALYTICS };
    }

    const merchantId = ctx.merchantId;

    const branchFilter = await resolveBranchFilterForUser(
      supabase,
      merchantId,
      user.id,
      input?.branchId ?? null,
    );

    const start = dashboardRangeStart(range);
    const sinceIso = start ? start.toISOString() : null;
    const admin = createAdminClient();

    let entriesQuery = admin
      .from("queue_entries")
      .select(
        "id, session_id, party_size, kind, status, joined_at, called_at, seated_at, left_at",
        { count: "exact" },
      )
      .eq("merchant_id", merchantId)
      .order("joined_at", { ascending: false })
      .range(0, QUEUE_ANALYTICS_FETCH_LIMIT - 1);
    let sessionsQuery = admin
      .from("queue_sessions")
      .select("id, started_at, ended_at, started_by_user_id, started_by_name, started_by_role")
      .eq("merchant_id", merchantId)
      .order("started_at", { ascending: false })
      .range(0, QUEUE_ANALYTICS_FETCH_LIMIT - 1);

    if (branchFilter) {
      entriesQuery = entriesQuery.eq("branch_id", branchFilter);
      sessionsQuery = sessionsQuery.eq("branch_id", branchFilter);
    }
    if (sinceIso) {
      entriesQuery = entriesQuery.gte("joined_at", sinceIso);
      sessionsQuery = sessionsQuery.gte("started_at", sinceIso);
    }

    const [entriesRes, sessionsRes] = await Promise.all([entriesQuery, sessionsQuery]);
    if (entriesRes.error) {
      return { ok: false, error: "Could not load queue analytics.", ...EMPTY_QUEUE_ANALYTICS };
    }

    const allEntries = (entriesRes.data ?? []) as QueueAnalyticsEntryRow[];
    const allSessions = (sessionsRes.data ?? []) as QueueAnalyticsSessionRow[];
    const staffId = input?.staffId ?? null;
    const scoped = staffId
      ? filterQueueDataByStaff(allEntries, allSessions, staffId)
      : { entries: allEntries, sessions: allSessions };

    return {
      ok: true,
      stats: computeQueueAnalytics({ range, ...scoped }),
      staffOptions: queueStaffOptions(allSessions),
      truncated: (entriesRes.count ?? 0) > QUEUE_ANALYTICS_FETCH_LIMIT,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load queue analytics.",
      ...EMPTY_QUEUE_ANALYTICS,
    };
  }
}
