"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
import {
  payWithRazorpay,
  RazorpayCheckoutCancelledError,
} from "@/lib/payments/razorpay-checkout";

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

  const payAndApplyPlan = useCallback(
    async (plan: PricingPlan, opts?: { successMessage?: string }) => {
      setSelectingPlanId(plan.id);
      setError("");
      try {
        const payment = await payWithRazorpay({ planId: plan.id });

        const updated = await updateProductPlan(product, plan.id, {
          razorpaySubscriptionId:
            payment.mode === "subscription" ? payment.subscriptionId : null,
        });
        if (!updated.ok) {
          throw new Error(
            updated.error ?? "Payment succeeded but plan update failed. Contact support.",
          );
        }

        await onRefresh();
        toast.success(
          opts?.successMessage ??
            `Upgraded to ${plan.name}. Your new limits are active now.`,
        );
      } catch (err) {
        if (err instanceof RazorpayCheckoutCancelledError) {
          setError("Payment was cancelled. You can try again when ready.");
          return;
        }
        const message = err instanceof Error ? err.message : "Could not complete the payment.";
        setError(message);
        throw err;
      } finally {
        setSelectingPlanId(null);
      }
    },
    [product, onRefresh],
  );

  const payFirstSubscription = useCallback(
    async (plan: PricingPlan) => {
      await payAndApplyPlan(plan, {
        successMessage: `Subscribed to ${plan.name}. 7-day money-back applies to first-time plans.`,
      });
    },
    [payAndApplyPlan],
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
        const verb = kind === "downgrade" ? "Downgrade" : "Change";
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

        const kind = classifyPlanChange(currentPlanId, plan.id);
        if (kind === "upgrade") {
          await payAndApplyPlan(plan);
          return;
        }
        // Downgrades (and lower billing cycles) apply at renewal.
        await scheduleChange(plan);
      } catch {
        // Error surfaced via state.
      }
    },
    [
      role,
      currentPlanId,
      onPaidPlan,
      payFirstSubscription,
      payAndApplyPlan,
      scheduleChange,
    ],
  );

  const handleChangeBilling = useCallback(
    async (plan: PricingPlan) => {
      const kind = classifyPlanChange(currentPlanId, plan.id);
      if (kind === "upgrade") {
        await payAndApplyPlan(plan, {
          successMessage: `Switched to ${plan.name}. Billed ${plan.billing === "yearly" ? "yearly" : "monthly"} from today.`,
        });
        setViewPlanOpen(false);
        return;
      }
      await scheduleChange(plan, { closeDrawer: true });
    },
    [currentPlanId, payAndApplyPlan, scheduleChange],
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
        `Canceled. No future renewals. Access until ${formatBillingDate(res.effectiveOn)}, then locks.`,
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
        planActionLabel={(plan) => {
          if (!onPaidPlan) return "Get started";
          const kind = classifyPlanChange(currentPlanId, plan.id);
          if (kind === "upgrade") return "Upgrade now";
          if (kind === "downgrade") return "Schedule downgrade";
          return "Switch plan";
        }}
        title={
          product === "queue"
            ? "Manage Queue plan"
            : product === "reservation"
              ? "Manage Reservations plan"
              : product === "menu"
                ? "Manage AI Menu plan"
                : undefined
        }
        subtitle="Upgrades apply immediately after payment. Downgrades take effect at your next renewal."
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
