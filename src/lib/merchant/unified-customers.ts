import { toCanonicalPhone } from "@/lib/auth/otp/phone";
import type { CardStatus } from "@/lib/supabase/database.types";
import type { ReservationStatus } from "@/lib/merchant/reservations";
import { reservationStartMs } from "@/lib/merchant/reservations";

/** Loyalty side of a person, from the customer_overview view. */
export interface UnifiedLoyaltyStats {
  stamps: number;
  totalStamps: number;
  visits: number;
  rewardsClaimed: number;
  status: CardStatus;
  lastVisitMs: number | null;
}

/** Queue side of a person, rolled up across every session. */
export interface UnifiedQueueStats {
  /** Times they joined a waitlist. */
  visits: number;
  seated: number;
  left: number;
  /** Total covers across those visits. */
  guests: number;
  /** Average wait to seated, in whole minutes. Null when never seated. */
  avgWaitMinutes: number | null;
  lastJoinedMs: number | null;
  /** Outcome of their most recent queue visit. */
  lastStatus: "held" | "waiting" | "called" | "seated" | "left" | null;
}

/** Reservation side of a person, rolled up across every booking. */
export interface UnifiedReservationStats {
  /** Times they booked a table. */
  bookings: number;
  completed: number;
  cancelled: number;
  noShows: number;
  declined: number;
  /** Total covers across those bookings. */
  guests: number;
  /** Most recent dining slot (date + time), not when they requested. */
  lastBookedMs: number | null;
  lastStatus: ReservationStatus | null;
}

/** Digital menu side of a person (dining sessions / guest verification). */
export interface UnifiedMenuStats {
  /** Distinct dining / capture sessions. */
  visits: number;
  /** Sessions tagged as guest phone verification on the menu. */
  specialOffers: number;
  lastSeenMs: number | null;
  lastPartySize: number | null;
}

export type CustomerSource = "loyalty" | "queue" | "reservation" | "menu" | "both";

export interface UnifiedCustomer {
  /** Customer id when there is one, else a phone-derived key for product-only guests. */
  key: string;
  customerId: string | null;
  name: string;
  phone: string;
  email: string | null;
  banned: boolean;
  memberSinceMs: number | null;
  loyalty: UnifiedLoyaltyStats | null;
  queue: UnifiedQueueStats | null;
  reservation: UnifiedReservationStats | null;
  menu: UnifiedMenuStats | null;
  source: CustomerSource;
  /** Most recent activity in any product; drives the default sort. */
  lastSeenMs: number | null;
}

export interface LoyaltyCustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  banned: boolean;
  member_since: string | null;
  stamps: number;
  total_stamps: number;
  status: CardStatus;
  lifetime_visits: number;
  rewards_claimed: number;
  last_visit: string | null;
}

export interface QueueGuestRow {
  customer_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  party_size: number;
  status: "held" | "waiting" | "called" | "seated" | "left";
  joined_at: string;
  seated_at: string | null;
}

export interface ReservationGuestRow {
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  status: ReservationStatus;
  reservation_date: string;
  reservation_time: string;
  created_at: string;
}

