"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { load } from "@cashfreepayments/cashfree-js";
import { toast } from "sonner";
import { PricingTable } from "@/components/landing/pricing-table";
import { CurrentPlanDrawer } from "@/components/merchant/current-plan-drawer";
import {
  cancelProductPlan,
  resumeProductPlan,
  schedulePlanChange,
  updateProductPlan,
} from "@/app/merchant/actions";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import {
  BILLING_POLICY_ITEMS,
  classifyPlanChange,
  formatBillingDate,
  isPaidPlanId,
} from "@/lib/merchant/billing";
import type { PricingPlan } from "@/lib/merchant/pricing";
import type { MerchantProduct } from "@/lib/merchant/types";

const CASHFREE_MODE =
  process.env.NEXT_PUBLIC_CASHFREE_ENV === "production" ? "production" : "sandbox";

interface ManagePlanScreenProps {
  product: MerchantProduct;
  backHref: string;
}

function linkHelpPath(text: string): ReactNode {
  const marker = "/help";
  const index = text.indexOf(marker);
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <Link href="/help" className="merchant-billing-policy-link">
        /help
      </Link>
      {text.slice(index + marker.length)}
    </>
  );
}

export function ManagePlanScreen({ product, backHref }: ManagePlanScreenProps) {
  const router = useRouter();
  const { role, entitlements, onRefresh } = useMerchantWorkspace();
  const [selectingPlanId, setSelectingPlanId] = useState<string | null>(null);
  const [viewPlanOpen, setViewPlanOpen] = useState(false);
  const [error, setError] = useState("");

  const entitlement = entitlements[product];
  const currentPlanId = entitlement?.planId ?? null;
  const initialBilling = currentPlanId?.endsWith("-yearly") ? "yearly" : "monthly";
  const onPaidPlan = isPaidPlanId(currentPlanId);

  const payFirstSubscription = useCallback(
    async (plan: PricingPlan) => {
      setSelectingPlanId(plan.id);
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
          throw new Error("Payment was cancelled or failed. Please try again.");
        }

        const verifyRes = await fetch("/api/checkout/cashfree/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: orderData.orderId }),
        });
        const verifyData = await verifyRes.json().catch(() => null);
        if (!verifyRes.ok || !verifyData?.paid) {
          throw new Error(
            "We couldn't confirm your payment. If you were charged, contact support.",
          );
        }

        const updated = await updateProductPlan(product, plan.id);
        if (!updated.ok) {
          throw new Error(
            updated.error ?? "Payment succeeded but plan update failed. Contact support.",
          );
        }

        await onRefresh();
        toast.success(`Subscribed to ${plan.name}. 7-day money-back applies to first-time plans.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not complete the payment.";
        setError(message);
        throw err;
      } finally {
        setSelectingPlanId(null);
      }
    },
    [product, onRefresh],
  );

  const scheduleChange = useCallback(
    async (plan: PricingPlan, opts?: { closeDrawer?: boolean }) => {
      setSelectingPlanId(plan.id);
      setError("");
      try {
        const kind = classifyPlanChange(currentPlanId, plan.id);
        const res = await schedulePlanChange(product, plan.id);
        if (!res.ok) throw new Error(res.error ?? "Could not schedule the plan change.");
        await onRefresh();
        const verb = kind === "upgrade" ? "Upgrade" : kind === "downgrade" ? "Downgrade" : "Change";
        toast.success(
          `${verb} to ${plan.name} scheduled for ${formatBillingDate(res.effectiveOn)}.`,
        );
        if (opts?.closeDrawer) setViewPlanOpen(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not schedule the plan change.";
        setError(message);
        throw err;
      } finally {
        setSelectingPlanId(null);
      }
    },
    [currentPlanId, product, onRefresh],
  );

  const handleSelectPlan = useCallback(
    async (plan: PricingPlan) => {
      if (role !== "owner") {
        toast.error("Only the owner can manage plans.");
        return;
      }
      if (plan.id === currentPlanId) return;

      try {
        if (!onPaidPlan) {
          await payFirstSubscription(plan);
          return;
        }
        await scheduleChange(plan);
      } catch {
        // Error surfaced via state.
      }
    },
    [role, currentPlanId, onPaidPlan, payFirstSubscription, scheduleChange],
  );

  const handleChangeBilling = useCallback(
    async (plan: PricingPlan) => {
      await scheduleChange(plan, { closeDrawer: true });
    },
    [scheduleChange],
  );

  const handleCancelPlan = useCallback(async () => {
    if (role !== "owner") {
      toast.error("Only the owner can manage plans.");
      return;
    }
    setSelectingPlanId("__cancel__");
    setError("");
    try {
      const res = await cancelProductPlan(product);
      if (!res.ok) throw new Error(res.error ?? "Could not cancel the plan.");
      await onRefresh();
      toast.success(
        `Canceled. No future renewals. Access until ${formatBillingDate(res.effectiveOn)}, then Free.`,
      );
      setViewPlanOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not cancel the plan.";
      setError(message);
      throw err;
    } finally {
      setSelectingPlanId(null);
    }
  }, [role, product, onRefresh]);

  const handleResumePlan = useCallback(async () => {
    setSelectingPlanId("__resume__");
    try {
      const res = await resumeProductPlan(product);
      if (!res.ok) throw new Error(res.error ?? "Could not resume the plan.");
      await onRefresh();
      toast.success("Scheduled change cleared. Your current plan continues.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resume the plan.");
      throw err;
    } finally {
      setSelectingPlanId(null);
    }
  }, [product, onRefresh]);

  if (role !== "owner") {
    return (
      <div className="tab-screen merchant-plan-page">
        <button type="button" className="merchant-plan-back" onClick={() => router.push(backHref)}>
          <ArrowLeft size={16} strokeWidth={2.4} />
          Back to settings
        </button>
        <div className="panel-card merchant-empty">
          <p className="merchant-empty-title">Owner only</p>
          <p className="tab-sub">Ask the store owner to manage the plan.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-screen merchant-plan-page">
      <button type="button" className="merchant-plan-back" onClick={() => router.push(backHref)}>
        <ArrowLeft size={16} strokeWidth={2.4} />
        Back to settings
      </button>

      <PricingTable
        product={product}
        variant="manage"
        currentPlanId={currentPlanId}
        initialBilling={initialBilling}
        selectingPlanId={
          selectingPlanId &&
          selectingPlanId !== "__cancel__" &&
          selectingPlanId !== "__resume__"
            ? selectingPlanId
            : null
        }
        onSelectPlan={handleSelectPlan}
        onViewPlan={() => setViewPlanOpen(true)}
        planActionLabel={() => "Get started"}
        title={
          product === "queue"
            ? "Manage Queue plan"
            : product === "reservation"
              ? "Manage Reservations plan"
              : undefined
        }
        subtitle="Plan changes apply at your next renewal. Cancel anytime to stop future renewals."
      />

      <ul className="merchant-billing-policy">
        {BILLING_POLICY_ITEMS.map((item) => (
          <li key={item}>{linkHelpPath(item)}</li>
        ))}
      </ul>

      {error && !viewPlanOpen ? (
        <p className="auth-error merchant-plan-error" role="alert">
          {error}
        </p>
      ) : null}

      <CurrentPlanDrawer
        open={viewPlanOpen && Boolean(currentPlanId)}
        product={product}
        currentPlanId={currentPlanId}
        pendingPlanId={entitlement?.pendingPlanId ?? null}
        cancelAtPeriodEnd={Boolean(entitlement?.cancelAtPeriodEnd)}
        currentPeriodEnd={entitlement?.currentPeriodEnd ?? null}
        busy={Boolean(selectingPlanId)}
        onClose={() => {
          if (!selectingPlanId) {
            setError("");
            setViewPlanOpen(false);
          }
        }}
        onChangeBilling={handleChangeBilling}
        onCancelPlan={handleCancelPlan}
        onResumePlan={handleResumePlan}
      />
    </div>
  );
}
