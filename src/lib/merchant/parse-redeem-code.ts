/** Extracts a reward code from a scanned QR payload or manual entry. */
export function parseRedeemCode(raw: string): string {
  const trimmed = raw.trim();
  const urlMatch = trimmed.match(/code=([A-Za-z0-9-]+)/i);
  return (urlMatch ? urlMatch[1] : trimmed).trim().toUpperCase();
}
