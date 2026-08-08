/**
 * Cloudflare Turnstile — shared client/server config.
 *
 * Only the site key lives here: it is public by design and safe to ship to the
 * browser. The secret key is read exclusively in `verify.ts` (server-only).
 */

export const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();

/**
 * False on environments that never configured the site key (local dev, preview
 * branches, self-hosted forks). Widgets then render nothing and forms submit as
 * before, so a missing key degrades the app instead of locking everyone out.
 */
export function isTurnstileConfigured(): boolean {
  return TURNSTILE_SITE_KEY.length > 0;
}

/** Shown when a form is submitted without a usable token. */
export const TURNSTILE_MISSING_MESSAGE =
  "Please complete the security check below, then try again.";

/** Shown when Cloudflare or Supabase rejects the token. */
export const TURNSTILE_REJECTED_MESSAGE =
  "That security check didn’t go through. Please try again.";

/** Shown when the widget itself fails to load or run. */
export const TURNSTILE_UNAVAILABLE_MESSAGE =
  "The security check couldn’t load. Check your connection and try again.";

/** Cloudflare 110200 — this hostname isn’t on the Turnstile widget allowlist. */
export const TURNSTILE_DOMAIN_MESSAGE =
  "The security check isn’t allowed on this domain yet. Add www.froq.io (and froq.io) in Cloudflare Turnstile → Hostname Management, then refresh.";

/**
 * Map Cloudflare client error codes to a merchant-facing message.
 * @see https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
 */
export function turnstileClientErrorMessage(code?: string | number | null): string {
  const normalized = String(code ?? "").trim();
  if (normalized === "110200") return TURNSTILE_DOMAIN_MESSAGE;
  if (normalized === "110100" || normalized === "110110") {
    return "The security check is misconfigured. Check NEXT_PUBLIC_TURNSTILE_SITE_KEY in Vercel.";
  }
  return TURNSTILE_UNAVAILABLE_MESSAGE;
}

/**
 * True when GoTrue refused a request over its CAPTCHA check ("captcha
 * protection: request disallowed"). Lets auth actions show a retry prompt
 * instead of blaming the user's credentials.
 */
export function isCaptchaAuthError(message: string | null | undefined): boolean {
  return /captcha/i.test(message ?? "");
}
