"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureGuestCustomer } from "@/lib/merchant/guest-customer";
import {
  requireMerchantContext,
  type MerchantContext,
} from "@/lib/merchant/server-context";
import { resolveBranchFilterForUser } from "@/lib/merchant/branch-access";
import { dashboardRangeStart } from "@/lib/merchant/analytics";
import { canViewAnalytics, canViewCustomerData } from "@/lib/merchant/roles";
import type { DashboardDateRange } from "@/lib/merchant/types";
import {
  addDays,
  buildReservationSlots,
  reservationStartMs,
  reservationToday,
  reservationSettingsFromProfile,
  type Reservation,
  type ReservationEvent,
  type ReservationEventName,
  type ReservationDateFilter,
  type ReservationStats,
  type ReservationStatus,
} from "@/lib/merchant/reservations";
import { formatTimeForInput, normalizeTimeInput } from "@/lib/merchant/queue-hours";
import {
  ensureHeldQueueEntryForReservation,
  releaseQueueHoldForReservation,
} from "@/lib/queue/reservation-holds";
import {
  RESERVATION_COLUMNS,
  toReservation,
  toReservationEvent,
} from "@/lib/reservations/mappers";
import { recordReservationEvent } from "@/lib/reservations/events";
import {
  resolveReservationTarget,
  sendReservationNotification,
  type ReservationNotifyTarget,
  type ReservationTemplate,
} from "@/lib/reservations/notify";
import {
  computeReservationAnalytics,
  computeReservationHistorySummary,
  computeReservationStats,
  type ReservationAnalytics,
  type ReservationHistorySummary,
} from "@/lib/reservations/stats";
import {
  entitlementsFromRows,
  isTrialActive,
} from "@/lib/merchant/entitlements";

interface CapturedReservationNotify {
  target: ReservationNotifyTarget;
  template: ReservationTemplate;
  merchantId: string;
  reservationToken: string;
  date: string;
  time: string;
  partySize: number;
  declineReason?: string | null;
}

/** Send after the response flushes so the merchant never waits on WhatsApp. */
function scheduleReservationNotify(captured: CapturedReservationNotify): void {
  after(async () => {
    await sendReservationNotification(captured);
  });
}

/** The signed-in teammate, shaped for the booking's audit trail. */
function staffActor(ctx: Extract<MerchantContext, { ok: true }>) {
  return {
    kind: "staff" as const,
    userId: ctx.userId,
    name: ctx.actorName,
    role: ctx.role,
  };
}

async function scopedBranchId(
  ctx: Extract<MerchantContext, { ok: true }>,
  requested: string | null | undefined,
): Promise<string | null> {
  const supabase = await createClient();
  return resolveBranchFilterForUser(
    supabase,
    ctx.merchantId,
    ctx.userId,
    requested ?? null,
  );
}

/** Inclusive [from, to] date keys for a dashboard filter, or null for "all". */
function rangeForFilter(
  filter: ReservationDateFilter,
  today: string,
): { from: string; to: string } | null {
  switch (filter) {
    case "today":
      return { from: today, to: today };
    case "tomorrow": {
      const tomorrow = addDays(today, 1);
      return { from: tomorrow, to: tomorrow };
    }
    case "week":
      return { from: today, to: addDays(today, 6) };
    case "all":
      return null;
  }
}

/** Hard cap on "All" so a busy restaurant can't blow up the table payload. */
const RESERVATION_PAGE_SIZE = 400;

/**
 * Reservations for the dashboard, plus today's stat-card counts.
 *
 * Stats are always today-scoped and queried separately, so the cards keep
 * showing the day's numbers while the merchant browses another date filter.
 */
