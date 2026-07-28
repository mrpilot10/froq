/**
 * Open-redirect guard for `?next=` destinations.
 *
 * Only same-origin paths are allowed: a single leading slash, no protocol and
 * no `//host` shorthand, so a crafted login link can't bounce a merchant to
 * another site with a fresh session in hand.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback: string): string {
  const value = raw?.trim();
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  return value;
}

/** Adds a query param to a path that may already carry a query string. */
export function withParam(path: string, key: string, value: string): string {
  const [pathname, hash = ""] = path.split("#");
  const separator = pathname.includes("?") ? "&" : "?";
  const suffix = hash ? `#${hash}` : "";
  return `${pathname}${separator}${key}=${encodeURIComponent(value)}${suffix}`;
}
