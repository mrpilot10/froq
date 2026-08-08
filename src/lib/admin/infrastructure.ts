import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCloudflareAnalytics } from "@/lib/admin/cloudflare-analytics";
import { getGooglePlacesUsageAnalytics } from "@/lib/admin/google-places-usage";
import {
  GOOGLE_PLACES_USD_PER_REQUEST,
  USD_INR,
} from "@/lib/google/places-pricing";

export type InfraStatus = "ready" | "degraded" | "missing" | "error";

export type InfraCheck = {
  id: string;
  label: string;
  status: InfraStatus;
  detail: string;
};

export type SupabaseInfraStats = {
  generatedAt: string | null;
  database: {
    name: string;
    sizeBytes: number;
    sizePretty: string;
    connectionsTotal: number;
    connectionsActive: number;
  } | null;
  tables: Array<{
    name: string;
    totalBytes: number;
    totalPretty: string;
    tableBytes: number;
    indexBytes: number;
    estimatedRows: number;
  }>;
  storage: {
    bucketCount: number;
    objectCount: number;
    totalBytes: number;
    totalPretty: string;
    buckets: Array<{
      id: string;
      name: string;
      public: boolean;
      objectCount: number;
      totalBytes: number;
      totalPretty: string;
      createdAt: string | null;
    }>;
    growth30d: Array<{
      day: string;
      objectsAdded: number;
      bytesAdded: number;
    }>;
  } | null;
  realtime: {
    publication: string;
    tableCount: number;
    tables: Array<{ schema: string; name: string }>;
    dbBackendsTotal: number;
    dbBackendsActive: number;
  } | null;
  cache: {
    indexHitRate: number | null;
    tableHitRate: number | null;
  } | null;
};

export type InfraProviderOverview = {
  id: "google" | "supabase" | "vercel" | "cloudflare";
  label: string;
  generatedAt: string;
  status: InfraStatus;
  summary: string;
  checks: InfraCheck[];
  metrics: Array<{ label: string; value: string; hint?: string }>;
  pending: string[];
  /** Present on Google APIs — Places usage rollups. */
  placesUsage?: import("@/lib/admin/google-places-usage").GooglePlacesUsageAnalytics;
  /** Present on Supabase — DB/storage/realtime RPC rollups. */
  supabaseStats?: SupabaseInfraStats;
  /** Present on Cloudflare — Workers / AI Gateway / Turnstile analytics. */
  cloudflareAnalytics?: import("@/lib/admin/cloudflare-analytics").CloudflareAnalytics;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

function parseSupabaseInfraStats(raw: unknown): SupabaseInfraStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const database = (r.database ?? null) as Record<string, unknown> | null;
  const storage = (r.storage ?? null) as Record<string, unknown> | null;
  const realtime = (r.realtime ?? null) as Record<string, unknown> | null;
  const cache = (r.cache ?? null) as Record<string, unknown> | null;

  const tablesRaw = Array.isArray(r.tables) ? r.tables : [];
  const bucketsRaw = Array.isArray(storage?.buckets) ? storage.buckets : [];
  const growthRaw = Array.isArray(storage?.growth_30d) ? storage.growth_30d : [];
  const rtTablesRaw = Array.isArray(realtime?.tables) ? realtime.tables : [];

  const totalBytes = Number(storage?.total_bytes ?? 0) || 0;

  return {
    generatedAt:
      typeof r.generated_at === "string" ? r.generated_at : null,
    database: database
      ? {
          name: String(database.name ?? "—"),
          sizeBytes: Number(database.size_bytes ?? 0) || 0,
          sizePretty: String(
            database.size_pretty ?? formatBytes(Number(database.size_bytes ?? 0)),
          ),
          connectionsTotal: Number(database.connections_total ?? 0) || 0,
          connectionsActive: Number(database.connections_active ?? 0) || 0,
        }
      : null,
    tables: tablesRaw.map((row) => {
      const t = row as Record<string, unknown>;
      return {
        name: String(t.name ?? "—"),
        totalBytes: Number(t.total_bytes ?? 0) || 0,
        totalPretty: String(
          t.total_pretty ?? formatBytes(Number(t.total_bytes ?? 0)),
        ),
        tableBytes: Number(t.table_bytes ?? 0) || 0,
        indexBytes: Number(t.index_bytes ?? 0) || 0,
        estimatedRows: Number(t.estimated_rows ?? 0) || 0,
      };
    }),
    storage: storage
      ? {
          bucketCount: Number(storage.bucket_count ?? 0) || 0,
          objectCount: Number(storage.object_count ?? 0) || 0,
          totalBytes,
          totalPretty: formatBytes(totalBytes),
          buckets: bucketsRaw.map((row) => {
            const b = row as Record<string, unknown>;
            const bytes = Number(b.total_bytes ?? 0) || 0;
            return {
              id: String(b.id ?? ""),
              name: String(b.name ?? "—"),
              public: Boolean(b.public),
              objectCount: Number(b.object_count ?? 0) || 0,
              totalBytes: bytes,
              totalPretty: String(b.total_pretty ?? formatBytes(bytes)),
              createdAt:
                typeof b.created_at === "string" ? b.created_at : null,
            };
          }),
          growth30d: growthRaw.map((row) => {
            const g = row as Record<string, unknown>;
            return {
              day: String(g.day ?? ""),
              objectsAdded: Number(g.objects_added ?? 0) || 0,
              bytesAdded: Number(g.bytes_added ?? 0) || 0,
            };
          }),
        }
      : null,
    realtime: realtime
      ? {
          publication: String(realtime.publication ?? "supabase_realtime"),
          tableCount: Number(realtime.table_count ?? 0) || 0,
          tables: rtTablesRaw.map((row) => {
            const t = row as Record<string, unknown>;
            return {
              schema: String(t.schema ?? "public"),
              name: String(t.name ?? "—"),
            };
          }),
          dbBackendsTotal: Number(realtime.db_backends_total ?? 0) || 0,
          dbBackendsActive: Number(realtime.db_backends_active ?? 0) || 0,
        }
      : null,
    cache: cache
      ? {
          indexHitRate:
            cache.index_hit_rate == null
              ? null
              : Number(cache.index_hit_rate),
          tableHitRate:
            cache.table_hit_rate == null
              ? null
              : Number(cache.table_hit_rate),
        }
      : null,
  };
}