export async function fetchReservations(input?: {
  filter?: ReservationDateFilter;
  branchId?: string | null;
}): Promise<{
  ok: boolean;
  error?: string;
  reservations: Reservation[];
  stats: ReservationStats;
}> {
  const emptyStats: ReservationStats = {
    today: 0,
    pending: 0,
    confirmed: 0,
    completed: 0,
    noShows: 0,
  };
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) {
      return { ok: false, error: ctx.error, reservations: [], stats: emptyStats };
    }

    const branchId = await scopedBranchId(ctx, input?.branchId);
    const today = reservationToday();
    const filter = input?.filter ?? "today";
    const range = rangeForFilter(filter, today);
    const admin = createAdminClient();

    // Legacy guest requests were saved without a branch. Attach them to the
    // default branch so branch-scoped boards (and this fetch) can see them.
    if (branchId) {
      const { data: defaultBranch } = await admin
        .from("branches")
        .select("id")
        .eq("merchant_id", ctx.merchantId)
        .eq("is_default", true)
        .maybeSingle();
      if (defaultBranch?.id === branchId) {
        await admin
          .from("reservations")
          .update({ branch_id: branchId })
          .eq("merchant_id", ctx.merchantId)
          .is("branch_id", null);
      }
    }

    let query = admin
      .from("reservations")
      .select(RESERVATION_COLUMNS)
      .eq("merchant_id", ctx.merchantId)
      .order("reservation_date", { ascending: filter !== "all" })
      .order("reservation_time", { ascending: true })
      .limit(RESERVATION_PAGE_SIZE);
    if (branchId) query = query.eq("branch_id", branchId);
    if (range) {
      query = query.gte("reservation_date", range.from).lte("reservation_date", range.to);
    }

    let statsQuery = admin
      .from("reservations")
      .select(RESERVATION_COLUMNS)
      .eq("merchant_id", ctx.merchantId)
      .eq("reservation_date", today);
    if (branchId) statsQuery = statsQuery.eq("branch_id", branchId);

    const [rowsRes, statsRes] = await Promise.all([query, statsQuery]);
    if (rowsRes.error) {
      return {
        ok: false,
        error: rowsRes.error.message,
        reservations: [],
        stats: emptyStats,
      };
    }

    return {
      ok: true,
      reservations: (rowsRes.data ?? []).map(toReservation),
      stats: computeReservationStats(
        (statsRes.data ?? []).map(toReservation),
        today,
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not load reservations.",
      reservations: [],
      stats: emptyStats,
    };
  }
}

/**
 * Bookings whose date has passed, newest first — the history page. Scoped by
 * date rather than status so a booking the merchant never got round to
 * reviewing still shows up once the evening is over.
 */
export async function fetchReservationHistory(input?: {
  /** Lookback in days; null for everything on file. */
  days?: number | null;
  branchId?: string | null;
}): Promise<{
  ok: boolean;
  error?: string;
  reservations: Reservation[];
  summary: ReservationHistorySummary;
}> {
  const emptySummary: ReservationHistorySummary = {
    total: 0,
    seated: 0,
    noShows: 0,
    droppedOff: 0,
  };
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) {
      return { ok: false, error: ctx.error, reservations: [], summary: emptySummary };
    }

    const branchId = await scopedBranchId(ctx, input?.branchId);
    const today = reservationToday();
    const days = input?.days ?? null;
    const admin = createAdminClient();

    let query = admin
      .from("reservations")
      .select(RESERVATION_COLUMNS)
      .eq("merchant_id", ctx.merchantId)
      .lt("reservation_date", today)
      .order("reservation_date", { ascending: false })
      .order("reservation_time", { ascending: false })
      .limit(RESERVATION_PAGE_SIZE);
    if (branchId) query = query.eq("branch_id", branchId);
    if (days !== null) query = query.gte("reservation_date", addDays(today, -days));

    const { data, error } = await query;
    if (error) {
      return { ok: false, error: error.message, reservations: [], summary: emptySummary };
    }

    const reservations = (data ?? []).map(toReservation);
    return {
      ok: true,
      reservations,
      summary: computeReservationHistorySummary(reservations),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load history.",
      reservations: [],
      summary: emptySummary,
    };
  }
}

