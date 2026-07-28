import "server-only";

import { headers } from "next/headers";
import { TURNSTILE_MISSING_MESSAGE, TURNSTILE_REJECTED_MESSAGE } from "./config";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 6000;

interface SiteVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

export type TurnstileVerification = { ok: true } | { ok: false; error: string };

function secretKey(): string {
  return (process.env.TURNSTILE_SECRET_KEY ?? "").trim();
}

/** Best-effort client IP for Cloudflare's optional `remoteip` check. */
async function clientIp(): Promise<string | undefined> {
  try {
    const store = await headers();
    const forwarded = store.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || undefined;
    return store.get("x-real-ip") ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validates a Turnstile token against Cloudflare.
 *
 * Only for entry points Supabase's built-in CAPTCHA can't cover — anonymous
 * form submissions and auth flows that run through the service-role key (admin
 * endpoints skip GoTrue's captcha middleware entirely). Anything that reaches a
 * captcha-enforced GoTrue endpoint should forward `captchaToken` to supabase-js
 * instead, so the token is spent exactly once.
 *
 * Tokens are single-use: never call this for a token that is also being handed
 * to supabase-js, or the second validation fails as a duplicate.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
): Promise<TurnstileVerification> {
  const secret = secretKey();

  // Unconfigured environment (local dev, previews): stay usable rather than
  // blocking every public form behind a check that can't succeed.
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.warn("turnstile_secret_missing: skipping captcha verification");
    }
    return { ok: true };
  }

  const candidate = token?.trim();
  if (!candidate) return { ok: false, error: TURNSTILE_MISSING_MESSAGE };

  const body = new URLSearchParams({ secret, response: candidate });
  const ip = await clientIp();
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error("turnstile_siteverify_http_error", { status: res.status });
      return { ok: false, error: TURNSTILE_REJECTED_MESSAGE };
    }

    const data = (await res.json()) as SiteVerifyResponse;
    if (data.success) return { ok: true };

    const codes = data["error-codes"] ?? [];
    console.warn("turnstile_rejected", { codes });

    // An expired or already-spent token is the common, recoverable case: the
    // widget resets itself, so ask for a retry rather than showing a hard error.
    const stale =
      codes.includes("timeout-or-duplicate") || codes.includes("invalid-input-response");
    return { ok: false, error: stale ? TURNSTILE_MISSING_MESSAGE : TURNSTILE_REJECTED_MESSAGE };
  } catch (error) {
    console.error("turnstile_siteverify_failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    // Cloudflare unreachable: fail closed. These endpoints send SMS/WhatsApp or
    // write public rows, so a bot storm during an outage is the worse outcome.
    return { ok: false, error: TURNSTILE_REJECTED_MESSAGE };
  }
}
