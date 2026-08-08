/**
 * Browser helper for Razorpay Standard Checkout (orders + subscriptions).
 * Loads checkout.js once, opens the payment modal, verifies the signature
 * server-side, and surfaces cancel / failure as typed errors.
 */

import { isRazorpaySubscriptionPlan } from "@/lib/payments/razorpay-plans";

export class RazorpayCheckoutCancelledError extends Error {
  constructor(message = "Payment was cancelled.") {
    super(message);
    this.name = "RazorpayCheckoutCancelledError";
  }
}

export class RazorpayCheckoutFailedError extends Error {
  constructor(message = "Payment failed. Please try again.") {
    super(message);
    this.name = "RazorpayCheckoutFailedError";
  }
}

export interface RazorpayCheckoutOrder {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  planName?: string;
  product?: string;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
}

export interface RazorpayCheckoutSubscription {
  keyId: string;
  subscriptionId: string;
  planName?: string;
  product?: string;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
}

export interface RazorpayPaymentSuccess {
  razorpay_order_id?: string;
  razorpay_subscription_id?: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => {
  open: () => void;
  on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay can only run in the browser."));
  }
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Could not load Razorpay Checkout.")),
        { once: true },
      );
      if (window.Razorpay) resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load Razorpay Checkout."));
    };
    document.body.appendChild(script);
  });

  return scriptPromise;
}

function openCheckout(options: Record<string, unknown>): Promise<RazorpayPaymentSuccess> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    if (!window.Razorpay) {
      reject(new Error("Razorpay Checkout failed to initialize."));
      return;
    }

    const rzp = new window.Razorpay({
      ...options,
      handler: (response: RazorpayPaymentSuccess) => {
        finish(() => resolve(response));
      },
      modal: {
        ondismiss: () => {
          finish(() => reject(new RazorpayCheckoutCancelledError()));
        },
      },
    });

    rzp.on("payment.failed", (response) => {
      const description = response?.error?.description;
      finish(() =>
        reject(
          new RazorpayCheckoutFailedError(
            description || "Payment failed. Please try again.",
          ),
        ),
      );
    });

    rzp.open();
  });
}

/**
 * Opens the Razorpay modal for a one-time order.
 */
export async function openRazorpayCheckout(
  order: RazorpayCheckoutOrder,
): Promise<RazorpayPaymentSuccess> {
  await loadRazorpayScript();
  const key =
    order.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || "";
  if (!key) {
    throw new Error("Razorpay key is not configured.");
  }

  return openCheckout({
    key,
    amount: order.amount,
    currency: order.currency || "INR",
    order_id: order.orderId,
    name: "Froq",
    description: order.planName
      ? /credit/i.test(order.planName)
        ? order.planName
        : `${order.planName} plan`
      : "Froq subscription",
    prefill: {
      name: order.customer?.name,
      email: order.customer?.email,
      contact: order.customer?.contact,
    },
    theme: { color: "#00c853" },
  });
}

/**
 * Opens the Razorpay modal for a Subscription (recurring Loyalty plans).
 */
export async function openRazorpaySubscriptionCheckout(
  subscription: RazorpayCheckoutSubscription,
): Promise<RazorpayPaymentSuccess> {
  await loadRazorpayScript();
  const key =
    subscription.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || "";
  if (!key) {
    throw new Error("Razorpay key is not configured.");
  }

  return openCheckout({
    key,
    subscription_id: subscription.subscriptionId,
    name: "Froq",
    description: subscription.planName
      ? `${subscription.planName} · ${
          subscription.product === "menu"
            ? "AI Menu"
            : subscription.product === "queue"
              ? "Queue Management"
              : "Loyalty Stamps"
        }`
      : "Froq subscription",
    prefill: {
      name: subscription.customer?.name,
      email: subscription.customer?.email,
      contact: subscription.customer?.contact,
    },
    theme: { color: "#00c853" },
  });
}

async function payWithSubscription(input: {
  planId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}): Promise<{
  paid: true;
  mode: "subscription";
  subscriptionId: string;
  paymentId: string;
  receipt?: string;
}> {
  const subRes = await fetch("/api/checkout/razorpay/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planId: input.planId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
    }),
  });
  const subData = await subRes.json().catch(() => null);
  if (!subRes.ok || !subData?.subscriptionId) {
    throw new Error(subData?.error ?? "Could not start the subscription.");
  }

  const payment = await openRazorpaySubscriptionCheckout({
    keyId: subData.keyId,
    subscriptionId: subData.subscriptionId,
    planName: subData.planName,
    product: subData.product,
    customer: subData.customer,
  });

  if (!payment.razorpay_subscription_id || !payment.razorpay_payment_id) {
    throw new Error("Incomplete payment response from Razorpay.");
  }

  const verifyRes = await fetch("/api/checkout/razorpay/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "subscription",
      razorpay_subscription_id: payment.razorpay_subscription_id,
      razorpay_payment_id: payment.razorpay_payment_id,
      razorpay_signature: payment.razorpay_signature,
    }),
  });
  const verifyData = await verifyRes.json().catch(() => null);
  if (!verifyRes.ok || !verifyData?.paid) {
    throw new Error(
      verifyData?.error ??
        "We couldn't confirm your payment. If you were charged, contact support.",
    );
  }

  return {
    paid: true,
    mode: "subscription",
    subscriptionId: payment.razorpay_subscription_id,
    paymentId: payment.razorpay_payment_id,
    receipt: verifyData.receipt ?? undefined,
  };
}

