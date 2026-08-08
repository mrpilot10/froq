import "server-only";

import {
  aiFeatureLabel,
  estimateUsageInr,
  estimateUsageUsd,
  usdToInr,
} from "@/lib/admin/ai-pricing";
import { ADMIN_PRODUCTS, planToMrr, productLabel } from "@/lib/admin/plans";
import { changePercent } from "@/lib/admin/format";
import { getPlanById } from "@/lib/merchant/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MerchantProduct } from "@/lib/merchant/types";

export type SparkPoint = { t: string; v: number };

export type KpiMetric = {
  id: string;
  label: string;
  value: number;
  display: "currency" | "number" | "percent";
  previous: number | null;
  changePct: number | null;
  sparkline: SparkPoint[];
  hint?: string;
};

export type ExecutiveDashboard = {
  generatedAt: string;
  kpis: KpiMetric[];
  revenueByProduct: Array<{ product: string; label: string; mrr: number; count: number }>;
  revenueByPlan: Array<{ planId: string; name: string; mrr: number; count: number }>;
  adoption: {
    byProduct: Array<{ product: MerchantProduct; label: string; active: number; trial: number; paid: number }>;
    productCountBuckets: Array<{ products: number; merchants: number }>;
    combinations: Array<{ key: string; label: string; merchants: number }>;
  };
  recentMerchants: Array<{
    id: string;
    businessName: string;
    email: string | null;
    createdAt: string;
    products: string[];
  }>;
  liveEvents: Array<{
    id: string;
    kind: string;
    title: string;
    subtitle: string;
    at: string;
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
  cancel_at_period_end: boolean;
  current_period_end: string | null;
};

function daysAgo(n: number, from = new Date()): Date {
  return new Date(from.getTime() - n * 86_400_000);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function weekBuckets(weeks: number): { start: Date; label: string }[] {
  const out: { start: Date; label: string }[] = [];
  const now = startOfDay(new Date());
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = daysAgo(i * 7, now);
    out.push({
      start,
      label: start.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    });
  }
  return out;
}

function sparkFromTimestamps(timestamps: string[], weeks = 8): SparkPoint[] {
  const buckets = weekBuckets(weeks);
  return buckets.map((b, idx) => {
    const end = idx + 1 < buckets.length ? buckets[idx + 1].start : new Date();
    const v = timestamps.filter((iso) => {
      const t = new Date(iso).getTime();
      return t >= b.start.getTime() && t < end.getTime();
    }).length;
    return { t: b.label, v };
  });
}

function isTrialActive(row: ProductRow, now = new Date()): boolean {
  if (row.plan_id) return false;
  if (!row.trial_ends_at) return false;
  return new Date(row.trial_ends_at).getTime() > now.getTime();
}

function isPaidActive(row: ProductRow): boolean {
  return (
    row.status === "active" &&
    Boolean(row.plan_id) &&
    row.plan_id !== "free"
  );
}

export async function getExecutiveDashboard(): Promise<ExecutiveDashboard> {
  const admin = createAdminClient();
  const now = new Date();
  const d30 = daysAgo(30, now).toISOString();
  const d60 = daysAgo(60, now).toISOString();
  const d7 = daysAgo(7, now).toISOString();
  const d1 = daysAgo(1, now).toISOString();

  const [
    merchantsRes,
    branchesRes,
    customersRes,
    productsRes,
    customersRecentRes,
    aiUsageRes,
  ] = await Promise.all([
    admin.from("merchants").select("id, business_name, email, created_at, owner_user_id"),
    admin.from("branches").select("id, merchant_id, created_at, is_default"),
    admin.from("customers").select("id, merchant_id, member_since, banned", { count: "exact" }),
    admin
      .from("merchant_products")
      .select(
        "merchant_id, product, plan_id, status, purchased_at, trial_started_at, trial_ends_at, cancel_at_period_end, current_period_end",
      ),
    admin
      .from("customers")
      .select("id, member_since")
      .gte("member_since", d60)
      .limit(50_000),
    admin
      .from("ai_usage")
      .select("id, created_at, total_tokens, merchant_id")
      .gte("created_at", d30)
      .limit(20_000),
  ]);

  const merchants = merchantsRes.data ?? [];
  const branches = branchesRes.data ?? [];
  const products = (productsRes.data ?? []) as ProductRow[];
  const customerTotal = customersRes.count ?? (customersRes.data ?? []).length;
  const recentCustomerRows = customersRecentRes.data ?? [];
  const aiRows = aiUsageRes.data ?? [];

  const paidRows = products.filter(isPaidActive);
  const trialRows = products.filter((p) => isTrialActive(p, now));
  const cancelPending = products.filter(
    (p) => p.cancel_at_period_end && isPaidActive(p),
  );

  let mrr = 0;
  const byProductMrr = new Map<string, { mrr: number; count: number }>();
  const byPlanMrr = new Map<string, { mrr: number; count: number; name: string }>();

  for (const row of paidRows) {
    const amount = planToMrr(row.plan_id);
    mrr += amount;
    const pKey = row.product;
    const pCur = byProductMrr.get(pKey) ?? { mrr: 0, count: 0 };
    pCur.mrr += amount;
    pCur.count += 1;
    byProductMrr.set(pKey, pCur);

    const planId = row.plan_id!;
    const planCur = byPlanMrr.get(planId) ?? {
      mrr: 0,
      count: 0,
      name: getPlanById(planId).name,
    };
    planCur.mrr += amount;
    planCur.count += 1;
    byPlanMrr.set(planId, planCur);
  }

  // Approximate prior-period MRR: paid rows purchased before 30d ago still active.
  let prevMrr = 0;
  for (const row of paidRows) {
    if (row.purchased_at && row.purchased_at < d30) {
      prevMrr += planToMrr(row.plan_id);
    }
  }

  const arr = mrr * 12;
  const prevArr = prevMrr * 12;

  const activeMerchantIds = new Set(
    products
      .filter((p) => isPaidActive(p) || isTrialActive(p, now))
      .map((p) => p.merchant_id),
  );
  const merchantsPrevWindow = merchants.filter(
    (m) => m.created_at >= d60 && m.created_at < d30,
  ).length;
  const merchantsCurrWindow = merchants.filter((m) => m.created_at >= d30).length;

  const branchesCurr = branches.filter((b) => b.created_at >= d30).length;
  const branchesPrev = branches.filter(
    (b) => b.created_at >= d60 && b.created_at < d30,
  ).length;

  const customersCurr = recentCustomerRows.filter((c) => c.member_since >= d30).length;
  const customersPrev = recentCustomerRows.filter(
    (c) => c.member_since >= d60 && c.member_since < d30,
  ).length;

  const paidCurr = paidRows.filter((p) => p.purchased_at >= d30).length;
  const paidPrev = paidRows.filter(
    (p) => p.purchased_at >= d60 && p.purchased_at < d30,
  ).length;

  const trialsCurr = trialRows.filter(
    (p) => (p.trial_started_at ?? p.purchased_at) >= d30,
  ).length;
  const trialsPrev = trialRows.filter((p) => {
    const started = p.trial_started_at ?? p.purchased_at;
    return started >= d60 && started < d30;
  }).length;

  const churnRate =
    paidRows.length > 0 ? (cancelPending.length / paidRows.length) * 100 : 0;

  const merchantCreatedSpark = sparkFromTimestamps(merchants.map((m) => m.created_at));
  const paidSpark = sparkFromTimestamps(paidRows.map((p) => p.purchased_at));
  const customerSpark = sparkFromTimestamps(
    recentCustomerRows.map((c) => c.member_since),
  );
  const mrrSpark = paidSpark.map((p, i) => ({
    t: p.t,
    // Cumulative faux trend from paid activations — directional only.
    v: paidSpark.slice(0, i + 1).reduce((s, x) => s + x.v, 0),
  }));

  const kpis: KpiMetric[] = [
    {
      id: "mrr",
      label: "MRR",
      value: mrr,
      display: "currency",
      previous: prevMrr,
      changePct: changePercent(mrr, prevMrr),
      sparkline: mrrSpark,
      hint: "Normalized from active paid plans",
    },
    {
      id: "arr",
      label: "ARR",
      value: arr,
      display: "currency",
      previous: prevArr,
      changePct: changePercent(arr, prevArr),
      sparkline: mrrSpark.map((p) => ({ t: p.t, v: p.v * 12 })),
    },
    {
      id: "revenue",
      label: "Total Revenue",
      value: mrr,
      display: "currency",
      previous: prevMrr,
      changePct: changePercent(mrr, prevMrr),
      sparkline: mrrSpark,
      hint: "Replaced on dashboard with Razorpay ledger for the selected period",
    },
    {
      id: "merchants",
      label: "Active Merchants",
      value: activeMerchantIds.size,
      display: "number",
      previous: null,
      changePct: changePercent(merchantsCurrWindow, merchantsPrevWindow),
      sparkline: merchantCreatedSpark,
      hint: "Paid or on trial",
    },
    {
      id: "branches",
      label: "Active Branches",
      value: branches.length,
      display: "number",
      previous: null,
      changePct: changePercent(branchesCurr, branchesPrev),
      sparkline: sparkFromTimestamps(branches.map((b) => b.created_at)),
    },
    {
      id: "customers",
      label: "Total Customers",
      value: customerTotal,
      display: "number",
      previous: null,
      changePct: changePercent(customersCurr, customersPrev),
      sparkline: customerSpark,
    },
    {
      id: "paid_subs",
      label: "Paid Subscriptions",
      value: paidRows.length,
      display: "number",
      previous: null,
      changePct: changePercent(paidCurr, paidPrev),
      sparkline: paidSpark,
    },
    {
      id: "trials",
      label: "Free Trials",
      value: trialRows.length,
      display: "number",
      previous: null,
      changePct: changePercent(trialsCurr, trialsPrev),
      sparkline: sparkFromTimestamps(
        trialRows.map((t) => t.trial_started_at ?? t.purchased_at),
      ),
    },
    {
      id: "churn",
      label: "Scheduled Churn",
      value: churnRate,
      display: "percent",
      previous: null,
      changePct: null,
      sparkline: [],
      hint: `${cancelPending.length} cancel-at-period-end`,
    },
    {
      id: "ai_tokens",
      label: "AI Tokens (30d)",
      value: aiRows.reduce((s, r) => s + (r.total_tokens ?? 0), 0),
      display: "number",
      previous: null,
      changePct: null,
      sparkline: sparkFromTimestamps(aiRows.map((r) => r.created_at as string)),
      hint: "From ai_usage table",
    },
  ];

  // Adoption
  const byProductAdoption = ADMIN_PRODUCTS.map((product) => {
    const rows = products.filter((p) => p.product === product);
    return {
      product,
      label: productLabel(product),
      active: rows.filter((p) => isPaidActive(p) || isTrialActive(p, now)).length,
      trial: rows.filter((p) => isTrialActive(p, now)).length,
      paid: rows.filter(isPaidActive).length,
    };
  });

  const productsByMerchant = new Map<string, Set<string>>();
  for (const row of products) {
    if (!(isPaidActive(row) || isTrialActive(row, now))) continue;
    const set = productsByMerchant.get(row.merchant_id) ?? new Set();
    set.add(row.product);
    productsByMerchant.set(row.merchant_id, set);
  }

  const buckets = [1, 2, 3, 4].map((n) => ({
    products: n,
    merchants: [...productsByMerchant.values()].filter((s) => s.size === n).length,
  }));

  const comboCounts = new Map<string, number>();
  for (const set of productsByMerchant.values()) {
    const key = ADMIN_PRODUCTS.filter((p) => set.has(p)).join("+") || "none";
    comboCounts.set(key, (comboCounts.get(key) ?? 0) + 1);
  }
  const combinations = [...comboCounts.entries()]
    .map(([key, merchants]) => ({
      key,
      label: key
        .split("+")
        .map((p) => productLabel(p as MerchantProduct))
        .join(" · "),
      merchants,
    }))
    .sort((a, b) => b.merchants - a.merchants)
    .slice(0, 12);

  const merchantName = new Map(
    merchants.map((m) => [m.id as string, m.business_name as string]),
  );

  const recentMerchants = [...merchants]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 8)
    .map((m) => ({
      id: m.id as string,
      businessName: (m.business_name as string) || "Untitled",
      email: (m.email as string | null) ?? null,
      createdAt: m.created_at as string,
      products: [...(productsByMerchant.get(m.id as string) ?? [])].map((p) =>
        productLabel(p as MerchantProduct),
      ),
    }));

  // Lightweight live feed from recent rows
  const liveEvents: ExecutiveDashboard["liveEvents"] = [];
  for (const m of merchants.filter((x) => x.created_at >= d7).slice(0, 20)) {
    liveEvents.push({
      id: `m-${m.id}`,
      kind: "signup",
      title: "Merchant signup",
      subtitle: (m.business_name as string) || "New business",
      at: m.created_at as string,
    });
  }
  for (const p of paidRows.filter((x) => x.purchased_at >= d7).slice(0, 20)) {
    liveEvents.push({
      id: `p-${p.merchant_id}-${p.product}`,
      kind: "subscription",
      title: "Paid subscription",
      subtitle: `${merchantName.get(p.merchant_id) ?? "Merchant"} · ${productLabel(p.product)}`,
      at: p.purchased_at,
    });
  }
  for (const c of recentCustomerRows.filter((x) => x.member_since >= d1).slice(0, 15)) {
    liveEvents.push({
      id: `c-${c.id}`,
      kind: "customer",
      title: "Customer joined",
      subtitle: "Loyalty / guest profile",
      at: c.member_since as string,
    });
  }
  liveEvents.sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    generatedAt: now.toISOString(),
    kpis,
    revenueByProduct: ADMIN_PRODUCTS.map((product) => {
      const cur = byProductMrr.get(product) ?? { mrr: 0, count: 0 };
      return {
        product,
        label: productLabel(product),
        mrr: cur.mrr,
        count: cur.count,
      };
    }),
    revenueByPlan: [...byPlanMrr.entries()]
      .map(([planId, v]) => ({
        planId,
        name: v.name,
        mrr: v.mrr,
        count: v.count,
      }))
      .sort((a, b) => b.mrr - a.mrr),
    adoption: {
      byProduct: byProductAdoption,
      productCountBuckets: buckets,
      combinations,
    },
    recentMerchants,
    liveEvents: liveEvents.slice(0, 25),
  };
}

