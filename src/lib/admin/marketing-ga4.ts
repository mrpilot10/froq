import "server-only";

import { GoogleAuth } from "google-auth-library";

export type Ga4TrafficDay = {
  day: string;
  sessions: number;
  users: number;
  pageviews: number;
};

export type Ga4SourceRow = {
  source: string;
  medium: string;
  sessions: number;
  users: number;
  conversions: number;
};

export type Ga4PageRow = {
  path: string;
  pageviews: number;
  users: number;
};

export type Ga4Analytics = {
  configured: boolean;
  measurementId: string | null;
  propertyId: string | null;
  error: string | null;
  windowDays: number;
  totals: {
    sessions: number;
    users: number;
    pageviews: number;
    conversions: number;
    bounceRate: number | null;
    avgSessionSec: number | null;
  };
  byDay: Ga4TrafficDay[];
  bySource: Ga4SourceRow[];
  byPage: Ga4PageRow[];
  byChannel: Array<{ channel: string; sessions: number; users: number }>;
};

function measurementId(): string | null {
  return (
    process.env.GA4_MEASUREMENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim() ||
    null
  );
}

function propertyId(): string | null {
  const raw =
    process.env.GA4_PROPERTY_ID?.trim() ||
    process.env.GOOGLE_ANALYTICS_PROPERTY_ID?.trim() ||
    null;
  if (!raw) return null;
  // Accept "123456789" or "properties/123456789"
  return raw.replace(/^properties\//, "");
}

function loadServiceAccountJson(): Record<string, unknown> | null {
  const inline = process.env.GA4_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) {
    try {
      return JSON.parse(inline) as Record<string, unknown>;
    } catch {
      try {
        return JSON.parse(
          Buffer.from(inline, "base64").toString("utf8"),
        ) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
  const b64 = process.env.GA4_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (b64) {
    try {
      return JSON.parse(
        Buffer.from(b64, "base64").toString("utf8"),
      ) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

async function getAccessToken(): Promise<string | null> {
  const credentials = loadServiceAccountJson();
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (!credentials && !keyFile) return null;

  const auth = new GoogleAuth({
    credentials: credentials ?? undefined,
    keyFile: credentials ? undefined : keyFile,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token ?? null;
}

type RunReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
  error?: { message?: string; status?: string };
};

async function runReport(input: {
  token: string;
  propertyId: string;
  dimensions: string[];
  metrics: string[];
  days: number;
  limit?: number;
  orderByMetric?: string;
}): Promise<RunReportResponse> {
  const end = new Date();
  const start = new Date(Date.now() - (input.days - 1) * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const body: Record<string, unknown> = {
    dateRanges: [{ startDate: fmt(start), endDate: fmt(end) }],
    metrics: input.metrics.map((name) => ({ name })),
    limit: input.limit ?? 50,
  };
  if (input.dimensions.length) {
    body.dimensions = input.dimensions.map((name) => ({ name }));
  }
  if (input.orderByMetric) {
    body.orderBys = [
      { metric: { metricName: input.orderByMetric }, desc: true },
    ];
  }

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${input.propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    },
  );
  const json = (await res.json()) as RunReportResponse;
  if (!res.ok) {
    return {
      error: {
        message:
          json.error?.message ||
          `GA4 Data API HTTP ${res.status}`,
        status: json.error?.status,
      },
    };
  }
  return json;
}

function emptyAnalytics(
  error: string | null,
  windowDays: number,
): Ga4Analytics {
  return {
    configured: false,
    measurementId: measurementId(),
    propertyId: propertyId(),
    error,
    windowDays,
    totals: {
      sessions: 0,
      users: 0,
      pageviews: 0,
      conversions: 0,
      bounceRate: null,
      avgSessionSec: null,
    },
    byDay: [],
    bySource: [],
    byPage: [],
    byChannel: [],
  };
}

export async function getGa4Analytics(
  windowDays = 30,
): Promise<Ga4Analytics> {
  const mid = measurementId();
  const pid = propertyId();

  if (!pid) {
    return emptyAnalytics(
      mid
        ? `Measurement ID ${mid} set — add GA4_PROPERTY_ID (numeric, from GA4 Admin → Property settings)`
        : "Set GA4_MEASUREMENT_ID and GA4_PROPERTY_ID",
      windowDays,
    );
  }

  let token: string | null = null;
  try {
    token = await getAccessToken();
  } catch (error) {
    return emptyAnalytics(
      error instanceof Error
        ? `Auth failed: ${error.message}`
        : "GA4 service account auth failed",
      windowDays,
    );
  }

  if (!token) {
    return emptyAnalytics(
      "Set GA4_SERVICE_ACCOUNT_JSON (or GOOGLE_APPLICATION_CREDENTIALS) with Analytics Viewer on this property",
      windowDays,
    );
  }

  try {
    const [totalsRes, dayRes, sourceRes, pageRes, channelRes] =
      await Promise.all([
        runReport({
          token,
          propertyId: pid,
          dimensions: [],
          metrics: [
            "sessions",
            "totalUsers",
            "screenPageViews",
            "conversions",
            "bounceRate",
            "averageSessionDuration",
          ],
          days: windowDays,
          limit: 1,
        }),
        runReport({
          token,
          propertyId: pid,
          dimensions: ["date"],
          metrics: ["sessions", "totalUsers", "screenPageViews"],
          days: windowDays,
          limit: windowDays + 2,
        }),
        runReport({
          token,
          propertyId: pid,
          dimensions: ["sessionSource", "sessionMedium"],
          metrics: ["sessions", "totalUsers", "conversions"],
          days: windowDays,
          limit: 25,
          orderByMetric: "sessions",
        }),
        runReport({
          token,
          propertyId: pid,
          dimensions: ["pagePath"],
          metrics: ["screenPageViews", "totalUsers"],
          days: windowDays,
          limit: 20,
          orderByMetric: "screenPageViews",
        }),
        runReport({
          token,
          propertyId: pid,
          dimensions: ["sessionDefaultChannelGroup"],
          metrics: ["sessions", "totalUsers"],
          days: windowDays,
          limit: 15,
          orderByMetric: "sessions",
        }),
      ]);

    const firstError =
      totalsRes.error?.message ||
      dayRes.error?.message ||
      sourceRes.error?.message ||
      pageRes.error?.message ||
      channelRes.error?.message ||
      null;
    if (firstError) {
      return emptyAnalytics(firstError, windowDays);
    }

    const t = totalsRes.rows?.[0]?.metricValues ?? [];
    const sessions = Number(t[0]?.value ?? 0) || 0;
    const users = Number(t[1]?.value ?? 0) || 0;
    const pageviews = Number(t[2]?.value ?? 0) || 0;
    const conversions = Number(t[3]?.value ?? 0) || 0;
    const bounceRate = t[4]?.value != null ? Number(t[4].value) : null;
    const avgSessionSec = t[5]?.value != null ? Number(t[5].value) : null;

    const byDay = (dayRes.rows ?? [])
      .map((row) => {
        const raw = row.dimensionValues?.[0]?.value ?? "";
        // GA returns YYYYMMDD
        const day =
          raw.length === 8
            ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
            : raw;
        return {
          day,
          sessions: Number(row.metricValues?.[0]?.value ?? 0) || 0,
          users: Number(row.metricValues?.[1]?.value ?? 0) || 0,
          pageviews: Number(row.metricValues?.[2]?.value ?? 0) || 0,
        };
      })
      .sort((a, b) => b.day.localeCompare(a.day));

    const bySource = (sourceRes.rows ?? []).map((row) => ({
      source: row.dimensionValues?.[0]?.value || "(direct)",
      medium: row.dimensionValues?.[1]?.value || "(none)",
      sessions: Number(row.metricValues?.[0]?.value ?? 0) || 0,
      users: Number(row.metricValues?.[1]?.value ?? 0) || 0,
      conversions: Number(row.metricValues?.[2]?.value ?? 0) || 0,
    }));

    const byPage = (pageRes.rows ?? []).map((row) => ({
      path: row.dimensionValues?.[0]?.value || "/",
      pageviews: Number(row.metricValues?.[0]?.value ?? 0) || 0,
      users: Number(row.metricValues?.[1]?.value ?? 0) || 0,
    }));

    const byChannel = (channelRes.rows ?? []).map((row) => ({
      channel: row.dimensionValues?.[0]?.value || "(other)",
      sessions: Number(row.metricValues?.[0]?.value ?? 0) || 0,
      users: Number(row.metricValues?.[1]?.value ?? 0) || 0,
    }));

    return {
      configured: true,
      measurementId: mid,
      propertyId: pid,
      error: null,
      windowDays,
      totals: {
        sessions,
        users,
        pageviews,
        conversions,
        bounceRate: bounceRate != null && Number.isFinite(bounceRate)
          ? bounceRate
          : null,
        avgSessionSec:
          avgSessionSec != null && Number.isFinite(avgSessionSec)
            ? avgSessionSec
            : null,
      },
      byDay,
      bySource,
      byPage,
      byChannel,
    };
  } catch (error) {
    return emptyAnalytics(
      error instanceof Error ? error.message : "GA4 fetch failed",
      windowDays,
    );
  }
}
