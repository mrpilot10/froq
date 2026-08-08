import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  GOOGLE_PLACES_RATES_UPDATED_AT,
  GOOGLE_PLACES_USD_PER_REQUEST,
  USD_INR,
  type GooglePlacesKind,
} from "@/lib/google/places-pricing";

export type GooglePlacesUsageAnalytics = {
  windowDays: number;
  ratesUpdatedAt: string;
  totals: {
    calls: number;
    ok: number;
    failed: number;
    costUsd: number;
    costInr: number;
  };
  byKind: Array<{
    kind: string;
    label: string;
    rateUsd: number;
    calls: number;
    ok: number;
    failed: number;
    costUsd: number;
    costInr: number;
  }>;
  byDay: Array<{ day: string; calls: number; costUsd: number }>;
  recent: Array<{
    id: string;
    at: string;
    kind: string;
    path: string;
    status: string;
    costUsd: number;
    resultCount: number | null;
  }>;
};

const KIND_LABEL: Record<string, string> = {
  text_search: "Text search (onboarding)",
  place_details: "Place Details",
  autocomplete: "Autocomplete",
};

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function getGooglePlacesUsageAnalytics(
  windowDays = 30,
): Promise<GooglePlacesUsageAnalytics> {
  const admin = createAdminClient();
  const since = daysAgoIso(windowDays);
  const { data, error } = await admin
    .from("google_places_usage")
    .select(
      "id, kind, path, status, cost_usd, result_count, created_at",
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20_000);

  if (error) {
    console.error(
      JSON.stringify({
        scope: "admin",
        event: "google_places_usage_query_failed",
        message: error.message,
        at: new Date().toISOString(),
      }),
    );
  }

  const rows = data ?? [];
  const byKind = new Map<
    string,
    { calls: number; ok: number; failed: number; costUsd: number }
  >();
  const byDay = new Map<string, { calls: number; costUsd: number }>();

  let calls = 0;
  let ok = 0;
  let failed = 0;
  let costUsd = 0;

  for (const row of rows) {
    const kind = (row.kind as string) || "text_search";
    const isOk = row.status === "ok";
    const rowCost = Number(row.cost_usd) || 0;
    calls += 1;
    if (isOk) {
      ok += 1;
      costUsd += rowCost;
    } else {
      failed += 1;
    }

    const k = byKind.get(kind) ?? { calls: 0, ok: 0, failed: 0, costUsd: 0 };
    k.calls += 1;
    if (isOk) {
      k.ok += 1;
      k.costUsd += rowCost;
    } else {
      k.failed += 1;
    }
    byKind.set(kind, k);

    const day = (row.created_at as string).slice(0, 10);
    const d = byDay.get(day) ?? { calls: 0, costUsd: 0 };
    d.calls += 1;
    if (isOk) d.costUsd += rowCost;
    byDay.set(day, d);
  }

  const kinds: GooglePlacesKind[] = [
    "text_search",
    "place_details",
    "autocomplete",
  ];

  return {
    windowDays,
    ratesUpdatedAt: GOOGLE_PLACES_RATES_UPDATED_AT,
    totals: {
      calls,
      ok,
      failed,
      costUsd,
      costInr: costUsd * USD_INR,
    },
    byKind: kinds.map((kind) => {
      const cur = byKind.get(kind) ?? { calls: 0, ok: 0, failed: 0, costUsd: 0 };
      return {
        kind,
        label: KIND_LABEL[kind] ?? kind,
        rateUsd: GOOGLE_PLACES_USD_PER_REQUEST[kind],
        calls: cur.calls,
        ok: cur.ok,
        failed: cur.failed,
        costUsd: cur.costUsd,
        costInr: cur.costUsd * USD_INR,
      };
    }),
    byDay: [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 14)
      .map(([day, v]) => ({ day, calls: v.calls, costUsd: v.costUsd })),
    recent: rows.slice(0, 30).map((row) => ({
      id: row.id as string,
      at: row.created_at as string,
      kind: row.kind as string,
      path: row.path as string,
      status: row.status as string,
      costUsd: Number(row.cost_usd) || 0,
      resultCount: (row.result_count as number | null) ?? null,
    })),
  };
}
