import "server-only";

import { findCatalogPlan, FREE_PLAN } from "@/lib/merchant/pricing";
import type { MerchantProduct } from "@/lib/merchant/types";
import {
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  fetchRazorpaySubscription,
} from "@/lib/payments/razorpay";

export type PlanPaymentProof = {
  paymentId: string;
  orderId?: string | null;
  subscriptionId?: string | null;
};

export type VerifiedPlanPayment =
  | {
      ok: true;
      planId: string;
      product: MerchantProduct;
      subscriptionId: string | null;
    }
  | { ok: false; error: string };

const PAID_PAYMENT = new Set(["captured", "authorized"]);
const LIVE_SUBSCRIPTION = new Set([
  "created",
  "authenticated",
  "active",
  "pending",
  "halted",
]);

function asNotes(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string" && raw.trim()) out[key] = raw.trim();
  }
  return out;
}

function resolveCatalogPlan(
  notes: Record<string, string>,
  input: { userId: string; product: MerchantProduct },
): VerifiedPlanPayment {
  if (notes.kind === "ai_credit_pack") {
    return { ok: false, error: "This payment is not a plan purchase." };
  }
  if (!notes.user_id || notes.user_id !== input.userId) {
    return { ok: false, error: "Payment does not belong to this account." };
  }
  const plan = findCatalogPlan(notes.plan_id);
  if (!plan || plan.id === FREE_PLAN.id || plan.custom) {
    return { ok: false, error: "Payment is not for a valid plan." };
  }
  if (plan.product !== input.product) {
    return { ok: false, error: "Payment does not match this product." };
  }
  if (notes.product && notes.product !== input.product) {
    return { ok: false, error: "Payment does not match this product." };
  }
  return {
    ok: true,
    planId: plan.id,
    product: plan.product,
    subscriptionId: null,
  };
}

/**
 * Confirms a Razorpay order or subscription payment before granting a plan.
 * Plan/product come from Razorpay notes, never from the client catalog id.
 */
export async function verifyPaidPlanPayment(input: {
  userId: string;
  product: MerchantProduct;
  proof: PlanPaymentProof;
}): Promise<VerifiedPlanPayment> {
  const paymentId = input.proof.paymentId?.trim() ?? "";
  const orderId = input.proof.orderId?.trim() ?? "";
  const subscriptionId = input.proof.subscriptionId?.trim() ?? "";
  if (!paymentId || (!orderId && !subscriptionId)) {
    return { ok: false, error: "Payment details are required to activate a plan." };
  }

  const payment = await fetchRazorpayPayment(paymentId);
  if (!PAID_PAYMENT.has(String(payment.status ?? ""))) {
    return { ok: false, error: "Payment has not been captured yet." };
  }

  if (subscriptionId) {
    if (String(payment.subscription_id ?? "") !== subscriptionId) {
      return { ok: false, error: "Payment does not match this subscription." };
    }
    const subscription = await fetchRazorpaySubscription(subscriptionId);
    if (!LIVE_SUBSCRIPTION.has(String(subscription.status ?? ""))) {
      return { ok: false, error: "Subscription is not active." };
    }
    const notes = {
      ...asNotes(subscription.notes),
      ...asNotes(payment.notes),
    };
    const resolved = resolveCatalogPlan(notes, input);
    if (!resolved.ok) return resolved;
    return { ...resolved, subscriptionId };
  }

  if (String(payment.order_id ?? "") !== orderId) {
    return { ok: false, error: "Payment does not match this order." };
  }
  const order = await fetchRazorpayOrder(orderId);
  const notes = {
    ...asNotes(order.notes),
    ...asNotes(payment.notes),
  };
  return resolveCatalogPlan(notes, input);
}
