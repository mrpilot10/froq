"use client";

import { useState } from "react";
import { Check, CreditCard, Lock } from "lucide-react";
import { load } from "@cashfreepayments/cashfree-js";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { getDefaultPlanForProduct } from "@/lib/merchant/pricing";
import { purchaseProduct } from "@/app/merchant/actions";
import type { MerchantProduct } from "@/lib/merchant/types";
import { PRODUCTS } from "@/lib/merchant/nav";

const CASHFREE_MODE =
  process.env.NEXT_PUBLIC_CASHFREE_ENV === "production" ? "production" : "sandbox";

interface ProductPurchaseDrawerProps {
  product: MerchantProduct | null;
  onClose: () => void;
  onPurchased: (product: MerchantProduct) => void | Promise<void>;
}

export function ProductPurchaseDrawer({
  product,
  onClose,
  onPurchased,
}: ProductPurchaseDrawerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!product) return null;

  const plan = getDefaultPlanForProduct(product);
  const meta = PRODUCTS.find((p) => p.id === product) ?? PRODUCTS[0];

  async function pay() {
    if (!product) return;
    setBusy(true);
    setError("");
    try {
      const orderRes = await fetch("/api/checkout/cashfree/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const orderData = await orderRes.json().catch(() => null);
      if (!orderRes.ok || !orderData?.paymentSessionId) {
        throw new Error(orderData?.error ?? "Could not start the payment.");
      }

      const cashfree = await load({ mode: CASHFREE_MODE });
      const result = await cashfree.checkout({
        paymentSessionId: orderData.paymentSessionId,
        redirectTarget: "_modal",
      });
      if (result?.error) {
        setError("Payment was cancelled or failed. Please try again.");
        return;
      }

      const verifyRes = await fetch("/api/checkout/cashfree/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderData.orderId }),
      });
      const verifyData = await verifyRes.json().catch(() => null);
      if (!verifyRes.ok || !verifyData?.paid) {
        setError("We couldn't confirm your payment. If you were charged, contact support.");
        return;
      }

      const added = await purchaseProduct(product, plan.id);
      if (!added.ok) {
        setError(added.error ?? "Payment succeeded but activation failed. Contact support.");
        return;
      }

      await onPurchased(product);
    } catch (err) {
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
            Get {meta.name}
          </h3>
          <p className="merchant-edit-sheet-sub">
            Add {meta.name} to your Froq account. Billed separately at {plan.priceLabel}
            {plan.cycle}.
          </p>
        </div>

        <ul className="checkout-summary-features">
          {plan.features.map((feature) => (
            <li key={feature}>
              <Check size={14} strokeWidth={2.5} aria-hidden />
              {feature}
            </li>
          ))}
        </ul>

        <div className="checkout-pay-box">
          <div className="checkout-pay-row">
            <span>Froq {meta.name}</span>
            <strong>{plan.priceLabel}</strong>
          </div>
          <div className="checkout-pay-row checkout-pay-row--muted">
            <span>Billed monthly</span>
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
          {busy ? "Processing…" : `Pay ${plan.priceLabel}`}
        </button>
        <p className="merchant-auth-note">
          <Lock size={13} strokeWidth={2.2} />
          Secure checkout · Cancel anytime
        </p>
      </div>
    </BottomSheet>
  );
}
