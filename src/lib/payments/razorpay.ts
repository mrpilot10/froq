import crypto from "node:crypto";
import Razorpay from "razorpay";
import {
  razorpayPlanIdFor,
  subscriptionTotalCount,
} from "@/lib/payments/razorpay-plans";

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    );
  }
  return { keyId, keySecret };
}

export function getRazorpayClient() {
  const { keyId, keySecret } = credentials();
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export function getRazorpayKeyId() {
  return credentials().keyId;
}

/** Convert rupees to paise for the Razorpay Orders API. */
export function toPaise(amountInr: number): number {
  return Math.round(amountInr * 100);
}

function timingSafeEqualHex(expected: string, actual: string): boolean {
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(actual.trim(), "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export interface CreateRazorpayOrderInput {
  /** Our receipt / correlation id (e.g. froq_{userPrefix}_{ts}). Max 40 chars. */
  receipt: string;
  /** Amount in INR (rupees). Converted to paise before the API call. */
  amountInr: number;
  currency?: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  /** Razorpay order id (`order_…`). */
  orderId: string;
  amount: number;
  currency: string;
  receipt: string;
}

export async function createRazorpayOrder(
  input: CreateRazorpayOrderInput,
): Promise<RazorpayOrderResult> {
  const amount = toPaise(input.amountInr);
  if (!Number.isFinite(amount) || amount < 100) {
    throw new Error("Amount must be at least ₹1.00 (100 paise).");
  }

  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.create({
    amount,
    currency: input.currency ?? "INR",
    receipt: input.receipt.slice(0, 40),
    notes: input.notes,
  });

  if (!order?.id) {
    throw new Error("Could not create the payment order.");
  }

  return {
    orderId: order.id,
    amount: Number(order.amount),
    currency: String(order.currency ?? "INR"),
    receipt: String(order.receipt ?? input.receipt),
  };
}

export interface CreateRazorpaySubscriptionInput {
  froqPlanId: string;
  notes?: Record<string, string>;
  /** Unix timestamp; subscription must be authenticated before this. */
  expireBy?: number;
}

export interface RazorpaySubscriptionResult {
  subscriptionId: string;
  planId: string;
  status: string;
  totalCount: number;
}

/** Pull a readable message out of Razorpay SDK / HTTP errors. */
export function razorpayErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : fallback;
  }
  const err = error as {
    message?: string;
    error?: { description?: string; code?: string; reason?: string };
    description?: string;
  };
  const description =
    err.error?.description ||
    err.description ||
    (typeof err.message === "string" && !err.message.startsWith("Error:")
      ? err.message
      : null);
  if (description) {
    const code = err.error?.code;
    return code ? `${description} (${code})` : description;
  }
  return error instanceof Error ? error.message : fallback;
}

export async function createRazorpaySubscription(
  input: CreateRazorpaySubscriptionInput,
): Promise<RazorpaySubscriptionResult> {
  const razorpayPlanId = razorpayPlanIdFor(input.froqPlanId);
  if (!razorpayPlanId) {
    throw new Error(`No Razorpay subscription plan mapped for ${input.froqPlanId}.`);
  }

  const totalCount = subscriptionTotalCount(input.froqPlanId);
  const razorpay = getRazorpayClient();
  let subscription: { id?: string; status?: string };
  try {
    subscription = (await razorpay.subscriptions.create({
      plan_id: razorpayPlanId,
      total_count: totalCount,
      customer_notify: 1,
      quantity: 1,
      notes: input.notes,
      ...(input.expireBy ? { expire_by: input.expireBy } : {}),
    })) as { id?: string; status?: string };
  } catch (error) {
    throw new Error(
      razorpayErrorMessage(
        error,
        `Could not create subscription for plan ${razorpayPlanId}. Check that this plan exists in the same Razorpay mode as your API keys (Test vs Live).`,
      ),
    );
  }

  if (!subscription?.id) {
    throw new Error("Could not create the Razorpay subscription.");
  }

  return {
    subscriptionId: subscription.id,
    planId: razorpayPlanId,
    status: String(subscription.status ?? "created"),
    totalCount,
  };
}

export function verifyRazorpayPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = credentials();
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  return timingSafeEqualHex(expected, input.signature);
}

/**
 * Subscription checkout signature:
 * HMAC-SHA256(razorpay_payment_id + "|" + razorpay_subscription_id, KEY_SECRET)
 */
export function verifyRazorpaySubscriptionSignature(input: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): boolean {
  const { keySecret } = credentials();
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${input.paymentId}|${input.subscriptionId}`)
    .digest("hex");
  return timingSafeEqualHex(expected, input.signature);
}

export async function fetchRazorpayOrder(orderId: string) {
  const razorpay = getRazorpayClient();
  return razorpay.orders.fetch(orderId);
}

export async function fetchRazorpaySubscription(subscriptionId: string) {
  const razorpay = getRazorpayClient();
  return razorpay.subscriptions.fetch(subscriptionId);
}

/**
 * Cancel a Razorpay subscription.
 * @param cancelAtCycleEnd When true, access/charges continue until the current
 *   billing period ends; when false, cancel immediately (used on upgrade).
 */
export async function cancelRazorpaySubscription(
  subscriptionId: string,
  opts?: { cancelAtCycleEnd?: boolean },
): Promise<void> {
  const id = subscriptionId.trim();
  if (!id) return;

  const razorpay = getRazorpayClient();
  try {
    await razorpay.subscriptions.cancel(id, Boolean(opts?.cancelAtCycleEnd));
  } catch (error) {
    const message = razorpayErrorMessage(error, "Could not cancel the subscription.");
    // Already cancelled / completed — treat as success so upgrades aren't blocked.
    if (/not .*active|already|cancelled|canceled|completed|expired/i.test(message)) {
      return;
    }
    throw new Error(message);
  }
}