export async function fetchReservation(input: { reservationId: string }): Promise<{
  ok: boolean;
  error?: string;
  reservation?: Reservation;
}> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("reservations")
      .select(RESERVATION_COLUMNS)
      .eq("id", input.reservationId)
      .eq("merchant_id", ctx.merchantId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Reservation not found." };
    return { ok: true, reservation: toReservation(data) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load reservation.",
    };
  }
}

/**
 * Who did what to one booking, oldest first. Merchant-only: staff names are
 * never part of the guest's view of their reservation.
 */
export async function fetchReservationEvents(input: {
  reservationId: string;
}): Promise<{ ok: boolean; error?: string; events: ReservationEvent[] }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error, events: [] };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("reservation_events")
      .select("id, event, actor_kind, actor_name, actor_role, detail, created_at")
      .eq("reservation_id", input.reservationId)
      .eq("merchant_id", ctx.merchantId)
      .order("created_at", { ascending: true });

    if (error) return { ok: false, error: error.message, events: [] };
    return { ok: true, events: (data ?? []).map(toReservationEvent) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load the trail.",
      events: [],
    };
  }
}

/**
 * Merchant-entered booking (phone or walk-up). These are confirmed on the spot —
 * the merchant already agreed to the time — so the guest gets a confirmation.
 */
export async function createReservation(input: {
  name: string;
  phone: string;
  partySize: number;
  date: string;
  time: string;
  notes?: string;
  branchId?: string | null;
}): Promise<{ ok: boolean; error?: string; reservation?: Reservation }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const name = input.name.trim();
    if (!name) return { ok: false, error: "Customer name is required." };

    const time = normalizeTimeInput(input.time);
    if (!time) return { ok: false, error: "Pick a reservation time." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return { ok: false, error: "Pick a reservation date." };
    }
    if (input.date < reservationToday()) {
      return { ok: false, error: "Pick a date that hasn't passed." };
    }

    const admin = createAdminClient();
    const { data: merchant } = await admin
      .from("merchants")
      .select(
        "reservation_max_party_size, reservation_allow_notes",
      )
      .eq("id", ctx.merchantId)
      .maybeSingle();
    const maxPartySize = merchant?.reservation_max_party_size ?? 12;
    const partySize = Math.round(input.partySize);
    if (!Number.isFinite(partySize) || partySize < 1) {
      return { ok: false, error: "Enter the number of guests." };
    }
    if (partySize > maxPartySize) {
      return { ok: false, error: `Maximum party size is ${maxPartySize}.` };
    }

    const branchId = await scopedBranchId(ctx, input.branchId);
    const customer = await ensureGuestCustomer({
      merchantId: ctx.merchantId,
      branchId,
      name,
      phone: input.phone,
    });
    if (!customer) return { ok: false, error: "Enter a valid 10-digit mobile number." };

    const nowIso = new Date().toISOString();
    const { data: row, error } = await admin
      .from("reservations")
      .insert({
        merchant_id: ctx.merchantId,
        branch_id: branchId,
        customer_id: customer.id,
        customer_name: name,
        customer_phone: customer.phone,
        customer_whatsapp: customer.whatsappAvailable ? customer.phone : null,
        party_size: partySize,
        reservation_date: input.date,
        reservation_time: time,
        status: "confirmed",
        confirmed_at: nowIso,
        notes:
          merchant?.reservation_allow_notes === false
            ? null
            : input.notes?.trim() || null,
      })
      .select(RESERVATION_COLUMNS)
      .single();

    if (error || !row) {
      return { ok: false, error: error?.message ?? "Could not save the reservation." };
    }

    let reservation = toReservation(row);
    await recordReservationEvent({
      reservationId: reservation.id,
      merchantId: ctx.merchantId,
      event: "created",
      actor: staffActor(ctx),
      detail: "Taken by phone or in person",
    });

    // Booked and confirmed in one step, so the trail shows both.
    await recordReservationEvent({
      reservationId: reservation.id,
      merchantId: ctx.merchantId,
      event: "confirmed",
      actor: staffActor(ctx),
    });
    scheduleReservationNotify({
      target: await resolveReservationTarget({
        merchantId: ctx.merchantId,
        customerId: customer.id,
      }),
      template: "reservation_confirmed",
      merchantId: ctx.merchantId,
      reservationToken: reservation.publicToken,
      date: reservation.date,
      time: reservation.time,
      partySize: reservation.partySize,
    });

    // Hold a future queue slot when today's queue is live.
    await ensureHeldQueueEntryForReservation({
      ...row,
      merchant_id: ctx.merchantId,
    });

    return { ok: true, reservation };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not save the reservation.",
    };
  }
}

