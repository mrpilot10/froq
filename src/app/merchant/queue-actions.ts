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
import {
  canDeleteQueueSessions,
  canViewAnalytics,
  canViewCustomerData,
} from "@/lib/merchant/roles";
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
import { maskPhone } from "@/lib/auth/otp/phone";
import {
  getOpenQueueSession,
  listSessionEntries,
  liveQueuePosition,
  mapQueueEntryRow,
  mapQueueSessionRow,
  resolveStartBranchId,
  type LiveQueueEntry,
  type LiveQueueSession,
} from "@/lib/queue/live-board";
import { nextCallableEntry } from "@/lib/queue/ordering";
import { syncTodayReservationHolds } from "@/lib/queue/reservation-holds";
import { recordReservationEvent } from "@/lib/reservations/events";
import { formatTimeForInput, normalizeTimeInput } from "@/lib/merchant/queue-hours";
import {
  reservationStartMs,
  reservationToday,
} from "@/lib/merchant/reservations";
import {
  buildQueueGuestTimeline,
  isQueueDbSessionId,
  type QueueCustomerVisit,
  type QueueHistoryGuest,
  type QueueHistoryGuestDetail,
} from "@/lib/queue/session-history";
import { callAcceptDeadlineMs } from "@/lib/merchant/queue-settings";
import {
  queueJoinNotifyTemplate,
  queueSeatedNotifyTemplate,
} from "@/lib/queue/ai-menu";
import type { QueueEntryRow, QueueSessionRow } from "@/lib/supabase/database.types";

type QueueCallResolveStatus = "seated" | "skipped" | "left";

type QueueNotifiableCustomer = {
  phone: string;
  name: string;
  email?: string | null;
  publicToken: string;
  whatsappAvailable: boolean;
  preferred: "sms" | "whatsapp";
};

