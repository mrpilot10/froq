"use client";

import { DoorOpen, Gift, QrCode, RefreshCw, ShoppingBag, Sparkles } from "lucide-react";
import { useInView } from "./use-in-view";

const STEPS = [
  { Icon: DoorOpen, label: "Walks in", meta: "First visit" },
  { Icon: ShoppingBag, label: "Makes purchase", meta: "Buys a coffee" },
  { Icon: QrCode, label: "Scans QR", meta: "Joins instantly" },
  { Icon: RefreshCw, label: "Returns", meta: "Comes back" },
  { Icon: Gift, label: "Earns reward", meta: "Free coffee" },
  { Icon: Sparkles, label: "Becomes regular", meta: "Loyal customer" },
];

export function CustomerJourney() {
  const { ref, inView } = useInView();

  return (
    <div ref={ref} className={`lp-journey${inView ? " is-in" : ""}`}>
      <div className="lp-journey-track" aria-hidden="true" />
      <ol className="lp-journey-steps">
        {STEPS.map(({ Icon, label, meta }, i) => (
          <li
            key={label}
            className={`lp-journey-step${i === STEPS.length - 1 ? " lp-journey-step--final" : ""}`}
            style={{ "--i": i } as React.CSSProperties}
          >
            <span className="lp-journey-node">
              <Icon size={20} strokeWidth={2.2} />
            </span>
            <span className="lp-journey-label">{label}</span>
            <span className="lp-journey-meta">{meta}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
