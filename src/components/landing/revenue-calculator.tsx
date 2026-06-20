"use client";

import { useMemo, useState } from "react";
import { TrendingUp, Users } from "lucide-react";

const AVG_ORDER_VALUE = 500; // ₹ — illustrative average spend per visit
const REPEAT_UPLIFT = 0.1; // 10% of customers visiting one extra time

function formatINR(value: number) {
  return `\u20B9${Math.round(value).toLocaleString("en-IN")}`;
}

export function RevenueCalculator() {
  const [customers, setCustomers] = useState(500);

  const { extraVisits, extraRevenue } = useMemo(() => {
    const visits = Math.round(customers * REPEAT_UPLIFT);
    return { extraVisits: visits, extraRevenue: visits * AVG_ORDER_VALUE };
  }, [customers]);

  const pct = ((customers - 100) / (3000 - 100)) * 100;

  return (
    <div className="lp-calc">
      <div className="lp-calc-q">
        <Users size={16} strokeWidth={2.3} />
        How many customers visit your business each month?
      </div>

      <div className="lp-calc-value">{customers.toLocaleString("en-IN")} customers</div>

      <input
        type="range"
        min={100}
        max={3000}
        step={50}
        value={customers}
        onChange={(e) => setCustomers(Number(e.target.value))}
        className="lp-calc-slider"
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
        aria-label="Monthly customers"
      />
      <div className="lp-calc-scale">
        <span>100</span>
        <span>3,000</span>
      </div>

      <div className="lp-calc-result">
        <div className="lp-calc-result-row">
          <span className="lp-calc-result-label">
            If just 10% visited one extra time this month
          </span>
          <span className="lp-calc-result-chip">
            <TrendingUp size={12} strokeWidth={2.6} />+{extraVisits} visits
          </span>
        </div>
        <div className="lp-calc-revenue">
          <span className="lp-calc-revenue-label">Potential additional revenue</span>
          <span className="lp-calc-revenue-value">{formatINR(extraRevenue)}</span>
        </div>
      </div>

      <p className="lp-calc-foot">
        Small increases in repeat visits can have a huge impact on revenue.
      </p>
    </div>
  );
}
