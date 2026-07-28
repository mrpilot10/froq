import { getAppOrigin } from "@/lib/app-url";

/**
 * Guest reservation page. WhatsApp and SMS both point here — every customer
 * action (accept a new time, cancel, check status) happens on this page, never
 * through a WhatsApp reply.
 *
 * Meta template URL button: https://froq.io/r/{{1}} — runtime sends only the
 * `rsv_…` suffix via url_buttons["0"].
 */
export function reservationPath(publicToken: string): string {
  return `/r/${encodeURIComponent(publicToken.trim())}`;
}

export function reservationUrl(publicToken: string): string {
  return `${getAppOrigin()}${reservationPath(publicToken)}`;
}

/** True when a `/r/[slug]` segment is a reservation token, not a merchant slug. */
export function isReservationPublicToken(value: string): boolean {
  return /^rsv_[a-z0-9]+$/i.test(value.trim());
}

/** Normalizes a WhatsApp URL-button parameter for reservation templates. */
export function requireReservationPublicToken(
  value: unknown,
  field = "reservationToken",
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  const raw = value.trim();
  const token = raw.match(/\/r\/(rsv_[a-z0-9]+)/i)?.[1] ?? raw;
  if (!isReservationPublicToken(token)) {
    throw new Error(
      `${field} must be a reservation publicToken (rsv_…). Do not send the merchant slug or reservation id.`,
    );
  }
  return token;
}
