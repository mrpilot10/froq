import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Froq Resend transactional plan — Pro (from account usage page).
 * Daily is unlimited on Pro; monthly renews on the 7th.
 * https://resend.com/docs/knowledge-base/account-quotas-and-limits
 */
export const RESEND_PLAN = "pro" as const;
/** null = unlimited (Pro has no daily cap). */
export const RESEND_DAILY_QUOTA: number | null = null;
export const RESEND_MONTHLY_QUOTA = 50_000;
/** Billing cycle renews on this UTC day-of-month. */
export const RESEND_BILLING_RENEW_DAY = 7;
/** Warn in admin when used / cap crosses this ratio. */
export const RESEND_QUOTA_WARN_RATIO = 0.8;

const CACHE_TTL_MS = 60_000;
const LIST_URL = "https://api.resend.com/emails?limit=1";

export type ResendQuotaSource = "resend_header" | "email_send_log" | "unknown";

export type ResendQuotaBucket = {
  used: number | null;
  limit: number | null;
  remaining: number | null;
  ratio: number | null;
  source: ResendQuotaSource;
};

export type ResendRateLimit = {
  limit: number | null;
  remaining: number | null;
  resetSeconds: number | null;
};

export type ResendQuota = {
  plan: typeof RESEND_PLAN;
  daily: ResendQuotaBucket;
  monthly: ResendQuotaBucket;
  rateLimit: ResendRateLimit;
  /** Inclusive start of the current Resend billing window (UTC). */
  billingPeriodStart: string;
  /** Next renew instant (UTC). */
  billingPeriodRenewsAt: string;
  /** In-app sent counts (always filled when the log is readable). */
  log: {
    sentLast24h: number;
    sentBillingPeriod: number;
    failedLast24h: number;
    failedBillingPeriod: number;
  };
  fetchedAt: string;
  error: string | null;
  /** True when monthly usage is at/above the warn threshold. */
  low: boolean;
};

type CacheEntry = { at: number; value: ResendQuota };

declare global {
  // eslint-disable-next-line no-var
  var __froqResendQuotaCache: CacheEntry | undefined;
  // eslint-disable-next-line no-var
  var __froqResendQuotaHint: {
    dailyUsed: number | null;
    monthlyUsed: number | null;
    at: number;
  } | undefined;
}

/**
 * Remember quota counters observed on a send (or any) Resend response.
 * Headers are often absent on GET list — send responses may carry them.
 */
export function noteResendQuotaHeaders(
  headers: Headers | Record<string, string> | null | undefined,
): void {
  if (!headers) return;
  const get =
    headers instanceof Headers
      ? (name: string) => headers.get(name)
      : (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null;
  const daily = parseIntHeader(get("x-resend-daily-quota"));
  const monthly = parseIntHeader(get("x-resend-monthly-quota"));
  if (daily == null && monthly == null) return;
  const prev = globalThis.__froqResendQuotaHint;
  globalThis.__froqResendQuotaHint = {
    dailyUsed: daily ?? prev?.dailyUsed ?? null,
    monthlyUsed: monthly ?? prev?.monthlyUsed ?? null,
    at: Date.now(),
  };
  globalThis.__froqResendQuotaCache = undefined;
}

function parseIntHeader(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function emptyBucket(limit: number | null): ResendQuotaBucket {
  return { used: null, limit, remaining: null, ratio: null, source: "unknown" };
}

function buildBucket(
  used: number | null,
  limit: number | null,
  source: ResendQuotaSource,
): ResendQuotaBucket {
  if (used == null) return emptyBucket(limit);
  const remaining = limit != null ? Math.max(0, limit - used) : null;
  const ratio = limit != null && limit > 0 ? used / limit : null;
  return { used, limit, remaining, ratio, source };
}

function isBucketLow(bucket: ResendQuotaBucket): boolean {
  if (bucket.ratio == null) return false;
  return bucket.ratio >= RESEND_QUOTA_WARN_RATIO;
}

async function countLogSends(sinceIso: string): Promise<{ sent: number; failed: number }> {
  const admin = createAdminClient();
  const [sentRes, failedRes] = await Promise.all([
    admin
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("created_at", sinceIso),
    admin
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", sinceIso),
  ]);
  return {
    sent: sentRes.count ?? 0,
    failed: failedRes.count ?? 0,
  };
}

/**
 * Current Resend billing window starting on `RESEND_BILLING_RENEW_DAY` (UTC).
 * Example: renew day 7 → Aug 7 00:00 UTC … Sep 7 00:00 UTC.
 */
export function resendBillingWindow(now = new Date()): {
  start: Date;
  renewsAt: Date;
} {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const day = RESEND_BILLING_RENEW_DAY;

  let start: Date;
  if (d >= day) {
    start = new Date(Date.UTC(y, m, day));
  } else {
    start = new Date(Date.UTC(y, m - 1, day));
  }
  const renewsAt = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, day),
  );
  return { start, renewsAt };
}

