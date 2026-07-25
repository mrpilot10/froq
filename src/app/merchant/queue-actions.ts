"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toCanonicalPhone, toSupabaseAuthPhone } from "@/lib/auth/otp/phone";
import { isValidPhone } from "@/lib/auth/format";
import { normalizeMemberRole } from "@/lib/merchant/roles";
import type { MemberRole } from "@/lib/merchant/types";
import { buildReminderSchedule } from "@/lib/queue/call-reminders";
import {
  getOpenQueueSession,
  listSessionEntries,
  mapQueueEntryRow,
  mapQueueSessionRow,
  type LiveQueueEntry,
  type LiveQueueSession,
} from "@/lib/queue/live-board";
import { acceptWindowMs, CALL_ACCEPT_MINUTES } from "@/lib/merchant/queue-settings";

type QueueCallResolveStatus = "seated" | "skipped" | "left";

async function resolveMerchantId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data: owned } = await supabase
    .from("merchants")
    .select("id")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (owned?.id) return owned.id;

  const { data: membership } = await supabase
    .from("merchant_members")
    .select("merchant_id")
    .eq("user_id", userId)
    .maybeSingle();
  return membership?.merchant_id ?? null;
}

async function requireMerchantContext(): Promise<{
  ok: true;
  merchantId: string;
  role: MemberRole;
  userId: string;
} | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const merchantId = await resolveMerchantId(supabase, user.id);
  if (!merchantId) return { ok: false, error: "Merchant account not found." };

  const { data: merchant } = await supabase
    .from("merchants")
    .select("owner_user_id")
    .eq("id", merchantId)
    .maybeSingle();

  let role: MemberRole = "staff";
  if (merchant?.owner_user_id === user.id) {
    role = "owner";
  } else {
    const { data: mem } = await supabase
      .from("merchant_members")
      .select("role")
      .eq("merchant_id", merchantId)
      .eq("user_id", user.id)
      .maybeSingle();
    role = normalizeMemberRole(mem?.role);
  }

  return { ok: true, merchantId, role, userId: user.id };
}

function normalizeGuestPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "").slice(-10);
  if (!isValidPhone(digits)) return null;
  const canonical = toCanonicalPhone(digits);
  return canonical ? toSupabaseAuthPhone(canonical) : null;
}

/**
 * Find or create a customers row for this merchant + phone so we can reuse
 * the existing public_token for WhatsApp URL buttons.
 */
async function ensureQueueCustomer(input: {
  merchantId: string;
  branchId?: string | null;
  name: string;
  phone: string;
}): Promise<{ id: string; publicToken: string; phone: string; name: string; whatsappAvailable: boolean; preferred: "sms" | "whatsapp" } | null> {
  const phoneE164 = normalizeGuestPhone(input.phone);
  if (!phoneE164) return null;

  const admin = createAdminClient();
  const national = phoneE164.replace(/\D/g, "").slice(-10);
  const variants = [phoneE164, national, `91${national}`, `+91${national}`];

  const { data: existing } = await admin
    .from("customers")
    .select(
      "id, name, phone, public_token, whatsapp_available, preferred_notification_channel",
    )
    .eq("merchant_id", input.merchantId)
    .in("phone", variants)
    .limit(1)
    .maybeSingle();

  if (existing?.public_token) {
    return {
      id: existing.id,
      publicToken: existing.public_token,
      phone: existing.phone,
      name: existing.name || input.name,
      whatsappAvailable: existing.whatsapp_available === true,
      preferred:
        existing.preferred_notification_channel === "whatsapp" ? "whatsapp" : "sms",
    };
  }

  const { data: inserted, error } = await admin
    .from("customers")
    .insert({
      merchant_id: input.merchantId,
      branch_id: input.branchId ?? null,
      name: input.name.trim() || "Guest",
      phone: phoneE164,
    })
    .select(
      "id, name, phone, public_token, whatsapp_available, preferred_notification_channel",
    )
    .single();

  if (error || !inserted?.public_token) {
    console.error("ensureQueueCustomer insert failed", error?.message);
    return null;
  }

  // Seed an empty loyalty card so the customer hub stays consistent.
  await admin.from("loyalty_cards").upsert(
    {
      customer_id: inserted.id,
      merchant_id: input.merchantId,
      branch_id: input.branchId ?? null,
      stamps: 0,
      status: "active",
    },
    { onConflict: "customer_id", ignoreDuplicates: true },
  );

  return {
    id: inserted.id,
    publicToken: inserted.public_token,
    phone: inserted.phone,
    name: inserted.name,
    whatsappAvailable: inserted.whatsapp_available === true,
    preferred:
      inserted.preferred_notification_channel === "whatsapp" ? "whatsapp" : "sms",
  };
}

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

