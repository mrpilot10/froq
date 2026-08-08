/**
 * Client-side persistence for the live queue session + archived history.
 * Keys are scoped per queue URL + branch so multi-branch merchants stay isolated.
 */

import type { MemberRole } from "./types";

export type QueueState = "not_started" | "live" | "paused" | "ended";

/** Teammate who started a session; absent on sessions predating audit tracking. */
export interface QueueSessionActor {
  startedByName?: string;
  startedByRole?: MemberRole;
}

export interface QueueSessionRecord extends QueueSessionActor {
  id: string;
  number: number;
  startedAtMs: number;
  endedAtMs: number;
  served: number;
  left: number;
  avgWait: number;
  longestWait: number;
  /** Real `queue_sessions.id` when known (newer archives). */
  dbSessionId?: string;
}

export interface QueueSessionSnapshot extends QueueSessionActor {
  number: number;
  startedAtMs: number;
}

export interface QueueEndedSummary extends QueueSessionActor {
  number: number;
  startedAtMs: number;
  endedAtMs: number;
  served: number;
  left: number;
  avgWait: number;
  longestWait: number;
  /** Real `queue_sessions.id` from the end-queue response. */
  sessionId?: string;
}

export interface PersistedLiveQueue {
  queueState: QueueState;
  session: QueueSessionSnapshot | null;
  endedSummary: QueueEndedSummary | null;
  lastSessionNumber: number;
}

const HISTORY_PREFIX = "froq.queue.history:";
const MAX_HISTORY = 200;
/** Bump to wipe all client queue keys once after a reset. */
const QUEUE_DATA_EPOCH = "3";
const QUEUE_DATA_EPOCH_KEY = "froq.queue.dataEpoch";

/**
 * Remove all client-side queue management data (sessions, history, tickets, settings).
 * Safe to call from the browser; no-ops on the server.
 */
export function clearAllQueueClientData(): void {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith("froq.queue.")) keys.push(key);
  }
  for (const key of keys) {
    window.localStorage.removeItem(key);
  }
  window.localStorage.setItem(QUEUE_DATA_EPOCH_KEY, QUEUE_DATA_EPOCH);
  window.dispatchEvent(new CustomEvent("froq:queue-history"));
  window.dispatchEvent(new CustomEvent("froq:queue-settings"));
}

/** Run once per epoch so merchants pick up a clean slate after a data wipe. */
export function ensureQueueDataEpoch(): boolean {
  if (typeof window === "undefined") return false;
  const current = window.localStorage.getItem(QUEUE_DATA_EPOCH_KEY);
  if (current === QUEUE_DATA_EPOCH) return false;
  clearAllQueueClientData();
  return true;
}

export function queueSessionStorageKey(queueUrl: string, branchId: string | null): string {
  return `froq.queue.session:${queueUrl}:${branchId ?? "all"}`;
}

export function queueHistoryStorageKey(queueUrl: string, branchId: string | null): string {
  return `${HISTORY_PREFIX}${queueUrl}:${branchId ?? "all"}`;
}

function isQueueState(value: unknown): value is QueueState {
  return (
    value === "not_started" ||
    value === "live" ||
    value === "paused" ||
    value === "ended"
  );
}

export function readLiveQueueSnapshot(
  queueUrl: string,
  branchId: string | null,
): PersistedLiveQueue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(queueSessionStorageKey(queueUrl, branchId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<PersistedLiveQueue>;
    if (!saved || !isQueueState(saved.queueState)) return null;
    return {
      queueState: saved.queueState,
      session: saved.session ?? null,
      endedSummary: saved.endedSummary ?? null,
      lastSessionNumber: Math.max(0, Math.round(Number(saved.lastSessionNumber) || 0)),
    };
  } catch {
    return null;
  }
}

export function readQueueHistory(
  queueUrl: string,
  branchId: string | null,
): QueueSessionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(queueHistoryStorageKey(queueUrl, branchId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is QueueSessionRecord => {
        if (!row || typeof row !== "object") return false;
        const r = row as QueueSessionRecord;
        return (
          typeof r.id === "string" &&
          typeof r.number === "number" &&
          typeof r.startedAtMs === "number" &&
          typeof r.endedAtMs === "number"
        );
      })
      .sort((a, b) => b.endedAtMs - a.endedAtMs);
  } catch {
    return [];
  }
}

