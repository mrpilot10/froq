export function formatInr(amount: number, opts?: { compact?: boolean }): string {
  if (!Number.isFinite(amount)) return "—";
  if (opts?.compact) {
    if (Math.abs(amount) >= 10_000_000) {
      return `₹${(amount / 10_000_000).toFixed(2)}Cr`;
    }
    if (Math.abs(amount) >= 100_000) {
      return `₹${(amount / 100_000).toFixed(2)}L`;
    }
    if (Math.abs(amount) >= 1_000) {
      return `₹${(amount / 1_000).toFixed(1)}k`;
    }
  }
  // Keep paise / Meta-rate precision for small WhatsApp costs.
  if (Math.abs(amount) > 0 && (Math.abs(amount) < 1 || !Number.isInteger(amount))) {
    return `₹${amount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 5,
    })}`;
  }
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function formatNumber(value: number, opts?: { compact?: boolean }): string {
  if (!Number.isFinite(value)) return "—";
  if (opts?.compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return value.toLocaleString("en-IN");
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function changePercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const deltaSec = Math.round((Date.now() - t) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(deltaSec);
  if (abs < 60) return rtf.format(-deltaSec, "second");
  const mins = Math.round(deltaSec / 60);
  if (Math.abs(mins) < 60) return rtf.format(-mins, "minute");
  const hours = Math.round(deltaSec / 3600);
  if (Math.abs(hours) < 48) return rtf.format(-hours, "hour");
  const days = Math.round(deltaSec / 86_400);
  return rtf.format(-days, "day");
}
