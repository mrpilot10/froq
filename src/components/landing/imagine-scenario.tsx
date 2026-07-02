"use client";

import { CloudOff, Gift } from "lucide-react";
import { useInView } from "./use-in-view";

export function ImagineScenario() {
  const { ref, inView } = useInView({ threshold: 0.25 });

  return (
    <div ref={ref} className={`lp-imagine${inView ? " is-in" : ""}`}>
      <div className="lp-imagine-scene">
        <p className="lp-imagine-line">A customer visits your cafe.</p>
        <p className="lp-imagine-line">They enjoy their coffee. They leave.</p>
        <p className="lp-imagine-line lp-imagine-line--turn">Two weeks later they&apos;re deciding where to go.</p>
      </div>

      <div className="lp-imagine-fork" aria-label="Two businesses, two outcomes">
        <article className="lp-imagine-option lp-imagine-option--lost">
          <span className="lp-imagine-option-icon" aria-hidden="true">
            <CloudOff size={20} strokeWidth={2.1} />
          </span>
          <span className="lp-imagine-option-label">One business</span>
          <span className="lp-imagine-option-state">is forgotten</span>
        </article>

        <span className="lp-imagine-vs" aria-hidden="true">
          vs
        </span>

        <article className="lp-imagine-option lp-imagine-option--win">
          <span className="lp-imagine-option-icon" aria-hidden="true">
            <Gift size={20} strokeWidth={2.1} />
          </span>
          <span className="lp-imagine-option-label">The other</span>
          <span className="lp-imagine-option-state">offers a reward</span>
        </article>
      </div>

      <p className="lp-imagine-question">Which one do they choose?</p>

      <p className="lp-imagine-payoff">That&apos;s the power of repeat customer marketing.</p>
    </div>
  );
}
