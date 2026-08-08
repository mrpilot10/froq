import "server-only";

import { formatTimeForInput } from "@/lib/merchant/queue-hours";
import {
  reservationStartMs,
  reservationToday,
} from "@/lib/merchant/reservations";
import { getOpenQueueSession } from "@/lib/queue/live-board";
import {
  isPastGrace,
  shouldActivateHeld,
} from "@/lib/queue/ordering";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  QueueEntryRow,
  ReservationRow,
  ReservationStatus,
} from "@/lib/supabase/database.types";

const DEFAULT_GRACE_MINUTES = 15;

export type ReservationHoldSource = Pick<
  ReservationRow,
  | "id"
  | "merchant_id"
  | "branch_id"
  | "customer_id"
  | "customer_name"
  | "customer_phone"
  | "party_size"
  | "reservation_date"
  | "reservation_time"
  | "status"
>;

function reservationAtIso(dateKey: string, time: string): string {
  const ms = reservationStartMs(dateKey, formatTimeForInput(time));
  return new Date(ms).toISOString();
}

function reservationTimeLabel(time: string): string {
  return formatTimeForInput(time);
}

async function graceMinutesFor(merchantId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("merchants")
    .select("reservation_grace_minutes")
    .eq("id", merchantId)
    .maybeSingle();
  const raw = (data as { reservation_grace_minutes?: number } | null)
    ?.reservation_grace_minutes;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_GRACE_MINUTES;
  return Math.min(120, Math.max(0, Math.round(raw)));
}

/**
 * Find an open session that can host this reservation hold.
 * Exact branch match only — never attach a reservation to another branch's queue.
 */
async function sessionForHold(
  merchantId: string,
  branchId: string | null,
): Promise<{ id: string; branch_id: string | null } | null> {
  const open = await getOpenQueueSession(merchantId, branchId);
  if (!open) return null;
  return { id: open.id, branch_id: open.branch_id };
}

async function existingOpenHold(
  reservationId: string,
): Promise<QueueEntryRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("queue_entries")
    .select("*")
    .eq("reservation_id", reservationId)
    .in("status", ["held", "waiting", "called"])
    .maybeSingle();
  return (data as QueueEntryRow | null) ?? null;
}

/**
 * Create or refresh a held queue slot for a confirmed reservation.
 * Only attaches when:
 * - status is confirmed
 * - reservation date is today (store TZ)
 * - an open queue session exists
 *
 * `joined_at` is the reservation datetime so walk-ins sort around the slot.
 * Initial status is `held` when the time is still upcoming, else `waiting`.
 */
export async function ensureHeldQueueEntryForReservation(
  reservation: ReservationHoldSource,
  nowMs = Date.now(),
): Promise<{ ok: boolean; entryId?: string; skipped?: string }> {
  if (reservation.status !== "confirmed") {
    return { ok: true, skipped: "not_confirmed" };
  }

  const today = reservationToday(new Date(nowMs));
  if (reservation.reservation_date !== today) {
    return { ok: true, skipped: "not_today" };
  }

  const session = await sessionForHold(
    reservation.merchant_id,
    reservation.branch_id,
  );
  if (!session) {
    return { ok: true, skipped: "no_open_session" };
  }

  const joinedAt = reservationAtIso(
    reservation.reservation_date,
    reservation.reservation_time,
  );
  const joinedAtMs = Date.parse(joinedAt);
  const status = joinedAtMs <= nowMs ? "waiting" : "held";
  const timeLabel = reservationTimeLabel(reservation.reservation_time);

  const existing = await existingOpenHold(reservation.id);
  const admin = createAdminClient();

  if (existing) {
    // Keep the same row (same position). Only refresh display fields / activate.
    const patch: Record<string, unknown> = {
      name: reservation.customer_name,
      phone: reservation.customer_phone,
      party_size: reservation.party_size,
      customer_id: reservation.customer_id,
      reservation_time: timeLabel,
      // Never move joined_at once set — that would reshuffle the line.
    };
    if (existing.status === "held" && status === "waiting") {
      patch.status = "waiting";
    }
    await admin.from("queue_entries").update(patch).eq("id", existing.id);
    return { ok: true, entryId: existing.id };
  }

  const { data: entry, error } = await admin
    .from("queue_entries")
    .insert({
      merchant_id: reservation.merchant_id,
      session_id: session.id,
      branch_id: reservation.branch_id ?? session.branch_id,
      customer_id: reservation.customer_id,
      name: reservation.customer_name,
      phone: reservation.customer_phone,
      party_size: reservation.party_size,
      kind: "reservation",
      status,
      reservation_id: reservation.id,
      reservation_time: timeLabel,
      joined_at: joinedAt,
    })
    .select("id")
    .single();

  if (error || !entry) {
    // Unique race: another writer created the hold — treat as success.
    if (error?.code === "23505") {
      const again = await existingOpenHold(reservation.id);
      return { ok: true, entryId: again?.id };
    }
    console.error(
      JSON.stringify({
        scope: "reservation_queue_hold",
        event: "ensure_failed",
        reservationId: reservation.id,
        error: error?.message,
        at: new Date().toISOString(),
      }),
    );
    return { ok: false };
  }

  return { ok: true, entryId: entry.id };
}

/**
 * Release a held/waiting reservation slot (cancel, no-show, suggest, decline).
 * Does not touch called/seated rows mid-service.
 */
export async function releaseQueueHoldForReservation(
  reservationId: string,
  reason: "cancelled" | "no_show" | "declined" | "suggested" | "rescheduled" = "cancelled",
): Promise<{ ok: boolean; released: number }> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("queue_entries")
    .update({ status: "left", left_at: nowIso })
    .eq("reservation_id", reservationId)
    .in("status", ["held", "waiting"])
    .select("id");

  if (error) {
    console.error(
      JSON.stringify({
        scope: "reservation_queue_hold",
        event: "release_failed",
        reservationId,
        reason,
        error: error.message,
        at: nowIso,
      }),
    );
    return { ok: false, released: 0 };
  }

  return { ok: true, released: data?.length ?? 0 };
}