async function payWithOrder(input: {
  planId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  fromPlanId?: string;
}): Promise<{
  paid: true;
  mode: "order";
  orderId: string;
  paymentId: string;
  receipt?: string;
}> {
  const orderRes = await fetch("/api/checkout/razorpay/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planId: input.planId,
      fromPlanId: input.fromPlanId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
    }),
  });
  const orderData = await orderRes.json().catch(() => null);
  if (!orderRes.ok || !orderData?.orderId) {
    throw new Error(orderData?.error ?? "Could not start the payment.");
  }

  const payment = await openRazorpayCheckout({
    keyId: orderData.keyId,
    orderId: orderData.orderId,
    amount: orderData.amount,
    currency: orderData.currency,
    planName: orderData.planName,
    product: orderData.product,
    customer: orderData.customer,
  });

  if (!payment.razorpay_order_id || !payment.razorpay_payment_id) {
    throw new Error("Incomplete payment response from Razorpay.");
  }

  const verifyRes = await fetch("/api/checkout/razorpay/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "order",
      razorpay_order_id: payment.razorpay_order_id,
      razorpay_payment_id: payment.razorpay_payment_id,
      razorpay_signature: payment.razorpay_signature,
    }),
  });
  const verifyData = await verifyRes.json().catch(() => null);
  if (!verifyRes.ok || !verifyData?.paid) {
    throw new Error(
      verifyData?.error ??
        "We couldn't confirm your payment. If you were charged, contact support.",
    );
  }

  return {
    paid: true,
    mode: "order",
    orderId: payment.razorpay_order_id,
    paymentId: payment.razorpay_payment_id,
    receipt: verifyData.receipt,
  };
}

/**
 * One-time payment for an AI Credit pack. Verify-only on the server; call
 * `applyPurchasedAiCreditPack` afterward to credit the wallet.
 */
export async function payForAiCreditPack(input: {
  packId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}): Promise<{
  paid: true;
  mode: "order";
  orderId: string;
  paymentId: string;
  packId: string;
  credits: number;
  receipt?: string;
}> {
  const orderRes = await fetch("/api/checkout/razorpay/credits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      packId: input.packId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
    }),
  });
  const orderData = await orderRes.json().catch(() => null);
  if (!orderRes.ok || !orderData?.orderId) {
    throw new Error(orderData?.error ?? "Could not start the payment.");
  }

  const payment = await openRazorpayCheckout({
    keyId: orderData.keyId,
    orderId: orderData.orderId,
    amount: orderData.amount,
    currency: orderData.currency,
    planName: orderData.packLabel ?? "AI Credits",
    product: "menu",
    customer: orderData.customer,
  });

  if (!payment.razorpay_order_id || !payment.razorpay_payment_id) {
    throw new Error("Incomplete payment response from Razorpay.");
  }

  const verifyRes = await fetch("/api/checkout/razorpay/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "order",
      razorpay_order_id: payment.razorpay_order_id,
      razorpay_payment_id: payment.razorpay_payment_id,
      razorpay_signature: payment.razorpay_signature,
    }),
  });
  const verifyData = await verifyRes.json().catch(() => null);
  if (!verifyRes.ok || !verifyData?.paid) {
    throw new Error(
      verifyData?.error ??
        "We couldn't confirm your payment. If you were charged, contact support.",
    );
  }

  return {
    paid: true,
    mode: "order",
    orderId: payment.razorpay_order_id,
    paymentId: payment.razorpay_payment_id,
    packId: orderData.packId,
    credits: Number(orderData.credits) || 0,
    receipt: verifyData.receipt,
  };
}

/**
 * Loyalty plans with a Razorpay Plan mapping use Subscription Checkout (popup).
 * Other products fall back to one-time order Checkout.
 */
export async function payWithRazorpay(input: {
  planId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  fromPlanId?: string;
}): Promise<{
  paid: true;
  mode: "subscription" | "order";
  orderId?: string;
  subscriptionId?: string;
  paymentId: string;
  receipt?: string;
}> {
  if (isRazorpaySubscriptionPlan(input.planId)) {
    return payWithSubscription(input);
  }
  return payWithOrder(input);
}