function worstStatus(statuses: InfraStatus[]): InfraStatus {
  if (statuses.includes("error")) return "error";
  if (statuses.includes("missing")) return "missing";
  if (statuses.includes("degraded")) return "degraded";
  return "ready";
}

function workerBaseUrl(): string {
  return (
    process.env.AI_WORKER_URL?.trim() ||
    "https://froq-apoi.capt-tanmay10.workers.dev"
  ).replace(/\/$/, "");
}

async function probePlacesWorker(): Promise<InfraCheck> {
  const token = process.env.AI_WORKER_TOKEN?.trim();
  if (!token) {
    return {
      id: "places_worker",
      label: "Places worker",
      status: "missing",
      detail: "AI_WORKER_TOKEN not set",
    };
  }
  try {
    const res = await fetch(`${workerBaseUrl()}/places/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: "cafe", regionCode: "IN" }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        id: "places_worker",
        label: "Places worker",
        status: "error",
        detail: `HTTP ${res.status}`,
      };
    }
    return {
      id: "places_worker",
      label: "Places worker",
      status: "ready",
      detail: `${workerBaseUrl()}/places/search`,
    };
  } catch (error) {
    return {
      id: "places_worker",
      label: "Places worker",
      status: "error",
      detail: error instanceof Error ? error.message : "Probe failed",
    };
  }
}

export async function getGoogleInfrastructure(): Promise<InfraProviderOverview> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  const placesKey =
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();
  const workerToken = process.env.AI_WORKER_TOKEN?.trim();

  const placesProbe = await probePlacesWorker();
  const usage = await getGooglePlacesUsageAnalytics(30);

  const admin = createAdminClient();
  const [merchantsRes, branchesRes] = await Promise.all([
    admin
      .from("merchants")
      .select("id", { count: "exact", head: true })
      .not("google_place_id", "is", null),
    admin
      .from("branches")
      .select("id", { count: "exact", head: true })
      .not("google_place_id", "is", null),
  ]);

  const checks: InfraCheck[] = [
    {
      id: "google_identity",
      label: "Google Identity (Sign-In)",
      status: clientId ? "ready" : "missing",
      detail: clientId
        ? `Client ID …${clientId.slice(-8)}`
        : "NEXT_PUBLIC_GOOGLE_CLIENT_ID not set",
    },
    {
      id: "places_direct",
      label: "Places API key (direct)",
      status: placesKey ? "ready" : "degraded",
      detail: placesKey
        ? "GOOGLE_PLACES_API_KEY / GOOGLE_API_KEY present"
        : "Optional — worker path used when unset",
    },
    {
      id: "worker_token",
      label: "Worker Places proxy",
      status: workerToken ? "ready" : "missing",
      detail: workerToken ? "AI_WORKER_TOKEN present" : "AI_WORKER_TOKEN not set",
    },
    placesProbe,
    {
      id: "usage_metering",
      label: "Places usage metering",
      status: "ready",
      detail: `google_places_usage · ${usage.totals.calls} calls / ${usage.windowDays}d`,
    },
  ];

  return {
    id: "google",
    label: "Google APIs",
    generatedAt: new Date().toISOString(),
    status: worstStatus(checks.map((c) => c.status)),
    summary:
      "Identity + Places. Usage metered in-app (list-price estimate, not Cloud Billing).",
    checks,
    metrics: [
      {
        label: "Merchants with Place ID",
        value: String(merchantsRes.count ?? 0),
      },
      {
        label: "Branches with Place ID",
        value: String(branchesRes.count ?? 0),
      },
      {
        label: "Places calls (30d)",
        value: String(usage.totals.calls),
        hint: `${usage.totals.ok} ok · ${usage.totals.failed} failed`,
      },
      {
        label: "Est. cost (30d)",
        value: `$${(usage.totals.costUsd).toFixed(4)} / ₹${(usage.totals.costInr).toFixed(2)}`,
        hint: `Text search $${GOOGLE_PLACES_USD_PER_REQUEST.text_search}/req · Details $${GOOGLE_PLACES_USD_PER_REQUEST.place_details}/req · FX ${USD_INR}`,
      },
      {
        label: "Places path",
        value: placesKey ? "Direct API" : "Cloudflare worker",
      },
    ],
    pending: [
      "Optional: Cloud Billing BigQuery export for invoice-exact Places spend",
    ],
    placesUsage: usage,
  };
}

export async function getSupabaseInfrastructure(): Promise<InfraProviderOverview> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const projectRef = url?.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null;

  const checks: InfraCheck[] = [
    {
      id: "url",
      label: "Project URL",
      status: url ? "ready" : "missing",
      detail: url ?? "NEXT_PUBLIC_SUPABASE_URL not set",
    },
    {
      id: "anon",
      label: "Anon key",
      status: anon ? "ready" : "missing",
      detail: anon ? "Configured" : "NEXT_PUBLIC_SUPABASE_ANON_KEY not set",
    },
    {
      id: "service",
      label: "Service role",
      status: service ? "ready" : "missing",
      detail: service ? "Configured (server-only)" : "SUPABASE_SERVICE_ROLE_KEY not set",
    },
  ];

  let authDetail = "Skipped";
  let authStatus: InfraStatus = "missing";
  if (url && anon) {
    try {
      const res = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: anon },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as { version?: string };
      authStatus = res.ok ? "ready" : "error";
      authDetail = res.ok
        ? `GoTrue ${body.version ?? "ok"}`
        : `HTTP ${res.status}`;
    } catch (error) {
      authStatus = "error";
      authDetail = error instanceof Error ? error.message : "Health check failed";
    }
  }
  checks.push({
    id: "auth_health",
    label: "Auth health",
    status: authStatus,
    detail: authDetail,
  });

  let restStatus: InfraStatus = "missing";
  let restDetail = "Skipped";
  if (url && service) {
    try {
      const res = await fetch(`${url}/rest/v1/`, {
        headers: {
          apikey: service,
          Authorization: `Bearer ${service}`,
        },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      });
      restStatus = res.ok ? "ready" : "error";
      restDetail = res.ok ? "PostgREST reachable" : `HTTP ${res.status}`;
    } catch (error) {
      restStatus = "error";
      restDetail = error instanceof Error ? error.message : "REST probe failed";
    }
  }
  checks.push({
    id: "rest",
    label: "PostgREST",
    status: restStatus,
    detail: restDetail,
  });

  const admin = createAdminClient();
  const [merchants, branches, customers, products, aiUsage, waLog, statsRes] =
    await Promise.all([
      admin.from("merchants").select("id", { count: "exact", head: true }),
      admin.from("branches").select("id", { count: "exact", head: true }),
      admin.from("customers").select("id", { count: "exact", head: true }),
      admin.from("merchant_products").select("id", { count: "exact", head: true }),
      admin.from("ai_usage").select("id", { count: "exact", head: true }),
      admin.from("whatsapp_message_log").select("id", { count: "exact", head: true }),
      admin.rpc("admin_infra_stats"),
    ]);

  const statsError = statsRes.error;
  const supabaseStats = statsError
    ? null
    : parseSupabaseInfraStats(statsRes.data);

  checks.push({
    id: "infra_stats",
    label: "Infra stats RPC",
    status: supabaseStats
      ? "ready"
      : statsError
        ? "error"
        : "missing",
    detail: supabaseStats
      ? `DB ${supabaseStats.database?.sizePretty ?? "—"} · ${supabaseStats.storage?.objectCount ?? 0} storage objects`
      : statsError?.message ?? "admin_infra_stats unavailable",
  });

  const metrics: InfraProviderOverview["metrics"] = [
    { label: "Project", value: projectRef ?? "—" },
    {
      label: "Database size",
      value: supabaseStats?.database?.sizePretty ?? "—",
      hint: supabaseStats?.database
        ? `${supabaseStats.database.connectionsActive} active / ${supabaseStats.database.connectionsTotal} backends`
        : undefined,
    },
    {
      label: "Storage",
      value: supabaseStats?.storage?.totalPretty ?? "—",
      hint: supabaseStats?.storage
        ? `${supabaseStats.storage.bucketCount} buckets · ${supabaseStats.storage.objectCount} objects`
        : undefined,
    },
    {
      label: "Realtime tables",
      value: String(supabaseStats?.realtime?.tableCount ?? "—"),
      hint: supabaseStats?.realtime
        ? `${supabaseStats.realtime.dbBackendsActive} active DB backends (not WS peak)`
        : undefined,
    },
    { label: "Merchants", value: String(merchants.count ?? 0) },
    { label: "Branches", value: String(branches.count ?? 0) },
    { label: "Customers", value: String(customers.count ?? 0) },
    { label: "Product rows", value: String(products.count ?? 0) },
    { label: "AI usage rows", value: String(aiUsage.count ?? 0) },
    { label: "WhatsApp log rows", value: String(waLog.count ?? 0) },
  ];

  if (supabaseStats?.cache?.indexHitRate != null) {
    metrics.push({
      label: "Index cache hit",
      value: `${(supabaseStats.cache.indexHitRate * 100).toFixed(1)}%`,
      hint:
        supabaseStats.cache.tableHitRate != null
          ? `Table hit ${(supabaseStats.cache.tableHitRate * 100).toFixed(1)}%`
          : undefined,
    });
  }

  return {
    id: "supabase",
    label: "Supabase",
    generatedAt: new Date().toISOString(),
    status: worstStatus(checks.map((c) => c.status)),
    summary:
      "Auth, Postgres, Storage, Realtime — live health + admin_infra_stats RPC.",
    checks,
    metrics,
    pending: [
      "Egress / invoice billing (needs SUPABASE_ACCESS_TOKEN Management API)",
      "Realtime WebSocket peak connections (dashboard / Management usage)",
    ],
    supabaseStats: supabaseStats ?? undefined,
  };
}

export async function getVercelInfrastructure(): Promise<InfraProviderOverview> {
  const token =
    process.env.VERCEL_TOKEN?.trim() || process.env.VERCEL_API_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const projectId =
    process.env.VERCEL_PROJECT_ID?.trim() || process.env.VERCEL_PROJECT_NAME?.trim();

  const checks: InfraCheck[] = [
    {
      id: "app_url",
      label: "APP_URL / site",
      status:
        process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim()
          ? "ready"
          : "degraded",
      detail:
        process.env.APP_URL?.trim() ||
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        "No APP_URL set",
    },
    {
      id: "vercel_runtime",
      label: "Vercel runtime env",
      status: process.env.VERCEL ? "ready" : "degraded",
      detail: process.env.VERCEL
        ? `${process.env.VERCEL_ENV ?? "unknown"} · ${process.env.VERCEL_URL ?? "no url"}`
        : "Not running on Vercel (local/dev)",
    },
    {
      id: "api_token",
      label: "Vercel API token",
      status: token ? "ready" : "missing",
      detail: token
        ? "VERCEL_TOKEN present — fetching deployments"
        : "Optional VERCEL_TOKEN for deploy history",
    },
  ];

  const metrics: InfraProviderOverview["metrics"] = [
    {
      label: "Environment",
      value: process.env.VERCEL_ENV || process.env.NODE_ENV || "—",
    },
    {
      label: "Commit",
      value: process.env.VERCEL_GIT_COMMIT_SHA
        ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
        : "—",
      hint: process.env.VERCEL_GIT_COMMIT_REF || undefined,
    },
    {
      label: "Deployment URL",
      value: process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.APP_URL?.trim() || "—",
    },
  ];

  if (token) {
    try {
      const params = new URLSearchParams({ limit: "8" });
      if (teamId) params.set("teamId", teamId);
      if (projectId) params.set("projectId", projectId);
      const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!res.ok) {
        checks.push({
          id: "deployments",
          label: "Deployments API",
          status: "error",
          detail: `HTTP ${res.status}`,
        });
      } else {
        const json = (await res.json()) as {
          deployments?: Array<{
            uid?: string;
            name?: string;
            url?: string;
            state?: string;
            readyState?: string;
            created?: number;
            meta?: { githubCommitMessage?: string };
          }>;
        };
        const deployments = json.deployments ?? [];
        checks.push({
          id: "deployments",
          label: "Deployments API",
          status: "ready",
          detail: `${deployments.length} recent deployments`,
        });
        for (const d of deployments.slice(0, 5)) {
          metrics.push({
            label: d.readyState || d.state || "deploy",
            value: d.url ? `https://${d.url}` : d.uid || "—",
            hint: d.meta?.githubCommitMessage?.slice(0, 80),
          });
        }
      }
    } catch (error) {
      checks.push({
        id: "deployments",
        label: "Deployments API",
        status: "error",
        detail: error instanceof Error ? error.message : "Fetch failed",
      });
    }
  }

  return {
    id: "vercel",
    label: "Vercel",
    generatedAt: new Date().toISOString(),
    status: worstStatus(checks.map((c) => c.status)),
    summary: "Hosting / edge runtime. Add VERCEL_TOKEN for deploy history.",
    checks,
    metrics,
    pending: [
      "Speed Insights rollups",
      "Function duration / bandwidth billing API",
      "Build minutes by project",
    ],
  };
}

