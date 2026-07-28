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
  status: "waiting" | "called" | "seated" | "left";
  kind: "walkin" | "reservation";
  reservationTime?: string;
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
    if (branched) return branched as QueueSessionRow;
  }

  // Prefer an unscoped session, then any open session for this merchant
  // (QR joins often omit branch while the dashboard has one selected).
  const { data: unscoped } = await admin
    .from("queue_sessions")
    .select("*")
    .eq("merchant_id", merchantId)
    .is("branch_id", null)
    .in("status", ["live", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (unscoped) return unscoped as QueueSessionRow;

  const { data: anyOpen } = await admin
    .from("queue_sessions")
    .select("*")
    .eq("merchant_id", merchantId)
    .in("status", ["live", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (anyOpen as QueueSessionRow | null) ?? null;
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

export async function countWaitingAhead(
  sessionId: string,
  beforeJoinedAt: string,
): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("queue_entries")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("status", "waiting")
    .lt("joined_at", beforeJoinedAt);
  return count ?? 0;
}
