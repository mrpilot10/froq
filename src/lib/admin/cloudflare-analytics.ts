import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type CloudflareWorkersDay = {
  day: string;
  requests: number;
  errors: number;
  subrequests: number;
  cpuTimeP50: number | null;
  cpuTimeP99: number | null;
};

export type CloudflareAiGatewayDay = {
  day: string;
  requests: number;
  cached: number;
  tokensIn: number;
  tokensOut: number;
};

export type TurnstileAnalytics = {
  windowDays: number;
  totals: {
    attempts: number;
    pass: number;
    fail: number;
    error: number;
    passRate: number | null;
  };
  byDay: Array<{
    day: string;
    pass: number;
    fail: number;
    error: number;
  }>;
  byErrorCode: Array<{ code: string; count: number }>;
  recent: Array<{
    id: string;
    at: string;
    status: string;
    errorCodes: string[];
    source: string | null;
  }>;
};

export type WorkerAiProxyAnalytics = {
  windowDays: number;
  totals: {
    calls: number;
    promptTokens: number;
    totalTokens: number;
  };
  byDay: Array<{ day: string; calls: number; totalTokens: number }>;
  byFeature: Array<{ feature: string; calls: number; totalTokens: number }>;
};

export type CloudflareAnalytics = {
  windowDays: number;
  accountId: string | null;
  scriptName: string | null;
  tokenConfigured: boolean;
  workers: {
    status: "ready" | "missing" | "error" | "empty";
    detail: string;
    totals: {
      requests: number;
      errors: number;
      subrequests: number;
    };
    byDay: CloudflareWorkersDay[];
  };
  aiGateway: {
    status: "ready" | "missing" | "error" | "empty";
    detail: string;
    totals: {
      requests: number;
      tokensIn: number;
      tokensOut: number;
    };
    byDay: CloudflareAiGatewayDay[];
    byProvider: Array<{ provider: string; model: string; requests: number }>;
  };
  turnstile: TurnstileAnalytics;
  /** Gemini via froq-apoi worker (in-app ai_usage) — used when AI Gateway is empty. */
  workerAi: WorkerAiProxyAnalytics;
};

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function workerScriptName(): string {
  const explicit = process.env.CLOUDFLARE_WORKER_SCRIPT?.trim();
  if (explicit) return explicit;
  const url =
    process.env.AI_WORKER_URL?.trim() ||
    "https://froq-apoi.capt-tanmay10.workers.dev";
  try {
    const host = new URL(url).hostname;
    const name = host.split(".")[0];
    return name || "froq-apoi";
  } catch {
    return "froq-apoi";
  }
}

async function resolveAccountId(token: string): Promise<string | null> {
  const envId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (envId) return envId;

  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/accounts?per_page=5", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      success?: boolean;
      result?: Array<{ id?: string; name?: string }>;
    };
    if (!json.success || !json.result?.length) return null;
    return json.result[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      data?: T;
      errors?: Array<{ message?: string }>;
    };
    if (!res.ok) {
      return {
        data: null,
        error: `HTTP ${res.status}${json.errors?.[0]?.message ? `: ${json.errors[0].message}` : ""}`,
      };
    }
    if (json.errors?.length) {
      return {
        data: null,
        error: json.errors.map((e) => e.message).filter(Boolean).join("; ") || "GraphQL error",
      };
    }
    return { data: json.data ?? null, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "GraphQL fetch failed",
    };
  }
}

type WorkersGql = {
  viewer?: {
    accounts?: Array<{
      workersInvocationsAdaptive?: Array<{
        sum?: {
          requests?: number;
          errors?: number;
          subrequests?: number;
        };
        quantiles?: {
          cpuTimeP50?: number;
          cpuTimeP99?: number;
        };
        dimensions?: {
          datetime?: string;
          scriptName?: string;
          status?: string;
        };
      }>;
    }>;
  };
};

