import "server-only";

import { USD_INR } from "@/lib/google/places-pricing";

export type ProviderInvoiceLine = {
  id: "supabase" | "vercel" | "cloudflare";
  label: string;
  mtdInr: number;
  last30dInr: number;
  projectedMonthInr: number;
  basis: string;
  confidence: "metered" | "estimate" | "snapshot";
  detail: string;
};

function envMonthlyInr(key: string): number | null {
  const raw = process.env[key]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function projectFromDaily(
  mtdUsdOrInr: number,
  dayOfMonth: number,
  daysInMonth: number,
): number {
  if (dayOfMonth <= 0) return mtdUsdOrInr;
  return (mtdUsdOrInr / dayOfMonth) * daysInMonth;
}

/**
 * Do NOT call `GET /accounts/:id/billable/usage`.
 *
 * That Billable Usage API is alpha/restricted. Even tokens with
 * Account → Billing → Read often get:
 *   { code: 1171, message: "billable-usage.api.resource.insufficient_permissions" }
 * It must not be used for production Platform Costs.
 *
 * Prefer the GA billing history endpoint below; otherwise fall back to
 * PLATFORM_COST_CLOUDFLARE_INR_MONTH (default 0) with no user-facing API errors.
 */
async function fetchCloudflareBillingHistoryInr(opts: {
  fromIso: string;
  toIso: string;
}): Promise<{ ok: true; inr: number; rows: number } | { ok: false }> {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!token || !accountId) return { ok: false };

  const fromMs = Date.parse(opts.fromIso);
  const toMs = Date.parse(opts.toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return { ok: false };

  try {
    // GA billing history (Billing Read). Account-scoped; empty list is a valid $0 month.
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/billing/history`,
    );
    url.searchParams.set("per_page", "50");
    url.searchParams.set("page", "1");

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      success?: boolean;
      result?: Array<{
        amount?: number;
        occurred_at?: string;
        type?: string;
      }>;
    };

    if (!res.ok || json.success === false) {
      return { ok: false };
    }

    let usd = 0;
    let rows = 0;
    for (const row of json.result ?? []) {
      const at = row.occurred_at ? Date.parse(row.occurred_at) : NaN;
      if (!Number.isFinite(at) || at < fromMs || at > toMs) continue;
      usd += Number(row.amount ?? 0) || 0;
      rows += 1;
    }

    return { ok: true, inr: usd * USD_INR, rows };
  } catch {
    // Never surface transport/API errors into the dashboard.
    return { ok: false };
  }
}

function cloudflareConfiguredMonthlyLine(opts: {
  dayOfMonth: number;
  daysInMonth: number;
}): ProviderInvoiceLine {
  // Default 0 when unset — Free Workers / no invoice line, never an error state.
  const monthly = envMonthlyInr("PLATFORM_COST_CLOUDFLARE_INR_MONTH") ?? 0;
  const mtd = monthly * (opts.dayOfMonth / opts.daysInMonth);
  return {
    id: "cloudflare",
    label: "Cloudflare (configured)",
    mtdInr: mtd,
    last30dInr: monthly,
    projectedMonthInr: monthly,
    basis: "PLATFORM_COST_CLOUDFLARE_INR_MONTH",
    confidence: "snapshot",
    detail:
      "Automatic billing data unavailable. Using configured monthly cost.",
  };
}

async function fetchVercelBillingInr(opts: {
  fromIso: string;
  toIso: string;
}): Promise<{ ok: boolean; inr: number; detail: string } | null> {
  const token =
    process.env.VERCEL_TOKEN?.trim() || process.env.VERCEL_API_TOKEN?.trim();
  if (!token) return null;

  try {
    const params = new URLSearchParams({
      from: opts.fromIso,
      to: opts.toIso,
    });
    const teamId = process.env.VERCEL_TEAM_ID?.trim();
    if (teamId) params.set("teamId", teamId);

    const res = await fetch(
      `https://api.vercel.com/v1/billing/charges?${params}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/x-ndjson",
        },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        inr: 0,
        detail: `Vercel billing HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`,
      };
    }

    const raw = await res.text();
    let usd = 0;
    let rows = 0;
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as {
          BilledCost?: number;
          EffectiveCost?: number;
        };
        usd += Number(row.BilledCost ?? row.EffectiveCost ?? 0) || 0;
        rows += 1;
      } catch {
        // ignore non-json lines
      }
    }

    return {
      ok: true,
      inr: usd * USD_INR,
      detail: `Vercel /v1/billing/charges · ${rows} rows · $${usd.toFixed(4)}`,
    };
  } catch (error) {
    return {
      ok: false,
      inr: 0,
      detail:
        error instanceof Error ? error.message : "Vercel billing fetch failed",
    };
  }
}

