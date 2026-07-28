"use client";

import { useMemo } from "react";
import {
  CalendarCheck,
  Clock3,
  Lightbulb,
  Timer,
  UserMinus,
  Users,
  Utensils,
} from "lucide-react";
import type { QueueAnalyticsStats, QueueStaffStat } from "@/lib/merchant/queue-analytics";
import { ROLE_LABELS } from "@/lib/merchant/roles";
import { formatWaitShort } from "@/lib/queue/format";
import {
  ActivityChart,
  ChartPanel,
  DonutChart,
  HBarList,
  InsightsGrid,
  MetricTiles,
  RateRing,
  SplitBar,
} from "./analytics-primitives";
import { FunnelSection, type ChartSort } from "./loyalty-analytics-view";

interface QueueAnalyticsViewProps {
  stats: QueueAnalyticsStats | null;
  sort: ChartSort;
  loading: boolean;
  truncated: boolean;
  error?: string;
}

export function QueueAnalyticsView({
  stats,
  sort,
  loading,
  truncated,
  error,
}: QueueAnalyticsViewProps) {
  const chartBuckets = useMemo(() => {
    const buckets = stats?.chartBuckets ?? [];
    if (sort === "highest") return [...buckets].sort((a, b) => b.value - a.value);
    return buckets;
  }, [stats?.chartBuckets, sort]);

  if (error) {
    return (
      <div className="panel-card merchant-empty merchant-analytics-empty">
        <p className="merchant-empty-title">Couldn&apos;t load queue analytics</p>
        <p className="merchant-empty-sub">{error}</p>
      </div>
    );
  }

  if (!stats || !stats.hasActivity) {
    return (
      <div className="panel-card merchant-empty merchant-analytics-empty">
        <p className="merchant-empty-title">No queue activity in this period</p>
        <p className="merchant-empty-sub">
          Once guests join your waitlist, wait times and seating rates show up here.
        </p>
      </div>
    );
  }

  const max = Math.max(...chartBuckets.map((bucket) => bucket.value), 1);
  const dayMax = Math.max(...stats.dayBuckets.map((b) => b.value), 1);
  const hourMax = Math.max(...stats.hourBuckets.map((b) => b.value), 1);
  const partyMax = Math.max(...stats.partySizeBuckets.map((b) => b.value), 1);

  const periodCards = [
    { Icon: Users, value: String(stats.totalParties), label: "Parties joined" },
    { Icon: CalendarCheck, value: String(stats.seatedParties), label: "Seated", accent: true },
    { Icon: UserMinus, value: String(stats.leftParties), label: "Left the queue" },
    { Icon: Timer, value: formatWaitShort(stats.avgWaitMinutes), label: "Average wait" },
  ];

  const outcomeSegments = [
    { id: "seated", label: "Seated", value: stats.seatedParties, tone: "accent" as const },
    { id: "left", label: "Left", value: stats.leftParties, tone: "warn" as const },
    { id: "open", label: "Still open", value: stats.stillOpenParties, tone: "soft" as const },
  ];

  const snapshotTiles = [
    {
      id: "guests",
      label: "Total guests",
      value: stats.totalGuests,
      Icon: Users,
      accent: true,
    },
    {
      id: "avg-party",
      label: "Avg party size",
      value: stats.avgPartySize,
      Icon: Utensils,
    },
    {
      id: "largest",
      label: "Largest party",
      value: stats.largestPartySize,
      Icon: Users,
    },
    {
      id: "longest",
      label: "Longest wait",
      value: formatWaitShort(stats.longestWaitMinutes),
      Icon: Timer,
    },
    {
      id: "to-call",
      label: "Avg time to call",
      value: formatWaitShort(stats.avgTimeToCallMinutes),
      Icon: Clock3,
    },
    {
      id: "response",
      label: "Call → seated",
      value: formatWaitShort(stats.avgResponseMinutes),
      Icon: CalendarCheck,
    },
    {
      id: "sessions",
      label: "Sessions run",
      value: stats.sessionsRun,
      Icon: Clock3,
    },
    {
      id: "per-session",
      label: "Parties / session",
      value: stats.avgPartiesPerSession,
      Icon: Users,
    },
  ];

  return (
    <>
      {truncated ? (
        <div className="panel-card merchant-empty merchant-analytics-truncated">
          <p className="merchant-empty-sub">
            This range has more entries than we can chart at once — figures cover the most
            recent activity only. Pick a shorter range for exact numbers.
          </p>
        </div>
      ) : null}

      <div className={`merchant-ltv-card${loading ? " merchant-ltv-card--loading" : ""}`}>
        <div className="merchant-ltv-head">
          <span className="merchant-ltv-eyebrow">Queue Performance</span>
        </div>
        <div className="merchant-ltv-value">{formatWaitShort(stats.avgWaitMinutes)}</div>
        <p className="merchant-analytics-hero-label">Average wait before seating</p>
        <div className="merchant-ltv-metrics">
          <HeroTile label="Parties" value={stats.totalParties} />
          <HeroTile label="Guests" value={stats.totalGuests} />
          <HeroTile label="Seat rate" value={`${stats.seatRate}%`} />
          <HeroTile label="Longest wait" value={formatWaitShort(stats.longestWaitMinutes)} />
        </div>
      </div>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <h3 className="merchant-section-label">This period</h3>
          <span className="merchant-section-meta">{stats.rangeLabel}</span>
        </div>
        <div className={`merchant-stat-grid${loading ? " merchant-stat-grid--loading" : ""}`}>
          {periodCards.map(({ Icon, value, label, accent }) => (
            <div key={label} className="merchant-stat-card">
              <div className={`merchant-stat-icon${accent ? " merchant-stat-icon--accent" : ""}`}>
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
            <h3 className="merchant-section-label">Queue volume</h3>
            <span className="merchant-section-meta">{stats.totalParties} parties</span>
          </div>
          <ChartPanel
            title={stats.chartTitle}
            sub={stats.chartSub}
            loading={loading}
            meta={`${stats.totalParties}`}
          >
            <ActivityChart
              buckets={chartBuckets}
              max={max}
              showValues={chartBuckets.length <= 10}
            />
          </ChartPanel>
        </section>

        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Outcomes</h3>
          </div>
          <div className={`panel-card ax-donut-card${loading ? " merchant-chart-card--loading" : ""}`}>
            <DonutChart
              segments={outcomeSegments}
              centerValue={`${stats.seatRate}%`}
              centerLabel="seated"
            />
          </div>
        </section>
      </div>

      <div className="ax-grid-2">
        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Guest mix</h3>
          </div>
          <div className={`panel-card ax-stack-card${loading ? " merchant-chart-card--loading" : ""}`}>
            <SplitBar
              left={{ label: "Walk-ins", value: stats.walkIns }}
              right={{ label: "Reservations", value: stats.reservations }}
            />
            <div className="ax-stack-divider" />
            <div>
              <div className="ax-mini-title">Party size</div>
              <ActivityChart buckets={stats.partySizeBuckets} max={partyMax} showValues />
            </div>
          </div>
        </section>

        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Wait & conversion</h3>
          </div>
          <div className={`panel-card ax-rings-card${loading ? " merchant-chart-card--loading" : ""}`}>
            <div className="ax-rings">
              <RateRing
                value={stats.seatRate}
                label="Seat rate"
                sub={`${stats.seatedParties} seated`}
              />
              <RateRing
                value={stats.abandonRate}
                label="Left without seating"
                sub={`${stats.leftParties} parties`}
              />
              <RateRing
                value={
                  stats.totalParties > 0
                    ? Math.round((stats.reservations / stats.totalParties) * 100)
                    : 0
                }
                label="Reservations"
                sub={`${stats.reservations} booked ahead`}
              />
            </div>
          </div>
        </section>
      </div>

      <div className="ax-grid-2">
        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">By day of week</h3>
            <span className="merchant-section-meta">
              {stats.busiestDay ? `Peak ${stats.busiestDay.label}` : "Joins"}
            </span>
          </div>
          <ChartPanel title="Parties by day" sub="When guests join" loading={loading}>
            <ActivityChart buckets={stats.dayBuckets} max={dayMax} showValues />
          </ChartPanel>
        </section>

        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">By time of day</h3>
            <span className="merchant-section-meta">
              {stats.busiestHour ? `Peak ${stats.busiestHour.label}` : "Joins"}
            </span>
          </div>
          <ChartPanel title="Parties by hour" sub="Two-hour windows" loading={loading}>
            <ActivityChart buckets={stats.hourBuckets} max={hourMax} />
          </ChartPanel>
        </section>
      </div>

      <FunnelSection title="Queue funnel" stages={stats.funnel} />

      <StaffSection staff={stats.staff} />

      <section className="merchant-section">
        <div className="merchant-section-head">
          <h3 className="merchant-section-label">Snapshot</h3>
        </div>
        <MetricTiles items={snapshotTiles} />
      </section>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <h3 className="merchant-section-label">Smart insights</h3>
        </div>
        {stats.insights.length === 0 ? (
          <div className="panel-card merchant-empty">
            <p className="merchant-empty-title">Insights unlock with more activity</p>
            <p className="merchant-empty-sub">
              Run a few more queue sessions and we&apos;ll surface patterns worth acting on.
            </p>
          </div>
        ) : (
          <InsightsGrid insights={stats.insights} Icon={Lightbulb} />
        )}
      </section>
    </>
  );
}

function StaffSection({ staff }: { staff: QueueStaffStat[] }) {
  if (staff.length === 0) return null;

  return (
    <section className="merchant-section">
      <div className="merchant-section-head">
        <h3 className="merchant-section-label">Sessions by team member</h3>
        <span className="merchant-section-meta">Who started the queue</span>
      </div>
      <div className="panel-card ax-list-card">
        <HBarList
          items={staff.map((member) => ({
            id: member.key,
            label: member.name,
            sub: [
              member.role ? ROLE_LABELS[member.role] : null,
              `${member.sessions} ${member.sessions === 1 ? "session" : "sessions"}`,
              `${member.seated} seated`,
              `${formatWaitShort(member.avgWaitMinutes)} avg wait`,
            ]
              .filter(Boolean)
              .join(" · "),
            value: member.parties,
            display: `${member.parties} ${member.parties === 1 ? "party" : "parties"}`,
          }))}
        />
      </div>
    </section>
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