export async function getCloudflareInfrastructure(): Promise<InfraProviderOverview> {
  const workerUrl = workerBaseUrl();
  const workerToken = process.env.AI_WORKER_TOKEN?.trim();
  const turnstileSite = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const turnstileSecret =
    process.env.TURNSTILE_SECRET?.trim() || process.env.TURNSTILE_SECRET_KEY?.trim();
  const cfToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

  const [placesProbe, analytics] = await Promise.all([
    probePlacesWorker(),
    getCloudflareAnalytics(30),
  ]);

  const checks: InfraCheck[] = [
    {
      id: "worker_url",
      label: "AI / Places worker",
      status: workerUrl ? "ready" : "missing",
      detail: workerUrl,
    },
    {
      id: "worker_token",
      label: "Worker bearer token",
      status: workerToken ? "ready" : "missing",
      detail: workerToken ? "AI_WORKER_TOKEN set" : "AI_WORKER_TOKEN not set",
    },
    placesProbe,
    {
      id: "turnstile_site",
      label: "Turnstile site key",
      status: turnstileSite ? "ready" : "missing",
      detail: turnstileSite
        ? `…${turnstileSite.slice(-6)}`
        : "NEXT_PUBLIC_TURNSTILE_SITE_KEY not set",
    },
    {
      id: "turnstile_secret",
      label: "Turnstile secret",
      status: turnstileSecret ? "ready" : "missing",
      detail: turnstileSecret ? "Configured" : "TURNSTILE_SECRET / TURNSTILE_SECRET_KEY not set",
    },
  ];

  if (turnstileSecret) {
    try {
      const res = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            secret: turnstileSecret,
            response: "infra-probe-invalid",
          }),
          signal: AbortSignal.timeout(8_000),
          cache: "no-store",
        },
      );
      const json = (await res.json()) as {
        success?: boolean;
        "error-codes"?: string[];
      };
      // A structured rejection means the secret is accepted by Cloudflare.
      const codes = json["error-codes"] ?? [];
      const secretOk =
        res.ok &&
        json.success === false &&
        codes.some((c) =>
          ["invalid-input-response", "timeout-or-duplicate", "internal-error"].includes(
            c,
          ),
        );
      checks.push({
        id: "turnstile_verify",
        label: "Turnstile siteverify",
        status: secretOk ? "ready" : "degraded",
        detail: secretOk
          ? "Secret accepted (probe token rejected as expected)"
          : `Unexpected: ${codes.join(", ") || `HTTP ${res.status}`}`,
      });
    } catch (error) {
      checks.push({
        id: "turnstile_verify",
        label: "Turnstile siteverify",
        status: "error",
        detail: error instanceof Error ? error.message : "Probe failed",
      });
    }
  }

  const workerStatus: InfraStatus =
    analytics.workers.status === "ready"
      ? "ready"
      : analytics.workers.status === "missing"
        ? "missing"
        : analytics.workers.status === "error"
          ? "error"
          : "degraded";

  checks.push({
    id: "cf_api",
    label: "Workers analytics",
    status: workerStatus,
    detail: analytics.workers.detail,
  });

  checks.push({
    id: "ai_gateway",
    label: "AI Gateway analytics",
    status:
      analytics.aiGateway.status === "ready"
        ? "ready"
        : analytics.aiGateway.status === "missing"
          ? "missing"
          : analytics.aiGateway.status === "error"
            ? "error"
            : "degraded",
    detail: analytics.aiGateway.detail,
  });

  checks.push({
    id: "turnstile_rates",
    label: "Turnstile metering",
    status: "ready",
    detail: `${analytics.turnstile.totals.attempts} verifies / ${analytics.turnstile.windowDays}d`,
  });

  const metrics: InfraProviderOverview["metrics"] = [
    { label: "Worker", value: workerUrl },
    {
      label: "Script",
      value: analytics.scriptName ?? "—",
      hint: analytics.accountId
        ? `Account …${analytics.accountId.slice(-6)}`
        : undefined,
    },
    {
      label: "Worker requests (30d)",
      value:
        analytics.workers.status === "ready" || analytics.workers.status === "empty"
          ? String(analytics.workers.totals.requests)
          : "—",
      hint:
        analytics.workers.status === "ready"
          ? `${analytics.workers.totals.errors} errors · ${analytics.workers.totals.subrequests} subrequests`
          : analytics.workers.detail,
    },
    {
      label: "Turnstile pass rate",
      value:
        analytics.turnstile.totals.passRate == null
          ? "—"
          : `${(analytics.turnstile.totals.passRate * 100).toFixed(1)}%`,
      hint: `${analytics.turnstile.totals.pass} pass · ${analytics.turnstile.totals.fail} fail · ${analytics.turnstile.totals.error} error`,
    },
    {
      label: "AI via Worker (30d)",
      value: String(analytics.workerAi.totals.calls),
      hint: `${analytics.workerAi.totals.totalTokens.toLocaleString()} tokens (ai_usage)`,
    },
    {
      label: "AI Gateway (30d)",
      value:
        analytics.aiGateway.status === "ready"
          ? String(analytics.aiGateway.totals.requests)
          : analytics.aiGateway.status === "empty"
            ? "0"
            : "—",
      hint: analytics.aiGateway.detail,
    },
    {
      label: "Places proxy",
      value: placesProbe.status === "ready" ? "Healthy" : placesProbe.detail,
    },
  ];

  if (cfToken) {
    try {
      const res = await fetch(
        "https://api.cloudflare.com/client/v4/user/tokens/verify",
        {
          headers: { Authorization: `Bearer ${cfToken}` },
          signal: AbortSignal.timeout(8_000),
          cache: "no-store",
        },
      );
      const json = (await res.json()) as { success?: boolean; errors?: unknown[] };
      checks.push({
        id: "cf_token_verify",
        label: "API token verify",
        status: json.success ? "ready" : "error",
        detail: json.success ? "Token valid" : `HTTP ${res.status}`,
      });
    } catch (error) {
      checks.push({
        id: "cf_token_verify",
        label: "API token verify",
        status: "error",
        detail: error instanceof Error ? error.message : "Verify failed",
      });
    }
  }

  const pending: string[] = [];
  if (!cfToken) {
    pending.push(
      "Add CLOUDFLARE_API_TOKEN (Account Analytics Read + Workers) for GraphQL series",
    );
  }

  return {
    id: "cloudflare",
    label: "Cloudflare",
    generatedAt: new Date().toISOString(),
    status: worstStatus(checks.map((c) => c.status)),
    summary:
      "Workers + Turnstile live. GraphQL Workers/AI Gateway when CLOUDFLARE_API_TOKEN is set.",
    checks,
    metrics,
    pending,
    cloudflareAnalytics: analytics,
  };
}
