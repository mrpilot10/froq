"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import {
  GrowthChartMockup,
  LoyaltyPhoneMockup,
  MerchantDashboardMockup,
} from "./product-mockups";

type TabId = "customer" | "merchant" | "growth";

const TABS: { id: TabId; label: string; title: string; points: string[] }[] = [
  {
    id: "customer",
    label: "Customer",
    title: "Customer Experience",
    points: ["Scan QR", "Join instantly", "Start earning rewards", "Track progress", "Redeem rewards"],
  },
  {
    id: "merchant",
    label: "Merchant",
    title: "Merchant Experience",
    points: [
      "Generate QR code",
      "View customer activity",
      "Manage rewards",
      "Track engagement",
      "Grow repeat visits",
    ],
  },
  {
    id: "growth",
    label: "Business Growth",
    title: "Business Growth",
    points: [
      "Increase customer retention",
      "Build loyalty",
      "Encourage repeat purchases",
      "Grow revenue",
      "Reduce dependence on ads",
    ],
  },
];

export function ExperienceTabs() {
  const [active, setActive] = useState<TabId>("customer");
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <div className="lp-tabs">
      <div className="lp-tabs-bar" role="tablist" aria-label="Froq experience">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            className={`lp-tabs-btn${active === t.id ? " lp-tabs-btn--active" : ""}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="lp-tabs-panel">
        <div className="lp-tabs-copy" key={tab.id}>
          <h3 className="lp-tabs-title">{tab.title}</h3>
          <ul className="lp-tabs-list">
            {tab.points.map((point) => (
              <li key={point}>
                <span className="lp-tabs-check">
                  <Check size={13} strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="lp-tabs-visual" key={`${tab.id}-visual`}>
          {active === "customer" && <LoyaltyPhoneMockup />}
          {active === "merchant" && <MerchantDashboardMockup />}
          {active === "growth" && <GrowthChartMockup />}
        </div>
      </div>
    </div>
  );
}
