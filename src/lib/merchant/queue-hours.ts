/** Store hours + auto session flag for Queue Management. */

/** Fixed timezone for queue open/close (IST). */
export const QUEUE_HOURS_TIMEZONE = "Asia/Kolkata";

/** 0 = Sunday … 6 = Saturday (matches JS Date#getDay). */
export const QUEUE_WEEKDAYS: Array<{ day: number; short: string; label: string }> = [
  { day: 1, short: "Mon", label: "Monday" },
  { day: 2, short: "Tue", label: "Tuesday" },
  { day: 3, short: "Wed", label: "Wednesday" },
  { day: 4, short: "Thu", label: "Thursday" },
  { day: 5, short: "Fri", label: "Friday" },
  { day: 6, short: "Sat", label: "Saturday" },
  { day: 0, short: "Sun", label: "Sunday" },
];

export interface QueueStoreHours {
  openTime: string; // "HH:MM"
  closeTime: string;
  /** Days the store is open for queue (0=Sun … 6=Sat). */
  openDays: number[];
  /** When on, auto-start at open and auto-close at close (recommended). */
  autoSessions: boolean;
}

export const DEFAULT_QUEUE_STORE_HOURS: QueueStoreHours = {
  openTime: "10:00",
  closeTime: "22:00",
  openDays: [0, 1, 2, 3, 4, 5, 6],
  autoSessions: true,
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeTimeInput(value: string): string | null {
  const trimmed = value.trim();
  if (!TIME_RE.test(trimmed)) return null;
  return trimmed;
}

/** Postgres `time` may arrive as "10:00:00" — keep HH:MM for inputs. */
export function formatTimeForInput(value: string | null | undefined): string {
  if (!value) return DEFAULT_QUEUE_STORE_HOURS.openTime;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return DEFAULT_QUEUE_STORE_HOURS.openTime;
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function minutesFromMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function formatHoursSummary(hours: QueueStoreHours): string {
  const days =
    hours.openDays.length === 7
      ? "Every day"
      : hours.openDays.length === 0
        ? "No days"
        : QUEUE_WEEKDAYS.filter((d) => hours.openDays.includes(d.day))
            .map((d) => d.short)
            .join("·");
  const auto = hours.autoSessions ? " · auto sessions" : "";
  return `${days} · ${hours.openTime}–${hours.closeTime}${auto}`;
}

export function validateQueueStoreHours(hours: QueueStoreHours): string | null {
  if (!normalizeTimeInput(hours.openTime)) return "Enter a valid open time.";
  if (!normalizeTimeInput(hours.closeTime)) return "Enter a valid close time.";
  if (hours.openTime === hours.closeTime) {
    return "Open and close times must be different.";
  }
  if (!hours.openDays.length) return "Pick at least one open day.";
  return null;
}

const WEEKDAY_TO_DOW: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type ZonedClock = {
  day: number;
  minutes: number;
  /** Calendar date YYYY-MM-DD in the merchant timezone. */
  dateKey: string;
};

/** Current wall-clock parts in an IANA timezone. */
export function getZonedClock(timeZone: string, now = new Date()): ZonedClock {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const minute = Number(parts.minute);
  const day = WEEKDAY_TO_DOW[parts.weekday] ?? 0;
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  return { day, minutes: hour * 60 + minute, dateKey };
}

/**
 * True when the local clock is inside [open, close).
 * Supports overnight windows (e.g. 18:00–02:00).
 */
export function isWithinOpenWindow(
  clock: ZonedClock,
  openTime: string,
  closeTime: string,
  openDays: number[],
): boolean {
  if (!openDays.includes(clock.day)) {
    // Overnight: still "open" after midnight on a day that isn't listed if
    // yesterday was an open day and close is after midnight.
    const openMin = minutesFromMidnight(openTime);
    const closeMin = minutesFromMidnight(closeTime);
    if (openMin < closeMin) return false;
    const yesterday = (clock.day + 6) % 7;
    if (!openDays.includes(yesterday)) return false;
    return clock.minutes < closeMin;
  }

  const openMin = minutesFromMidnight(openTime);
  const closeMin = minutesFromMidnight(closeTime);
  if (openMin < closeMin) {
    return clock.minutes >= openMin && clock.minutes < closeMin;
  }
  // Overnight on an open day: open until midnight, or after open.
  return clock.minutes >= openMin || clock.minutes < closeMin;
}

/** Minutes since today's open time (0 at open). */
export function minutesSinceOpen(clock: ZonedClock, openTime: string): number {
  const openMin = minutesFromMidnight(openTime);
  return clock.minutes - openMin;
}