/**
 * Status transitions the merchant can trigger, and what each one sends.
 *
 * Cancellations, arrivals and no-shows send nothing — the guest sees them on
 * the reservation page, which is the single source of truth.
 */
const STATUS_ACTIONS = {
  confirm: {
    status: "confirmed",
    stamp: "confirmed_at",
    template: "reservation_confirmed",
    event: "confirmed",
  },
  decline: {
    status: "declined",
    stamp: "declined_at",
    template: "reservation_declined",
    event: "declined",
  },
  cancel: {
    status: "cancelled",
    stamp: "cancelled_at",
    template: null,
    event: "cancelled",
  },
  complete: {
    status: "completed",
    stamp: "completed_at",
    template: null,
    event: "completed",
  },
  no_show: { status: "no_show", stamp: "no_show_at", template: null, event: "no_show" },
} satisfies Record<
  string,
  {
    status: ReservationStatus;
    stamp: string;
    template: ReservationTemplate | null;
    event: ReservationEventName;
  }
>;

export type ReservationAction = keyof typeof STATUS_ACTIONS;

/**
 * Apply a status change. The `status` guard makes the update itself the lock, so
 * two overlapping taps can't both send a WhatsApp message for the same change.
 */
export async function setReservationStatus(input: {
  reservationId: string;
  action: ReservationAction;
  reason?: string;
  /** On confirm — optional dining table the merchant picked. */
  tableId?: string | null;
}): Promise<{ ok: boolean; error?: string; reservation?: Reservation }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const action = STATUS_ACTIONS[input.action];
    if (!action) return { ok: false, error: "Unsupported reservation action." };

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    // Resolve a merchant-picked table up front so confirm can't succeed without it.
    let confirmTable:
      | { id: string; table_number: number }
      | null
      | undefined;
    if (input.action === "confirm" && input.tableId) {
      const { data: existing } = await admin
        .from("reservations")
        .select("id, party_size, branch_id, dining_table_id, reservation_date, reservation_time")
        .eq("id", input.reservationId)
        .eq("merchant_id", ctx.merchantId)
        .maybeSingle();
      if (!existing) return { ok: false, error: "Reservation not found." };
      if (!existing.dining_table_id) {
        const { data: table } = await admin
          .from("dining_tables")
          .select("id, table_number, seats, status")
          .eq("id", input.tableId)
          .eq("merchant_id", ctx.merchantId)
          .maybeSingle();
        if (!table || table.status !== "active") {
          return { ok: false, error: "Table not found." };
        }
        if (table.seats < existing.party_size) {
          return { ok: false, error: "That table is too small for this party." };
        }
        confirmTable = { id: table.id, table_number: table.table_number };
      }
    }

    const patch: Record<string, unknown> = {
      status: action.status,
      [action.stamp]: nowIso,
      updated_at: nowIso,
    };
    if (input.action === "decline") {
      patch.decline_reason = input.reason?.trim() || null;
    }
    if (input.action === "cancel") {
      patch.cancelled_by = "merchant";
    }
    if (input.action === "confirm") {
      // Confirming the original slot withdraws any proposal still in flight.
      patch.suggested_at = null;
      patch.suggested_date = null;
      patch.suggested_time = null;
      if (confirmTable) {
        patch.dining_table_id = confirmTable.id;
        patch.table_number = confirmTable.table_number;
      }
    }

    const { data: row, error } = await admin
      .from("reservations")
      .update(patch)
      .eq("id", input.reservationId)
      .eq("merchant_id", ctx.merchantId)
      .neq("status", action.status)
      .select(RESERVATION_COLUMNS)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!row) {
      // Lost the race (or nothing to change): report the current row, send nothing.
      const { data: current } = await admin
        .from("reservations")
        .select(RESERVATION_COLUMNS)
        .eq("id", input.reservationId)
        .eq("merchant_id", ctx.merchantId)
        .maybeSingle();
      if (!current) return { ok: false, error: "Reservation not found." };
      return { ok: true, reservation: toReservation(current) };
    }

    const reservation = toReservation(row);
    // Only the winner of the status guard above gets here, so the trail can't
    // record the same change twice from two overlapping taps.
    await recordReservationEvent({
      reservationId: reservation.id,
      merchantId: ctx.merchantId,
      event: action.event,
      actor: staffActor(ctx),
      detail: input.action === "decline" ? reservation.declineReason : null,
    });
    if (action.template) {
      scheduleReservationNotify({
        target: await resolveReservationTarget({
          merchantId: ctx.merchantId,
          customerId: reservation.customerId,
        }),
        template: action.template,
        merchantId: ctx.merchantId,
        reservationToken: reservation.publicToken,
        date: reservation.date,
        time: reservation.time,
        partySize: reservation.partySize,
        declineReason: reservation.declineReason,
      });
    }

    if (input.action === "confirm") {
      await ensureHeldQueueEntryForReservation({
        ...row,
        merchant_id: ctx.merchantId,
      });
    } else if (
      input.action === "cancel" ||
      input.action === "decline" ||
      input.action === "no_show"
    ) {
      await releaseQueueHoldForReservation(
        reservation.id,
        input.action === "no_show"
          ? "no_show"
          : input.action === "decline"
            ? "declined"
            : "cancelled",
      );
    } else if (input.action === "complete") {
      // Arrival / seated — close any open hold without treating as left.
      const adminHold = createAdminClient();
      const nowComplete = new Date().toISOString();
      await adminHold
        .from("queue_entries")
        .update({ status: "seated", seated_at: nowComplete })
        .eq("reservation_id", reservation.id)
        .in("status", ["held", "waiting", "called"]);
    }

    return { ok: true, reservation };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not update the reservation.",
    };
  }
}

