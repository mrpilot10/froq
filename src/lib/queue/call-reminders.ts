import { CALL_ACCEPT_MINUTES } from "@/lib/merchant/queue-settings";

/**
 * Minutes remaining in the post-call accept window when each reminder fires.
 * Reminder 1 → 7 min left, reminder 2 → 3 min left, reminder 3 → 1 min left.
 */
export const CALL_REMINDER_MINUTES_LEFT = [7, 3, 1] as const;

/** Offsets from called_at (accept window minus minutes left). */
export const CALL_REMINDER_MINUTES: readonly [number, number, number] = [
  CALL_ACCEPT_MINUTES - CALL_REMINDER_MINUTES_LEFT[0],
  CALL_ACCEPT_MINUTES - CALL_REMINDER_MINUTES_LEFT[1],
  CALL_ACCEPT_MINUTES - CALL_REMINDER_MINUTES_LEFT[2],
];

export type QueueCallReminderNumber = 1 | 2 | 3;

/**
 * Initial `queue_call_now` recovery (null-claim catch-up).
 * Reminder 1 fires at CALL_REMINDER_MINUTES[0] (3 min = 180s) — keep this
 * well below that so the initial call always has a chance to land first.
 */
export const CALL_NOTIFY_CATCHUP_AFTER_MS = 30_000;

/**
 * Stale processing lock release for in-flight `queue_call_now` sends.
 * Clears `call_notify_processing_at` only — never touches `called_notified_at`.
 * Must stay below reminder 1 (180s).
 */
export const CALL_NOTIFY_PROCESSING_STALE_MS = 120_000;

/** @deprecated Prefer CALL_REMINDER_MINUTES — kept as a keyed map for callers. */
export const QUEUE_CALL_REMINDER_OFFSETS_MS = {
  1: CALL_REMINDER_MINUTES[0] * 60_000,
  2: CALL_REMINDER_MINUTES[1] * 60_000,
  3: CALL_REMINDER_MINUTES[2] * 60_000,
} as const;

export const QUEUE_CALL_REMINDER_TEMPLATE = {
  1: "queue_reminders_1",
  2: "queue_reminder_2",
  3: "queue_3_reminder",
} as const;

export type ReminderScheduleColumns = {
  reminder_1_scheduled_at: string;
  reminder_2_scheduled_at: string;
  reminder_3_scheduled_at: string;
};

/** Build absolute reminder fire times from called_at + CALL_REMINDER_MINUTES. */
export function buildReminderSchedule(
  calledAt: Date | string | number,
): ReminderScheduleColumns {
  const baseMs = new Date(calledAt).getTime();
  if (!Number.isFinite(baseMs)) {
    throw new Error("Invalid called_at for reminder schedule");
  }
  return {
    reminder_1_scheduled_at: new Date(
      baseMs + CALL_REMINDER_MINUTES[0] * 60_000,
    ).toISOString(),
    reminder_2_scheduled_at: new Date(
      baseMs + CALL_REMINDER_MINUTES[1] * 60_000,
    ).toISOString(),
    reminder_3_scheduled_at: new Date(
      baseMs + CALL_REMINDER_MINUTES[2] * 60_000,
    ).toISOString(),
  };
}

export function reminderDueAt(calledAtMs: number, n: QueueCallReminderNumber): number {
  return calledAtMs + QUEUE_CALL_REMINDER_OFFSETS_MS[n];
}

export function isReminderDue(
  calledAtMs: number,
  n: QueueCallReminderNumber,
  nowMs = Date.now(),
): boolean {
  return nowMs >= reminderDueAt(calledAtMs, n);
}
