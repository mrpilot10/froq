/**
 * What the AI Menu adds on top of a cart subtotal.
 *
 * The rates live on the merchant, but the arithmetic lives here so the guest
 * cart, the merchant settings preview and anything that ever prices an order
 * server-side all round the same way. A bill that disagrees with itself by a
 * rupee is worse than no bill.
 */

export interface MenuTaxRates {
  cgstPercent: number;
  sgstPercent: number;
  serviceChargePercent: number;
}

/** The rates the cart used before any of this was configurable. */
export const DEFAULT_MENU_TAX_RATES: MenuTaxRates = {
  cgstPercent: 2.5,
  sgstPercent: 2.5,
  serviceChargePercent: 5,
};

/** Percent choices offered in settings and onboarding. 0 removes the row. */
export const MENU_GST_PERCENT_OPTIONS = [0, 0.5, 1, 1.5, 2, 2.5, 6, 9, 14] as const;
export const MENU_SERVICE_PERCENT_OPTIONS = [0, 2.5, 5, 7.5, 10] as const;

/**
 * A percent a bill can actually print: never negative, never past 100, and no
 * more precision than two decimals. Anything unreadable falls back to 0 rather
 * than to a default, so a bad value can never silently charge a guest.
 */
export function normalizeTaxPercent(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(100, Math.round(num * 100) / 100);
}

export function normalizeMenuTaxRates(input: Partial<MenuTaxRates> | null | undefined): MenuTaxRates {
  return {
    cgstPercent: normalizeTaxPercent(input?.cgstPercent),
    sgstPercent: normalizeTaxPercent(input?.sgstPercent),
    serviceChargePercent: normalizeTaxPercent(input?.serviceChargePercent),
  };
}

/** "2.5" not "2.50", "5" not "5.00" — a menu prints the shorter number. */
export function formatTaxPercent(value: number): string {
  const safe = normalizeTaxPercent(value);
  return Number.isInteger(safe) ? String(safe) : String(safe).replace(/0+$/, "");
}

export interface MenuTaxBreakdown {
  subtotal: number;
  cgst: number;
  sgst: number;
  serviceCharge: number;
  total: number;
}

/**
 * Each line rounds to whole rupees on its own, then the total is the sum of the
 * rounded lines. Rounding the total separately would leave a bill whose rows
 * do not add up to it, which is the one thing a guest always checks.
 */
export function menuTaxBreakdown(subtotal: number, rates: MenuTaxRates): MenuTaxBreakdown {
  const base = Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0;
  const cgst = Math.round((base * normalizeTaxPercent(rates.cgstPercent)) / 100);
  const sgst = Math.round((base * normalizeTaxPercent(rates.sgstPercent)) / 100);
  const serviceCharge = Math.round((base * normalizeTaxPercent(rates.serviceChargePercent)) / 100);
  return {
    subtotal: base,
    cgst,
    sgst,
    serviceCharge,
    total: base + cgst + sgst + serviceCharge,
  };
}

/** Whether anything is added at all — an all-zero bill shows no breakdown. */
export function hasMenuCharges(rates: MenuTaxRates): boolean {
  return (
    normalizeTaxPercent(rates.cgstPercent) > 0 ||
    normalizeTaxPercent(rates.sgstPercent) > 0 ||
    normalizeTaxPercent(rates.serviceChargePercent) > 0
  );
}

/** One-line summary for a settings row: "CGST 2.5% · SGST 2.5% · Service 5%". */
export function menuTaxSummary(rates: MenuTaxRates): string {
  const parts: string[] = [];
  if (normalizeTaxPercent(rates.cgstPercent) > 0) {
    parts.push(`CGST ${formatTaxPercent(rates.cgstPercent)}%`);
  }
  if (normalizeTaxPercent(rates.sgstPercent) > 0) {
    parts.push(`SGST ${formatTaxPercent(rates.sgstPercent)}%`);
  }
  if (normalizeTaxPercent(rates.serviceChargePercent) > 0) {
    parts.push(`Service ${formatTaxPercent(rates.serviceChargePercent)}%`);
  }
  return parts.length ? parts.join(" · ") : "No tax or service charge added";
}
