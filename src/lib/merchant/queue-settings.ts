const WAIT_STORAGE_KEY = "froq.queue.estimatedWaitMinutes";
const WAIT_SAMPLES_KEY = "froq.queue.waitSamples";

/** Fixed arrive window after a guest is called (not merchant-configurable). */
export const CALL_ACCEPT_MINUTES = 10;
/** @deprecated Use CALL_ACCEPT_MINUTES */
const DEFAULT_ACCEPT_MINUTES = CALL_ACCEPT_MINUTES;
const DEFAULT_ESTIMATED_WAIT_MINUTES = 10;
const REMINDER_COUNT = 3;
const MAX_WAIT_SAMPLES = 20;

export function getAcceptWindowMinutes(): number {
  return CALL_ACCEPT_MINUTES;
}

/** @deprecated Call window is fixed at CALL_ACCEPT_MINUTES — no-op kept for old callers. */
export function setAcceptWindowMinutes(_minutes?: number) {
  return CALL_ACCEPT_MINUTES;
}

export function acceptWindowMs(minutes = CALL_ACCEPT_MINUTES) {
  return minutes * 60_000;
}

/** Absolute deadline for the post-call arrive countdown. */
export function callAcceptDeadlineMs(calledAtMs: number): number {
  return calledAtMs + acceptWindowMs(CALL_ACCEPT_MINUTES);
}

/** Three reminder offsets evenly dividing the accept window (at 1/3, 2/3, 3/3). */
export function reminderOffsetsMs(windowMs: number) {
  const step = windowMs / REMINDER_COUNT;
  return [step, step * 2, step * 3] as const;
}

function readWaitSamples(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WAIT_SAMPLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 240)
      .slice(-MAX_WAIT_SAMPLES);
  } catch {
    return [];
  }
}

function writeWaitSamples(samples: number[]) {
  window.localStorage.setItem(WAIT_SAMPLES_KEY, JSON.stringify(samples.slice(-MAX_WAIT_SAMPLES)));
}

/** Manual initial estimate set by the merchant (used until enough seatings accumulate). */
export function getInitialEstimatedWaitMinutes(): number {
  if (typeof window === "undefined") return DEFAULT_ESTIMATED_WAIT_MINUTES;
  const raw = window.localStorage.getItem(WAIT_STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 120) {
    return DEFAULT_ESTIMATED_WAIT_MINUTES;
  }
  return Math.round(parsed);
}

export function setInitialEstimatedWaitMinutes(minutes: number) {
  const next = Math.min(120, Math.max(1, Math.round(minutes)));
  window.localStorage.setItem(WAIT_STORAGE_KEY, String(next));
  // Clear learned samples so the new seed takes effect until new seatings arrive.
  writeWaitSamples([]);
  window.dispatchEvent(
    new CustomEvent("froq:queue-settings", {
      detail: { estimatedWaitMinutes: next, waitSource: "initial" as const, waitSamples: 0 },
    }),
  );
  return next;
}

/**
 * Effective minutes-per-party for the live wait estimate.
 * Uses the rolling average of actual join→seated waits once we have samples;
 * otherwise falls back to the merchant's initial estimate.
 */
export function getEstimatedWaitMinutes(): number {
  const samples = readWaitSamples();
  if (samples.length > 0) {
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    return Math.max(1, Math.round(avg));
  }
  return getInitialEstimatedWaitMinutes();
}

export function getWaitEstimateMeta(): {
  minutes: number;
  source: "initial" | "learned";
  samples: number;
} {
  const samples = readWaitSamples();
  if (samples.length > 0) {
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    return {
      minutes: Math.max(1, Math.round(avg)),
      source: "learned",
      samples: samples.length,
    };
  }
  return {
    minutes: getInitialEstimatedWaitMinutes(),
    source: "initial",
    samples: 0,
  };
}

/** Record an actual join→seated wait (in minutes) and refresh the rolling estimate. */
export function recordActualWaitMinutes(waitMinutes: number) {
  const mins = Math.max(0, Math.round(waitMinutes));
  const samples = [...readWaitSamples(), mins].slice(-MAX_WAIT_SAMPLES);
  writeWaitSamples(samples);
  const avg = Math.max(1, Math.round(samples.reduce((a, b) => a + b, 0) / samples.length));
  window.dispatchEvent(
    new CustomEvent("froq:queue-settings", {
      detail: {
        estimatedWaitMinutes: avg,
        waitSource: "learned" as const,
        waitSamples: samples.length,
      },
    }),
  );
  return avg;
}

export {
  DEFAULT_ACCEPT_MINUTES,
  DEFAULT_ESTIMATED_WAIT_MINUTES,
  REMINDER_COUNT,
};
