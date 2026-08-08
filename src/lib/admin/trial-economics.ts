import "server-only";

import { estimateUsageInr } from "@/lib/admin/ai-pricing";
import { productLabel } from "@/lib/admin/plans";
import { USD_INR } from "@/lib/google/places-pricing";
import { FREE_PLAN } from "@/lib/merchant/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

export type TrialEconomics = {
  generatedAt: string;
  windowDays: number;
  funnel: {
    /** Product rows that ever started a trial. */
    trialsStarted: number;
    merchantsStarted: number;
    activeTrials: number;
    activeMerchants: number;
    converted: number;
    convertedMerchants: number;
    expiredUnconverted: number;
    /** converted / started (product rows). */
    conversionRate: number | null;
    /** Merchant-level: at least one paid plan after trial. */
    merchantConversionRate: number | null;
    startedLast30d: number;
    convertedLast30d: number;
    conversionRateLast30d: number | null;
  };
  byProduct: Array<{
    product: string;
    label: string;
    started: number;
    active: number;
    converted: number;
    expired: number;
    conversionRate: number | null;
    cost30dInr: number;
  }>;
  cost: {
    /** Spend in the last N days attributed to merchants currently on an active trial. */
    activeTrialMerchants30dInr: number;
    activeTrialMerchantsMtdInr: number;
    /** Spend that fell inside any trial window for merchants who started a trial. */
    duringTrialWindow30dInr: number;
    duringTrialWindowMtdInr: number;
    byChannel: {
      aiInr: number;
      whatsappInr: number;
      smsInr: number;
      placesInr: number;
    };
    costPerActiveTrialMerchantInr: number | null;
    /** during-trial 30d spend / conversions in window (rough CAC of trial burn). */
    costPerConversion30dInr: number | null;
  };
  topTrialSpenders: Array<{
    merchantId: string;
    businessName: string;
    products: string[];
    status: "active_trial" | "converted" | "expired";
    cost30dInr: number;
  }>;
};

type ProductRow = {
  merchant_id: string;
  product: string;
  plan_id: string | null;
  status: string;
  purchased_at: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
};

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function startOfMonthIso(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
  ).toISOString();
}

function isPaid(row: ProductRow): boolean {
  return (
    row.status === "active" &&
    Boolean(row.plan_id) &&
    row.plan_id !== FREE_PLAN.id
  );
}

function isActiveTrial(row: ProductRow, nowMs: number): boolean {
  if (row.plan_id) return false;
  if (!row.trial_ends_at) return false;
  return new Date(row.trial_ends_at).getTime() > nowMs;
}

function isExpiredTrial(row: ProductRow, nowMs: number): boolean {
  if (row.plan_id) return false;
  if (!row.trial_ends_at) return false;
  return new Date(row.trial_ends_at).getTime() <= nowMs;
}

function isConverted(row: ProductRow): boolean {
  return Boolean(row.trial_started_at) && isPaid(row);
}

function trialWindowEnd(row: ProductRow, nowMs: number): number {
  if (isPaid(row) && row.purchased_at) {
    // Payment closes the free trial for metering purposes.
    return new Date(row.purchased_at).getTime();
  }
  if (row.trial_ends_at) {
    return Math.min(new Date(row.trial_ends_at).getTime(), nowMs);
  }
  return nowMs;
}

function inAnyWindow(
  windows: Array<{ start: number; end: number }>,
  ts: number,
): boolean {
  return windows.some((w) => ts >= w.start && ts <= w.end);
}

function pct(numer: number, denom: number): number | null {
  if (!denom) return null;
  return (numer / denom) * 100;
}

