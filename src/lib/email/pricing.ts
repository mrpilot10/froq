/**
 * Resend email unit pricing for Platform Costs.
 * Source: resend.com pricing — $0.40 / 1,000 emails on free→pro tier.
 */

export const RESEND_USD_PER_EMAIL = 0.0004;
export const RESEND_RATES_UPDATED_AT = "2026-08-07";

/** Shared FX with other admin USD→INR rollups. */
export const RESEND_USD_INR = 84;

export function costUsdForEmail(status: "sent" | "failed"): number {
  return status === "sent" ? RESEND_USD_PER_EMAIL : 0;
}

export function costInrForEmail(status: "sent" | "failed"): number {
  return costUsdForEmail(status) * RESEND_USD_INR;
}