async function notifyQueueTemplate(input: {
  customer: QueueNotifiableCustomer;
  template:
    | "queue_first_notify"
    | "queue_call_now"
    | "queue_seated"
    | "queue_customer_skipped";
  data:
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

    const customer = await ensureQueueCustomer({
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

    const notified = await notifyQueueTemplate({
      customer,
      template: "queue_first_notify",
      data: {
        businessName,
        bookingSize: partySize,
        queuePosition,
        estimatedWaitMinutes,
      },
    });
    if (!notified.ok) {
      return { ok: false, error: notified.error ?? "Couldn't send WhatsApp notification." };
    }

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

    const customer = await ensureQueueCustomer({
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

    const nowIso = new Date().toISOString();
    const schedule = buildReminderSchedule(nowIso);
    const admin = createAdminClient();

    // Upsert keeps re-calls idempotent for the same client entry.
    const { data: job, error } = await admin
      .from("queue_call_jobs")
      .upsert(
        {
          merchant_id: ctx.merchantId,
          branch_id: input.branchId ?? null,
          client_entry_id: input.clientEntryId.trim(),
          customer_id: customer.id,
          customer_name: name,
          customer_phone: customer.phone,
          party_size: partySize,
          status: "called",
          called_at: nowIso,
          called_notified_at: null,
          ...schedule,
          reminder_1_sent_at: null,
          reminder_2_sent_at: null,
          reminder_3_sent_at: null,
          resolved_at: null,
        },
        { onConflict: "merchant_id,client_entry_id" },
      )
      .select("id, called_notified_at")
      .single();

    if (error || !job) {
      return { ok: false, error: error?.message ?? "Could not register the call." };
    }

    // Claim the immediate notification so retries don't double-send.
    const { data: claimed } = await admin
      .from("queue_call_jobs")
      .update({ called_notified_at: nowIso })
      .eq("id", job.id)
      .eq("status", "called")
      .is("called_notified_at", null)
      .select("id")
      .maybeSingle();

    if (claimed) {
      const notified = await notifyQueueTemplate({
        customer,
        template: "queue_call_now",
        data: {
          businessName,
          bookingSize: partySize,
        },
      });
      if (!notified.ok) {
        // Release the claim so a retry can send again.
        await admin
          .from("queue_call_jobs")
          .update({ called_notified_at: null })
          .eq("id", job.id);
        return {
          ok: false,
          error: notified.error ?? "Couldn't send call WhatsApp notification.",
          jobId: job.id,
        };
      }
    }

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
    return {
      ok: true,
      session: mapQueueSessionRow(open),
      entries: rows.map(mapQueueEntryRow),
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

    const customer = await ensureQueueCustomer({
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

    const notify = await notifyQueueTemplate({
      customer,
      template: "queue_first_notify",
      data: {
        businessName,
        bookingSize: partySize,
        queuePosition,
        estimatedWaitMinutes: Math.max(0, Math.round(input.estimatedWaitMinutes)),
      },
    });

    if (notify.ok) {
      await admin
        .from("queue_entries")
        .update({ notified_joined_at: new Date().toISOString() })
        .eq("id", entry.id);
    } else {
      // Guest is on the board; surface the WA failure so it isn't silent.
      return {
        ok: true,
        entry: mapQueueEntryRow(entry),
        error: notify.error ?? "Guest added, but WhatsApp failed.",
      };
    }

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
    const patch: Record<string, unknown> = { status: input.status };
    if (input.status === "called") {
      const calledAt = Date.now();
      patch.called_at = nowIso;
      patch.accept_by = new Date(
        calledAt + acceptWindowMs(CALL_ACCEPT_MINUTES),
      ).toISOString();
    } else if (input.status === "seated") {
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

    if (input.status === "called") {
      const called = await registerQueueCall({
        clientEntryId: updated.id,
        name: updated.name,
        phone: updated.phone,
        partySize: updated.party_size,
        branchId: input.branchId,
      });
      if (!called.ok) {
        return {
          ok: true,
          entry: mapQueueEntryRow(updated),
          error: called.error ?? "Called, but WhatsApp failed.",
        };
      }
    } else {
      await resolveQueueCall({
        clientEntryId: updated.id,
        status: input.status === "seated" ? "seated" : "left",
      });

      const customer = await ensureQueueCustomer({
        merchantId: ctx.merchantId,
        branchId: input.branchId,
        name: updated.name,
        phone: updated.phone,
      });
      if (customer) {
        const businessName = await businessNameFor(ctx.merchantId);
        const notified = await notifyQueueTemplate({
          customer,
          template:
            input.status === "seated" ? "queue_seated" : "queue_customer_skipped",
          data: {
            businessName,
            bookingSize: updated.party_size,
          },
        });
        if (!notified.ok) {
          return {
            ok: true,
            entry: mapQueueEntryRow(updated),
            error: notified.error ?? "Status updated, but WhatsApp failed.",
          };
        }
      }
    }

    return { ok: true, entry: mapQueueEntryRow(updated) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update guest.",
    };
  }
}
