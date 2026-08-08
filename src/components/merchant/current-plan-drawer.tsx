"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, Check, CreditCard } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { MERCHANT_PLANS } from "@/lib/merchant/constants";
import {
  BILLING_POLICY,
  classifyPlanChange,
  formatBillingDate,
} from "@/lib/merchant/billing";
import {
  basePlanId,
  getPlanById,
  getPlanForBilling,
  type BillingCycle,
  type PricingPlan,
} from "@/lib/merchant/pricing";
import type { MerchantProduct } from "@/lib/merchant/types";
import { FeatureText } from "@/components/landing/feature-text";

interface CurrentPlanDrawerProps {
  open: boolean;
  product: MerchantProduct;
  currentPlanId: string | null;
  pendingPlanId?: string | null;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;
  busy?: boolean;
  onClose: () => void;
  onChangeBilling: (plan: PricingPlan) => void | Promise<void>;
  onCancelPlan: () => void | Promise<void>;
  onResumePlan?: () => void | Promise<void>;
}

export function CurrentPlanDrawer({
  open,
  product,
  currentPlanId,
  pendingPlanId = null,
  cancelAtPeriodEnd = false,
  currentPeriodEnd = null,
  busy = false,
  onClose,
  onChangeBilling,
  onCancelPlan,
  onResumePlan,
}: CurrentPlanDrawerProps) {
  const plan = currentPlanId ? getPlanById(currentPlanId) : null;
  const currentBilling: BillingCycle = currentPlanId?.endsWith("-yearly") ? "yearly" : "monthly";
  const [billing, setBilling] = useState<BillingCycle>(currentBilling);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setBilling(currentBilling);
    setConfirmCancel(false);
    setError("");
  }, [open, currentBilling]);

  if (!plan) return null;

  const catalog = MERCHANT_PLANS[product];
  const targetPlan = getPlanForBilling(basePlanId(plan.id), billing);
  const billingChanged = billing !== currentBilling;
  const billingChangeKind = classifyPlanChange(currentPlanId, targetPlan.id);
  const renewLabel = formatBillingDate(currentPeriodEnd) || catalog.renewsOn;
  const pendingPlan = pendingPlanId ? getPlanById(pendingPlanId) : null;

  const handleClose = () => {
    if (busy) return;
    setConfirmCancel(false);
    setError("");
    onClose();
  };

  const handleChangeBilling = async () => {
    if (!billingChanged || busy) return;
    setError("");
    try {
      await onChangeBilling(targetPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change billing cycle.");
    }
  };

  const handleCancel = async () => {
    if (busy) return;
    setError("");
    try {
      await onCancelPlan();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel the plan.");
    }
  };

  const handleResume = async () => {
    if (busy || !onResumePlan) return;
    setError("");
    try {
      await onResumePlan();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resume the plan.");
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      labelledBy="current-plan-title"
      className="merchant-theme merchant-edit-drawer"
    >
      <div className="merchant-edit-sheet current-plan-sheet">
        <div className="merchant-edit-sheet-head">
          <div className="wizard-form-icon">
            <CreditCard size={22} strokeWidth={2.2} />
          </div>
          <h3 id="current-plan-title" className="merchant-edit-sheet-title">
            {plan.name} plan
          </h3>
          <p className="merchant-edit-sheet-sub">
            Manage billing cycle, review what&apos;s included, or cancel your subscription.
          </p>
        </div>

        <div className="current-plan-summary">
          <div className="current-plan-summary-row">
            <span>Status</span>
            <strong className="current-plan-status">
              {cancelAtPeriodEnd ? "Canceling" : pendingPlan ? "Change scheduled" : "Active"}
            </strong>
          </div>
          <div className="current-plan-summary-row">
            <span>Price</span>
            <strong>
              {plan.priceLabel}
              {plan.cycle}
            </strong>
          </div>
          {renewLabel ? (
            <div className="current-plan-summary-row">
              <span>
                <CalendarClock size={14} strokeWidth={2.2} aria-hidden />
                {cancelAtPeriodEnd || pendingPlan ? "Effective" : "Renews"}
              </span>
              <strong>{renewLabel}</strong>
            </div>
          ) : null}
        </div>

        {pendingPlan ? (
          <div className="current-plan-notice">
            Switching to <strong>{pendingPlan.name}</strong> at renewal on {renewLabel}. Your
            current plan stays active until then.
            {onResumePlan ? (
              <button
                type="button"
                className="current-plan-resume"
                disabled={busy}
                onClick={() => void handleResume()}
              >
                Keep current plan
              </button>
            ) : null}
          </div>
        ) : null}

        {cancelAtPeriodEnd ? (
          <div className="current-plan-notice">
            Cancellation scheduled. No future renewals. Access continues until {renewLabel}, then
            this product locks until you subscribe again.
            {onResumePlan ? (
              <button
                type="button"
                className="current-plan-resume"
                disabled={busy}
                onClick={() => void handleResume()}
              >
                Keep current plan
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="current-plan-section">
          <h4 className="current-plan-section-title">Billing cycle</h4>
          <div
            className="landing-billing-toggle current-plan-billing"
            role="group"
            aria-label="Billing period"
          >
            <button
              type="button"
              className={`landing-billing-option${billing === "monthly" ? " is-active" : ""}`}
              aria-pressed={billing === "monthly"}
              disabled={busy || cancelAtPeriodEnd}
              onClick={() => setBilling("monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`landing-billing-option${billing === "yearly" ? " is-active" : ""}`}
              aria-pressed={billing === "yearly"}
              disabled={busy || cancelAtPeriodEnd}
              onClick={() => setBilling("yearly")}
            >
              Yearly
              <span className="landing-billing-save">2 months free</span>
            </button>
            <span
              className={`landing-billing-thumb${billing === "yearly" ? " is-yearly" : ""}`}
              aria-hidden="true"
            />
          </div>
          {billingChanged ? (
            <>
              <button
                type="button"
                className="cta-btn merchant-cta-accent current-plan-billing-cta"
                disabled={busy}
                onClick={() => void handleChangeBilling()}
              >
                {busy
                  ? "Processing…"
                  : billingChangeKind === "upgrade"
                    ? `Upgrade to yearly · ${targetPlan.priceLabel}/yr`
                    : `Switch to monthly on ${renewLabel}`}
              </button>
              <p className="current-plan-hint">{BILLING_POLICY.planChanges}</p>
            </>
          ) : (
            <p className="current-plan-hint">You&apos;re on {currentBilling} billing.</p>
          )}
        </div>

        <div className="current-plan-section">
          <h4 className="current-plan-section-title">Included</h4>
          <ul className="current-plan-features">
            {plan.features.map((feature) => (
              <li key={feature}>
                <Check size={14} strokeWidth={2.6} aria-hidden />
                <FeatureText text={feature} />
              </li>
            ))}
          </ul>
        </div>

        <div className="current-plan-section current-plan-section--danger">
          <h4 className="current-plan-section-title">Cancel plan</h4>
          <p className="current-plan-hint">{BILLING_POLICY.cancellations}</p>
          {!confirmCancel ? (
            <button
              type="button"
              className="current-plan-cancel"
              disabled={busy || cancelAtPeriodEnd}
              onClick={() => setConfirmCancel(true)}
            >
              {cancelAtPeriodEnd ? "Cancellation scheduled" : "Cancel plan"}
            </button>
          ) : (
            <div className="current-plan-cancel-confirm">
              <div className="current-plan-cancel-warn">
                <AlertTriangle size={16} strokeWidth={2.2} aria-hidden />
                Cancel {plan.name}? This stops future renewals. Access continues until {renewLabel},
                then this product locks until you subscribe again.
              </div>
              <div className="current-plan-cancel-actions">
                <button
                  type="button"
                  className="merchant-edit-cancel"
                  disabled={busy}
                  onClick={() => setConfirmCancel(false)}
                >
                  Keep plan
                </button>
                <button
                  type="button"
                  className="cta-btn current-plan-cancel-confirm-btn"
                  disabled={busy}
                  onClick={() => void handleCancel()}
                >
                  {busy ? "Scheduling…" : "Yes, cancel"}
                </button>
              </div>
            </div>
          )}
        </div>

        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </BottomSheet>
  );
}
