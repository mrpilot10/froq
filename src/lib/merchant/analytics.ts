import type {
  AnalyticsFunnelStage,
  AnalyticsInsight,
  AnalyticsTopCustomer,
  DashboardChartBucket,
  DashboardDateRange,
  DashboardFilteredStats,
} from "./types";

export type AnalyticsCustomerRow = {
  id: string;
  name: string;
  banned: boolean;
  status: "active" | "reward_ready" | "claimed";
  stamps: number;
  total_stamps: number;
  lifetime_visits: number;
  rewards_claimed: number;
  created_at: string;
  last_visit: string | null;
};

export type AnalyticsVisitRow = {
  created_at: string;
  customer_id: string | null;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DASHBOARD_RANGE_LABELS: Record<DashboardDateRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "12m": "Last 12 months",
  all: "All time",
};

/** Maps UI presets → merchant_loyalty_range_stats granularity. */
export const RANGE_RPC_GRANULARITY: Record<
  DashboardDateRange,
  "tod_quad" | "day" | "week" | "month"
> = {
  today: "tod_quad",
  "7d": "day",
  "30d": "week",
  "12m": "month",
  all: "month",
};

export const LOYALTY_STATS_TIMEZONE = "Asia/Kolkata";

export type LoyaltyRangeBucket = {
  bucket_index: number;
  bucket_start: string;
  visit_count: number;
};

export type LoyaltyRangeStats = {
  stamps_in_range: number;
  rewards_in_range: number;
  chart_granularity: string;
  chart_buckets: LoyaltyRangeBucket[];
};

