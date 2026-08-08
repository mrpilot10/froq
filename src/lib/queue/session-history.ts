/**
 * Shared types + timeline builder for History → Sessions guest drill-down.
 * Reconstructs events from queue_entries timestamps and queue_call_jobs notify fields
 * (there is no dedicated queue_events table).
 */

export type QueueHistoryGuestStatus =
  | "held"
  | "waiting"
  | "called"
  | "seated"
  | "left";

export type QueueGuestTimelineEventType =
  | "joined"
  | "notified"
  | "called"
  | "seated"
  | "left";

export type QueueGuestTimelineEvent = {
  id: string;
  type: QueueGuestTimelineEventType;
  label: string;
  atMs: number;
};

export type QueueHistoryGuest = {
  id: string;
  customerId: string | null;
  name: string;
  phone: string;
  partySize: number;
  kind: "walkin" | "reservation";
  status: QueueHistoryGuestStatus;
  joinedAtMs: number;
  /** Seat wait in minutes when seated; null otherwise. */
  waitMinutes: number | null;
};

export type QueueHistoryGuestDetail = QueueHistoryGuest & {
  email?: string;
  merchantNotes: string;
  timeline: QueueGuestTimelineEvent[];
};

/** One past visit by a person, for the Queue → Customers drill-down. */
export type QueueCustomerVisit = QueueHistoryGuest & {
  sessionId: string;
  /** Session number when the session row still exists. */
  sessionNumber: number | null;
  branchId: string | null;
};

export type QueueCallNotifySource = {
  calledNotifiedAtMs?: number;
  reminder1SentAtMs?: number;
  reminder2SentAtMs?: number;
  reminder3SentAtMs?: number;
};

export type QueueEntryTimelineSource = {
  id: string;
  joinedAtMs: number;
  notifiedJoinedAtMs?: number;
  calledAtMs?: number;
  seatedAtMs?: number;
  leftAtMs?: number;
  status: QueueHistoryGuestStatus;
};

const STATUS_LABEL: Record<QueueHistoryGuestStatus, string> = {
  held: "Held",
  waiting: "Waiting",
  called: "Called",
  seated: "Seated",
  left: "Left",
};

export function queueGuestStatusLabel(status: QueueHistoryGuestStatus): string {
  return STATUS_LABEL[status];
}

/** True when a history record id is a real `queue_sessions.id` (not a localStorage synthetic). */
export function isQueueDbSessionId(id: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  );
}

/**
 * Chronological visit trail for one queue entry.
 * Only emits steps that actually happened (timestamp present).
 */
export function buildQueueGuestTimeline(
  entry: QueueEntryTimelineSource,
  notify?: QueueCallNotifySource | null,
): QueueGuestTimelineEvent[] {
  const events: QueueGuestTimelineEvent[] = [
    {
      id: `${entry.id}-joined`,
      type: "joined",
      label: "Joined the queue",
      atMs: entry.joinedAtMs,
    },
  ];

  if (entry.notifiedJoinedAtMs != null) {
    events.push({
      id: `${entry.id}-notified-joined`,
      type: "notified",
      label: "WhatsApp join notify sent",
      atMs: entry.notifiedJoinedAtMs,
    });
  }

  if (entry.calledAtMs != null) {
    events.push({
      id: `${entry.id}-called`,
      type: "called",
      label: "Called",
      atMs: entry.calledAtMs,
    });
  }

  if (notify?.calledNotifiedAtMs != null) {
    events.push({
      id: `${entry.id}-notified-called`,
      type: "notified",
      label: "WhatsApp call notify sent",
      atMs: notify.calledNotifiedAtMs,
    });
  }

  if (notify?.reminder1SentAtMs != null) {
    events.push({
      id: `${entry.id}-reminder-1`,
      type: "notified",
      label: "WhatsApp reminder 1 sent",
      atMs: notify.reminder1SentAtMs,
    });
  }
  if (notify?.reminder2SentAtMs != null) {
    events.push({
      id: `${entry.id}-reminder-2`,
      type: "notified",
      label: "WhatsApp reminder 2 sent",
      atMs: notify.reminder2SentAtMs,
    });
  }
  if (notify?.reminder3SentAtMs != null) {
    events.push({
      id: `${entry.id}-reminder-3`,
      type: "notified",
      label: "WhatsApp reminder 3 sent",
      atMs: notify.reminder3SentAtMs,
    });
  }

  if (entry.seatedAtMs != null) {
    events.push({
      id: `${entry.id}-seated`,
      type: "seated",
      label: "Seated",
      atMs: entry.seatedAtMs,
    });
  }

  if (entry.leftAtMs != null && entry.status === "left") {
    events.push({
      id: `${entry.id}-left`,
      type: "left",
      label: "Left / skipped",
      atMs: entry.leftAtMs,
    });
  }

  return events.sort((a, b) => a.atMs - b.atMs);
}
