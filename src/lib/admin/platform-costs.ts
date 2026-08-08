import "server-only";

import { estimateUsageInr } from "@/lib/admin/ai-pricing";
import {
  formatApitxtBalance,
  getApitxtBalance,
  type ApitxtBalance,
} from "@/lib/admin/apitxt-balance";
import { planToMrr } from "@/lib/admin/plans";
import { getProviderInvoiceLines } from "@/lib/admin/provider-invoices";
import { syncRazorpayPaymentLedger } from "@/lib/admin/razorpay-ledger";
import { USD_INR } from "@/lib/google/places-pricing";
import { FREE_PLAN } from "@/lib/merchant/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

export type PlatformCostLine = {
  id: string;
  label: string;
  category: "ai" | "messaging" | "apis" | "payments" | "infra" | "email";
  mtdInr: number;
  last30dInr: number;
  projectedMonthInr: number;
  basis: string;
  confidence: "metered" | "estimate" | "snapshot";
};

export type PlatformCostsOverview = {
  generatedAt: string;
  calendar: {
    dayOfMonth: number;
    daysInMonth: number;
    daysRemaining: number;
    monthLabel: string;
  };
  revenue: {
    mrrInr: number;
    paidSubscriptions: number;
    mtdEarnedInr: number;
    projectedMonthInr: number;
  };
  spend: {
    mtdInr: number;
    last30dInr: number;
    projectedMonthInr: number;
    dailyBurnInr: number;
    lines: PlatformCostLine[];
  };
  margin: {
    projectedGrossPct: number | null;
    projectedGrossInr: number;
    mtdGrossPct: number | null;
    mtdGrossInr: number;
    last30dSpendVsMrrPct: number | null;
  };
  runway: {
    mrrCoversMonthsOfSpend: number | null;
    cashFlowPositive: boolean;
    projectedMonthEndInr: number;
    messagingWalletInr: number | null;
    messagingDaysRemaining: number | null;
    messagingDailyBurnInr: number;
    cashMonthsRemaining: number | null;
    operatingCashInr: number | null;
    apitxt: ApitxtBalance;
    apitxtLabel: string;
  };
  byDay: Array<{
    day: string;
    spendInr: number;
    aiInr: number;
    whatsappInr: number;
    smsInr: number;
    emailInr: number;
    placesInr: number;
  }>;
  emailByDay: Array<{ day: string; sends: number; costInr: number }>;
  pending: string[];
};

function startOfMonthIso(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
  ).toISOString();
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function projectMonth(
  mtd: number,
  dayOfMonth: number,
  daysInMonth: number,
): number {
  if (dayOfMonth <= 0) return mtd;
  return (mtd / dayOfMonth) * daysInMonth;
}

function pct(numer: number, denom: number): number | null {
  if (!Number.isFinite(numer) || !Number.isFinite(denom) || denom === 0) {
    return null;
  }
  return (numer / denom) * 100;
}

