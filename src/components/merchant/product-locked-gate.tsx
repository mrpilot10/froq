"use client";

import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";
import { PRODUCTS } from "@/lib/merchant/nav";
import { plansForProduct } from "@/lib/merchant/pricing";
import type { MerchantProduct, MerchantTab } from "@/lib/merchant/types";
import { MerchantTabSkeleton } from "./skeletons";

interface Pitch {
  headline: string;
  body: string;
  points: string[];
}

const PITCH: Record<MerchantProduct, Pitch> = {
  loyalty: {
    headline: "Turn first-time visitors into regulars",
    body: "A digital stamp card your customers keep on their phone. No app to install, no plastic cards to reprint — just a QR code at the counter.",
    points: [
      "Stamps in seconds with staff approval",
      "Reward reminders on WhatsApp",
      "Visit history and customer insights",
    ],
  },
  queue: {
    headline: "Never lose a walk-in to a long wait",
    body: "Guests scan, join the queue and wait wherever they like. Froq calls them on WhatsApp the moment their table is ready.",
    points: [
      "QR join — nothing for guests to install",
      "Call plus three automatic reminders",
      "Live wait times and queue analytics",
    ],
  },
  reservation: {
    headline: "Take bookings without the phone calls",
    body: "Guests request a table from a QR code or link. You confirm, decline or suggest another time — Froq keeps them updated on WhatsApp.",
    points: [
      "Requests land on one live board",
      "Confirmations and reminders on WhatsApp",
      "No-show and party-size insights",
    ],
  },
  menu: {
    headline: "A menu your guests can talk to",
    body: "Guests scan the QR, ask what's good and order — the AI menu answers in their language and keeps the kitchen in the loop.",
    points: [
      "AI generation for every dish",
      "Guest chats that answer menu questions",
      "Analytics on what people ask and add",
    ],
  },
};

const PLAN_HREF: Record<MerchantProduct, string> = {
  loyalty: "/merchant/loyalty/plan",
  queue: "/merchant/queue/plan",
  reservation: "/merchant/reservations/plan",
  menu: "/merchant/menu/plan",
};

interface ProductLockedGateProps {
  product: MerchantProduct;
  /** Tab whose skeleton is blurred behind the card, so the page keeps its shape. */
  tab: MerchantTab;
  canPurchase: boolean;
  /**
   * Their previous free-trial access ended without a plan — keep a gentler
   * re-subscribe pitch for merchants who used the legacy trial.
   */
  trialExpired: boolean;
}

/** Shown in place of a product's screens until the merchant subscribes to it. */
export function ProductLockedGate({
  product,
  tab,
  canPurchase,
  trialExpired,
}: ProductLockedGateProps) {
  const meta = PRODUCTS.find((item) => item.id === product) ?? PRODUCTS[0];
  const pitch = PITCH[product];
  const entryPlan = plansForProduct(product, "monthly")[0];
  const ProductIcon = meta.Icon;

  return (
    <div className="product-lock">
      <div className="product-lock-bg" aria-hidden>
        <MerchantTabSkeleton tab={tab} />
      </div>

      <div className="product-lock-panel">
        <section className="product-lock-card" aria-labelledby="product-lock-title">
          <div className="product-lock-badge">
            <ProductIcon size={24} strokeWidth={2.2} />
          </div>
          <span className="product-lock-eyebrow">
            <Lock size={12} strokeWidth={2.6} aria-hidden />
            {meta.name}
          </span>
          <h2 id="product-lock-title" className="product-lock-title">
            {trialExpired ? `Subscribe to reopen ${meta.name}` : pitch.headline}
          </h2>
          <p className="product-lock-sub">
            {trialExpired
              ? "Your queue, guests and history are all still here. Pick a plan to start seating again."
              : pitch.body}
          </p>

          <ul className="product-lock-points">
            {pitch.points.map((point) => (
              <li key={point}>
                <Check size={14} strokeWidth={2.6} aria-hidden />
                {point}
              </li>
            ))}
          </ul>

          {!canPurchase ? (
            <p className="product-lock-note">
              Ask the account owner to add {meta.name} to your workspace.
            </p>
          ) : (
            <>
              <Link href={PLAN_HREF[product]} className="cta-btn merchant-cta-accent product-lock-cta">
                Get started
                <ArrowRight size={16} strokeWidth={2.4} aria-hidden />
              </Link>
              <p className="product-lock-note">
                From {entryPlan.priceLabel}/month · 7-day money-back · cancel anytime
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
