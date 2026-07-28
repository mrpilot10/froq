"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { AnalyticsInsight, DashboardChartBucket } from "@/lib/merchant/types";

const SEGMENT_TONES = ["accent", "brand", "soft", "muted", "warn"] as const;

export type ChartSegment = {
  id: string;
  label: string;
  value: number;
  tone?: (typeof SEGMENT_TONES)[number];
};

/** Vertical bar chart shared by the loyalty and queue analytics views. */
export function ActivityChart({
  buckets,
  max,
  showValues = false,
}: {
  buckets: DashboardChartBucket[];
  max: number;
  showValues?: boolean;
}) {
  const peak = Math.max(...buckets.map((b) => b.value), 0);
  const dense = buckets.length > 14;

  return (
    <div className={`ax-bars${dense ? " ax-bars--dense" : ""}`}>
      {buckets.map((bucket, index) => {
        const ratio = max > 0 ? bucket.value / max : 0;
        const isPeak = bucket.value > 0 && bucket.value === peak;
        return (
          <div
            key={`${bucket.label}-${index}`}
            className={`ax-bar-col${isPeak ? " ax-bar-col--peak" : ""}`}
            title={`${bucket.label}: ${bucket.value}`}
          >
            {showValues && !dense ? (
              <span className="ax-bar-value">{bucket.value || ""}</span>
            ) : null}
            <div className="ax-bar-track">
              <div
                className="ax-bar"
                style={{ height: `${Math.max(bucket.value > 0 ? 6 : 0, ratio * 100)}%` }}
              />
            </div>
            <span className="ax-bar-label">{bucket.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Single percentage ring — rates, seat %, redemption %, etc. */
export function RateRing({
  value,
  label,
  sub,
  size = 104,
}: {
  value: number;
  label: string;
  sub?: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="ax-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          className="ax-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="ax-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="ax-ring-pct"
        >
          {clamped}%
        </text>
      </svg>
      <div className="ax-ring-copy">
        <span className="ax-ring-label">{label}</span>
        {sub ? <span className="ax-ring-sub">{sub}</span> : null}
      </div>
    </div>
  );
}

/** Multi-segment donut with a center value and legend. */
export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  size = 148,
}: {
  segments: ChartSegment[];
  centerValue: string | number;
  centerLabel: string;
  size?: number;
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  let cursor = 0;
  const arcs =
    total <= 0
      ? []
      : segments.map((segment, index) => {
          const length = (Math.max(0, segment.value) / total) * circumference;
          const dashoffset = -cursor;
          cursor += length;
          return {
            ...segment,
            tone: segment.tone ?? SEGMENT_TONES[index % SEGMENT_TONES.length],
            length,
            dashoffset,
          };
        });

  return (
    <div className="ax-donut">
      <div className="ax-donut-viz" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle
            className="ax-donut-track"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
          />
          {arcs.map((arc) =>
            arc.length <= 0 ? null : (
              <circle
                key={arc.id}
                className={`ax-donut-seg ax-donut-seg--${arc.tone}`}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={stroke}
                strokeDasharray={`${arc.length} ${circumference - arc.length}`}
                strokeDashoffset={arc.dashoffset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            ),
          )}
        </svg>
        <div className="ax-donut-center">
          <span className="ax-donut-center-value">{centerValue}</span>
          <span className="ax-donut-center-label">{centerLabel}</span>
        </div>
      </div>
      <ul className="ax-donut-legend">
        {segments.map((segment, index) => (
          <li key={segment.id}>
            <span
              className={`ax-swatch ax-swatch--${segment.tone ?? SEGMENT_TONES[index % SEGMENT_TONES.length]}`}
              aria-hidden
            />
            <span className="ax-donut-legend-label">{segment.label}</span>
            <span className="ax-donut-legend-value">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal ranked bars (top customers, staff, party sizes). */
export function HBarList({
  items,
  valueLabel,
}: {
  items: Array<{
    id: string;
    label: string;
    sub?: string;
    value: number;
    display?: string;
    leading?: ReactNode;
  }>;
  valueLabel?: (value: number) => string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="ax-hbar-list">
      {items.map((item) => (
        <div key={item.id} className="ax-hbar-row">
          {item.leading ? <div className="ax-hbar-leading">{item.leading}</div> : null}
          <div className="ax-hbar-body">
            <div className="ax-hbar-head">
              <div className="ax-hbar-copy">
                <span className="ax-hbar-label">{item.label}</span>
                {item.sub ? <span className="ax-hbar-sub">{item.sub}</span> : null}
              </div>
              <span className="ax-hbar-value">
                {item.display ?? (valueLabel ? valueLabel(item.value) : item.value)}
              </span>
            </div>
            <div className="ax-hbar-track" aria-hidden>
              <span style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Two-way composition bar (walk-in vs reservation, etc.). */
export function SplitBar({
  left,
  right,
}: {
  left: { label: string; value: number };
  right: { label: string; value: number };
}) {
  const total = left.value + right.value;
  const leftPct = total > 0 ? Math.round((left.value / total) * 100) : 50;
  const rightPct = total > 0 ? 100 - leftPct : 50;

  return (
    <div className="ax-split">
      <div className="ax-split-head">
        <div>
          <span className="ax-split-value">{left.value}</span>
          <span className="ax-split-label">{left.label}</span>
        </div>
        <div className="ax-split-head-right">
          <span className="ax-split-value">{right.value}</span>
          <span className="ax-split-label">{right.label}</span>
        </div>
      </div>
      <div className="ax-split-track" aria-hidden>
        <span className="ax-split-left" style={{ width: `${leftPct}%` }} />
        <span className="ax-split-right" style={{ width: `${rightPct}%` }} />
      </div>
      <div className="ax-split-pcts">
        <span>{leftPct}%</span>
        <span>{rightPct}%</span>
      </div>
    </div>
  );
}

/** Compact visual metric tiles — replaces text-heavy detail lists. */
export function MetricTiles({
  items,
}: {
  items: Array<{
    id: string;
    label: string;
    value: string | number;
    Icon?: LucideIcon;
    accent?: boolean;
  }>;
}) {
  return (
    <div className="ax-metric-grid">
      {items.map(({ id, label, value, Icon, accent }) => (
        <div key={id} className={`ax-metric-tile${accent ? " ax-metric-tile--accent" : ""}`}>
          {Icon ? (
            <span className="ax-metric-icon" aria-hidden>
              <Icon size={15} strokeWidth={2.2} />
            </span>
          ) : null}
          <span className="ax-metric-value">{value}</span>
          <span className="ax-metric-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartPanel({
  title,
  sub,
  meta,
  loading,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  meta?: string;
  loading?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`panel-card merchant-chart-card ax-panel${loading ? " merchant-chart-card--loading" : ""}${className ? ` ${className}` : ""}`}
    >
      <div className="merchant-chart-head">
        <div>
          <div className="merchant-chart-title">{title}</div>
          {sub ? <div className="merchant-chart-sub">{sub}</div> : null}
        </div>
        {meta ? <span className="ax-panel-meta">{meta}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function InsightsGrid({
  insights,
  Icon,
}: {
  insights: AnalyticsInsight[];
  Icon: LucideIcon;
}) {
  return (
    <div className="merchant-insights-grid">
      {insights.map((insight) => (
        <div key={insight.id} className="merchant-insight-card">
          <span className="merchant-insight-icon" aria-hidden>
            <Icon size={16} strokeWidth={2.2} />
          </span>
          <p className="merchant-insight-text">{insight.text}</p>
        </div>
      ))}
    </div>
  );
}