/**
 * Provider invoice / billable usage lines for Platform Costs.
 * Prefers live billing APIs; falls back to PLATFORM_COST_*_INR_MONTH env.
 */
export async function getProviderInvoiceLines(opts: {
  dayOfMonth: number;
  daysInMonth: number;
  monthStartIso: string;
  nowIso: string;
  since30Iso: string;
}): Promise<ProviderInvoiceLine[]> {
  const lines: ProviderInvoiceLine[] = [];

  // Supabase — no public invoice API without org token; env monthly plan.
  const supabaseMonthly = envMonthlyInr("PLATFORM_COST_SUPABASE_INR_MONTH");
  if (supabaseMonthly != null) {
    const mtd = supabaseMonthly * (opts.dayOfMonth / opts.daysInMonth);
    lines.push({
      id: "supabase",
      label: "Supabase (invoice)",
      mtdInr: mtd,
      last30dInr: supabaseMonthly,
      projectedMonthInr: supabaseMonthly,
      basis: "PLATFORM_COST_SUPABASE_INR_MONTH",
      confidence: "snapshot",
      detail: `Fixed monthly ${supabaseMonthly}`,
    });
  } else {
    lines.push({
      id: "supabase",
      label: "Supabase (invoice)",
      mtdInr: 0,
      last30dInr: 0,
      projectedMonthInr: 0,
      basis: "Set PLATFORM_COST_SUPABASE_INR_MONTH or SUPABASE_ACCESS_TOKEN",
      confidence: "estimate",
      detail: "No Management billing token / monthly override",
    });
  }

  const vercelEnv = envMonthlyInr("PLATFORM_COST_VERCEL_INR_MONTH");
  const vercelApi = await fetchVercelBillingInr({
    fromIso: opts.monthStartIso,
    toIso: opts.nowIso,
  });
  if (vercelApi?.ok) {
    const mtd = vercelApi.inr;
    lines.push({
      id: "vercel",
      label: "Vercel (billing API)",
      mtdInr: mtd,
      last30dInr: mtd,
      projectedMonthInr: projectFromDaily(
        mtd,
        opts.dayOfMonth,
        opts.daysInMonth,
      ),
      basis: "GET /v1/billing/charges",
      confidence: "metered",
      detail: vercelApi.detail,
    });
  } else if (vercelEnv != null) {
    const mtd = vercelEnv * (opts.dayOfMonth / opts.daysInMonth);
    lines.push({
      id: "vercel",
      label: "Vercel (invoice)",
      mtdInr: mtd,
      last30dInr: vercelEnv,
      projectedMonthInr: vercelEnv,
      basis: "PLATFORM_COST_VERCEL_INR_MONTH",
      confidence: "snapshot",
      detail: `Fixed monthly ${vercelEnv}`,
    });
  } else {
    lines.push({
      id: "vercel",
      label: "Vercel (billing)",
      mtdInr: 0,
      last30dInr: 0,
      projectedMonthInr: 0,
      basis: "VERCEL_TOKEN + team billing OR PLATFORM_COST_VERCEL_INR_MONTH",
      confidence: "estimate",
      detail: "No Vercel billing access",
    });
  }

  // Cloudflare — never use /billable/usage (restricted). Prefer GA history, else env.
  const cfHistory = await fetchCloudflareBillingHistoryInr({
    fromIso: opts.monthStartIso,
    toIso: opts.nowIso,
  });
  const cfEnvOverride = envMonthlyInr("PLATFORM_COST_CLOUDFLARE_INR_MONTH");

  if (cfHistory.ok && (cfHistory.rows > 0 || cfEnvOverride == null)) {
    // Live history succeeded. Prefer charge rows when present; empty history with
    // no override means $0 MTD (typical Free Workers month).
    const mtd = cfHistory.rows > 0 ? cfHistory.inr : 0;
    lines.push({
      id: "cloudflare",
      label: "Cloudflare (billing history)",
      mtdInr: mtd,
      last30dInr: mtd,
      projectedMonthInr: projectFromDaily(
        mtd,
        opts.dayOfMonth,
        opts.daysInMonth,
      ),
      basis: "GET /accounts/:id/billing/history",
      confidence: "metered",
      detail:
        cfHistory.rows > 0
          ? `Billing history · ${cfHistory.rows} charges · FX ${USD_INR}`
          : "Billing history empty this period · ₹0",
    });
  } else if (cfHistory.ok && cfEnvOverride != null) {
    // History works but has no charges yet — honor fixed monthly override
    // (e.g. Workers Paid base fee that hasn't posted a history row).
    lines.push(cloudflareConfiguredMonthlyLine(opts));
  } else {
    lines.push(cloudflareConfiguredMonthlyLine(opts));
  }

  return lines;
}
