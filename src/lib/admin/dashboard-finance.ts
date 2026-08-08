import "server-only";

import { estimateUsageInr } from "@/lib/admin/ai-pricing";
import {
  adminPeriodWindow,
  periodLookbackDays,
  type AdminPeriod,
  type AdminPeriodWindow,
} from "@/lib/admin/period";
import { getProviderInvoiceLines } from "@/lib/admin/provider-invoices";
import { syncRazorpayPaymentLedger } from "@/lib/admin/razorpay-ledger";
import { USD_INR } from "@/lib/google/places-pricing";
import { createAdminClient } from "@/lib/supabase/admin";

export type DashboardFinance = {
  window: AdminPeriodWindow;
  generatedAt: string;
  revenue: {
    /** Gross captured in window (before fees / refunds). */
    grossInr: number;
    refundsInr: number;
    /** Gross − refunds. */
    netSalesInr: number;
    capturedCount: number;
  };
  deductions: {
    razorpayFeesInr: number;
    razorpayTaxInr: number;
    aiInr: number;
    whatsappInr: number;
    smsInr: number;
    emailInr: number;
    placesInr: number;
    /** Pro-rated / window-scaled infra (Supabase, Vercel, Cloudflare). */
    infraInr: number;
    totalInr: number;
  };
  /** Net sales − all deductions. */
  profitInr: number;
  profitMarginPct: number | null;
};

function startOfMonthIso(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
  ).toISOString();
}

function pct(numer: number, denom: number): number | null {
  if (!Number.isFinite(numer) || !Number.isFinite(denom) || denom === 0) {
    return null;
  }
  return (numer / denom) * 100;
}

function inWindow(iso: string, sinceIso: string | null): boolean {
  if (!sinceIso) return true;
  return iso >= sinceIso;
}

export async function getDashboardFinance(
  period: AdminPeriod = "30d",
): Promise<DashboardFinance> {
  const now = new Date();
  const window = adminPeriodWindow(period, now);
  const nowIso = now.toISOString();
  const monthStart = startOfMonthIso(now);
  const since30 = adminPeriodWindow("30d", now).sinceIso!;
  const lookback = periodLookbackDays(period);

  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();

  const admin = createAdminClient();

  await syncRazorpayPaymentLedger({
    monthStartIso: monthStart,
    since30Iso: since30,
    lookbackDays: lookback,
  });

  let paymentsQuery = admin
    .from("razorpay_payment_ledger")
    .select(
      "amount_inr, amount_refunded_inr, fee_inr, tax_inr, status, paid_at",
    )
    .eq("status", "captured")
    .order("paid_at", { ascending: false })
    .limit(50_000);

  if (window.sinceIso) {
    paymentsQuery = paymentsQuery.gte("paid_at", window.sinceIso);
  }

  const usageSince = window.sinceIso ?? new Date(0).toISOString();

  const [
    paymentsRes,
    aiRes,
    waRes,
    smsRes,
    emailRes,
    placesRes,
    providerLines,
  ] = await Promise.all([
    paymentsQuery,
    admin
      .from("ai_usage")
      .select(
        "kind, prompt_tokens, response_tokens, thoughts_tokens, cached_tokens, total_tokens, created_at",
      )
      .gte("created_at", usageSince)
      .limit(50_000),
    admin
      .from("whatsapp_message_log")
      .select("cost_inr, created_at")
      .gte("created_at", usageSince)
      .limit(50_000),
    admin
      .from("sms_send_log")
      .select("cost_inr, created_at")
      .gte("created_at", usageSince)
      .limit(50_000),
    admin
      .from("email_send_log")
      .select("cost_inr, created_at")
      .gte("created_at", usageSince)
      .limit(50_000),
    admin
      .from("google_places_usage")
      .select("cost_usd, status, created_at")
      .gte("created_at", usageSince)
      .limit(50_000),
    getProviderInvoiceLines({
      dayOfMonth,
      daysInMonth,
      monthStartIso: monthStart,
      nowIso,
      since30Iso: since30,
    }),
  ]);

  let grossInr = 0;
  let refundsInr = 0;
  let razorpayFeesInr = 0;
  let razorpayTaxInr = 0;
  let capturedCount = 0;

  for (const row of paymentsRes.data ?? []) {
    if (!inWindow(String(row.paid_at), window.sinceIso)) continue;
    capturedCount += 1;
    grossInr += Number(row.amount_inr) || 0;
    refundsInr += Number(row.amount_refunded_inr) || 0;
    razorpayFeesInr += Number(row.fee_inr) || 0;
    razorpayTaxInr += Number(row.tax_inr) || 0;
  }

  const netSalesInr = Math.max(0, grossInr - refundsInr);

  let aiInr = 0;
  for (const row of aiRes.data ?? []) {
    if (!inWindow(String(row.created_at), window.sinceIso)) continue;
    aiInr += estimateUsageInr(row);
  }

  const sumLog = (
    rows: Array<{ cost_inr: number | null; created_at: string } | null> | null,
  ) => {
    let total = 0;
    for (const row of rows ?? []) {
      if (!row) continue;
      if (!inWindow(String(row.created_at), window.sinceIso)) continue;
      total += Number(row.cost_inr) || 0;
    }
    return total;
  };

  const whatsappInr = sumLog(waRes.data as never);
  const smsInr = sumLog(smsRes.data as never);
  const emailInr = sumLog(emailRes.data as never);

  let placesInr = 0;
  for (const row of placesRes.data ?? []) {
    if (!inWindow(String(row.created_at), window.sinceIso)) continue;
    if (row.status && row.status !== "ok") continue;
    placesInr += (Number(row.cost_usd) || 0) * USD_INR;
  }

  // Scale 30d infra burn to the selected window (all-time ≈ 24 months of burn).
  const infra30 = providerLines.reduce((s, l) => s + l.last30dInr, 0);
  const scaleDays = window.days ?? 730;
  const infraInr = infra30 * (scaleDays / 30);

  const deductionsTotal =
    razorpayFeesInr +
    razorpayTaxInr +
    aiInr +
    whatsappInr +
    smsInr +
    emailInr +
    placesInr +
    infraInr;

  const profitInr = netSalesInr - deductionsTotal;

  return {
    window,
    generatedAt: nowIso,
    revenue: {
      grossInr,
      refundsInr,
      netSalesInr,
      capturedCount,
    },
    deductions: {
      razorpayFeesInr,
      razorpayTaxInr,
      aiInr,
      whatsappInr,
      smsInr,
      emailInr,
      placesInr,
      infraInr,
      totalInr: deductionsTotal,
    },
    profitInr,
    profitMarginPct: pct(profitInr, netSalesInr),
  };
}
