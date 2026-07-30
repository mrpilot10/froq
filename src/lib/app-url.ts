/**
 * Canonical public origin for absolute customer links (hub, SMS, emails).
 *
 * Priority:
 *   1. APP_URL
 *   2. NEXT_PUBLIC_APP_URL
 *   3. NEXT_PUBLIC_SITE_URL
 *   4. VERCEL_URL (https)
 *   5. http://localhost:3000 in development only
 *
 * Never hardcode production domains. Meta WhatsApp templates still register
 * https://froq.io/c/{{1}} in the WhatsApp manager — runtime only sends the
 * dynamic suffix (publicToken) via url_buttons["0"].
 *
 * For links that leave the machine (email invites, password reset, printed
 * QRs), use getPublicAppOrigin() — it never returns localhost.
 */
const LOCAL_HOST = /localhost|127\.0\.0\.1/i;
const DEFAULT_PUBLIC_ORIGIN = "https://froq.io";

function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function configuredOrigins(): string[] {
  return [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ]
    .map((raw) => (raw ? normalizeOrigin(raw) : ""))
    .filter(Boolean);
}

export function getAppOrigin(): string {
  for (const origin of configuredOrigins()) {
    return origin;
  }

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  throw new Error(
    "APP_URL is not configured. Set APP_URL (or NEXT_PUBLIC_SITE_URL) to your public origin.",
  );
}

/**
 * Origin safe for outbound email / SMS / printed links.
 * Skips localhost even when APP_URL is set for local development.
 */
export function getPublicAppOrigin(): string {
  for (const origin of configuredOrigins()) {
    if (!LOCAL_HOST.test(origin)) return origin;
  }
  return DEFAULT_PUBLIC_ORIGIN;
}

/** Absolute customer hub URL for the permanent publicToken. */
export function customerHubUrl(publicToken: string): string {
  const token = publicToken.trim();
  return `${getAppOrigin()}/c/${encodeURIComponent(token)}`;
}
