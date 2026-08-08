import "server-only";

/**
 * Ad platform connectors for Marketing admin.
 * Meta Ads live via Marketing API; Google Ads via Ads API + OAuth refresh.
 */

export type AdsPlatformStatus = {
  id: "google_ads" | "meta_ads";
  label: string;
  configured: boolean;
  detail: string;
  spendInr: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  windowDays: number;
  byCampaign: Array<{
    name: string;
    spendInr: number;
    clicks: number;
    impressions: number;
  }>;
};

export type MarketingAdsOverview = {
  generatedAt: string;
  platforms: AdsPlatformStatus[];
  pending: string[];
  siteTag: {
    measurementId: string | null;
    wiredInApp: boolean;
    detail: string;
  };
};

const USD_INR = 84;

function siteTagStatus() {
  const measurementId =
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim() ||
    process.env.GA4_MEASUREMENT_ID?.trim() ||
    null;
  const wiredInApp = Boolean(measurementId && /^G-[A-Z0-9]+$/i.test(measurementId));
  return {
    measurementId,
    wiredInApp,
    detail: wiredInApp
      ? `gtag.js loads ${measurementId} from root layout (deploy to fire on froq.io)`
      : "Set NEXT_PUBLIC_GA4_MEASUREMENT_ID and deploy",
  };
}

export async function getMarketingAdsOverview(
  windowDays = 30,
): Promise<MarketingAdsOverview> {
  const platforms: AdsPlatformStatus[] = [
    await getGoogleAds(windowDays),
    await getMetaAds(windowDays),
  ];
  const siteTag = siteTagStatus();

  const pending: string[] = [];
  if (!platforms[0]?.configured) {
    pending.push(
      "Google Ads — GOOGLE_ADS_DEVELOPER_TOKEN + GOOGLE_ADS_CUSTOMER_ID + GOOGLE_ADS_CLIENT_ID + GOOGLE_ADS_CLIENT_SECRET + GOOGLE_ADS_REFRESH_TOKEN",
    );
  } else if (platforms[0].spendInr == null && platforms[0].detail) {
    pending.push(`Google Ads — ${platforms[0].detail}`);
  }
  if (!platforms[1]?.configured) {
    pending.push(
      "Meta Ads — set META_ADS_ACCESS_TOKEN + META_ADS_AD_ACCOUNT_ID (act_…)",
    );
  } else if (platforms[1].spendInr == null && platforms[1].byCampaign.length === 0) {
    pending.push(`Meta Ads — ${platforms[1].detail}`);
  }
  if (!siteTag.wiredInApp) {
    pending.push("Site tag — set NEXT_PUBLIC_GA4_MEASUREMENT_ID and deploy froq.io");
  }

  return {
    generatedAt: new Date().toISOString(),
    platforms,
    pending,
    siteTag,
  };
}

async function googleAdsAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  const json = (await res.json()) as { access_token?: string; error?: string };
  return json.access_token ?? null;
}

