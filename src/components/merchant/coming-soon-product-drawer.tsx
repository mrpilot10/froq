"use client";

import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import type { ComingSoonProduct } from "@/lib/merchant/nav";

interface ComingSoonProductDrawerProps {
  product: ComingSoonProduct | null;
  onClose: () => void;
}

export function ComingSoonProductDrawer({ product, onClose }: ComingSoonProductDrawerProps) {
  const Icon = product?.Icon;

  return (
    <BottomSheet
      open={product !== null}
      onClose={onClose}
      labelledBy="coming-soon-product-title"
      className="merchant-theme"
    >
      {product && Icon ? (
        <div className="merchant-coming-soon">
          <div className="merchant-coming-soon-icon" aria-hidden>
            <Icon size={28} strokeWidth={2.1} />
          </div>
          <span className="merchant-coming-soon-badge">Coming soon</span>
          <h3 id="coming-soon-product-title" className="merchant-coming-soon-name">
            {product.name}
          </h3>
          <p className="merchant-coming-soon-headline">{product.headline}</p>
          <p className="merchant-coming-soon-sub">
            We&apos;re building this for your store. You&apos;ll be the first to know when it
            launches.
          </p>
          <button type="button" className="cta-btn merchant-cta-accent" onClick={onClose}>
            Got it
          </button>
        </div>
      ) : null}
    </BottomSheet>
  );
}
