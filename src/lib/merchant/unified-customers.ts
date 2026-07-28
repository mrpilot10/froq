import { toCanonicalPhone } from "@/lib/auth/otp/phone";
import type { CardStatus } from "@/lib/supabase/database.types";

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
}

export type CustomerSource = "both" | "loyalty" | "queue";

export interface UnifiedCustomer {
  /** Customer id when there is one, else a phone-derived key for queue-only guests. */
  key: string;
  customerId: string | null;
  name: string;
  phone: string;
  email: string | null;
  banned: boolean;
  memberSinceMs: number | null;
  loyalty: UnifiedLoyaltyStats | null;
  queue: UnifiedQueueStats | null;
  source: CustomerSource;
  /** Most recent activity in either product; drives the default sort. */
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
  status: "waiting" | "called" | "seated" | "left";
  joined_at: string;
  seated_at: string | null;
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
 * Stable identity for a queue guest who has no customer row yet. Phones are
 * stored in mixed forms (`+919…`, `919…`, bare 10-digit), so canonicalise
 * before using one as a merge key.
 */
function phoneKey(phone: string): string | null {
  const canonical = toCanonicalPhone(phone);
  return canonical ? `phone:${canonical}` : null;
}

/**
 * One row per person across both products.
 *
 * Queue entries carry a `customer_id` whenever the guest was matched to a
 * customer record, which is the reliable join. Entries without one (legacy
 * rows) fall back to a canonicalised phone match against the loyalty list, and
 * only become their own row when that fails too.
 */
export function mergeUnifiedCustomers(input: {
  loyalty: LoyaltyCustomerRow[];
  queue: QueueGuestRow[];
}): UnifiedCustomer[] {
  const byKey = new Map<string, UnifiedCustomer>();
  const keyByPhone = new Map<string, string>();

  for (const row of input.loyalty) {
    const lastVisitMs = timeOf(row.last_visit);
    const entry: UnifiedCustomer = {
      key: row.id,
      customerId: row.id,
      name: row.name?.trim() || "Unnamed",
      phone: row.phone ?? "",
      email: row.email,
      banned: Boolean(row.banned),
      memberSinceMs: timeOf(row.member_since),
      loyalty: {
        stamps: Number(row.stamps) || 0,
        totalStamps: Number(row.total_stamps) || 0,
        visits: Number(row.lifetime_visits) || 0,
        rewardsClaimed: Number(row.rewards_claimed) || 0,
        status: row.status,
        lastVisitMs,
      },
      queue: null,
      source: "loyalty",
      lastSeenMs: lastVisitMs,
    };
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
      entry = {
        key,
        customerId: row.customer_id,
        name: row.name?.trim() || "Guest",
        phone: row.phone ?? "",
        email: row.email,
        banned: false,
        memberSinceMs: null,
        loyalty: null,
        queue: null,
        source: "queue",
        lastSeenMs: null,
      };
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
    };
    queue.visits += 1;
    queue.guests += Number(row.party_size) || 0;
    if (row.status === "seated") queue.seated += 1;
    if (row.status === "left") queue.left += 1;
    queue.lastJoinedMs = later(queue.lastJoinedMs, joinedMs);

    // Wait = join → seated. Only seated visits contribute to the average.
    if (joinedMs != null && seatedMs != null && seatedMs >= joinedMs) {
      const waitMins = Math.max(0, Math.round((seatedMs - joinedMs) / 60_000));
      const acc = waitAcc.get(key) ?? { sum: 0, count: 0 };
      acc.sum += waitMins;
      acc.count += 1;
      waitAcc.set(key, acc);
      queue.avgWaitMinutes = Math.round(acc.sum / acc.count);
    }

    entry.queue = queue;
    entry.source = entry.loyalty ? "both" : "queue";
    entry.lastSeenMs = later(entry.lastSeenMs, joinedMs);
  }

  return [...byKey.values()];
}
