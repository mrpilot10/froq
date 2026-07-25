/**
 * Client-side persistence for the live queue session + archived history.
 * Keys are scoped per queue URL + branch so multi-branch merchants stay isolated.
 */

export type QueueState = "not_started" | "live" | "paused" | "ended";

export interface QueueSessionRecord {
  id: string;
  number: number;
  startedAtMs: number;
  endedAtMs: number;
  served: number;
  left: number;
  avgWait: number;
  longestWait: number;
}

export interface QueueSessionSnapshot {
  number: number;
  startedAtMs: number;
}

export interface QueueEndedSummary {
  number: number;
  startedAtMs: number;
  endedAtMs: number;
  served: number;
  left: number;
  avgWait: number;
  longestWait: number;
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
const QUEUE_DATA_EPOCH = "2";
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
  summary: Omit<QueueSessionRecord, "id">,
): QueueSessionRecord {
  const record: QueueSessionRecord = {
    id: `qs-${summary.number}-${summary.endedAtMs}`,
    ...summary,
  };

  if (typeof window === "undefined") return record;

  try {
    const existing = readQueueHistory(queueUrl, branchId);
    const next = [
      record,
      ...existing.filter(
        (s) =>
          !(s.number === record.number && s.endedAtMs === record.endedAtMs) &&
          s.id !== record.id,
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

/** Archived sessions plus the current ended summary if it isn't archived yet. */
export function loadQueueHistoryView(
  queueUrl: string,
  branchId: string | null,
): {
  sessions: QueueSessionRecord[];
  live: { number: number; startedAtMs: number; state: "live" | "paused" } | null;
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
          id: `qs-current-${summary.number}-${summary.endedAtMs}`,
          number: summary.number,
          startedAtMs: summary.startedAtMs,
          endedAtMs: summary.endedAtMs,
          served: summary.served,
          left: summary.left,
          avgWait: summary.avgWait,
          longestWait: summary.longestWait,
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
        }
      : null;

  return { sessions, live };
}
