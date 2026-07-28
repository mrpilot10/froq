/**
 * Shared formatters for queue WhatsApp / SMS / UI copy.
 * Keep units explicit — these strings are sent as Meta template variables.
 */

/**
 * Human-readable estimated wait from whole minutes.
 *
 * Examples:
 *   5 → "5 mins"
 *   60 → "1 hour"
 *   61 → "1 hour 1 min"
 *   75 → "1 hour 15 mins"
 *   120 → "2 hours"
 *   121 → "2 hours 1 min"
 */
export function formatEstimatedWaitTime(minutes: number): string {
  if (!Number.isFinite(minutes)) {
    throw new Error("estimated wait minutes must be a finite number.");
  }

  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (hours === 0) {
    return `${mins} ${mins === 1 ? "min" : "mins"}`;
  }

  const hourPart = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  if (mins === 0) return hourPart;
  return `${hourPart} ${mins} ${mins === 1 ? "min" : "mins"}`;
}

export interface WaitSegment {
  value: number;
  unit: "h" | "m";
}

/**
 * Wait duration split into renderable parts so UIs can style the unit
 * separately. Minutes are dropped once they hit zero on an exact hour.
 *
 *   45 → [45m]
 *   60 → [1h]
 *   75 → [1h, 15m]
 *   1608 → [26h, 48m]
 */
export function waitSegments(minutes: number): WaitSegment[] {
  const total = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (hours === 0) return [{ value: mins, unit: "m" }];
  if (mins === 0) return [{ value: hours, unit: "h" }];
  return [
    { value: hours, unit: "h" },
    { value: mins, unit: "m" },
  ];
}

/**
 * Compact wait duration for inline copy and toasts.
 *   45 → "45m", 75 → "1h 15m", 1608 → "26h 48m"
 */
export function formatWaitShort(minutes: number): string {
  return waitSegments(minutes)
    .map((part) => `${part.value}${part.unit}`)
    .join(" ");
}

/**
 * Party / booking size for queue templates.
 *   1 → "1 person"
 *   n → "{n} people"
 */
export function formatBookingSize(partySize: number): string {
  if (typeof partySize !== "number" || !Number.isFinite(partySize)) {
    throw new Error("booking size must be a finite number.");
  }
  const n = Math.max(0, Math.round(partySize));
  if (n === 1) return "1 person";
  return `${n} people`;
}
