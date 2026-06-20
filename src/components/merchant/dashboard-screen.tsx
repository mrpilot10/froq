"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Gift, Stamp, Users, Clock } from "lucide-react";
import { getDashboardStats } from "@/app/merchant/actions";
import type { DashboardDateRange, DashboardFilteredStats } from "@/lib/merchant/types";
import { computeLtv, formatCompactCurrency, formatCurrency } from "@/lib/merchant/ltv";
import { MerchantPosterCard } from "./poster-card";

interface DashboardScreenProps {
  businessName: string;
  avgOrderValue: number;
  initialStats: DashboardFilteredStats;
}

const DATE_RANGES: { value: DashboardDateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

export function DashboardScreen({ businessName, avgOrderValue, initialStats }: DashboardScreenProps) {
  const [range, setRange] = useState<DashboardDateRange>(initialStats.range);
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async (nextRange: DashboardDateRange) => {
    setLoading(true);
    const next = await getDashboardStats(nextRange);
    if (next) setStats(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (range === initialStats.range) {
      setStats(initialStats);
      return;
    }
    void loadStats(range);
  }, [range, initialStats, loadStats]);

  // Parent refresh (realtime) updates the default "today" view.
  useEffect(() => {
    if (range === "today") setStats(initialStats);
  }, [initialStats, range]);

  const maxVisits = Math.max(...stats.chartBuckets.map((bucket) => bucket.value), 1);
  const averageLtv = computeLtv(stats.avgLifetimeVisits, avgOrderValue);
  const lifetimeTotal = averageLtv * stats.totalCustomers;
  const stampsLabel =
    stats.range === "today"
      ? "Stamps today"
      : stats.range === "all"
        ? "Total stamps"
        : "Stamps in period";
  const rewardsLabel =
    stats.range === "all" ? "Rewards redeemed" : "Rewards in period";

  return (
    <div className="tab-screen">
      <div className="tab-head merchant-dashboard-head">
        <div>
          <h2 className="tab-title">Dashboard</h2>
          <p className="tab-sub">
            {businessName} · {stats.rangeLabel}
          </p>
        </div>
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
      </div>

      <div className={`merchant-ltv-card${loading ? " merchant-ltv-card--loading" : ""}`}>
        <div className="merchant-ltv-head">
          <span className="merchant-ltv-eyebrow">Average customer LTV</span>
        </div>
        <div className="merchant-ltv-value">{formatCurrency(averageLtv)}</div>
        <div className="merchant-ltv-foot merchant-ltv-foot--grid">
          <div className="merchant-ltv-foot-item">
            <span className="merchant-ltv-foot-label">Total lifetime value</span>
            <span className="merchant-ltv-foot-value">{formatCompactCurrency(lifetimeTotal)}</span>
          </div>
          <div className="merchant-ltv-foot-item">
            <span className="merchant-ltv-foot-label">Avg. order</span>
            <span className="merchant-ltv-foot-value">{formatCurrency(avgOrderValue)}</span>
          </div>
          <div className="merchant-ltv-foot-item">
            <span className="merchant-ltv-foot-label">Total customers</span>
            <span className="merchant-ltv-foot-value">{stats.totalCustomers}</span>
          </div>
          <div className="merchant-ltv-foot-item">
            <span className="merchant-ltv-foot-label">Avg. visits</span>
            <span className="merchant-ltv-foot-value">
              {stats.avgLifetimeVisits.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      <div className={`merchant-stat-grid${loading ? " merchant-stat-grid--loading" : ""}`}>
        <div className="merchant-stat-card">
          <div className="merchant-stat-icon">
            <Users size={18} strokeWidth={2.2} />
          </div>
          <div className="merchant-stat-value">{stats.totalCustomers}</div>
          <div className="merchant-stat-label">Total customers</div>
        </div>
        <div className="merchant-stat-card">
          <div className="merchant-stat-icon">
            <Stamp size={18} strokeWidth={2.2} />
          </div>
          <div className="merchant-stat-value">{stats.stampsInRange}</div>
          <div className="merchant-stat-label">{stampsLabel}</div>
        </div>
        <div className="merchant-stat-card">
          <div className="merchant-stat-icon">
            <Clock size={18} strokeWidth={2.2} />
          </div>
          <div className="merchant-stat-value">{stats.pendingApprovals}</div>
          <div className="merchant-stat-label">Pending approval</div>
        </div>
        <div className="merchant-stat-card">
          <div className="merchant-stat-icon merchant-stat-icon--accent">
            <Gift size={18} strokeWidth={2.2} />
          </div>
          <div className="merchant-stat-value">
            {stats.range === "all" ? stats.rewardsRedeemedAllTime : stats.rewardsInRange}
          </div>
          <div className="merchant-stat-label">{rewardsLabel}</div>
        </div>
      </div>

      <div className={`panel-card merchant-chart-card${loading ? " merchant-chart-card--loading" : ""}`}>
        <div className="merchant-chart-head">
          <div>
            <div className="merchant-chart-title">{stats.chartTitle}</div>
            <div className="merchant-chart-sub">{stats.chartSub}</div>
          </div>
          <div className="merchant-chart-total">{stats.stampsInRange} total</div>
        </div>
        <div className="merchant-chart-bars">
          {stats.chartBuckets.map((bucket) => (
            <div key={bucket.label} className="merchant-chart-bar-col">
              <div
                className="merchant-chart-bar"
                style={{ height: `${(bucket.value / maxVisits) * 100}%` }}
              />
              <span className="merchant-chart-bar-label">{bucket.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="merchant-settings-group">
        <h3 className="merchant-settings-title">Counter poster</h3>
        <div className="panel-card">
          <MerchantPosterCard caption="Print this and place it at your counter. Customers scan the QR to join your loyalty program." />
        </div>
      </div>

      <div className={`panel-card merchant-summary-card${loading ? " merchant-summary-card--loading" : ""}`}>
        <div className="merchant-summary-row">
          <span className="merchant-summary-label">Active loyalty cards</span>
          <span className="merchant-summary-value">{stats.activeCards}</span>
        </div>
        <div className="merchant-summary-divider" />
        <div className="merchant-summary-row">
          <span className="merchant-summary-label">Conversion to reward</span>
          <span className="merchant-summary-value merchant-summary-value--accent">
            {stats.conversionRate}%
          </span>
        </div>
        <div className="merchant-summary-divider" />
        <div className="merchant-summary-row">
          <span className="merchant-summary-label">Rewards redeemed (all time)</span>
          <span className="merchant-summary-value">{stats.rewardsRedeemedAllTime}</span>
        </div>
      </div>
    </div>
  );
}