function toNotifiable(customer: QueueNotifiableCustomer) {
  return {
    phone: customer.phone,
    name: customer.name,
    email: customer.email ?? null,
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
      phone: maskPhone(captured.customer.phone.replace(/\D/g, "")),
    });
    return;
  }
  logQueueAfter("info", "send_ok", {
    template: captured.template,
    markJoinedEntryId: captured.markJoinedEntryId ?? null,
    phone: maskPhone(captured.customer.phone.replace(/\D/g, "")),
  });
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
      .select("business_name, slug")
      .eq("id", ctx.merchantId)
      .maybeSingle();
    const businessName =
      (merchant?.business_name ?? "the store").trim() || "the store";
    const menuSlug = merchant?.slug?.trim() || undefined;

    scheduleQueueNotifyAfter({
      customer,
      template: await queueJoinNotifyTemplate(ctx.merchantId),
      data: {
        businessName,
        bookingSize: partySize,
        queuePosition,
        estimatedWaitMinutes,
        ...(menuSlug ? { menuSlug } : {}),
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

async function merchantNotifyFields(merchantId: string): Promise<{
  businessName: string;
  menuSlug: string | null;
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("merchants")
    .select("business_name, slug")
    .eq("id", merchantId)
    .maybeSingle();
  return {
    businessName: (data?.business_name ?? "the store").trim() || "the store",
    menuSlug: data?.slug?.trim() || null,
  };
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

    // Activate due holds, attach today's confirmed bookings, release grace no-shows.
    await syncTodayReservationHolds({
      merchantId: ctx.merchantId,
      sessionId: open.id,
      branchId: open.branch_id,
    });

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

    const resolved = await resolveStartBranchId(
      ctx.merchantId,
      input?.branchId ?? null,
    );
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const branchId = resolved.branchId;

    const existing = await getOpenQueueSession(ctx.merchantId, branchId);
    if (existing) {
      await syncTodayReservationHolds({
        merchantId: ctx.merchantId,
        sessionId: existing.id,
        branchId: existing.branch_id,
      });
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

    await syncTodayReservationHolds({
      merchantId: ctx.merchantId,
      sessionId: created.id,
      branchId: created.branch_id,
    });

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
  /** Real `queue_sessions.id` — stored in client history for guest drill-down. */
  sessionId: string;
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
        .in("status", ["held", "waiting", "called"]);

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
      for (const row of rows.filter(
        (r) => r.status === "held" || r.status === "waiting" || r.status === "called",
      )) {
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
          sessionId: open.id,
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

    const kind = input.kind ?? "walkin";
    const nowMs = Date.now();
    let reservationTime = input.reservationTime?.trim() || null;
    let joinedAtIso: string | undefined;
    let status: "held" | "waiting" = "waiting";

    if (kind === "reservation") {
      const time = normalizeTimeInput(reservationTime ?? "")
        ?? formatTimeForInput(reservationTime ?? "");
      if (!normalizeTimeInput(time)) {
        return { ok: false, error: "Pick a reservation time." };
      }
      reservationTime = time;
      const dateKey = reservationToday(new Date(nowMs));
      const joinedAtMs = reservationStartMs(dateKey, time);
      joinedAtIso = new Date(joinedAtMs).toISOString();
      status = joinedAtMs <= nowMs ? "waiting" : "held";
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
        kind,
        reservation_time: reservationTime,
        status,
        ...(joinedAtIso ? { joined_at: joinedAtIso } : {}),
      })
      .select("*")
      .single();

    if (error || !entry) {
      return { ok: false, error: error?.message ?? "Could not add guest." };
    }

    const queuePosition = await liveQueuePosition(open.id, entry.joined_at);
    const { businessName, menuSlug } = await merchantNotifyFields(ctx.merchantId);

    // Held upcoming reservations don't get a waitlist joined WhatsApp —
    // they already have reservation confirmation / reminders.
    if (status === "waiting") {
      scheduleQueueNotifyAfter({
        customer,
        template: await queueJoinNotifyTemplate(ctx.merchantId),
        data: {
          businessName,
          bookingSize: partySize,
          queuePosition,
          estimatedWaitMinutes: Math.max(0, Math.round(input.estimatedWaitMinutes)),
          ...(menuSlug ? { menuSlug } : {}),
        },
        markJoinedEntryId: entry.id,
      });
    }

    return { ok: true, entry: mapQueueEntryRow(entry) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add guest.",
    };
  }
}

/**
 * Call the next party by effective service time — skips future held
 * reservations so walk-ins ahead of a later booking are served first.
 */
export async function callNextLiveQueueEntry(input?: {
  branchId?: string | null;
}): Promise<{ ok: boolean; error?: string; entry?: LiveQueueEntry }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const open = await getOpenQueueSession(ctx.merchantId, input?.branchId ?? null);
    if (!open || open.status !== "live") {
      return { ok: false, error: "Start the queue before calling guests." };
    }

    await syncTodayReservationHolds({
      merchantId: ctx.merchantId,
      sessionId: open.id,
      branchId: open.branch_id,
    });

    const rows = await listSessionEntries(open.id);
    const entries = rows.map(mapQueueEntryRow);
    const next = nextCallableEntry(entries);
    if (!next) {
      return { ok: false, error: "No one is waiting in the queue." };
    }

    // Activate held → waiting first so the call transition lock still works.
    if (next.status === "held") {
      const admin = createAdminClient();
      await admin
        .from("queue_entries")
        .update({ status: "waiting" })
        .eq("id", next.id)
        .eq("status", "held");
    }

    return updateLiveQueueEntryStatus({
      entryId: next.id,
      status: "called",
      branchId: input?.branchId,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not call next guest.",
    };
  }
}

export async function updateLiveQueueEntryStatus(input: {
  entryId: string;
  status: "called" | "seated" | "left";
  branchId?: string | null;
  /** Optional dining table — set when calling or seating. */
  tableId?: string | null;
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

    const merchantId = ctx.merchantId;
    const partySize = existing.party_size as number;
    const nowIso = new Date().toISOString();

    async function resolveTablePatch(
      tableId: string | null | undefined,
    ): Promise<{ ok: true; patch: Record<string, unknown> } | { ok: false; error: string }> {
      if (!tableId) return { ok: true, patch: {} };
      const { data: table } = await admin
        .from("dining_tables")
        .select("id, table_number, seats, status, branch_id")
        .eq("id", tableId)
        .eq("merchant_id", merchantId)
        .maybeSingle();
      if (!table || table.status !== "active") {
        return { ok: false, error: "Table not found." };
      }
      if (table.seats < partySize) {
        return { ok: false, error: "That table is too small for this party." };
      }
      return {
        ok: true,
        patch: {
          dining_table_id: table.id,
          table_number: table.table_number,
        },
      };
    }

    if (input.status === "called") {
      // Held reservation: activate to waiting first (same joined_at — no reinsert).
      if (existing.status === "held") {
        await admin
          .from("queue_entries")
          .update({ status: "waiting" })
          .eq("id", input.entryId)
          .eq("merchant_id", ctx.merchantId)
          .eq("status", "held");
      }

      const tableResolved = await resolveTablePatch(input.tableId);
      if (!tableResolved.ok) return tableResolved;

      // Atomic claim: `neq('called')` makes the transition itself the lock, so
      // two overlapping taps can't both mint a call event (and therefore two
      // queue_call_now sends). A read-then-write guard loses that race.
      // Only waiting → called. Never resurrect seated/left (e.g. after session end).
      const { data: claimed, error: claimError } = await admin
        .from("queue_entries")
        .update({
          status: "called",
          called_at: nowIso,
          accept_by: new Date(callAcceptDeadlineMs(Date.parse(nowIso))).toISOString(),
          ...tableResolved.patch,
        })
        .eq("id", input.entryId)
        .eq("merchant_id", ctx.merchantId)
        .eq("status", "waiting")
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
      const tableResolved = await resolveTablePatch(input.tableId);
      if (!tableResolved.ok) return tableResolved;
      Object.assign(patch, tableResolved.patch);
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

    // Booked guests handled from the queue board still close out their booking:
    // seating them is the arrival, releasing the slot is the no-show. Mirrors
    // the Reservations board, where "Arrived" seats the linked queue entry.
    if (updated.reservation_id) {
      const bookingClose =
        input.status === "seated"
          ? ({
              status: "completed",
              stamp: "completed_at",
              event: "completed",
            } as const)
          : input.status === "left" &&
              (existing.status === "held" ||
                existing.status === "waiting" ||
                existing.status === "called")
            ? ({ status: "no_show", stamp: "no_show_at", event: "no_show" } as const)
            : null;

      if (bookingClose) {
        // The `confirmed` guard makes the update the lock, so a booking already
        // closed from the other board can't be rewritten or double-logged.
        const { data: closed } = await admin
          .from("reservations")
          .update({
            status: bookingClose.status,
            [bookingClose.stamp]: nowIso,
            updated_at: nowIso,
          })
          .eq("id", updated.reservation_id)
          .eq("merchant_id", ctx.merchantId)
          .eq("status", "confirmed")
          .select("id")
          .maybeSingle();

        if (closed) {
          await recordReservationEvent({
            reservationId: closed.id,
            merchantId: ctx.merchantId,
            event: bookingClose.event,
            actor: {
              kind: "staff",
              userId: ctx.userId,
              name: ctx.actorName,
              role: ctx.role,
            },
            detail: "From the queue board",
          });
        }
      }
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

const SESSION_MATCH_WINDOW_MS = 5 * 60_000;

function msFromIso(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const n = new Date(iso).getTime();
  return Number.isFinite(n) ? n : undefined;
}

function waitMinutesForEntry(row: QueueEntryRow): number | null {
  if (row.status !== "seated" || !row.seated_at) return null;
  const joined = msFromIso(row.joined_at);
  const seated = msFromIso(row.seated_at);
  if (joined == null || seated == null) return null;
  return Math.max(0, Math.round((seated - joined) / 60_000));
}

function mapHistoryGuest(
  row: QueueEntryRow,
  showPhone: boolean,
): QueueHistoryGuest {
  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    phone: showPhone ? row.phone : maskPhone(row.phone),
    partySize: row.party_size,
    kind: row.kind,
    status: row.status,
    joinedAtMs: msFromIso(row.joined_at) ?? Date.now(),
    waitMinutes: waitMinutesForEntry(row),
  };
}

/**
 * Resolve an archived (or live) `queue_sessions` row for History drill-down.
 * Prefers a real DB id; falls back to number + started_at proximity for older
 * localStorage records that used synthetic `qs-…` ids.
 */
async function resolveHistorySession(input: {
  merchantId: string;
  sessionId?: string | null;
  number?: number;
  startedAtMs?: number;
  branchId?: string | null;
}): Promise<QueueSessionRow | null> {
  const admin = createAdminClient();

  if (input.sessionId && isQueueDbSessionId(input.sessionId)) {
    const { data } = await admin
      .from("queue_sessions")
      .select("*")
      .eq("id", input.sessionId)
      .eq("merchant_id", input.merchantId)
      .maybeSingle();
    if (data) return data as QueueSessionRow;
  }

  if (input.number == null || input.startedAtMs == null) return null;

  let query = admin
    .from("queue_sessions")
    .select("*")
    .eq("merchant_id", input.merchantId)
    .eq("number", input.number)
    .order("started_at", { ascending: false })
    .limit(10);

  if (input.branchId) {
    query = query.eq("branch_id", input.branchId);
  }

  const { data } = await query;
  const rows = (data as QueueSessionRow[] | null) ?? [];
  if (rows.length === 0) return null;

  let best: QueueSessionRow | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const started = msFromIso(row.started_at);
    if (started == null) continue;
    const delta = Math.abs(started - input.startedAtMs);
    if (delta < bestDelta) {
      best = row;
      bestDelta = delta;
    }
  }

  if (!best || bestDelta > SESSION_MATCH_WINDOW_MS) return null;
  return best;
}

/**
 * Permanently delete an archived session and everything hanging off it.
 *
 * `queue_entries` cascade from the session row, but `queue_call_jobs` correlate
 * on a plain text `client_entry_id` with no foreign key, so they are cleared
 * first — a surviving reminder would otherwise message a guest about a session
 * that no longer exists.
 */
export async function deleteQueueSession(input: {
  sessionId?: string | null;
  number?: number;
  startedAtMs?: number;
  branchId?: string | null;
}): Promise<{ ok: boolean; error?: string; deletedGuests: number }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error, deletedGuests: 0 };
    if (!canDeleteQueueSessions(ctx.role)) {
      return {
        ok: false,
        error: "You do not have access to delete sessions.",
        deletedGuests: 0,
      };
    }

    const session = await resolveHistorySession({
      merchantId: ctx.merchantId,
      sessionId: input.sessionId,
      number: input.number,
      startedAtMs: input.startedAtMs,
      branchId: input.branchId,
    });
    if (!session) return { ok: false, error: "Session not found.", deletedGuests: 0 };
    // Deleting the row a live board is still writing to would strand the
    // in-progress queue, so only archived sessions can go.
    if (session.status !== "ended") {
      return {
        ok: false,
        error: "End this session before deleting it.",
        deletedGuests: 0,
      };
    }

    const admin = createAdminClient();
    const { data: entries } = await admin
      .from("queue_entries")
      .select("id")
      .eq("merchant_id", ctx.merchantId)
      .eq("session_id", session.id);
    const entryIds = (entries ?? []).map((row) => row.id);

    if (entryIds.length > 0) {
      const { error: jobsError } = await admin
        .from("queue_call_jobs")
        .delete()
        .eq("merchant_id", ctx.merchantId)
        .in("client_entry_id", entryIds);
      if (jobsError) {
        console.error("deleteQueueSession jobs", jobsError);
        return {
          ok: false,
          error: "Could not delete session.",
          deletedGuests: 0,
        };
      }
    }

    const { error } = await admin
      .from("queue_sessions")
      .delete()
      .eq("id", session.id)
      .eq("merchant_id", ctx.merchantId);
    if (error) {
      console.error("deleteQueueSession", error);
      return { ok: false, error: "Could not delete session.", deletedGuests: 0 };
    }

    return { ok: true, deletedGuests: entryIds.length };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not delete session.",
      deletedGuests: 0,
    };
  }
}