/**
 * Propose a different date/time. The booking keeps its original slot and goes
 * back to pending — the proposal only takes effect when the guest accepts it on
 * their reservation page.
 */
export async function suggestReservationTime(input: {
  reservationId: string;
  date: string;
  time: string;
}): Promise<{ ok: boolean; error?: string; reservation?: Reservation }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const time = normalizeTimeInput(input.time);
    if (!time) return { ok: false, error: "Pick a new time." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return { ok: false, error: "Pick a new date." };
    }
    if (input.date < reservationToday()) {
      return { ok: false, error: "Pick a date that hasn't passed." };
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data: row, error } = await admin
      .from("reservations")
      .update({
        status: "pending",
        suggested_date: input.date,
        suggested_time: time,
        suggested_at: nowIso,
        suggestion_accepted_at: null,
        confirmed_at: null,
        updated_at: nowIso,
        // The table isn't held any more, so reminders start over once the guest
        // accepts and the booking is confirmed again.
        reminder_24h_sent_at: null,
        reminder_2h_sent_at: null,
        reminder_30m_sent_at: null,
      })
      .eq("id", input.reservationId)
      .eq("merchant_id", ctx.merchantId)
      .in("status", ["pending", "confirmed"])
      .select(RESERVATION_COLUMNS)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!row) {
      return { ok: false, error: "Only open reservations can be rescheduled." };
    }

    // Original slot is no longer held while the guest considers the proposal.
    await releaseQueueHoldForReservation(row.id, "suggested");

    const reservation = toReservation(row);
    await recordReservationEvent({
      reservationId: reservation.id,
      merchantId: ctx.merchantId,
      event: "suggested",
      actor: staffActor(ctx),
      detail: `Proposed ${input.date} at ${time}`,
    });
    scheduleReservationNotify({
      target: await resolveReservationTarget({
        merchantId: ctx.merchantId,
        customerId: reservation.customerId,
      }),
      template: "reservation_updated",
      merchantId: ctx.merchantId,
      reservationToken: reservation.publicToken,
      // The message quotes the proposed slot, not the one on hold.
      date: input.date,
      time,
      partySize: reservation.partySize,
    });

    return { ok: true, reservation };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not suggest a new time.",
    };
  }
}