export async function getTrialEconomics(
  windowDays = 30,
): Promise<TrialEconomics> {
  const admin = createAdminClient();
  const now = new Date();
  const nowMs = now.getTime();
  const since30 = daysAgoIso(windowDays);
  const monthStart = startOfMonthIso(now);
  const since30Ms = new Date(since30).getTime();
  const monthStartMs = new Date(monthStart).getTime();

  const [productsRes, merchantsRes, aiRes, waRes, smsRes, placesRes] =
    await Promise.all([
      admin
        .from("merchant_products")
        .select(
          "merchant_id, product, plan_id, status, purchased_at, trial_started_at, trial_ends_at",
        ),
      admin.from("merchants").select("id, business_name"),
      admin
        .from("ai_usage")
        .select(
          "merchant_id, kind, prompt_tokens, response_tokens, thoughts_tokens, cached_tokens, total_tokens, created_at",
        )
        .not("merchant_id", "is", null)
        .gte("created_at", since30)
        .limit(50_000),
      admin
        .from("whatsapp_message_log")
        .select("merchant_id, cost_inr, created_at")
        .not("merchant_id", "is", null)
        .gte("created_at", since30)
        .limit(50_000),
      admin
        .from("sms_send_log")
        .select("merchant_id, cost_inr, created_at")
        .not("merchant_id", "is", null)
        .gte("created_at", since30)
        .limit(50_000),
      admin
        .from("google_places_usage")
        .select("merchant_id, cost_usd, status, created_at")
        .not("merchant_id", "is", null)
        .gte("created_at", since30)
        .limit(50_000),
    ]);

  const products = (productsRes.data ?? []) as ProductRow[];
  const merchantName = new Map(
    (merchantsRes.data ?? []).map((m) => [
      String(m.id),
      String(m.business_name || "—"),
    ]),
  );

  const everTrial = products.filter((p) => Boolean(p.trial_started_at));
  const active = everTrial.filter((p) => isActiveTrial(p, nowMs));
  const converted = everTrial.filter((p) => isConverted(p));
  const expired = everTrial.filter((p) => isExpiredTrial(p, nowMs));

  const merchantsStarted = new Set(everTrial.map((p) => p.merchant_id));
  const activeMerchants = new Set(active.map((p) => p.merchant_id));
  const convertedMerchants = new Set(converted.map((p) => p.merchant_id));

  const startedLast30d = everTrial.filter(
    (p) =>
      p.trial_started_at &&
      new Date(p.trial_started_at).getTime() >= since30Ms,
  );
  const convertedLast30d = converted.filter(
    (p) =>
      p.purchased_at && new Date(p.purchased_at).getTime() >= since30Ms,
  );

  // Per merchant: union of trial windows.
  const windowsByMerchant = new Map<
    string,
    Array<{ start: number; end: number; product: string }>
  >();
  for (const row of everTrial) {
    const start = new Date(row.trial_started_at!).getTime();
    const end = trialWindowEnd(row, nowMs);
    if (!Number.isFinite(start) || end < start) continue;
    const list = windowsByMerchant.get(row.merchant_id) ?? [];
    list.push({ start, end, product: row.product });
    windowsByMerchant.set(row.merchant_id, list);
  }

  const costByMerchant = new Map<
    string,
    { total: number; duringTrial: number; mtdDuring: number; mtdActive: number }
  >();

  const ensure = (id: string) => {
    const cur = costByMerchant.get(id) ?? {
      total: 0,
      duringTrial: 0,
      mtdDuring: 0,
      mtdActive: 0,
    };
    costByMerchant.set(id, cur);
    return cur;
  };

  const addCost = (
    merchantId: string | null | undefined,
    createdAt: string,
    amount: number,
  ) => {
    if (!merchantId || !(amount > 0)) return;
    const ts = new Date(createdAt).getTime();
    const windows = windowsByMerchant.get(merchantId);
    const cur = ensure(merchantId);

    if (activeMerchants.has(merchantId)) {
      cur.total += amount;
      if (ts >= monthStartMs) cur.mtdActive += amount;
    }

    if (windows && inAnyWindow(windows, ts)) {
      cur.duringTrial += amount;
      if (ts >= monthStartMs) cur.mtdDuring += amount;
    }
  };

  for (const row of aiRes.data ?? []) {
    addCost(
      row.merchant_id as string,
      String(row.created_at),
      estimateUsageInr(row as Parameters<typeof estimateUsageInr>[0]),
    );
  }
  for (const row of waRes.data ?? []) {
    addCost(
      row.merchant_id as string,
      String(row.created_at),
      Number(row.cost_inr) || 0,
    );
  }
  for (const row of smsRes.data ?? []) {
    addCost(
      row.merchant_id as string,
      String(row.created_at),
      Number(row.cost_inr) || 0,
    );
  }
  for (const row of placesRes.data ?? []) {
    if (row.status && row.status !== "ok") continue;
    addCost(
      row.merchant_id as string,
      String(row.created_at),
      (Number(row.cost_usd) || 0) * USD_INR,
    );
  }

  // Channel split for active-trial merchants (30d spend on those merchants).
  let aiInr = 0;
  let whatsappInr = 0;
  let smsInr = 0;
  let placesInr = 0;
  for (const row of aiRes.data ?? []) {
    if (!activeMerchants.has(String(row.merchant_id))) continue;
    aiInr += estimateUsageInr(row as Parameters<typeof estimateUsageInr>[0]);
  }
  for (const row of waRes.data ?? []) {
    if (!activeMerchants.has(String(row.merchant_id))) continue;
    whatsappInr += Number(row.cost_inr) || 0;
  }
  for (const row of smsRes.data ?? []) {
    if (!activeMerchants.has(String(row.merchant_id))) continue;
    smsInr += Number(row.cost_inr) || 0;
  }
  for (const row of placesRes.data ?? []) {
    if (!activeMerchants.has(String(row.merchant_id))) continue;
    if (row.status && row.status !== "ok") continue;
    placesInr += (Number(row.cost_usd) || 0) * USD_INR;
  }

  let activeTrialMerchants30dInr = 0;
  let activeTrialMerchantsMtdInr = 0;
  let duringTrialWindow30dInr = 0;
  let duringTrialWindowMtdInr = 0;
  for (const [merchantId, cur] of costByMerchant) {
    if (activeMerchants.has(merchantId)) {
      activeTrialMerchants30dInr += cur.total;
      activeTrialMerchantsMtdInr += cur.mtdActive;
    }
    duringTrialWindow30dInr += cur.duringTrial;
    duringTrialWindowMtdInr += cur.mtdDuring;
  }

  const productsSeen = new Set(everTrial.map((p) => p.product));
  const byProduct = [...productsSeen].map((product) => {
    const rows = everTrial.filter((p) => p.product === product);
    const started = rows.length;
    const activeN = rows.filter((p) => isActiveTrial(p, nowMs)).length;
    const convertedN = rows.filter((p) => isConverted(p)).length;
    const expiredN = rows.filter((p) => isExpiredTrial(p, nowMs)).length;
    // Cost of merchants who have this product on active trial.
    const merchantIds = new Set(
      rows.filter((p) => isActiveTrial(p, nowMs)).map((p) => p.merchant_id),
    );
    let cost30dInr = 0;
    for (const id of merchantIds) {
      cost30dInr += costByMerchant.get(id)?.total ?? 0;
    }
    return {
      product,
      label: productLabel(product),
      started,
      active: activeN,
      converted: convertedN,
      expired: expiredN,
      conversionRate: pct(convertedN, started),
      cost30dInr,
    };
  }).sort((a, b) => b.started - a.started);

  const statusForMerchant = (merchantId: string): "active_trial" | "converted" | "expired" => {
    const rows = everTrial.filter((p) => p.merchant_id === merchantId);
    if (rows.some((p) => isConverted(p))) return "converted";
    if (rows.some((p) => isActiveTrial(p, nowMs))) return "active_trial";
    return "expired";
  };

  const topTrialSpenders = [...costByMerchant.entries()]
    .map(([merchantId, cur]) => {
      const rows = everTrial.filter((p) => p.merchant_id === merchantId);
      return {
        merchantId,
        businessName: merchantName.get(merchantId) ?? "—",
        products: [...new Set(rows.map((r) => productLabel(r.product)))],
        status: statusForMerchant(merchantId),
        // Prefer during-trial attribution for the ranking.
        cost30dInr: cur.duringTrial || cur.total,
      };
    })
    .filter((r) => r.cost30dInr > 0)
    .sort((a, b) => b.cost30dInr - a.cost30dInr)
    .slice(0, 15);

  return {
    generatedAt: now.toISOString(),
    windowDays,
    funnel: {
      trialsStarted: everTrial.length,
      merchantsStarted: merchantsStarted.size,
      activeTrials: active.length,
      activeMerchants: activeMerchants.size,
      converted: converted.length,
      convertedMerchants: convertedMerchants.size,
      expiredUnconverted: expired.length,
      conversionRate: pct(converted.length, everTrial.length),
      merchantConversionRate: pct(
        convertedMerchants.size,
        merchantsStarted.size,
      ),
      startedLast30d: startedLast30d.length,
      convertedLast30d: convertedLast30d.length,
      conversionRateLast30d: pct(
        convertedLast30d.length,
        startedLast30d.length,
      ),
    },
    byProduct,
    cost: {
      activeTrialMerchants30dInr,
      activeTrialMerchantsMtdInr,
      duringTrialWindow30dInr,
      duringTrialWindowMtdInr,
      byChannel: { aiInr, whatsappInr, smsInr, placesInr },
      costPerActiveTrialMerchantInr:
        activeMerchants.size > 0
          ? activeTrialMerchants30dInr / activeMerchants.size
          : null,
      costPerConversion30dInr:
        convertedLast30d.length > 0
          ? duringTrialWindow30dInr / convertedLast30d.length
          : null,
    },
    topTrialSpenders,
  };
}
