"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { applyPurchasedAiCreditPack } from "@/app/merchant/menu-actions";
import {
  AI_CREDIT_COSTS,
  AI_CREDIT_PACKS,
  type AiCreditPackId,
} from "@/lib/ai/credits-config";
import {
  payForAiCreditPack,
  RazorpayCheckoutCancelledError,
} from "@/lib/payments/razorpay-checkout";

interface BuyAiCreditsDrawerProps {
  open: boolean;
  onClose: () => void;
  onPurchased?: () => void;
}

const fmt = (n: number) => n.toLocaleString("en-IN");

/** List price implied by the pack’s marketing discount (sale price unchanged). */
function listPriceInr(priceInr: number, discountPercent: number): number {
  if (discountPercent <= 0 || discountPercent >= 100) return priceInr;
  return Math.round(priceInr / (1 - discountPercent / 100));
}

export function BuyAiCreditsDrawer({
  open,
  onClose,
  onPurchased,
}: BuyAiCreditsDrawerProps) {
  const [selected, setSelected] = useState<AiCreditPackId>("credits-15k");
  const [paying, setPaying] = useState(false);

  const selectedPack =
    AI_CREDIT_PACKS.find((pack) => pack.id === selected) ?? AI_CREDIT_PACKS[1];

  const buy = async () => {
    if (paying) return;
    setPaying(true);
    try {
      const payment = await payForAiCreditPack({ packId: selected });
      const applied = await applyPurchasedAiCreditPack({
        packId: payment.packId,
        paymentId: payment.paymentId,
        orderId: payment.orderId,
      });
      if (!applied.ok) {
        toast.error(
          applied.error ??
            "Payment received, but credits couldn't be applied. Contact support.",
        );
        return;
      }
      toast.success(
        `${fmt(applied.credits ?? 0)} AI Credits added to your balance.`,
      );
      onPurchased?.();
      onClose();
    } catch (error) {
      if (error instanceof RazorpayCheckoutCancelledError) return;
      toast.error(
        error instanceof Error ? error.message : "Payment failed. Try again.",
      );
    } finally {
      setPaying(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        if (!paying) onClose();
      }}
      labelledBy="buy-ai-credits-title"
      className="merchant-theme"
    >
      <div className="buy-ai-credits">
        <header className="buy-ai-credits-head">
          <span className="buy-ai-credits-icon" aria-hidden>
            <Sparkles size={18} strokeWidth={2.3} />
          </span>
          <div>
            <h3 id="buy-ai-credits-title" className="buy-ai-credits-title">
              Buy AI Credits
            </h3>
            <p className="buy-ai-credits-sub">
              Purchased credits have no limit and never expire while Menu is
              active. Monthly plan credits reset each cycle — unused don’t roll
              over. Top-ups are used after your monthly allowance.
            </p>
          </div>
        </header>

        <div
          className="buy-ai-credits-packs"
          role="radiogroup"
          aria-label="Credit packs"
        >
          {AI_CREDIT_PACKS.map((pack) => {
            const active = selected === pack.id;
            const was = listPriceInr(pack.priceInr, pack.discountPercent);
            return (
              <button
                key={pack.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`buy-ai-credits-pack${active ? " is-active" : ""}`}
                onClick={() => setSelected(pack.id)}
                disabled={paying}
              >
                <span className="buy-ai-credits-pack-copy">
                  <span className="buy-ai-credits-pack-top">
                    <span className="buy-ai-credits-pack-credits">
                      {fmt(pack.credits)} Credits
                    </span>
                    <span className="buy-ai-credits-pack-off">
                      {pack.discountPercent}% off
                    </span>
                  </span>
                  <span className="buy-ai-credits-pack-price">
                    <span className="buy-ai-credits-pack-was">₹{fmt(was)}</span>
                    <span className="buy-ai-credits-pack-now">
                      ₹{fmt(pack.priceInr)}
                    </span>
                  </span>
                </span>
                <span className="buy-ai-credits-pack-check" aria-hidden>
                  {active ? <Check size={14} strokeWidth={2.6} /> : null}
                </span>
              </button>
            );
          })}
        </div>

        <p className="buy-ai-credits-value-line">
          10 menu items ·{" "}
          {(AI_CREDIT_COSTS.dish_image * 10).toLocaleString("en-IN")} credits
          image ·{" "}
          {(AI_CREDIT_COSTS.menu_description * 10).toLocaleString("en-IN")}{" "}
          credits Description
        </p>

        <button
          type="button"
          className="cta-btn merchant-cta-accent buy-ai-credits-cta"
          onClick={() => void buy()}
          disabled={paying}
        >
          {paying ? (
            <>
              <Loader2 size={16} strokeWidth={2.4} className="spin" />
              Processing…
            </>
          ) : (
            <>Pay ₹{fmt(selectedPack.priceInr)}</>
          )}
        </button>
      </div>
    </BottomSheet>
  );
}