export function archiveQueueSession(
  queueUrl: string,
  branchId: string | null,
  summary: Omit<QueueSessionRecord, "id"> & { sessionId?: string },
): QueueSessionRecord {
  const dbSessionId = summary.sessionId ?? summary.dbSessionId;
  const record: QueueSessionRecord = {
    id: dbSessionId ?? `qs-${summary.number}-${summary.endedAtMs}`,
    number: summary.number,
    startedAtMs: summary.startedAtMs,
    endedAtMs: summary.endedAtMs,
    served: summary.served,
    left: summary.left,
    avgWait: summary.avgWait,
    longestWait: summary.longestWait,
    startedByName: summary.startedByName,
    startedByRole: summary.startedByRole,
    ...(dbSessionId ? { dbSessionId } : {}),
  };

  if (typeof window === "undefined") return record;

  try {
    const existing = readQueueHistory(queueUrl, branchId);
    const next = [
      record,
      ...existing.filter(
        (s) =>
          !(s.number === record.number && s.endedAtMs === record.endedAtMs) &&
          s.id !== record.id &&
          !(dbSessionId && s.dbSessionId === dbSessionId),
      ),
    ].slice(0, MAX_HISTORY);
    window.localStorage.setItem(
      queueHistoryStorageKey(queueUrl, branchId),
      JSON.stringify(next),
    );
    window.dispatchEvent(
      new CustomEvent("froq:queue-history", {
        detail: { queueUrl, branchId },
      }),
    );
  } catch {
    /* ignore quota */
  }

  return record;
}

/**
 * Drop a deleted session from local history. Matches on the db id when the
 * record has one and falls back to number + end time for archives written
 * before session ids were stored.
 */
export function removeQueueSessionRecord(
  queueUrl: string,
  branchId: string | null,
  target: Pick<QueueSessionRecord, "id" | "number" | "endedAtMs"> & {
    dbSessionId?: string;
  },
): void {
  if (typeof window === "undefined") return;

  const sameSession = (
    candidate: { dbSessionId?: string; id?: string; number: number; endedAtMs: number },
  ) =>
    (target.dbSessionId != null && candidate.dbSessionId === target.dbSessionId) ||
    (candidate.id != null && candidate.id === target.id) ||
    (candidate.number === target.number && candidate.endedAtMs === target.endedAtMs);

  try {
    const next = readQueueHistory(queueUrl, branchId).filter(
      (session) => !sameSession(session),
    );
    window.localStorage.setItem(
      queueHistoryStorageKey(queueUrl, branchId),
      JSON.stringify(next),
    );

    // A just-ended session also lives on the live snapshot, where it drives the
    // home screen recap. Without clearing it there the deleted session reappears
    // the next time History rebuilds its view.
    const snapshot = readLiveQueueSnapshot(queueUrl, branchId);
    const summary = snapshot?.endedSummary;
    if (
      snapshot &&
      summary &&
      sameSession({ dbSessionId: summary.sessionId, ...summary })
    ) {
      window.localStorage.setItem(
        queueSessionStorageKey(queueUrl, branchId),
        JSON.stringify({ ...snapshot, endedSummary: null }),
      );
    }

    window.dispatchEvent(
      new CustomEvent("froq:queue-history", { detail: { queueUrl, branchId } }),
    );
  } catch {
    /* ignore quota */
  }
}

