import "server-only";

import { callAcceptDeadlineMs } from "@/lib/merchant/queue-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  MemberRole,
  QueueEntryRow,
  QueueSessionRow,
} from "@/lib/supabase/database.types";

export type LiveQueueEntry = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  partySize: number;
  joinedAtMs: number;
  calledAtMs?: number;
  acceptByMs?: number;
  seatedAtMs?: number;
  leftAtMs?: number;
  status: "held" | "waiting" | "called" | "seated" | "left";
  kind: "walkin" | "reservation";
  reservationTime?: string;
  reservationId?: string;
  /** Assigned table when seated. */
  tableNumber?: number;
  diningTableId?: string;
  /** How many of the 3 call reminders have been delivered (0–3). */
  remindersSent?: number;
};

export type LiveQueueSession = {
  id: string;
  number: number;
  status: "live" | "paused" | "ended";
  startedAtMs: number;
  endedAtMs?: number;
  /** Teammate who started the session — absent on sessions created before audit tracking. */
  startedByName?: string;
  startedByRole?: MemberRole;
};

function ms(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const n = new Date(iso).getTime();
  return Number.isFinite(n) ? n : undefined;
}

export function mapQueueEntryRow(row: QueueEntryRow): LiveQueueEntry {
  const calledAtMs = ms(row.called_at);
  // Prefer the fixed 10-minute call window over any stale accept_by in the DB.
  const acceptByMs =
    calledAtMs != null ? callAcceptDeadlineMs(calledAtMs) : ms(row.accept_by);
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    partySize: row.party_size,
    joinedAtMs: ms(row.joined_at) ?? Date.now(),
    calledAtMs,
    acceptByMs,
    seatedAtMs: ms(row.seated_at),
    leftAtMs: ms(row.left_at),
    status: row.status,
    kind: row.kind,
    reservationTime: row.reservation_time ?? undefined,
    reservationId: row.reservation_id ?? undefined,
    tableNumber: row.table_number ?? undefined,
    diningTableId: row.dining_table_id ?? undefined,
  };
}

export function mapQueueSessionRow(row: QueueSessionRow): LiveQueueSession {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    startedAtMs: ms(row.started_at) ?? Date.now(),
    endedAtMs: ms(row.ended_at),
    startedByName: row.started_by_name ?? undefined,
    startedByRole: row.started_by_role ?? undefined,
  };
}

/**
 * Open (live/paused) session for one branch — or legacy unscoped (`branch_id` null)
 * when `branchId` is omitted.
 *
 * Never falls back across branches. A Gala lookup must not return WING-E's
 * session (and vice versa); that was coupling Start/End/hydrate across branches.
 */
export async function getOpenQueueSession(
  merchantId: string,
  branchId?: string | null,
): Promise<QueueSessionRow | null> {
  const admin = createAdminClient();

  if (branchId) {
    const { data: branched } = await admin
      .from("queue_sessions")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("branch_id", branchId)
      .in("status", ["live", "paused"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (branched as QueueSessionRow | null) ?? null;
  }

  // No branch: only legacy merchant-wide (null branch_id) sessions.
  // Do not pick an arbitrary branched session — that couples multi-branch queues.
  const { data: unscoped } = await admin
    .from("queue_sessions")
    .select("*")
    .eq("merchant_id", merchantId)
    .is("branch_id", null)
    .in("status", ["live", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (unscoped as QueueSessionRow | null) ?? null;
}

/** Default branch id for a merchant, or the oldest branch if none is marked default. */
export async function resolveDefaultBranchId(
  merchantId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data: preferred } = await admin
    .from("branches")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("is_default", true)
    .maybeSingle();
  if (preferred?.id) return preferred.id;

  const { data: anyBranch } = await admin
    .from("branches")
    .select("id")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return anyBranch?.id ?? null;
}

/**
 * Resolve which branch a public queue join / gate should use.
 * `branchSlug` from `?b=` wins; otherwise the merchant default branch.
 */
export async function resolveJoinBranchId(
  merchantId: string,
  branchSlug?: string | null,
): Promise<string | null> {
  const slug = branchSlug?.trim();
  if (slug) {
    const admin = createAdminClient();
    const { data: branch } = await admin
      .from("branches")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("slug", slug)
      .maybeSingle();
    if (branch?.id) return branch.id;
  }
  return resolveDefaultBranchId(merchantId);
}

/**
 * Branch id for merchant Start queue.
 * Multi-branch merchants must pass an explicit branch; single-branch falls back
 * to that branch so we never create a null `branch_id` global session.
 */
export async function resolveStartBranchId(
  merchantId: string,
  requestedBranchId?: string | null,
): Promise<{ ok: true; branchId: string | null } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: branches } = await admin
    .from("branches")
    .select("id")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: true });
  const list = branches ?? [];

  if (requestedBranchId) {
    if (!list.some((b) => b.id === requestedBranchId)) {
      return { ok: false, error: "Invalid branch." };
    }
    return { ok: true, branchId: requestedBranchId };
  }

  if (list.length > 1) {
    return { ok: false, error: "Select a branch to start its queue." };
  }
  if (list.length === 1) {
    return { ok: true, branchId: list[0].id };
  }
  // Legacy merchants with no branch rows — allow unscoped session.
  return { ok: true, branchId: null };
}

export async function listSessionEntries(sessionId: string): Promise<QueueEntryRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("queue_entries")
    .select("*")
    .eq("session_id", sessionId)
    .order("joined_at", { ascending: true });
  return (data as QueueEntryRow[] | null) ?? [];
}

/** Statuses that still occupy a place-in-line slot on the live board. */
export const ACTIVE_LINE_STATUSES = ["held", "waiting", "called"] as const;

/**
 * Count parties on the line (held + waiting + called) with joined_at <= before.
 * Used for walk-in / reservation queue position including held slots ahead.
 */
export async function countLineAhead(
  sessionId: string,
  beforeJoinedAt: string,
): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("queue_entries")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .in("status", [...ACTIVE_LINE_STATUSES])
    .lte("joined_at", beforeJoinedAt);
  return count ?? 0;
}

export async function countWaitingAhead(
  sessionId: string,
  beforeJoinedAt: string,
): Promise<number> {
  return countLineAhead(sessionId, beforeJoinedAt);
}

/**
 * Stable session ticket # — join order among *all* entries (including seated/left).
 * Do not show this as “place in line”; use {@link liveQueuePosition} for that.
 */
export async function sessionTicketNumber(
  sessionId: string,
  joinedAt: string,
): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("queue_entries")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .lte("joined_at", joinedAt);
  return Math.max(1, count ?? 1);
}

/**
 * 1-based place in line among held + waiting + called guests.
 * Seated / left do not count. Held reservation slots block places ahead so
 * walk-in ETAs include upcoming confirmed reservations.
 */
export async function liveQueuePosition(
  sessionId: string,
  joinedAt: string,
): Promise<number> {
  return Math.max(1, await countLineAhead(sessionId, joinedAt));
}
