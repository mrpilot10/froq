import "server-only";

import { planToMrr } from "@/lib/admin/plans";
import { syncRazorpayPaymentLedger } from "@/lib/admin/razorpay-ledger";
import { FREE_PLAN } from "@/lib/merchant/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

export type RevenueAnalytics = {
  generatedAt: string;
  syncedPayments: number;
  syncError: string | null;
  catalog: {
    mrrInr: number;
    arrInr: number;
    paidSubscriptions: number;
    trials: number;
    arpuInr: number;
  };
  ledger: {
    grossCapturedInr: number;
    grossCaptured30dInr: number;
    grossCapturedMtdInr: number;
    refundsInr: number;
    refunds30dInr: number;
    netCapturedInr: number;
    feesInr: number;
    failedPayments: number;
    failedPayments30d: number;
    capturedCount: number;
  };
  failedRenewals: {
    count30d: number;
    countAll: number;
    recent: Array<{
      at: string;
      subscriptionId: string;
      eventType: string;
      paymentId: string | null;
      amountInr: number | null;
      error: string | null;
    }>;
  };
  ltv: {
    /** Catalog ARPU ÷ monthly cancel-pending churn (proxy). */
    estimatedInr: number | null;
    monthlyChurnPct: number | null;
    /** Avg captured net per paying contact/email that has ≥1 captured payment. */
    avgNetPerPayerInr: number | null;
    payingCustomers: number;
  };
  byCountry: Array<{
    country: string;
    capturedInr: number;
    payments: number;
    sharePct: number;
  }>;
  byMethod: Array<{
    method: string;
    capturedInr: number;
    payments: number;
  }>;
  recentPayments: Array<{
    paymentId: string;
    at: string;
    status: string;
    amountInr: number;
    refundedInr: number;
    netInr: number;
    country: string | null;
    method: string | null;
  }>;
};

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function startOfMonthIso(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
  ).toISOString();
}