type AiGatewayGql = {
  viewer?: {
    accounts?: Array<{
      aiGatewayRequestsAdaptiveGroups?: Array<{
        count?: number;
        sum?: {
          cachedRequests?: number;
          uncachedTokensIn?: number;
          uncachedTokensOut?: number;
          cachedTokensIn?: number;
          cachedTokensOut?: number;
        };
        dimensions?: {
          datetimeHour?: string;
          provider?: string;
          model?: string;
          gateway?: string;
        };
      }>;
    }>;
  };
};

async function fetchWorkersSeries(
  token: string,
  accountId: string,
  scriptName: string,
  windowDays: number,
): Promise<CloudflareAnalytics["workers"]> {
  const start = daysAgoIso(windowDays);
  const end = new Date().toISOString();

  const query = `
    query WorkersAnalytics($accountTag: string!, $start: Time!, $end: Time!, $scriptName: string!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(
            limit: 10000
            filter: {
              datetime_geq: $start
              datetime_leq: $end
              scriptName: $scriptName
            }
          ) {
            sum { requests errors subrequests }
            quantiles { cpuTimeP50 cpuTimeP99 }
            dimensions { datetime scriptName status }
          }
        }
      }
    }
  `;

  const { data, error } = await graphql<WorkersGql>(token, query, {
    accountTag: accountId,
    start,
    end,
    scriptName,
  });

  if (error) {
    return {
      status: "error",
      detail: error,
      totals: { requests: 0, errors: 0, subrequests: 0 },
      byDay: [],
    };
  }

  const rows =
    data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];

  const byDay = new Map<string, CloudflareWorkersDay>();
  let requests = 0;
  let errors = 0;
  let subrequests = 0;

  for (const row of rows) {
    const day = dayKey(row.dimensions?.datetime ?? start);
    const req = Number(row.sum?.requests ?? 0) || 0;
    const err = Number(row.sum?.errors ?? 0) || 0;
    const sub = Number(row.sum?.subrequests ?? 0) || 0;
    requests += req;
    errors += err;
    subrequests += sub;

    const cur = byDay.get(day) ?? {
      day,
      requests: 0,
      errors: 0,
      subrequests: 0,
      cpuTimeP50: null,
      cpuTimeP99: null,
    };
    cur.requests += req;
    cur.errors += err;
    cur.subrequests += sub;
    const p50 = row.quantiles?.cpuTimeP50;
    const p99 = row.quantiles?.cpuTimeP99;
    if (typeof p50 === "number") {
      cur.cpuTimeP50 =
        cur.cpuTimeP50 == null ? p50 : (cur.cpuTimeP50 + p50) / 2;
    }
    if (typeof p99 === "number") {
      cur.cpuTimeP99 =
        cur.cpuTimeP99 == null ? p99 : Math.max(cur.cpuTimeP99, p99);
    }
    byDay.set(day, cur);
  }

  const series = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));

  return {
    status: series.length ? "ready" : "empty",
    detail: series.length
      ? `${scriptName} · ${requests} requests / ${windowDays}d`
      : `No invocations for ${scriptName} in last ${windowDays}d`,
    totals: { requests, errors, subrequests },
    byDay: series,
  };
}

