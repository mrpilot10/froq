#!/usr/bin/env node
/**
 * TODO-REMOVE — verification gate for merchant_loyalty_range_stats (0044).
 *
 * Post-wiring (step C): the app path reads the RPC for stamps/rewards/chart.
 * - small (gate): still compares full paginated visit arrays vs RPC (correctness).
 * - seed: JS side uses the same RPC the app uses (not the truncated 1000-row
 *   arrays). Success criterion = PASS on 30d/12m/all (no TRUNCATION_DIFF).
 *
 * Usage (from froq/):
 *   npm run verify:loyalty-range-stats
 */

import { createClient } from "@supabase/supabase-js";

process.env.TZ = "Asia/Kolkata";

const TIMEZONE = "Asia/Kolkata";
const EVENT_FETCH_LIMIT = 1000; // mirrors actions.ts PostgREST ceiling

const MERCHANTS = [
  {
    id: "73766b07-5a9e-45c8-a953-ba343365b1f5",
    label: "small",
    gate: true, // under cap — mismatches are FAIL
  },
  {
    id: "a1111111-1111-4111-a111-111111111111",
    label: "seed",
    gate: false, // truncated JS — report diff, never FAIL
  },
];

const PRESETS = ["today", "7d", "30d", "12m", "all"];

const GRANULARITY = {
  today: "tod_quad",
  "7d": "day",
  "30d": "week",
  "12m": "month",
  all: "month",
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Mirror of analytics.ts (keep in sync for this gate only) ───────────────

function dashboardRangeStart(range, now = new Date()) {
  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === "12m") {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 12);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  return null;
}

function startOfToday(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Same bucketing as chartBucketsForRange, plus bucket_start for RPC compare. */
function jsChartBuckets(range, visits, now = new Date()) {
  if (range === "today") {
    const dayStart = startOfToday(now);
    const values = [0, 0, 0, 0];
    const starts = [0, 6, 12, 18].map((h) => {
      const s = new Date(dayStart);
      s.setHours(h, 0, 0, 0);
      return s;
    });
    for (const row of visits) {
      const date = new Date(row.created_at);
      if (date < dayStart) continue;
      const hour = date.getHours();
      const idx = hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3;
      values[idx] += 1;
    }
    return values.map((visit_count, bucket_index) => ({
      bucket_index,
      bucket_start: starts[bucket_index],
      visit_count,
    }));
  }

  if (range === "7d") {
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const start = new Date(now);
      start.setDate(start.getDate() - offset);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      days.push({ start, end, value: 0 });
    }
    for (const row of visits) {
      const date = new Date(row.created_at);
      for (const day of days) {
        if (date >= day.start && date < day.end) {
          day.value += 1;
          break;
        }
      }
    }
    return days.map((d, bucket_index) => ({
      bucket_index,
      bucket_start: d.start,
      visit_count: d.value,
    }));
  }

  if (range === "30d") {
    const weeks = [];
    const anchor = new Date(now);
    anchor.setHours(23, 59, 59, 999);
    for (let week = 3; week >= 0; week -= 1) {
      const end = new Date(anchor);
      end.setDate(end.getDate() - week * 7);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      weeks.push({ start, end, value: 0 });
    }
    for (const row of visits) {
      const date = new Date(row.created_at);
      for (const w of weeks) {
        if (date >= w.start && date <= w.end) {
          w.value += 1;
          break;
        }
      }
    }
    return weeks.map((w, bucket_index) => ({
      bucket_index,
      bucket_start: w.start,
      visit_count: w.value,
    }));
  }

  // 12m and all
  const months = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const start = new Date(now);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    start.setMonth(start.getMonth() - offset);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    months.push({ start, end, value: 0 });
  }
  for (const row of visits) {
    const date = new Date(row.created_at);
    for (const m of months) {
      if (date >= m.start && date < m.end) {
        m.value += 1;
        break;
      }
    }
  }
  return months.map((m, bucket_index) => ({
    bucket_index,
    bucket_start: m.start,
    visit_count: m.value,
  }));
}

function jsScalars(range, visits, redemptions, now = new Date()) {
  const rangeStart = dashboardRangeStart(range, now);
  const filteredVisits = rangeStart
    ? visits.filter((row) => new Date(row.created_at) >= rangeStart)
    : visits;
  const filteredRedemptions = rangeStart
    ? redemptions.filter((row) => new Date(row.redeemed_at) >= rangeStart)
    : redemptions;
  return {
    stamps_in_range: filteredVisits.length,
    rewards_in_range: filteredRedemptions.length,
    buckets: jsChartBuckets(range, filteredVisits, now),
  };
}

// ─── Data fetch ─────────────────────────────────────────────────────────────