/** Archived sessions plus the current ended summary if it isn't archived yet. */
export function loadQueueHistoryView(
  queueUrl: string,
  branchId: string | null,
): {
  sessions: QueueSessionRecord[];
  live:
    | (QueueSessionActor & {
        number: number;
        startedAtMs: number;
        state: "live" | "paused";
      })
    | null;
} {
  const archived = readQueueHistory(queueUrl, branchId);
  const liveSnap = readLiveQueueSnapshot(queueUrl, branchId);

  let sessions = archived;
  if (liveSnap?.endedSummary) {
    const summary = liveSnap.endedSummary;
    const already = archived.some(
      (s) => s.number === summary.number && s.endedAtMs === summary.endedAtMs,
    );
    if (!already) {
      sessions = [
        {
          id: summary.sessionId ?? `qs-current-${summary.number}-${summary.endedAtMs}`,
          number: summary.number,
          startedAtMs: summary.startedAtMs,
          endedAtMs: summary.endedAtMs,
          served: summary.served,
          left: summary.left,
          avgWait: summary.avgWait,
          longestWait: summary.longestWait,
          startedByName: summary.startedByName,
          startedByRole: summary.startedByRole,
          ...(summary.sessionId ? { dbSessionId: summary.sessionId } : {}),
        },
        ...archived,
      ];
    }
  }

  const live =
    liveSnap &&
    (liveSnap.queueState === "live" || liveSnap.queueState === "paused") &&
    liveSnap.session
      ? {
          number: liveSnap.session.number,
          startedAtMs: liveSnap.session.startedAtMs,
          state: liveSnap.queueState,
          startedByName: liveSnap.session.startedByName,
          startedByRole: liveSnap.session.startedByRole,
        }
      : null;

  return { sessions, live };
}

/**
 * Branch ids that have local queue history/session keys for this queue URL.
 * `null` in read APIs maps to the literal `:all` bucket — that is NOT an
 * aggregate of per-branch keys, so callers must never treat `null` as "sum all".
 */
function discoverQueueLocalBranchIds(queueUrl: string): string[] {
  if (typeof window === "undefined") return [];
  const prefixes = [
    `${HISTORY_PREFIX}${queueUrl}:`,
    `froq.queue.session:${queueUrl}:`,
  ];
  const ids = new Set<string>();
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    for (const prefix of prefixes) {
      if (!key.startsWith(prefix)) continue;
      const suffix = key.slice(prefix.length);
      if (suffix && suffix !== "all") ids.add(suffix);
    }
  }
  return Array.from(ids);
}

/**
 * Merge archived (+ just-ended) sessions across every branch. Dedupes by
 * db/session id so the same archive never counts twice.
 */
export function loadQueueHistoryAcrossBranches(
  queueUrl: string,
  branchIds: ReadonlyArray<string | null | undefined> = [],
): QueueSessionRecord[] {
  const ids = new Set<string | null>();
  for (const id of branchIds) {
    if (id) ids.add(id);
  }
  for (const id of discoverQueueLocalBranchIds(queueUrl)) {
    ids.add(id);
  }
  // Legacy / mistaken `:all` bucket — include if present, never as a substitute
  // for scanning real branch keys.
  ids.add(null);

  const seen = new Set<string>();
  const sessions: QueueSessionRecord[] = [];
  for (const branchId of ids) {
    const { sessions: branchSessions } = loadQueueHistoryView(queueUrl, branchId);
    for (const session of branchSessions) {
      const key =
        session.dbSessionId ??
        `${session.id}:${session.number}:${session.endedAtMs}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sessions.push(session);
    }
  }
  return sessions.sort((a, b) => b.endedAtMs - a.endedAtMs);
}

/** Trial = from trial start; paid = calendar month start. */
export function queueUsageWindowStartMs(input: {
  now?: number;
  onTrial: boolean;
  trialStartedAt?: string | null;
}): number {
  const now = input.now ?? Date.now();
  if (input.onTrial && input.trialStartedAt) {
    const trialStart = Date.parse(input.trialStartedAt);
    if (!Number.isNaN(trialStart)) return trialStart;
  }
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Plan meter: served + left across ALL branches in the billing/trial window.
 */
export function countQueueTicketsUsedInWindow(
  queueUrl: string,
  branchIds: ReadonlyArray<string | null | undefined>,
  windowStartMs: number,
): number {
  return loadQueueHistoryAcrossBranches(queueUrl, branchIds)
    .filter((s) => s.endedAtMs >= windowStartMs)
    .reduce((sum, s) => sum + (Number(s.served) || 0) + (Number(s.left) || 0), 0);
}
