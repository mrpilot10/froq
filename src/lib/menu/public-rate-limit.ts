import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ThrottleResult, ThrottleRule } from "@/lib/menu/guest-throttle";

/** First public hop; never trust later X-Forwarded-For entries. */
export function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 64) || "unknown";
}

/**
 * Cluster-wide sliding window keyed on (ip, slug). Fail closed if the
 * counter cannot be written — a downed DB must not open the floodgates.
 */
export async function consumePublicRateLimit(input: {
  request: Request;
  slug: string;
  scope: string;
  rule: ThrottleRule;
}): Promise<ThrottleResult> {
  const slug = input.slug.trim().slice(0, 80);
  if (!slug) return { ok: false, retryAfter: 60 };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_public_rate_limit", {
      p_scope: input.scope,
      p_ip: requestIp(input.request),
      p_slug: slug,
      p_limit: input.rule.limit,
      p_window_ms: input.rule.windowMs,
    });
    if (error || data == null) {
      console.error("public_rate_limit_failed", error?.message ?? "empty");
      return { ok: false, retryAfter: 60 };
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed?: boolean; retry_after?: number }
      | undefined;
    if (!row) {
      console.error("public_rate_limit_failed", "empty");
      return { ok: false, retryAfter: 60 };
    }
    if (row.allowed === true) return { ok: true };
    return {
      ok: false,
      retryAfter: Math.max(1, Number(row.retry_after) || 60),
    };
  } catch (error) {
    console.error(
      "public_rate_limit_failed",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, retryAfter: 60 };
  }
}