async function getGoogleAds(windowDays: number): Promise<AdsPlatformStatus> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.trim()?.replace(
    /-/g,
    "",
  );
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim()?.replace(
    /-/g,
    "",
  );
  const hasOAuth = Boolean(
    process.env.GOOGLE_ADS_CLIENT_ID?.trim() &&
      process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim(),
  );
  const keysPresent = Boolean(developerToken && customerId);

  if (!keysPresent) {
    return {
      id: "google_ads",
      label: "Google Ads",
      configured: false,
      detail: "Not connected",
      spendInr: null,
      impressions: null,
      clicks: null,
      conversions: null,
      windowDays,
      byCampaign: [],
    };
  }

  if (!hasOAuth) {
    return {
      id: "google_ads",
      label: "Google Ads",
      configured: false,
      detail:
        "Developer token + customer id set — still need OAuth client id/secret + refresh token",
      spendInr: null,
      impressions: null,
      clicks: null,
      conversions: null,
      windowDays,
      byCampaign: [],
    };
  }

  try {
    const accessToken = await googleAdsAccessToken();
    if (!accessToken) {
      return {
        id: "google_ads",
        label: "Google Ads",
        configured: true,
        detail: "OAuth refresh failed — check GOOGLE_ADS_REFRESH_TOKEN",
        spendInr: null,
        impressions: null,
        clicks: null,
        conversions: null,
        windowDays,
        byCampaign: [],
      };
    }

    const since = new Date(Date.now() - windowDays * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    // cost_micros is in account currency (usually INR for IN accounts) — treat as INR micros.
    const query = `
      SELECT
        campaign.name,
        metrics.cost_micros,
        metrics.clicks,
        metrics.impressions,
        metrics.conversions
      FROM campaign
      WHERE segments.date BETWEEN '${since}' AND '${until}'
      ORDER BY metrics.cost_micros DESC
      LIMIT 25
    `;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken!,
      "Content-Type": "application/json",
    };
    if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

    const res = await fetch(
      `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      },
    );
    const json = (await res.json()) as {
      results?: Array<{
        campaign?: { name?: string };
        metrics?: {
          costMicros?: string;
          clicks?: string;
          impressions?: string;
          conversions?: number;
        };
      }>;
      error?: { message?: string; status?: string };
    };

    if (!res.ok || json.error) {
      return {
        id: "google_ads",
        label: "Google Ads",
        configured: true,
        detail:
          json.error?.message ||
          `Google Ads API HTTP ${res.status}`,
        spendInr: null,
        impressions: null,
        clicks: null,
        conversions: null,
        windowDays,
        byCampaign: [],
      };
    }

    let spendInr = 0;
    let clicks = 0;
    let impressions = 0;
    let conversions = 0;
    const byCampaignMap = new Map<
      string,
      { spendInr: number; clicks: number; impressions: number }
    >();

    for (const row of json.results ?? []) {
      const name = row.campaign?.name || "Campaign";
      const cost =
        (Number(row.metrics?.costMicros ?? 0) || 0) / 1_000_000;
      const clk = Number(row.metrics?.clicks ?? 0) || 0;
      const imps = Number(row.metrics?.impressions ?? 0) || 0;
      const conv = Number(row.metrics?.conversions ?? 0) || 0;
      spendInr += cost;
      clicks += clk;
      impressions += imps;
      conversions += conv;
      const cur = byCampaignMap.get(name) ?? {
        spendInr: 0,
        clicks: 0,
        impressions: 0,
      };
      cur.spendInr += cost;
      cur.clicks += clk;
      cur.impressions += imps;
      byCampaignMap.set(name, cur);
    }

    const byCampaign = [...byCampaignMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.spendInr - a.spendInr);

    return {
      id: "google_ads",
      label: "Google Ads",
      configured: true,
      detail: `${byCampaign.length} campaigns · last ${windowDays}d`,
      spendInr,
      impressions,
      clicks,
      conversions,
      windowDays,
      byCampaign,
    };
  } catch (error) {
    return {
      id: "google_ads",
      label: "Google Ads",
      configured: true,
      detail:
        error instanceof Error ? error.message : "Google Ads fetch failed",
      spendInr: null,
      impressions: null,
      clicks: null,
      conversions: null,
      windowDays,
      byCampaign: [],
    };
  }
}

async function getMetaAds(windowDays: number): Promise<AdsPlatformStatus> {
  const token = process.env.META_ADS_ACCESS_TOKEN?.trim();
  const accountId = process.env.META_ADS_AD_ACCOUNT_ID?.trim();

  if (!token || !accountId) {
    return {
      id: "meta_ads",
      label: "Meta Ads",
      configured: false,
      detail: "Not connected",
      spendInr: null,
      impressions: null,
      clicks: null,
      conversions: null,
      windowDays,
      byCampaign: [],
    };
  }

  try {
    const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const since = new Date(Date.now() - windowDays * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    const params = new URLSearchParams({
      fields: "campaign_name,spend,impressions,clicks,actions",
      time_range: JSON.stringify({ since, until }),
      level: "campaign",
      limit: "25",
      access_token: token,
    });
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${act}/insights?${params}`,
      { signal: AbortSignal.timeout(15_000), cache: "no-store" },
    );
    const json = (await res.json()) as {
      data?: Array<{
        campaign_name?: string;
        spend?: string;
        impressions?: string;
        clicks?: string;
        actions?: Array<{ action_type?: string; value?: string }>;
      }>;
      error?: { message?: string };
    };

    if (!res.ok || json.error) {
      return {
        id: "meta_ads",
        label: "Meta Ads",
        configured: true,
        detail: json.error?.message || `Meta API HTTP ${res.status}`,
        spendInr: null,
        impressions: null,
        clicks: null,
        conversions: null,
        windowDays,
        byCampaign: [],
      };
    }

    let spendUsd = 0;
    let impressions = 0;
    let clicks = 0;
    let conversions = 0;
    const byCampaign = (json.data ?? []).map((row) => {
      const spend = Number(row.spend ?? 0) || 0;
      const imps = Number(row.impressions ?? 0) || 0;
      const clk = Number(row.clicks ?? 0) || 0;
      const conv = (row.actions ?? [])
        .filter((a) =>
          [
            "purchase",
            "lead",
            "complete_registration",
            "omni_purchase",
          ].includes(a.action_type ?? ""),
        )
        .reduce((s, a) => s + (Number(a.value) || 0), 0);
      spendUsd += spend;
      impressions += imps;
      clicks += clk;
      conversions += conv;
      return {
        name: row.campaign_name || "Campaign",
        spendInr: spend * USD_INR,
        clicks: clk,
        impressions: imps,
      };
    });

    return {
      id: "meta_ads",
      label: "Meta Ads",
      configured: true,
      detail: `${byCampaign.length} campaigns · last ${windowDays}d`,
      spendInr: spendUsd * USD_INR,
      impressions,
      clicks,
      conversions,
      windowDays,
      byCampaign: byCampaign.sort((a, b) => b.spendInr - a.spendInr),
    };
  } catch (error) {
    return {
      id: "meta_ads",
      label: "Meta Ads",
      configured: true,
      detail: error instanceof Error ? error.message : "Meta Ads fetch failed",
      spendInr: null,
      impressions: null,
      clicks: null,
      conversions: null,
      windowDays,
      byCampaign: [],
    };
  }
}