async function fetchAiGatewaySeries(
  token: string,
  accountId: string,
  windowDays: number,
): Promise<CloudflareAnalytics["aiGateway"]> {
  const start = daysAgoIso(windowDays);
  const end = new Date().toISOString();

  const query = `
    query AiGatewayAnalytics($accountTag: string!, $start: Time!, $end: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          aiGatewayRequestsAdaptiveGroups(
            limit: 5000
            filter: {
              datetimeHour_geq: $start
              datetimeHour_leq: $end
            }
            orderBy: [datetimeHour_ASC]
          ) {
            count
            sum {
              cachedRequests
              uncachedTokensIn
              uncachedTokensOut
              cachedTokensIn
              cachedTokensOut
            }
            dimensions {
              datetimeHour
              provider
              model
              gateway
            }
          }
        }
      }
    }
  `;

  const { data, error } = await graphql<AiGatewayGql>(token, query, {
    accountTag: accountId,
    start,
    end,
  });

  if (error) {
    // Dataset may be unavailable if AI Gateway was never used — soft-empty.
    const soft =
      /does not exist|unknown field|not authorized|forbidden/i.test(error);
    return {
      status: soft ? "empty" : "error",
      detail: soft
        ? "AI Gateway not configured or no analytics access"
        : error,
      totals: { requests: 0, tokensIn: 0, tokensOut: 0 },
      byDay: [],
      byProvider: [],
    };
  }

  const rows =
    data?.viewer?.accounts?.[0]?.aiGatewayRequestsAdaptiveGroups ?? [];

  const byDay = new Map<string, CloudflareAiGatewayDay>();
  const byProvider = new Map<string, { provider: string; model: string; requests: number }>();
  let requests = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  for (const row of rows) {
    const count = Number(row.count ?? 0) || 0;
    const tin =
      (Number(row.sum?.uncachedTokensIn ?? 0) || 0) +
      (Number(row.sum?.cachedTokensIn ?? 0) || 0);
    const tout =
      (Number(row.sum?.uncachedTokensOut ?? 0) || 0) +
      (Number(row.sum?.cachedTokensOut ?? 0) || 0);
    const cached = Number(row.sum?.cachedRequests ?? 0) || 0;
    const day = dayKey(row.dimensions?.datetimeHour ?? start);

    requests += count;
    tokensIn += tin;
    tokensOut += tout;

    const cur = byDay.get(day) ?? {
      day,
      requests: 0,
      cached: 0,
      tokensIn: 0,
      tokensOut: 0,
    };
    cur.requests += count;
    cur.cached += cached;
    cur.tokensIn += tin;
    cur.tokensOut += tout;
    byDay.set(day, cur);

    const provider = row.dimensions?.provider || "unknown";
    const model = row.dimensions?.model || "—";
    const key = `${provider}::${model}`;
    const p = byProvider.get(key) ?? { provider, model, requests: 0 };
    p.requests += count;
    byProvider.set(key, p);
  }

  const series = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));

  return {
    status: series.length ? "ready" : "empty",
    detail: series.length
      ? `${requests} gateway requests / ${windowDays}d`
      : "No AI Gateway traffic (Froq proxies Gemini via Worker, not AI Gateway)",
    totals: { requests, tokensIn, tokensOut },
    byDay: series,
    byProvider: [...byProvider.values()].sort((a, b) => b.requests - a.requests),
  };
}