/** Guests who joined a specific queue session (History → Sessions detail). */
export async function fetchQueueSessionGuests(input: {
  sessionId?: string | null;
  number?: number;
  startedAtMs?: number;
  branchId?: string | null;
}): Promise<{
  ok: boolean;
  error?: string;
  session?: { id: string; number: number };
  guests: QueueHistoryGuest[];
}> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error, guests: [] };

    const session = await resolveHistorySession({
      merchantId: ctx.merchantId,
      sessionId: input.sessionId,
      number: input.number,
      startedAtMs: input.startedAtMs,
      branchId: input.branchId,
    });
    if (!session) {
      return { ok: false, error: "Session not found.", guests: [] };
    }

    const rows = await listSessionEntries(session.id);
    const showPhone = canViewCustomerData(ctx.role);
    return {
      ok: true,
      session: { id: session.id, number: session.number },
      guests: rows.map((row) => mapHistoryGuest(row, showPhone)),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load guests.",
      guests: [],
    };
  }
}

/** Cap on visits pulled for one person — far beyond any real guest history. */
const CUSTOMER_VISIT_LIMIT = 200;

/**
 * Every queue visit by one person, newest first, for Queue → Customers.
 *
 * Entries carry `customer_id` only when the guest was matched to a customer
 * record, so phone is the fallback join — and phones are stored in mixed forms
 * (`+91…`, `91…`, bare national), hence the variant list.
 */
