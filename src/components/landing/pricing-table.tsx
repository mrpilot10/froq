import Link from "next/link";
import { Check } from "lucide-react";
import { PRICING_PLANS } from "@/lib/merchant/pricing";

export function PricingTable() {
  return (
    <section className="landing-pricing" id="pricing">
      <div className="landing-section-head">
        <span className="landing-hero-badge">Pricing</span>
        <h2 className="landing-section-title">Simple plans for every shop</h2>
        <p className="landing-section-sub">
          Create your account at checkout. After payment, we&apos;ll walk you through store setup.
        </p>
      </div>

      <div className="landing-pricing-grid">
        {PRICING_PLANS.map((plan) => (
          <article
            key={plan.id}
            className={`panel-card landing-plan-card${plan.highlighted ? " landing-plan-card--featured" : ""}`}
          >
            {plan.highlighted && <span className="landing-plan-popular">Most popular</span>}
            <h3 className="landing-plan-name">{plan.name}</h3>
            <p className="landing-plan-desc">{plan.description}</p>
            <div className="landing-plan-price">
              {plan.priceLabel}
              <span>{plan.cycle}</span>
            </div>
            <ul className="landing-plan-features">
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Check size={15} strokeWidth={2.5} aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href={`/checkout?plan=${plan.id}`}
              className={`cta-btn landing-plan-cta${plan.highlighted ? " merchant-cta-accent" : " landing-plan-cta--ghost"}`}
            >
              Get started
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
