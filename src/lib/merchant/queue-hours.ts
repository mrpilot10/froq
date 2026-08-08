/** Store hours + independent auto-start / auto-close flags for Queue Management. */

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
  /** When on, create a live session once business hours begin (if none exists). */
  autoStart: boolean;
  /** When on, end the live session after closing time / on closed days. */
  autoClose: boolean;
}

export const DEFAULT_QUEUE_STORE_HOURS: QueueStoreHours = {
  openTime: "10:00",
  closeTime: "22:00",
  openDays: [0, 1, 2, 3, 4, 5, 6],
  autoStart: true,
  autoClose: true,
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

/**
 * True when open/close times and openDays are usable for automation.
 * Invalid / empty config → fail open (caller must never auto-close).
 */
export function areQueueHoursUsable(
  openTime: string,
  closeTime: string,
  openDays: number[],
): boolean {
  if (!normalizeTimeInput(openTime) || !normalizeTimeInput(closeTime)) return false;
  if (openTime === closeTime) return false;
  const days = openDays.map(Number).filter((d) => Number.isFinite(d) && d >= 0 && d <= 6);
  return days.length > 0;
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
  const autos: string[] = [];
  if (hours.autoStart) autos.push("auto start");
  if (hours.autoClose) autos.push("auto close");
  const auto = autos.length ? ` · ${autos.join(" · ")}` : "";
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
  const days = openDays.map(Number);
  if (!days.includes(clock.day)) {
    // Overnight: still "open" after midnight on a day that isn't listed if
    // yesterday was an open day and close is after midnight.
    const openMin = minutesFromMidnight(openTime);
    const closeMin = minutesFromMidnight(closeTime);
    if (openMin < closeMin) return false;
    const yesterday = (clock.day + 6) % 7;
    if (!days.includes(yesterday)) return false;
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

/**
 * Auto-close means "business has actually closed", not "outside open window".
 * Pre-open manual starts (e.g. 9:30 when open is 10:00) must stay live; only
 * post-close / closed-day leftovers should be ended.
 */
export function shouldAutoCloseSessions(
  clock: ZonedClock,
  openTime: string,
  closeTime: string,
  openDays: number[],
): boolean {
  if (!areQueueHoursUsable(openTime, closeTime, openDays)) return false;
  if (isWithinOpenWindow(clock, openTime, closeTime, openDays)) return false;

  const days = openDays.map(Number);
  const openMin = minutesFromMidnight(openTime);
  const closeMin = minutesFromMidnight(closeTime);

  if (openMin < closeMin) {
    // Same-day hours (e.g. 10:00–22:00).
    if (!days.includes(clock.day)) return true; // closed calendar day
    // Post-close only — not the pre-open gap before openMin.
    return clock.minutes >= closeMin;
  }

  // Overnight hours (e.g. 18:00–02:00).
  if (!days.includes(clock.day)) return true; // closed calendar day

  // Daytime closed gap [closeMin, openMin): first half = after close → end;
  // second half = before next open → leave manual early starts alone.
  const mid = Math.floor((closeMin + openMin) / 2);
  return clock.minutes < mid;
}

/** True when Auto Start may create a session (within open window only). */
export function shouldAutoStartSessions(
  clock: ZonedClock,
  openTime: string,
  closeTime: string,
  openDays: number[],
): boolean {
  if (!areQueueHoursUsable(openTime, closeTime, openDays)) return false;
  return isWithinOpenWindow(clock, openTime, closeTime, openDays);
}