export async function fetchQueueCustomerVisits(input: {
  customerId?: string | null;
  phone?: string | null;
  branchId?: string | null;
}): Promise<{
  ok: boolean;
  error?: string;
  visits: QueueCustomerVisit[];
  /** Customer row behind these visits, when one exists. Enables notes. */
  customerId: string | null;
  merchantNotes: string;
  /**
   * Best known email. Reservation-created entries carry none (reservations
   * never collect one), so the customer record is the reliable source.
   */
  email: string | null;
}> {
  const empty = { visits: [], customerId: null, merchantNotes: "", email: null };
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error, ...empty };
    if (!canViewCustomerData(ctx.role)) {
      return { ok: false, error: "You do not have access to guest history.", ...empty };
    }

    const customerId = input.customerId?.trim() || null;
    const national = (input.phone ?? "").replace(/\D/g, "").slice(-10);
    const phoneVariants =
      national.length === 10
        ? [national, `91${national}`, `+91${national}`]
        : [];
    if (!customerId && phoneVariants.length === 0) {
      return { ok: false, error: "Guest not found.", ...empty };
    }

    const admin = createAdminClient();
    let query = admin
      .from("queue_entries")
      .select("*")
      .eq("merchant_id", ctx.merchantId)
      .order("joined_at", { ascending: false })
      .limit(CUSTOMER_VISIT_LIMIT);

    const matchers = [
      customerId ? `customer_id.eq.${customerId}` : null,
      phoneVariants.length > 0 ? `phone.in.(${phoneVariants.join(",")})` : null,
    ].filter((clause): clause is string => clause !== null);
    query = query.or(matchers.join(","));

    if (input.branchId) query = query.eq("branch_id", input.branchId);

    const { data, error } = await query;
    if (error) {
      console.error("fetchQueueCustomerVisits", error);
      return { ok: false, error: "Could not load visits.", ...empty };
    }

    const rows = (data as QueueEntryRow[] | null) ?? [];
    const sessionIds = [...new Set(rows.map((row) => row.session_id).filter(Boolean))];
    const numberBySession = new Map<string, number>();
    if (sessionIds.length > 0) {
      const { data: sessions } = await admin
        .from("queue_sessions")
        .select("id, number")
        .eq("merchant_id", ctx.merchantId)
        .in("id", sessionIds);
      for (const session of sessions ?? []) {
        numberBySession.set(session.id, session.number);
      }
    }

    // A queue-only guest still gets a customers row from ensureGuestCustomer,
    // so notes are reachable even when the caller had no customer id.
    const resolvedCustomerId =
      customerId ?? rows.find((row) => row.customer_id)?.customer_id ?? null;
    let merchantNotes = "";
    let email: string | null = null;
    if (resolvedCustomerId) {
      const { data: customer } = await admin
        .from("customers")
        .select("merchant_notes, email")
        .eq("id", resolvedCustomerId)
        .eq("merchant_id", ctx.merchantId)
        .maybeSingle();
      merchantNotes = customer?.merchant_notes?.trim() ?? "";
      email = customer?.email?.trim() || null;
    }
    // Guests with no customer record can still have left an email on a visit.
    email ??= rows.find((row) => row.email?.trim())?.email?.trim() ?? null;

    return {
      ok: true,
      visits: rows.map((row) => ({
        ...mapHistoryGuest(row, true),
        sessionId: row.session_id,
        sessionNumber: numberBySession.get(row.session_id) ?? null,
        branchId: row.branch_id,
      })),
      customerId: resolvedCustomerId,
      merchantNotes,
      email,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load visits.",
      ...empty,
    };
  }
}

