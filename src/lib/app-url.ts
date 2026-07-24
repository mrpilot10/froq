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
 */
export function getAppOrigin(): string {
  const candidates = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ];

  for (const raw of candidates) {
    const trimmed = raw?.trim().replace(/\/$/, "");
    if (!trimmed) continue;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  throw new Error(
    "APP_URL is not configured. Set APP_URL (or NEXT_PUBLIC_SITE_URL) to your public origin.",
  );
}

/** Absolute customer hub URL for the permanent publicToken. */
export function customerHubUrl(publicToken: string): string {
  const token = publicToken.trim();
  return `${getAppOrigin()}/c/${encodeURIComponent(token)}`;
}
