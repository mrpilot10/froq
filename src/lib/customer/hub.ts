/** Permanent customer hub path for a Customer × Business public token. */
export function customerHubPath(publicToken: string): string {
  return `/c/${encodeURIComponent(publicToken.trim())}`;
}

/** True when the value looks like a generated customer public token. */
export function isCustomerPublicToken(token: string): boolean {
  return /^frq_[a-zA-Z0-9]+$/i.test(token.trim());
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates / normalizes a WhatsApp URL button parameter.
 * Accepts bare `frq_…` tokens, or a full `/c/frq_…` URL (extracts the token).
 * Rejects merchant slugs, UUIDs, and other non-token values.
 */
export function requireCustomerPublicToken(
  value: unknown,
  field = "publicToken",
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  const raw = value.trim();
  const fromPath = raw.match(/\/c\/(frq_[a-zA-Z0-9]+)/i)?.[1];
  const token = (fromPath ?? raw).trim();

  if (UUID_RE.test(token)) {
    throw new Error(
      `${field} must be the permanent publicToken (frq_…), not a database UUID.`,
    );
  }
  if (!isCustomerPublicToken(token)) {
    throw new Error(
      `${field} must be a permanent customer publicToken (frq_…). Do not send merchant slug, card id, or customer id.`,
    );
  }
  return token;
}
