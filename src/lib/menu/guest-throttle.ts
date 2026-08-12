/**
 * Sliding-window request counter for the anonymous menu endpoints. A guest
 * scanning a QR can't be shown a captcha, so these routes lean on cheap
 * per-caller ceilings instead — enough to stop a script hammering the
 * assistant (which costs money per call) without getting in a real diner's way.
 *
 * In-memory only. Guest assistant + events use consumePublicRateLimit
 * (Postgres, ip+slug). Keep this for OTP special-offers and cart-insights.
 */

const MAX_KEYS = 5_000;
const hits = new Map<string, number[]>();

export interface ThrottleRule {
  limit: number;
  windowMs: number;
}

export type ThrottleResult = { ok: true } | { ok: false; retryAfter: number };

/** Assistant + cart insights each cost a Gemini call. */
export const ASSISTANT_LIMIT: ThrottleRule = { limit: 12, windowMs: 60_000 };

/**
 * Analytics beacons are batched and cost only a write, so this sits far higher
 * than the assistant — it is here to cap a script filling the table, not to
 * ration a guest who browses quickly.
 */
export const EVENTS_LIMIT: ThrottleRule = { limit: 60, windowMs: 60_000 };

/** Best-effort caller identity: the closest thing to a client IP we get. */
export function callerKey(request: Request, scope: string): string {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}

export function throttle(key: string, rule: ThrottleRule, now = Date.now()): ThrottleResult {
  // Cheap guard against unbounded growth on a long-lived instance.
  if (hits.size > MAX_KEYS) hits.clear();

  const cutoff = now - rule.windowMs;
  const recent = (hits.get(key) ?? []).filter((at) => at > cutoff);
  if (recent.length >= rule.limit) {
    const retryAfter = Math.max(1, Math.ceil((recent[0] + rule.windowMs - now) / 1000));
    hits.set(key, recent);
    return { ok: false, retryAfter };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true };
}

/** Test seam — the window is process-wide state. */
export function resetThrottle(): void {
  hits.clear();
}
