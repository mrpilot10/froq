"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatInr, formatNumber, formatPercent } from "@/lib/admin/format";
import type { KpiMetric, SparkPoint } from "@/lib/admin/metrics";

const ACCENT = "#00f47b";
const BRAND = "#004353";
const MUTED = "#8a9e97";

export function Sparkline({ data }: { data: SparkPoint[] }) {
  if (!data.length) return <div className="admin-spark admin-spark--empty" />;
  return (
    <div className="admin-spark">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={ACCENT}
            strokeWidth={1.5}
            fill="url(#sparkFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KpiCard({ kpi }: { kpi: KpiMetric }) {
  const value =
    kpi.display === "currency"
      ? formatInr(kpi.value, { compact: true })
      : kpi.display === "percent"
        ? `${kpi.value.toFixed(1)}%`
        : formatNumber(kpi.value, { compact: true });

  const up = (kpi.changePct ?? 0) > 0;
  const down = (kpi.changePct ?? 0) < 0;

  return (
    <article className="admin-kpi">
      <div className="admin-kpi-top">
        <span className="admin-kpi-label">{kpi.label}</span>
        {kpi.changePct != null ? (
          <span
            className={[
              "admin-kpi-delta",
              up ? "admin-kpi-delta--up" : "",
              down ? "admin-kpi-delta--down" : "",
            ].join(" ")}
          >
            {formatPercent(kpi.changePct)}
          </span>
        ) : null}
      </div>
      <div className="admin-kpi-value">{value}</div>
      {kpi.hint ? <div className="admin-kpi-hint">{kpi.hint}</div> : null}
      <Sparkline data={kpi.sparkline} />
    </article>
  );
}

export function RevenueBars({
  data,
}: {
  data: Array<{ label: string; mrr: number; count: number }>;
}) {
  return (
    <div className="admin-chart">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,67,83,0.08)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatInr(Number(v), { compact: true })}
          />
          <Tooltip
            formatter={(value) => formatInr(Number(value))}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid rgba(0,67,83,0.1)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="mrr" fill={BRAND} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const PIE_COLORS = ["#004353", "#00f47b", "#0a7a68", "#7ad9b0", "#c5ebe0", "#2c5f56"];

export function AdoptionPie({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const filtered = data.filter((d) => d.value > 0);
  if (!filtered.length) {
    return <div className="admin-empty-inline">No active product adoption yet.</div>;
  }
  return (
    <div className="admin-chart admin-chart--pie">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={filtered}
            dataKey="value"
            nameKey="label"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={2}
          >
            {filtered.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: "1px solid rgba(0,67,83,0.1)",
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="admin-legend">
        {filtered.map((d, i) => (
          <li key={d.label}>
            <span
              className="admin-legend-swatch"
              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
            />
            {d.label}
            <strong>{d.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function UsageArea({
  data,
  valueKey = "calls",
  formatValue,
}: {
  data: Array<Record<string, string | number>>;
  valueKey?: string;
  formatValue?: (v: number) => string;
}) {
  if (!data.length) {
    return <div className="admin-empty-inline">No usage in this window.</div>;
  }
  const fmt = formatValue ?? ((v: number) => formatNumber(v, { compact: true }));
  return (
    <div className="admin-chart">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,67,83,0.08)" vertical={false} />
          <XAxis dataKey="t" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => fmt(Number(v))}
          />
          <Tooltip
            formatter={(value) => fmt(Number(value))}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid rgba(0,67,83,0.1)",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey={valueKey}
            stroke={ACCENT}
            strokeWidth={2}
            fill="url(#usageFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FeatureBars({
  data,
}: {
  data: Array<{ label: string; calls: number; costInr: number }>;
}) {
  if (!data.length) {
    return <div className="admin-empty-inline">No feature breakdown yet.</div>;
  }
  return (
    <div className="admin-chart">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,67,83,0.08)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatNumber(Number(v), { compact: true })}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: "1px solid rgba(0,67,83,0.1)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="calls" fill={BRAND} radius={[6, 6, 0, 0]} name="Calls" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StubPanel({
  title,
  description,
  needs,
}: {
  title: string;
  description: string;
  needs: string[];
}) {
  return (
    <section className="admin-panel admin-stub">
      <div className="admin-stub-badge">Instrumentation pending</div>
      <h2 className="admin-panel-title">{title}</h2>
      <p className="admin-muted">{description}</p>
      <ul className="admin-stub-list">
        {needs.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