/** Private note kept on the booking — never sent to the guest. */
export async function saveReservationNotes(input: {
  reservationId: string;
  merchantNotes: string;
}): Promise<{ ok: boolean; error?: string; reservation?: Reservation }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const admin = createAdminClient();
    const { data: row, error } = await admin
      .from("reservations")
      .update({
        merchant_notes: input.merchantNotes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.reservationId)
      .eq("merchant_id", ctx.merchantId)
      .select(RESERVATION_COLUMNS)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!row) return { ok: false, error: "Reservation not found." };
    return { ok: true, reservation: toReservation(row) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save the note.",
    };
  }
}

export async function getReservationAnalytics(input?: {
  range?: DashboardDateRange;
  branchId?: string | null;
}): Promise<{ ok: boolean; error?: string; analytics?: ReservationAnalytics }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!canViewAnalytics(ctx.role)) {
      return { ok: false, error: "You do not have access to analytics." };
    }

    const branchId = await scopedBranchId(ctx, input?.branchId);
    const start = dashboardRangeStart(input?.range ?? "30d");

    const admin = createAdminClient();
    let query = admin
      .from("reservations")
      .select(RESERVATION_COLUMNS)
      .eq("merchant_id", ctx.merchantId);
    // `null` means "all time" for the shared range picker.
    if (start) query = query.gte("reservation_date", start.toISOString().slice(0, 10));
    if (branchId) query = query.eq("branch_id", branchId);

    const { data, error } = await query;
    if (error) return { ok: false, error: error.message };

    return {
      ok: true,
      analytics: computeReservationAnalytics((data ?? []).map(toReservation)),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load analytics.",
    };
  }
}

/**
 * Slots + limits for the merchant's own booking form. Interval/party rules come
 * from reservation settings; the seating window comes from branch store timings.
 */
export async function fetchReservationFormConfig(input?: {
  branchId?: string | null;
}): Promise<{
  ok: boolean;
  error?: string;
  slots?: string[];
  maxPartySize?: number;
  allowNotes?: boolean;
  allowSameDay?: boolean;
}> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const admin = createAdminClient();
    const branchId = await scopedBranchId(ctx, input?.branchId);

    const [{ data }, branchRes] = await Promise.all([
      admin
        .from("merchants")
        .select(
          "reservation_max_party_size, reservation_interval_minutes, reservation_open_time, reservation_close_time, reservation_allow_same_day, reservation_allow_notes",
        )
        .eq("id", ctx.merchantId)
        .maybeSingle(),
      branchId
        ? admin
            .from("branches")
            .select("queue_open_time, queue_close_time")
            .eq("id", branchId)
            .eq("merchant_id", ctx.merchantId)
            .maybeSingle()
        : admin
            .from("branches")
            .select("queue_open_time, queue_close_time")
            .eq("merchant_id", ctx.merchantId)
            .eq("is_default", true)
            .maybeSingle(),
    ]);

    const branch = branchRes.data;
    const settings = reservationSettingsFromProfile({
      reservationMaxPartySize: data?.reservation_max_party_size,
      reservationIntervalMinutes: data?.reservation_interval_minutes,
      queueOpenTime: branch?.queue_open_time
        ? formatTimeForInput(branch.queue_open_time)
        : undefined,
      queueCloseTime: branch?.queue_close_time
        ? formatTimeForInput(branch.queue_close_time)
        : undefined,
      reservationOpenTime: data ? formatTimeForInput(data.reservation_open_time) : undefined,
      reservationCloseTime: data ? formatTimeForInput(data.reservation_close_time) : undefined,
      reservationAllowSameDay: data?.reservation_allow_same_day,
      reservationAllowNotes: data?.reservation_allow_notes,
    });

    return {
      ok: true,
      slots: buildReservationSlots(settings),
      maxPartySize: settings.maxPartySize,
      allowNotes: settings.allowNotes,
      allowSameDay: settings.allowSameDay,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load settings.",
    };
  }
}