export type MerchantListItem = {
  id: string;
  businessName: string;
  email: string | null;
  createdAt: string;
  branchCount: number;
  customerCount: number;
  products: Array<{
    product: string;
    label: string;
    planId: string | null;
    status: "paid" | "trial" | "locked" | "canceled";
    mrr: number;
  }>;
  mrr: number;
  activityScore: number;
};

export async function listMerchants(opts?: {
  q?: string;
  limit?: number;
}): Promise<{ merchants: MerchantListItem[]; total: number }> {
  const admin = createAdminClient();
  const limit = opts?.limit ?? 100;
  const q = opts?.q?.trim().toLowerCase();

  const [merchantsRes, branchesRes, customersRes, productsRes] = await Promise.all([
    admin
      .from("merchants")
      .select("id, business_name, email, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    admin.from("branches").select("id, merchant_id"),
    admin.from("customers").select("id, merchant_id"),
    admin
      .from("merchant_products")
      .select(
        "merchant_id, product, plan_id, status, trial_ends_at, cancel_at_period_end",
      ),
  ]);

  const branchCount = new Map<string, number>();
  for (const b of branchesRes.data ?? []) {
    const id = b.merchant_id as string;
    branchCount.set(id, (branchCount.get(id) ?? 0) + 1);
  }
  const customerCount = new Map<string, number>();
  for (const c of customersRes.data ?? []) {
    const id = c.merchant_id as string;
    customerCount.set(id, (customerCount.get(id) ?? 0) + 1);
  }

  const productsByMerchant = new Map<string, ProductRow[]>();
  for (const row of (productsRes.data ?? []) as ProductRow[]) {
    const list = productsByMerchant.get(row.merchant_id) ?? [];
    list.push(row);
    productsByMerchant.set(row.merchant_id, list);
  }

  const now = new Date();
  let merchants: MerchantListItem[] = (merchantsRes.data ?? []).map((m) => {
    const id = m.id as string;
    const rows = productsByMerchant.get(id) ?? [];
    const products = rows.map((row) => {
      let status: MerchantListItem["products"][number]["status"] = "locked";
      if (row.status === "canceled") status = "canceled";
      else if (isPaidActive(row)) status = "paid";
      else if (isTrialActive(row, now)) status = "trial";
      return {
        product: row.product,
        label: productLabel(row.product),
        planId: row.plan_id,
        status,
        mrr: isPaidActive(row) ? planToMrr(row.plan_id) : 0,
      };
    });
    const mrr = products.reduce((s, p) => s + p.mrr, 0);
    const activityScore = Math.min(
      100,
      products.filter((p) => p.status === "paid" || p.status === "trial").length * 20 +
        Math.min(30, (branchCount.get(id) ?? 0) * 5) +
        Math.min(30, Math.log10((customerCount.get(id) ?? 0) + 1) * 12),
    );
    return {
      id,
      businessName: (m.business_name as string) || "Untitled",
      email: (m.email as string | null) ?? null,
      createdAt: m.created_at as string,
      branchCount: branchCount.get(id) ?? 0,
      customerCount: customerCount.get(id) ?? 0,
      products,
      mrr,
      activityScore: Math.round(activityScore),
    };
  });

  if (q) {
    merchants = merchants.filter(
      (m) =>
        m.businessName.toLowerCase().includes(q) ||
        (m.email?.toLowerCase().includes(q) ?? false),
    );
  }

  const total = merchants.length;
  return { merchants: merchants.slice(0, limit), total };
}

export async function listBranches(limit = 200) {
  const admin = createAdminClient();
  const { data: branches } = await admin
    .from("branches")
    .select("id, merchant_id, name, slug, created_at, is_default, address")
    .order("created_at", { ascending: false })
    .limit(limit);
  const { data: merchants } = await admin
    .from("merchants")
    .select("id, business_name");
  const nameById = new Map(
    (merchants ?? []).map((m) => [m.id as string, m.business_name as string]),
  );
  const rows = (branches ?? []).map((b) => ({
    id: b.id as string,
    name: (b.name as string) || "Branch",
    slug: b.slug as string,
    merchantId: b.merchant_id as string,
    businessName: nameById.get(b.merchant_id as string) ?? "—",
    createdAt: b.created_at as string,
    isDefault: Boolean(b.is_default),
    address: (b.address as string | null) ?? null,
  }));

  const merchantIds = new Set(rows.map((r) => r.merchantId));
  const avg =
    merchantIds.size > 0 ? rows.length / merchantIds.size : 0;

  return {
    branches: rows,
    total: rows.length,
    merchantCount: merchantIds.size,
    avgPerMerchant: avg,
  };
}

export async function listCustomers(limit = 200) {
  const admin = createAdminClient();
  const { data: customers, count } = await admin
    .from("customers")
    .select("id, merchant_id, name, phone, email, member_since, banned", {
      count: "exact",
    })
    .order("member_since", { ascending: false })
    .limit(limit);
  const { data: merchants } = await admin.from("merchants").select("id, business_name");
  const nameById = new Map(
    (merchants ?? []).map((m) => [m.id as string, m.business_name as string]),
  );
  const d30 = daysAgo(30).toISOString();
  const rows = customers ?? [];
  const new30 = rows.filter((c) => (c.member_since as string) >= d30).length;

  return {
    customers: rows.map((c) => ({
      id: c.id as string,
      name: (c.name as string) || "Guest",
      phone: c.phone as string,
      email: (c.email as string | null) ?? null,
      memberSince: c.member_since as string,
      banned: Boolean(c.banned),
      merchantId: c.merchant_id as string,
      businessName: nameById.get(c.merchant_id as string) ?? "—",
    })),
    total: count ?? rows.length,
    new30,
  };
}

type AiUsageFullRow = {
  id: string;
  merchant_id: string | null;
  feature: string;
  kind: string;
  model: string;
  prompt_tokens: number | null;
  response_tokens: number | null;
  thoughts_tokens: number | null;
  cached_tokens: number | null;
  total_tokens: number | null;
  created_at: string;
};

function dayBuckets(days: number): { start: Date; label: string }[] {
  const out: { start: Date; label: string }[] = [];
  const now = startOfDay(new Date());
  for (let i = days - 1; i >= 0; i -= 1) {
    const start = daysAgo(i, now);
    out.push({
      start,
      label: start.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    });
  }
  return out;
}

export type AiAnalytics = {
  generatedAt: string;
  windowDays: number;
  totals: {
    calls: number;
    tokens: number;
    estimatedUsd: number;
    estimatedInr: number;
    imageCalls: number;
    merchants: number;
    prevCalls: number;
    prevTokens: number;
    prevEstimatedInr: number;
  };
  byDay: Array<{ t: string; calls: number; tokens: number; costInr: number }>;
  byFeature: Array<{
    feature: string;
    label: string;
    calls: number;
    tokens: number;
    costInr: number;
  }>;
  byModel: Array<{ model: string; calls: number; tokens: number; costInr: number }>;
  topMerchants: Array<{
    merchantId: string;
    businessName: string;
    calls: number;
    tokens: number;
    costInr: number;
  }>;
  recent: Array<{
    id: string;
    at: string;
    feature: string;
    featureLabel: string;
    model: string;
    tokens: number;
    costInr: number;
    businessName: string | null;
  }>;
};

export async function getAiAnalytics(windowDays = 30): Promise<AiAnalytics> {
  const admin = createAdminClient();
  const now = new Date();
  const since = daysAgo(windowDays, now).toISOString();
  const prevSince = daysAgo(windowDays * 2, now).toISOString();

  const [usageRes, merchantsRes] = await Promise.all([
    admin
      .from("ai_usage")
      .select(
        "id, merchant_id, feature, kind, model, prompt_tokens, response_tokens, thoughts_tokens, cached_tokens, total_tokens, created_at",
      )
      .gte("created_at", prevSince)
      .order("created_at", { ascending: false })
      .limit(50_000),
    admin.from("merchants").select("id, business_name"),
  ]);

  const rows = (usageRes.data ?? []) as AiUsageFullRow[];
  const current = rows.filter((r) => r.created_at >= since);
  const previous = rows.filter((r) => r.created_at < since);

  const nameById = new Map(
    (merchantsRes.data ?? []).map((m) => [m.id as string, m.business_name as string]),
  );

  const sum = (list: AiUsageFullRow[]) => {
    let calls = 0;
    let tokens = 0;
    let estimatedUsd = 0;
    let imageCalls = 0;
    const merchants = new Set<string>();
    for (const row of list) {
      calls += 1;
      tokens += row.total_tokens ?? 0;
      estimatedUsd += estimateUsageUsd(row);
      if (row.kind === "image") imageCalls += 1;
      if (row.merchant_id) merchants.add(row.merchant_id);
    }
    return {
      calls,
      tokens,
      estimatedUsd,
      estimatedInr: usdToInr(estimatedUsd),
      imageCalls,
      merchants: merchants.size,
    };
  };

  const cur = sum(current);
  const prev = sum(previous);

  const buckets = dayBuckets(Math.min(windowDays, 30));
  const byDay = buckets.map((b, idx) => {
    const end = idx + 1 < buckets.length ? buckets[idx + 1].start : new Date();
    const slice = current.filter((r) => {
      const t = new Date(r.created_at).getTime();
      return t >= b.start.getTime() && t < end.getTime();
    });
    return {
      t: b.label,
      calls: slice.length,
      tokens: slice.reduce((s, r) => s + (r.total_tokens ?? 0), 0),
      costInr: slice.reduce((s, r) => s + estimateUsageInr(r), 0),
    };
  });

  const featureMap = new Map<
    string,
    { feature: string; label: string; calls: number; tokens: number; costInr: number }
  >();
  const modelMap = new Map<
    string,
    { model: string; calls: number; tokens: number; costInr: number }
  >();
  const merchantMap = new Map<
    string,
    { merchantId: string; businessName: string; calls: number; tokens: number; costInr: number }
  >();

  for (const row of current) {
    const tokens = row.total_tokens ?? 0;
    const costInr = estimateUsageInr(row);
    const f = row.feature || "other";
    const fCur = featureMap.get(f) ?? {
      feature: f,
      label: aiFeatureLabel(f),
      calls: 0,
      tokens: 0,
      costInr: 0,
    };
    fCur.calls += 1;
    fCur.tokens += tokens;
    fCur.costInr += costInr;
    featureMap.set(f, fCur);

    const model = row.model || "unknown";
    const mCur = modelMap.get(model) ?? { model, calls: 0, tokens: 0, costInr: 0 };
    mCur.calls += 1;
    mCur.tokens += tokens;
    mCur.costInr += costInr;
    modelMap.set(model, mCur);

    if (row.merchant_id) {
      const id = row.merchant_id;
      const businessName = nameById.get(id) ?? "Unknown merchant";
      const mer =
        merchantMap.get(id) ?? {
          merchantId: id,
          businessName,
          calls: 0,
          tokens: 0,
          costInr: 0,
        };
      mer.calls += 1;
      mer.tokens += tokens;
      mer.costInr += costInr;
      merchantMap.set(id, mer);
    }
  }

  return {
    generatedAt: now.toISOString(),
    windowDays,
    totals: {
      ...cur,
      prevCalls: prev.calls,
      prevTokens: prev.tokens,
      prevEstimatedInr: prev.estimatedInr,
    },
    byDay,
    byFeature: [...featureMap.values()].sort((a, b) => b.costInr - a.costInr),
    byModel: [...modelMap.values()].sort((a, b) => b.calls - a.calls),
    topMerchants: [...merchantMap.values()]
      .sort((a, b) => b.costInr - a.costInr)
      .slice(0, 15),
    recent: current.slice(0, 40).map((r) => ({
      id: r.id,
      at: r.created_at,
      feature: r.feature,
      featureLabel: aiFeatureLabel(r.feature),
      model: r.model,
      tokens: r.total_tokens ?? 0,
      costInr: estimateUsageInr(r),
      businessName: r.merchant_id ? (nameById.get(r.merchant_id) ?? null) : null,
    })),
  };
}

export type LiveFeedEvent = {
  id: string;
  kind: "signup" | "subscription" | "trial" | "customer" | "ai" | "churn";
  title: string;
  subtitle: string;
  at: string;
};

export type LiveFeed = {
  generatedAt: string;
  events: LiveFeedEvent[];
  counts: Record<LiveFeedEvent["kind"], number>;
};

export async function getLiveFeed(opts?: {
  days?: number;
  limit?: number;
}): Promise<LiveFeed> {
  const days = opts?.days ?? 14;
  const limit = opts?.limit ?? 80;
  const admin = createAdminClient();
  const now = new Date();
  const since = daysAgo(days, now).toISOString();
  const d1 = daysAgo(1, now).toISOString();

  const [merchantsRes, productsRes, customersRes, aiRes] = await Promise.all([
    admin
      .from("merchants")
      .select("id, business_name, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("merchant_products")
      .select(
        "merchant_id, product, plan_id, status, purchased_at, trial_started_at, trial_ends_at, cancel_at_period_end, current_period_end",
      )
      .gte("purchased_at", since)
      .limit(500),
    admin
      .from("customers")
      .select("id, merchant_id, name, member_since")
      .gte("member_since", since)
      .order("member_since", { ascending: false })
      .limit(300),
    admin
      .from("ai_usage")
      .select("id, merchant_id, feature, total_tokens, created_at")
      .gte("created_at", d1)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const merchants = merchantsRes.data ?? [];
  const products = (productsRes.data ?? []) as ProductRow[];
  const customers = customersRes.data ?? [];
  const aiRows = aiRes.data ?? [];

  const allMerchantIds = [
    ...new Set<string>([
      ...merchants.map((m) => m.id as string),
      ...products.map((p) => p.merchant_id),
      ...customers.map((c) => c.merchant_id as string),
      ...aiRows
        .map((a) => a.merchant_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ]),
  ];

  const nameById = new Map<string, string>();
  for (const m of merchants) {
    nameById.set(m.id as string, m.business_name as string);
  }
  if (allMerchantIds.length) {
    const { data: nameRows } = await admin
      .from("merchants")
      .select("id, business_name")
      .in("id", allMerchantIds.slice(0, 500));
    for (const m of nameRows ?? []) {
      nameById.set(m.id as string, m.business_name as string);
    }
  }

  const events: LiveFeedEvent[] = [];

  for (const m of merchants) {
    events.push({
      id: `signup-${m.id}`,
      kind: "signup",
      title: "Merchant signup",
      subtitle: (m.business_name as string) || "New business",
      at: m.created_at as string,
    });
  }

  for (const p of products) {
    const biz = nameById.get(p.merchant_id) ?? "Merchant";
    const label = productLabel(p.product);
    if (isPaidActive(p)) {
      events.push({
        id: `paid-${p.merchant_id}-${p.product}-${p.purchased_at}`,
        kind: "subscription",
        title: "Paid subscription",
        subtitle: `${biz} · ${label}${p.plan_id ? ` · ${getPlanById(p.plan_id).name}` : ""}`,
        at: p.purchased_at,
      });
    } else if (isTrialActive(p, now)) {
      events.push({
        id: `trial-${p.merchant_id}-${p.product}-${p.trial_started_at ?? p.purchased_at}`,
        kind: "trial",
        title: "Trial started",
        subtitle: `${biz} · ${label}`,
        at: p.trial_started_at ?? p.purchased_at,
      });
    }
    if (p.cancel_at_period_end && isPaidActive(p)) {
      events.push({
        id: `churn-${p.merchant_id}-${p.product}`,
        kind: "churn",
        title: "Cancel scheduled",
        subtitle: `${biz} · ${label} ends ${p.current_period_end ? new Date(p.current_period_end).toLocaleDateString("en-IN") : "at period end"}`,
        at: p.current_period_end ?? p.purchased_at,
      });
    }
  }

  for (const c of customers) {
    events.push({
      id: `cust-${c.id}`,
      kind: "customer",
      title: "Customer joined",
      subtitle: `${(c.name as string) || "Guest"} · ${nameById.get(c.merchant_id as string) ?? "Merchant"}`,
      at: c.member_since as string,
    });
  }

  // Collapse AI calls into spike-style feed items (top token burners in 24h)
  const aiByMerchant = new Map<string, { tokens: number; calls: number; lastAt: string }>();
  for (const row of aiRows) {
    const id = (row.merchant_id as string) || "_platform";
    const cur = aiByMerchant.get(id) ?? { tokens: 0, calls: 0, lastAt: row.created_at as string };
    cur.tokens += (row.total_tokens as number) ?? 0;
    cur.calls += 1;
    if ((row.created_at as string) > cur.lastAt) cur.lastAt = row.created_at as string;
    aiByMerchant.set(id, cur);
  }
  for (const [merchantId, agg] of [...aiByMerchant.entries()]
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .slice(0, 12)) {
    if (agg.calls < 3 && agg.tokens < 5_000) continue;
    events.push({
      id: `ai-${merchantId}-${agg.lastAt}`,
      kind: "ai",
      title: "AI usage spike (24h)",
      subtitle: `${merchantId === "_platform" ? "Unattributed" : nameById.get(merchantId) ?? "Merchant"} · ${agg.calls} calls · ${(agg.tokens).toLocaleString("en-IN")} tokens`,
      at: agg.lastAt,
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : -1));
  const trimmed = events.slice(0, limit);
  const counts: LiveFeed["counts"] = {
    signup: 0,
    subscription: 0,
    trial: 0,
    customer: 0,
    ai: 0,
    churn: 0,
  };
  for (const e of trimmed) counts[e.kind] += 1;

  return {
    generatedAt: now.toISOString(),
    events: trimmed,
    counts,
  };
}
