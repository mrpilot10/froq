/**
 * India transactional SMS list-price estimate (ApiTxt / DLT route).
 * Override with APITXT_SMS_RATE_INR when your prepaid rate differs.
 */

export const SMS_INDIA_RATE_INR_DEFAULT = 0.15;

export const SMS_RATE_UPDATED_AT = "2026-08-07";

export function smsRateInr(): number {
  const raw = process.env.APITXT_SMS_RATE_INR?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return SMS_INDIA_RATE_INR_DEFAULT;
}

export function costInrForSmsSend(status: "sent" | "failed"): number {
  return status === "sent" ? smsRateInr() : 0;
}
