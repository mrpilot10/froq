import { Gift, Stamp, TrendingUp, Users, Clock } from "lucide-react";
import type { MerchantStats } from "@/lib/merchant/types";
import { avgLtv, formatCompactCurrency, formatCurrency, totalLtv } from "@/lib/merchant/ltv";

interface DashboardScreenProps {
  stats: MerchantStats;
  businessName: string;
  avgOrderValue: number;
}

export function DashboardScreen({ stats, businessName, avgOrderValue }: DashboardScreenProps) {
  const maxVisits = Math.max(...stats.weeklyVisits, 1);
  const averageLtv = avgLtv(stats, avgOrderValue);
  const lifetimeTotal = totalLtv(stats, avgOrderValue);

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Dashboard</h2>
        <p className="tab-sub">{businessName} · Today&apos;s overview</p>
      </div>

      <div className="merchant-ltv-card">
        <div className="merchant-ltv-head">
          <span className="merchant-ltv-eyebrow">Average customer LTV</span>
          <span className="merchant-ltv-trend">
            <TrendingUp size={14} strokeWidth={2.4} />
            +8.2%
          </span>
        </div>
        <div className="merchant-ltv-value">{formatCurrency(averageLtv)}</div>
        <div className="merchant-ltv-foot">
          <div className="merchant-ltv-foot-item">
            <span className="merchant-ltv-foot-label">Total lifetime value</span>
            <span className="merchant-ltv-foot-value">{formatCompactCurrency(lifetimeTotal)}</span>
          </div>
          <div className="merchant-ltv-foot-divider" />
          <div className="merchant-ltv-foot-item">
            <span className="merchant-ltv-foot-label">Avg. order</span>
            <span className="merchant-ltv-foot-value">{formatCurrency(avgOrderValue)}</span>
          </div>
        </div>
      </div>

      <div className="merchant-stat-grid">
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
          <div className="merchant-stat-value">{stats.stampsToday}</div>
          <div className="merchant-stat-label">Stamps today</div>
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
          <div className="merchant-stat-value">{stats.rewardsRedeemed}</div>
          <div className="merchant-stat-label">Rewards redeemed</div>
        </div>
      </div>

      <div className="panel-card merchant-chart-card">
        <div className="merchant-chart-head">
          <div>
            <div className="merchant-chart-title">Weekly visits</div>
            <div className="merchant-chart-sub">Stamp requests per day</div>
          </div>
          <div className="merchant-chart-trend">
            <TrendingUp size={16} strokeWidth={2.2} />
            +12%
          </div>
        </div>
        <div className="merchant-chart-bars">
          {stats.weeklyVisits.map((value, index) => (
            <div key={index} className="merchant-chart-bar-col">
              <div
                className="merchant-chart-bar"
                style={{ height: `${(value / maxVisits) * 100}%` }}
              />
              <span className="merchant-chart-bar-label">
                {["M", "T", "W", "T", "F", "S", "S"][index]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel-card merchant-summary-card">
        <div className="merchant-summary-row">
          <span className="merchant-summary-label">Active loyalty cards</span>
          <span className="merchant-summary-value">{stats.activeCards}</span>
        </div>
        <div className="merchant-summary-divider" />
        <div className="merchant-summary-row">
          <span className="merchant-summary-label">Conversion to reward</span>
          <span className="merchant-summary-value merchant-summary-value--accent">21%</span>
        </div>
      </div>
    </div>
  );
}
