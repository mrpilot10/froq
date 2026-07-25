"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownWideNarrow,
  ChevronDown,
  Clock,
  Gift,
  Lightbulb,
  Stamp,
  UserPlus,
} from "lucide-react";
import { getDashboardStats } from "@/app/merchant/actions";
import type {
  AnalyticsFunnelStage,
  AnalyticsInsight,
  AnalyticsTopCustomer,
  DashboardChartBucket,
  DashboardDateRange,
  DashboardFilteredStats,
  MerchantProfile,
} from "@/lib/merchant/types";

interface AnalyticsScreenProps {
  profile: MerchantProfile;
  initialStats: DashboardFilteredStats;
  activeBranchId?: string | null;
}

const DATE_RANGES: { value: DashboardDateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "12m", label: "12 Months" },
  { value: "all", label: "All Time" },
];

type ChartSort = "chronological" | "highest";

const CHART_SORTS: { value: ChartSort; label: string }[] = [
  { value: "chronological", label: "Time order" },
  { value: "highest", label: "Highest first" },
];

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatMetric(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function AnalyticsScreen({
  profile,
  initialStats,
  activeBranchId = null,
}: AnalyticsScreenProps) {
  const [range, setRange] = useState<DashboardDateRange>("7d");
  const [sort, setSort] = useState<ChartSort>("chronological");
  const [stats, setStats] = useState<DashboardFilteredStats | null>(null);
  const [loading, setLoading] = useState(true);
  const businessName = profile.businessName;

  const loadStats = useCallback(
    async (nextRange: DashboardDateRange) => {
      setLoading(true);
      const next = await getDashboardStats(nextRange, activeBranchId);
      if (next) setStats(next);
      setLoading(false);
    },
    [activeBranchId],
  );

  useEffect(() => {
    void loadStats(range);
  }, [range, loadStats]);

  useEffect(() => {
    if (!stats && initialStats) setStats(initialStats);
  }, [initialStats, stats]);

  const display = stats ?? initialStats;
  const chartBuckets = useMemo(() => {
    const buckets = display.chartBuckets;
    if (sort === "highest") {
      return [...buckets].sort((a, b) => b.value - a.value);
    }
    return buckets;
  }, [display.chartBuckets, sort]);

  const maxVisits = Math.max(...chartBuckets.map((bucket) => bucket.value), 1);
  const empty = !display.hasActivity;

  const periodCards = [
    { Icon: Stamp, value: display.stampsInRange, label: "Stamps in period" },
    {
      Icon: Gift,
      value: display.range === "all" ? display.rewardsRedeemedAllTime : display.rewardsInRange,
      label: "Rewards redeemed",
      accent: true,
    },
    { Icon: UserPlus, value: display.newCustomersInRange, label: "New customers" },
    { Icon: Clock, value: display.pendingApprovals, label: "Pending approvals" },
  ];

  const detailRows = [
    { label: "Customers near reward", value: display.customersNearReward },
    { label: "Returning customers", value: display.returningCustomers },
    { label: "Inactive (30+ days)", value: display.inactiveCustomers },
    { label: "Repeat visit rate", value: `${display.repeatVisitRate}%` },
    { label: "Redemption rate", value: `${display.redemptionRate}%` },
    { label: "Avg days between visits", value: formatMetric(display.avgDaysBetweenVisits) },
    { label: "Stamps today", value: display.stampsToday },
    { label: "Stamps this month", value: display.stampsThisMonth },
    { label: "Most active day", value: display.mostActiveDay ?? "—" },
    { label: "Most active hour", value: display.mostActiveHour ?? "—" },
  ];

  return (
    <div className="tab-screen merchant-dashboard">
      <div className="tab-head merchant-dashboard-head">
        <div>
          <h2 className="tab-title">Analytics</h2>
          <p className="tab-sub">{businessName}</p>
        </div>
        <div className="merchant-analytics-toolbar">
          <div className="merchant-date-select">
            <select
              className="merchant-date-select-input"
              aria-label="Date range"
              value={range}
              disabled={loading}
              onChange={(event) => setRange(event.target.value as DashboardDateRange)}
            >
              {DATE_RANGES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown size={16} strokeWidth={2.4} className="merchant-date-select-icon" />
          </div>
          <div className="merchant-date-select">
            <ArrowDownWideNarrow
              size={15}
              strokeWidth={2.2}
              className="merchant-analytics-sort-lead"
              aria-hidden="true"
            />
            <select
              className="merchant-date-select-input"
              aria-label="Sort activity"
              value={sort}
              disabled={loading}
              onChange={(event) => setSort(event.target.value as ChartSort)}
            >
              {CHART_SORTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown size={16} strokeWidth={2.4} className="merchant-date-select-icon" />
          </div>
        </div>
      </div>

      {empty ? (
        <div className="panel-card merchant-empty merchant-analytics-empty">
          <p className="merchant-empty-title">
            Analytics will appear once customers start collecting stamps
          </p>
          <p className="merchant-empty-sub">
            Complete your first loyalty transaction to unlock insights.
          </p>
        </div>
      ) : (
        <>
          <div className={`merchant-ltv-card${loading ? " merchant-ltv-card--loading" : ""}`}>
            <div className="merchant-ltv-head">
              <span className="merchant-ltv-eyebrow">Loyalty Performance</span>
            </div>
            <div className="merchant-ltv-value">{display.activeCustomers}</div>
            <p className="merchant-analytics-hero-label">Active customers</p>
            <div className="merchant-ltv-metrics">
              <HeroTile label="Total customers" value={display.totalCustomers} />
              <HeroTile label="Total stamps" value={display.totalStampsAllTime} />
              <HeroTile label="Rewards redeemed" value={display.rewardsRedeemedAllTime} />
              <HeroTile label="Avg visits" value={formatMetric(display.avgVisitsPerCustomer)} />
            </div>
          </div>

          <section className="merchant-section">
            <div className="merchant-section-head">
              <h3 className="merchant-section-label">This period</h3>
              <span className="merchant-section-meta">{display.rangeLabel}</span>
            </div>
            <div className={`merchant-stat-grid${loading ? " merchant-stat-grid--loading" : ""}`}>
              {periodCards.map(({ Icon, value, label, accent }) => (
                <div key={label} className="merchant-stat-card">
                  <div
                    className={`merchant-stat-icon${accent ? " merchant-stat-icon--accent" : ""}`}
                  >
                    <Icon size={18} strokeWidth={2.2} />
                  </div>
                  <div className="merchant-stat-value">{value}</div>
                  <div className="merchant-stat-label">{label}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="merchant-section">
            <div className="merchant-section-head">
              <h3 className="merchant-section-label">Customer Visits</h3>
              <span className="merchant-section-meta">{display.stampsInRange} stamps</span>
            </div>
            <div
              className={`panel-card merchant-chart-card${loading ? " merchant-chart-card--loading" : ""}`}
            >
              <div className="merchant-chart-head">
                <div>
                  <div className="merchant-chart-title">{display.chartTitle}</div>
                  <div className="merchant-chart-sub">{display.chartSub}</div>
                </div>
              </div>
              <ActivityChart buckets={chartBuckets} maxVisits={maxVisits} />
            </div>
          </section>

          <TopCustomersSection customers={display.topCustomers} />
          <FunnelSection stages={display.funnel} />
          <InsightsSection insights={display.insights} />

          <section className="merchant-section">
            <div className="merchant-section-head">
              <h3 className="merchant-section-label">More details</h3>
            </div>
            <div className="panel-card merchant-summary-card">
              {detailRows.map((row, index) => (
                <div key={row.label}>
                  {index > 0 ? <div className="merchant-summary-divider" /> : null}
                  <div className="merchant-summary-row">
                    <span className="merchant-summary-label">{row.label}</span>
                    <span className="merchant-summary-value">{row.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function HeroTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="merchant-ltv-tile">
      <span className="merchant-ltv-tile-label">{label}</span>
      <span className="merchant-ltv-tile-value">{value}</span>
    </div>
  );
}

function TopCustomersSection({ customers }: { customers: AnalyticsTopCustomer[] }) {
  return (
    <section className="merchant-section">
      <div className="merchant-section-head">
        <h3 className="merchant-section-label">Top Customers</h3>
        <span className="merchant-section-meta">By visits</span>
      </div>
      {customers.length === 0 ? (
        <div className="panel-card merchant-empty">
          <p className="merchant-empty-title">No customer activity yet</p>
          <p className="merchant-empty-sub">
            Your most active loyalty members will show up here once stamps start rolling in.
          </p>
        </div>
      ) : (
        <div className="panel-card merchant-progress-list">
          {customers.map((customer, index) => (
            <div key={customer.id} className="merchant-progress-row">
              <div className="merchant-top-rank" aria-hidden>
                {index + 1}
              </div>
              <div className="merchant-avatar">{getInitials(customer.name)}</div>
              <div className="merchant-progress-copy">
                <div className="merchant-list-title">{customer.name}</div>
                <div className="merchant-list-sub">
                  {customer.lifetimeVisits} visit{customer.lifetimeVisits === 1 ? "" : "s"} ·{" "}
                  {customer.stamps}/{customer.totalStamps} stamps · {customer.rewardsClaimed}{" "}
                  reward{customer.rewardsClaimed === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FunnelSection({ stages }: { stages: AnalyticsFunnelStage[] }) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <section className="merchant-section">
      <div className="merchant-section-head">
        <h3 className="merchant-section-label">Loyalty Funnel</h3>
      </div>
      <div className="panel-card merchant-funnel">
        {stages.map((stage, index) => (
          <div key={stage.id} className="merchant-funnel-stage">
            <div className="merchant-funnel-row">
              <div className="merchant-funnel-copy">
                <span className="merchant-funnel-label">{stage.label}</span>
                <span className="merchant-funnel-count">{stage.count}</span>
              </div>
              <div className="merchant-funnel-bar" aria-hidden>
                <span style={{ width: `${Math.max(8, (stage.count / max) * 100)}%` }} />
              </div>
            </div>
            {index < stages.length - 1 ? (
              <div className="merchant-funnel-bridge">
                <span className="merchant-funnel-arrow" aria-hidden>
                  ↓
                </span>
                <span className="merchant-funnel-conv">
                  {stages[index + 1].conversionFromPrevious ?? 0}% convert
                </span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function InsightsSection({ insights }: { insights: AnalyticsInsight[] }) {
  return (
    <section className="merchant-section">
      <div className="merchant-section-head">
        <h3 className="merchant-section-label">Smart Insights</h3>
      </div>
      {insights.length === 0 ? (
        <div className="panel-card merchant-empty">
          <p className="merchant-empty-title">Insights unlock with more activity</p>
          <p className="merchant-empty-sub">
            Keep collecting stamps and we&apos;ll surface patterns worth acting on.
          </p>
        </div>
      ) : (
        <div className="merchant-insights-grid">
          {insights.map((insight) => (
            <div key={insight.id} className="merchant-insight-card">
              <span className="merchant-insight-icon" aria-hidden>
                <Lightbulb size={16} strokeWidth={2.2} />
              </span>
              <p className="merchant-insight-text">{insight.text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityChart({
  buckets,
  maxVisits,
}: {
  buckets: DashboardChartBucket[];
  maxVisits: number;
}) {
  return (
    <div className="merchant-chart-bars">
      {buckets.map((bucket, index) => (
        <div key={`${bucket.label}-${index}`} className="merchant-chart-bar-col">
          <div
            className="merchant-chart-bar"
            style={{ height: `${(bucket.value / maxVisits) * 100}%` }}
          />
          <span className="merchant-chart-bar-label">{bucket.label}</span>
        </div>
      ))}
    </div>
  );
}
