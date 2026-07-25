/**
 * Fixed reminder schedule after a party is marked "called".
 * Offsets are from called_at. Update only this array to change timing.
 */
export const CALL_REMINDER_MINUTES = [3, 7, 9] as const;

export type QueueCallReminderNumber = 1 | 2 | 3;

/** @deprecated Prefer CALL_REMINDER_MINUTES — kept as a keyed map for callers. */
export const QUEUE_CALL_REMINDER_OFFSETS_MS = {
  1: CALL_REMINDER_MINUTES[0] * 60_000,
  2: CALL_REMINDER_MINUTES[1] * 60_000,
  3: CALL_REMINDER_MINUTES[2] * 60_000,
} as const;

export const QUEUE_CALL_REMINDER_TEMPLATE = {
  1: "queue_reminders_1",
  2: "queue_reminder_2",
  3: "queue_reminder_3",
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
