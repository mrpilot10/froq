import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  fetchRazorpayOrder,
  fetchRazorpaySubscription,
  verifyRazorpayPaymentSignature,
  verifyRazorpaySubscriptionSignature,
} from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const maxDuration = 30;

const orderBodySchema = z.object({
  mode: z.literal("order").optional(),
  razorpay_order_id: z.string().min(1).max(120),
  razorpay_payment_id: z.string().min(1).max(120),
  razorpay_signature: z.string().min(1).max(256),
});

const subscriptionBodySchema = z.object({
  mode: z.literal("subscription"),
  razorpay_subscription_id: z.string().min(1).max(120),
  razorpay_payment_id: z.string().min(1).max(120),
  razorpay_signature: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid payment fields.", paid: false },
        { status: 400 },
      );
    }

    const expectedPrefix = `froq_${user.id.slice(0, 8)}_`;

    // Subscription Checkout: payment_id | subscription_id
    if (
      "razorpay_subscription_id" in raw ||
      (raw as { mode?: string }).mode === "subscription"
    ) {
      let parsed: z.infer<typeof subscriptionBodySchema>;
      try {
        parsed = subscriptionBodySchema.parse({
          mode: "subscription",
          ...raw,
        });
      } catch {
        return NextResponse.json(
          { error: "Missing or invalid subscription payment fields.", paid: false },
          { status: 400 },
        );
      }

      const valid = verifyRazorpaySubscriptionSignature({
        paymentId: parsed.razorpay_payment_id,
        subscriptionId: parsed.razorpay_subscription_id,
        signature: parsed.razorpay_signature,
      });
      if (!valid) {
        return NextResponse.json(
          { error: "Payment signature mismatch.", paid: false },
          { status: 400 },
        );
      }

      const subscription = await fetchRazorpaySubscription(
        parsed.razorpay_subscription_id,
      );
      const notes = (subscription.notes ?? {}) as Record<string, string>;
      const receipt =
        typeof notes.froq_receipt === "string" ? notes.froq_receipt : "";
      if (notes.user_id && notes.user_id !== user.id) {
        return NextResponse.json(
          { error: "Subscription does not belong to this account.", paid: false },
          { status: 403 },
        );
      }
      if (receipt && !receipt.startsWith(expectedPrefix)) {
        return NextResponse.json(
          { error: "Subscription does not belong to this account.", paid: false },
          { status: 403 },
        );
      }

      return NextResponse.json(
        {
          paid: true,
          mode: "subscription",
          subscriptionId: parsed.razorpay_subscription_id,
          paymentId: parsed.razorpay_payment_id,
          receipt: receipt || null,
          froqPlanId: typeof notes.plan_id === "string" ? notes.plan_id : null,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    // One-time Standard Checkout: order_id | payment_id
    let parsed: z.infer<typeof orderBodySchema>;
    try {
      parsed = orderBodySchema.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Missing or invalid payment fields.", paid: false },
        { status: 400 },
      );
    }

    const valid = verifyRazorpayPaymentSignature({
      orderId: parsed.razorpay_order_id,
      paymentId: parsed.razorpay_payment_id,
      signature: parsed.razorpay_signature,
    });

    if (!valid) {
      return NextResponse.json(
        { error: "Payment signature mismatch.", paid: false },
        { status: 400 },
      );
    }

    const order = await fetchRazorpayOrder(parsed.razorpay_order_id);
    const receipt =
      typeof order.receipt === "string"
        ? order.receipt
        : typeof order.notes?.froq_receipt === "string"
          ? order.notes.froq_receipt
          : "";
    if (!receipt.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: "Order does not belong to this account.", paid: false },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        paid: true,
        mode: "order",
        orderId: parsed.razorpay_order_id,
        paymentId: parsed.razorpay_payment_id,
        receipt,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not verify the payment.";
    return NextResponse.json({ error: message, paid: false }, { status: 500 });
  }
}