async function getTurnstileAnalytics(windowDays: number): Promise<TurnstileAnalytics> {
  const admin = createAdminClient();
  const since = daysAgoIso(windowDays);
  const { data, error } = await admin
    .from("turnstile_verify_log")
    .select("id, status, error_codes, source, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20_000);

  if (error) {
    console.error(
      JSON.stringify({
        scope: "admin",
        event: "turnstile_verify_log_query_failed",
        message: error.message,
        at: new Date().toISOString(),
      }),
    );
  }

  const rows = data ?? [];
  let pass = 0;
  let fail = 0;
  let err = 0;
  const byDay = new Map<string, { pass: number; fail: number; error: number }>();
  const codeCounts = new Map<string, number>();

  for (const row of rows) {
    const day = dayKey(String(row.created_at));
    const bucket = byDay.get(day) ?? { pass: 0, fail: 0, error: 0 };
    if (row.status === "pass") {
      pass += 1;
      bucket.pass += 1;
    } else if (row.status === "error") {
      err += 1;
      bucket.error += 1;
    } else {
      fail += 1;
      bucket.fail += 1;
    }
    byDay.set(day, bucket);

    const codes = (row.error_codes as string[] | null) ?? [];
    for (const code of codes) {
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }
  }

  const attempts = pass + fail + err;

  return {
    windowDays,
    totals: {
      attempts,
      pass,
      fail,
      error: err,
      passRate: attempts ? pass / attempts : null,
    },
    byDay: [...byDay.entries()]
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => b.day.localeCompare(a.day)),
    byErrorCode: [...codeCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    recent: rows.slice(0, 25).map((row) => ({
      id: String(row.id),
      at: String(row.created_at),
      status: String(row.status),
      errorCodes: (row.error_codes as string[] | null) ?? [],
      source: (row.source as string | null) ?? null,
    })),
  };
}

async function getWorkerAiProxyAnalytics(
  windowDays: number,
): Promise<WorkerAiProxyAnalytics> {
  const admin = createAdminClient();
  const since = daysAgoIso(windowDays);
  const { data, error } = await admin
    .from("ai_usage")
    .select("feature, prompt_tokens, total_tokens, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20_000);

  if (error) {
    console.error(
      JSON.stringify({
        scope: "admin",
        event: "ai_usage_cloudflare_query_failed",
        message: error.message,
        at: new Date().toISOString(),
      }),
    );
  }

  const rows = data ?? [];
  const byDay = new Map<string, { calls: number; totalTokens: number }>();
  const byFeature = new Map<string, { calls: number; totalTokens: number }>();
  let calls = 0;
  let promptTokens = 0;
  let totalTokens = 0;

  for (const row of rows) {
    const day = dayKey(String(row.created_at));
    const tokens = Number(row.total_tokens ?? 0) || 0;
    const prompt = Number(row.prompt_tokens ?? 0) || 0;
    calls += 1;
    totalTokens += tokens;
    promptTokens += prompt;

    const d = byDay.get(day) ?? { calls: 0, totalTokens: 0 };
    d.calls += 1;
    d.totalTokens += tokens;
    byDay.set(day, d);

    const feature = String(row.feature ?? "other");
    const f = byFeature.get(feature) ?? { calls: 0, totalTokens: 0 };
    f.calls += 1;
    f.totalTokens += tokens;
    byFeature.set(feature, f);
  }

  return {
    windowDays,
    totals: { calls, promptTokens, totalTokens },
    byDay: [...byDay.entries()]
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => b.day.localeCompare(a.day)),
    byFeature: [...byFeature.entries()]
      .map(([feature, v]) => ({ feature, ...v }))
      .sort((a, b) => b.calls - a.calls),
  };
}

export async function getCloudflareAnalytics(
  windowDays = 30,
): Promise<CloudflareAnalytics> {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim() || null;
  const scriptName = workerScriptName();

  const [turnstile, workerAi] = await Promise.all([
    getTurnstileAnalytics(windowDays),
    getWorkerAiProxyAnalytics(windowDays),
  ]);

  if (!token) {
    return {
      windowDays,
      accountId: null,
      scriptName,
      tokenConfigured: false,
      workers: {
        status: "missing",
        detail: "Set CLOUDFLARE_API_TOKEN for Workers GraphQL analytics",
        totals: { requests: 0, errors: 0, subrequests: 0 },
        byDay: [],
      },
      aiGateway: {
        status: "missing",
        detail: "Set CLOUDFLARE_API_TOKEN for AI Gateway analytics",
        totals: { requests: 0, tokensIn: 0, tokensOut: 0 },
        byDay: [],
        byProvider: [],
      },
      turnstile,
      workerAi,
    };
  }

  const accountId = await resolveAccountId(token);
  if (!accountId) {
    return {
      windowDays,
      accountId: null,
      scriptName,
      tokenConfigured: true,
      workers: {
        status: "error",
        detail: "Could not resolve account — set CLOUDFLARE_ACCOUNT_ID",
        totals: { requests: 0, errors: 0, subrequests: 0 },
        byDay: [],
      },
      aiGateway: {
        status: "error",
        detail: "Could not resolve account — set CLOUDFLARE_ACCOUNT_ID",
        totals: { requests: 0, tokensIn: 0, tokensOut: 0 },
        byDay: [],
        byProvider: [],
      },
      turnstile,
      workerAi,
    };
  }

  const [workers, aiGateway] = await Promise.all([
    fetchWorkersSeries(token, accountId, scriptName, windowDays),
    fetchAiGatewaySeries(token, accountId, windowDays),
  ]);

  return {
    windowDays,
    accountId,
    scriptName,
    tokenConfigured: true,
    workers,
    aiGateway,
    turnstile,
    workerAi,
  };
}
