/** Shared admin reporting windows. */

export const ADMIN_PERIODS = ["7d", "30d", "6m", "1y", "all"] as const;

export type AdminPeriod = (typeof ADMIN_PERIODS)[number];

export type AdminPeriodWindow = {
  period: AdminPeriod;
  label: string;
  /** Inclusive start; null = no lower bound (all time). */
  sinceIso: string | null;
  /** Approximate day count for pro-rating fixed monthly costs. */
  days: number | null;
};

const LABELS: Record<AdminPeriod, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "6m": "6 months",
  "1y": "1 year",
  all: "All time",
};

export function parseAdminPeriod(
  raw: string | string[] | undefined | null,
): AdminPeriod {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && (ADMIN_PERIODS as readonly string[]).includes(value)) {
    return value as AdminPeriod;
  }
  return "30d";
}

export function adminPeriodWindow(
  period: AdminPeriod,
  now = new Date(),
): AdminPeriodWindow {
  const ms = now.getTime();
  const ago = (days: number) =>
    new Date(ms - days * 86_400_000).toISOString();

  switch (period) {
    case "7d":
      return {
        period,
        label: LABELS[period],
        sinceIso: ago(7),
        days: 7,
      };
    case "30d":
      return {
        period,
        label: LABELS[period],
        sinceIso: ago(30),
        days: 30,
      };
    case "6m":
      return {
        period,
        label: LABELS[period],
        sinceIso: ago(182),
        days: 182,
      };
    case "1y":
      return {
        period,
        label: LABELS[period],
        sinceIso: ago(365),
        days: 365,
      };
    case "all":
      return {
        period,
        label: LABELS[period],
        sinceIso: null,
        days: null,
      };
  }
}

export function periodLookbackDays(period: AdminPeriod): number {
  switch (period) {
    case "7d":
      return 30;
    case "30d":
      return 90;
    case "6m":
      return 200;
    case "1y":
      return 400;
    case "all":
      return 730;
  }
}