export function dashboardRangeStart(
  range: DashboardDateRange,
  now: Date = new Date(),
): Date | null {
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

/** Caller args for merchant_loyalty_range_stats (bounds owned by JS presets). */
export function rangeRpcArgsForPreset(
  range: DashboardDateRange,
  now: Date = new Date(),
  timezone: string = LOYALTY_STATS_TIMEZONE,
) {
  const start = dashboardRangeStart(range, now);
  return {
    p_start: start ? start.toISOString() : null,
    p_end: now.toISOString(),
    p_granularity: RANGE_RPC_GRANULARITY[range],
    p_timezone: timezone,
  };
}

/**
 * Overlay RPC visit_count onto labels/title/sub from the existing
 * chartBucketsForRange labelers (empty visit array → identical axis).
 */
export function chartFromRangeStats(
  range: DashboardDateRange,
  rangeBuckets: LoyaltyRangeBucket[],
): { title: string; sub: string; buckets: DashboardChartBucket[] } {
  const axis = chartBucketsForRange(range, []);
  const byIndex = new Map(
    rangeBuckets.map((b) => [b.bucket_index, b.visit_count] as const),
  );
  return {
    title: axis.title,
    sub: axis.sub,
    buckets: axis.buckets.map((bucket, index) => ({
      label: bucket.label,
      value: byIndex.get(index) ?? 0,
    })),
  };
}

function startOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

function startOfMonth() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function daysAgo(n: number) {
  const start = new Date();
  start.setDate(start.getDate() - n);
  start.setHours(0, 0, 0, 0);
  return start;
}

function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function formatHourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${suffix}`;
}

export function chartBucketsForRange(
  range: DashboardDateRange,
  visits: { created_at: string }[],
): { title: string; sub: string; buckets: DashboardChartBucket[] } {
  if (range === "today") {
    const labels = ["12–6a", "6–12p", "12–6p", "6–12a"];
    const values = [0, 0, 0, 0];
    const dayStart = startOfToday();
    for (const row of visits) {
      const date = new Date(row.created_at);
      if (date < dayStart) continue;
      const hour = date.getHours();
      const idx = hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3;
      values[idx] += 1;
    }
    return {
      title: "Customer Visits",
      sub: "Stamps approved by time of day",
      buckets: labels.map((label, index) => ({ label, value: values[index] })),
    };
  }

  if (range === "7d") {
    const days: { label: string; value: number; start: Date; end: Date }[] = [];
    const now = new Date();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const start = new Date(now);
      start.setDate(start.getDate() - offset);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      days.push({
        label: start.toLocaleDateString("en-US", { weekday: "narrow" }),
        value: 0,
        start,
        end,
      });
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
    return {
      title: "Customer Visits",
      sub: "Stamps approved per day",
      buckets: days.map(({ label, value }) => ({ label, value })),
    };
  }

  if (range === "30d") {
    const weeks: { label: string; value: number; start: Date; end: Date }[] = [];
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    for (let week = 3; week >= 0; week -= 1) {
      const end = new Date(now);
      end.setDate(end.getDate() - week * 7);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      weeks.push({
        label: week === 0 ? "Now" : `-${week * 7}d`,
        value: 0,
        start,
        end,
      });
    }
    for (const row of visits) {
      const date = new Date(row.created_at);
      for (const week of weeks) {
        if (date >= week.start && date <= week.end) {
          week.value += 1;
          break;
        }
      }
    }
    return {
      title: "Customer Visits",
      sub: "Stamps approved per week",
      buckets: weeks.map(({ label, value }) => ({ label, value })),
    };
  }

  // 12m and all → monthly buckets (12 months)
  const monthCount = 12;
  const months: { label: string; value: number; start: Date; end: Date }[] = [];
  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    start.setMonth(start.getMonth() - offset);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    months.push({
      label: start.toLocaleDateString("en-US", { month: "short" }),
      value: 0,
      start,
      end,
    });
  }
  for (const row of visits) {
    const date = new Date(row.created_at);
    for (const month of months) {
      if (date >= month.start && date < month.end) {
        month.value += 1;
        break;
      }
    }
  }
  return {
    title: "Customer Visits",
    sub:
      range === "12m"
        ? "Stamps approved per month"
        : "Stamps approved over the last year",
    buckets: months.map(({ label, value }) => ({ label, value })),
  };
}

function buildTopCustomers(customers: AnalyticsCustomerRow[]): AnalyticsTopCustomer[] {
  return customers
    .filter((c) => !c.banned && c.lifetime_visits > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      stamps: c.stamps,
      totalStamps: c.total_stamps,
      lifetimeVisits: Number(c.lifetime_visits) || 0,
      rewardsClaimed: Number(c.rewards_claimed) || 0,
    }))
    .sort(
      (a, b) =>
        b.lifetimeVisits - a.lifetimeVisits ||
        b.rewardsClaimed - a.rewardsClaimed ||
        b.stamps - a.stamps,
    )
    .slice(0, 5);
}

function buildFunnel(customers: AnalyticsCustomerRow[]): AnalyticsFunnelStage[] {
  const joined = customers.filter((c) => !c.banned).length;
  const firstStamp = customers.filter((c) => !c.banned && c.lifetime_visits >= 1).length;
  const returning = customers.filter((c) => !c.banned && c.lifetime_visits >= 2).length;
  const completed = customers.filter(
    (c) =>
      !c.banned &&
      (c.rewards_claimed > 0 || c.status === "reward_ready" || c.status === "claimed"),
  ).length;
  const redeemed = customers.filter((c) => !c.banned && c.rewards_claimed > 0).length;

  const stages: { id: string; label: string; count: number }[] = [
    { id: "joined", label: "Customers Joined", count: joined },
    { id: "first", label: "Received First Stamp", count: firstStamp },
    { id: "returning", label: "Returning Customers", count: returning },
    { id: "completed", label: "Completed Loyalty Card", count: completed },
    { id: "redeemed", label: "Reward Redeemed", count: redeemed },
  ];

  return stages.map((stage, index) => {
    const prev = index === 0 ? null : stages[index - 1].count;
    return {
      id: stage.id,
      label: stage.label,
      count: stage.count,
      conversionFromPrevious: prev === null ? null : pct(stage.count, prev),
    };
  });
}

export type LoyaltyLifetimeStats = {
  total_visits: number;
  total_redemptions: number;
  avg_days_between_visits: number | null;
  most_active_dow: number | null;
  most_active_hour: number | null;
};

/** Whole days when >= 1; otherwise keep one decimal only if meaningful (>= 0.5). */
function formatAvgDaysBetweenVisits(avg: number | null): number | null {
  if (avg === null || Number.isNaN(avg)) return null;
  if (avg >= 1) return Math.round(avg);
  if (avg >= 0.5) return Math.round(avg * 10) / 10;
  return null;
}

function formatMostActiveDayHour(
  dow: number | null,
  hour: number | null,
): { day: string | null; hour: string | null } {
  return {
    day: dow !== null && dow >= 0 && dow <= 6 ? DAY_NAMES[dow] : null,
    hour: hour !== null && hour >= 0 && hour <= 23 ? formatHourLabel(hour) : null,
  };
}

function buildInsights(input: {
  customers: AnalyticsCustomerRow[];
  visits: AnalyticsVisitRow[];
  pendingApprovals: number;
  avgDays: number | null;
  nearReward: number;
  mostActiveDay: string | null;
}): AnalyticsInsight[] {
  const { customers, visits, pendingApprovals, avgDays, nearReward, mostActiveDay } = input;
  const insights: AnalyticsInsight[] = [];
  const active = customers.filter((c) => !c.banned);

  if (nearReward > 0) {
    insights.push({
      id: "near-reward",
      text:
        nearReward === 1
          ? "1 customer is one stamp away from a reward."
          : `${nearReward} customers are one stamp away from a reward.`,
    });
  }

  const monthStart = startOfMonth();
  const prevMonthStart = new Date(monthStart);
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
  const thisMonth = visits.filter((v) => new Date(v.created_at) >= monthStart).length;
  const lastMonth = visits.filter((v) => {
    const d = new Date(v.created_at);
    return d >= prevMonthStart && d < monthStart;
  }).length;
  if (lastMonth > 0 && thisMonth > 0) {
    const change = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
    if (change !== 0) {
      insights.push({
        id: "month-change",
        text:
          change > 0
            ? `Stamp activity is up ${change}% vs last month.`
            : `Stamp activity is down ${Math.abs(change)}% vs last month.`,
      });
    }
  }

  if (mostActiveDay) {
    insights.push({
      id: "busy-day",
      text: `${mostActiveDay} is your busiest loyalty day.`,
    });
  }

  if (avgDays !== null && avgDays > 0) {
    insights.push({
      id: "avg-gap",
      text: `Customers visit every ${avgDays} day${avgDays === 1 ? "" : "s"} on average.`,
    });
  }

  const inactiveCutoff = daysAgo(30).getTime();
  const inactive = active.filter((c) => {
    if (!c.last_visit) return c.lifetime_visits > 0;
    return new Date(c.last_visit).getTime() < inactiveCutoff && c.lifetime_visits > 0;
  }).length;
  if (inactive > 0) {
    insights.push({
      id: "inactive",
      text:
        inactive === 1
          ? "1 customer has not returned in over 30 days."
          : `${inactive} customers have not returned in over 30 days.`,
    });
  }

  if (pendingApprovals > 0) {
    insights.push({
      id: "pending",
      text:
        pendingApprovals === 1
          ? "1 stamp request is waiting for approval."
          : `${pendingApprovals} stamp requests are waiting for approval.`,
    });
  }

  const rewardReady = active.filter((c) => c.status === "reward_ready").length;
  if (rewardReady > 0) {
    insights.push({
      id: "ready",
      text:
        rewardReady === 1
          ? "1 customer has a reward ready to redeem."
          : `${rewardReady} customers have a reward ready to redeem.`,
    });
  }

  return insights.slice(0, 6);
}

export function computeLoyaltyAnalytics(input: {
  range: DashboardDateRange;
  customers: AnalyticsCustomerRow[];
  visits: AnalyticsVisitRow[];
  pendingApprovals: number;
  lifetime: LoyaltyLifetimeStats;
  /**
   * From merchant_loyalty_range_stats. null = RPC error → rangeStatsError;
   * do not substitute truncated visit arrays (those numbers are wrong).
   */
  rangeStats: LoyaltyRangeStats | null;
}): DashboardFilteredStats {
  const { range, customers, visits, pendingApprovals, lifetime, rangeStats } = input;
  const rangeStart = dashboardRangeStart(range);
  const activePool = customers.filter((c) => !c.banned);
  const rangeStatsError = rangeStats == null;

  const todayStart = startOfToday();
  const monthStart = startOfMonth();
  const inactiveCutoff = daysAgo(30).getTime();

  const totalCustomers = activePool.length;
  const activeCustomers = activePool.filter((c) => c.status === "active").length;
  const activeCards = activeCustomers;
  const totalStampsAllTime = lifetime.total_visits;
  const stampsToday = visits.filter((v) => new Date(v.created_at) >= todayStart).length;
  const stampsThisMonth = visits.filter((v) => new Date(v.created_at) >= monthStart).length;
  const stampsInRange = rangeStats?.stamps_in_range ?? 0;
  const rewardsRedeemedAllTime = lifetime.total_redemptions;
  const rewardsInRange = rangeStats?.rewards_in_range ?? 0;

  const avgVisitsPerCustomer =
    totalCustomers > 0
      ? Math.round(
          (activePool.reduce((sum, c) => sum + Number(c.lifetime_visits || 0), 0) /
            totalCustomers) *
            10,
        ) / 10
      : 0;

  const avgStampsPerCustomer =
    totalCustomers > 0
      ? Math.round((lifetime.total_visits / totalCustomers) * 10) / 10
      : 0;

  const nearReward = activePool.filter(
    (c) => c.status === "active" && c.total_stamps > 0 && c.total_stamps - c.stamps === 1,
  ).length;

  // Numerator includes banned customers with rewards_claimed > 0; denominator is non-banned.
  const redeemersIncludingBanned = customers.filter(
    (c) => Number(c.rewards_claimed) > 0,
  ).length;
  const redemptionRate = pct(redeemersIncludingBanned, totalCustomers);

  const returningCustomers = activePool.filter((c) => c.lifetime_visits >= 2).length;
  const repeatVisitRate = pct(returningCustomers, totalCustomers);

  const newCustomersInRange = activePool.filter((c) => {
    if (!rangeStart) return true;
    return new Date(c.created_at) >= rangeStart;
  }).length;

  const inactiveCustomers = activePool.filter((c) => {
    if (c.lifetime_visits <= 0) return false;
    if (!c.last_visit) return true;
    return new Date(c.last_visit).getTime() < inactiveCutoff;
  }).length;

  const avgDays = formatAvgDaysBetweenVisits(lifetime.avg_days_between_visits);
  const { day: mostActiveDay, hour: mostActiveHour } = formatMostActiveDayHour(
    lifetime.most_active_dow,
    lifetime.most_active_hour,
  );
  const chart = rangeStats
    ? chartFromRangeStats(range, rangeStats.chart_buckets)
    : chartBucketsForRange(range, []);
  const topCustomers = buildTopCustomers(customers);
  const funnel = buildFunnel(customers);
  const insights = buildInsights({
    customers,
    visits,
    pendingApprovals,
    avgDays,
    nearReward,
    mostActiveDay,
  });

  return {
    range,
    rangeLabel: DASHBOARD_RANGE_LABELS[range],
    totalCustomers,
    activeCustomers,
    activeCards,
    totalStampsAllTime,
    stampsInRange,
    stampsToday,
    stampsThisMonth,
    rewardsRedeemedAllTime,
    rewardsInRange,
    rangeStatsError,
    pendingApprovals,
    avgVisitsPerCustomer,
    avgStampsPerCustomer,
    customersNearReward: nearReward,
    redemptionRate,
    avgDaysBetweenVisits: avgDays,
    newCustomersInRange,
    returningCustomers,
    inactiveCustomers,
    repeatVisitRate,
    mostActiveDay,
    mostActiveHour,
    chartBuckets: chart.buckets,
    chartTitle: chart.title,
    chartSub: chart.sub,
    topCustomers,
    funnel,
    insights,
    // Signups alone are worth charting: "7 joined → 0 stamped" is the funnel a
    // merchant with no stamps yet most needs to see. Only a merchant with
    // nothing at all falls through to the empty state.
    hasActivity: totalCustomers > 0 || totalStampsAllTime > 0,
  };
}
