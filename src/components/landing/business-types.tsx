"use client";

import { useState } from "react";
import { Gift } from "lucide-react";

interface BizType {
  id: string;
  emoji: string;
  label: string;
  reward: string;
  unit: string;
}

const TYPES: BizType[] = [
  { id: "cafes", emoji: "☕", label: "Cafes", reward: "Free coffee", unit: "Buy 6, get 1 free" },
  { id: "restaurants", emoji: "🍔", label: "Restaurants", reward: "Free meal", unit: "10 visits → free entrée" },
  { id: "salons", emoji: "💇", label: "Salons", reward: "Free styling", unit: "5 cuts → 1 free" },
  { id: "gyms", emoji: "🏋️", label: "Gyms", reward: "Free week", unit: "Refer + earn passes" },
  { id: "bakeries", emoji: "🍰", label: "Bakeries", reward: "Free pastry", unit: "Buy 8, get 1 free" },
  { id: "bubbletea", emoji: "🧋", label: "Bubble Tea", reward: "Free drink", unit: "Buy 7, get 1 free" },
  { id: "carwash", emoji: "🚗", label: "Car Washes", reward: "Free wash", unit: "5 washes → 1 free" },
  { id: "retail", emoji: "🛍️", label: "Retail", reward: "₹500 off", unit: "Spend ₹5,000 → reward" },
];

export function BusinessTypes() {
  const [active, setActive] = useState<string>("cafes");
  const current = TYPES.find((t) => t.id === active) ?? TYPES[0];

  return (
    <div className="lp-biz">
      <div className="lp-biz-grid">
        {TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            className={`lp-biz-card${active === type.id ? " lp-biz-card--active" : ""}`}
            onClick={() => setActive(type.id)}
            aria-pressed={active === type.id}
          >
            <span className="lp-biz-emoji">{type.emoji}</span>
            <span className="lp-biz-label">{type.label}</span>
          </button>
        ))}
      </div>

      <div className="lp-biz-preview" key={current.id}>
        <span className="lp-biz-preview-emoji">{current.emoji}</span>
        <div className="lp-biz-preview-copy">
          <span className="lp-biz-preview-kicker">{current.label} loyalty program</span>
          <span className="lp-biz-preview-reward">
            <Gift size={15} strokeWidth={2.4} />
            {current.reward}
          </span>
          <span className="lp-biz-preview-unit">{current.unit}</span>
        </div>
      </div>
    </div>
  );
}