/** Cap on bookings pulled for one person — far beyond any real guest history. */
const CUSTOMER_BOOKING_LIMIT = 200;

/**
 * Sidebar meter: bookings created in the current trial window (or calendar
 * month when paid) — same window the capacity gate uses on trial.
 */
export async function countReservationsUsedForPlanMeter(): Promise<{
  ok: boolean;
  count: number;
  error?: string;
}> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, count: 0, error: ctx.error };

    const admin = createAdminClient();
    const { data: rows } = await admin
      .from("merchant_products")
      .select(
        "product, plan_id, status, onboarded_at, trial_started_at, trial_ends_at",
      )
      .eq("merchant_id", ctx.merchantId);

    const entitlements = entitlementsFromRows(rows ?? []);
    const reservation = entitlements.reservation;
    const onTrial = isTrialActive(reservation);

    let sinceIso: string;
    if (onTrial && reservation?.trialStartedAt) {
      sinceIso = reservation.trialStartedAt;
    } else {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      sinceIso = d.toISOString();
    }

    const { count } = await admin
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", ctx.merchantId)
      .gte("created_at", sinceIso);

    return { ok: true, count: count ?? 0 };
  } catch (error) {
    return {
      ok: false,
      count: 0,
      error: error instanceof Error ? error.message : "Could not load usage.",
    };
  }
}

/**
 * Every reservation by one person, newest dining slot first, for
 * Reservations → Customers.
 *
 * Rows carry `customer_id` only when the guest was matched to a customer
 * record, so phone is the fallback join — and phones are stored in mixed forms
 * (`+91…`, `91…`, bare national), hence the variant list.
 */
export async function fetchReservationCustomerBookings(input: {
  customerId?: string | null;
  phone?: string | null;
  branchId?: string | null;
}): Promise<{
  ok: boolean;
  error?: string;
  bookings: Reservation[];
  /** Customer row behind these bookings, when one exists. Enables notes. */
  customerId: string | null;
  merchantNotes: string;
  email: string | null;
}> {
  const empty = { bookings: [], customerId: null, merchantNotes: "", email: null };
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
      .from("reservations")
      .select(RESERVATION_COLUMNS)
      .eq("merchant_id", ctx.merchantId)
      .order("reservation_date", { ascending: false })
      .order("reservation_time", { ascending: false })
      .limit(CUSTOMER_BOOKING_LIMIT);

    const matchers = [
      customerId ? `customer_id.eq.${customerId}` : null,
      phoneVariants.length > 0
        ? `customer_phone.in.(${phoneVariants.join(",")})`
        : null,
    ].filter((clause): clause is string => clause !== null);
    query = query.or(matchers.join(","));

    if (input.branchId) query = query.eq("branch_id", input.branchId);

    const { data, error } = await query;
    if (error) {
      console.error("fetchReservationCustomerBookings", error);
      return { ok: false, error: "Could not load bookings.", ...empty };
    }

    const bookings = (data ?? []).map(toReservation);
    // Prefer dining-slot order even if the DB sort mixed future/past oddly.
    bookings.sort(
      (a, b) =>
        reservationStartMs(b.date, b.time) - reservationStartMs(a.date, a.time),
    );

    const resolvedCustomerId =
      customerId ?? bookings.find((row) => row.customerId)?.customerId ?? null;
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

    return {
      ok: true,
      bookings,
      customerId: resolvedCustomerId,
      merchantNotes,
      email,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load bookings.",
      ...empty,
    };
  }
}