export interface MenuGuestRow {
  customer_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  party_size: number | null;
  opened_at: string;
  notes: string | null;
}

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function later(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * Stable identity for a guest who has no customer row yet. Phones are stored
 * in mixed forms (`+919…`, `919…`, bare 10-digit), so canonicalise before
 * using one as a merge key.
 */
function phoneKey(phone: string): string | null {
  const canonical = toCanonicalPhone(phone);
  return canonical ? `phone:${canonical}` : null;
}

function emptyPerson(partial: {
  key: string;
  customerId: string | null;
  name: string;
  phone: string;
  email: string | null;
  banned?: boolean;
  memberSinceMs?: number | null;
  source: CustomerSource;
}): UnifiedCustomer {
  return {
    key: partial.key,
    customerId: partial.customerId,
    name: partial.name,
    phone: partial.phone,
    email: partial.email,
    banned: partial.banned ?? false,
    memberSinceMs: partial.memberSinceMs ?? null,
    loyalty: null,
    queue: null,
    reservation: null,
    menu: null,
    source: partial.source,
    lastSeenMs: null,
  };
}

function computeSource(entry: UnifiedCustomer): CustomerSource {
  const products = [entry.loyalty, entry.queue, entry.reservation, entry.menu].filter(
    Boolean,
  ).length;
  if (products > 1) return "both";
  if (entry.menu) return "menu";
  if (entry.reservation) return "reservation";
  if (entry.queue) return "queue";
  return "loyalty";
}

/**
 * One row per person across loyalty, queue and reservations.
 *
 * Queue / reservation rows carry a `customer_id` whenever the guest was matched
 * to a customer record, which is the reliable join. Entries without one
 * (legacy rows) fall back to a canonicalised phone match, and only become
 * their own row when that fails too.
 */
export function mergeUnifiedCustomers(input: {
  loyalty: LoyaltyCustomerRow[];
  queue: QueueGuestRow[];
  reservations?: ReservationGuestRow[];
  menu?: MenuGuestRow[];
}): UnifiedCustomer[] {
  const byKey = new Map<string, UnifiedCustomer>();
  const keyByPhone = new Map<string, string>();

  for (const row of input.loyalty) {
    const lastVisitMs = timeOf(row.last_visit);
    const entry = emptyPerson({
      key: row.id,
      customerId: row.id,
      name: row.name?.trim() || "Unnamed",
      phone: row.phone ?? "",
      email: row.email,
      banned: Boolean(row.banned),
      memberSinceMs: timeOf(row.member_since),
      source: "loyalty",
    });
    entry.loyalty = {
      stamps: Number(row.stamps) || 0,
      totalStamps: Number(row.total_stamps) || 0,
      visits: Number(row.lifetime_visits) || 0,
      rewardsClaimed: Number(row.rewards_claimed) || 0,
      status: row.status,
      lastVisitMs,
    };
    entry.lastSeenMs = lastVisitMs;
    byKey.set(entry.key, entry);
    const phone = phoneKey(entry.phone);
    if (phone) keyByPhone.set(phone, entry.key);
  }

  const waitAcc = new Map<string, { sum: number; count: number }>();

  for (const row of input.queue) {
    const phone = phoneKey(row.phone);
    const key =
      (row.customer_id && byKey.has(row.customer_id) ? row.customer_id : null) ??
      (phone ? keyByPhone.get(phone) : null) ??
      row.customer_id ??
      phone ??
      `guest:${row.name}:${row.phone}`;

    let entry = byKey.get(key);
    if (!entry) {
      entry = emptyPerson({
        key,
        customerId: row.customer_id,
        name: row.name?.trim() || "Guest",
        phone: row.phone ?? "",
        email: row.email,
        source: "queue",
      });
      byKey.set(key, entry);
      if (phone) keyByPhone.set(phone, key);
    }

    const joinedMs = timeOf(row.joined_at);
    const seatedMs = timeOf(row.seated_at);
    const queue = entry.queue ?? {
      visits: 0,
      seated: 0,
      left: 0,
      guests: 0,
      avgWaitMinutes: null,
      lastJoinedMs: null,
      lastStatus: null,
    };
    queue.visits += 1;
    queue.guests += Number(row.party_size) || 0;
    if (row.status === "seated") queue.seated += 1;
    if (row.status === "left") queue.left += 1;

    // Entries are fetched newest-first; keep the first (most recent) outcome.
    if (queue.lastJoinedMs == null || (joinedMs != null && joinedMs >= queue.lastJoinedMs)) {
      queue.lastJoinedMs = later(queue.lastJoinedMs, joinedMs);
      queue.lastStatus = row.status;
    } else {
      queue.lastJoinedMs = later(queue.lastJoinedMs, joinedMs);
    }

    if (joinedMs != null && seatedMs != null && seatedMs >= joinedMs) {
      const waitMins = Math.max(0, Math.round((seatedMs - joinedMs) / 60_000));
      const acc = waitAcc.get(key) ?? { sum: 0, count: 0 };
      acc.sum += waitMins;
      acc.count += 1;
      waitAcc.set(key, acc);
      queue.avgWaitMinutes = Math.round(acc.sum / acc.count);
    }

    entry.queue = queue;
    entry.source = computeSource(entry);
    entry.lastSeenMs = later(entry.lastSeenMs, joinedMs);
  }

  for (const row of input.reservations ?? []) {
    const phone = phoneKey(row.customer_phone);
    const key =
      (row.customer_id && byKey.has(row.customer_id) ? row.customer_id : null) ??
      (phone ? keyByPhone.get(phone) : null) ??
      row.customer_id ??
      phone ??
      `guest:${row.customer_name}:${row.customer_phone}`;

    let entry = byKey.get(key);
    if (!entry) {
      entry = emptyPerson({
        key,
        customerId: row.customer_id,
        name: row.customer_name?.trim() || "Guest",
        phone: row.customer_phone ?? "",
        email: null,
        source: "reservation",
      });
      byKey.set(key, entry);
      if (phone) keyByPhone.set(phone, key);
    }

    const bookedMs = (() => {
      const fromSlot = reservationStartMs(row.reservation_date, row.reservation_time);
      if (Number.isFinite(fromSlot)) return fromSlot;
      return timeOf(row.created_at);
    })();

    const reservation = entry.reservation ?? {
      bookings: 0,
      completed: 0,
      cancelled: 0,
      noShows: 0,
      declined: 0,
      guests: 0,
      lastBookedMs: null,
      lastStatus: null,
    };
    reservation.bookings += 1;
    reservation.guests += Number(row.party_size) || 0;
    if (row.status === "completed") reservation.completed += 1;
    if (row.status === "cancelled") reservation.cancelled += 1;
    if (row.status === "no_show") reservation.noShows += 1;
    if (row.status === "declined") reservation.declined += 1;

    // Newest dining slot wins as "last" (rows arrive newest-first by created_at,
    // but a future booking can be older than a past one on created_at).
    if (
      reservation.lastBookedMs == null ||
      (bookedMs != null && bookedMs >= reservation.lastBookedMs)
    ) {
      reservation.lastBookedMs = later(reservation.lastBookedMs, bookedMs);
      reservation.lastStatus = row.status;
    } else {
      reservation.lastBookedMs = later(reservation.lastBookedMs, bookedMs);
    }

    entry.reservation = reservation;
    entry.source = computeSource(entry);
    entry.lastSeenMs = later(entry.lastSeenMs, bookedMs);
  }

  for (const row of input.menu ?? []) {
    const phone = phoneKey(row.guest_phone ?? "");
    const name = row.guest_name?.trim() || "Guest";
    const key =
      (row.customer_id && byKey.has(row.customer_id) ? row.customer_id : null) ??
      (phone ? keyByPhone.get(phone) : null) ??
      row.customer_id ??
      phone ??
      `menu:${name}:${row.guest_phone ?? ""}`;

    let entry = byKey.get(key);
    if (!entry) {
      entry = emptyPerson({
        key,
        customerId: row.customer_id,
        name,
        phone: row.guest_phone ?? "",
        email: null,
        source: "menu",
      });
      byKey.set(key, entry);
      if (phone) keyByPhone.set(phone, key);
    } else if ((!entry.name || entry.name === "Guest") && name !== "Guest") {
      entry.name = name;
    }

    const openedMs = timeOf(row.opened_at);
    const menu = entry.menu ?? {
      visits: 0,
      specialOffers: 0,
      lastSeenMs: null,
      lastPartySize: null,
    };
    menu.visits += 1;
    if (row.notes === "special_offers_capture") menu.specialOffers += 1;
    if (menu.lastSeenMs == null || (openedMs != null && openedMs >= menu.lastSeenMs)) {
      menu.lastSeenMs = later(menu.lastSeenMs, openedMs);
      menu.lastPartySize = row.party_size ?? menu.lastPartySize;
    } else {
      menu.lastSeenMs = later(menu.lastSeenMs, openedMs);
    }

    entry.menu = menu;
    entry.source = computeSource(entry);
    entry.lastSeenMs = later(entry.lastSeenMs, openedMs);
  }

  return [...byKey.values()];
}
