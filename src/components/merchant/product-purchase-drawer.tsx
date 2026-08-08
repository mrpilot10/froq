"use client";

import { useState } from "react";
import { Check, CreditCard, Lock } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import {
  ALL_PLANS,
  getDefaultPlanForProduct,
  type PricingPlan,
} from "@/lib/merchant/pricing";
import { purchaseProduct } from "@/app/merchant/actions";
import type { MerchantProduct } from "@/lib/merchant/types";
import { PRODUCTS } from "@/lib/merchant/nav";
import { FeatureText } from "@/components/landing/feature-text";
import {
  payWithRazorpay,
  RazorpayCheckoutCancelledError,
} from "@/lib/payments/razorpay-checkout";

/** Prefer an explicit pack (e.g. next upgrade tier); fall back to the product default. */
function resolvePurchasePlan(
  product: MerchantProduct,
  planId: string | null | undefined,
): PricingPlan {
  if (planId) {
    const match = ALL_PLANS.find((p) => p.id === planId && p.product === product);
    if (match) return match;
  }
  return getDefaultPlanForProduct(product);
}

interface ProductPurchaseDrawerProps {
  product: MerchantProduct | null;
  /** Specific pack to buy. When omitted, the product's default (Growth) is used. */
  planId?: string | null;
  onClose: () => void;
  onPurchased: (product: MerchantProduct) => void | Promise<void>;
}

export function ProductPurchaseDrawer({
  product,
  planId = null,
  onClose,
  onPurchased,
}: ProductPurchaseDrawerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!product) return null;

  const plan = resolvePurchasePlan(product, planId);
  const meta = PRODUCTS.find((p) => p.id === product) ?? PRODUCTS[0];
  const cycleLabel = plan.billing === "yearly" ? "/yr" : "/mo";

  async function pay() {
    if (!product) return;
    setBusy(true);
    setError("");
    try {
      const payment = await payWithRazorpay({ planId: plan.id });

      const added = await purchaseProduct(product, plan.id, {
        razorpaySubscriptionId:
          payment.mode === "subscription" ? payment.subscriptionId : null,
      });
      if (!added.ok) {
        setError(added.error ?? "Payment succeeded but activation failed. Contact support.");
        return;
      }

      await onPurchased(product);
    } catch (err) {
      if (err instanceof RazorpayCheckoutCancelledError) {
        setError("Payment was cancelled. You can try again when ready.");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not complete the payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      open={product !== null}
      onClose={busy ? () => {} : onClose}
      labelledBy="product-purchase-title"
      className="merchant-theme merchant-edit-drawer"
    >
      <div className="merchant-edit-sheet">
        <div className="merchant-edit-sheet-head">
          <div className="wizard-form-icon">
            <CreditCard size={22} strokeWidth={2.2} />
          </div>
          <h3 id="product-purchase-title" className="merchant-edit-sheet-title">
            Get {meta.name} · {plan.name}
          </h3>
          <p className="merchant-edit-sheet-sub">
            Add the {plan.name} pack to your Froq account. Billed separately at{" "}
            {plan.priceLabel}
            {cycleLabel}.
          </p>
        </div>

        <ul className="checkout-summary-features">
          {plan.features.map((feature) => (
            <li key={feature}>
              <Check size={14} strokeWidth={2.5} aria-hidden />
              <FeatureText text={feature} />
            </li>
          ))}
        </ul>

        <div className="checkout-pay-box">
          <div className="checkout-pay-row">
            <span>
              Froq {meta.name} · {plan.name}
            </span>
            <strong>
              {plan.priceLabel}
              {cycleLabel}
            </strong>
          </div>
          <div className="checkout-pay-row checkout-pay-row--muted">
            <span>{plan.billing === "yearly" ? "Billed yearly" : "Billed monthly"}</span>
            <span>INR</span>
          </div>
        </div>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="cta-btn merchant-cta-accent auth-submit"
          onClick={() => void pay()}
          disabled={busy}
        >
          {busy ? "Processing…" : `Pay ${plan.priceLabel}${cycleLabel}`}
        </button>
        <p className="merchant-auth-note">
          <Lock size={13} strokeWidth={2.2} />
          Secure checkout · 7-day money-back on first subscription
        </p>
      </div>
    </BottomSheet>
  );
}