async function fetchResendListHeaders(apiKey: string): Promise<{
  dailyUsed: number | null;
  monthlyUsed: number | null;
  rateLimit: ResendRateLimit;
  error: string | null;
}> {
  try {
    const res = await fetch(LIST_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    noteResendQuotaHeaders(res.headers);

    const rateLimit: ResendRateLimit = {
      limit: parseIntHeader(res.headers.get("ratelimit-limit")),
      remaining: parseIntHeader(res.headers.get("ratelimit-remaining")),
      resetSeconds: parseIntHeader(res.headers.get("ratelimit-reset")),
    };

    if (!res.ok) {
      return {
        dailyUsed: null,
        monthlyUsed: null,
        rateLimit,
        error: `Resend ${res.status}`,
      };
    }

    return {
      dailyUsed: parseIntHeader(res.headers.get("x-resend-daily-quota")),
      monthlyUsed: parseIntHeader(res.headers.get("x-resend-monthly-quota")),
      rateLimit,
      error: null,
    };
  } catch (err) {
    return {
      dailyUsed: null,
      monthlyUsed: null,
      rateLimit: { limit: null, remaining: null, resetSeconds: null },
      error: err instanceof Error ? err.message : "Resend quota fetch failed",
    };
  }
}

function emptyQuota(error: string | null): ResendQuota {
  const { start, renewsAt } = resendBillingWindow();
  return {
    plan: RESEND_PLAN,
    daily: emptyBucket(RESEND_DAILY_QUOTA),
    monthly: emptyBucket(RESEND_MONTHLY_QUOTA),
    rateLimit: { limit: null, remaining: null, resetSeconds: null },
    billingPeriodStart: start.toISOString(),
    billingPeriodRenewsAt: renewsAt.toISOString(),
    log: {
      sentLast24h: 0,
      sentBillingPeriod: 0,
      failedLast24h: 0,
      failedBillingPeriod: 0,
    },
    fetchedAt: new Date().toISOString(),
    error,
    low: false,
  };
}

export async function getResendQuota(): Promise<ResendQuota> {
  const now = Date.now();
  const cached = globalThis.__froqResendQuotaCache;
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    const value = emptyQuota("RESEND_API_KEY not configured");
    globalThis.__froqResendQuotaCache = { at: now, value };
    return value;
  }

  const { start, renewsAt } = resendBillingWindow(new Date(now));
  const since24h = new Date(now - 24 * 86_400_000).toISOString();
  const sinceBilling = start.toISOString();

  const [api, last24, period] = await Promise.all([
    fetchResendListHeaders(apiKey),
    countLogSends(since24h),
    countLogSends(sinceBilling),
  ]);

  const hint = globalThis.__froqResendQuotaHint;
  const hintFresh = Boolean(hint && now - hint.at < 6 * 3_600_000);

  // Pro: daily header is usually absent (unlimited). Still show rolling 24h send volume.
  const dailyFromHeader = api.dailyUsed ?? (hintFresh ? hint?.dailyUsed ?? null : null);
  const dailyUsed = dailyFromHeader ?? last24.sent;
  const dailySource: ResendQuotaSource =
    dailyFromHeader != null ? "resend_header" : "email_send_log";

  const monthlyFromHeader =
    api.monthlyUsed ?? (hintFresh ? hint?.monthlyUsed ?? null : null);
  const monthlyUsed = monthlyFromHeader ?? period.sent;
  const monthlySource: ResendQuotaSource =
    monthlyFromHeader != null ? "resend_header" : "email_send_log";

  const daily = buildBucket(dailyUsed, RESEND_DAILY_QUOTA, dailySource);
  const monthly = buildBucket(monthlyUsed, RESEND_MONTHLY_QUOTA, monthlySource);
  const low = isBucketLow(monthly);

  const value: ResendQuota = {
    plan: RESEND_PLAN,
    daily,
    monthly,
    rateLimit: api.rateLimit,
    billingPeriodStart: start.toISOString(),
    billingPeriodRenewsAt: renewsAt.toISOString(),
    log: {
      sentLast24h: last24.sent,
      sentBillingPeriod: period.sent,
      failedLast24h: last24.failed,
      failedBillingPeriod: period.failed,
    },
    fetchedAt: new Date().toISOString(),
    error: api.error,
    low,
  };

  const cacheAt = api.error != null ? now - CACHE_TTL_MS + 15_000 : now;
  globalThis.__froqResendQuotaCache = { at: cacheAt, value };
  return value;
}

/** Topbar chip — monthly used / 50k. */
export function formatResendQuotaChip(data: ResendQuota): string {
  const used = data.monthly.used;
  const limit = data.monthly.limit;
  if (used == null || limit == null) return "—";
  return `${used.toLocaleString("en-IN")}/${limit.toLocaleString("en-IN")}`;
}

export function isResendQuotaLow(data: ResendQuota): boolean {
  return data.low;
}
