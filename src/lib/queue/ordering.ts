/**
 * Pure queue ordering + ETA helpers for walk-ins and held reservations.
 *
 * Effective service time:
 * - Walk-in: join time
 * - Reservation: reservation datetime (stored as joined_at on held entries)
 *
 * Walk-ins insert *around* held reservation slots — they never push a
 * reservation's joined_at later.
 */

export type QueueLineStatus = "held" | "waiting" | "called" | "seated" | "left";
export type QueueLineKind = "walkin" | "reservation";

export type QueueOrderable = {
  id: string;
  status: QueueLineStatus;
  kind: QueueLineKind;
  /** Epoch ms — walk-in join time, or reservation datetime for holds. */
  joinedAtMs: number;
};

/** Statuses that still occupy a line slot (affect position + ETA). */
export const QUEUE_LINE_STATUSES: ReadonlySet<QueueLineStatus> = new Set([
  "held",
  "waiting",
  "called",
]);

export function isOnQueueLine(status: QueueLineStatus): boolean {
  return QUEUE_LINE_STATUSES.has(status);
}

/** Effective service time for ordering. */
export function effectiveServiceMs(entry: Pick<QueueOrderable, "joinedAtMs">): number {
  return entry.joinedAtMs;
}

/**
 * Ascending by effective service time; stable tie-break on id so two parties
 * with the same timestamp keep a deterministic order.
 */
export function compareQueueOrder(a: QueueOrderable, b: QueueOrderable): number {
  const diff = effectiveServiceMs(a) - effectiveServiceMs(b);
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortQueueEntries<T extends QueueOrderable>(entries: T[]): T[] {
  return [...entries].sort(compareQueueOrder);
}

/** Parties still on the line, ordered by effective service time. */
export function lineEntries<T extends QueueOrderable>(entries: T[]): T[] {
  return sortQueueEntries(entries.filter((e) => isOnQueueLine(e.status)));
}

/**
 * 1-based position among everyone still on the line (held + waiting + called).
 * Returns null when the entry is not on the line.
 */
export function queuePositionAmong(
  entries: QueueOrderable[],
  entryId: string,
): number | null {
  const line = lineEntries(entries);
  const index = line.findIndex((e) => e.id === entryId);
  return index < 0 ? null : index + 1;
}

/**
 * How many line parties sit strictly ahead of `entryId` (same ordering).
 * Used for ETA: wait ≈ ahead × minutesPerParty (or (ahead+1) when including self).
 */
export function partiesAhead(
  entries: QueueOrderable[],
  entryId: string,
): number | null {
  const position = queuePositionAmong(entries, entryId);
  if (position == null) return null;
  return position - 1;
}

/**
 * Estimated wait in minutes.
 * `includeSelf` matches existing Froq behaviour (position × minsPerParty).
 */
export function estimatedWaitMinutes(input: {
  partiesAhead: number;
  minutesPerParty: number;
  includeSelf?: boolean;
}): number {
  const per = Math.max(1, Math.round(input.minutesPerParty));
  const ahead = Math.max(0, Math.round(input.partiesAhead));
  const parties = input.includeSelf === false ? ahead : ahead + 1;
  return Math.max(0, parties * per);
}

/** True when a held reservation's reserved time has arrived (or passed). */
export function isReservationDue(
  entry: Pick<QueueOrderable, "kind" | "status" | "joinedAtMs">,
  nowMs = Date.now(),
): boolean {
  if (entry.kind !== "reservation") return false;
  return entry.joinedAtMs <= nowMs;
}

/** Held → waiting when reservation time arrives (same joined_at — no reinsert). */
export function shouldActivateHeld(
  entry: Pick<QueueOrderable, "kind" | "status" | "joinedAtMs">,
  nowMs = Date.now(),
): boolean {
  return entry.status === "held" && isReservationDue(entry, nowMs);
}

/**
 * Past grace: reservation time + grace minutes elapsed and guest still not
 * called/seated. Applies to held or waiting reserved parties.
 */
export function isPastGrace(input: {
  kind: QueueLineKind;
  status: QueueLineStatus;
  joinedAtMs: number;
  graceMinutes: number;
  nowMs?: number;
}): boolean {
  if (input.kind !== "reservation") return false;
  if (input.status !== "held" && input.status !== "waiting") return false;
  const now = input.nowMs ?? Date.now();
  const graceMs = Math.max(0, Math.round(input.graceMinutes)) * 60_000;
  return now > input.joinedAtMs + graceMs;
}

/**
 * Next party the merchant should call: earliest on the line that is waiting,
 * or held with reservation time already due. Future holds are skipped so
 * walk-ins ahead of a later reservation are served first.
 */
export function nextCallableEntry<T extends QueueOrderable>(
  entries: T[],
  nowMs = Date.now(),
): T | null {
  for (const entry of lineEntries(entries)) {
    if (entry.status === "called") continue;
    if (entry.status === "waiting") return entry;
    if (entry.status === "held" && isReservationDue(entry, nowMs)) return entry;
  }
  return null;
}

/**
 * Display phase for a reservation on the live board.
 * Upcoming = held slot before arrival time; waiting = due / checked in.
 */
export function reservationDisplayPhase(
  entry: Pick<QueueOrderable, "kind" | "status" | "joinedAtMs">,
  nowMs = Date.now(),
): "upcoming" | "waiting" | null {
  if (entry.kind !== "reservation") return null;
  if (entry.status === "held" && !isReservationDue(entry, nowMs)) return "upcoming";
  if (
    entry.status === "held" ||
    entry.status === "waiting" ||
    entry.status === "called"
  ) {
    return "waiting";
  }
  return null;
}