export async function getRevenueAnalytics(): Promise<RevenueAnalytics> {
  const admin = createAdminClient();
  const now = new Date();
  const monthStart = startOfMonthIso(now);
  const since30 = daysAgoIso(30);
  const since30Ms = new Date(since30).getTime();
  const monthStartMs = new Date(monthStart).getTime();

  const sync = await syncRazorpayPaymentLedger({
    monthStartIso: monthStart,
    since30Iso: since30,
    lookbackDays: 90,
  });

  const [productsRes, paymentsRes, eventsRes] = await Promise.all([
    admin
      .from("merchant_products")
      .select(
        "plan_id, status, trial_ends_at, cancel_at_period_end, trial_started_at",
      ),
    admin
      .from("razorpay_payment_ledger")
      .select(
        "payment_id, amount_inr, amount_refunded_inr, fee_inr, tax_inr, net_inr, status, method, country, email, contact, paid_at, error_description",
      )
      .order("paid_at", { ascending: false })
      .limit(10_000),
    admin
      .from("razorpay_subscription_events")
      .select(
        "subscription_id, event_type, payment_id, amount_inr, error_code, error_description, occurred_at",
      )
      .order("occurred_at", { ascending: false })
      .limit(500),
  ]);

  const products = productsRes.data ?? [];
  const nowMs = now.getTime();
  let mrrInr = 0;
  let paidSubscriptions = 0;
  let trials = 0;
  let cancelPending = 0;

  for (const p of products) {
    const paid =
      p.status === "active" &&
      Boolean(p.plan_id) &&
      p.plan_id !== FREE_PLAN.id;
    if (paid) {
      paidSubscriptions += 1;
      mrrInr += planToMrr(p.plan_id);
      if (p.cancel_at_period_end) cancelPending += 1;
    } else if (
      !p.plan_id &&
      p.trial_ends_at &&
      new Date(p.trial_ends_at).getTime() > nowMs
    ) {
      trials += 1;
    }
  }

  const arpuInr = paidSubscriptions > 0 ? mrrInr / paidSubscriptions : 0;
  const monthlyChurnPct =
    paidSubscriptions > 0 ? (cancelPending / paidSubscriptions) * 100 : null;
  const estimatedLtv =
    monthlyChurnPct != null && monthlyChurnPct > 0
      ? arpuInr / (monthlyChurnPct / 100)
      : arpuInr > 0
        ? arpuInr * 12
        : null;

  const payments = paymentsRes.data ?? [];
  let grossCapturedInr = 0;
  let grossCaptured30dInr = 0;
  let grossCapturedMtdInr = 0;
  let refundsInr = 0;
  let refunds30dInr = 0;
  let feesInr = 0;
  let failedPayments = 0;
  let failedPayments30d = 0;
  let capturedCount = 0;

  const byCountry = new Map<string, { capturedInr: number; payments: number }>();
  const byMethod = new Map<string, { capturedInr: number; payments: number }>();
  const payerNet = new Map<string, number>();

  for (const p of payments) {
    const amount = Number(p.amount_inr) || 0;
    const refunded = Number(p.amount_refunded_inr) || 0;
    const fee = (Number(p.fee_inr) || 0) + (Number(p.tax_inr) || 0);
    const paidAt = new Date(String(p.paid_at)).getTime();
    const status = String(p.status);

    if (status === "captured") {
      capturedCount += 1;
      grossCapturedInr += amount;
      refundsInr += refunded;
      feesInr += fee;
      if (paidAt >= since30Ms) {
        grossCaptured30dInr += amount;
        refunds30dInr += refunded;
      }
      if (paidAt >= monthStartMs) grossCapturedMtdInr += amount;

      const country = (p.country as string) || "IN";
      const c = byCountry.get(country) ?? { capturedInr: 0, payments: 0 };
      c.capturedInr += amount;
      c.payments += 1;
      byCountry.set(country, c);

      const method = (p.method as string) || "unknown";
      const m = byMethod.get(method) ?? { capturedInr: 0, payments: 0 };
      m.capturedInr += amount;
      m.payments += 1;
      byMethod.set(method, m);

      const payerKey =
        (typeof p.email === "string" && p.email) ||
        (typeof p.contact === "string" && p.contact) ||
        p.payment_id;
      payerNet.set(
        payerKey,
        (payerNet.get(payerKey) ?? 0) + (Number(p.net_inr) || amount - fee - refunded),
      );
    }

    if (status === "failed") {
      failedPayments += 1;
      if (paidAt >= since30Ms) failedPayments30d += 1;
    }
  }

  const payingCustomers = payerNet.size;
  const avgNetPerPayerInr =
    payingCustomers > 0
      ? [...payerNet.values()].reduce((s, n) => s + n, 0) / payingCustomers
      : null;

  const failedRenewalTypes = new Set([
    "payment.failed",
    "invoice.payment_failed",
    "subscription.halted",
    "subscription.pending",
  ]);
  const events = eventsRes.data ?? [];
  const failedRenewalEvents = events.filter((e) =>
    failedRenewalTypes.has(String(e.event_type)),
  );
  const failedRenewals30d = failedRenewalEvents.filter(
    (e) => new Date(String(e.occurred_at)).getTime() >= since30Ms,
  );

  const countryTotal = [...byCountry.values()].reduce(
    (s, c) => s + c.capturedInr,
    0,
  );

  return {
    generatedAt: now.toISOString(),
    syncedPayments: sync.synced,
    syncError: sync.error,
    catalog: {
      mrrInr,
      arrInr: mrrInr * 12,
      paidSubscriptions,
      trials,
      arpuInr,
    },
    ledger: {
      grossCapturedInr,
      grossCaptured30dInr,
      grossCapturedMtdInr,
      refundsInr,
      refunds30dInr,
      netCapturedInr: grossCapturedInr - refundsInr - feesInr,
      feesInr,
      failedPayments,
      failedPayments30d,
      capturedCount,
    },
    failedRenewals: {
      count30d: failedRenewals30d.length,
      countAll: failedRenewalEvents.length,
      recent: failedRenewalEvents.slice(0, 20).map((e) => ({
        at: String(e.occurred_at),
        subscriptionId: String(e.subscription_id),
        eventType: String(e.event_type),
        paymentId: (e.payment_id as string | null) ?? null,
        amountInr:
          e.amount_inr == null ? null : Number(e.amount_inr) || 0,
        error:
          (e.error_description as string | null) ||
          (e.error_code as string | null) ||
          null,
      })),
    },
    ltv: {
      estimatedInr: estimatedLtv,
      monthlyChurnPct,
      avgNetPerPayerInr,
      payingCustomers,
    },
    byCountry: [...byCountry.entries()]
      .map(([country, v]) => ({
        country,
        capturedInr: v.capturedInr,
        payments: v.payments,
        sharePct: countryTotal > 0 ? (v.capturedInr / countryTotal) * 100 : 0,
      }))
      .sort((a, b) => b.capturedInr - a.capturedInr),
    byMethod: [...byMethod.entries()]
      .map(([method, v]) => ({
        method,
        capturedInr: v.capturedInr,
        payments: v.payments,
      }))
      .sort((a, b) => b.capturedInr - a.capturedInr),
    recentPayments: payments.slice(0, 25).map((p) => ({
      paymentId: String(p.payment_id),
      at: String(p.paid_at),
      status: String(p.status),
      amountInr: Number(p.amount_inr) || 0,
      refundedInr: Number(p.amount_refunded_inr) || 0,
      netInr: Number(p.net_inr) || 0,
      country: (p.country as string | null) ?? null,
      method: (p.method as string | null) ?? null,
    })),
  };
}
