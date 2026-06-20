// Phone normalisation. The app collects 10-digit Indian numbers; Supabase and
// APITxT both want the full number with country code and no '+'.

const DEFAULT_COUNTRY_CODE = process.env.OTP_COUNTRY_CODE?.replace(/\D/g, "") || "91";

export function digitsOnly(input: string): string {
  return (input ?? "").replace(/\D/g, "");
}

/**
 * Normalises any user-entered phone to E.164 digits without '+'
 * (e.g. "98765 43210" → "919876543210"). Supabase stores phones in this form,
 * and APITxT's OTP endpoint expects the country code prefixed.
 */
export function toCanonicalPhone(input: string): string | null {
  let digits = digitsOnly(input);

  // Strip a leading "+" handled by digitsOnly already; drop a leading 0.
  if (digits.startsWith("0")) digits = digits.slice(1);

  if (digits.length === 10) {
    return `${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  // Already includes the country code.
  if (digits.length === 10 + DEFAULT_COUNTRY_CODE.length && digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    return digits;
  }

  // Accept other 11–15 digit international numbers as-is.
  if (digits.length >= 11 && digits.length <= 15) return digits;

  return null;
}

/** Masks a canonical phone for logs: 919876543210 → 9198****3210. */
export function maskPhone(canonical: string): string {
  if (canonical.length <= 8) return "****";
  return `${canonical.slice(0, 4)}****${canonical.slice(-4)}`;
}