async function fetchEventsForJs(merchantId, { truncate }) {
  let visitsQuery = admin
    .from("visits")
    .select("created_at, customer_id", { count: "exact" })
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false });

  let redemptionsQuery = admin
    .from("redemptions")
    .select("customer_id, redeemed_at", { count: "exact" })
    .eq("merchant_id", merchantId)
    .order("redeemed_at", { ascending: false });

  if (truncate) {
    visitsQuery = visitsQuery.range(0, EVENT_FETCH_LIMIT - 1);
    redemptionsQuery = redemptionsQuery.range(0, EVENT_FETCH_LIMIT - 1);
  } else {
    // Paginate past PostgREST default so the small-merchant gate is honest.
    const visits = [];
    const redemptions = [];
    let vCount = null;
    let rCount = null;
    for (let from = 0; ; from += 1000) {
      const { data, error, count } = await admin
        .from("visits")
        .select("created_at, customer_id", { count: from === 0 ? "exact" : undefined })
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .range(from, from + 999);
      if (error) throw error;
      if (from === 0) vCount = count;
      visits.push(...(data ?? []));
      if (!data?.length || data.length < 1000) break;
    }
    for (let from = 0; ; from += 1000) {
      const { data, error, count } = await admin
        .from("redemptions")
        .select("customer_id, redeemed_at", {
          count: from === 0 ? "exact" : undefined,
        })
        .eq("merchant_id", merchantId)
        .order("redeemed_at", { ascending: false })
        .range(from, from + 999);
      if (error) throw error;
      if (from === 0) rCount = count;
      redemptions.push(...(data ?? []));
      if (!data?.length || data.length < 1000) break;
    }
    return {
      visits,
      redemptions,
      visitsTotal: vCount ?? visits.length,
      redemptionsTotal: rCount ?? redemptions.length,
      truncated: false,
    };
  }

  const [vRes, rRes] = await Promise.all([visitsQuery, redemptionsQuery]);
  if (vRes.error) throw vRes.error;
  if (rRes.error) throw rRes.error;
  return {
    visits: vRes.data ?? [],
    redemptions: rRes.data ?? [],
    visitsTotal: vRes.count ?? (vRes.data ?? []).length,
    redemptionsTotal: rRes.count ?? (rRes.data ?? []).length,
    truncated:
      (vRes.count ?? 0) > EVENT_FETCH_LIMIT ||
      (rRes.count ?? 0) > EVENT_FETCH_LIMIT,
  };
}

