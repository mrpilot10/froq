"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Clock, Gift, QrCode, ScanLine, Stamp, Users } from "lucide-react";
import { getDashboardStats } from "@/app/merchant/actions";
import type {
  DashboardDateRange,
  DashboardFilteredStats,
  MerchantProfile,
} from "@/lib/merchant/types";
import { computeLtv, formatCompactCurrency, formatCurrency } from "@/lib/merchant/ltv";
import { MerchantPosterCard } from "./poster-card";

interface DashboardScreenProps {
  profile: MerchantProfile;
  avgOrderValue: number;
  initialStats: DashboardFilteredStats;
  activeBranchId?: string | null;
  onShowQr?: () => void;
  onRedeemCode?: () => void;
  onEditRewards?: () => void;
}

const DATE_RANGES: { value: DashboardDateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

export function DashboardScreen({
  profile,
  avgOrderValue,
  initialStats,
  activeBranchId = null,
  onShowQr,
  onRedeemCode,
  onEditRewards,
}: DashboardScreenProps) {
  const [range, setRange] = useState<DashboardDateRange>(initialStats.range);
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);
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

  const stampCards = [
    { Icon: Users, value: stats.totalCustomers, label: "Total customers" },
    { Icon: Stamp, value: stats.stampsInRange, label: stampsLabel },
    { Icon: Clock, value: stats.pendingApprovals, label: "Pending approval" },
    {
      Icon: Gift,
      value: stats.range === "all" ? stats.rewardsRedeemedAllTime : stats.rewardsInRange,
      label: rewardsLabel,
      accent: true,
    },
  ];

  return (
    <div className="tab-screen merchant-dashboard">
      <div className="tab-head merchant-dashboard-head">
        <div>
          <h2 className="tab-title">Dashboard</h2>
          <p className="tab-sub">{businessName}</p>
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
        <div className="merchant-ltv-metrics">
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Total lifetime value</span>
            <span className="merchant-ltv-tile-value">{formatCompactCurrency(lifetimeTotal)}</span>
          </div>
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Avg. order</span>
            <span className="merchant-ltv-tile-value">{formatCurrency(avgOrderValue)}</span>
          </div>
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Total customers</span>
            <span className="merchant-ltv-tile-value">{stats.totalCustomers}</span>
          </div>
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Avg. visits</span>
            <span className="merchant-ltv-tile-value">{stats.avgLifetimeVisits.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <h3 className="merchant-section-label">Quick actions</h3>
        </div>
        <div className="merchant-quick-actions">
          <button type="button" className="queue-action" onClick={() => onShowQr?.()}>
            <span className="queue-action-icon queue-action-icon--accent">
              <QrCode size={18} strokeWidth={2.2} />
            </span>
            Show QR
          </button>
          <button type="button" className="queue-action" onClick={() => onRedeemCode?.()}>
            <span className="queue-action-icon">
              <ScanLine size={18} strokeWidth={2.2} />
            </span>
            Redeem code
          </button>
          <button type="button" className="queue-action" onClick={() => onEditRewards?.()}>
            <span className="queue-action-icon">
              <Gift size={18} strokeWidth={2.2} />
            </span>
            Rewards &amp; stamps
          </button>
        </div>
      </section>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <h3 className="merchant-section-label">Overview</h3>
          <span className="merchant-section-meta">{stats.rangeLabel}</span>
        </div>
        <div className={`merchant-stat-grid${loading ? " merchant-stat-grid--loading" : ""}`}>
          {stampCards.map(({ Icon, value, label, accent }) => (
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

      <section className="merchant-section">
        <div className="merchant-section-head">
          <h3 className="merchant-section-label">Activity</h3>
          <span className="merchant-section-meta">{stats.stampsInRange} total</span>
        </div>
        <div className={`panel-card merchant-chart-card${loading ? " merchant-chart-card--loading" : ""}`}>
          <div className="merchant-chart-head">
            <div>
              <div className="merchant-chart-title">{stats.chartTitle}</div>
              <div className="merchant-chart-sub">{stats.chartSub}</div>
            </div>
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
      </section>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <h3 className="merchant-section-label">Performance</h3>
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
      </section>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <h3 className="merchant-section-label">Grow your loyalty</h3>
        </div>
        <div className="panel-card">
          <MerchantPosterCard caption="Print this and place it at your counter. Customers scan the QR to join your loyalty program." />
        </div>
      </section>
    </div>
  );
}