/** One guest's visit timeline + merchant notes for History → Sessions. */
export async function fetchQueueSessionGuestDetail(input: {
  entryId: string;
}): Promise<{
  ok: boolean;
  error?: string;
  guest?: QueueHistoryGuestDetail;
}> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const entryId = input.entryId.trim();
    if (!entryId) return { ok: false, error: "Guest not found." };

    const admin = createAdminClient();
    const { data: row } = await admin
      .from("queue_entries")
      .select("*")
      .eq("id", entryId)
      .eq("merchant_id", ctx.merchantId)
      .maybeSingle();
    if (!row) return { ok: false, error: "Guest not found." };

    const entry = row as QueueEntryRow;
    const showData = canViewCustomerData(ctx.role);

    const { data: jobs } = await admin
      .from("queue_call_jobs")
      .select(
        "called_notified_at, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at, called_at",
      )
      .eq("merchant_id", ctx.merchantId)
      .eq("client_entry_id", entry.id)
      .order("called_at", { ascending: false })
      .limit(5);

    // Prefer the job that matches this entry's call; else the latest job.
    const calledAt = entry.called_at;
    const matched =
      (calledAt
        ? (jobs ?? []).find((j) => j.called_at === calledAt)
        : null) ??
      jobs?.[0] ??
      null;

    let merchantNotes = "";
    let email: string | null = null;
    if (showData && entry.customer_id) {
      const { data: customer } = await admin
        .from("customers")
        .select("merchant_notes, email")
        .eq("id", entry.customer_id)
        .eq("merchant_id", ctx.merchantId)
        .maybeSingle();
      merchantNotes = customer?.merchant_notes?.trim() ?? "";
      email = customer?.email?.trim() || null;
    }
    // Reservation-created entries never collect an email, so the customer
    // record is the reliable source. A guest with no customer row can still
    // have left one on the entry itself.
    if (showData) email ??= entry.email?.trim() || null;

    const joinedAtMs = msFromIso(entry.joined_at) ?? Date.now();
    const timeline = buildQueueGuestTimeline(
      {
        id: entry.id,
        joinedAtMs,
        notifiedJoinedAtMs: msFromIso(entry.notified_joined_at),
        calledAtMs: msFromIso(entry.called_at),
        seatedAtMs: msFromIso(entry.seated_at),
        leftAtMs: msFromIso(entry.left_at),
        status: entry.status,
      },
      matched
        ? {
            calledNotifiedAtMs: msFromIso(matched.called_notified_at),
            reminder1SentAtMs: msFromIso(matched.reminder_1_sent_at),
            reminder2SentAtMs: msFromIso(matched.reminder_2_sent_at),
            reminder3SentAtMs: msFromIso(matched.reminder_3_sent_at),
          }
        : null,
    );

    const guest: QueueHistoryGuestDetail = {
      ...mapHistoryGuest(entry, showData),
      email: email ?? undefined,
      merchantNotes: showData ? merchantNotes : "",
      timeline,
    };

    return { ok: true, guest };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load guest.",
    };
  }
}
