"use client";

import { useMemo } from "react";
import {
  CalendarCheck,
  CalendarClock,
  Check,
  UserX,
  Users,
} from "lucide-react";
import type { DashboardChartBucket } from "@/lib/merchant/types";
import { formatDateLabel } from "@/lib/merchant/reservations";
import type { ReservationAnalytics } from "@/lib/reservations/stats";
import { ActivityChart, ChartPanel, MetricTiles, RateRing } from "./analytics-primitives";
import type { ChartSort } from "./loyalty-analytics-view";

interface ReservationAnalyticsViewProps {
  analytics: ReservationAnalytics | null;
  sort: ChartSort;
  loading: boolean;
  error?: string;
}

export function ReservationAnalyticsView({
  analytics,
  sort,
  loading,
  error,
}: ReservationAnalyticsViewProps) {
  const buckets = useMemo<DashboardChartBucket[]>(() => {
    const daily = (analytics?.daily ?? []).map((day) => ({
      label: formatDateLabel(day.date),
      value: day.count,
    }));
    if (sort === "highest") return [...daily].sort((a, b) => b.value - a.value);
    return daily;
  }, [analytics?.daily, sort]);

  if (error) {
    return (
      <div className="panel-card merchant-empty merchant-analytics-empty">
        <p className="merchant-empty-title">Couldn&apos;t load reservation analytics</p>
        <p className="merchant-empty-sub">{error}</p>
      </div>
    );
  }

  if (!analytics || analytics.total === 0) {
    return (
      <div className="panel-card merchant-empty merchant-analytics-empty">
        <p className="merchant-empty-title">No reservations in this period</p>
        <p className="merchant-empty-sub">
          Once guests request tables, confirmation rates and party sizes show up here.
        </p>
      </div>
    );
  }

  const max = Math.max(...buckets.map((bucket) => bucket.value), 1);

  const periodCards = [
    {
      Icon: CalendarClock,
      value: String(analytics.today),
      label: "Today's reservations",
      accent: true,
    },
    { Icon: CalendarCheck, value: `${analytics.confirmedRate}%`, label: "Confirmed" },
    { Icon: Check, value: String(analytics.completed), label: "Completed" },
    { Icon: UserX, value: String(analytics.noShows), label: "No shows" },
  ];

  return (
    <>
      <div className={`merchant-ltv-card${loading ? " merchant-ltv-card--loading" : ""}`}>
        <div className="merchant-ltv-head">
          <span className="merchant-ltv-eyebrow">Reservations</span>
        </div>
        <div className="merchant-ltv-value">{analytics.total}</div>
        <p className="merchant-analytics-hero-label">Bookings in this period</p>
        <div className="merchant-ltv-metrics">
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Confirmed</span>
            <span className="merchant-ltv-tile-value">{analytics.confirmedRate}%</span>
          </div>
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Completed</span>
            <span className="merchant-ltv-tile-value">{analytics.completed}</span>
          </div>
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">No shows</span>
            <span className="merchant-ltv-tile-value">{analytics.noShows}</span>
          </div>
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Avg party</span>
            <span className="merchant-ltv-tile-value">{analytics.averagePartySize}</span>
          </div>
        </div>
      </div>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <h3 className="merchant-section-label">This period</h3>
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

      <div className="ax-grid-2">
        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Booking volume</h3>
            <span className="merchant-section-meta">{analytics.total} bookings</span>
          </div>
          <ChartPanel
            title="Reservations by day"
            sub="Tables booked for each date"
            loading={loading}
            meta={`${analytics.total}`}
          >
            <ActivityChart buckets={buckets} max={max} showValues={buckets.length <= 10} />
          </ChartPanel>
        </section>

        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Outcomes</h3>
          </div>
          <div
            className={`panel-card ax-rings-card${loading ? " merchant-chart-card--loading" : ""}`}
          >
            <div className="ax-rings">
              <RateRing
                value={analytics.confirmedRate}
                label="Confirmed"
                sub={`of reviewed requests`}
              />
              <RateRing
                value={
                  analytics.total > 0
                    ? Math.round((analytics.completed / analytics.total) * 100)
                    : 0
                }
                label="Completed"
                sub={`${analytics.completed} guests seated`}
              />
              <RateRing
                value={
                  analytics.total > 0
                    ? Math.round((analytics.noShows / analytics.total) * 100)
                    : 0
                }
                label="No shows"
                sub={`${analytics.noShows} tables missed`}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <h3 className="merchant-section-label">Snapshot</h3>
        </div>
        <MetricTiles
          items={[
            {
              id: "today",
              label: "Today's reservations",
              value: analytics.today,
              Icon: CalendarClock,
              accent: true,
            },
            {
              id: "confirmed",
              label: "Confirmed %",
              value: `${analytics.confirmedRate}%`,
              Icon: CalendarCheck,
            },
            { id: "no-shows", label: "No shows", value: analytics.noShows, Icon: UserX },
            { id: "completed", label: "Completed", value: analytics.completed, Icon: Check },
            {
              id: "avg-party",
              label: "Average party size",
              value: analytics.averagePartySize,
              Icon: Users,
            },
          ]}
        />
      </section>
    </>
  );
}
