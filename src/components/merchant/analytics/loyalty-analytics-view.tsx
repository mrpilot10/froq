"use client";

import { useMemo } from "react";
import {
  CalendarDays,
  Clock,
  Gift,
  Lightbulb,
  RefreshCw,
  Stamp,
  Timer,
  UserPlus,
  Users,
} from "lucide-react";
import type {
  AnalyticsFunnelStage,
  AnalyticsInsight,
  AnalyticsTopCustomer,
  DashboardFilteredStats,
} from "@/lib/merchant/types";
import {
  ActivityChart,
  ChartPanel,
  DonutChart,
  HBarList,
  InsightsGrid,
  MetricTiles,
  RateRing,
} from "./analytics-primitives";

export type ChartSort = "chronological" | "highest";

interface LoyaltyAnalyticsViewProps {
  stats: DashboardFilteredStats;
  sort: ChartSort;
  loading: boolean;
}

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

export function LoyaltyAnalyticsView({ stats, sort, loading }: LoyaltyAnalyticsViewProps) {
  const display = stats;
  const chartBuckets = useMemo(() => {
    const buckets = display.chartBuckets;
    if (sort === "highest") {
      return [...buckets].sort((a, b) => b.value - a.value);
    }
    return buckets;
  }, [display.chartBuckets, sort]);

  const maxVisits = Math.max(...chartBuckets.map((bucket) => bucket.value), 1);

  if (!display.hasActivity) {
    return (
      <div className="panel-card merchant-empty merchant-analytics-empty">
        <p className="merchant-empty-title">
          Analytics will appear once customers start collecting stamps
        </p>
        <p className="merchant-empty-sub">
          Complete your first loyalty transaction to unlock insights.
        </p>
      </div>
    );
  }

  const rangeError = display.rangeStatsError;
  const periodCards = [
    {
      Icon: Stamp,
      value: rangeError ? null : display.stampsInRange,
      label: "Stamps in period",
      error: rangeError,
    },
    {
      Icon: Gift,
      value:
        display.range === "all"
          ? display.rewardsRedeemedAllTime
          : rangeError
            ? null
            : display.rewardsInRange,
      label: "Rewards redeemed",
      accent: true,
      error: display.range !== "all" && rangeError,
    },
    { Icon: UserPlus, value: display.newCustomersInRange, label: "New customers" },
    { Icon: Clock, value: display.pendingApprovals, label: "Pending approvals" },
  ];

  const engaged =
    Math.max(0, display.totalCustomers - display.inactiveCustomers - display.customersNearReward);
  const healthSegments = [
    { id: "active", label: "Engaged", value: engaged, tone: "accent" as const },
    {
      id: "near",
      label: "Near reward",
      value: display.customersNearReward,
      tone: "brand" as const,
    },
    {
      id: "inactive",
      label: "Inactive 30+",
      value: display.inactiveCustomers,
      tone: "muted" as const,
    },
  ];

  const nearRewardPct =
    display.totalCustomers > 0
      ? Math.round((display.customersNearReward / display.totalCustomers) * 100)
      : 0;

  const snapshotTiles = [
    {
      id: "near",
      label: "Near reward",
      value: display.customersNearReward,
      Icon: Gift,
      accent: true,
    },
    {
      id: "returning",
      label: "Returning",
      value: display.returningCustomers,
      Icon: RefreshCw,
    },
    {
      id: "inactive",
      label: "Inactive 30+",
      value: display.inactiveCustomers,
      Icon: Users,
    },
    {
      id: "avg-days",
      label: "Days between visits",
      value: formatMetric(display.avgDaysBetweenVisits),
      Icon: Timer,
    },
    {
      id: "stamps-today",
      label: "Stamps today",
      value: display.stampsToday,
      Icon: Stamp,
    },
    {
      id: "stamps-month",
      label: "Stamps this month",
      value: display.stampsThisMonth,
      Icon: Stamp,
    },
    {
      id: "busy-day",
      label: "Busiest day",
      value: display.mostActiveDay ?? "—",
      Icon: CalendarDays,
    },
    {
      id: "busy-hour",
      label: "Busiest hour",
      value: display.mostActiveHour ?? "—",
      Icon: Clock,
    },
  ];

  return (
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
          {periodCards.map(({ Icon, value, label, accent, error }) => (
            <div key={label} className="merchant-stat-card">
              <div className={`merchant-stat-icon${accent ? " merchant-stat-icon--accent" : ""}`}>
                <Icon size={18} strokeWidth={2.2} />
              </div>
              <div className="merchant-stat-value">{error || value === null ? "—" : value}</div>
              <div className="merchant-stat-label">{error ? "Couldn't load stats" : label}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="ax-grid-2">
        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Customer visits</h3>
            <span className="merchant-section-meta">
              {rangeError ? "Unavailable" : `${display.stampsInRange} stamps`}
            </span>
          </div>
          <ChartPanel
            title={display.chartTitle}
            sub={display.chartSub}
            loading={loading}
            meta={rangeError ? undefined : `${display.stampsInRange}`}
          >
            {rangeError ? (
              <div className="merchant-empty" style={{ padding: "1.5rem 0" }}>
                <p className="merchant-empty-title">Couldn&apos;t load stats</p>
                <p className="merchant-empty-sub">
                  Visit chart unavailable right now. Try again in a moment.
                </p>
              </div>
            ) : (
              <ActivityChart
                buckets={chartBuckets}
                max={maxVisits}
                showValues={chartBuckets.length <= 10}
              />
            )}
          </ChartPanel>
        </section>

        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Health rates</h3>
          </div>
          <div className={`panel-card ax-rings-card${loading ? " merchant-chart-card--loading" : ""}`}>
            <div className="ax-rings">
              <RateRing
                value={display.repeatVisitRate}
                label="Repeat visits"
                sub={`${display.returningCustomers} customers`}
              />
              <RateRing
                value={display.redemptionRate}
                label="Redemption"
                sub={`${display.rewardsRedeemedAllTime} rewards`}
              />
              <RateRing
                value={nearRewardPct}
                label="Near reward"
                sub={`${display.customersNearReward} one stamp away`}
              />
            </div>
          </div>
        </section>
      </div>

      <div className="ax-grid-2">
        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Customer mix</h3>
          </div>
          <div className={`panel-card ax-donut-card${loading ? " merchant-chart-card--loading" : ""}`}>
            <DonutChart
              segments={healthSegments}
              centerValue={display.totalCustomers}
              centerLabel="customers"
            />
          </div>
        </section>

        <FunnelSection title="Loyalty funnel" stages={display.funnel} />
      </div>

      <TopCustomersSection customers={display.topCustomers} />

      <section className="merchant-section">
        <div className="merchant-section-head">
          <h3 className="merchant-section-label">Snapshot</h3>
        </div>
        <MetricTiles items={snapshotTiles} />
      </section>

      <InsightsSection insights={display.insights} />
    </>
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
        <h3 className="merchant-section-label">Top customers</h3>
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
        <div className="panel-card ax-list-card">
          <HBarList
            items={customers.map((customer, index) => ({
              id: customer.id,
              label: customer.name,
              sub: `${customer.stamps}/${customer.totalStamps} stamps · ${customer.rewardsClaimed} reward${customer.rewardsClaimed === 1 ? "" : "s"}`,
              value: customer.lifetimeVisits,
              display: `${customer.lifetimeVisits} visit${customer.lifetimeVisits === 1 ? "" : "s"}`,
              leading: (
                <div className="ax-hbar-avatar" aria-hidden>
                  <span className="ax-hbar-rank">{index + 1}</span>
                  <span className="merchant-avatar">{getInitials(customer.name)}</span>
                </div>
              ),
            }))}
          />
        </div>
      )}
    </section>
  );
}

export function FunnelSection({
  title,
  stages,
}: {
  title: string;
  stages: AnalyticsFunnelStage[];
}) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <section className="merchant-section">
      <div className="merchant-section-head">
        <h3 className="merchant-section-label">{title}</h3>
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
        <h3 className="merchant-section-label">Smart insights</h3>
      </div>
      {insights.length === 0 ? (
        <div className="panel-card merchant-empty">
          <p className="merchant-empty-title">Insights unlock with more activity</p>
          <p className="merchant-empty-sub">
            Keep collecting stamps and we&apos;ll surface patterns worth acting on.
          </p>
        </div>
      ) : (
        <InsightsGrid insights={insights} Icon={Lightbulb} />
      )}
    </section>
  );
}