/** Activate held → waiting when reservation time arrives (same joined_at). */
export async function activateDueHeldEntries(
  sessionId: string,
  nowMs = Date.now(),
): Promise<number> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("queue_entries")
    .select("id, kind, status, joined_at")
    .eq("session_id", sessionId)
    .eq("status", "held")
    .eq("kind", "reservation");

  let activated = 0;
  for (const row of rows ?? []) {
    const joinedAtMs = Date.parse(row.joined_at);
    if (
      !shouldActivateHeld(
        {
          kind: "reservation",
          status: "held",
          joinedAtMs: Number.isFinite(joinedAtMs) ? joinedAtMs : nowMs,
        },
        nowMs,
      )
    ) {
      continue;
    }
    const { error } = await admin
      .from("queue_entries")
      .update({ status: "waiting" })
      .eq("id", row.id)
      .eq("status", "held");
    if (!error) activated += 1;
  }
  return activated;
}

type GraceReleaseResult = {
  released: number;
  reservationIds: string[];
};

/**
 * Mark overdue reservation holds as left and set linked bookings to no_show.
 */
export async function releaseExpiredGraceHolds(input: {
  sessionId?: string;
  merchantId?: string;
  nowMs?: number;
}): Promise<GraceReleaseResult> {
  const admin = createAdminClient();
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  let query = admin
    .from("queue_entries")
    .select(
      "id, merchant_id, reservation_id, kind, status, joined_at, session_id",
    )
    .eq("kind", "reservation")
    .in("status", ["held", "waiting"])
    .not("reservation_id", "is", null);

  if (input.sessionId) query = query.eq("session_id", input.sessionId);
  if (input.merchantId) query = query.eq("merchant_id", input.merchantId);

  const { data: rows } = await query;
  if (!rows?.length) return { released: 0, reservationIds: [] };

  const graceByMerchant = new Map<string, number>();
  const reservationIds: string[] = [];
  let released = 0;

  for (const row of rows) {
    let grace = graceByMerchant.get(row.merchant_id);
    if (grace == null) {
      grace = await graceMinutesFor(row.merchant_id);
      graceByMerchant.set(row.merchant_id, grace);
    }
    const joinedAtMs = Date.parse(row.joined_at);
    if (
      !isPastGrace({
        kind: "reservation",
        status: row.status as "held" | "waiting",
        joinedAtMs: Number.isFinite(joinedAtMs) ? joinedAtMs : nowMs,
        graceMinutes: grace,
        nowMs,
      })
    ) {
      continue;
    }

    const { data: updated } = await admin
      .from("queue_entries")
      .update({ status: "left", left_at: nowIso })
      .eq("id", row.id)
      .in("status", ["held", "waiting"])
      .select("id")
      .maybeSingle();
    if (!updated) continue;

    released += 1;
    if (row.reservation_id) {
      reservationIds.push(row.reservation_id);
      await admin
        .from("reservations")
        .update({
          status: "no_show" satisfies ReservationStatus,
          no_show_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", row.reservation_id)
        .eq("status", "confirmed");
    }
  }

  return { released, reservationIds };
}

/**
 * Attach today's confirmed reservations to an open session (on start / board load).
 */
export async function syncTodayReservationHolds(input: {
  merchantId: string;
  sessionId: string;
  branchId?: string | null;
  nowMs?: number;
}): Promise<{ ensured: number; activated: number; graceReleased: number }> {
  const nowMs = input.nowMs ?? Date.now();
  const today = reservationToday(new Date(nowMs));
  const admin = createAdminClient();

  let query = admin
    .from("reservations")
    .select(
      "id, merchant_id, branch_id, customer_id, customer_name, customer_phone, party_size, reservation_date, reservation_time, status",
    )
    .eq("merchant_id", input.merchantId)
    .eq("reservation_date", today)
    .eq("status", "confirmed");

  if (input.branchId) {
    query = query.eq("branch_id", input.branchId);
  }

  const { data: reservations } = await query;
  let ensured = 0;
  for (const row of reservations ?? []) {
    const result = await ensureHeldQueueEntryForReservation(
      row as ReservationHoldSource,
      nowMs,
    );
    if (result.ok && result.entryId) ensured += 1;
  }

  const activated = await activateDueHeldEntries(input.sessionId, nowMs);
  const grace = await releaseExpiredGraceHolds({
    sessionId: input.sessionId,
    nowMs,
  });

  return {
    ensured,
    activated,
    graceReleased: grace.released,
  };
}

/**
 * Cron sweep: activate due holds + release grace for every open session.
 */
export async function processReservationQueueHolds(
  nowMs = Date.now(),
): Promise<{
  sessions: number;
  activated: number;
  graceReleased: number;
  synced: number;
}> {
  const admin = createAdminClient();
  const { data: sessions } = await admin
    .from("queue_sessions")
    .select("id, merchant_id, branch_id")
    .in("status", ["live", "paused"]);

  let activated = 0;
  let graceReleased = 0;
  let synced = 0;

  for (const session of sessions ?? []) {
    const result = await syncTodayReservationHolds({
      merchantId: session.merchant_id,
      sessionId: session.id,
      branchId: session.branch_id,
      nowMs,
    });
    activated += result.activated;
    graceReleased += result.graceReleased;
    synced += result.ensured;
  }

  return {
    sessions: sessions?.length ?? 0,
    activated,
    graceReleased,
    synced,
  };
}