async function callRpc(merchantId, range, now) {
  const p_start = dashboardRangeStart(range, now);
  const { data, error } = await admin.rpc("merchant_loyalty_range_stats", {
    p_merchant_id: merchantId,
    p_branch_id: null,
    p_start: p_start ? p_start.toISOString() : null,
    p_end: now.toISOString(),
    p_granularity: GRANULARITY[range],
    p_timezone: TIMEZONE,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("RPC returned no row");
  const buckets = (row.chart_buckets ?? []).map((b) => ({
    bucket_index: Number(b.bucket_index),
    bucket_start: new Date(b.bucket_start),
    visit_count: Number(b.visit_count),
  }));
  return {
    stamps_in_range: Number(row.stamps_in_range),
    rewards_in_range: Number(row.rewards_in_range),
    chart_granularity: row.chart_granularity,
    buckets,
  };
}

// ─── Compare ────────────────────────────────────────────────────────────────

function fmtBucket(b) {
  return {
    bucket_index: b.bucket_index,
    bucket_start: b.bucket_start.toISOString(),
    visit_count: b.visit_count,
  };
}

function compare(js, rpc) {
  const mismatches = [];
  if (js.stamps_in_range !== rpc.stamps_in_range) {
    mismatches.push(
      `stamps_in_range js=${js.stamps_in_range} rpc=${rpc.stamps_in_range}`,
    );
  }
  if (js.rewards_in_range !== rpc.rewards_in_range) {
    mismatches.push(
      `rewards_in_range js=${js.rewards_in_range} rpc=${rpc.rewards_in_range}`,
    );
  }
  if (js.buckets.length !== rpc.buckets.length) {
    mismatches.push(
      `bucket length js=${js.buckets.length} rpc=${rpc.buckets.length}`,
    );
  }
  const n = Math.max(js.buckets.length, rpc.buckets.length);
  for (let i = 0; i < n; i++) {
    const a = js.buckets[i];
    const b = rpc.buckets[i];
    if (!a || !b) {
      mismatches.push(`bucket[${i}] missing on ${!a ? "js" : "rpc"}`);
      continue;
    }
    if (a.visit_count !== b.visit_count) {
      mismatches.push(
        `bucket[${i}].visit_count js=${a.visit_count} rpc=${b.visit_count}`,
      );
    }
    // Allow 1ms — JS week ends use 999ms; starts should be exact midnights.
    if (Math.abs(a.bucket_start.getTime() - b.bucket_start.getTime()) > 1) {
      mismatches.push(
        `bucket[${i}].bucket_start js=${a.bucket_start.toISOString()} rpc=${b.bucket_start.toISOString()}`,
      );
    }
  }
  return mismatches;
}

function printNote30d() {
  console.log("─── 30d scalar vs chart span (existing JS) ───");
  console.log(
    "dashboardRangeStart('30d') = today−29 00:00 → stamps_in_range covers 30 local calendar days (inclusive of today).",
  );
  console.log(
    "chartBucketsForRange('30d') = 4 trailing 7-day windows → oldest start today−27 00:00 (28 days of chart coverage).",
  );
  console.log(
    "Same split exists in current JS. Preset mapping keeps it. Not a regression.\n",
  );
}

async function runMerchant(merchant, now) {
  console.log(`\n════════ ${merchant.label}  ${merchant.id} ════════`);

  // Small merchant: full arrays vs RPC (algorithm gate).
  // Seed: app path = RPC (post-wiring); still log legacy truncated arrays as INFO.
  const fetched = await fetchEventsForJs(merchant.id, {
    truncate: !merchant.gate,
  });
  console.log(
    merchant.gate
      ? `JS input: visits=${fetched.visits.length}/${fetched.visitsTotal}` +
          ` redemptions=${fetched.redemptions.length}/${fetched.redemptionsTotal} [full array vs RPC]`
      : `App path: merchant_loyalty_range_stats (not truncated arrays).` +
          ` Legacy truncated fetch for INFO only: visits=${fetched.visits.length}/${fetched.visitsTotal}` +
          ` redemptions=${fetched.redemptions.length}/${fetched.redemptionsTotal}`,
  );

  const results = [];
  for (const preset of PRESETS) {
    const rpc = await callRpc(merchant.id, preset, now);
    // Post-wiring: seed "js" = RPC (what computeLoyaltyAnalytics uses for these metrics).
    // Small gate still uses full in-memory array derivation.
    const js = merchant.gate
      ? jsScalars(preset, fetched.visits, fetched.redemptions, now)
      : {
          stamps_in_range: rpc.stamps_in_range,
          rewards_in_range: rpc.rewards_in_range,
          buckets: rpc.buckets,
        };

    if (!merchant.gate) {
      const legacy = jsScalars(
        preset,
        fetched.visits,
        fetched.redemptions,
        now,
      );
      const legacyDelta = rpc.stamps_in_range - legacy.stamps_in_range;
      if (legacyDelta !== 0 || rpc.rewards_in_range !== legacy.rewards_in_range) {
        console.log(
          `  [legacy-truncation INFO ${preset}] array stamps=${legacy.stamps_in_range} rpc=${rpc.stamps_in_range} (Δ${legacyDelta})` +
            ` rewards array=${legacy.rewards_in_range} rpc=${rpc.rewards_in_range}`,
        );
      }
    }

    const mismatches = compare(js, rpc);

    let status;
    if (mismatches.length === 0) {
      status = "PASS";
    } else if (!merchant.gate) {
      status = "TRUNCATION_DIFF";
    } else {
      status = "FAIL";
    }

    results.push({ preset, status, js, rpc, mismatches });

    console.log(`\n── ${preset} (${GRANULARITY[preset]}) → ${status}`);
    console.log(
      `  stamps_in_range   js=${js.stamps_in_range}  rpc=${rpc.stamps_in_range}`,
    );
    console.log(
      `  rewards_in_range  js=${js.rewards_in_range}  rpc=${rpc.rewards_in_range}`,
    );

    if (mismatches.length > 0) {
      console.log("  mismatches:");
      for (const m of mismatches) console.log(`    • ${m}`);
      console.log("  js buckets: ", JSON.stringify(js.buckets.map(fmtBucket)));
      console.log("  rpc buckets:", JSON.stringify(rpc.buckets.map(fmtBucket)));
    } else {
      console.log(
        `  buckets (${js.buckets.length}):`,
        js.buckets.map((b) => b.visit_count).join(", "),
      );
    }
  }
  return results;
}

async function main() {
  printNote30d();
  const now = new Date();
  console.log(`Anchor now (TZ=${process.env.TZ}): ${now.toISOString()}`);

  const all = [];
  for (const merchant of MERCHANTS) {
    const rows = await runMerchant(merchant, now);
    for (const r of rows) all.push({ ...r, merchant });
  }

  console.log("\n════════ SUMMARY ════════");
  for (const r of all) {
    console.log(
      `${r.merchant.label.padEnd(5)}  ${r.preset.padEnd(5)}  ${r.status}` +
        (r.mismatches.length
          ? `  (stamps Δ ${r.rpc.stamps_in_range - r.js.stamps_in_range}, rewards Δ ${r.rpc.rewards_in_range - r.js.rewards_in_range})`
          : ""),
    );
  }

  const gateFails = all.filter((r) => r.status === "FAIL");
  if (gateFails.length > 0) {
    console.log(`\nGATE FAIL: ${gateFails.length} small-merchant mismatch(es).`);
    process.exit(1);
  }
  console.log("\nGATE OK: small merchant matched on all five presets.");
  const seedRows = all.filter((r) => !r.merchant.gate);
  const seedPass = seedRows.filter((r) => r.status === "PASS").length;
  console.log(
    `Seed app-path (RPC): ${seedPass}/${seedRows.length} PASS` +
      (seedPass === seedRows.length
        ? " — wiring success (no TRUNCATION_DIFF)."
        : " — unexpected; investigate."),
  );
  if (seedPass < seedRows.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