function operatingCashFromEnv(): number | null {
  const raw = process.env.PLATFORM_CASH_INR?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function getPlatformCostsOverview(): Promise<PlatformCostsOverview> {
  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const daysRemaining = Math.max(0, daysInMonth - dayOfMonth);
  const monthLabel = now.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const admin = createAdminClient();
  const monthStart = startOfMonthIso(now);
  const since30 = daysAgoIso(30);
  const nowIso = now.toISOString();

  const [
    productsRes,
    aiMtdRes,
    ai30Res,
    waMtdRes,
    wa30Res,
    smsMtdRes,
    sms30Res,
    emailMtdRes,
    email30Res,
    placesMtdRes,
    places30Res,
    apitxt,
    razorpayFees,
    providerLines,
  ] = await Promise.all([
    admin
      .from("merchant_products")
      .select("plan_id, status")
      .eq("status", "active"),
    admin
      .from("ai_usage")
      .select(
        "kind, prompt_tokens, response_tokens, thoughts_tokens, cached_tokens, total_tokens, created_at",
      )
      .gte("created_at", monthStart)
      .limit(50_000),
    admin
      .from("ai_usage")
      .select(
        "kind, prompt_tokens, response_tokens, thoughts_tokens, cached_tokens, total_tokens, created_at",
      )
      .gte("created_at", since30)
      .limit(50_000),
    admin
      .from("whatsapp_message_log")
      .select("cost_inr, status, created_at")
      .gte("created_at", monthStart)
      .limit(50_000),
    admin
      .from("whatsapp_message_log")
      .select("cost_inr, status, created_at")
      .gte("created_at", since30)
      .limit(50_000),
    admin
      .from("sms_send_log")
      .select("cost_inr, status, created_at")
      .gte("created_at", monthStart)
      .limit(50_000),
    admin
      .from("sms_send_log")
      .select("cost_inr, status, created_at")
      .gte("created_at", since30)
      .limit(50_000),
    admin
      .from("email_send_log")
      .select("cost_inr, status, created_at")
      .gte("created_at", monthStart)
      .limit(50_000),
    admin
      .from("email_send_log")
      .select("cost_inr, status, created_at")
      .gte("created_at", since30)
      .limit(50_000),
    admin
      .from("google_places_usage")
      .select("cost_usd, status, created_at")
      .gte("created_at", monthStart)
      .limit(50_000),
    admin
      .from("google_places_usage")
      .select("cost_usd, status, created_at")
      .gte("created_at", since30)
      .limit(50_000),
    getApitxtBalance(),
    syncRazorpayPaymentLedger({
      monthStartIso: monthStart,
      since30Iso: since30,
    }),
    getProviderInvoiceLines({
      dayOfMonth,
      daysInMonth,
      monthStartIso: monthStart,
      nowIso,
      since30Iso: since30,
    }),
  ]);

  const paidSubs = (productsRes.data ?? []).filter(
    (p) =>
      p.status === "active" &&
      Boolean(p.plan_id) &&
      p.plan_id !== FREE_PLAN.id,
  );
  let mrrInr = 0;
  for (const row of paidSubs) {
    mrrInr += planToMrr(row.plan_id);
  }

  const sumAi = (
    rows: Array<{
      kind: string;
      prompt_tokens: number | null;
      response_tokens: number | null;
      thoughts_tokens: number | null;
      cached_tokens: number | null;
      total_tokens: number | null;
      created_at: string;
    }>,
  ) => {
    let total = 0;
    const byDay = new Map<string, number>();
    for (const row of rows) {
      const cost = estimateUsageInr(row);
      total += cost;
      const d = dayKey(row.created_at);
      byDay.set(d, (byDay.get(d) ?? 0) + cost);
    }
    return { total, byDay };
  };

  const sumCostLog = (
    rows: Array<{ cost_inr: number | null; created_at: string }>,
  ) => {
    let total = 0;
    const byDay = new Map<string, number>();
    for (const row of rows) {
      const cost = Number(row.cost_inr) || 0;
      total += cost;
      const d = dayKey(row.created_at);
      byDay.set(d, (byDay.get(d) ?? 0) + cost);
    }
    return { total, byDay };
  };

  const sumPlaces = (
    rows: Array<{
      cost_usd: number | null;
      status: string;
      created_at: string;
    }>,
  ) => {
    let total = 0;
    const byDay = new Map<string, number>();
    for (const row of rows) {
      if (row.status && row.status !== "ok") continue;
      const cost = (Number(row.cost_usd) || 0) * USD_INR;
      total += cost;
      const d = dayKey(row.created_at);
      byDay.set(d, (byDay.get(d) ?? 0) + cost);
    }
    return { total, byDay };
  };

  const aiMtd = sumAi(aiMtdRes.data ?? []);
  const ai30 = sumAi(ai30Res.data ?? []);
  const waMtd = sumCostLog(waMtdRes.data ?? []);
  const wa30 = sumCostLog(wa30Res.data ?? []);
  const smsMtd = sumCostLog(smsMtdRes.data ?? []);
  const sms30 = sumCostLog(sms30Res.data ?? []);
  const emailMtd = sumCostLog(emailMtdRes.data ?? []);
  const email30 = sumCostLog(email30Res.data ?? []);
  const placesMtd = sumPlaces(placesMtdRes.data ?? []);
  const places30 = sumPlaces(places30Res.data ?? []);

  const razorpayMtd = razorpayFees.mtdFeeInr + razorpayFees.mtdTaxInr;
  const razorpay30 = razorpayFees.last30dFeeInr + razorpayFees.last30dTaxInr;

  const lines: PlatformCostLine[] = [
    {
      id: "ai_gemini",
      label: "AI (Gemini via Worker)",
      category: "ai",
      mtdInr: aiMtd.total,
      last30dInr: ai30.total,
      projectedMonthInr: projectMonth(aiMtd.total, dayOfMonth, daysInMonth),
      basis: "ai_usage × Flash list prices",
      confidence: "estimate",
    },
    {
      id: "whatsapp",
      label: "WhatsApp (Meta India)",
      category: "messaging",
      mtdInr: waMtd.total,
      last30dInr: wa30.total,
      projectedMonthInr: projectMonth(waMtd.total, dayOfMonth, daysInMonth),
      basis: "whatsapp_message_log × category rates",
      confidence: "metered",
    },
    {
      id: "sms",
      label: "SMS (ApiTxt DLT)",
      category: "messaging",
      mtdInr: smsMtd.total,
      last30dInr: sms30.total,
      projectedMonthInr: projectMonth(smsMtd.total, dayOfMonth, daysInMonth),
      basis: "sms_send_log × APITXT_SMS_RATE_INR (default ₹0.15)",
      confidence: "metered",
    },
    {
      id: "email",
      label: "Email (Resend)",
      category: "email",
      mtdInr: emailMtd.total,
      last30dInr: email30.total,
      projectedMonthInr: projectMonth(emailMtd.total, dayOfMonth, daysInMonth),
      basis: "email_send_log × $0.40 / 1k emails",
      confidence: "estimate",
    },
    {
      id: "google_places",
      label: "Google Places",
      category: "apis",
      mtdInr: placesMtd.total,
      last30dInr: places30.total,
      projectedMonthInr: projectMonth(placesMtd.total, dayOfMonth, daysInMonth),
      basis: `google_places_usage × list price · FX ${USD_INR}`,
      confidence: "estimate",
    },
    {
      id: "razorpay_fees",
      label: "Razorpay fees + GST",
      category: "payments",
      mtdInr: razorpayMtd,
      last30dInr: razorpay30,
      projectedMonthInr: projectMonth(razorpayMtd, dayOfMonth, daysInMonth),
      basis: razorpayFees.error
        ? `Ledger sync error: ${razorpayFees.error}`
        : `razorpay_payment_ledger · ${razorpayFees.synced} synced`,
      confidence: "metered",
    },
    ...providerLines.map((p) => ({
      id: p.id,
      label: p.label,
      category: "infra" as const,
      mtdInr: p.mtdInr,
      last30dInr: p.last30dInr,
      projectedMonthInr: p.projectedMonthInr,
      basis: `${p.basis} · ${p.detail}`,
      confidence: p.confidence,
    })),
  ];

  const mtdInr = lines.reduce((s, l) => s + l.mtdInr, 0);
  const last30dInr = lines.reduce((s, l) => s + l.last30dInr, 0);
  const projectedSpendInr = lines.reduce((s, l) => s + l.projectedMonthInr, 0);
  const dailyBurnInr = dayOfMonth > 0 ? mtdInr / dayOfMonth : last30dInr / 30;

  const mtdEarned = mrrInr * (dayOfMonth / daysInMonth);
  const projectedRevenue = mrrInr;
  const mtdGrossInr = mtdEarned - mtdInr;
  const projectedGrossInr = projectedRevenue - projectedSpendInr;

  const messagingDaily =
    dayOfMonth > 0
      ? (waMtd.total + smsMtd.total) / dayOfMonth
      : (wa30.total + sms30.total) / 30;
  const wallet = apitxt.balance;
  const messagingDays =
    wallet != null && messagingDaily > 0 ? wallet / messagingDaily : null;

  const cashFlowPositive = projectedGrossInr >= 0;
  const monthlyNetBurn = Math.max(0, projectedSpendInr - projectedRevenue);
  const operatingCashInr = operatingCashFromEnv();
  const cashMonthsRemaining =
    operatingCashInr != null && monthlyNetBurn > 0
      ? operatingCashInr / monthlyNetBurn
      : null;

  const mrrCoversMonthsOfSpend =
    projectedSpendInr > 0 ? projectedRevenue / projectedSpendInr : null;

  const daySet = new Set<string>();
  for (const m of [
    ai30.byDay,
    wa30.byDay,
    sms30.byDay,
    email30.byDay,
    places30.byDay,
  ]) {
    for (const d of m.keys()) daySet.add(d);
  }

  const byDay = [...daySet]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 30)
    .map((day) => {
      const aiInr = ai30.byDay.get(day) ?? 0;
      const whatsappInr = wa30.byDay.get(day) ?? 0;
      const smsInr = sms30.byDay.get(day) ?? 0;
      const emailInr = email30.byDay.get(day) ?? 0;
      const placesInr = places30.byDay.get(day) ?? 0;
      return {
        day,
        aiInr,
        whatsappInr,
        smsInr,
        emailInr,
        placesInr,
        spendInr: aiInr + whatsappInr + smsInr + emailInr + placesInr,
      };
    });

  const emailByDayMap = new Map<string, { sends: number; costInr: number }>();
  for (const row of email30Res.data ?? []) {
    const day = dayKey(String(row.created_at));
    const cur = emailByDayMap.get(day) ?? { sends: 0, costInr: 0 };
    cur.sends += 1;
    cur.costInr += Number(row.cost_inr) || 0;
    emailByDayMap.set(day, cur);
  }
  const emailByDay = [...emailByDayMap.entries()]
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => b.day.localeCompare(a.day));

  const pending: string[] = [];
  if (!process.env.PLATFORM_COST_SUPABASE_INR_MONTH?.trim()) {
    pending.push(
      "Supabase invoice — set PLATFORM_COST_SUPABASE_INR_MONTH (no public invoice API)",
    );
  }
  const vercelLine = providerLines.find((p) => p.id === "vercel");
  if (vercelLine && vercelLine.mtdInr === 0 && vercelLine.confidence !== "metered") {
    pending.push(
      "Vercel billing — add VERCEL_TOKEN (billing scope) or PLATFORM_COST_VERCEL_INR_MONTH",
    );
  }
  const cfLine = providerLines.find((p) => p.id === "cloudflare");
  // Cloudflare Billable Usage API is restricted — not an unhealthy state.
  // Soft notice only when we are on the configured monthly fallback path.
  if (cfLine && cfLine.confidence !== "metered") {
    pending.push(
      "Automatic billing data unavailable. Using configured monthly cost.",
    );
  }

  return {
    generatedAt: nowIso,
    calendar: {
      dayOfMonth,
      daysInMonth,
      daysRemaining,
      monthLabel,
    },
    revenue: {
      mrrInr,
      paidSubscriptions: paidSubs.length,
      mtdEarnedInr: mtdEarned,
      projectedMonthInr: projectedRevenue,
    },
    spend: {
      mtdInr,
      last30dInr,
      projectedMonthInr: projectedSpendInr,
      dailyBurnInr,
      lines,
    },
    margin: {
      projectedGrossPct: pct(projectedGrossInr, projectedRevenue),
      projectedGrossInr,
      mtdGrossPct: pct(mtdGrossInr, mtdEarned),
      mtdGrossInr,
      last30dSpendVsMrrPct: pct(last30dInr, mrrInr),
    },
    runway: {
      mrrCoversMonthsOfSpend,
      cashFlowPositive,
      projectedMonthEndInr: projectedGrossInr,
      messagingWalletInr: wallet,
      messagingDaysRemaining: messagingDays,
      messagingDailyBurnInr: messagingDaily,
      cashMonthsRemaining,
      operatingCashInr,
      apitxt,
      apitxtLabel: formatApitxtBalance(apitxt),
    },
    byDay,
    emailByDay,
    pending,
  };
}
